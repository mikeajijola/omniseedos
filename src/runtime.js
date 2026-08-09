import { readFile } from "node:fs/promises";

export async function loadRuntimeSnapshot() {
  const path = process.env.OMNISEED_RUNTIME_SNAPSHOT_PATH
    ? new URL(`file://${process.env.OMNISEED_RUNTIME_SNAPSHOT_PATH}`)
    : new URL("../runtime/company-runtime.json", import.meta.url);
  return JSON.parse(await readFile(path, "utf8"));
}
