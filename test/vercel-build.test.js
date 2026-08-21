import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStaticAssets } from "../scripts/vercel-build.mjs";
import { embedOmniformSchema } from "../scripts/embed-omniform-schema.mjs";
import { routeGovernedDynamicsThroughServer } from "../scripts/fix-vercel-routes.mjs";

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

test("Vercel sends governed dynamic operation and state paths to the real server function", async () => {
  const output = await mkdtemp(join(tmpdir(), "omniseed-os-vercel-routes-"));
  try {
    const configPath = join(output, "config.json");
    const stateFunction = join(output, "functions", "api", "state", "companies", "[companyId]", "state.func");
    const operationFunction = join(output, "functions", "v1", "companies", "[companyId]", "operations", "[operation].func");
    await mkdir(stateFunction, { recursive: true });
    await mkdir(operationFunction, { recursive: true });
    await writeFile(join(stateFunction, "index.mjs"), "export default 'generated duplicate';\n");
    await writeFile(join(operationFunction, "index.mjs"), "export default 'generated duplicate';\n");
    await writeFile(configPath, JSON.stringify({ version: 3, routes: [
      { src: "/api/company", dest: "/api/company" },
      { src: "/api/state/companies/(?<companyId>[^/]+)/state", dest: "/api/state/companies/[companyId]/state" },
      { src: "/v1/companies/(?<companyId>[^/]+)/operations/(?<operation>[^/]+)", dest: "/v1/companies/[companyId]/operations/[operation]" },
      { src: "/(.*)", dest: "/__server" }
    ] }));
    const matched = await routeGovernedDynamicsThroughServer(configPath);
    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(matched.length, 2);
    assert.equal(config.routes[0].dest, "/api/company");
    assert.equal(config.routes[1].dest, "/__server");
    assert.equal(config.routes[2].dest, "/__server");
    await assert.rejects(access(stateFunction));
    await assert.rejects(access(operationFunction));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
