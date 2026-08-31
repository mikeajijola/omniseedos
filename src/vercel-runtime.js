import { parseOmniform } from "@omniseed/omniform";
import { assembleRuntime, HttpCompanyWorkStore, MemoryCompanyWorkStore, MemoryStateStore, ProviderGitCompanyRepository, ProviderRegistry } from "@omniseed/engine";
import { GitHubProvider } from "@omniseed/provider-github-reference";
import { createBearerIdentityResolver, createOmniSeedOsHandler, resolveDeclaredActorAuthorization } from "./app.js";
import { DurableHttpStateStore } from "./durable-http-store.js";
import { createDeclaredStewardClient } from "./declared-steward.js";
import { CompanyWorkController } from "./company-work-controller.js";
import { parseProtocolProviders } from "./runtime-provider-config.js";

export { parseProtocolProviders } from "./runtime-provider-config.js";

export function restoreVercelApiPath(request) {
  const path = request?.query?.path;
  if (path === undefined) return request?.url ?? "/api";
  const segments = (Array.isArray(path) ? path : [path]).flatMap(value => String(value).split("/")).filter(Boolean);
  return `/api/${segments.map(segment => encodeURIComponent(decodeURIComponent(segment))).join("/")}`;
}

export async function createVercelRuntime({ env = process.env, fetchImpl = fetch, providerRegistry, protocolProviders, companyRepository, githubProvider, steward } = {}) {
  const inspectionMode = env.OMNISEED_READ_ONLY_INSPECTION === "true";
  const required = ["OMNISEED_COMPANY_DEFINITION_URL", "OMNISEED_DESIRED_REVISION", "OMNISEED_STEWARD_ACTOR_ID", ...(inspectionMode ? [] : ["OMNISEED_STATE_ENDPOINT", "OMNISEED_STATE_TOKEN", "OMNISEED_OPERATOR_TOKEN", "OMNISEED_OPERATION_TOKEN"])];
  const missing = required.filter(name => !env[name]);
  if (missing.length) throw new Error(`Missing server runtime configuration: ${missing.join(", ")}`);
  if (!env.OMNISEED_COMPANY_DEFINITION_URL.includes(env.OMNISEED_DESIRED_REVISION)) throw new Error("Company definition URL must be pinned to the declared desired revision.");
  const response = await fetchImpl(env.OMNISEED_COMPANY_DEFINITION_URL, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`Canonical company definition fetch failed (${response.status}).`);
  const declaration = parseOmniform(await response.text());
  const desired = declaration.spec.governance?.desiredState;
  if (!desired?.repository || desired.changeMode !== "pull_request") throw new Error("The deployed company must declare a PR-governed canonical repository.");
  const providers = providerRegistry ?? new ProviderRegistry();
  let repository = companyRepository;
  if (!inspectionMode && !repository) {
    const workflow = declaration.spec.resources?.workflows?.find(resource => resource.id === "company_change_workflow");
    const configuration = workflow?.spec;
    if (configuration?.provider !== "github") throw new Error("Company Change workflow must declare the GitHub Provider implementation.");
    const expectedRepository = githubRepositoryName(desired.repository);
    if (configuration.repository !== expectedRepository || configuration.baseBranch !== desired.branch || configuration.path !== desired.path) throw new Error("Company Change Provider configuration must match canonical Git authority.");
    const credentialReference = configuration.credentialReference;
    if (!credentialReference || !env[credentialReference]) throw new Error("Company Change GitHub Provider credential is unavailable.");
    const implementation = githubProvider ?? await GitHubProvider.connect({ configuration, token: env[credentialReference], fetchImpl });
    if (!providers.get("github")) providers.register(implementation);
    repository = new ProviderGitCompanyRepository({ provider: providers.require("github") });
  }
  const store = inspectionMode ? new MemoryStateStore() : new DurableHttpStateStore({ endpoint: env.OMNISEED_STATE_ENDPOINT, token: env.OMNISEED_STATE_TOKEN, fetchImpl });
  const workStore = inspectionMode ? new MemoryCompanyWorkStore() : new HttpCompanyWorkStore({ endpoint: env.OMNISEED_STATE_ENDPOINT, token: env.OMNISEED_STATE_TOKEN, fetchImpl });
  const binding = { desiredRevision: env.OMNISEED_DESIRED_REVISION, environment: inspectionMode ? `${env.OMNISEED_ENVIRONMENT ?? "production"}-read-only-inspection` : env.OMNISEED_ENVIRONMENT ?? "production", deployment: { id: env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_URL ?? "unresolved", provider: "vercel" } };
  const assembled = await assembleRuntime({
    declaration,
    store,
    providerHandles: providers.list(),
    protocolProviders: protocolProviders ?? parseProtocolProviders(env.OMNISEED_PROTOCOL_PROVIDERS),
    binding,
    companyRepository: repository
  });
  const engine = assembled.engine;
  engine.workStore = workStore;
  const authenticate = createBearerIdentityResolver({ operatorToken: env.OMNISEED_OPERATOR_TOKEN, operator: { role: "operator", authorization: { actorId: env.OMNISEED_OPERATOR_ACTOR_ID ?? "operator", permissions: ["company.read", "capability.read", "plan.create", "plan.approve", "plan.apply", "company_search.read", "company_change.propose", "company_change.read", "company_change.approve", "company_change.apply", "company_change.merge"] } } });
  const stewardAuthorization = resolveDeclaredActorAuthorization(declaration, env.OMNISEED_STEWARD_ACTOR_ID);
  if (!stewardAuthorization) throw new Error("Configured steward is not a declared Agent resource.");
  const operationAuthenticate = createBearerIdentityResolver({ operatorToken: env.OMNISEED_OPERATION_TOKEN, operator: { role: "agent", authorization: stewardAuthorization } });
  const declaredSteward = steward ?? createDeclaredStewardClient({ declaration, actorId: env.OMNISEED_STEWARD_ACTOR_ID, env, fetchImpl });
  const companyWork = typeof declaredSteward.start === "function" ? new CompanyWorkController({ engine, declaration, steward: declaredSteward, authorization: stewardAuthorization }) : null;
  const allowAnonymousStewardChat = env.OMNISEED_PUBLIC_STEWARD_CHAT === "true";
  return {
    declaration,
    engine,
    inspectionMode,
    allowAnonymousStewardChat,
    handleSteward: message => declaredSteward.handle({ message, engine, declaration, authorization: stewardAuthorization }),
    companyWork,
    close: assembled.close,
    handler: createOmniSeedOsHandler({ engine, declaration, authenticate, operationAuthenticate, stewardAuthorization, steward: declaredSteward, companyWork, allowAnonymousStewardChat })
  };
}

function githubRepositoryName(reference) {
  const match = String(reference).match(/^https:\/\/github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
  if (!match) throw new Error("Canonical repository must be a GitHub HTTPS reference.");
  return match[1];
}
