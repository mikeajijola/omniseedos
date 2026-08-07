export function canInvoke(operation,actor,authorization){return authorization?.actor===actor.id&&authorization?.operations?.includes(operation)}
