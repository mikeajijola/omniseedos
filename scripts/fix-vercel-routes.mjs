import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const governedDynamicRoutes = [
  "/api/state/companies/",
  "/v1/companies/"
];

const governedDynamicFunctions = [
  join("api", "state", "companies", "[companyId]", "state.func"),
  join("v1", "companies", "[companyId]", "operations", "[operation].func")
];

export async function routeGovernedDynamicsThroughServer(configPath) {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const matched = [];
  for (const route of config.routes ?? []) {
    if (!governedDynamicRoutes.some(prefix => route.src?.startsWith(prefix))) continue;
    route.dest = "/__server";
    matched.push(route.src);
  }
  if (matched.length !== governedDynamicRoutes.length) {
    throw new Error(`Expected ${governedDynamicRoutes.length} governed dynamic Vercel routes, found ${matched.length}`);
  }
  const functionsRoot = join(dirname(configPath), "functions");
  await Promise.all(governedDynamicFunctions.map(path => rm(join(functionsRoot, path), { recursive: true, force: true })));
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return matched;
}
