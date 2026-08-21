import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agent = resolve(root, "agent");

export async function assembleUnifiedRuntime() {
  await rm(agent, { recursive: true, force: true });
  await cp(resolve(root, "node_modules/@omniseed/lily/agent"), agent, { recursive: true });
  await mkdir(resolve(agent, "channels"), { recursive: true });
  await cp(resolve(root, "runtime-assembly/omniseed-os.ts"), resolve(agent, "channels/omniseed-os.ts"));
  await run(resolve(root, "node_modules/.bin/eve"), ["build"], { cwd: root, env: process.env });
  const bundledSchema = resolve(root, ".output/server/_libs/schema/omniform.schema.json");
  await mkdir(dirname(bundledSchema), { recursive: true });
  await cp(resolve(root, "node_modules/@omniseed/omniform/schema/omniform.schema.json"), bundledSchema);
}

await assembleUnifiedRuntime();
