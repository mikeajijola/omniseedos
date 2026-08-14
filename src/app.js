import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

export function createOmniSeedOs({ engine, declaration, lily = new LilyResolverReference() }) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://omniseed.local").pathname;
      if (request.url === "/api/company" && request.method === "GET") return json(response, 200, await engine.inspect(declaration));
      if (pathname === "/api/company-changes" && request.method === "GET") return json(response, 200, await engine.invokeOperation(declaration, "inspect_company_change", {}, authorizationFromHeaders(request)));
      if (pathname === "/api/company-changes/propose" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 201, await engine.invokeOperation(declaration, "propose_company_change", body.proposal, body.authorization));
      }
      const companyChange = pathname.match(/^\/api\/company-changes\/([^/]+)(?:\/(preview|approve|reject|apply))?$/);
      if (companyChange) {
        const [, proposalId, action] = companyChange;
        if (!action && request.method === "GET") return json(response, 200, await engine.invokeOperation(declaration, "inspect_company_change", { proposalId }, authorizationFromHeaders(request)));
        if (request.method === "POST") {
          const body = await readJson(request);
          if (action === "preview") return json(response, 200, await engine.previewCompanyChange(declaration, proposalId, body.authorization));
          if (action === "approve") return json(response, 200, await engine.invokeOperation(declaration, "approve_company_change", { proposalId, proposalHash: body.proposalHash }, body.authorization));
          if (action === "reject") return json(response, 200, await engine.invokeOperation(declaration, "reject_company_change", { proposalId, reason: body.reason }, body.authorization));
          if (action === "apply") return json(response, 200, await engine.invokeOperation(declaration, "apply_company_change", { proposalId }, body.authorization));
        }
      }
      if (request.url === "/api/plan" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, await engine.plan(declaration, body.authorization));
      }
      if (request.url === "/api/approve" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, await engine.approve(body.plan, body.approvedActionIds, body.authorization));
      }
      if (request.url === "/api/apply" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, await engine.apply(declaration, body.plan, body.approval, body.authorization));
      }
      if (request.url === "/api/lily" && request.method === "POST") {
        const body = await readJson(request), registry = await engine.inspect(declaration);
        const resolution = lily.resolve(body.message, registry, body.authorization);
        if (resolution.status === "resolved" && resolution.operationId === "propose_company_change" && body.input) {
          const proposal = await engine.invokeOperation(declaration, resolution.operationId, body.input, body.authorization);
          return json(response, 201, { ...resolution, proposal, message: `I created ${proposal.id}. It changes the desired company definition, but has not changed the company yet. It requires approval.` });
        }
        return json(response, 200, resolution);
      }
      if (request.url === "/api/search" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, { results: await engine.invokeOperation(declaration, "search_company", { query: body.query, filters: body.filters }, body.authorization) });
      }
      if (request.method !== "GET") return json(response, 404, { error: "Not found" });
      const relative = request.url === "/" ? "index.html" : request.url.slice(1);
      if (relative.includes("..")) return json(response, 400, { error: "Invalid path" });
      const file = await readFile(join(publicDirectory, relative));
      response.writeHead(200, { "content-type": mime[extname(relative)] ?? "application/octet-stream" }); response.end(file);
    } catch (error) {
      if (error.code === "ENOENT") return json(response, 404, { error: "Not found" });
      json(response, error.code === "authorization_denied" ? 403 : ["plan_stale", "company_change_stale", "company_change_conflict"].includes(error.code) ? 409 : error.code === "company_change_not_found" ? 404 : 400, { code: error.code ?? "error", error: error.message, details: error.details });
    }
  });
}

/** Deterministic Generation 1 stub. It selects only declared, implemented, available Lily operations. */
export class LilyResolverReference {
  resolve(message = "", registry, authorization) {
    const text = message.toLowerCase();
    const requested = /\b(show|list|inspect|review)\b.*\b(company change|proposal)/.test(text) ? "inspect_company_change" : /\b(propose|redesign|design change|change the company)\b/.test(text) ? "propose_company_change" : text.includes("plan") || text.includes("set up") ? "generate_plan" : /\b(search|find|where|know|evidence)\b/.test(text) ? "search_company" : text.includes("capability") || text.includes("missing") || text.includes("attention") || text.includes("gap") ? "get_capability" : null;
    if (!requested) return { status: "clarification_required", message: "I can inspect capabilities, search evidence, generate a realisation plan, or propose a governed company-design change. Which should I do?", operationId: null };
    const operation = registry.operations.find(item => item.id === requested && item.interfaces.includes("lily"));
    if (!operation || operation.currentAvailability !== "available") return { status: "unsupported", message: `The ${requested} operation is not currently available.`, operationId: requested, availability: operation?.currentAvailability ?? "undeclared" };
    const granted = new Set(authorization?.permissions ?? []), missing = operation.permissions.filter(permission => !granted.has(permission));
    if (!authorization?.actorId || missing.length) return { status: "unauthorized", message: `The ${requested} operation is not authorized for this actor.`, operationId: requested, missingPermissions: missing };
    if (requested === "generate_plan") return { status: "resolved", operationId: requested, message: "I can request a deterministic plan. It must be reviewed and approved before apply.", projection: { type: "operation", id: requested } };
    if (requested === "propose_company_change") return { status: "resolved", operationId: requested, message: "I can propose an exact change to the company definition. A proposal does not change the company and requires separate governance.", projection: { type: "company_change", evidenceIds: registry.evidence.map(item => item.id ?? item.evidenceId).filter(Boolean) } };
    if (requested === "inspect_company_change") return { status: "resolved", operationId: requested, message: "I can inspect governed company-change proposals through the authorised engine operation.", projection: { type: "operation", id: requested } };
    if (requested === "search_company") return { status: "resolved", operationId: requested, message: "I can search governed company knowledge through the configured Company Search provider.", projection: { type: "operation", id: requested } };
    const attention = registry.capabilities.filter(item => item.state !== "realised");
    return { status: "resolved", operationId: requested, message: attention.length ? `${attention.length} capabilities need attention: ${attention.map(item => `${item.name} (${item.state})`).join(", ")}.` : "Every declared capability is realised.", projection: { type: "capabilities", ids: attention.map(item => item.id) } };
  }
}

const json = (response, status, value) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); };
async function readJson(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; }
function authorizationFromHeaders(request) {
  return {
    actorId: request.headers["x-omniseed-actor-id"],
    ...(request.headers["x-omniseed-actor-type"] ? { actorType: request.headers["x-omniseed-actor-type"] } : {}),
    permissions: String(request.headers["x-omniseed-permissions"] ?? "").split(",").map(item => item.trim()).filter(Boolean)
  };
}
