import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStaticAssets } from "../scripts/vercel-build.mjs";
import { embedOmniformSchema } from "../scripts/embed-omniform-schema.mjs";

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

test("Vercel bundle embeds the Omniform schema instead of depending on an omitted runtime file", async () => {
  const output = await mkdtemp(join(tmpdir(), "omniseed-os-schema-bundle-"));
  try {
    const libraries = join(output, "server", "_libs");
    const schemaPath = join(output, "omniform.schema.json");
    const bundlePath = join(libraries, "@omniseed", "engine.mjs");
    await mkdir(join(libraries, "@omniseed"), { recursive: true });
    await writeFile(schemaPath, JSON.stringify({ $id: "omniform:test", type: "object" }));
    await writeFile(bundlePath, 'const schema = JSON.parse(readFileSync(new URL("../schema/omniform.schema.json", import.meta.url), "utf8"));\n');

    const result = await embedOmniformSchema({ serverRoot: join(output, "server"), schemaPath });
    const bundle = await readFile(bundlePath, "utf8");
    assert.equal(result.schemaId, "omniform:test");
    assert.match(bundle, /const schema = \{"\$id":"omniform:test","type":"object"\};/);
    assert.doesNotMatch(bundle, /readFileSync|omniform\.schema\.json/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
