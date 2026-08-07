# ADR 0007: Project one SQLite-first runtime

## Status

Accepted.

## Decision

OmniSeed OS uses LiveTransport to project one OmniSeed runtime. Local runtime state lives in one SQLite database; hosted state uses the same relational contracts through a SQLite-compatible remote adapter. Demo and fixture transports remain non-persistent development modes.

The OS and Lily do not own a database, cache, queue, event bus, or memory service. They discover and invoke registered OmniSeed operations. Vercel and the hosted database vendor remain replaceable deployment choices.

## Consequences

Runtime status and access level are distinct: a live durable runtime may give an anonymous visitor read-only authority. The browser never receives database or provider credentials.
