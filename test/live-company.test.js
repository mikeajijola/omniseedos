import test from "node:test";
import assert from "node:assert/strict";
import { LilyResolverReference } from "../src/app.js";

const authorization = { actorId: "owner", permissions: ["company.read", "capability.read", "plan.create"] };
const runtime = {
  company: { id: "omniseed", name: "OmniSeed" }, definition: { hash: "definition_hash" }, runtime: { version: "1.0.0-alpha.3", stateVersion: 2 },
  providers: [{ family: "systems", providerId: "vercel", state: "healthy" }],
  resources: [{ id: "omniseed_os", provider: "vercel", observed: { attributes: { url: "generation-1-preview.vercel.app" } } }],
  capabilities: [
    { id: "company_operating_environment", name: "Company Operating Environment", state: "realised" },
    { id: "company_stewardship", name: "Company Stewardship", state: "realised" }
  ],
  operations: [
    { id: "get_company_identity", permissions: ["company.read"], interfaces: ["lily"], currentAvailability: "available" },
    { id: "get_capability", permissions: ["capability.read"], interfaces: ["lily"], currentAvailability: "available" },
    { id: "generate_plan", permissions: ["plan.create"], interfaces: ["lily"], currentAvailability: "available" }
  ]
};

test("Lily identifies her company from runtime identity", () => assert.match(new LilyResolverReference().resolve("Who are you?", runtime, authorization).message, /steward for OmniSeed/));
test("Lily reports runtime-derived capabilities", () => assert.match(new LilyResolverReference().resolve("What capabilities do we currently have?", runtime, authorization).message, /Company Operating Environment \(realised\)/));
test("Lily traces location to observed Vercel realisation", () => {
  const result = new LilyResolverReference().resolve("Where are you running?", runtime, authorization);
  assert.match(result.message, /running on Vercel/); assert.equal(result.projection.resource.observed.attributes.url, "generation-1-preview.vercel.app");
});
test("Lily prepares rather than executes redeploy", () => {
  const result = new LilyResolverReference().resolve("Redeploy", runtime, authorization);
  assert.equal(result.operationId, "generate_plan"); assert.match(result.message, /reviewed and approved/);
});
