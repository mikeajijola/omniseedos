import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStaticAssets } from "../scripts/vercel-build.mjs";
import { embedOmniformSchema } from "../scripts/embed-omniform-schema.mjs";
import { routeGovernedDynamicsThroughServer } from "../scripts/fix-vercel-routes.mjs";
import { configureVercelRuntime } from "../scripts/configure-vercel-runtime.mjs";

test("Vercel build copies the approved public interface into the configured output", async () => {
  const output = await mkdtemp(join(tmpdir(), "omniseed-os-vercel-build-"));
  try {
    await buildStaticAssets({ output });
    const html = await readFile(join(output, "index.html"), "utf8");
    const app = await readFile(join(output, "app.js"), "utf8");
    const styles = await readFile(join(output, "styles.css"), "utf8");
    const workStyles = await readFile(join(output, "work.css"), "utf8");
    assert.match(html, /OmniSeed OS/);
    assert.match(app, /api\/company/);
    assert.match(html, /id="steward-response"/);
    assert.match(styles, /#steward-response\{/);
    assert.doesNotMatch(styles, /#lily-response\b/);
    assert.match(html, /id="work-timeline" class="conversation"/);
    assert.match(workStyles, /\.conversation \{ display: flex; flex-direction: column;/);
    assert.match(workStyles, /\.conversation article \{[^}]*padding: 10px 12px;/);
    assert.doesNotMatch(workStyles, /\.conversation article::before|border-left:/);
    assert.doesNotMatch(workStyles, /\.timeline\b/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("production runtime composition pins Lily and emits one Eve-hosted Vercel artifact", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies["@omniseed/lily"], "https://github.com/mikeajijola/omniseed-lily/archive/c1b402c9342c5b33e9c45878219c8df39400913c.tar.gz");
  assert.equal(vercel.outputDirectory, undefined);
  assert.equal(vercel.buildCommand, "npm run build:vercel");
  assert.equal(manifest.scripts["build:vercel"], "node scripts/build-unified-runtime.mjs --vercel");
  assert.equal(manifest.scripts["vercel-build"], "node scripts/build-unified-runtime.mjs --vercel");
  assert.equal(vercel.fluid, true);
  const assembly = await readFile(new URL("../runtime-assembly/omniseed-os.ts", import.meta.url), "utf8");
  assert.match(assembly, /\/api\/company/);
  assert.match(assembly, /\/v1\/companies/);
  assert.match(assembly, /\/api\/operations\/:operation/);
  assert.match(assembly, /POST\("\/api\/lily", dispatch\)/);
  assert.match(assembly, /GET\("\/api\/lily\/:workRunId", dispatch\)/);
  assert.match(assembly, /POST\("\/api\/lily\/:workRunId\/messages", dispatch\)/);
  assert.match(assembly, /POST\("\/api\/lily\/:workRunId\/cancel", dispatch\)/);
  assert.match(assembly, /GET\("\/api\/state\/companies\/:companyId\/work", dispatch\)/);
  assert.match(assembly, /PUT\("\/api\/state\/companies\/:companyId\/work", dispatch\)/);
  assert.doesNotMatch(assembly, /handleSteward|streamStewardResult/);
});

test("Vercel bundle embeds the Omniform schema instead of depending on an omitted runtime file", async () => {
  const output = await mkdtemp(join(tmpdir(), "omniseed-os-schema-bundle-"));
  try {
    const libraries = join(output, "server", "_libs");
    const flowLibraries = join(output, "flow", "_libs");
    const schemaPath = join(output, "omniform.schema.json");
    const bundlePath = join(libraries, "@omniseed", "engine.mjs");
    const flowBundlePath = join(flowLibraries, "@omniseed", "engine.mjs");
    await mkdir(join(libraries, "@omniseed"), { recursive: true });
    await mkdir(join(flowLibraries, "@omniseed"), { recursive: true });
    await writeFile(schemaPath, JSON.stringify({ $id: "omniform:test", type: "object" }));
    await writeFile(bundlePath, 'const schema = JSON.parse(readFileSync(new URL("../schema/omniform.schema.json", import.meta.url), "utf8"));\n');
    await writeFile(flowBundlePath, 'const schema = JSON.parse(readFileSync(new URL("../schema/omniform.schema.json", import.meta.url), "utf8"));\n');

    const result = await embedOmniformSchema({ serverRoot: output, schemaPath });
    const bundle = await readFile(bundlePath, "utf8");
    const flowBundle = await readFile(flowBundlePath, "utf8");
    assert.equal(result.schemaId, "omniform:test");
    assert.equal(result.occurrences, 2);
    assert.equal(result.bundles.length, 2);
    assert.match(bundle, /const schema = \{"\$id":"omniform:test","type":"object"\};/);
    assert.match(flowBundle, /const schema = \{"\$id":"omniform:test","type":"object"\};/);
    assert.doesNotMatch(bundle, /readFileSync|omniform\.schema\.json/);
    assert.doesNotMatch(flowBundle, /readFileSync|omniform\.schema\.json/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("Vercel sends governed dynamic operation and state paths to the real server function", async () => {
  const output = await mkdtemp(join(tmpdir(), "omniseed-os-vercel-routes-"));
  try {
    const configPath = join(output, "config.json");
    const staticRoot = join(output, "static");
    const generatedRootFunction = join(output, "functions", "index.func");
    const lilyFunction = join(output, "functions", "api", "lily", "[workRunId].func");
    const lilyMessagesFunction = join(output, "functions", "api", "lily", "[workRunId]", "messages.func");
    const lilyCancelFunction = join(output, "functions", "api", "lily", "[workRunId]", "cancel.func");
    const stateFunction = join(output, "functions", "api", "state", "companies", "[companyId]", "state.func");
    const workFunction = join(output, "functions", "api", "state", "companies", "[companyId]", "work.func");
    const operationFunction = join(output, "functions", "v1", "companies", "[companyId]", "operations", "[operation].func");
    await mkdir(staticRoot, { recursive: true });
    await mkdir(generatedRootFunction, { recursive: true });
    await mkdir(lilyFunction, { recursive: true });
    await mkdir(lilyMessagesFunction, { recursive: true });
    await mkdir(lilyCancelFunction, { recursive: true });
    await mkdir(stateFunction, { recursive: true });
    await mkdir(workFunction, { recursive: true });
    await mkdir(operationFunction, { recursive: true });
    await writeFile(join(staticRoot, "index.html"), "<!doctype html><title>OmniSeed OS</title>\n");
    await writeFile(join(generatedRootFunction, "index.mjs"), "export default 'generated Eve root';\n");
    await writeFile(join(lilyFunction, "index.mjs"), "export default 'generated duplicate';\n");
    await writeFile(join(lilyMessagesFunction, "index.mjs"), "export default 'generated duplicate';\n");
    await writeFile(join(lilyCancelFunction, "index.mjs"), "export default 'generated duplicate';\n");
    await writeFile(join(stateFunction, "index.mjs"), "export default 'generated duplicate';\n");
    await writeFile(join(workFunction, "index.mjs"), "export default 'generated duplicate';\n");
    await writeFile(join(operationFunction, "index.mjs"), "export default 'generated duplicate';\n");
    await writeFile(configPath, JSON.stringify({ version: 3, routes: [
      { handle: "filesystem" },
      { src: "/api/company", dest: "/api/company" },
      { src: "/api/lily/(?<workRunId>[^/]+)", dest: "/api/lily/[workRunId]" },
      { src: "/api/lily/(?<workRunId>[^/]+)/messages", dest: "/api/lily/[workRunId]/messages" },
      { src: "/api/lily/(?<workRunId>[^/]+)/cancel", dest: "/api/lily/[workRunId]/cancel" },
      { src: "/api/state/companies/(?<companyId>[^/]+)/state", dest: "/api/state/companies/[companyId]/state" },
      { src: "/api/state/companies/(?<companyId>[^/]+)/work", dest: "/api/state/companies/[companyId]/work" },
      { src: "/v1/companies/(?<companyId>[^/]+)/operations/(?<operation>[^/]+)", dest: "/v1/companies/[companyId]/operations/[operation]" },
      { src: "/", dest: "/index" },
      { src: "/(.*)", dest: "/__server" }
    ] }));
    const matched = await routeGovernedDynamicsThroughServer(configPath);
    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(matched.length, 7);
    assert.match(config.routes[0].src, /^\/api\/lily\//);
    assert.equal(config.routes[0].dest, "/__server");
    assert.match(config.routes[1].src, /^\/api\/lily\//);
    assert.equal(config.routes[1].dest, "/__server");
    assert.match(config.routes[2].src, /^\/api\/lily\//);
    assert.equal(config.routes[2].dest, "/__server");
    assert.match(config.routes[3].src, /^\/api\/state\/companies\//);
    assert.equal(config.routes[3].dest, "/__server");
    assert.match(config.routes[4].src, /^\/api\/state\/companies\//);
    assert.equal(config.routes[4].dest, "/__server");
    assert.match(config.routes[5].src, /^\/v1\/companies\//);
    assert.equal(config.routes[5].dest, "/__server");
    assert.match(config.routes[6].src, /^\/api\/operations\//);
    assert.equal(config.routes[6].dest, "/__server");
    assert.equal(config.routes[7].handle, "filesystem");
    assert.equal(config.routes[8].dest, "/api/company");
    assert.equal(config.routes.find(route => route.src === "/"), undefined);
    assert.equal(config.overrides["index.html"].path, "");
    await assert.rejects(access(generatedRootFunction));
    await assert.rejects(access(lilyFunction));
    await assert.rejects(access(lilyMessagesFunction));
    await assert.rejects(access(lilyCancelFunction));
    await assert.rejects(access(stateFunction));
    await assert.rejects(access(workFunction));
    await assert.rejects(access(operationFunction));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("Vercel routing fails closed when the packaged OmniSeed OS interface is absent", async () => {
  const output = await mkdtemp(join(tmpdir(), "omniseed-os-vercel-root-"));
  try {
    const configPath = join(output, "config.json");
    await writeFile(configPath, JSON.stringify({ version: 3, routes: [
      { handle: "filesystem" },
      { src: "/api/state/companies/(?<companyId>[^/]+)/state", dest: "/api/state/companies/[companyId]/state" },
      { src: "/v1/companies/(?<companyId>[^/]+)/operations/(?<operation>[^/]+)", dest: "/v1/companies/[companyId]/operations/[operation]" },
      { src: "/", dest: "/index" }
    ] }));
    await assert.rejects(
      routeGovernedDynamicsThroughServer(configPath),
      /Expected the generated OmniSeed OS interface/
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("Vercel enables Fluid compute and gives the shared OS and Eve function 300 seconds", async () => {
  const output = await mkdtemp(join(tmpdir(), "omniseed-os-vercel-runtime-"));
  try {
    const server = join(output, "__server.func");
    const configPath = join(server, ".vc-config.json");
    await mkdir(server, { recursive: true });
    await writeFile(configPath, JSON.stringify({ handler: "index.mjs", runtime: "nodejs24.x" }));
    const result = await configureVercelRuntime(output);
    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(result.maxDuration, 300);
    assert.equal(config.maxDuration, 300);
    assert.equal(config.runtime, "nodejs24.x");
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
