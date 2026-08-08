# ADR 0004: Adopt MichaelOS intelligence-on-tap interaction architecture for OmniSeed OS

- Status: accepted
- Date: 2026-08-08

## Context

MichaelOS demonstrates an interaction architecture in which Navi sits over the whole product instead of living on a chatbot page. Its application shell owns one persistent session shared by landing, bubble, panel, console, text, and voice surfaces. The browser supplies a safe capability map from one registry. Navi returns a schema-constrained proposal, clarification, or grounded response; it has no DOM or execution tools. The host validates proposals and entity references, invokes a shared executor, and creates a capability trace from actual executor events. Navigation is registered as presentation capability rather than embedded in individual pages. Voice submits to the same controller and cannot bypass policy.

OmniSeed OS needs this interaction model at company-control-plane scale. It must additionally support mutating operations, plans, authorization, providers, durable evidence, and capability re-evaluation.

## Decision

Adopt the interaction philosophy and relevant boundaries, without copying MichaelOS's visual design or browser-local company model:

1. Lily is the persistent `company_steward` available from every projected view.
2. OmniSeed's executable Capability Registry is the sole action map for Lily, UI, voice, CLI, API, and machine clients.
3. Semantic interpretation yields structured intent and at most a governed operation proposal. OmniSeed validates the operation, inputs, references, permissions, risk, and policy before execution.
4. Presentation operations may project or navigate views but never mutate company state.
5. Text and voice share the same Lily controller, company/UI context envelope, registry, policy, plan/apply boundary, results, and audit history.
6. Lily never receives provider credentials or provider SDK access. Approved concrete plans invoke providers through OmniSeed's deterministic executor.
7. Visible traces are built from registered operation and executor events. A route change or generated sentence is never evidence of success.
8. The shell owns session continuity across desktop and mobile; projected views remain replaceable consumers of runtime truth.

## Consequences

The home screen centres Lily, attention, capabilities, plans, and decisions. Advanced realisation objects remain inspectable through progressive disclosure. Components cannot invent company truth or semantic action metadata. Voice adapters can be replaced without creating a second intent or execution path. Provider apply success must be followed by observation, evidence, and capability recalculation before Lily reports realisation.

MichaelOS remains a reference implementation. OmniSeed OS uses OmniSeed transports and canonical runtime state rather than copying MichaelOS's browser executor, content registry, styling, or portfolio navigation.
