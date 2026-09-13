const MUTATING_OPERATIONS = new Set(["propose_company_change", "apply_company_change", "merge_company_change", "apply_plan", "observe_company"]);

/**
 * Durable bridge between Engine-owned company work and runtime-owned semantic
 * execution. It stores only safe event projections in OmniSeed; the raw model
 * stream and hidden reasoning remain Eve implementation state.
 */
export class CompanyWorkController {
  constructor({ engine, declaration, steward, authorization }) {
    this.engine = engine;
    this.declaration = declaration;
    this.steward = steward;
    this.authorization = authorization;
  }

  async start({ intent, idempotencyKey = null, conversationId = null }) {
    const run = await this.engine.invokeOperation(this.declaration, "start_company_work", { intent, idempotencyKey, conversationId }, this.authorization);
    // A matching idempotency key returns the existing work run. Never send the
    // intent to the Agent runtime again or try to reopen a terminal Engine run.
    if (run.session?.runtimeSessionId || run.session?.id) return withConversationId(run);
    try {
      const durableConversationId = typeof conversationId === "string" && conversationId.trim() ? conversationId.trim() : run.id;
      const previousSession = await this.#conversationSession(durableConversationId, run.id);
      await this.engine.recordCompanyWorkEvent(this.declaration, run.id, {
        event: { id: `${run.id}:conversation`, type: "company_work_conversation_associated", summary: "This work segment belongs to a durable conversation.", reference: durableConversationId },
      }, this.authorization);
      await this.#recordUserMessage(run.id, intent, `${run.id}:user:0`);
      const session = previousSession
        ? await this.steward.continue(runtimeContinueInput(previousSession, intent))
        : await this.steward.start({ message: intent, idempotencyKey });
      const association = runtimeAssociation(session, previousSession ?? {});
      await this.engine.attachCompanyWorkSession(this.declaration, run.id, association, this.authorization);
      return withConversationId(await this.engine.recordCompanyWorkEvent(this.declaration, run.id, {
        status: "running",
        event: {
          id: `${run.id}:agent-session`,
          type: previousSession ? "agent_session_resumed" : "agent_session_started",
          summary: previousSession ? "The declared steward resumed this durable conversation." : "The declared steward accepted the company work intent.",
          reference: association.runtimeSessionId,
          cursor: association.cursor,
          streamIndex: association.streamIndex,
        },
      }, this.authorization));
    } catch (error) {
      await this.#fail(run.id, error);
      throw error;
    }
  }

  async inspect(workRunId, { advance = true } = {}) {
    if (advance) await this.advance(workRunId);
    return withConversationId(await this.engine.invokeOperation(this.declaration, "get_company_work", { workRunId }, this.authorization));
  }

  async list() {
    return (await this.engine.invokeOperation(this.declaration, "list_company_work", {}, this.authorization)).map(run => withConversationId(run));
  }

  async continue(workRunId, message, { idempotencyKey = null } = {}) {
    const raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
    if (["completed", "failed", "blocked", "cancelled"].includes(raw.status)) {
      if (raw.status === "completed") return this.start({ intent: message, conversationId: conversationIdFrom(raw), idempotencyKey });
      throw workError("company_work_invalid_state", `The ${raw.status} work segment cannot continue.`);
    }
    if (!(raw.session?.runtimeSessionId || raw.session?.id) || runtimeContinuation(raw.session) == null) throw workError("company_work_session_unavailable", "The work segment has no resumable Agent session.");
    await this.engine.invokeOperation(this.declaration, "continue_company_work", { workRunId, message }, this.authorization);
    try {
      await this.#recordUserMessage(workRunId, message, `${workRunId}:user:${raw.events.length}`);
      const continued = await this.steward.continue(runtimeContinueInput(raw.session, message));
      await this.engine.attachCompanyWorkSession(this.declaration, workRunId, runtimeAssociation(continued, raw.session), this.authorization);
      return withConversationId(await this.engine.invokeOperation(this.declaration, "get_company_work", { workRunId }, this.authorization));
    } catch (error) {
      await this.#fail(workRunId, error, "blocked");
      throw error;
    }
  }

  async cancel(workRunId) {
    const raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
    if (raw.session?.runtimeSessionId || raw.session?.id) await this.steward.cancel({ sessionId: raw.session.runtimeSessionId ?? raw.session.id, turnId: raw.session.turnId });
    return this.engine.invokeOperation(this.declaration, "cancel_company_work", { workRunId }, this.authorization);
  }

  async advance(workRunId) {
    let raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
    if (["completed", "failed", "blocked", "cancelled"].includes(raw.status) || !(raw.session?.runtimeSessionId || raw.session?.id)) return;
    raw = await this.#resumeApprovedWork(raw);
    const sessionId = raw.session.runtimeSessionId ?? raw.session.id;
    const cursor = raw.session.cursor ?? raw.session.streamIndex ?? 0;
    const batch = await this.steward.read({ sessionId, streamIndex: cursor, cursor });
    if (!batch.events.length) return;
    let sawInputRequest = false;
    let sawBoundary = false;
    for (let index = 0; index < batch.events.length; index += 1) {
      const source = batch.events[index], projected = projectRuntimeEvent(source, sessionId, cursor + index);
      const associations = extractAssociations(source);
      const operationIds = extractOperationIds(source);
      sawInputRequest ||= source.type === "input.requested";
      sawBoundary ||= source.type === "session.waiting";
      const status = source.type === "session.failed" || source.type === "turn.failed" ? "failed" : undefined;
      await this.engine.recordCompanyWorkEvent(this.declaration, workRunId, {
        event: { ...projected, cursor: cursor + index + 1, streamIndex: cursor + index + 1, continuation: source.type === "session.waiting" ? source.data?.continuationToken : undefined, continuationToken: source.type === "session.waiting" ? source.data?.continuationToken : undefined },
        associations,
        mutation: operationIds.some(operationId => this.#isMutation(operationId)),
        ...(status ? { status } : {}),
      }, this.authorization);
    }
    if (sawBoundary) await this.#settle(workRunId, { sawInputRequest });
  }

  #isMutation(operationId) {
    return MUTATING_OPERATIONS.has(operationId) || this.declaration.spec.operations.find(item => item.id === operationId)?.mutation === true;
  }

  async #settle(workRunId, { sawInputRequest }) {
    const raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
    if (["failed", "cancelled"].includes(raw.status)) return;
    if (sawInputRequest) return this.#recordStatus(raw, "waiting_for_input", "Lily requires additional operator input.");
    const proposalId = raw.associations.proposalIds.at(-1);
    if (proposalId) {
      const proposal = await this.engine.getCompanyChangeProposal(this.declaration, proposalId, this.authorization);
      if (["proposed", "approved"].includes(proposal.status)) return this.#recordStatus(raw, "waiting_for_company_approval", `Company Change ${proposalId} is ${proposal.status}.`);
      if (proposal.status === "submitted") return this.#recordStatus(raw, "waiting_for_checks", `Company Change ${proposalId} is awaiting governed merge conditions.`);
      if (proposal.status === "merged") return this.#recordStatus(raw, "observing", `Company Change ${proposalId} merged; observation is required.`);
      if (["rejected", "stale"].includes(proposal.status)) return this.#recordStatus(raw, "blocked", `Company Change ${proposalId} is ${proposal.status}.`);
    }
    const planId = raw.associations.planIds.at(-1);
    if (planId) {
      const plan = await this.engine.getPlan(this.declaration, planId, this.authorization);
      if (["pending", "approved"].includes(plan.status)) return this.#recordStatus(raw, "waiting_for_company_approval", `Reconciliation plan ${planId} is ${plan.status}.`);
    }
    return this.#recordStatus(raw, "completed", "Lily completed the current company work intent.");
  }

  async #resumeApprovedWork(raw) {
    if (raw.status !== "waiting_for_company_approval" && raw.status !== "observing") return raw;
    const proposalId = raw.associations.proposalIds.at(-1);
    if (proposalId) {
      const proposal = await this.engine.getCompanyChangeProposal(this.declaration, proposalId, this.authorization);
      if (raw.status === "waiting_for_company_approval" && proposal.status === "approved") {
        await this.continue(raw.id, `OmniSeed governance event: Company Change ${proposalId} now has an independent exact approval. Continue through ordinary governed operations; do not approve anything yourself.`);
      } else if (raw.status === "observing" && proposal.status === "merged") {
        await this.continue(raw.id, `OmniSeed governance event: Company Change ${proposalId} is merged. Resolve the new desired revision, reconcile as policy permits, observe reality, and explain the evidence.`);
      }
      return this.engine.getCompanyWork(this.declaration, raw.id, this.authorization, { includeRuntime: true });
    }
    const planId = raw.associations.planIds.at(-1);
    if (planId && raw.status === "waiting_for_company_approval") {
      const plan = await this.engine.getPlan(this.declaration, planId, this.authorization);
      if (plan.status === "approved") await this.continue(raw.id, `OmniSeed governance event: reconciliation plan ${planId} now has an independent exact approval. Continue using only that persisted plan and approval.`);
    }
    return this.engine.getCompanyWork(this.declaration, raw.id, this.authorization, { includeRuntime: true });
  }

  async #recordStatus(run, status, summary) {
    if (run.status === status) return;
    await this.engine.recordCompanyWorkEvent(this.declaration, run.id, {
      status,
      summary,
      event: { id: `${run.id}:settled:${run.events.length}`, type: "company_work_settled", status, summary, cursor: run.session.cursor ?? run.session.streamIndex, streamIndex: run.session.cursor ?? run.session.streamIndex },
    }, this.authorization);
  }

  async #recordUserMessage(workRunId, message, id) {
    await this.engine.recordCompanyWorkEvent(this.declaration, workRunId, {
      event: { id, type: "user_message", summary: message },
    }, this.authorization);
  }

  async #conversationSession(conversationId, excludingRunId) {
    const runs = await this.engine.invokeOperation(this.declaration, "list_company_work", {}, this.authorization);
    const previous = [...runs].reverse().find(item => item.id !== excludingRunId && conversationIdFrom(item) === conversationId && (item.session?.runtimeSessionId || item.session?.id));
    if (!previous) return null;
    const raw = await this.engine.getCompanyWork(this.declaration, previous.id, this.authorization, { includeRuntime: true });
    return runtimeContinuation(raw.session) == null ? null : raw.session;
  }

  async #fail(workRunId, error, status = "failed") {
    try {
      const raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
      if (["completed", "failed", "cancelled"].includes(raw.status)) return;
      await this.engine.recordCompanyWorkEvent(this.declaration, workRunId, {
        status,
        event: { id: `${workRunId}:failure:${raw.events.length}`, type: "company_work_failed", status, summary: safeError(error), cursor: raw.session?.cursor ?? raw.session?.streamIndex ?? 0 },
      }, this.authorization);
    } catch { /* Preserve the original runtime error. */ }
  }
}

export function projectRuntimeEvent(event, sessionId, index) {
  const operationIds = extractOperationIds(event);
  const result = event.data?.result;
  const summary = event.type === "message.completed" ? event.data?.message
    : event.type === "actions.requested" ? `Lily requested ${operationIds.join(", ") || "runtime work"}.`
    : event.type === "action.result" ? `${result?.toolName ?? "Runtime action"} ${event.data?.status ?? "completed"}.`
    : event.type === "input.requested" ? "Lily requested operator input."
    : event.type === "session.waiting" ? "Lily's durable Eve session is waiting."
    : event.type === "session.failed" || event.type === "turn.failed" ? safeError(event.data?.error ?? event.data)
    : null;
  return {
    id: event.meta?.id ?? `${sessionId}:${index}`,
    type: mapEventType(event.type),
    at: event.meta?.at,
    summary,
    operationId: operationIds[0] ?? result?.toolName,
    status: event.data?.status,
    turnId: event.meta?.turnId ?? event.data?.turnId,
  };
}
export const projectEveEvent = projectRuntimeEvent;

export function withConversationId(run) {
  return { ...run, conversationId: conversationIdFrom(run) };
}

function conversationIdFrom(run) {
  return run.conversationId ?? run.events?.find(event => event.type === "company_work_conversation_associated")?.reference ?? run.id;
}

function runtimeContinuation(session) { return session?.continuation ?? session?.continuationToken; }
function runtimeAssociation(session, existing = {}) {
  const association = {
    protocolId: session.protocol ?? session.protocolId ?? existing.protocolId ?? "eve.session.v1",
    runtimeSessionId: session.sessionId ?? session.runtimeSessionId ?? existing.runtimeSessionId ?? existing.id,
    cursor: session.cursor ?? session.streamIndex ?? existing.cursor ?? existing.streamIndex ?? 0,
    continuation: session.continuation ?? session.continuationToken ?? runtimeContinuation(existing),
    turnId: session.turnId ?? existing.turnId
  };
  // Remove after all deployed Engines have migrated their durable Eve records.
  return { ...association, id: association.runtimeSessionId, streamIndex: association.cursor, continuationToken: association.continuation };
}
function runtimeContinueInput(session, message) {
  return { sessionId: session.runtimeSessionId ?? session.id, continuationToken: runtimeContinuation(session), continuation: runtimeContinuation(session), message };
}

function extractOperationIds(event) {
  if (event.type === "actions.requested") return (event.data?.actions ?? []).filter(item => item.kind === "tool-call").map(item => item.toolName).filter(Boolean);
  if (event.type === "action.result" && event.data?.result?.kind === "tool-result") return [event.data.result.toolName].filter(Boolean);
  return [];
}

function extractAssociations(event) {
  if (event.type !== "action.result" || event.data?.result?.kind !== "tool-result" || event.data.status !== "completed") return {};
  const operationId = event.data.result.toolName, output = event.data.result.output;
  const proposal = output?.proposal ?? (/company_change/.test(operationId) ? output : null);
  const plan = output?.plan ?? (/plan/.test(operationId) ? output : null);
  const evidence = output?.evidence ?? output?.registry?.evidence ?? [];
  return {
    proposalIds: proposal?.id ? [proposal.id] : [],
    planIds: plan?.id ? [plan.id] : [],
    evidenceIds: Array.isArray(evidence) ? evidence.map(item => typeof item === "string" ? item : item?.id).filter(Boolean) : [],
  };
}

function mapEventType(type) {
  return ({ "turn.started": "agent_turn_started", "message.completed": "assistant_message", "actions.requested": "operation_requested", "action.result": "operation_result", "input.requested": "operator_input_requested", "session.waiting": "agent_session_waiting", "session.failed": "agent_session_failed", "turn.failed": "agent_turn_failed" })[type] ?? `eve_${String(type).replaceAll(".", "_")}`;
}
function safeError(error) { return String(error?.message ?? error?.code ?? "The semantic runtime could not continue.").slice(0, 2_000); }
function workError(code, message) { return Object.assign(new Error(message), { code }); }
