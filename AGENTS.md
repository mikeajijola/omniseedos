# Agent instructions

OmniSeed OS renders and exposes capabilities; it does not own Company-as-Code truth. Read the README and applicable ADRs.

- Consume OmniSeed plans, calculated capability state, evidence, drift, findings, and events. Do not recreate that logic in components.
- Capabilities are primary; resources are actor implementations. Human UI is one interface, not the canonical capability.
- Eve cannot mutate storage or bypass planning, policy, authorization, or apply.
- Every meaningful action needs a structured operation suitable for humans, software/AI, and future embodied machines.
- UI routes depend on `OmniSeedTransport`; never put direct fetch calls in components.
- Missing capability states must be understandable and actionable, never hidden.
- Preserve keyboard, screen-reader, voice, API, and machine use; avoid hover-, drag-, position-, or mouse-only actions.
- Keep fixtures deterministic and free of secrets/personal data.
- Founding UI edits proposal workflow state only; canonical company creation must use authorized `commitFoundingDraft` through LiveTransport.
- Resolve live, fixture, and demo modes centrally; components must not inspect Vercel or deployment environment variables.
- Never treat Vercel's ephemeral filesystem as durable OmniSeed state or put Vercel semantics into portable Company-as-Code.
- Make the smallest coherent change; update tests, fixtures, docs, and examples. Run `npm run lint && npm test && npm run build` and report evidence.
