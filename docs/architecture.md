# OmniSeed OS architecture

One process serves one company by default. The company's declaration path, state path, provider map and runtime registry are explicit deployment inputs. Every screen and Lily response reads the engine's compiled capability registry. Provider and capability gaps are projected as structured runtime truth.

## Repository map

- `src/server.js` loads one Omniform company, chooses its state file, constructs OmniSeed, and starts the server.
- `src/app.js` maps HTTP requests to public OmniSeed methods and serves the site.
- `public/` renders company state and submits requests.
- `LilyResolverReference` is a deterministic reference implementation for operation selection.
- `scripts/verify-distribution.mjs` checks the production package boundary without sibling source folders.

The browser may request a plan, but apply requires explicit approval and is delegated to OmniSeed. Voice, richer semantic resolution, API clients, CLI clients and machines must enter through this same boundary.

Production installs versioned package artifacts. Sibling repository links are a development convenience only and are not part of the per-company deployment architecture.

Company Search is projected through the executable registry. The OS performs no provider selection, search fallback, indexing authority or result calculation. Search is company-scoped retrieval over replaceable providers, not canonical state.

## HTTP boundary

`src/app.js` currently exposes these routes:

| Endpoint | Purpose | Authority |
| --- | --- | --- |
| `GET /api/company` | Read compiled company state and gaps | `engine.inspect()` |
| `POST /api/plan` | Create and persist a proposed plan | `engine.plan()` |
| `POST /api/approve` | Bind approval to a plan and chosen actions | `engine.approve()` |
| `POST /api/apply` | Apply the reviewed plan | `engine.apply()` |
| `POST /api/search` | Search governed company knowledge | registered `search_company` operation |
| `POST /api/lily` | Resolve a message against available operations | compiled operation registry |
| `GET /api/company-changes` | Project persisted proposals | `engine.inspect()` |
| `POST /api/company-changes/propose` | Create an evidence-backed exact proposal | `propose_company_change` operation |
| `POST /api/company-changes/:id/preview` | Validate and compare current/candidate definitions | `engine.previewCompanyChange()` |
| `POST /api/company-changes/:id/approve` | Approve the exact proposal hash | `approve_company_change` operation |
| `POST /api/company-changes/:id/reject` | Reject a proposal | `reject_company_change` operation |
| `POST /api/company-changes/:id/apply` | Apply the persisted approved change | `apply_company_change` operation |

The OS forwards authorization and exact plan/approval objects. It does not reproduce engine policy.

The Company Changes projection shows proposer, rationale, evidence-reference count, mutation paths, and lifecycle status from engine state. Lily may select and invoke the same proposal operation as another authorised actor. Her reasoning remains separate from referenced observations, and approval never implies automatic apply.

## Process and distribution details

`OMNIFORM_PATH` selects the company declaration. `OMNISEED_STATE` selects the engine state file and defaults to `.omniseed/state.json`. `PORT` defaults to `4310`.

The reference server constructs an empty Provider registry. Desired Providers therefore remain visible as unavailable until the deployment explicitly installs and registers implementations. The OS never adds a fallback.

Production uses matching versioned `@omniseed/omniform`, `@omniseed/engine`, and `@omniseed/os` artifacts. `npm run test:distribution -- <omniform.tgz> <engine.tgz>` installs the artifacts into an isolated consumer and verifies that no sibling repository path is required.
