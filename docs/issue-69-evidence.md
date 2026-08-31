# Issue 69 acceptance evidence

This file records what this repository can prove for the Provider diagnostics
work. It deliberately separates automated projections from live deployment
acceptance.

| Acceptance item | Evidence in this repository | Status |
| --- | --- | --- |
| Provider lifecycle is visible without exposing configuration or credentials | `test/app.test.js` and `test/fixtures/provider-diagnostics.json` cover healthy, missing implementation, missing configuration, not-connected, unhealthy, and unsupported-family projections. | Automated |
| GitHub Provider in the production runtime | `test/vercel-runtime.test.js` registers the declared GitHub implementation, checks its healthy diagnostic, and verifies that production fails closed when its credential is unavailable. | Automated with a test implementation; live credentials are not repository evidence |
| Two additional Provider integrations | Google and Vercel lifecycle shapes exercise the generic diagnostic projection, but this OS does not install or connect implementations for them. | Blocked; not accepted as live integrations |
| Production coverage | The Vercel runtime test verifies durable construction, the registered GitHub implementation, and an unavailable selected Vercel binding. | Automated |
| Read-only production coverage | The read-only runtime test verifies a pinned revision, no durable observations, no check timestamps, and visible unavailable Provider diagnostics. | Automated |
| Screenshots | No live production or read-only screenshot is committed. A fixture-rendered screenshot would not prove a Provider connection and must not be presented as live evidence. | Required from a deployed acceptance environment |

## Dependency blockers

Generic installed-package discovery, structured connection failures, and
health-check evidence require the lifecycle contract tracked by OmniSeed issue
43. Until that contract and two real Provider implementations are available to
the deployment, the OS reports `implementation_unavailable`,
`configuration_missing`, or `not_connected` from Engine state. It does not
invent a failed connection attempt, a successful health check, or an
observation timestamp.

Live acceptance for two additional Providers therefore requires all of the
following outside this repository:

1. compatible Provider implementation packages;
2. deployment registration and server-side configuration for those Providers;
3. Engine-produced connection and health evidence; and
4. production and read-only screenshots captured from the resulting deployed
   company projection, with secrets and raw evidence excluded.

The automated fixtures prove rendering and safe projection only. They are not
evidence that Google, Vercel, or any other additional Provider is connected.
