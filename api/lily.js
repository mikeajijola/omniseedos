import { LilyResolverReference } from "../src/app.js";
import { loadRuntimeSnapshot } from "../src/runtime.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  try {
    const snapshot = await loadRuntimeSnapshot(), runtime = { ...snapshot, instance: { companyId: snapshot.company.id, url: `https://${request.headers["x-forwarded-host"] ?? request.headers.host}`, deploymentPlatform: "vercel" } };
    response.status(200).json(new LilyResolverReference().resolve(request.body?.message, runtime, request.body?.authorization));
  } catch (error) { response.status(503).json({ error: "Company runtime unavailable", detail: error.message }); }
}
