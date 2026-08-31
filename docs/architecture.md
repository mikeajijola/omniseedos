# OmniSeed OS architecture

One process serves one company by default, but the company exists independently of this optional interface. The company's declaration path, state path, Git revision binding, provider map and runtime registry are explicit deployment inputs. Every screen and steward response reads the engine's compiled capability registry. Provider and capability gaps are projected as structured runtime truth.

The UI follows the ecosystem's authoritative [Provider semantics](https://github.com/mikeajijola/omniseed-ecosystem/blob/main/docs/provider-semantics.md). It labels the supplying organisation as Provider and presents products, services, frameworks, SDKs, and features as implementation detail beneath that Provider. It projects inference separately from agency: Lily remains the Agent actor, Google may supply a Gemini inference Resource, LiteLLM may implement the integration, and Vercel may host the runtime. Neither Gemini nor LiteLLM becomes a Provider.

## Shared production runtime

The production Vercel adapter emits one immutable runtime artifact containing
the OS interface and the declared Lily implementation. The build retrieves
Lily from an exact Git commit archive, never from a sibling checkout or branch
tip. Vercel supplies the hosting/project boundary; a separately selected
inference Provider supplies model inference. Lily's Agent resource, inference
resource, and OS connector resource remain separate company primitives even
when the Agent and interface share one observed deployment ID.

## Repository map

- `src/server.js` loads one Omniform company, chooses its state file, constructs OmniSeed, and starts the server.
- `src/app.js` maps HTTP requests to public OmniSeed methods and serves the site.
- `public/` renders company state and submits requests.
- `GovernedStewardClient` is the first-party reference client for the company-declared stewardship actor. Lily is one replaceable Agent resource, not an OS subsystem.
- `scripts/verify-distribution.mjs` checks the production package boundary without sibling source folders.

The browser may request a plan, but apply requires explicit approval and is delegated to OmniSeed. The declared steward, voice, richer semantic resolution, API clients, CLI clients and machines must enter through this same boundary. The UI discovers the stewardship realisation instead of hard-coding Lily.

## Lily company work

The production Lily surface is a durable company-work timeline, not a request/response chatbot. OS starts or resumes the declared steward's Eve session, reads the durable event stream from a saved cursor, and asks OmniSeed to persist only safe operational projections. Raw reasoning and continuation credentials never reach the browser.

The selected Agent-loop implementation owns semantic execution state. OmniSeed owns company intent, operation history, governance pauses, plans, proposals, Provider actions, observations, and evidence. Git remains desired-state authority. OS polling catches up a bounded runtime stream and may wake the same session after OmniSeed observes an independent exact approval; it does not approve, alter a plan, or call a Provider.

The browser receives a stable work-run ID immediately, then reads the Engine-owned timeline. Refresh and deployment do not discard work because the work record, Eve session ID, continuation token, and absolute stream cursor are durable server state. Only the safe session ID/cursor projection is displayed.

Reconciliation is projected like any other company Capability. Lily may invoke the declared `generate_plan` and `observe_company` operations when her company authority permits them; applying a non-empty plan still requires the exact persisted plan and a separate approval. The OS refreshes the Engine projection after a steward operation so plans, observations, evidence, and Activity remain one shared truth rather than chat-only state.

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
| `POST /api/lily` | Start durable company work with the declared steward | `start_company_work` and server-bound steward identity |
| `GET /api/lily/{workRunId}` | Catch up Eve and inspect the safe task timeline | `get_company_work` |
| `POST /api/lily/{workRunId}/messages` | Resume a waiting durable Agent session | `continue_company_work` |
| `POST /api/lily/{workRunId}/cancel` | Cancel the current Eve turn and company work | `cancel_company_work` |
| `POST /v1/companies/{companyId}/operations/{operationId}:invoke` | Invoke one declared governed operation | server-bound Agent identity |

The OS forwards exact plan/approval objects. It does not reproduce engine policy. Authorization is derived on the server from an authenticated identity; authorization objects in request bodies are ignored. GET /api/company is the sole anonymous route and is read-only. The reference deployment uses minimum 32-character bearer tokens (`OMNISEED_OPERATOR_TOKEN` for the human boundary and `OMNISEED_OPERATION_TOKEN` for the Agent operation boundary). A production identity-provider adapter can replace those resolvers without changing OmniSeed operations. Steward permissions are resolved from the declared Agent resource's authority instead of runtime defaults.

## Process and distribution details

`OMNIFORM_PATH` selects the company declaration. `OMNISEED_STATE` selects the engine state file and defaults to `.omniseed/state.json`. `OMNISEED_DESIRED_REVISION`, `OMNISEED_ENVIRONMENT`, `OMNISEED_DEPLOYMENT_ID`, and `OMNISEED_DEPLOYMENT_PROVIDER` bind the replaceable OS deployment to the canonical company revision without defining company identity. `OMNISEED_OPERATOR_TOKEN` and `OMNISEED_OPERATOR_ACTOR_ID` configure the temporary human authentication boundary. `OMNISEED_STEWARD_ACTOR_ID` binds the server-side steward identity; its permissions are fixed by the runtime and cannot be supplied by the browser. `PORT` defaults to `4310`.

For an Eve-backed declared Agent, `spec.resources.agents[].runtime.session`
declares the credential reference, issuer, audience, and optional subject used
for the OS-to-Agent session. `runtime.expectedEndpoints.operation` declares the
canonical Eve session endpoint. The Vercel Provider resolves the declared
secret references into the shared deployment. Different companies can reproduce
the topology from the same declarations while supplying their own secret value
as normal environment configuration.

The reference server constructs an empty Provider registry. Desired Providers therefore remain visible as unavailable until the deployment explicitly installs and registers implementations. The OS never adds a fallback.

`GET /api/company` adds `providerDiagnostics`, a safe human-facing index over Engine's `providers` lifecycle projection. It links a selected Provider gap to affected Capabilities and Realisations and exposes only implementation manifest identity and coarse observation references. Configuration objects, credentials, transport errors, and raw evidence never enter this projection. A missing check timestamp remains `null`; the OS does not infer runtime health from desired state.

Generic installed-package discovery, structured transition failures, and health-check evidence remain blocked on [OmniSeed #43](https://github.com/mikeajijola/omniseed/issues/43). Until that Engine contract is available, OS reports `not_connected` rather than claiming a connection attempt failed, and deployments must explicitly register Provider implementations.

## Vercel serverless adapter

`api/index.js` is a thin Vercel entry point over the same HTTP handler used by the Node server. It fetches a company definition from `OMNISEED_COMPANY_DEFINITION_URL`, which must contain the immutable `OMNISEED_DESIRED_REVISION`, and rejects declarations without a PR-governed canonical repository. Company identity comes from that declaration, never the hostname.

Serverless runtime state cannot use the process filesystem. `DurableHttpStateStore` binds OmniSeed to an authenticated, company-scoped HTTP state service with optimistic version checks. `OMNISEED_STATE_TOKEN` remains server-side. The adapter refuses to start if durable state, operator authentication, desired revision, or steward identity is missing.

The Vercel adapter exposes that authenticated service at `/api/state/companies/{companyId}/state` when `DATABASE_URL` is bound to durable PostgreSQL. Writes use an atomic version predicate and return `412` on stale compare-and-swap attempts. The database, not the Vercel function filesystem, retains proposals, Activity, observations, and evidence across cold starts and deployments.

`OMNISEED_READ_ONLY_INSPECTION=true` is a deliberately narrower bootstrap mode.
It loads an immutable Git revision and lets the public UI inspect the Engine's
desired-state projection, but supplies an empty in-memory runtime store and no
authenticated mutation identity. The UI labels this mode explicitly and shows
Provider gaps rather than fabricating observations. It is useful while bringing
up a company endpoint, but it is not durable production reconciliation and does
not satisfy live Provider acceptance.

The production Vercel adapter discovers the selected stewardship Agent from the
approved company declaration. For a declared Eve implementation it constructs a
server-side Eve session client from the Agent's declared immutable runtime
endpoint and session credential reference. The browser cannot select the
runtime URL, Provider, company, actor, or secret. Lily's authored tools call the
same authenticated OmniSeed operation endpoint as every other Agent; no
Provider credential enters Lily or the browser.

`SemanticStewardClient` remains the replaceable in-process Agent-runtime hook.
Both remote and in-process adapters are implementation choices beneath the
declared Agent primitive; neither changes the stewardship capability or makes
Eve a Provider.

Production uses matching versioned `@omniseed/omniform`, `@omniseed/engine`, and `@omniseed/os` artifacts. `npm run test:distribution -- <omniform.tgz> <engine.tgz>` installs the artifacts into an isolated consumer and verifies that no sibling repository path is required.
