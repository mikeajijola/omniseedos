# OmniSeed OS

OmniSeed OS is the per-company operating experience for the OmniSeed ecosystem. It presents one company's compiled capability registry through a browser UI, HTTP API, and Lily entry point while delegating runtime truth and every controlled mutation to the OmniSeed engine.

One process represents one company by default. Its declaration path, state path, provider registry, and compiled operation registry are explicit deployment inputs. It is not a shared central control plane and is not an independent source of desired or operational truth.

## Place in the ecosystem

```text
Omniform                         OmniSeed                         OmniSeed OS
declares the company       →    runs the company contract   →   presents one company
schema + desired intent         state + providers + control      UI + API + Lily
```

- [Omniform](https://github.com/mikeajijola/omniform) provides `@omniseed/omniform`, the canonical schema/parser for the configured declaration. OS must not extend that declaration with view state or infer runtime status from desired fields.
- [OmniSeed](https://github.com/mikeajijola/omniseed) provides `@omniseed/engine`, the authoritative compiler, registry, provider-gap projection, authorization, and plan/approve/apply flow. OS routes requests to it rather than recreating those decisions.

Production installs all three as matching versioned package artifacts. Sibling repositories are useful for coordinated development, but a deployed company does not require their source trees.

## Current interface

`src/app.js` serves the static experience and these API boundaries:

| Endpoint | Purpose | Authority |
| --- | --- | --- |
| `GET /api/company` | Compiled capabilities, operations, and gaps | `engine.inspect()` |
| `POST /api/plan` | Persist a deterministic proposed plan | `engine.plan()` + actor permission |
| `POST /api/approve` | Bind approval to plan hash/actions | `engine.approve()` + actor permission |
| `POST /api/apply` | Apply the reviewed plan | `engine.apply()` + approval/authorization |
| `POST /api/search` | Search governed company knowledge | registered `search_company` operation |
| `POST /api/lily` | Resolve a message to an available operation | compiled operation registry |

`LilyResolverReference` is deliberately deterministic and narrow. It selects only declared, implemented, currently available, and authorized operations; otherwise it returns clarification, unsupported, or unauthorized. It never calls a provider directly. Richer semantic or voice clients must preserve the same operation boundary.

## Quick start

Requires Node.js 22 or newer. With the three repositories checked out as siblings:

```sh
npm install
npm test
OMNIFORM_PATH=../omniform/examples/company.omniform.yaml npm start
```

Open `http://localhost:4310`. Configuration:

- `OMNIFORM_PATH` selects the one company's YAML/JSON declaration.
- `OMNISEED_STATE` selects its engine state file (default `.omniseed/state.json`).
- `PORT` selects the HTTP port (default `4310`).

The reference server intentionally creates an empty provider registry. This truthfully exposes desired providers as unavailable until the deployment explicitly installs and registers implementations. A real deployment should construct the engine with that company's provider adapters; OS must not add automatic fallbacks.

## Packaging and boundaries

Run `npm run test:distribution -- <omniform.tgz> <engine.tgz>` to pack OS, install all three artifacts in an isolated consumer, and verify the public import without sibling paths. Production dependencies must remain versioned and must not use `file:../...`.

Company Search is exposed only through `search_company` and `/api/search`. Results and provider gaps originate in OmniSeed runtime truth and remain scoped to this instance's company. OS does not select a search provider, calculate results, own an index, or call turbopuffer/another vendor.

See [`docs/architecture.md`](docs/architecture.md). Licensing remains unresolved and this package declares no license metadata.
