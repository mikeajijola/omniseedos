# OmniSeed OS architecture

One process serves one company by default, but the company exists independently of this optional interface. The company's declaration path, state path, Git revision binding, provider map and runtime registry are explicit deployment inputs. Every screen and steward response reads the engine's compiled capability registry. Provider and capability gaps are projected as structured runtime truth.

## Repository map

- `src/server.js` loads one Omniform company, chooses its state file, constructs OmniSeed, and starts the server.
- `src/app.js` maps HTTP requests to public OmniSeed methods and serves the site.
- `public/` renders company state and submits requests.
- `GovernedStewardClient` is the first-party reference client for the company-declared stewardship actor. Lily is one replaceable Agent resource, not an OS subsystem.
- `scripts/verify-distribution.mjs` checks the production package boundary without sibling source folders.

The browser may request a plan, but apply requires explicit approval and is delegated to OmniSeed. The declared steward, voice, richer semantic resolution, API clients, CLI clients and machines must enter through this same boundary. The UI discovers the stewardship realisation instead of hard-coding Lily.

Production installs versioned package artifacts. Sibling repository links are a development convenience only and are not part of the per-company deployment architecture.

Company Search is projected as the ordinary `company_search` Capability and governed `search_company` operation from the executable registry. The OS may display the capability realisation resolved by OmniSeed, but performs no Provider selection, composition, fallback, indexing authority, or result calculation. Search is company-scoped retrieval over replaceable primitive Providers, not a memory feature, special Provider class, or canonical state.

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

The OS forwards authorization and exact plan/approval objects. It does not reproduce engine policy.

## Process and distribution details

`OMNIFORM_PATH` selects the company declaration. `OMNISEED_STATE` selects the engine state file and defaults to `.omniseed/state.json`. `OMNISEED_DESIRED_REVISION`, `OMNISEED_ENVIRONMENT`, `OMNISEED_DEPLOYMENT_ID`, and `OMNISEED_DEPLOYMENT_PROVIDER` bind the replaceable OS deployment to the canonical company revision without defining company identity. `PORT` defaults to `4310`.

The reference server constructs an empty Provider registry. Desired Providers therefore remain visible as unavailable until the deployment explicitly installs and registers implementations. The OS never adds a fallback.

Production uses matching versioned `@omniseed/omniform`, `@omniseed/engine`, and `@omniseed/os` artifacts. `npm run test:distribution -- <omniform.tgz> <engine.tgz>` installs the artifacts into an isolated consumer and verifies that no sibling repository path is required.
