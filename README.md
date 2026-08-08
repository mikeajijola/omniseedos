# OmniSeed OS

OmniSeed OS is the operating environment deployed per company. It is a projection of one OmniSeed capability registry—not a shared central control plane and not an independent source of operational truth.

```sh
npm install
npm test
npm start
```

Open `http://localhost:4310`. Set `OMNIFORM_PATH`, `OMNISEED_STATE`, and `PORT` to run another company instance.

Lily is the front door. The initial steward uses deterministic intent projections for inspection and plan requests; a semantic resolver can later sit in front of the same registry and policy path without gaining direct mutation authority.
