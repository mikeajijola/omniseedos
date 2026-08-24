import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { embedOmniformSchema } from "./embed-omniform-schema.mjs";
import { routeGovernedDynamicsThroughServer } from "./fix-vercel-routes.mjs";
import { configureVercelRuntime } from "./configure-vercel-runtime.mjs";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agent = resolve(root, "agent");
const requestedVercelBuild = process.argv.includes("--vercel") || process.env.VERCEL === "1";

export async function assembleUnifiedRuntime({ vercelBuild = requestedVercelBuild } = {}) {
  await rm(agent, { recursive: true, force: true });
  await rm(resolve(root, ".output"), { recursive: true, force: true });
  await rm(resolve(root, ".vercel/output"), { recursive: true, force: true });
  await cp(resolve(root, "node_modules/@omniseed/lily/agent"), agent, { recursive: true });
  await mkdir(resolve(agent, "channels"), { recursive: true });
  await cp(resolve(root, "runtime-assembly/omniseed-os.ts"), resolve(agent, "channels/omniseed-os.ts"));
  const buildEnv = vercelBuild ? { ...process.env, VERCEL: "1" } : process.env;
  await run(resolve(root, "node_modules/.bin/eve"), ["build"], { cwd: root, env: buildEnv });
  await embedOmniformSchema({
    serverRoot: resolve(root, vercelBuild ? ".vercel/output/functions" : ".output/server"),
    schemaPath: resolve(root, "node_modules/@omniseed/omniform/schema/omniform.schema.json")
  });
  if (vercelBuild) {
    await configureVercelRuntime(resolve(root, ".vercel/output/functions"));
    await routeGovernedDynamicsThroughServer(resolve(root, ".vercel/output/config.json"));
  }
}

await assembleUnifiedRuntime();
