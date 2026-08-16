import { parseOmniform } from "@omniseed/omniform";
import { OmniSeed, ProviderRegistry } from "@omniseed/engine";
import { createBearerIdentityResolver, createOmniSeedOsHandler, resolveDeclaredActorAuthorization } from "./app.js";
import { DurableHttpStateStore } from "./durable-http-store.js";

export async function createVercelRuntime({ env = process.env, fetchImpl = fetch, providerRegistry = new ProviderRegistry(), steward } = {}) {
  const required = ["OMNISEED_COMPANY_DEFINITION_URL", "OMNISEED_DESIRED_REVISION", "OMNISEED_STATE_ENDPOINT", "OMNISEED_STATE_TOKEN", "OMNISEED_OPERATOR_TOKEN", "OMNISEED_STEWARD_ACTOR_ID"];
  const missing = required.filter(name => !env[name]);
  if (missing.length) throw new Error(`Missing server runtime configuration: ${missing.join(", ")}`);
  if (!env.OMNISEED_COMPANY_DEFINITION_URL.includes(env.OMNISEED_DESIRED_REVISION)) throw new Error("Company definition URL must be pinned to the declared desired revision.");
  const response = await fetchImpl(env.OMNISEED_COMPANY_DEFINITION_URL, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`Canonical company definition fetch failed (${response.status}).`);
  const declaration = parseOmniform(await response.text());
  const desired = declaration.spec.governance?.desiredState;
  if (!desired?.repository || desired.changeMode !== "pull_request") throw new Error("The deployed company must declare a PR-governed canonical repository.");
  const store = new DurableHttpStateStore({ endpoint: env.OMNISEED_STATE_ENDPOINT, token: env.OMNISEED_STATE_TOKEN, fetchImpl });
  const binding = { desiredRevision: env.OMNISEED_DESIRED_REVISION, environment: env.OMNISEED_ENVIRONMENT ?? "production", deployment: { id: env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_URL ?? "unresolved", provider: "vercel_interface" } };
  const engine = new OmniSeed({ store, providers: providerRegistry, binding });
  const authenticate = createBearerIdentityResolver({ operatorToken: env.OMNISEED_OPERATOR_TOKEN, operator: { role: "operator", authorization: { actorId: env.OMNISEED_OPERATOR_ACTOR_ID ?? "operator", permissions: ["company.read", "capability.read", "plan.create", "plan.approve", "plan.apply", "company_search.read", "company_change.propose", "company_change.read"] } } });
  const stewardAuthorization = resolveDeclaredActorAuthorization(declaration, env.OMNISEED_STEWARD_ACTOR_ID);
  if (!stewardAuthorization) throw new Error("Configured steward is not a declared Agent resource.");
  return { declaration, engine, handler: createOmniSeedOsHandler({ engine, declaration, authenticate, stewardAuthorization, steward }) };
}
