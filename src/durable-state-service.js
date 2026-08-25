import { timingSafeEqual } from "node:crypto";

const route = /^\/api\/state\/companies\/([^/]+)\/(state|work)$/;

export function createDurableStateService({ query, token }) {
  if (typeof query !== "function" || !token) throw new Error("Durable state service requires a database query function and server token.");
  let initialized;
  const initialize = () => initialized ??= query(`CREATE TABLE IF NOT EXISTS omniseed_company_state (
    company_id TEXT PRIMARY KEY,
    version BIGINT NOT NULL,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`, []);

  return async function stateService({ method, url, headers = {}, body }) {
    const match = route.exec(new URL(url, "https://state.invalid").pathname);
    if (!match) return null;
    if (!authorized(headers.authorization, token)) return result(401, { error: "unauthorized" });
    const companyId = decodeURIComponent(match[1]);
    const documentKind = match[2];
    const storageId = documentKind === "state" ? companyId : `${companyId}:company-work`;
    await initialize();
    if (method === "GET") {
      const rows = await query("SELECT payload FROM omniseed_company_state WHERE company_id = $1", [storageId]);
      return rows.length ? result(200, rows[0].payload) : result(404, { error: "not_found" });
    }
    if (method === "PUT") {
      const expected = Number(header(headers, "if-match"));
      if (!Number.isSafeInteger(expected) || expected < 0) return result(400, { error: "invalid_expected_version" });
      const state = typeof body === "string" ? JSON.parse(body) : body;
      if (!state || state.companyId !== companyId) return result(400, { error: "company_mismatch" });
      const next = { ...state, version: expected + 1 };
      const rows = await query(`WITH updated AS (
        UPDATE omniseed_company_state SET version = $3, payload = $4::jsonb, updated_at = NOW()
        WHERE company_id = $1 AND version = $2 RETURNING payload
      ), inserted AS (
        INSERT INTO omniseed_company_state (company_id, version, payload)
        SELECT $1, $3, $4::jsonb WHERE $2 = 0
        ON CONFLICT (company_id) DO NOTHING RETURNING payload
      ) SELECT payload FROM updated UNION ALL SELECT payload FROM inserted`, [storageId, expected, expected + 1, JSON.stringify(next)]);
      return rows.length ? result(200, rows[0].payload) : result(412, { error: "state_conflict" });
    }
    return result(405, { error: "method_not_allowed" });
  };
}

function authorized(value, token) {
  const supplied = typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : "";
  const left = Buffer.from(supplied), right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

function header(headers, name) {
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

function result(status, body) { return { status, body }; }
