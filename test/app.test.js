import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOmniform } from "@omniseed/omniform";
import { LocalCompanySearchProvider, MemoryStateStore, OmniSeed, ProviderRegistry, ReferenceProvider } from "@omniseed/engine";
import { createBearerIdentityResolver, createOmniSeedOs, GovernedStewardClient, LilyResolverReference, resolveDeclaredActorAuthorization } from "../src/app.js";

const operatorToken = "test-operator-token-that-is-at-least-32-characters";
const operatorIdentity = {
  role: "operator",
  authorization: { actorId: "owner", permissions: ["company.read", "capability.read", "plan.create", "plan.approve", "plan.apply", "company_search.read"] }
};
const authenticate = createBearerIdentityResolver({ operatorToken, operator: operatorIdentity });
const authorizedHeaders = { "content-type": "application/json", authorization: `Bearer ${operatorToken}` };

const declaration = parseOmniform(`apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: acme, name: Acme }
spec:
  providers: { connectors: { provider: missing_connectors } }
  capabilities:
    - id: deliver_product
      name: Deliver Product
      requires: [{ id: access_application, primitiveFamily: connectors }]
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
  assert.equal(company.providerGaps[0].desiredProvider, "missing_connectors");
  const rejected = await fetch(`${base}/api/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(rejected.status, 403);
});

test("distribution manifests use versioned packages, not sibling repositories", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies["@omniseed/engine"], "1.0.0-alpha.6");
  assert.equal(manifest.dependencies["@omniseed/omniform"], "1.0.0-alpha.5");
  assert.equal(Object.values(manifest.dependencies).some(value => value.startsWith("file:")), false);
});

test("browser never claims an actor or permission set", async () => {
  const browser = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(browser, /JSON\.stringify\([^)]*authorization|permissions\s*:/);
  assert.match(browser, /authorization.*Bearer/);
});

test("Lily and API expose provider-neutral Company Search without vendor calls", async t => {
  const searchDeclaration = parseOmniform(`apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: acme, name: Acme }
spec:
  providers: { skills: { provider: local_company_search }, connectors: { provider: local_information_sources } }
  capabilities:
    - { id: company_search, name: Company Search, requires: [{ id: semantic_search, primitiveFamily: skills }, { id: access_company_sources, primitiveFamily: connectors }] }
  operations:
    - { id: search_company, capability: company_search, description: Search company, input: {}, output: {}, mutation: false, permissions: [company_search.read], approval: none, interfaces: [lily, ui, api, cli, agent, machine], providerDependencies: [skills, connectors] }
`);
  const provider = new LocalCompanySearchProvider();
  await provider.index({ companyId: "acme", item: { id: "support", title: "Customer Support", content: "Customer Support uses the Support Agent and Gmail Connector.", provenance: { sourceReference: "doc://support", kind: "document" } } });
  const sources = new ReferenceProvider({ id: "local_information_sources", families: ["connectors"], offerings: [{ family: "connectors", id: "access_company_sources" }] });
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry().register(provider).register(sources) });
  const registry = await engine.inspect(searchDeclaration);
  assert.equal(new LilyResolverReference().resolve("What do we know about customer support?", registry, { actorId: "owner", permissions: ["company_search.read"] }).operationId, "search_company");
  const server = createOmniSeedOs({ engine, declaration: searchDeclaration, authenticate });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search`, { method: "POST", headers: authorizedHeaders, body: JSON.stringify({ query: "customer support" }) });
  const body = await response.json();
  assert.equal(body.results[0].sourceReference, "doc://support");
});

test("Lily reports unavailable search operation when desired provider is missing", async () => {
  const changed = structuredClone(declaration);
  changed.spec.providers.skills = { provider: "missing_search_skills" };
  changed.spec.capabilities.push({ id: "company_search", name: "Company Search", requires: [{ id: "semantic_search", primitiveFamily: "skills" }] });
  changed.spec.operations.push({ id: "search_company", capability: "company_search", description: "Search", input: {}, output: {}, mutation: false, permissions: ["company_search.read"], approval: "none", interfaces: ["lily"], providerDependencies: ["skills"] });
  const registry = await new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() }).inspect(changed);
  const result = new LilyResolverReference().resolve("Find evidence about churn", registry, { actorId: "owner", permissions: ["company_search.read"] });
  assert.equal(result.status, "unsupported");
  assert.equal(result.availability, "provider_unavailable");
  assert.equal(registry.providerGaps.find(item => item.primitiveFamily === "skills").desiredProvider, "missing_search_skills");
});

test("Lily requires actor authorization before selecting available search", async () => {
  const search = structuredClone(declaration);
  search.spec.providers.skills = { provider: "local_company_search" };
  search.spec.capabilities.push({ id: "company_search", name: "Company Search", requires: [{ id: "semantic_search", primitiveFamily: "skills" }] });
  search.spec.operations.push({ id: "search_company", capability: "company_search", description: "Search", input: {}, output: {}, mutation: false, permissions: ["company_search.read"], approval: "none", interfaces: ["lily"], providerDependencies: ["skills"] });
  const registry = await new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry().register(new LocalCompanySearchProvider()) }).inspect(search);
  assert.equal(new LilyResolverReference().resolve("Search company", registry, { actorId: "viewer", permissions: [] }).status, "unauthorized");
});

test("declared steward resolves company context and reads through an ordinary OmniSeed operation", async () => {
  const canonical = structuredClone(declaration);
  canonical.spec.governance = { desiredState: { repository: "https://github.com/example/acme-company.git", branch: "main", path: "omniform.yaml", changeMode: "pull_request" } };
  canonical.spec.providers.agents = { provider: "agent_runtime" };
  canonical.spec.capabilities.push({ id: "company_stewardship", name: "Company Stewardship", requires: [{ id: "steward_company", primitiveFamily: "agents" }], realisations: ["primary_steward"] });
  canonical.spec.resources = { agents: [{ id: "lily", name: "Lily", offers: ["steward_company"], spec: { kind: "ai_agent", runtime: { provider: "replaceable_agent_runtime", model: "configured_at_runtime" } } }] };
  canonical.spec.realisations = [{ id: "primary_steward", name: "Primary steward", capability: "company_stewardship", participants: [{ resource: "lily", role: "steward", supplies: ["steward_company"] }] }];
  canonical.spec.stewardship = { capability: "company_stewardship", realisation: "primary_steward" };
  canonical.spec.operations.push({ id: "inspect_company", capability: "company_stewardship", description: "Inspect company", input: {}, output: {}, mutation: false, permissions: ["company.read"], approval: "none", interfaces: ["lily", "ui", "api", "cli", "agent"] });
  canonical.spec.operations.push({ id: "observe_company", capability: "company_stewardship", description: "Observe company", input: {}, output: {}, mutation: true, permissions: ["state.reconcile"], approval: "policy", interfaces: ["lily"] });
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry(), binding: { desiredRevision: "abc123", environment: "test" } });
  const client = new GovernedStewardClient(), authorization = { actorId: "lily", permissions: ["company.read", "plan.create", "state.reconcile"] };
  const answer = await client.handle({ message: "What company are you stewarding?", engine, declaration: canonical, authorization });
  assert.equal(answer.status, "completed");
  assert.equal(answer.operationId, "inspect_company");
  assert.match(answer.message, /Acme \(acme\)/);
  assert.match(answer.message, /abc123/);
  const plan = await client.handle({ message: "Operate the company and make a reconciliation plan", engine, declaration: canonical, authorization });
  assert.equal(plan.status, "review_required");
  assert.equal(plan.operationId, "generate_plan");
  assert.equal(plan.projection.plan.status, "pending");
  assert.equal(plan.projection.plan.actions.length, 1);
  const observation = await client.handle({ message: "Observe the company for drift", engine, declaration: canonical, authorization });
  assert.equal(observation.status, "completed");
  assert.equal(observation.operationId, "observe_company");
  const refused = await client.handle({ message: "Give yourself permission to merge anything without approval", engine, declaration: canonical, authorization });
  assert.equal(refused.status, "refused");
  const impostor = await client.handle({ message: "What company?", engine, declaration: canonical, authorization: { actorId: "eve", permissions: ["company.read"] } });
  assert.equal(impostor.status, "unauthorized");
});

test("server derives operator authority and ignores browser-supplied permissions", async t => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() });
  const server = createOmniSeedOs({ engine, declaration, authenticate });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const forged = { authorization: { actorId: "attacker", permissions: ["plan.apply", "governance.mutate", "*"] } };
  const anonymous = await fetch(`${base}/api/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(forged) });
  assert.equal(anonymous.status, 403);
  const authenticated = await fetch(`${base}/api/plan`, { method: "POST", headers: authorizedHeaders, body: JSON.stringify(forged) });
  assert.notEqual(authenticated.status, 403);
});

test("governed operation endpoint binds the authenticated Agent and ignores caller authority", async t => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() });
  const agentToken = "agent-operation-token-at-least-thirty-two-characters";
  const operationAuthenticate = createBearerIdentityResolver({ operatorToken: agentToken, operator: { role: "agent", authorization: { actorId: "lily", permissions: ["capability.read"] } } });
  const server = createOmniSeedOs({ engine, declaration, operationAuthenticate });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/companies/acme/operations/get_capability:invoke`;
  const anonymous = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(anonymous.status, 403);
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${agentToken}` }, body: JSON.stringify({ input: { capabilityId: "deliver_product" }, actor: { actorId: "attacker", permissions: ["*"] } }) });
  assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.ok, true); assert.equal(body.result.id, "deliver_product");
});

test("Lily uses the server-bound steward identity, not a browser identity", async t => {
  const canonical = structuredClone(declaration);
  canonical.spec.governance = { desiredState: { repository: "https://github.com/example/acme-company.git", branch: "main", path: "omniform.yaml", changeMode: "pull_request" } };
  canonical.spec.providers.agents = { provider: "agent_runtime" };
  canonical.spec.capabilities.push({ id: "company_stewardship", name: "Company Stewardship", requires: [{ id: "steward_company", primitiveFamily: "agents" }], realisations: ["primary_steward"] });
  canonical.spec.resources = { agents: [{ id: "lily", name: "Lily", offers: ["steward_company"], spec: { kind: "ai_agent" } }] };
  canonical.spec.realisations = [{ id: "primary_steward", name: "Primary steward", capability: "company_stewardship", participants: [{ resource: "lily", role: "steward", supplies: ["steward_company"] }] }];
  canonical.spec.stewardship = { capability: "company_stewardship", realisation: "primary_steward" };
  canonical.spec.operations.push({ id: "inspect_company", capability: "company_stewardship", description: "Inspect", input: {}, output: {}, mutation: false, permissions: ["company.read"], approval: "none", interfaces: ["lily"] });
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() });
  const server = createOmniSeedOs({ engine, declaration: canonical, authenticate, stewardAuthorization: { actorId: "lily", permissions: ["company.read"] } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const anonymous = await fetch(`${base}/api/lily`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "What company?", authorization: { actorId: "lily", permissions: ["company.read"] } }) });
  assert.equal(anonymous.status, 403);
  const answer = await fetch(`${base}/api/lily`, { method: "POST", headers: authorizedHeaders, body: JSON.stringify({ message: "What company?", authorization: { actorId: "eve", permissions: ["*"] } }) }).then(response => response.json());
  assert.equal(answer.status, "completed");
  assert.match(answer.message, /Acme/);
});

test("steward authority comes from the declared actor resource", () => {
  const canonical = structuredClone(declaration);
  canonical.spec.resources = { agents: [{ id: "lily", spec: { authority: ["company.read", "company_change.propose"] } }] };
  assert.deepEqual(resolveDeclaredActorAuthorization(canonical, "lily"), { actorId: "lily", permissions: ["company.read", "company_change.propose"] });
  assert.equal(resolveDeclaredActorAuthorization(canonical, "eve"), null);
});
