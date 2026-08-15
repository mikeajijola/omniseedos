import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

export function createOmniSeedOs({ engine, declaration, steward = new GovernedStewardClient(), authenticate = anonymousOnly, stewardAuthorization = null }) {
  return createServer(createOmniSeedOsHandler({ engine, declaration, steward, authenticate, stewardAuthorization }));
}

/** Request handler shared by the long-lived Node server and serverless adapters. */
export function createOmniSeedOsHandler({ engine, declaration, steward = new GovernedStewardClient(), authenticate = anonymousOnly, stewardAuthorization = null }) {
  return async (request, response) => {
    try {
      if (request.url === "/api/company" && request.method === "GET") return json(response, 200, await engine.inspect(declaration));
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
        await requireIdentity(authenticate, request, "operator");
        if (!stewardAuthorization) throw authError("The declared steward has no server-side runtime identity.");
        return json(response, 200, await steward.handle({ message: body.message, engine, declaration, authorization: stewardAuthorization }));
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
