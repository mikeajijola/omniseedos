# Deploy OmniSeed OS to Vercel

Vercel hosts the web operating environment and same-origin OmniSeed adapter. It remains replaceable infrastructure and does not alter Omniform or OmniSeed Core.

Production: [omniseed-os.vercel.app](https://omniseed-os.vercel.app)

## Modes

| Mode | Use | Persistence |
| --- | --- | --- |
| `live` | Local runtime or hosted same-origin runtime | Local or remote SQLite through OmniSeed stores |
| `fixture` | Isolated frontend development | None |
| `demo` | Deterministic visual fallback | None; read-only |

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

Set database and owner secrets through Vercel environment management, never repository files. Inspect `/`, `/found`, `/company`, `/capabilities`, `/plan`, `/observe`, `/activity`, and `/lily`, then promote with `vercel deploy --prod`.

The static build stays a truthful demo fallback; public routes are server-rendered through LiveTransport when configured live. `.vercel` is ignored. GitHub CI remains authoritative for validation; Vercel performs deployment.
