const lifecycle = {
  unavailable: { state: "implementation_unavailable", failure: "implementation_unavailable", remediation: "install_implementation" },
  unconfigured: { state: "configuration_missing", failure: "configuration_missing", remediation: "configure_credential" },
  disconnected: { state: "not_connected", failure: "connection_unavailable", remediation: "configure_credential" },
  unhealthy: { state: "unhealthy", failure: "health_check_failed", remediation: "repair_provider" },
  healthy: { state: "healthy", failure: null, remediation: null }
};

/**
 * Add a browser-safe diagnostic view to the Engine inspection projection.
 * Provider truth remains the Engine's `providers` collection; this function
 * only links and labels that truth for people using the OS.
 */
export function withProviderDiagnostics(projection) {
  const providers = projection.providers ?? [];
  const diagnostics = providers.map(provider => diagnosticFor(provider, projection));
  return { ...projection, providerDiagnostics: diagnostics };
}

function diagnosticFor(provider, projection) {
  const installed = providersForId(projection, provider.providerId);
  const implementation = installed.find(item => item.families.includes(provider.family)) ?? installed[0] ?? null;
  const compatible = Boolean(implementation?.families.includes(provider.family));
  const alternatives = (projection.providerImplementations ?? [])
    .filter(item => item.id !== provider.providerId && item.families.includes(provider.family))
    .map(item => item.id);
  let mapped = lifecycle[provider.state] ?? { state: provider.state, failure: "provider_state_unknown", remediation: "inspect_provider" };
  if (implementation && !compatible) mapped = { state: "unsupported_primitive_family", failure: "unsupported_primitive_family", remediation: "fix_family_support" };
  const affectedCapabilities = (projection.capabilities ?? [])
    .filter(capability => capability.state !== "realised" && capability.requirements?.some(requirement => requirement.primitiveFamily === provider.family && !requirement.covered))
    .map(capability => ({ id: capability.id, name: capability.name }));
  const affectedRealisations = (projection.realisations ?? [])
    .filter(realisation => realisation.status !== "realised" && realisation.participants?.some(participant => participant.family === provider.family && participant.provider === provider.providerId))
    .map(realisation => ({ id: realisation.id, name: realisation.name }));
  const observation = latestObservation(projection, provider);
  return {
    providerId: provider.providerId,
    primitiveFamily: provider.family,
    scope: provider.scope,
    resourceId: provider.resourceId,
    desiredProvider: provider.providerId,
    implementation: implementation ? safeImplementation(implementation) : null,
    lifecycleState: mapped.state,
    engineState: provider.state,
    stages: {
      implementationAvailable: provider.implementation_available,
      configured: provider.configured,
      connected: provider.connected,
      healthy: provider.healthy
    },
    checkedAt: observation?.checkedAt ?? null,
    failureCategory: mapped.failure,
    reason: reasonFor(mapped.state, provider.providerId, provider.family, alternatives),
    evidence: observation ? [{ type: "provider_observation", source: observation.provider ?? provider.providerId, status: observation.status, checkedAt: observation.checkedAt }] : [],
    remediationCategory: mapped.remediation,
    availableImplementations: alternatives,
    affectedCapabilities,
    affectedRealisations
  };
}

function providersForId(projection, id) {
  return (projection.providerImplementations ?? []).filter(item => item.id === id);
}

function safeImplementation(value) {
  return {
    id: value.id,
    name: value.name ?? value.id,
    kind: value.kind ?? null,
    version: value.version ?? null,
    revision: value.revision ?? null,
    families: value.families
  };
}

function latestObservation(projection, provider) {
  const resources = new Set((projection.resources ?? [])
    .filter(resource => resource.family === provider.family && resource.provider === provider.providerId)
    .map(resource => resource.id));
  return (projection.observations ?? [])
    .filter(item => item.family === provider.family && resources.has(item.id) && item.checkedAt)
    .sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)))[0] ?? null;
}

function reasonFor(state, providerId, family, alternatives) {
  if (state === "healthy") return `${providerId} is configured, connected, and healthy for ${family}.`;
  if (state === "implementation_unavailable" && alternatives.length) return `${providerId} is selected for ${family}, but only other Provider implementations are installed.`;
  if (state === "implementation_unavailable") return `No installed ${providerId} implementation supports ${family}.`;
  if (state === "unsupported_primitive_family") return `The installed ${providerId} implementation does not claim support for ${family}.`;
  if (state === "configuration_missing") return `The ${providerId} implementation is installed for ${family}, but Engine reports it is not configured.`;
  if (state === "not_connected") return `The ${providerId} implementation is configured for ${family}, but Engine does not report a connection.`;
  if (state === "unhealthy") return `The ${providerId} implementation is connected for ${family}, but Engine reports it is unhealthy.`;
  return `Engine reports ${providerId} as ${state} for ${family}.`;
}
