export function parseProtocolProviders(value) {
  if (!value) return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error("OMNISEED_PROTOCOL_PROVIDERS must be valid JSON."); }
  if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item.id !== "string" || typeof item.command !== "string")) {
    throw new Error("OMNISEED_PROTOCOL_PROVIDERS must be an array of Provider id and command entries.");
  }
  return parsed;
}
