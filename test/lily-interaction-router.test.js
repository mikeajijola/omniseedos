import test from "node:test";
import assert from "node:assert/strict";
import { classifyLilyInteraction } from "../src/lily-interaction-router.js";

test("representative Lily intents have stable execution classes", () => {
  assert.equal(classifyLilyInteraction("hi").executionClass, "conversation");
  assert.equal(classifyLilyInteraction("what company are you stewarding?").executionClass, "company_query");
  assert.equal(classifyLilyInteraction("what needs attention?").executionClass, "company_query");
  assert.equal(classifyLilyInteraction("generate a plan").executionClass, "company_work");
  assert.equal(classifyLilyInteraction("please change the deployment").executionClass, "company_work");
});

test("ambiguous input fails toward durable governed work", () => {
  assert.equal(classifyLilyInteraction("help me with this").executionClass, "company_work");
});
