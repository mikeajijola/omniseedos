import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

export function createOmniSeedOs({ engine, declaration, lily = new LilyResolverReference() }) {
  return createServer(async (request, response) => {
    try {
      if (request.url === "/api/company" && request.method === "GET") return json(response, 200, await engine.inspect(declaration));
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
        return json(response, 200, lily.resolve(body.message, registry));
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
  });
}

/** Deterministic Generation 1 stub. It selects only declared, implemented, available Lily operations. */
export class LilyResolverReference {
  resolve(message = "", registry) {
    const text = message.toLowerCase();
    const requested = text.includes("plan") || text.includes("set up") ? "generate_plan" : text.includes("capability") || text.includes("missing") || text.includes("attention") || text.includes("gap") ? "get_capability" : null;
    if (!requested) return { status: "clarification_required", message: "I can inspect capabilities or generate a plan. Which should I do?", operationId: null };
    const operation = registry.operations.find(item => item.id === requested && item.interfaces.includes("lily"));
    if (!operation || operation.currentAvailability !== "available") return { status: "unsupported", message: `The ${requested} operation is not currently available.`, operationId: requested, availability: operation?.currentAvailability ?? "undeclared" };
    if (requested === "generate_plan") return { status: "resolved", operationId: requested, message: "I can request a deterministic plan. It must be reviewed and approved before apply.", projection: { type: "operation", id: requested } };
    const attention = registry.capabilities.filter(item => item.state !== "realised");
    return { status: "resolved", operationId: requested, message: attention.length ? `${attention.length} capabilities need attention: ${attention.map(item => `${item.name} (${item.state})`).join(", ")}.` : "Every declared capability is realised.", projection: { type: "capabilities", ids: attention.map(item => item.id) } };
  }
}

const json = (response, status, value) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); };
async function readJson(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; }
