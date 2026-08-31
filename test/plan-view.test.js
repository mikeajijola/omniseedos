import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPlans } from "../public/plan-view.js";

test("plan view explains Engine-projected create and update actions with observations", () => {
  const html = renderPlans([{ id: "plan_current", current: true, status: "pending", createdAt: "2026-08-31T10:00:00Z", actions: [
    { action: "create", family: "connectors", resourceId: "mail", provider: "google", desired: { name: "Company mail" }, observed: null },
    { action: "update", family: "agents", resourceId: "lily", provider: "vercel", observed: { status: "degraded", checkedAt: "2026-08-31T09:00:00Z" } },
  ] }]);
  assert.match(html, /Current plan/);
  assert.match(html, /Create Company mail/);
  assert.match(html, /No observation was recorded/);
  assert.match(html, /Update lily/);
  assert.match(html, /Observed: degraded at 2026-08-31T09:00:00Z/);
  assert.match(html, /aria-label="Planned changes"/);
});

test("plan view distinguishes Engine-projected no-op and stale plans", () => {
  const html = renderPlans([
    { id: "plan_noop", current: true, status: "empty", outcome: "no_op", actions: [] },
    { id: "plan_old", current: false, status: "pending", actions: [{ action: "create", family: "skills", resourceId: "search", provider: "acme" }] },
  ]);
  assert.match(html, /No changes are needed for the observed company state/);
  assert.match(html, />no-op</);
  assert.match(html, /Earlier plan/);
  assert.match(html, /Company state has changed since this plan was made/);
  assert.match(html, />stale</);
});

test("plan view escapes Engine-projected text", () => {
  const html = renderPlans([{ id: '<script>alert("x")</script>', current: true, status: "empty", actions: [] }]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("plan view remains readable on narrow screens and navigation exposes its state", async () => {
  const [css, page, browser] = await Promise.all([
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(css, /@media\(max-width:700px\).*\.plan-actions li\{grid-template-columns:1fr/s);
  assert.match(page, /<nav id="nav" aria-label="Company views">/);
  assert.match(page, /aria-current="page"/);
  assert.match(page, /<label class="visually-hidden" for="intent">/);
  assert.match(browser, /setAttribute\("aria-current", "page"\)/);
});
