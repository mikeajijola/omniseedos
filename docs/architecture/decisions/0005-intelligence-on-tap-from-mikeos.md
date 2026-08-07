# 0005 — Adopt intelligence-on-tap interaction architecture from MikeOS

Status: accepted

## Context

MikeOS makes Navi an intelligence layer through a persistent session, registry-derived action discovery, schema-constrained proposals, validation before execution, context-aware projected views, shared text/voice input, and traces built from real executor results. OmniSeed OS needs the same accessibility without copying MikeOS's personal-site visual design or read-only authority model.

## Decision

Lily is the persistent presentation identity for the `company_steward` control plane. Lily receives only operations discovered from OmniSeed's registry, produces structured intent, requests existing transport operations, and projects the relevant UI context. Text and browser voice share one interaction state and transcript. Manual navigation remains available.

Unlike Navi, Lily operates in an organisational governance domain. Any mutation still crosses plan, policy, authorization, provider, evidence, and audit boundaries. Lily has no vendor SDK, storage mutation, or hidden capability implementation.

## Consequences

- Human, software/AI, CLI, and controller interfaces discover the same operations.
- Ambiguous destructive requests require clarification.
- “Lily” can be renamed without changing operational identity.
- The public demo can explain and project actions but cannot claim persistence.
- Voice availability depends on browser Web Speech support; text remains the accessible equivalent.
