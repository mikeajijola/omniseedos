import test from "node:test";
import assert from "node:assert/strict";
import { createBearerIdentityResolver, createOmniSeedOs, projectStewardshipEvidence } from "../src/app.js";

const token = "operator-token-at-least-thirty-two-characters";
const identity = { role: "operator", authorization: { actorId: "owner", permissions: ["stewardship.read", "stewardship.control"] } };
const authenticate = createBearerIdentityResolver({ operatorToken: token, operator: identity });
const declaration = { metadata: { id: "acme" } };

test("safe projection includes controls, limits, work, exact-head evidence and denial reasons without secrets", () => {
  const projected = projectStewardshipEvidence({ stewardship: { autonomy: { declaredMode: "autonomous_safe", state: "enabled", activeFrom: null, expiresAt: "2026-09-02T00:00:00Z", limits: { concurrency: 1 }, usage: { active: 1 } } }, workRuns: [{ id: "w", status: "waiting_for_checks", summary: "Waiting", associations: { proposalIds: ["p"] }, continuationToken: "secret" }], proposals: [{ id: "p", status: "submitted", approval: { actorId: "reviewer", approvedAt: "now", permissions: ["secret"] }, submission: { pullRequest: 7, headSha: "a".repeat(40), credential: "secret" } }], history: [{ type: "stewardship_owner_approval_required", code: "stewardship_owner_approval_required", at: "now" }] });
  assert.equal(projected.proposals[0].submission.headSha, "a".repeat(40));
  assert.doesNotMatch(JSON.stringify(projected), /continuationToken|credential|permissions|secret/);
  assert.equal(projected.decisions[0].code, "stewardship_owner_approval_required");
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
});
