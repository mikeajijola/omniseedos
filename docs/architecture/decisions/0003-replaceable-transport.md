# ADR 0003: OmniSeed transport is replaceable

- Status: Accepted

## Decision

Routes and Eve depend on the `OmniSeedTransport` domain interface. `LiveTransport` uses the real HTTP runtime; `FixtureTransport` supplies deterministic isolated development.

## Consequences

Hosted, customer-hosted, embedded, test, AI, and future machine clients can use the same operations. UI code neither imports Core internals nor calculates organisational truth.
