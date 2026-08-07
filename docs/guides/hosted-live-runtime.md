# Hosted live runtime

Production uses `LiveTransport` against same-origin `/api/operations/{operation}` Vercel Functions. The function imports the released OmniSeed runtime boundary; UI code does not import planner, state, or provider internals.

Required server environment variables:

- `KV_REST_API_URL` and `KV_REST_API_TOKEN`: durable hosted store connection.
- `OMNISEED_OWNER_TOKEN`: owner login secret used only by the server.
- `OMNISEED_TRANSPORT_MODE=live`: deployment intent and operational diagnostics.

The public runtime is live while anonymous access is read-only. `/owner` creates a short-lived, HTTP-only owner session. Server-derived identity supplies permissions; browser-provided permission arrays are not trusted.

The seeded Gmail Connector uses `mock-google` and is displayed as **Simulated**. It is not a real Google Workspace integration.

Local development continues to support file-backed LiveTransport, FixtureTransport, and DemoTransport. Vercel remains replaceable hosting infrastructure; hosted persistence stays behind OmniSeed store contracts.
