const CONVERSATION = /^(?:hi|hello|hey|thanks|thank you|ok(?:ay)?|good (?:morning|afternoon|evening))[!.?\s]*$/i;
const COMPANY_QUERY = /\b(?:what company|which company|stewarding|attention|missing|gap|status|recent|activity|history|how is|provider|evidence|search|find|where|know)\b/i;
const COMPANY_WORK = /\b(?:generate|plan|apply|approve|change|replace|create|delete|deploy|operate|set up|realise|realize|fix|reconcile|observe|cancel)\b/i;

export const LilyExecutionClass = Object.freeze({
  CONVERSATION: "conversation",
  COMPANY_QUERY: "company_query",
  COMPANY_WORK: "company_work",
});

/** A conservative, deterministic boundary. Ambiguous intent stays on the durable path. */
export function classifyLilyInteraction(message = "") {
  const text = String(message).trim();
  if (CONVERSATION.test(text)) return { executionClass: LilyExecutionClass.CONVERSATION, reason: "bounded_conversation" };
  if (COMPANY_WORK.test(text)) return { executionClass: LilyExecutionClass.COMPANY_WORK, reason: "operational_intent" };
  if (COMPANY_QUERY.test(text) || text.endsWith("?")) return { executionClass: LilyExecutionClass.COMPANY_QUERY, reason: "bounded_read_intent" };
  return { executionClass: LilyExecutionClass.COMPANY_WORK, reason: "ambiguous_intent_requires_durable_boundary" };
}
