import test from "node:test";
import assert from "node:assert/strict";
import { DurableHttpStateStore } from "../src/durable-http-store.js";
import { SemanticStewardClient } from "../src/semantic-steward.js";
import { createVercelRuntime } from "../src/vercel-runtime.js";

const company = `apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: omniseed_ecosystem, name: OmniSeed Ecosystem }
spec:
  governance:
    desiredState: { repository: https://github.com/mikeajijola/omniseed-ecosystem-company.git, branch: main, path: omniform.yaml, changeMode: pull_request }
  stewardship: { capability: stewardship, realisation: lily_stewardship }
  providers: { agents: { provider: eve }, connectors: { provider: vercel_interface } }
  capabilities:
    - { id: stewardship, name: Steward Ecosystem, requires: [{ id: agency, primitiveFamily: agents }], realisations: [lily_stewardship] }
  realisations:
    - { id: lily_stewardship, name: Lily, capability: stewardship, participants: [{ resource: lily, supplies: [agency] }] }
  resources:
    agents:
      - { id: lily, name: Lily, offers: [agency], spec: { authority: [company.read] } }
  operations:
    - { id: inspect_company, capability: stewardship, description: Inspect company, input: {}, output: {}, mutation: false, permissions: [company.read], approval: none, interfaces: [lily, api] }
`;

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

test("Vercel runtime binds canonical metadata, declared Lily, and durable state", async () => {
  const env = runtimeEnv();
  const fetchImpl = async (url, init = {}) => {
    if (url === env.OMNISEED_COMPANY_DEFINITION_URL) return new Response(company);
    if (String(url).includes("/state")) return new Response(null, { status: 404 });
    throw new Error(`Unexpected URL ${url} ${init.method ?? "GET"}`);
  };
  const runtime = await createVercelRuntime({ env, fetchImpl });
  assert.equal(runtime.declaration.metadata.id, "omniseed_ecosystem");
  assert.equal(runtime.engine.binding.desiredRevision, "a".repeat(40));
  assert.equal(runtime.engine.binding.deployment.provider, "vercel_interface");
});

function runtimeEnv() {
  const revision = "a".repeat(40);
  return {
    OMNISEED_COMPANY_DEFINITION_URL: `https://raw.githubusercontent.com/mikeajijola/omniseed-ecosystem-company/${revision}/omniform.yaml`,
    OMNISEED_DESIRED_REVISION: revision,
    OMNISEED_STATE_ENDPOINT: "https://state.example.test",
    OMNISEED_STATE_TOKEN: "durable-state-secret",
    OMNISEED_OPERATOR_TOKEN: "operator-token-at-least-thirty-two-characters",
    OMNISEED_STEWARD_ACTOR_ID: "lily",
    OMNISEED_ENVIRONMENT: "production",
    VERCEL_DEPLOYMENT_ID: "dpl_test"
  };
}
