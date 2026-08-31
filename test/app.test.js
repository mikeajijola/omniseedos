import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOmniform } from "@omniseed/omniform";
import { LocalCompanySearchProvider, MemoryStateStore, OmniSeed, ProviderRegistry, ReferenceProvider } from "@omniseed/engine";
import { createBearerIdentityResolver, createOmniSeedOs, GovernedStewardClient, inspectCompany, LilyResolverReference, resolveDeclaredActorAuthorization } from "../src/app.js";
import { withProviderDiagnostics } from "../src/provider-diagnostics.js";

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

test("Provider diagnostics preserve Engine lifecycle truth and affected company work", async () => {
  const diagnosticDeclaration = parseOmniform(`apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: diagnostics, name: Diagnostics }
spec:
  providers:
    connectors: { provider: absent }
    inference: { provider: google }
    agents: { provider: vercel }
    workflows: { provider: github }
  capabilities:
    - id: operate
      name: Operate company
      requires:
        - { id: connect, primitiveFamily: connectors }
        - { id: reason, primitiveFamily: inference }
        - { id: act, primitiveFamily: agents }
        - { id: change, primitiveFamily: workflows }
  operations:
    - { id: inspect_company, capability: operate, description: Inspect, input: {}, output: {}, mutation: false, permissions: [company.read], approval: none, interfaces: [api] }
`);
  const providers = new ProviderRegistry()
    .register(new ReferenceProvider({ id: "google", families: ["inference"], configured: false }))
    .register(new ReferenceProvider({ id: "vercel", families: ["connectors"] }))
    .register(new ReferenceProvider({ id: "github", families: ["workflows"] }));
  providers.require("github").metadata.revision = "safe-revision";
  providers.require("github").metadata.configuration = { token: "must-not-project" };
  const projection = await inspectCompany(new OmniSeed({ store: new MemoryStateStore(), providers }), diagnosticDeclaration);
  const byFamily = Object.fromEntries(projection.providerDiagnostics.map(item => [item.primitiveFamily, item]));
  assert.equal(byFamily.connectors.lifecycleState, "implementation_unavailable");
  assert.deepEqual(byFamily.connectors.availableImplementations, ["vercel"]);
  assert.equal(byFamily.inference.lifecycleState, "configuration_missing");
  assert.equal(byFamily.agents.lifecycleState, "unsupported_primitive_family");
  assert.equal(byFamily.workflows.lifecycleState, "healthy");
  assert.equal(byFamily.workflows.checkedAt, null);
  assert.deepEqual(byFamily.connectors.affectedCapabilities, [{ id: "operate", name: "Operate company" }]);
  assert.doesNotMatch(JSON.stringify(projection.providerDiagnostics), /must-not-project/);
});

test("browser Observe view renders structured Provider diagnostic details", async () => {
  const browser = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(browser, /registry\.providerDiagnostics\.map\(providerCard\)/);
  for (const label of ["Provider ID", "Primitive family", "Selected Provider", "Implementation", "Lifecycle", "Last check", "Failure", "Affected company work", "Next step"]) assert.match(browser, new RegExp(label));
});

test("structured Provider diagnostic fixtures match the API projection contract", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/provider-diagnostics.json", import.meta.url), "utf8"));
  assert.equal(fixture.apiVersion, "omniseed.dev/os-provider-diagnostics/v1alpha1");
  for (const item of fixture.cases) {
    const projected = withProviderDiagnostics({ providers: [item.engineProvider], providerImplementations: item.installedImplementation ? [item.installedImplementation] : [], capabilities: [], realisations: [], resources: [], observations: [] }).providerDiagnostics[0];
    assert.deepEqual({ lifecycleState: projected.lifecycleState, failureCategory: projected.failureCategory, remediationCategory: projected.remediationCategory }, item.expected, item.name);
  }
});

test("OS projects inference independently from the declared steward Agent", async t => {
  const company = parseOmniform(`apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: example, name: Example }
spec:
  providers:
    agents: { provider: company_runtime }
    inference: { provider: google }
  capabilities:
    - id: company_stewardship
      name: Company Stewardship
      requires:
        - { id: stewardship_agency, primitiveFamily: agents }
        - { id: language_reasoning, primitiveFamily: inference }
      realisations: [lily_stewardship]
  realisations:
    - id: lily_stewardship
      name: Lily stewardship
      capability: company_stewardship
      participants:
        - { resource: lily, role: steward, supplies: [stewardship_agency] }
        - { resource: lily_inference, supplies: [language_reasoning] }
  resources:
    agents:
      - { id: lily, name: Lily, offers: [stewardship_agency], spec: { implementation: { framework: LiteLLM } } }
    inference:
      - { id: lily_inference, name: Lily inference, provider: google, offers: [language_reasoning], spec: { product: Gemini API, model: gemini-2.5-flash } }
  operations:
    - { id: inspect_company, capability: company_stewardship, description: Inspect company, input: {}, output: {}, mutation: false, permissions: [company.read], approval: none, interfaces: [agent, api, ui] }
`);
  const providers = new ProviderRegistry()
    .register(new ReferenceProvider({ id: "company_runtime", families: ["agents"] }))
    .register(new ReferenceProvider({ id: "google", families: ["inference"] }));
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers });
  const actor = { actorId: "owner", permissions: ["plan.create", "plan.approve", "plan.apply"] };
  const plan = await engine.plan(company, actor);
  await engine.apply(company, plan, await engine.approve(plan, plan.actions.map(item => item.id), actor), actor);
  const server = createOmniSeedOs({ engine, declaration: company });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const projection = await fetch(`http://127.0.0.1:${server.address().port}/api/company`).then(response => response.json());
  const participants = projection.realisations[0].participants;
  assert.equal(participants.find(item => item.family === "agents").resource, "lily");
  assert.equal(participants.find(item => item.family === "inference").provider, "google");
  assert.equal(participants.find(item => item.family === "inference").observed.status, "healthy");
  assert.equal(participants.find(item => item.family === "inference").evidence[0].source, "google");
});

test("distribution manifests use versioned packages, not sibling repositories", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies["@omniseed/engine"], "1.0.0-alpha.20");
  assert.equal(manifest.dependencies["@omniseed/omniform"], "1.0.0-alpha.6");
  assert.equal(manifest.version, "1.0.0-alpha.39");
  assert.equal(Object.values(manifest.dependencies).some(value => value.startsWith("file:")), false);
});

test("browser never claims an actor or permission set", async () => {
  const browser = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(browser, /JSON\.stringify\([^)]*authorization|permissions\s*:/);
  assert.match(browser, /authorization.*Bearer/);
  assert.doesNotMatch(browser, /dataset\.executionClass/);
  const submitHandler = browser.match(/\$\("#lily-form"\)\.addEventListener\("submit", async event => \{([\s\S]*?)\n\}\);\nfunction invokeSteward/)?.[1];
  assert.ok(submitHandler, "Lily submit handler must remain present");
  assert.match(submitHandler, /if \(response\.status === 202\) \{[\s\S]*?currentWork = result;[\s\S]*?renderWork\(result\);[\s\S]*?scheduleWorkPoll\(100\);/);
  assert.match(submitHandler, /else \{[\s\S]*?currentWork = null;[\s\S]*?result\.message/);
  assert.doesNotMatch(submitHandler, /await load\(\)/);
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

test("operator invokes the same governed operation registry with server-derived authority", async t => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() });
  const server = createOmniSeedOs({ engine, declaration, authenticate });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/api/operations/get_capability:invoke`;
  const forged = JSON.stringify({ input: { capabilityId: "deliver_product" }, authorization: { actorId: "attacker", permissions: ["*"] } });
  const anonymous = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: forged });
  assert.equal(anonymous.status, 403);
  const response = await fetch(endpoint, { method: "POST", headers: authorizedHeaders, body: forged });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true); assert.equal(body.result.id, "deliver_product");
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

test("declared public steward chat needs no browser credential and grants no operator authority", async t => {
  const canonical = structuredClone(declaration);
  canonical.spec.capabilities.push({ id: "company_stewardship", name: "Company Stewardship", requires: [{ id: "steward_company", primitiveFamily: "agents" }], realisations: ["primary_steward"] });
  canonical.spec.resources = { agents: [{ id: "lily", name: "Lily", offers: ["steward_company"], spec: { authority: ["company.read"] } }] };
  canonical.spec.realisations = [{ id: "primary_steward", name: "Primary steward", capability: "company_stewardship", participants: [{ resource: "lily", role: "steward", supplies: ["steward_company"] }] }];
  canonical.spec.stewardship = { capability: "company_stewardship", realisation: "primary_steward" };
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() });
  const steward = { handle: async ({ authorization }) => ({ status: "completed", message: `actor:${authorization.actorId}` }) };
  const server = createOmniSeedOs({ engine, declaration: canonical, authenticate, stewardAuthorization: { actorId: "lily", permissions: ["company.read"] }, steward, allowAnonymousStewardChat: true });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const answer = await fetch(`${base}/api/lily`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "What company?", authorization: { actorId: "attacker", permissions: ["*"] } }) });
  assert.equal(answer.status, 200);
  assert.equal((await answer.json()).message, "actor:lily");
  const plan = await fetch(`${base}/api/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(plan.status, 403);
});

test("durable Lily routes return work immediately and project the same Engine-owned timeline", async t => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() });
  const companyWork = {
    start: async ({ intent, idempotencyKey }) => ({ id: "work_1", intent, idempotencyKey, status: "running", events: [] }),
    inspect: async id => ({ id, status: "completed", events: [{ id: "e1", type: "assistant_message", summary: "Observed company state." }] }),
    continue: async (id, message) => ({ id, status: "running", intent: message }),
    cancel: async id => ({ id, status: "cancelled" }),
  };
  const server = createOmniSeedOs({ engine, declaration, authenticate, stewardAuthorization: { actorId: "lily", permissions: [] }, companyWork });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const started = await fetch(`${base}/api/lily`, { method: "POST", headers: { ...authorizedHeaders, "idempotency-key": "request-1" }, body: JSON.stringify({ message: "Operate company" }) });
  assert.equal(started.status, 202);
  const startedBody = await started.json();
  assert.deepEqual({ id: startedBody.id, intent: startedBody.intent, idempotencyKey: startedBody.idempotencyKey, status: startedBody.status, events: startedBody.events }, { id: "work_1", intent: "Operate company", idempotencyKey: "request-1", status: "running", events: [] });
  assert.equal(startedBody.route.executionClass, "company_work");
  const inspected = await fetch(`${base}/api/lily/work_1`, { headers: { authorization: `Bearer ${operatorToken}` } }).then(response => response.json());
  assert.equal(inspected.events[0].type, "assistant_message");
  assert.equal((await fetch(`${base}/api/lily/work_1/messages`, { method: "POST", headers: authorizedHeaders, body: JSON.stringify({ message: "Continue" }) })).status, 202);
  assert.equal((await fetch(`${base}/api/lily/work_1/cancel`, { method: "POST", headers: authorizedHeaders, body: "{}" })).status, 200);
});

test("production durable Lily work handles conversation, company-query, and company-work turns", async t => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: new ProviderRegistry() });
  const starts = [];
  const companyWork = { start: async input => { starts.push(input); return { id: "work_1", status: "running" }; } };
  const calls = [];
  const steward = { handle: async input => { calls.push(input); return { status: "completed", message: "non-durable answer" }; } };
  const server = createOmniSeedOs({ engine, declaration, authenticate, stewardAuthorization: { actorId: "lily", permissions: ["company.read"] }, companyWork, steward });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const messages = ["hi", "What needs attention?", "generate a plan"];
  for (const message of messages) {
    const response = await fetch(`${base}/api/lily`, { method: "POST", headers: authorizedHeaders, body: JSON.stringify({ message }) });
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.status, "running");
  }
  assert.deepEqual(starts.map(item => item.intent), messages);
  assert.equal(calls.length, 0);
});

test("reference steward greeting validates the declared steward before using its shortcut", async () => {
  const engine = { inspect: async () => ({ stewardship: { realisation: { participants: [{ family: "agents", resource: "lily" }] } } }) };
  const client = new GovernedStewardClient();
  const unauthorized = await client.handle({ message: "hi", engine, declaration, authorization: { actorId: "eve" }, executionClass: "conversation" });
  assert.equal(unauthorized.status, "unauthorized");
  const result = await client.handle({ message: "hi", engine, declaration, authorization: { actorId: "lily" }, executionClass: "conversation" });
  assert.equal(result.message, "Hello. How can I help?");
  assert.equal(result.operationId, null);
});

test("steward authority comes from the declared actor resource", () => {
  const canonical = structuredClone(declaration);
  canonical.spec.resources = { agents: [{ id: "lily", spec: { authority: ["company.read", "company_change.propose"] } }] };
  assert.deepEqual(resolveDeclaredActorAuthorization(canonical, "lily"), { actorId: "lily", permissions: ["company.read", "company_change.propose"] });
  assert.equal(resolveDeclaredActorAuthorization(canonical, "eve"), null);
});
