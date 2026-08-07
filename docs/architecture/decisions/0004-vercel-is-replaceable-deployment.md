# ADR 0004: Vercel is replaceable deployment/provider infrastructure

- Status: Accepted

## Context

OmniSeed OS needs a public review environment, while the current durable runtime uses local file state that is unsuitable for an ephemeral serverless filesystem.

## Decision

Host a static read-only DemoTransport build on Vercel for visual feedback. Local live mode continues to use the real OmniSeed runtime. Transport resolution is centralized and components remain platform-neutral. Vercel is not organisational truth and may be replaced by Azure, AWS, customer-controlled, local, or self-contained hosting.

A future Vercel provider belongs behind the OmniSeed provider contract. Hosting OmniSeed OS on Vercel is not that provider implementation.

## Consequences

The public deployment truthfully labels demo mode and disables mutations. No serverless filesystem is presented as durable state. Production live hosting will require a reachable OmniSeed runtime backed by a genuinely durable StateStore.
