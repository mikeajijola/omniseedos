import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const governedDynamicRoutes = [
  "/api/lily/(?<workRunId>[^/]+)",
  "/api/lily/(?<workRunId>[^/]+)/messages",
  "/api/lily/(?<workRunId>[^/]+)/cancel",
  "/api/state/companies/(?<companyId>[^/]+)/state",
  "/api/state/companies/(?<companyId>[^/]+)/work",
  "/v1/companies/(?<companyId>[^/]+)/operations/(?<operation>[^/]+)"
];

const operatorOperationRoute = {
  src: "/api/operations/(?<operation>[^/]+)",
  dest: "/__server"
};

const generatedFunctionsToRemove = [
  join("index.func"),
  join("api", "lily", "[workRunId].func"),
  join("api", "lily", "[workRunId]", "messages.func"),
  join("api", "lily", "[workRunId]", "cancel.func"),
  join("api", "state", "companies", "[companyId]", "state.func"),
  join("api", "state", "companies", "[companyId]", "work.func"),
  join("v1", "companies", "[companyId]", "operations", "[operation].func")
];

export async function routeGovernedDynamicsThroughServer(configPath) {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const outputRoot = dirname(configPath);
  const osIndexPath = join(outputRoot, "static", "index.html");
  const osIndex = await readFile(osIndexPath, "utf8").catch(() => null);
  if (!osIndex?.includes("<title>OmniSeed OS</title>")) {
    throw new Error(`Expected the generated OmniSeed OS interface at ${osIndexPath}`);
  }
  config.overrides = {
    ...(config.overrides ?? {}),
    "index.html": {
      ...(config.overrides?.["index.html"] ?? {}),
      path: ""
    }
  };

  const rootRoutes = (config.routes ?? []).filter(route => route.src === "/");
  if (rootRoutes.length !== 1) {
    throw new Error(`Expected exactly one generated root route, found ${rootRoutes.length}`);
  }

  const matched = [];
  const matchedRoutes = [];
  for (const route of config.routes ?? []) {
    if (!governedDynamicRoutes.includes(route.src)) continue;
    route.dest = "/__server";
    matched.push(route.src);
    matchedRoutes.push(route);
  }
  if (matched.length !== governedDynamicRoutes.length) {
    throw new Error(`Expected ${governedDynamicRoutes.length} governed dynamic Vercel routes, found ${matched.length}`);
  }
  const functionsRoot = join(outputRoot, "functions");
  await Promise.all(generatedFunctionsToRemove.map(path => rm(join(functionsRoot, path), { recursive: true, force: true })));
  const remainingRoutes = config.routes.filter(route => !matchedRoutes.includes(route) && !rootRoutes.includes(route));
  const filesystemIndex = remainingRoutes.findIndex(route => route.handle === "filesystem");
  remainingRoutes.splice(filesystemIndex < 0 ? 0 : filesystemIndex, 0, ...matchedRoutes, operatorOperationRoute);
  config.routes = remainingRoutes;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return [...matched, operatorOperationRoute.src];
}
