import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

export function createOmniSeedOs({ engine, declaration, steward = new GovernedStewardClient(), companyWork = null, authenticate = anonymousOnly, operationAuthenticate = anonymousOnly, stewardAuthorization = null, allowAnonymousStewardChat = false }) {
  return createServer(createOmniSeedOsHandler({ engine, declaration, steward, companyWork, authenticate, operationAuthenticate, stewardAuthorization, allowAnonymousStewardChat }));
}

/** Request handler shared by the long-lived Node server and serverless adapters. */
export function createOmniSeedOsHandler({ engine, declaration, steward = new GovernedStewardClient(), companyWork = null, authenticate = anonymousOnly, operationAuthenticate = anonymousOnly, stewardAuthorization = null, allowAnonymousStewardChat = false }) {
  return async (request, response) => {
    try {
      if (request.url === "/api/company" && request.method === "GET") return json(response, 200, await engine.inspect(declaration));
      const operationRoute = /^\/v1\/companies\/([^/]+)\/operations\/([^/:]+):invoke$/.exec(request.url);
      if (operationRoute && request.method === "POST") {
        if (decodeURIComponent(operationRoute[1]) !== declaration.metadata.id) return json(response, 404, { ok: false, code: "company_not_found", error: "Company is not served by this runtime." });
        const body = await readJson(request), authorization = await requireIdentity(operationAuthenticate, request, "agent");
        const result = await engine.invokeOperation(declaration, decodeURIComponent(operationRoute[2]), body.input ?? {}, authorization);
        return json(response, 200, { ok: true, result });
      }
      const operatorOperationRoute = /^\/api\/operations\/([^/:]+):invoke$/.exec(request.url);
      if (operatorOperationRoute && request.method === "POST") {
        const body = await readJson(request), authorization = await requireIdentity(authenticate, request, "operator");
        const result = await engine.invokeOperation(declaration, decodeURIComponent(operatorOperationRoute[1]), body.input ?? {}, authorization);
        return json(response, 200, { ok: true, result });
      }
      if (request.url === "/api/plan" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, await engine.plan(declaration, await requireIdentity(authenticate, request, "operator")));
      }
      if (request.url === "/api/approve" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, await engine.approve(body.plan, body.approvedActionIds, await requireIdentity(authenticate, request, "operator")));
      }
      if (request.url === "/api/apply" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, await engine.apply(declaration, body.plan, body.approval, await requireIdentity(authenticate, request, "operator")));
      }
      if (request.url === "/api/lily" && request.method === "POST") {
        const body = await readJson(request);
        if (!allowAnonymousStewardChat) await requireIdentity(authenticate, request, "operator");
        if (!stewardAuthorization) throw authError("The declared steward has no server-side runtime identity.");
        if (companyWork) return json(response, 202, await companyWork.start({ intent: body.message, idempotencyKey: body.idempotencyKey ?? request.headers["idempotency-key"] }));
        return json(response, 200, await steward.handle({ message: body.message, engine, declaration, authorization: stewardAuthorization }));
      }
      const lilyWorkRoute = /^\/api\/lily\/([^/]+)$/.exec(request.url);
      if (lilyWorkRoute && request.method === "GET") {
        if (!allowAnonymousStewardChat) await requireIdentity(authenticate, request, "operator");
        if (!companyWork) return json(response, 404, { code: "company_work_unavailable", error: "Durable company work is not configured." });
        return json(response, 200, await companyWork.inspect(decodeURIComponent(lilyWorkRoute[1])));
      }
      const lilyMessageRoute = /^\/api\/lily\/([^/]+)\/messages$/.exec(request.url);
      if (lilyMessageRoute && request.method === "POST") {
        if (!allowAnonymousStewardChat) await requireIdentity(authenticate, request, "operator");
        if (!companyWork) return json(response, 404, { code: "company_work_unavailable", error: "Durable company work is not configured." });
        const body = await readJson(request);
        return json(response, 202, await companyWork.continue(decodeURIComponent(lilyMessageRoute[1]), body.message));
      }
      const lilyCancelRoute = /^\/api\/lily\/([^/]+)\/cancel$/.exec(request.url);
      if (lilyCancelRoute && request.method === "POST") {
        if (!allowAnonymousStewardChat) await requireIdentity(authenticate, request, "operator");
        if (!companyWork) return json(response, 404, { code: "company_work_unavailable", error: "Durable company work is not configured." });
        return json(response, 200, await companyWork.cancel(decodeURIComponent(lilyCancelRoute[1])));
      }
      if (request.url === "/api/search" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, { results: await engine.invokeOperation(declaration, "search_company", { query: body.query, filters: body.filters }, await requireIdentity(authenticate, request, "operator")) });
      }
      if (request.method !== "GET") return json(response, 404, { error: "Not found" });
      const relative = request.url === "/" ? "index.html" : request.url.slice(1);
      if (relative.includes("..")) return json(response, 400, { error: "Invalid path" });
      const file = await readFile(join(publicDirectory, relative));
      response.writeHead(200, { "content-type": mime[extname(relative)] ?? "application/octet-stream" }); response.end(file);
    } catch (error) {
      if (error.code === "ENOENT") return json(response, 404, { error: "Not found" });
      json(response, error.code === "authorization_denied" ? 403 : error.code === "plan_stale" ? 409 : 400, { code: error.code ?? "error", error: error.message, details: error.details });
    }
  };
}

export function createBearerIdentityResolver({ operatorToken, operator }) {
  const configured = typeof operatorToken === "string" && operatorToken.length >= 32;
  return async request => {
    const value = request.headers.authorization ?? "";
    const supplied = value.startsWith("Bearer ") ? value.slice(7) : "";
    if (!configured || !secureEqual(supplied, operatorToken)) return null;
    return structuredClone(operator);
  };
}

export function resolveDeclaredActorAuthorization(declaration, actorId) {
  const resource = (declaration.spec.resources?.agents ?? []).find(item => item.id === actorId);
  return resource ? { actorId, permissions: [...(resource.spec?.authority ?? [])] } : null;
}

async function requireIdentity(authenticate, request, requiredRole) {
  const identity = await authenticate(request);
  if (!identity || identity.role !== requiredRole || !identity.authorization?.actorId) throw authError("Authentication is required.");
  return identity.authorization;
}

function secureEqual(left, right) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const anonymousOnly = async () => null;
const authError = message => Object.assign(new Error(message), { code: "authorization_denied" });

/** Reference steward client. Reads and proposals use the same declared OmniSeed operation surface as every actor. */
export class GovernedStewardClient {
  async handle({ message = "", engine, declaration, authorization }) {
    const registry = await engine.inspect(declaration);
    const actor = registry.stewardship?.realisation?.participants.find(item => item.family === "agents");
    if (!actor) return { status: "unsupported", message: "This company has no declared Agent participating in its stewardship realisation.", operationId: null };
    if (authorization?.actorId !== actor.resource) return { status: "unauthorized", message: "The requesting identity is not the declared steward actor.", operationId: null };
    const text = message.toLowerCase();
    if (/give yourself|grant yourself|without approval|bypass/.test(text)) return { status: "refused", message: "I cannot grant myself authority or bypass the company’s approval policy.", operationId: null };
    if (/\b(observe|drift|reconcile|check reality)\b/.test(text) && !/\b(operate|plan|set up|realise|realize|fix)\b/.test(text)) {
      const operation = registry.operations.find(item => item.id === "observe_company");
      if (!operation || operation.currentAvailability !== "available") return unavailable("observe_company", operation);
      const projection = await engine.invokeOperation(declaration, "observe_company", {}, authorization);
      return { status: "completed", operationId: "observe_company", message: "I observed deployed resources through their selected Providers and recorded the resulting state and evidence. Desired state was not changed.", projection: { instance: projection.instance, observations: projection.observations, evidence: projection.evidence } };
    }
    if (/\b(operate|plan|set up|realise|realize|fix)\b/.test(text)) {
      const operation = registry.operations.find(item => item.id === "generate_plan");
      if (!operation || operation.currentAvailability !== "available") return unavailable("generate_plan", operation);
      const plan = await engine.invokeOperation(declaration, "generate_plan", {}, authorization);
      return { status: "review_required", operationId: "generate_plan", message: plan.actions.length ? `I prepared ${plan.actions.length} governed action${plan.actions.length === 1 ? "" : "s"}. The exact persisted plan must be reviewed and approved before apply.` : "I generated an empty plan: the current desired resources require no new create actions. Observation may still reveal drift.", projection: { plan } };
    }
    if (/propose|replace|change/.test(text)) {
      const operation = registry.operations.find(item => item.id === "propose_company_change");
      if (!operation || operation.currentAvailability !== "available") return unavailable("propose_company_change", operation);
      return { status: "clarification_required", operationId: "propose_company_change", message: "I can submit a governed company-change proposal, but I need an exact candidate patch, reason, risks, and supporting evidence. I will not mutate desired state directly." };
    }
    const operation = registry.operations.find(item => item.id === "inspect_company");
    if (!operation || operation.currentAvailability !== "available") return unavailable("inspect_company", operation);
    const projection = await engine.invokeOperation(declaration, "inspect_company", {}, authorization);
    if (/what company|which company|stewarding/.test(text)) return { status: "completed", operationId: "inspect_company", message: `I am stewarding ${projection.company.name} (${projection.company.id}), whose approved desired state is ${projection.instance.desiredState?.repository ?? "not Git-bound"} at revision ${projection.instance.desiredRevision ?? "unknown"}.`, projection: { instance: projection.instance } };
    if (/partial|missing|gap|attention/.test(text)) {
      const capabilities = projection.capabilities.filter(item => item.state !== "realised");
      return { status: "completed", operationId: "inspect_company", message: capabilities.length ? `${capabilities.length} capabilities are not realised: ${capabilities.map(item => `${item.name} (${item.state})`).join(", ")}.` : "Every declared capability is realised.", projection: { capabilities } };
    }
    if (/changed|recent|activity|history/.test(text)) return { status: "completed", operationId: "inspect_company", message: projection.history.length ? `The most recent recorded event is ${projection.history.at(-1).type}.` : "OmniSeed has no evidenced runtime history for this company yet.", projection: { history: projection.history } };
    if (/how|realis|provider|evidence/.test(text)) return { status: "completed", operationId: "inspect_company", message: `I found ${projection.realisations.length} declared realisations. The trace includes primitive participants, Provider bindings, observations, and evidence.`, projection: { realisations: projection.realisations } };
    return { status: "completed", operationId: "inspect_company", message: `${projection.company.name} has ${projection.capabilities.length} declared capabilities and ${projection.realisations.length} named realisations.`, projection: { instance: projection.instance, capabilities: projection.capabilities } };
  }
}

function unavailable(operationId, operation) { return { status: "unsupported", operationId, availability: operation?.currentAvailability ?? "undeclared", message: `The governed ${operationId} operation is not currently available.` }; }

/** Deterministic Generation 1 stub. It selects only declared, implemented, available Lily operations. */
export class LilyResolverReference {
  resolve(message = "", registry, authorization) {
    const text = message.toLowerCase();
    const requested = text.includes("plan") || text.includes("set up") ? "generate_plan" : /\b(search|find|where|know|evidence)\b/.test(text) ? "search_company" : text.includes("capability") || text.includes("missing") || text.includes("attention") || text.includes("gap") ? "get_capability" : null;
    if (!requested) return { status: "clarification_required", message: "I can inspect capabilities, search company knowledge, or generate a plan. Which should I do?", operationId: null };
    const operation = registry.operations.find(item => item.id === requested && item.interfaces.includes("lily"));
    if (!operation || operation.currentAvailability !== "available") return { status: "unsupported", message: `The ${requested} operation is not currently available.`, operationId: requested, availability: operation?.currentAvailability ?? "undeclared" };
    const granted = new Set(authorization?.permissions ?? []), missing = operation.permissions.filter(permission => !granted.has(permission));
    if (!authorization?.actorId || missing.length) return { status: "unauthorized", message: `The ${requested} operation is not authorized for this actor.`, operationId: requested, missingPermissions: missing };
    if (requested === "generate_plan") return { status: "resolved", operationId: requested, message: "I can request a deterministic plan. It must be reviewed and approved before apply.", projection: { type: "operation", id: requested } };
    if (requested === "search_company") return { status: "resolved", operationId: requested, message: "I can invoke the governed Company Search capability through its configured primitive realisation.", projection: { type: "operation", id: requested } };
    const attention = registry.capabilities.filter(item => item.state !== "realised");
    return { status: "resolved", operationId: requested, message: attention.length ? `${attention.length} capabilities need attention: ${attention.map(item => `${item.name} (${item.state})`).join(", ")}.` : "Every declared capability is realised.", projection: { type: "capabilities", ids: attention.map(item => item.id) } };
  }
}

const json = (response, status, value) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); };
async function readJson(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; }
