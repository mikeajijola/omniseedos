import { resolve } from "node:path";
import { loadOmniform } from "@omniseed/omniform";
import { JsonStateStore, OmniSeed, ProviderRegistry } from "@omniseed/engine";
import { createOmniSeedOs } from "./app.js";

const declarationPath = resolve(process.env.OMNIFORM_PATH ?? "../omniform/examples/omniseed/omniform.yaml");
const statePath = resolve(process.env.OMNISEED_STATE ?? ".omniseed/state.json");
const port = Number(process.env.PORT ?? 4310);
const binding = {
  desiredRevision: process.env.OMNISEED_DESIRED_REVISION ?? null,
  environment: process.env.OMNISEED_ENVIRONMENT ?? "development",
  deployment: process.env.OMNISEED_DEPLOYMENT_ID ? { id: process.env.OMNISEED_DEPLOYMENT_ID, provider: process.env.OMNISEED_DEPLOYMENT_PROVIDER ?? null } : null
};
const declaration = await loadOmniform(declarationPath);
// Provider implementations are installed and registered by the company deployment.
// An empty registry is truthful: desired providers appear as unavailable gaps.
const engine = new OmniSeed({ store: new JsonStateStore(statePath), providers: new ProviderRegistry(), binding });
createOmniSeedOs({ engine, declaration }).listen(port, () => console.log(`OmniSeed OS for ${declaration.metadata.name} listening at http://localhost:${port}`));
