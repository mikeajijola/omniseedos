import { neon } from "@neondatabase/serverless";
import { createDurableStateService } from "./durable-state-service.js";
import { createVercelRuntime, restoreVercelApiPath } from "./vercel-runtime.js";

export function createVercelHandler({ env = process.env } = {}) {
  let runtime;
  let stateService;
  return async function handler(request, response) {
    request.url = restoreVercelApiPath(request);
    if (request.url?.startsWith("/api/state/")) {
      if (!env.DATABASE_URL || !env.OMNISEED_STATE_TOKEN) return response.status(503).json({ error: "state_service_not_configured" });
      const sql = neon(env.DATABASE_URL);
      stateService ??= createDurableStateService({ query: (text, params) => sql.query(text, params), token: env.OMNISEED_STATE_TOKEN });
      const outcome = await stateService({ method: request.method, url: request.url, headers: request.headers, body: request.body });
      return response.status(outcome.status).json(outcome.body);
    }
    runtime ??= createVercelRuntime({ env });
    return (await runtime).handler(request, response);
  };
}

export default createVercelHandler();
