/** Adapter hook for a replaceable semantic Agent runtime. Tool execution stays server-side. */
export class SemanticStewardClient {
  constructor({ runtime, maxToolRounds = 6 }) { this.runtime = runtime; this.maxToolRounds = maxToolRounds; }
  async handle({ message, engine, declaration, authorization }) {
    const bootstrap = { companyId: declaration.metadata.id, actorId: authorization.actorId };
    let transcript = [];
    for (let round = 0; round < this.maxToolRounds; round += 1) {
      const result = await this.runtime.respond({ message, bootstrap, transcript });
      if (!result?.toolCall) return { status: "completed", operationId: result?.operationId ?? null, message: result?.message ?? "The steward runtime returned no answer." };
      const { operationId, input = {} } = result.toolCall;
      const output = await engine.invokeOperation(declaration, operationId, input, authorization);
      transcript = [...transcript, { toolCall: { operationId, input }, output }];
    }
    return { status: "failed", operationId: null, message: "The steward exceeded the governed tool-call limit." };
  }
}
