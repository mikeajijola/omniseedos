/** Adapter hook for a replaceable semantic Agent runtime. Tool execution stays server-side. */
export class SemanticStewardClient {
  constructor({ runtime, maxToolRounds = 6, maxQueryToolRounds = 2 }) { this.runtime = runtime; this.maxToolRounds = maxToolRounds; this.maxQueryToolRounds = maxQueryToolRounds; }
  async handle({ message, engine, declaration, authorization, executionClass = "company_work" }) {
    const bootstrap = { companyId: declaration.metadata.id, actorId: authorization.actorId };
    let transcript = [];
    const limit = executionClass === "conversation" ? 0 : executionClass === "company_query" ? this.maxQueryToolRounds : this.maxToolRounds;
    if (executionClass === "conversation") {
      const result = await this.runtime.respond({ message, bootstrap, transcript, profile: { executionClass, reasoning: "minimal", toolLimit: 0 } });
      return { status: "completed", operationId: null, message: result?.message ?? "Hello. How can I help?" };
    }
    for (let round = 0; round < limit; round += 1) {
      const result = await this.runtime.respond({ message, bootstrap, transcript, profile: { executionClass, reasoning: executionClass === "company_query" ? "concise" : "full", toolLimit: limit } });
      if (!result?.toolCall) return { status: "completed", operationId: result?.operationId ?? null, message: result?.message ?? "The steward runtime returned no answer." };
      const { operationId, input = {} } = result.toolCall;
      const output = await engine.invokeOperation(declaration, operationId, input, authorization);
      transcript = [...transcript, { toolCall: { operationId, input }, output }];
    }
    return { status: "failed", operationId: null, message: `The steward exceeded the governed ${executionClass === "company_query" ? "query" : "work"} tool-call limit.` };
  }
}
