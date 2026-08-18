import { createHmac, randomUUID } from "node:crypto";

/**
 * Resolve the selected stewardship actor's semantic runtime from approved
 * company desired state. The browser never chooses a runtime URL or secret.
 */
export function createDeclaredStewardClient({ declaration, actorId, env = process.env, fetchImpl = fetch, now = () => Date.now(), nonce = randomUUID } = {}) {
  const agent = (declaration?.spec?.resources?.agents ?? []).find(item => item.id === actorId);
  if (!agent) throw new Error("Configured steward is not a declared Agent resource.");
  const framework = String(agent.spec?.implementation?.framework ?? "").toLowerCase();
  if (framework !== "eve") throw new Error(`No semantic steward adapter is installed for framework: ${framework || "undeclared"}.`);
  const session = agent.spec?.runtime?.session ?? {};
  const endpoint = agent.spec?.runtime?.expectedEndpoints?.operation;
  const credentialReference = session.credentialReference;
  if (!endpoint || !credentialReference) throw new Error("The declared Eve runtime requires an operation endpoint and session credential reference.");
  const secret = env[credentialReference];
  if (!secret) throw new Error(`The declared steward credential is unavailable: ${credentialReference}.`);
  return new EveStewardClient({
    endpoint,
    fetchImpl,
    token: () => signSessionToken({
      secret,
      issuer: session.issuer ?? "omniseed",
      audience: session.audience ?? "omniseed-lily",
      subject: session.subject ?? `omniseed-os:${declaration.metadata.id}`,
      companyId: declaration.metadata.id,
      now,
      nonce
    })
  });
}

/** Server-side adapter for Eve's stable session and NDJSON stream protocol. */
export class EveStewardClient {
  constructor({ endpoint, token, fetchImpl = fetch }) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") throw new Error("The declared Eve endpoint must use HTTPS outside local development.");
    if (!parsed.pathname.endsWith("/eve/v1/session")) throw new Error("The declared Eve endpoint must identify the canonical session route.");
    this.endpoint = parsed.toString().replace(/\/$/, "");
    this.token = token;
    this.fetch = fetchImpl;
  }

  async handle({ message = "" }) {
    if (!String(message).trim()) return { status: "clarification_required", operationId: null, message: "What would you like the company steward to do?" };
    const authorization = `Bearer ${await this.token()}`;
    const started = await this.fetch(this.endpoint, {
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json", authorization, "content-type": "application/json" },
      body: JSON.stringify({ message: String(message) })
    });
    if (!started.ok) throw runtimeError("start", started.status);
    const accepted = await started.json();
    if (!accepted?.ok || !accepted.sessionId) throw new Error("The declared Eve runtime did not accept a session.");
    const stream = await this.fetch(`${this.endpoint}/${encodeURIComponent(accepted.sessionId)}/stream`, {
      redirect: "error",
      headers: { accept: "application/x-ndjson", authorization }
    });
    if (!stream.ok) throw runtimeError("stream", stream.status);
    const events = parseNdjson(await stream.text());
    const failed = events.find(item => item.type === "session.failed" || item.type === "turn.failed");
    if (failed) throw new Error((failed.data?.error?.message ?? failed.data?.message ?? "The declared Eve runtime failed the turn."));
    const deltas = events.filter(item => item.type === "message.appended").map(item => item.data?.messageDelta ?? "").join("");
    const completed = [...events].reverse().find(item => item.type === "message.completed");
    const messageText = deltas || completed?.data?.message;
    if (!completed || !messageText) throw new Error("The declared Eve runtime ended without a completed assistant message.");
    const turn = [...events].reverse().find(item => item.meta?.turnId || item.turnId);
    return {
      status: "completed",
      operationId: null,
      message: messageText.trim(),
      runtime: { framework: "eve", sessionId: accepted.sessionId, turnId: turn?.meta?.turnId ?? turn?.turnId ?? null }
    };
  }
}

export function signSessionToken({ secret, issuer, audience, subject, companyId, now = () => Date.now(), nonce = randomUUID }) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("The declared steward session secret must contain at least 32 characters.");
  const issuedAt = Math.floor(now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ iss: issuer, aud: audience, sub: subject, company_ref: companyId, iat: issuedAt, exp: issuedAt + 300, jti: nonce() });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function encode(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function runtimeError(stage, status) { return Object.assign(new Error(`The declared Eve runtime ${stage} request failed (${status}).`), { code: "steward_runtime_unavailable" }); }
function parseNdjson(value) {
  return String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
    try { return JSON.parse(payload); }
    catch { throw new Error("The declared Eve runtime returned an invalid session event."); }
  });
}
