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
