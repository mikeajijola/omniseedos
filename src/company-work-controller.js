const MUTATING_OPERATIONS = new Set(["propose_company_change", "apply_company_change", "merge_company_change", "apply_plan", "observe_company"]);

/**
 * Durable bridge between Engine-owned company work and Eve-owned semantic
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

  async start({ intent, idempotencyKey = null }) {
    const run = await this.engine.invokeOperation(this.declaration, "start_company_work", { intent, idempotencyKey }, this.authorization);
    if (run.session.id) return run;
    try {
      const session = await this.steward.start({ message: intent });
      await this.engine.attachCompanyWorkSession(this.declaration, run.id, { id: session.sessionId, continuationToken: session.continuationToken, streamIndex: session.streamIndex }, this.authorization);
      return this.engine.recordCompanyWorkEvent(this.declaration, run.id, {
        status: "running",
        event: { id: `${run.id}:eve-session`, type: "eve_session_started", summary: "Lily accepted the company work intent.", reference: session.sessionId, streamIndex: 0 },
      }, this.authorization);
    } catch (error) {
      await this.#fail(run.id, error);
      throw error;
    }
  }

  async inspect(workRunId, { advance = true } = {}) {
    if (advance) await this.advance(workRunId);
    return this.engine.invokeOperation(this.declaration, "get_company_work", { workRunId }, this.authorization);
  }

  async list() {
    return this.engine.invokeOperation(this.declaration, "list_company_work", {}, this.authorization);
  }

  async continue(workRunId, message) {
    const raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
    if (!raw.session.id || !raw.session.continuationToken) throw workError("company_work_session_unavailable", "The work run has no resumable Eve session.");
    await this.engine.invokeOperation(this.declaration, "continue_company_work", { workRunId, message }, this.authorization);
    try {
      const continued = await this.steward.continue({ sessionId: raw.session.id, continuationToken: raw.session.continuationToken, message });
      await this.engine.attachCompanyWorkSession(this.declaration, workRunId, { id: continued.sessionId, continuationToken: continued.continuationToken, streamIndex: raw.session.streamIndex }, this.authorization);
      return this.engine.invokeOperation(this.declaration, "get_company_work", { workRunId }, this.authorization);
    } catch (error) {
      await this.#fail(workRunId, error, "blocked");
      throw error;
    }
  }

  async cancel(workRunId) {
    const raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
    if (raw.session.id) await this.steward.cancel({ sessionId: raw.session.id, turnId: raw.session.turnId });
    return this.engine.invokeOperation(this.declaration, "cancel_company_work", { workRunId }, this.authorization);
  }

  async advance(workRunId) {
    let raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
    if (["completed", "failed", "blocked", "cancelled"].includes(raw.status) || !raw.session.id) return;
    raw = await this.#resumeApprovedWork(raw);
    const batch = await this.steward.read({ sessionId: raw.session.id, streamIndex: raw.session.streamIndex });
    if (!batch.events.length) return;
    let sawInputRequest = false;
    let sawBoundary = false;
    for (let index = 0; index < batch.events.length; index += 1) {
      const source = batch.events[index], projected = projectEveEvent(source, raw.session.id, raw.session.streamIndex + index);
      const associations = extractAssociations(source);
      const operationIds = extractOperationIds(source);
      sawInputRequest ||= source.type === "input.requested";
      sawBoundary ||= source.type === "session.waiting";
      const status = source.type === "session.failed" || source.type === "turn.failed" ? "failed" : undefined;
      await this.engine.recordCompanyWorkEvent(this.declaration, workRunId, {
        event: { ...projected, streamIndex: raw.session.streamIndex + index + 1, continuationToken: source.type === "session.waiting" ? source.data?.continuationToken : undefined },
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
      event: { id: `${run.id}:settled:${run.events.length}`, type: "company_work_settled", status, summary, streamIndex: run.session.streamIndex },
    }, this.authorization);
  }

  async #fail(workRunId, error, status = "failed") {
    try {
      const raw = await this.engine.getCompanyWork(this.declaration, workRunId, this.authorization, { includeRuntime: true });
      if (["completed", "failed", "cancelled"].includes(raw.status)) return;
      await this.engine.recordCompanyWorkEvent(this.declaration, workRunId, {
        status,
        event: { id: `${workRunId}:failure:${raw.events.length}`, type: "company_work_failed", status, summary: safeError(error), streamIndex: raw.session.streamIndex },
      }, this.authorization);
    } catch { /* Preserve the original runtime error. */ }
  }
}

export function projectEveEvent(event, sessionId, index) {
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
