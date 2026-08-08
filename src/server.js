import { resolve } from "node:path";
import { loadOmniform } from "@omniseed/omniform";
import { JsonStateStore, OmniSeed, registryForDeclaration } from "@omniseed/engine";
import { createOmniSeedOs } from "./app.js";

const declarationPath = resolve(process.env.OMNIFORM_PATH ?? "../omniform/examples/omniseed/omniform.yaml");
const statePath = resolve(process.env.OMNISEED_STATE ?? ".omniseed/state.json");
const port = Number(process.env.PORT ?? 4310);
const declaration = await loadOmniform(declarationPath);
const engine = new OmniSeed({ store: new JsonStateStore(statePath), providers: registryForDeclaration(declaration) });
createOmniSeedOs({ engine, declaration }).listen(port, () => console.log(`OmniSeed OS for ${declaration.metadata.name} listening at http://localhost:${port}`));
