import test from "node:test";
import assert from "node:assert/strict";
import { DurableHttpStateStore } from "../src/durable-http-store.js";
import { SemanticStewardClient } from "../src/semantic-steward.js";
import { createDeclaredStewardClient, signSessionToken } from "../src/declared-steward.js";
import { createVercelRuntime, restoreVercelApiPath } from "../src/vercel-runtime.js";

const company = `apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: omniseed_ecosystem, name: OmniSeed Ecosystem }
spec:
  governance:
    desiredState: { repository: https://github.com/mikeajijola/omniseed-ecosystem-company.git, branch: main, path: omniform.yaml, changeMode: pull_request }
  stewardship: { capability: stewardship, realisation: lily_stewardship }
  providers: { agents: { provider: vercel }, connectors: { provider: vercel }, workflows: { provider: github } }
  capabilities:
    - { id: stewardship, name: Steward Ecosystem, requires: [{ id: agency, primitiveFamily: agents }], realisations: [lily_stewardship] }
  realisations:
    - { id: lily_stewardship, name: Lily, capability: stewardship, participants: [{ resource: lily, supplies: [agency] }] }
  resources:
    agents:
      - id: lily
        name: Lily
        offers: [agency]
        spec:
          authority: [company.read]
          implementation: { framework: eve }
          runtime:
            expectedEndpoints: { operation: https://lily.example.test/eve/v1/session }
            session: { credentialReference: LILY_SESSION_JWT_SECRET, issuer: omniseed, audience: omniseed-lily }
    workflows:
      - id: company_change_workflow
        name: Company Change Workflow
        offers: [governed_change_process]
        spec: { provider: github, repository: mikeajijola/omniseed-ecosystem-company, baseBranch: main, path: omniform.yaml, branchPrefix: omniseed/, credentialReference: GITHUB_PROVIDER_TOKEN, mergePolicy: { requireApproval: true, requirePassingChecks: true, mergeMethod: squash } }
  operations:
    - { id: inspect_company, capability: stewardship, description: Inspect company, input: {}, output: {}, mutation: false, permissions: [company.read], approval: none, interfaces: [lily, api] }
`;

test("Vercel adapter restores the governed API path after the catch-all rewrite", () => {
  assert.equal(restoreVercelApiPath({ url: "/api?path=company", query: { path: "company" } }), "/api/company");
  assert.equal(restoreVercelApiPath({ url: "/api?path=operations%2Finspect_company", query: { path: ["operations", "inspect_company"] } }), "/api/operations/inspect_company");
});

test("durable store scopes requests and enforces returned version", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (!init.method) return new Response(null, { status: 404 });
    const body = JSON.parse(init.body);
    return Response.json({ ...body, version: 1 });
  };
  const store = new DurableHttpStateStore({ endpoint: "https://state.example.test/", token: "server-secret", fetchImpl });
  const empty = await store.load("omniseed_ecosystem");
  assert.equal(empty.companyId, "omniseed_ecosystem");
  const saved = await store.save(empty, 0);
  assert.equal(saved.version, 1);
  assert.equal(calls[1].init.headers["if-match"], "0");
  assert.equal(JSON.stringify(calls).includes("server-secret"), true);
});

test("durable store rejects cross-company state", async () => {
  const store = new DurableHttpStateStore({ endpoint: "https://state.example.test", token: "secret", fetchImpl: async () => Response.json({ companyId: "acme", version: 0 }) });
  await assert.rejects(store.load("omniseed_ecosystem"), /company boundary/);
});

test("semantic steward executes requested tools through OmniSeed operation boundary", async () => {
  let rounds = 0;
  const runtime = { respond: async ({ bootstrap, transcript }) => {
    assert.deepEqual(bootstrap, { companyId: "omniseed_ecosystem", actorId: "lily" });
    if (rounds++ === 0) return { toolCall: { operationId: "inspect_company", input: {} } };
    assert.equal(transcript[0].output.company.id, "omniseed_ecosystem");
    return { message: "I resolved the company through OmniSeed.", operationId: "inspect_company" };
  } };
  const engine = { invokeOperation: async (_declaration, operation, _input, authorization) => ({ company: { id: "omniseed_ecosystem" }, operation, actorId: authorization.actorId }) };
  const client = new SemanticStewardClient({ runtime });
  const result = await client.handle({ message: "Which company?", engine, declaration: { metadata: { id: "omniseed_ecosystem" } }, authorization: { actorId: "lily", permissions: ["company.read"] } });
  assert.equal(result.message, "I resolved the company through OmniSeed.");
});

test("Vercel runtime requires immutable desired revision and durable server settings", async () => {
  await assert.rejects(createVercelRuntime({ env: {}, fetchImpl: async () => new Response(company) }), /Missing server runtime configuration/);
  const env = runtimeEnv();
  env.OMNISEED_COMPANY_DEFINITION_URL = "https://raw.githubusercontent.com/example/company/main/omniform.yaml";
  await assert.rejects(createVercelRuntime({ env, fetchImpl: async () => new Response(company) }), /pinned/);
});

test("production runtime fails closed when declared GitHub Provider credentials are unavailable", async () => {
  const env = runtimeEnv();
  delete env.GITHUB_PROVIDER_TOKEN;
  await assert.rejects(createVercelRuntime({ env, fetchImpl: async url => {
    if (url === env.OMNISEED_COMPANY_DEFINITION_URL) return new Response(company);
    throw new Error(`Unexpected URL ${url}`);
  } }), /credential is unavailable/);
});

test("Vercel runtime binds canonical metadata, declared Lily, and durable state", async () => {
  const env = runtimeEnv();
  env.OMNISEED_PUBLIC_STEWARD_CHAT = "true";
  const fetchImpl = async (url, init = {}) => {
    if (url === env.OMNISEED_COMPANY_DEFINITION_URL) return new Response(company);
    if (String(url).includes("/state")) return new Response(null, { status: 404 });
    throw new Error(`Unexpected URL ${url} ${init.method ?? "GET"}`);
  };
  const runtime = await createVercelRuntime({ env, fetchImpl, githubProvider: fakeGitHubProvider() });
  assert.equal(runtime.declaration.metadata.id, "omniseed_ecosystem");
  assert.equal(runtime.engine.binding.desiredRevision, "a".repeat(40));
  assert.equal(runtime.engine.binding.deployment.provider, "vercel");
  assert.ok(runtime.engine.companyRepository instanceof Object);
  assert.equal(runtime.engine.providers.require("github").metadata.id, "github");
  assert.equal(runtime.allowAnonymousStewardChat, true);
});

test("declared steward adapter signs a scoped short-lived token and consumes Eve session output", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/eve/v1/session")) return Response.json({ ok: true, sessionId: "ses_1" });
    return new Response([
      JSON.stringify({ type: "message.appended", meta: { turnId: "turn_1" }, data: { messageDelta: "OmniSeed " } }),
      JSON.stringify({ type: "message.appended", meta: { turnId: "turn_1" }, data: { messageDelta: "Ecosystem" } }),
      JSON.stringify({ type: "message.completed", meta: { turnId: "turn_1" }, data: { message: "OmniSeed Ecosystem" } }),
      JSON.stringify({ type: "session.waiting", data: { continuationToken: "not-returned" } })
    ].join("\n"), { headers: { "content-type": "application/x-ndjson" } });
  };
  const declaration = (await createVercelRuntime({ env: runtimeEnv(), fetchImpl: async url => {
    if (String(url).includes("raw.githubusercontent.com")) return new Response(company);
    if (String(url).includes("state.example.test")) return new Response(null, { status: 404 });
    throw new Error(`Unexpected URL ${url}`);
  }, githubProvider: fakeGitHubProvider(), steward: { handle: async () => ({}) } })).declaration;
  const client = createDeclaredStewardClient({ declaration, actorId: "lily", env: runtimeEnv(), fetchImpl, now: () => 1_700_000_000_000, nonce: () => "nonce" });
  const answer = await client.handle({ message: "What company?" });
  assert.equal(answer.message, "OmniSeed Ecosystem");
  assert.deepEqual(answer.runtime, { framework: "eve", sessionId: "ses_1", turnId: "turn_1" });
  const token = calls[0].init.headers.authorization.slice(7);
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  assert.deepEqual({ iss: payload.iss, aud: payload.aud, sub: payload.sub, company_ref: payload.company_ref, exp: payload.exp - payload.iat }, { iss: "omniseed", aud: "omniseed-lily", sub: "omniseed-os:omniseed_ecosystem", company_ref: "omniseed_ecosystem", exp: 300 });
  assert.equal(calls[1].init.headers.authorization, calls[0].init.headers.authorization);
  assert.doesNotMatch(JSON.stringify(answer), /session-secret|continuationToken/);
});

test("declared steward runtime fails closed for missing config, insecure endpoints, and weak secrets", () => {
  const parsed = { metadata: { id: "company" }, spec: { resources: { agents: [{ id: "lily", spec: { implementation: { framework: "eve" }, runtime: { expectedEndpoints: { operation: "http://remote.test/eve/v1/session" }, session: { credentialReference: "SESSION_SECRET" } } } }] } } };
  assert.throws(() => createDeclaredStewardClient({ declaration: parsed, actorId: "lily", env: { SESSION_SECRET: "x".repeat(32) } }), /HTTPS/);
  parsed.spec.resources.agents[0].spec.runtime.expectedEndpoints.operation = "https://remote.test/eve/v1/session";
  assert.throws(() => createDeclaredStewardClient({ declaration: parsed, actorId: "lily", env: {} }), /credential is unavailable/);
  assert.throws(() => signSessionToken({ secret: "weak", issuer: "i", audience: "a", subject: "s", companyId: "c" }), /at least 32/);
});

test("read-only inspection mode projects pinned Git desired state without fabricating durable observations", async () => {
  const env = runtimeEnv();
  env.OMNISEED_READ_ONLY_INSPECTION = "true";
  delete env.OMNISEED_STATE_ENDPOINT;
  delete env.OMNISEED_STATE_TOKEN;
  delete env.OMNISEED_OPERATOR_TOKEN;
  delete env.OMNISEED_OPERATION_TOKEN;
  const runtime = await createVercelRuntime({ env, fetchImpl: async url => {
    assert.equal(url, env.OMNISEED_COMPANY_DEFINITION_URL);
    return new Response(company);
  } });
  const projection = await runtime.engine.inspect(runtime.declaration);
  assert.equal(runtime.inspectionMode, true);
  assert.equal(projection.instance.environment, "production-read-only-inspection");
  assert.equal(projection.instance.desiredRevision, "a".repeat(40));
  assert.equal(projection.observations.length, 0);
  assert.ok(projection.providerGaps.length > 0);
});

function runtimeEnv() {
  const revision = "a".repeat(40);
  return {
    OMNISEED_COMPANY_DEFINITION_URL: `https://raw.githubusercontent.com/mikeajijola/omniseed-ecosystem-company/${revision}/omniform.yaml`,
    OMNISEED_DESIRED_REVISION: revision,
    OMNISEED_STATE_ENDPOINT: "https://state.example.test",
    OMNISEED_STATE_TOKEN: "durable-state-secret",
    OMNISEED_OPERATOR_TOKEN: "operator-token-at-least-thirty-two-characters",
    OMNISEED_OPERATION_TOKEN: "operation-token-at-least-thirty-two-characters",
    OMNISEED_STEWARD_ACTOR_ID: "lily",
    OMNISEED_ENVIRONMENT: "production",
    VERCEL_DEPLOYMENT_ID: "dpl_test",
    LILY_SESSION_JWT_SECRET: "session-secret-at-least-thirty-two-characters",
    GITHUB_PROVIDER_TOKEN: "github-provider-token-at-least-thirty-two"
  };
}

function fakeGitHubProvider() {
  return {
    metadata: { id: "github", families: ["workflows", "connectors", "identity"], offerings: [], operations: ["company.repository.inspect", "company.change.merge"] },
    status: { implementation_available: true, configured: true, connected: true, healthy: true },
    async validate() { return { valid: true, issues: [] }; },
    async plan(action) { return { deterministic: true, actionId: action.id }; },
    async apply() { return { providerResourceId: "github://test", status: "proposed" }; },
    async observe() { return { status: "open", checkedAt: new Date().toISOString(), evidence: [] }; },
    async invoke(operation) {
      if (operation === "company.repository.inspect") return { baseSha: "a".repeat(40), document: { path: "omniform.yaml", content: company } };
      throw new Error(`Unexpected operation ${operation}`);
    }
  };
}
