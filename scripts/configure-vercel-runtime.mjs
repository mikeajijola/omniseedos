import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Keep the shared OS/Eve function alive for the complete semantic tool loop. */
export async function configureVercelRuntime(functionsRoot) {
  const configPath = join(functionsRoot, "__server.func", ".vc-config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.maxDuration = "max";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { configPath, maxDuration: config.maxDuration };
}
