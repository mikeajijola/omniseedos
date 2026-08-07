# 0006 — Interfaces project the Omniform registry

Status: accepted

## Decision

OmniSeed OS, Lily, CLI/API clients, and future machine controllers project the executable registry compiled by OmniSeed from Omniform. OS generic operation primitives consume registry labels, descriptions, schemas, availability, permissions, mutation, approval, and risk; they do not define those semantics.

Specialized views and routes remain presentation-owned. Lily resolves intent only against dynamically discovered operations. Presentation operations may select an OS view but cannot alter organisational state.

## Consequences

The OS fixture/demo catalogue is a checked materialization of Omniform. Missing handlers or read-only policy remain visible through `OperationUnavailable`. A semantic operation change begins in Omniform and is regenerated downstream.
