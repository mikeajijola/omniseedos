# Structured operations

Runtime operations are `getCompany`, `listCapabilities`, `getCapability`, `listGaps`, `getCurrentPlan`, `generatePlan`, `cancelPlan`, `getState`, `listActivity`, `listObservations`, `listFindings`, and `applyPlan`. Mutations require explicit definitions or authorization and approved change IDs. Human buttons, Eve tools, APIs, and machine commands call the same operations through an interchangeable transport.

Founding operations cover session start, intent submission, draft retrieval/refinement, item acceptance/rejection/edit/add/explain, validation, and authorized commit. The Found UI and Eve use these same transport methods. Eve may explain and refine but cannot bypass review or call commit.

`LiveTransport` calls the HTTP runtime. `FixtureTransport` preserves isolated frontend development and is intentionally read-only for apply. Components never contain fetch calls or capability-state calculation.

| Capability | Human | Software/AI | Embodied machine/controller |
| --- | --- | --- | --- |
| Generate plan | Plan button | Structured `generatePlan` tool | Same transport operation |
| Read observations/findings | Observe view or Eve | Structured read tool | Same transport operation/subscription |
| Apply approved changes | Approval/apply button | Authorized structured operation | Authorized structured operation |
