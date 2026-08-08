import test from "node:test";
import assert from "node:assert/strict";
import { parseOmniform } from "@omniseed/omniform";
import { MemoryStateStore, OmniSeed, registryForDeclaration } from "@omniseed/engine";
import { createOmniSeedOs, lilyProjection } from "../src/app.js";

const declaration = parseOmniform(`apiVersion: omniform.org/v1alpha1\nkind: Company\nmetadata: { id: acme, name: Acme }\nspec:\n  providers:\n    systems: { provider: local }\n  capabilities:\n    - id: deliver_product\n      name: Deliver Product\n      requires: [{ id: host_app }]\n  resources:\n    systems:\n      - { id: app, name: App, offers: [host_app] }\n`);

test("Lily projects the canonical registry", async () => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: registryForDeclaration(declaration) });
  const registry = await engine.inspect(declaration);
  const response = lilyProjection("What is missing?", registry);
  assert.equal(response.intent, "inspect_gaps");
  assert.match(response.message, /Deliver Product/);
});

test("OS exposes registry and guards apply with explicit approval", async t => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), providers: registryForDeclaration(declaration) });
  const server = createOmniSeedOs({ engine, declaration });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const company = await fetch(`${base}/api/company`).then(response => response.json());
  assert.equal(company.company.id, "acme");
  const rejected = await fetch(`${base}/api/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(rejected.status, 403);
});
