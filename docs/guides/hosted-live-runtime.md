# Hosted live runtime

Production uses `LiveTransport` against same-origin `/api/operations/{operation}` functions. The function imports OmniSeed's runtime boundary; UI code does not import planner, state, database, or provider internals.

Required server environment variables:

- `OMNISEED_DATABASE_URL` and `OMNISEED_DATABASE_AUTH_TOKEN`: SQLite-compatible remote database. Turso-named aliases are also accepted.
- `OMNISEED_OWNER_TOKEN`: owner login secret used only by the server.
- `OMNISEED_TRANSPORT_MODE=live`: deployment intent and diagnostics.

The public runtime is live while anonymous access is read-only. `/owner` creates a short-lived, HTTP-only owner session. Server-derived identity supplies permissions; browser-provided permission arrays are not trusted.

The seeded Gmail Connector uses `mock-google` and is displayed as **Simulated**. It is not a real Google Workspace integration.

Local LiveTransport uses OmniSeed's `.omniseed/omniseed.db`. FixtureTransport and DemoTransport remain available. Vercel is replaceable hosting and the remote SQLite service is replaceable persistence; neither affects Company-as-Code semantics.
