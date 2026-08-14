import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOmniform } from "@omniseed/omniform";
import { LocalCompanySearchProvider, MemoryStateStore, OmniSeed, ProviderRegistry } from "@omniseed/engine";
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
  const authorization = { actorId: "owner", permissions: ["capability.read", "plan.create"] };
  assert.equal(lily.resolve("What is missing?", registry, authorization).operationId, "get_capability");
  assert.equal(lily.resolve("send an email", registry, authorization).status, "clarification_required");
  const unavailable = structuredClone(registry); unavailable.operations.find(item => item.id === "get_capability").currentAvailability = "unimplemented";
  assert.equal(lily.resolve("What is missing?", unavailable, authorization).status, "unsupported");
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
  assert.equal(manifest.dependencies["@omniseed/engine"], "1.0.0-alpha.2");
  assert.equal(manifest.dependencies["@omniseed/omniform"], "1.0.0-alpha.2");
  assert.equal(Object.values(manifest.dependencies).some(value => value.startsWith("file:")), false);
});

test("Lily and API expose provider-neutral Company Search without vendor calls", async t => {
  const searchDeclaration = parseOmniform(`apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: acme, name: Acme }
spec:
  providers: { company_search: { provider: local_company_search } }
  capabilities:
    - { id: company_knowledge, name: Company Knowledge, requires: [{ id: search_company_content, primitiveFamily: company_search }] }
  operations:
    - { id: search_company, capability: company_knowledge, description: Search company, input: {}, output: {}, mutation: false, permissions: [company_search.read], approval: none, interfaces: [lily, ui, api, cli, agent, machine], providerDependencies: [company_search] }
`);
  const provider = new LocalCompanySearchProvider();
  await provider.index({ companyId: "acme", item: { id: "support", title: "Customer Support", content: "Customer Support uses the Support Agent and Gmail Connector.", provenance: { sourceReference: "doc://support", kind: "document" } } });
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry().register(provider) });
  const registry = await engine.inspect(searchDeclaration);
  assert.equal(new LilyResolverReference().resolve("What do we know about customer support?", registry, { actorId: "owner", permissions: ["company_search.read"] }).operationId, "search_company");
  const server = createOmniSeedOs({ engine, declaration: searchDeclaration });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "customer support", authorization: { actorId: "owner", permissions: ["company_search.read"] } }) });
  const body = await response.json();
  assert.equal(body.results[0].sourceReference, "doc://support");
});

test("Lily reports unavailable search operation when desired provider is missing", async () => {
  const changed = structuredClone(declaration);
  changed.spec.providers.company_search = { provider: "turbopuffer" };
  changed.spec.operations.push({ id: "search_company", capability: "deliver_product", description: "Search", input: {}, output: {}, mutation: false, permissions: ["company_search.read"], approval: "none", interfaces: ["lily"], providerDependencies: ["company_search"] });
  const registry = await new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() }).inspect(changed);
  const result = new LilyResolverReference().resolve("Find evidence about churn", registry, { actorId: "owner", permissions: ["company_search.read"] });
  assert.equal(result.status, "unsupported");
  assert.equal(result.availability, "provider_unavailable");
  assert.equal(registry.providerGaps.find(item => item.primitiveFamily === "company_search").desiredProvider, "turbopuffer");
});

test("Lily requires actor authorization before selecting available search", async () => {
  const search = structuredClone(declaration);
  search.spec.providers.company_search = { provider: "local_company_search" };
  search.spec.operations.push({ id: "search_company", capability: "deliver_product", description: "Search", input: {}, output: {}, mutation: false, permissions: ["company_search.read"], approval: "none", interfaces: ["lily"], providerDependencies: ["company_search"] });
  const registry = await new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry().register(new LocalCompanySearchProvider()) }).inspect(search);
  assert.equal(new LilyResolverReference().resolve("Search company", registry, { actorId: "viewer", permissions: [] }).status, "unauthorized");
});

test("OS delegates the complete Company Change lifecycle to OmniSeed", async t => {
  const changed = structuredClone(declaration);
  changed.spec.operations.push(
    { id: "propose_company_change", capability: "deliver_product", description: "Propose company change", input: {}, output: {}, mutation: true, permissions: ["company_change.propose"], approval: "none", interfaces: ["lily", "ui", "api", "agent", "machine"] },
    { id: "inspect_company_change", capability: "deliver_product", description: "Inspect company change", input: {}, output: {}, mutation: false, permissions: ["company_change.read"], approval: "none", interfaces: ["lily", "ui", "api", "agent", "machine"] },
    { id: "approve_company_change", capability: "deliver_product", description: "Approve company change", input: {}, output: {}, mutation: true, permissions: ["company_change.approve"], approval: "none", interfaces: ["ui", "api"] },
    { id: "reject_company_change", capability: "deliver_product", description: "Reject company change", input: {}, output: {}, mutation: true, permissions: ["company_change.reject"], approval: "none", interfaces: ["ui", "api"] },
    { id: "apply_company_change", capability: "deliver_product", description: "Apply company change", input: {}, output: {}, mutation: true, permissions: ["company_change.apply"], approval: "required", interfaces: ["ui", "api"] }
  );
  const initial = { version: 0, companyId: "acme", deployed: [], observed: [], evidence: [{ id: "evidence_1", type: "verified_failure" }], history: [], plans: [], companyChanges: [] };
  const engine = new OmniSeed({ store: new MemoryStateStore(initial), providers: new ProviderRegistry() }), server = createOmniSeedOs({ engine, declaration: changed });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`, headers = { "content-type": "application/json" };
  const lily = { actorId: "lily", actorType: "ai", permissions: ["company_change.propose"] }, owner = { actorId: "owner", actorType: "human", permissions: ["company_change.read", "company_change.approve", "company_change.apply"] };
  const input = { reason: "Evidence suggests the desired design needs a separate audit capability.", evidence: ["evidence_1"], patch: [{ op: "add", path: "/spec/capabilities/-", value: { id: "delivery_audit", name: "Delivery Audit", requires: [{ id: "audit_delivery", primitiveFamily: "systems" }] } }] };
  const proposed = await fetch(`${base}/api/lily`, { method: "POST", headers, body: JSON.stringify({ message: "Propose a company design change", input, authorization: lily }) }).then(response => response.json());
  assert.equal(proposed.proposal.proposedBy.actorId, "lily");
  assert.match(proposed.message, /has not changed the company yet/i);
  const preview = await fetch(`${base}/api/company-changes/${proposed.proposal.id}/preview`, { method: "POST", headers, body: JSON.stringify({ authorization: owner }) }).then(response => response.json());
  assert.deepEqual(preview.impact.capabilities.added, ["delivery_audit"]);
  await fetch(`${base}/api/company-changes/${proposed.proposal.id}/approve`, { method: "POST", headers, body: JSON.stringify({ proposalHash: proposed.proposal.hash, authorization: owner }) });
  const applied = await fetch(`${base}/api/company-changes/${proposed.proposal.id}/apply`, { method: "POST", headers, body: JSON.stringify({ authorization: owner }) }).then(response => response.json());
  assert.equal(applied.registry.capabilities.find(item => item.id === "delivery_audit").state, "missing");
  const listed = await fetch(`${base}/api/company-changes`, { headers: { authorization: "unused" } }).then(response => response.json());
  assert.equal(listed[0].status, "applied");
});
