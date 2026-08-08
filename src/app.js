import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

export function createOmniSeedOs({ engine, declaration }) {
  return createServer(async (request, response) => {
    try {
      if (request.url === "/api/company" && request.method === "GET") return json(response, 200, await engine.inspect(declaration));
      if (request.url === "/api/plan" && request.method === "POST") return json(response, 200, await engine.plan(declaration));
      if (request.url === "/api/apply" && request.method === "POST") {
        const body = await readJson(request);
        if (body.approved !== true) return json(response, 403, { error: "Explicit approval is required" });
        const plan = await engine.plan(declaration);
        return json(response, 200, await engine.apply(declaration, plan, { approved: true }));
      }
      if (request.url === "/api/lily" && request.method === "POST") {
        const body = await readJson(request);
        return json(response, 200, await lilyProjection(body.message, await engine.inspect(declaration)));
      }
      if (request.method !== "GET") return json(response, 404, { error: "Not found" });
      const relative = request.url === "/" ? "index.html" : request.url.slice(1);
      if (relative.includes("..")) return json(response, 400, { error: "Invalid path" });
      const file = await readFile(join(publicDirectory, relative));
      response.writeHead(200, { "content-type": mime[extname(relative)] ?? "application/octet-stream" });
      response.end(file);
    } catch (error) {
      if (error.code === "ENOENT") return json(response, 404, { error: "Not found" });
      json(response, 500, { error: error.message });
    }
  });
}

export function lilyProjection(message = "", registry) {
  const text = message.toLowerCase();
  const attention = registry.capabilities.filter(item => item.state !== "realised");
  if (text.includes("missing") || text.includes("attention") || text.includes("gap")) {
    return { intent: "inspect_gaps", message: attention.length ? `${attention.length} capabilities need attention: ${attention.map(item => `${item.name} (${item.state})`).join(", ")}.` : "Every declared capability is realised.", projection: { type: "capabilities", ids: attention.map(item => item.id) } };
  }
  if (text.includes("plan") || text.includes("set up") || text.includes("working")) {
    return { intent: "generate_plan", message: "I can generate a deterministic plan from the current declaration. You will review it before anything changes.", projection: { type: "plan" } };
  }
  return { intent: "inspect_company", message: `${registry.company.name} has ${registry.capabilities.length} capabilities; ${registry.capabilities.filter(item => item.state === "realised").length} are realised.`, projection: { type: "company" } };
}

const json = (response, status, value) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); };
async function readJson(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; }
