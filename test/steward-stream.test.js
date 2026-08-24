import test from "node:test";
import assert from "node:assert/strict";
import { streamStewardResult } from "../src/steward-stream.js";

test("semantic steward response starts immediately and remains valid JSON", async () => {
  let finish;
  const result = new Promise(resolve => { finish = resolve; });
  const response = streamStewardResult(() => result, { intervalMs: 5 });
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), "\n");
  finish({ status: "completed", message: "OmniSeed Ecosystem" });
  let text = "\n";
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    text += new TextDecoder().decode(item.value);
  }
  assert.deepEqual(JSON.parse(text), { status: "completed", message: "OmniSeed Ecosystem" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("semantic steward failures remain safe JSON responses", async () => {
  const response = streamStewardResult(() => { throw Object.assign(new Error("runtime unavailable"), { code: "steward_runtime_unavailable" }); });
  assert.deepEqual(await response.json(), { code: "steward_runtime_unavailable", error: "runtime unavailable" });
});
