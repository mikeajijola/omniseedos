import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createBearerIdentityResolver, createOmniSeedOs, projectStewardshipEvidence } from "../src/app.js";

const token = "operator-token-at-least-thirty-two-characters";
const identity = { role: "operator", authorization: { actorId: "owner", permissions: ["stewardship.read", "stewardship.control"] } };
const authenticate = createBearerIdentityResolver({ operatorToken: token, operator: identity });
const declaration = { metadata: { id: "acme" } };

test("safe projection includes controls, limits, work, gates, outcomes, evidence and denial reasons without secrets", () => {
  const projected = projectStewardshipEvidence({ stewardship: { autonomy: { declaredMode: "autonomous_safe", state: "enabled", activeFrom: null, expiresAt: "2026-09-02T00:00:00Z", limits: { concurrency: 1 }, usage: { active: 1 } } }, workRuns: [{ id: "w", status: "waiting_for_checks", summary: "Waiting", associations: { proposalIds: ["p"] }, continuationToken: "secret" }], proposals: [{ id: "p", status: "submitted", approval: { actorId: "reviewer", approvedAt: "now", permissions: ["secret"] }, submission: { pullRequest: 7, headSha: "a".repeat(40), credential: "secret" } }], gates: [{ id: "g", state: "paused", code: "protected_change", reason: "Owner review required", credential: "secret" }], outcomes: [{ id: "o", status: "reconciled", evidenceIds: ["e"], raw: "secret" }], evidence: [{ id: "e", type: "observation", summary: "Healthy", credential: "secret" }], history: [{ type: "protected_change_paused", code: "stewardship_owner_approval_required", reason: "Protected change", at: "now", credential: "secret" }] });
  assert.equal(projected.proposals[0].submission.headSha, "a".repeat(40));
  assert.doesNotMatch(JSON.stringify(projected), /continuationToken|credential|permissions|secret/);
  assert.equal(projected.decisions[0].code, "stewardship_owner_approval_required");
  assert.equal(projected.gates[0].state, "paused");
  assert.equal(projected.outcomes[0].evidenceIds[0], "e");
  assert.equal(projected.evidence[0].summary, "Healthy");
});

test("enable status pause and off are authenticated and browser authority is ignored", async t => {
  const calls = [], profile = state => ({ declaredMode: "autonomous_safe", state });
  const engine = { providers: { list: () => [] }, inspect: async () => ({ providers: [], capabilities: [], realisations: [], resources: [] }), inspectStewardship: async (_d, auth) => (calls.push(["status", auth]), profile("disabled")), enableStewardship: async (_d, input, auth) => (calls.push(["enable", input, auth]), profile("enabled")), setStewardshipState: async (_d, state, auth) => (calls.push([state, auth]), profile(state)) };
  const server = createOmniSeedOs({ engine, declaration, authenticate });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`, headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  assert.equal((await fetch(`${base}/api/stewardship`)).status, 403);
  assert.equal((await fetch(`${base}/api/stewardship`, { headers })).status, 200);
  await fetch(`${base}/api/stewardship/enable`, { method: "POST", headers, body: JSON.stringify({ expiresAt: "2026-09-02T00:00:00Z", permissions: ["*"] }) });
  await fetch(`${base}/api/stewardship/pause`, { method: "POST", headers });
  await fetch(`${base}/api/stewardship/off`, { method: "POST", headers });
  assert.deepEqual(calls.map(item => item[0]), ["status", "enable", "paused", "disabled"]);
  assert.ok(calls.every(item => item.at(-1).actorId === "owner"));
  assert.deepEqual(calls[1][1], { expiresAt: "2026-09-02T00:00:00Z" });
});

test("status preserves the Engine's expired state instead of deriving policy in the adapter", async t => {
  const engine = { inspectStewardship: async () => ({ declaredMode: "autonomous_safe", state: "expired", activeFrom: "2026-09-01T00:00:00Z", expiresAt: "2026-09-02T00:00:00Z" }), inspect: async () => ({}) };
  const server = createOmniSeedOs({ engine, declaration, authenticate });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const body = await fetch("http://127.0.0.1:" + server.address().port + "/api/stewardship", { headers: { authorization: "Bearer " + token } }).then(response => response.json());
  assert.equal(body.state, "expired");
  assert.equal(body.expiresAt, "2026-09-02T00:00:00Z");
});

test("browser exposes authenticated bounded controls and renders governed pauses and evidence", async () => {
  const [html, browser] = await Promise.all([readFile(new URL("../public/index.html", import.meta.url), "utf8"), readFile(new URL("../public/app.js", import.meta.url), "utf8")]);
  for (const id of ["stewardship-expiry", "enable-stewardship", "pause-stewardship", "disable-stewardship", "stewardship-content"]) assert.match(html, new RegExp("id=\\\"" + id + "\\\""));
  for (const field of ["result.decisions", "result.gates", "result.outcomes", "result.evidence"]) assert.ok(browser.includes(field));
  assert.match(browser, /authorization: "Bearer " \+ operatorToken/);
  assert.doesNotMatch(browser, /permissions\s*:/);
});

test("the actual stewardship status route projects registry evidence without internal fields", async t => {
  const engine = {
    inspectStewardship: async () => ({ declaredMode: 'autonomous_safe', state:'enabled', credential:'secret', limits:{concurrency:1,credential:'secret'},usage:{active:1,credential:'secret'} }),
    inspect: async () => ({workRuns:[{id:'w',status:'running',continuationToken:'secret',associations:{proposalIds:['p'],credential:'secret'}}],proposals:[{id:'p',status:'submitted',approval:{actorId:'reviewer',permissions:['secret']},submission:{headSha:'a'.repeat(40),credential:'secret'}}],history:[]}),
  };
  const server = createOmniSeedOs({engine,declaration,authenticate});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/stewardship`,{headers:{authorization:`Bearer ${token}`}});
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.mode,'autonomous_safe'); assert.equal(body.work[0].id,'w'); assert.equal(body.proposals[0].submission.headSha,'a'.repeat(40));
  assert.doesNotMatch(JSON.stringify(body),/credential|continuationToken|permissions|secret/);
});
