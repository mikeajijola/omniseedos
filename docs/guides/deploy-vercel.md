# Deploy OmniSeed OS to Vercel

Vercel hosts the web operating environment; it is a replaceable infrastructure choice and does not alter Omniform or OmniSeed Core. The current public deployment is a static, read-only demo using actual `OmniSeedTransport` view contracts and deterministic data. It does not persist mutations.

## Modes

| Mode | Development | Preview/production | Persistence |
| --- | --- | --- | --- |
| `live` | Default `npm run dev`; `OMNISEED_RUNTIME_URL` defaults to `http://127.0.0.1:8787` | Future remote durable runtime | Runtime StateStore |
| `fixture` | `npm run dev:fixtures` | Optional isolated review | None |
| `demo` | `npm run dev:demo` | Current Vercel build | None; read-only |

Only the central transport resolver reads mode configuration. Components depend on `OmniSeedTransport`.

## CLI preview workflow

```sh
npm install
npm run lint
npm test
npm run build
vercel link --yes --project omniseed-os
vercel deploy
```

Inspect the preview URL and verify `/`, `/found`, `/company`, `/capabilities`, `/plan`, `/observe`, `/activity`, and `/eve`. When appropriate:

```sh
vercel deploy --prod
```

The Vercel project configures `OMNISEED_TRANSPORT_MODE=demo` for preview and production. No secret runtime URL is required in demo mode. `.vercel` contains account-specific link metadata and is ignored.

## Runtime limitations

Vercel's ephemeral runtime filesystem is not used as an OmniSeed StateStore. A future live deployment must use a remote runtime with durable state or a suitable serverless StateStore implementation. GitHub CI remains authoritative for tests and cross-repository lifecycle validation; Vercel performs deployment only.
