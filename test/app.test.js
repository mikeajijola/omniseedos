import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOmniform } from "@omniseed/omniform";
import { MemoryStateStore, OmniSeed, ProviderRegistry } from "@omniseed/engine";
import { createOmniSeedOs, LilyResolverReference } from "../src/app.js";

const declaration = parseOmniform(`apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: acme, name: Acme }
spec:
  providers: { systems: { provider: missing_systems } }
  capabilities:
    - id: deliver_product
      name: Deliver Product
      requires: [{ id: host_app, primitiveFamily: systems }]
  operations:
    - { id: get_capability, capability: deliver_product, description: Get capability, input: {}, output: {}, mutation: false, permissions: [capability.read], approval: none, interfaces: [lily, api] }
    - { id: generate_plan, capability: deliver_product, description: Generate plan, input: {}, output: {}, mutation: false, permissions: [plan.create], approval: none, interfaces: [lily, api] }
    - { id: apply_plan, capability: deliver_product, description: Apply plan, input: {}, output: {}, mutation: true, permissions: [plan.apply], approval: required, interfaces: [api] }
`);

test("Lily reference resolver selects only registered operations", async () => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() }), registry = await engine.inspect(declaration), lily = new LilyResolverReference();
  assert.equal(lily.resolve("What is missing?", registry).operationId, "get_capability");
  assert.equal(lily.resolve("send an email", registry).status, "clarification_required");
  const unavailable = structuredClone(registry); unavailable.operations.find(item => item.id === "get_capability").currentAvailability = "unimplemented";
  assert.equal(lily.resolve("What is missing?", unavailable).status, "unsupported");
});

test("OS projects provider gaps and enforces authorization", async t => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() }), server = createOmniSeedOs({ engine, declaration });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const company = await fetch(`${base}/api/company`).then(response => response.json());
  assert.equal(company.providerGaps[0].desiredProvider, "missing_systems");
  const rejected = await fetch(`${base}/api/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(rejected.status, 403);
});

test("distribution manifests use versioned packages, not sibling repositories", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies["@omniseed/engine"], "1.0.0-alpha.1");
  assert.equal(manifest.dependencies["@omniseed/omniform"], "1.0.0-alpha.1");
  assert.equal(Object.values(manifest.dependencies).some(value => value.startsWith("file:")), false);
});
