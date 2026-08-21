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

test("production runtime composition pins Lily and emits one Eve-hosted Vercel artifact", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies["@omniseed/lily"], "https://github.com/mikeajijola/omniseed-lily/archive/c3bd1d69f3f501e550b7950f0c27eb813ebe762e.tar.gz");
  assert.equal(vercel.outputDirectory, ".output");
  assert.equal(vercel.buildCommand, "npm run build:runtime");
  const assembly = await readFile(new URL("../runtime-assembly/omniseed-os.ts", import.meta.url), "utf8");
  assert.match(assembly, /\/api\/company/);
  assert.match(assembly, /\/v1\/companies/);
});
