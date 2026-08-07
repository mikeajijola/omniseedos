# Agent instructions

OmniSeed OS renders and exposes capabilities; it does not own Company-as-Code truth. Read the README and applicable ADRs.

- Consume OmniSeed plans, calculated capability state, evidence, drift, findings, and events. Do not recreate that logic in components.
- Capabilities are primary; resources are actor implementations. Human UI is one interface, not the canonical capability.
- Do not introduce a resource abstraction that competes with Capability. Agents, skills, connectors, workflows, schedules, providers, people, partners, and machines are progressively disclosed realisations.
- Natural language resolves to structured capability intent. Lily never invokes provider SDKs, and the OS never calculates requirement coverage.
- Lily is the default display identity for the persistent `company_steward`; renaming the presentation must not change authority or audit identity. Lily cannot mutate storage or bypass planning, policy, authorization, or apply.
- Every meaningful action needs a structured operation suitable for humans, software/AI, and future embodied machines.
- Operation schemas, permissions, mutation, approval, risk, and interface metadata derive from the OmniSeed registry compiled from Omniform. OS primitives project them; never create an independent semantic action catalogue.
- UI routes depend on `OmniSeedTransport`; never put direct fetch calls in components.
- Missing capability states must be understandable and actionable, never hidden.
- Preserve keyboard, screen-reader, voice, API, and machine use; avoid hover-, drag-, position-, or mouse-only actions.
- Keep fixtures deterministic and free of secrets/personal data.
- Founding UI edits proposal workflow state only; canonical company creation must use authorized `commitFoundingDraft` through LiveTransport.
- Resolve live, fixture, and demo modes centrally; components must not inspect Vercel or deployment environment variables.
- Never treat Vercel's ephemeral filesystem as durable OmniSeed state or put Vercel semantics into portable Company-as-Code.
- Hosted pages use same-origin LiveTransport and server-derived actor authority. Never expose store/provider credentials or trust browser-supplied permissions.
- Make the smallest coherent change; update tests, fixtures, docs, and examples. Run `npm run lint && npm test && npm run build` and report evidence.
