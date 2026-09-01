import { createHmac, randomUUID } from "node:crypto";

/**
 * Resolve the selected stewardship actor's semantic runtime from approved
 * company desired state. The browser never chooses a runtime URL or secret.
 */
export function createDeclaredStewardClient({ declaration, actorId, env = process.env, fetchImpl = fetch, now = () => Date.now(), nonce = randomUUID, adapters = {} } = {}) {
  const agent = (declaration?.spec?.resources?.agents ?? []).find(item => item.id === actorId);
  if (!agent) throw new Error("Configured steward is not a declared Agent resource.");
  const protocol = resolveInteractionProtocol(agent);
  const installed = {
    "eve.session.v1": context => createEveAdapter(context),
    ...adapters
  };
  const factory = installed[protocol];
  if (typeof factory !== "function") throw Object.assign(new Error(`No declared steward interaction adapter is installed for protocol: ${protocol}.`), { code: "steward_adapter_unavailable" });
  return factory({ declaration, agent, actorId, protocol, env, fetchImpl, now, nonce });
}

export function resolveInteractionProtocol(agent) {
  const declared = agent?.spec?.runtime?.interaction?.protocol ?? agent?.spec?.runtime?.protocol;
  if (declared) return String(declared).trim().toLowerCase();
  // Deliberate migration for existing declarations. Framework is not the
  // canonical selector for new runtimes.
  if (String(agent?.spec?.implementation?.framework ?? "").toLowerCase() === "eve") return "eve.session.v1";
  return "undeclared";
}

function createEveAdapter({ declaration, agent, env, fetchImpl, now, nonce, protocol }) {
  const session = agent.spec?.runtime?.session ?? {};
  const endpoint = agent.spec?.runtime?.expectedEndpoints?.operation;
  const credentialReference = session.credentialReference;
  if (!endpoint || !credentialReference) throw new Error("The declared Eve runtime requires an operation endpoint and session credential reference.");
  const secret = env[credentialReference];
  if (!secret) throw new Error(`The declared steward credential is unavailable: ${credentialReference}.`);
  return new EveStewardClient({
    endpoint,
    protocol,
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
  constructor({ endpoint, token, fetchImpl = fetch, protocol = "eve.session.v1" }) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") throw new Error("The declared Eve endpoint must use HTTPS outside local development.");
    if (!parsed.pathname.endsWith("/eve/v1/session")) throw new Error("The declared Eve endpoint must identify the canonical session route.");
    this.endpoint = parsed.toString().replace(/\/$/, "");
    this.token = token;
    this.fetch = fetchImpl;
    this.protocol = protocol;
  }

  async start({ message = "" }) {
    if (!String(message).trim()) throw Object.assign(new Error("What would you like the company steward to do?"), { code: "company_work_invalid" });
    const authorization = await this.#authorization();
    const started = await this.fetch(this.endpoint, {
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json", authorization, "content-type": "application/json" },
      body: JSON.stringify({ message: String(message) })
    });
    if (!started.ok) throw runtimeError("start", started.status);
    const accepted = await started.json();
    if (!accepted?.ok || !accepted.sessionId || !accepted.continuationToken) throw new Error("The declared Eve runtime did not return a durable session and continuation token.");
    return { protocol: this.protocol, sessionId: accepted.sessionId, continuationToken: accepted.continuationToken, streamIndex: 0 };
  }

  async continue({ sessionId, continuationToken, message }) {
    if (!sessionId || !continuationToken || !String(message ?? "").trim()) throw Object.assign(new Error("A durable Eve session, continuation token, and message are required."), { code: "company_work_invalid" });
    const response = await this.fetch(`${this.endpoint}/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json", authorization: await this.#authorization(), "content-type": "application/json" },
      body: JSON.stringify({ continuationToken, message: String(message) })
    });
    if (!response.ok) throw runtimeError("continue", response.status);
    const accepted = await response.json();
    if (!accepted?.ok || accepted.sessionId !== sessionId) throw new Error("The declared Eve runtime did not continue the expected session.");
    return { protocol: this.protocol, sessionId, continuationToken: accepted.continuationToken ?? continuationToken };
  }

  async read({ sessionId, streamIndex = 0 }) {
    if (!sessionId || !Number.isSafeInteger(streamIndex) || streamIndex < 0) throw Object.assign(new Error("A durable Eve session and non-negative stream cursor are required."), { code: "company_work_invalid" });
    const stream = await this.fetch(`${this.endpoint}/${encodeURIComponent(sessionId)}/stream?startIndex=${streamIndex}&includeTailIndex=1`, {
      redirect: "error",
      headers: { accept: "application/x-ndjson", authorization: await this.#authorization() }
    });
    if (!stream.ok) throw runtimeError("stream", stream.status);
    const tailIndex = parseTailIndex(stream.headers.get("x-eve-stream-tail-index"));
    if (tailIndex === null) throw new Error("The declared Eve runtime did not report a durable stream tail.");
    const events = await readBoundedNdjson(stream, { startIndex: streamIndex, tailIndex, maxEvents: 20 });
    const continuation = [...events].reverse().find(item => item.type === "session.waiting")?.data?.continuationToken ?? null;
    return { protocol: this.protocol, events, streamIndex: streamIndex + events.length, continuationToken: continuation, tailIndex };
  }

  async cancel({ sessionId, turnId = null }) {
    if (!sessionId) throw Object.assign(new Error("A durable Eve session is required."), { code: "company_work_invalid" });
    const response = await this.fetch(`${this.endpoint}/${encodeURIComponent(sessionId)}/cancel`, {
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json", authorization: await this.#authorization(), "content-type": "application/json" },
      body: turnId ? JSON.stringify({ turnId }) : "{}"
    });
    if (!response.ok) throw runtimeError("cancel", response.status);
    return response.json();
  }

  /** Compatibility helper for non-durable callers. Production OS uses start/read. */
  async handle({ message = "" }) {
    const session = await this.start({ message });
    const batch = await this.read(session);
    const failed = batch.events.find(item => item.type === "session.failed" || item.type === "turn.failed");
    if (failed) throw new Error((failed.data?.error?.message ?? failed.data?.message ?? "The declared Eve runtime failed the turn."));
    const completed = [...batch.events].reverse().find(item => item.type === "message.completed");
    if (!completed?.data?.message) throw new Error("The declared Eve runtime ended without a completed assistant message.");
    const turn = [...batch.events].reverse().find(item => item.meta?.turnId || item.data?.turnId);
    return { status: "completed", operationId: null, message: completed.data.message.trim(), runtime: { product: "eve", protocol: this.protocol, sessionId: session.sessionId, turnId: turn?.meta?.turnId ?? turn?.data?.turnId ?? null } };
  }

  async #authorization() { return `Bearer ${await this.token()}`; }
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
async function readBoundedNdjson(response, { startIndex, tailIndex, maxEvents }) {
  const lastIndex = Math.min(tailIndex, startIndex + maxEvents - 1);
  if (startIndex > lastIndex) {
    await response.body?.cancel().catch(() => {});
    return [];
  }
  if (!response.body) throw new Error("The declared Eve runtime returned no session event stream.");
  const expected = lastIndex - startIndex + 1;
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const events = [];
  let buffer = "";
  try {
    while (events.length < expected) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        events.push(parseNdjsonLine(line));
        if (events.length === expected) break;
      }
      if (done) break;
    }
    if (events.length < expected) throw new Error("The declared Eve runtime stream ended before its reported durable tail.");
    return events;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function parseNdjsonLine(line) {
  const value = line.trim(), payload = value.startsWith("data:") ? value.slice(5).trim() : value;
  try { return JSON.parse(payload); }
  catch { throw new Error("The declared Eve runtime returned an invalid session event."); }
}
function parseTailIndex(value) { return typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : null; }
