import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStaticAssets } from "../scripts/vercel-build.mjs";

test("Vercel build copies the approved public interface into the configured output", async () => {
  const output = await mkdtemp(join(tmpdir(), "omniseed-os-vercel-build-"));
  try {
    await buildStaticAssets({ output });
    const html = await readFile(join(output, "index.html"), "utf8");
    const app = await readFile(join(output, "app.js"), "utf8");
    assert.match(html, /OmniSeed OS/);
    assert.match(app, /api\/company/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
