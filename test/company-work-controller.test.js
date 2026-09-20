import test from "node:test";
import assert from "node:assert/strict";
import { parseOmniform } from "@omniseed/omniform";
import { MemoryCompanyWorkStore, MemoryStateStore, OmniSeed, ProviderRegistry } from "@omniseed/engine";
import { CompanyWorkController } from "../src/company-work-controller.js";

const declaration = parseOmniform(`apiVersion: omniform.org/v1alpha1
kind: Company
metadata: { id: acme, name: Acme }
spec:
  stewardship: { capability: stewardship, realisation: lily_stewardship }
  providers: { agents: { provider: missing_agent_runtime } }
  capabilities:
    - { id: stewardship, name: Company Stewardship, requires: [{ id: agency, primitiveFamily: agents }], realisations: [lily_stewardship] }
  realisations:
    - { id: lily_stewardship, name: Lily, capability: stewardship, participants: [{ resource: lily, supplies: [agency] }] }
  resources:
    agents:
      - { id: lily, name: Lily, offers: [agency], spec: { authority: [company_work.create, company_work.read, company_work.record, company_work.cancel, company.read] } }
  operations:
    - { id: inspect_company, capability: stewardship, description: Inspect company, input: {}, output: {}, mutation: false, permissions: [company.read], approval: none, interfaces: [lily, api] }
    - { id: start_company_work, capability: stewardship, description: Start work, input: {}, output: {}, mutation: true, permissions: [company_work.create], approval: none, interfaces: [lily, api] }
    - { id: list_company_work, capability: stewardship, description: List work, input: {}, output: {}, mutation: false, permissions: [company_work.read], approval: none, interfaces: [lily, api] }
    - { id: get_company_work, capability: stewardship, description: Get work, input: {}, output: {}, mutation: false, permissions: [company_work.read], approval: none, interfaces: [lily, api] }
    - { id: continue_company_work, capability: stewardship, description: Continue work, input: {}, output: {}, mutation: true, permissions: [company_work.create], approval: none, interfaces: [lily, api] }
    - { id: cancel_company_work, capability: stewardship, description: Cancel work, input: {}, output: {}, mutation: true, permissions: [company_work.cancel], approval: none, interfaces: [lily, api] }
`);

const authorization = { actorId: "lily", permissions: ["company_work.create", "company_work.read", "company_work.record", "company_work.cancel", "company.read"] };

test("durable controller runs Eve's tool loop and projects it into Engine company work", async () => {
  const runtimeStore = new MemoryStateStore(), workStore = new MemoryCompanyWorkStore();
  const engine = new OmniSeed({ store: runtimeStore, workStore, providers: new ProviderRegistry(), binding: { desiredRevision: "a".repeat(40) } });
  const steward = {
    async start() { return { sessionId: "ses_1", continuationToken: "eve:first", streamIndex: 0 }; },
    async read({ streamIndex }) {
      assert.equal(streamIndex, 0);
      return { streamIndex: 5, continuationToken: "eve:second", events: [
        { type: "turn.started", meta: { id: "evt_1", at: "2026-08-25T00:00:00.000Z" }, data: { turnId: "turn_1" } },
        { type: "actions.requested", meta: { id: "evt_2", at: "2026-08-25T00:00:01.000Z" }, data: { actions: [{ kind: "tool-call", callId: "call_1", toolName: "inspect_company", input: {} }] } },
        { type: "action.result", meta: { id: "evt_3", at: "2026-08-25T00:00:02.000Z" }, data: { status: "completed", result: { kind: "tool-result", callId: "call_1", toolName: "inspect_company", output: { company: { id: "acme" } } } } },
        { type: "message.completed", meta: { id: "evt_4", at: "2026-08-25T00:00:03.000Z" }, data: { message: "I inspected Acme through OmniSeed." } },
        { type: "session.waiting", meta: { id: "evt_5", at: "2026-08-25T00:00:04.000Z" }, data: { continuationToken: "eve:second" } },
      ] };
    },
  };
  const controller = new CompanyWorkController({ engine, declaration, steward, authorization });
  const started = await controller.start({ intent: "What company are you stewarding?", idempotencyKey: "request-1" });
  assert.equal(started.status, "running");
  const completed = await controller.inspect(started.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.session.cursor, 5);
  assert.equal(completed.events.find(item => item.type === "user_message").summary, "What company are you stewarding?");
  assert.equal(completed.events.find(item => item.type === "operation_requested").operationId, "inspect_company");
  assert.equal(completed.events.find(item => item.type === "assistant_message").summary, "I inspected Acme through OmniSeed.");
  assert.equal("continuationToken" in completed.session, false);
  assert.equal((await runtimeStore.load("acme")).version, 0);
  assert.equal((await workStore.load("acme")).version > 0, true);
  assert.equal((await engine.inspect(declaration)).workRuns[0].id, started.id);
});

test("durable controller does not resume an Agent session when an idempotent start is replayed", async () => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), workStore: new MemoryCompanyWorkStore(), providers: new ProviderRegistry(), binding: { desiredRevision: "a".repeat(40) } });
  let starts = 0, continuations = 0;
  const steward = {
    async start() {
      starts += 1;
      return { sessionId: "ses_1", continuationToken: "eve:first", streamIndex: 0 };
    },
    async continue() { continuations += 1; }
  };
  const controller = new CompanyWorkController({ engine, declaration, steward, authorization });
  const first = await controller.start({ intent: "Inspect the company", idempotencyKey: "request-1" });
  const replay = await controller.start({ intent: "Inspect the company", idempotencyKey: "request-1" });

  assert.equal(replay.id, first.id);
  assert.equal(replay.status, "running");
  assert.equal(starts, 1);
  assert.equal(continuations, 0);
  assert.equal(replay.events.filter(item => item.type === "user_message").length, 1);
});

test("continuing work records the operator message in the durable conversation", async () => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), workStore: new MemoryCompanyWorkStore(), providers: new ProviderRegistry(), binding: { desiredRevision: "a".repeat(40) } });
  const steward = {
    async start() { return { sessionId: "session-1", continuationToken: "continuation-1", streamIndex: 0 }; },
    async continue() { return { sessionId: "session-1", continuationToken: "continuation-2", streamIndex: 0 }; },
  };
  const controller = new CompanyWorkController({ engine, declaration, steward, authorization });
  const first = await controller.start({ intent: "First message" });
  await engine.recordCompanyWorkEvent(declaration, first.id, { status: "waiting_for_input", event: { id: "waiting-1", type: "operator_input_requested", summary: "More detail is required." } }, authorization);

  const continued = await controller.continue(first.id, "Follow-up message");

  assert.deepEqual(continued.events.filter(item => item.type === "user_message").map(item => item.summary), ["First message", "Follow-up message"]);
});

test("controller restart preserves one runtime session across idempotent auditable conversation segments", async () => {
  const workStore = new MemoryCompanyWorkStore();
  const engine = new OmniSeed({ store: new MemoryStateStore(), workStore, providers: new ProviderRegistry(), binding: { desiredRevision: "a".repeat(40) } });
  let starts = 0, continuations = 0;
  const continuedWith = [];
  const steward = {
    async start() {
      starts += 1;
      return { protocol: "acme.conversation.v2", sessionId: "session-1", continuation: "continuation-1", cursor: 0 };
    },
    async continue(input) {
      continuations += 1;
      continuedWith.push(input);
      return { protocol: "acme.conversation.v2", sessionId: "session-1", continuation: `continuation-${continuations + 1}` };
    }
  };
  const firstController = new CompanyWorkController({ engine, declaration, steward, authorization });
  const first = await firstController.start({ intent: "First segment", idempotencyKey: "segment-1" });
  await engine.recordCompanyWorkEvent(declaration, first.id, { status: "completed", event: { id: "completed-1", type: "company_work_settled", summary: "Done.", streamIndex: 4, continuationToken: "continuation-after-first" } }, authorization);

  const restartedController = new CompanyWorkController({ engine, declaration, steward, authorization });
  const second = await restartedController.continue(first.id, "Second segment", { idempotencyKey: "segment-2" });
  const replay = await restartedController.continue(first.id, "Second segment", { idempotencyKey: "segment-2" });

  assert.notEqual(second.id, first.id);
  assert.equal(replay.id, second.id);
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(second.session.runtimeSessionId, "session-1");
  assert.equal(second.session.cursor, 4);
  assert.equal(starts, 1);
  assert.equal(continuations, 1);
  assert.deepEqual(continuedWith[0], { sessionId: "session-1", continuationToken: "continuation-after-first", continuation: "continuation-after-first", message: "Second segment" });
  const listed = await restartedController.list();
  assert.deepEqual(listed.map(run => run.conversationId), [first.conversationId, first.conversationId]);
  assert.equal(listed[0].status, "completed");
  assert.equal(listed[1].events.some(event => event.type === "agent_session_resumed"), true);
});


test("starting work cannot invent an Engine conversation identity", async () => {
  const engine = new OmniSeed({ store: new MemoryStateStore(), workStore: new MemoryCompanyWorkStore(), providers: new ProviderRegistry() });
  let starts = 0;
  const controller = new CompanyWorkController({ engine, declaration, steward: { start: async () => { starts++; } }, authorization });
  await assert.rejects(controller.start({intent: "Resume", conversationId: "unknown-conversation"}), error => error.code === "company_work_conversation_not_found");
  assert.equal(starts, 0);
});

test("submitted work is durably resumed after governed merge conditions pass", async () => {
  const run = { id: "work-1", status: "waiting_for_checks", events: [], associations: { proposalIds: ["proposal-1"], planIds: [] }, session: { runtimeSessionId: "session-1", continuation: "continue-1", cursor: 4 } };
  let resumedWith = null;
  const engine = {
    async getCompanyWork() { return structuredClone(run); },
    async getCompanyChangeProposal() { return { id: "proposal-1", status: "merged" }; },
    async invokeOperation(_declaration, operation, input) {
      if (operation === "continue_company_work") return run;
      if (operation === "get_company_work") return structuredClone(run);
      assert.fail("Unexpected operation " + operation + " " + JSON.stringify(input));
    },
    async recordCompanyWorkEvent(_declaration, _id, input) { run.events.push(input.event); return structuredClone(run); },
    async attachCompanyWorkSession() { return structuredClone(run); },
  };
  const steward = {
    async continue(input) { resumedWith = input; return { sessionId: "session-1", continuationToken: "continue-2", streamIndex: 4 }; },
    async read() { return { events: [] }; },
  };
  const controller = new CompanyWorkController({ engine, declaration, steward, authorization });
  await controller.advance(run.id);
  assert.equal(resumedWith.sessionId, "session-1");
  assert.match(resumedWith.message, /passed its governed merge conditions and is merged/);
  assert.match(resumedWith.message, /reconcile as policy permits, observe reality, and explain the evidence/);
});

test('input requests expose prompts and choices without runtime action payloads', async () => {
  const { projectRuntimeEvent } = await import('../src/company-work-controller.js');
  const event = projectRuntimeEvent({type:'input.requested', data:{requests:[{kind:'session-limit',requestId:'request-1',prompt:'Output budget reached. Continue?',options:[{id:'approve',label:'Approve',description:'Allow another bounded window.'},{id:'stop',label:'Stop'}],action:{input:{credential:'DO-NOT-EXPOSE'},toolName:'internal'}}]}}, 'session', 1);
  assert.match(event.summary,/Output budget reached/);
  assert.match(event.summary,/Approve/);
  assert.match(event.summary,/Stop/);
  assert.equal(JSON.stringify(event).includes('DO-NOT-EXPOSE'),false);
  assert.equal(JSON.stringify(event).includes('internal'),false);
  assert.equal(projectRuntimeEvent({type:'input.requested',data:{requests:[null,{}]}},'session',2).summary,'The steward needs input, but supplied no readable prompt.');
});
