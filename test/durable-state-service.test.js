import test from "node:test";
import assert from "node:assert/strict";
import { createDurableStateService } from "../src/durable-state-service.js";

function fixture() {
  const records = new Map();
  const query = async (text, params) => {
    if (text.startsWith("CREATE TABLE")) return [];
    if (text.startsWith("SELECT payload")) return records.has(params[0]) ? [{ payload: structuredClone(records.get(params[0])) }] : [];
    const [companyId, expected, nextVersion, serialized] = params, current = records.get(companyId);
    if ((current && current.version !== expected) || (!current && expected !== 0)) return [];
    const next = JSON.parse(serialized); assert.equal(next.version, nextVersion); records.set(companyId, next); return [{ payload: structuredClone(next) }];
  };
  return { records, service: createDurableStateService({ query, token: "x".repeat(32) }) };
}

const request = (method, body, version = 0, token = "x".repeat(32)) => ({ method, url: "/api/state/companies/omniseed_ecosystem/state", headers: { authorization: `Bearer ${token}`, "if-match": String(version) }, body });

test("durable state service requires authentication and preserves company isolation", async () => {
  const { service } = fixture();
  assert.equal((await service(request("GET", null, 0, "wrong"))).status, 401);
  assert.equal((await service(request("PUT", { companyId: "other", version: 0 }))).status, 400);
  assert.equal((await service(request("GET"))).status, 404);
});

test("durable state service atomically creates, loads, updates and rejects stale writes", async () => {
  const { service } = fixture(), initial = { companyId: "omniseed_ecosystem", version: 0, plans: [], evidence: [], history: [] };
  const created = await service(request("PUT", initial));
  assert.equal(created.status, 200); assert.equal(created.body.version, 1);
  assert.deepEqual((await service(request("GET"))).body, created.body);
  const stale = await service(request("PUT", { ...created.body, history: ["stale"] }, 0));
  assert.equal(stale.status, 412);
  const updated = await service(request("PUT", { ...created.body, history: ["restart-safe"] }, 1));
  assert.equal(updated.status, 200); assert.equal(updated.body.version, 2);
  assert.deepEqual((await service(request("GET"))).body.history, ["restart-safe"]);
});
