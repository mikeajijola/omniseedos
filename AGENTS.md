# Working in OmniSeed OS

OmniSeed OS is a thin, per-company projection layer over the OmniSeed engine. Keep the UI, API, and Lily honest reflections of the compiled registry rather than parallel sources of business or runtime logic.

## Repository responsibilities

- `src/server.js` loads one validated Omniform declaration, selects one state path, constructs the engine, and starts the process.
- `src/app.js` maps HTTP requests to public engine methods and serves static assets.
- `public/` renders the compiled company/capability view and submits governed requests.
- `LilyResolverReference` demonstrates operation selection from registry truth; richer resolvers may improve language understanding but cannot bypass availability or authorization.
- `scripts/verify-distribution.mjs` protects the versioned-package deployment boundary.

Do not implement schema validation rules, capability resolution, provider selection/status, plan hashing, approval policy, apply logic, observations, or search ranking here. Those belong upstream.

## Ecosystem contract

- [Omniform](https://github.com/mikeajijola/omniform) owns desired company syntax and semantics through `@omniseed/omniform`.
- [OmniSeed](https://github.com/mikeajijola/omniseed) owns runtime truth and mutations through `@omniseed/engine`.
- OS consumes both public packages; neither upstream repository may depend on OS.
- Dependency direction is `omniform → omniseed → omniseedos`. Production uses compatible versioned artifacts, not sibling `file:` dependencies.

When Omniform changes, update OS declaration fixtures only after the engine supports the new contract. When the engine registry/API changes, update routes, renderers, error mappings, and distribution tests together. UI labels may summarize registry fields but must retain the underlying stable IDs for actions and audit references.

## Runtime and security invariants

- One OS process and all of its declaration, state, operations, providers, and search requests are isolated to one company by default.
- Every screen and Lily result derives from the current compiled registry; never infer health from a declaration or cache a conflicting truth.
- Plan creation, approval, and apply remain separate calls. Forward exact plans/approvals and authorization; never regenerate, broaden selected actions, or auto-approve in OS.
- Preserve engine error codes such as authorization failure and stale plan as distinct client-visible outcomes.
- Lily/UI/API invoke registered OmniSeed operations, never provider adapters or vendor APIs.
- Missing/unhealthy providers and unimplemented operations remain visible; do not hide gaps with fallback behaviour.
- Company Search is governed retrieval, not canonical truth. Preserve company isolation and provider-neutral result/provenance fields.
- Never expose credentials, provider configuration secrets, raw state files, or filesystem paths through the browser API.

Run `npm test` after changes. Run the distribution test for dependency, export, packaging, or release changes. Add request-level tests for authorization, error status mapping, company isolation, unavailable operations, and the exact engine method delegation whenever routes change.
