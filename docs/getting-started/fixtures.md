# Fixture-driven development

Run `npm install`, `npm test`, and `npm run dev:fixtures`. The local page uses `FixtureTransport` and `fixtures/startup.json`; no runtime, cloud account, credentials, Docker, or database is required. Six runtime-view fixtures cover an empty company, startup with a gap, partial company, degraded company, enterprise re-founding, and semantic findings. Treat fixture state as OmniSeed output; components must not recalculate it.
