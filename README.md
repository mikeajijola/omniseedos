# OmniSeed OS

OmniSeed OS is the operating environment deployed per company. It is a projection of one OmniSeed capability registry—not a shared central control plane and not an independent source of operational truth.

```sh
npm install
npm test
npm start
```

Open `http://localhost:4310`. Set `OMNIFORM_PATH`, `OMNISEED_STATE`, and `PORT` to run another company instance.

Lily is the front door. `LilyResolverReference` is deliberately deterministic: it selects only declared, implemented and currently available operations, returns clarification/unsupported otherwise, and never calls providers.

One OmniSeed OS instance represents one company by default. It consumes that company's Omniform declaration, state, provider map and runtime capability registry. It is not a shared multi-company SaaS control plane.

## Packaging boundary

Development may link local workspaces. Distribution consumes the versioned `@omniseed/engine` and `@omniseed/omniform` packages; a deployed company does not require sibling source repositories. The package test guards against `file:../...` production dependencies. Licensing remains unresolved and this package declares no license metadata.

Given versioned contract artifacts, `npm run test:distribution -- <omniform.tgz> <engine.tgz>` packs OmniSeed OS, installs all three artifacts into a fresh isolated consumer, and verifies the public OS import without any repository topology.
