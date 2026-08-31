import { resolve } from "node:path";
import { loadOmniform } from "@omniseed/omniform";
import { assembleRuntime, JsonStateStore } from "@omniseed/engine";
import { createBearerIdentityResolver, createOmniSeedOs, resolveDeclaredActorAuthorization } from "./app.js";
import { parseProtocolProviders } from "./runtime-provider-config.js";

const declarationPath = resolve(process.env.OMNIFORM_PATH ?? "../omniform/examples/omniseed/omniform.yaml");
const statePath = resolve(process.env.OMNISEED_STATE ?? ".omniseed/state.json");
const port = Number(process.env.PORT ?? 4310);
const binding = {
  desiredRevision: process.env.OMNISEED_DESIRED_REVISION ?? null,
  environment: process.env.OMNISEED_ENVIRONMENT ?? "development",
  deployment: process.env.OMNISEED_DEPLOYMENT_ID ? { id: process.env.OMNISEED_DEPLOYMENT_ID, provider: process.env.OMNISEED_DEPLOYMENT_PROVIDER ?? null } : null
};
const declaration = await loadOmniform(declarationPath);
// Engine owns Provider protocol loading and compatibility checks. An empty
// configuration remains truthful: desired Providers appear as unavailable.
const { engine } = await assembleRuntime({ declaration, store: new JsonStateStore(statePath), protocolProviders: parseProtocolProviders(process.env.OMNISEED_PROTOCOL_PROVIDERS), binding });
const authenticate = createBearerIdentityResolver({
  operatorToken: process.env.OMNISEED_OPERATOR_TOKEN,
  operator: {
    role: "operator",
    authorization: {
      actorId: process.env.OMNISEED_OPERATOR_ACTOR_ID ?? "operator",
      permissions: ["company.read", "capability.read", "plan.create", "plan.approve", "plan.apply", "company_search.read", "company_change.propose", "company_change.read"]
    }
  }
});
const stewardAuthorization = process.env.OMNISEED_STEWARD_ACTOR_ID
  ? resolveDeclaredActorAuthorization(declaration, process.env.OMNISEED_STEWARD_ACTOR_ID)
  : null;
createOmniSeedOs({ engine, declaration, authenticate, stewardAuthorization }).listen(port, () => console.log(`OmniSeed OS for ${declaration.metadata.name} listening at http://localhost:${port}`));
