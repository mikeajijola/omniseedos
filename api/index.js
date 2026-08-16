import { createVercelRuntime } from "../src/vercel-runtime.js";
import { neon } from "@neondatabase/serverless";
import { createDurableStateService } from "../src/durable-state-service.js";

let runtime;
let stateService;
export default async function handler(request, response) {
  if (request.url?.startsWith("/api/state/")) {
    if (!process.env.DATABASE_URL || !process.env.OMNISEED_STATE_TOKEN) return response.status(503).json({ error: "state_service_not_configured" });
    const sql = neon(process.env.DATABASE_URL);
    stateService ??= createDurableStateService({ query: (text, params) => sql.query(text, params), token: process.env.OMNISEED_STATE_TOKEN });
    const outcome = await stateService({ method: request.method, url: request.url, headers: request.headers, body: request.body });
    return response.status(outcome.status).json(outcome.body);
  }
  runtime ??= createVercelRuntime();
  return (await runtime).handler(request, response);
}
