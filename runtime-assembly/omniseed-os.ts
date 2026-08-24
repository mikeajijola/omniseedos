import { Readable } from "node:stream";
import { defineChannel, GET, POST, PUT } from "eve/channels";
import { createVercelHandler } from "../../src/vercel-handler.js";
import { createVercelRuntime } from "../../src/vercel-runtime.js";
import { streamStewardResult } from "../../src/steward-stream.js";

const handle = createVercelHandler();
let runtime: ReturnType<typeof createVercelRuntime> | undefined;

async function steward(request: Request) {
  runtime ??= createVercelRuntime();
  const resolved = await runtime;
  if (!resolved.allowAnonymousStewardChat) return dispatch(request);
  const body = await request.json();
  return streamStewardResult(() => resolved.handleSteward(body?.message));
}

async function dispatch(request: Request) {
  const url = new URL(request.url);
  const raw = request.method === "GET" || request.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  const incoming: any = Readable.from(raw.length ? [raw] : []);
  incoming.method = request.method;
  incoming.url = `${url.pathname}${url.search}`;
  incoming.headers = Object.fromEntries(request.headers.entries());
  if ((request.headers.get("content-type") ?? "").includes("application/json") && raw.length) incoming.body = JSON.parse(raw.toString("utf8"));

  let status = 200;
  const headers = new Headers();
  const chunks: Buffer[] = [];
  const outgoing: any = {
    writeHead(code: number, values: Record<string, string> = {}) { status = code; for (const [key, value] of Object.entries(values)) headers.set(key, value); },
    setHeader(key: string, value: string) { headers.set(key, value); },
    status(code: number) { status = code; return outgoing; },
    json(value: unknown) { headers.set("content-type", "application/json; charset=utf-8"); outgoing.end(JSON.stringify(value)); return outgoing; },
    end(value?: string | Buffer) { if (value !== undefined) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value)); }
  };
  await handle(incoming, outgoing);
  return new Response(Buffer.concat(chunks), { status, headers });
}

export default defineChannel({
  routes: [
    GET("/api/company", dispatch),
    POST("/api/plan", dispatch),
    POST("/api/approve", dispatch),
    POST("/api/apply", dispatch),
    POST("/api/lily", steward),
    POST("/api/search", dispatch),
    GET("/api/state/companies/:companyId/state", dispatch),
    PUT("/api/state/companies/:companyId/state", dispatch),
    POST("/v1/companies/:companyId/operations/:operation", dispatch)
  ]
});
