import { readFile, writeFile } from "node:fs/promises";

const governedDynamicRoutes = [
  "/api/state/companies/",
  "/v1/companies/"
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
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return matched;
}
