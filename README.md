# OmniSeed OS

**OmniSeed OS is the open capability-centric operating environment for organisations running on Company as Code.** It lets people found, understand, plan, approve, and observe an organisation while consuming—not duplicating—OmniSeed runtime truth.

> **Licensing blocker:** this public repository has no explicit license yet. The source is publicly readable but not licensed for reuse as open source pending a maintainer decision.

`Omniform (meaning) → OmniSeed (execution) → OmniSeed OS (interaction)`

It is for founders, operators, architects, accessibility contributors, interface designers, and developers building human, software/AI, and future embodied-machine access to shared capabilities.

## Try it

Node.js 20+ is sufficient; no enterprise environment or external service is required.

```sh
npm install
npm test
npm run dev:fixtures
```

The fixture server renders deterministic data at `http://localhost:3000`. For the primary live path, start `npm run runtime` in a neighbouring OmniSeed checkout, then run `npm run dev` here. Visit `/found` to create a persistent company through the free mock founding designer. See the [founding guide](docs/getting-started/founding.md), [live runtime guide](docs/getting-started/live-runtime.md), and [fixture guide](docs/getting-started/fixtures.md).

**[Open the hosted OmniSeed OS demo](https://omniseed-os.vercel.app)**

The public Vercel deployment uses explicit, read-only **Demo mode** for visual feedback; it does not claim persistent live execution. See the [Vercel deployment guide](docs/guides/deploy-vercel.md).

## Product areas

**Found · Company · Capabilities · Plan · Observe · Activity**. State and Settings are secondary technical views. Plan is a review and selective-approval surface; the UI never authorizes its own changes.

## Ecosystem and contribution map

- [Omniform](https://github.com/mikeajijola/omniform): portable semantics, reusable capabilities, policies, and monitor definitions.
- [OmniSeed](https://github.com/mikeajijola/omniseed): validation, calculated state, plan/apply, providers, evidence, drift, and events.
- **OmniSeed OS**: operating experience, accessibility, Eve, and actor interfaces using those shared capabilities.

See [CONTRIBUTING](CONTRIBUTING.md), [docs](docs/index.md), and [AGENTS.md](AGENTS.md).
