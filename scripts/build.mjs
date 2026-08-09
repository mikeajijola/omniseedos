import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname), output = resolve(root, "dist");
await mkdir(output, { recursive: true });
await cp(resolve(root, "public"), output, { recursive: true });
const runtimePath = resolve(process.env.OMNISEED_RUNTIME_SNAPSHOT_PATH ?? resolve(root, "runtime/company-runtime.json"));
const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
if (!runtime.company?.id || !runtime.definition?.hash || runtime.runtime?.stateVersion === undefined) throw new Error("Runtime snapshot lacks company/definition/state identity");
await writeFile(resolve(output, "runtime.json"), `${JSON.stringify(runtime, null, 2)}\n`);
console.log(`Built per-company OmniSeed OS for ${runtime.company.name} at state version ${runtime.runtime.stateVersion}`);
