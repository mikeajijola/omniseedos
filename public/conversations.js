export function conversationIdFor(run) {
  return run.conversationId ?? run.session?.id ?? run.id;
}

export function groupConversations(runs) {
  const groups = new Map();
  for (const run of runs) {
    const id = conversationIdFor(run);
    if (!groups.has(id)) groups.set(id, { id, runs: [] });
    groups.get(id).runs.push(run);
  }
  return [...groups.values()];
}

export function conversationEvents(conversation, currentRun = null) {
  if (!conversation) return currentRun?.events ?? [];
  const includesCurrent = currentRun && conversation.runs.some(run => run.id === currentRun.id);
  const runs = includesCurrent ? conversation.runs : [...conversation.runs, ...(currentRun ? [currentRun] : [])];
  return runs.flatMap(run => (run.id === currentRun?.id ? currentRun : run).events ?? []);
}
