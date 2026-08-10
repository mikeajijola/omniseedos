# Working on OmniSeed OS

When you work on OmniSeed OS, keep the company simple to understand.

Read these rules before you learn the code.

## What must stay true

- One OS instance represents one company by default.
- Show what OmniSeed knows. Do not invent a second truth in the UI.
- Lily is the front door, not a shortcut around the rules.
- Lily and the UI use the same company operations as every other actor.
- Missing things should stay visible.
- Do not hide problems with fake fallbacks.
- Never expose secrets.
- Keep the interface simple.
- A founder should not need to understand the architecture to use the company.

Use plain words in labels, errors, and Lily's answers. Show what happened and what the person can do next.

## A simple example

If OmniSeed says an email Provider is missing, show that fact.

Do not turn the warning green. Do not call another Provider on the side. Do not let Lily promise that email works.

Help the founder understand the problem and reach the normal OmniSeed operation that can solve it.

## For maintainers

- `src/server.js` loads one Omniform company, chooses its state file, builds OmniSeed, and starts the server.
- `src/app.js` passes web requests to public OmniSeed methods and serves the site.
- `public/` shows the company and submits requests.
- `LilyResolverReference` is a small example. Better language understanding must still follow operation availability and authorization.
- `scripts/verify-distribution.mjs` checks that production packages do not depend on sibling folders.

Keep these technical rules:

- Every screen and Lily answer must come from the current company view produced by OmniSeed.
- Keep plan, approval, and apply as separate steps.
- Pass the exact plan, approval, and actor authorization through to OmniSeed.
- Never rebuild a plan, add approved actions, or approve work inside the OS.
- Keep errors such as missing permission and an old plan different and visible.
- Lily, UI, and API must call OmniSeed operations. They must not call Provider adapters or vendor APIs.
- Keep missing or unhealthy Providers and unavailable operations visible.
- Keep Company Search inside one company. Keep source information on results.
- Never send credentials, Provider secrets, raw state files, or server file paths to the browser.

The dependency direction is:

```text
omniform → omniseed → omniseedos
```

[Omniform](https://github.com/mikeajijola/omniform) owns the company language. [OmniSeed](https://github.com/mikeajijola/omniseed) owns company truth and changes. OmniSeed OS must not copy those rules.

Production uses compatible versioned packages. Do not commit sibling `file:` dependencies.

When an upstream contract changes, update routes, screens, error handling, examples, and package tests as needed. Keep stable IDs behind friendly labels so actions and audit history still point to the right thing.

Run `npm test` after changes. Run the distribution test when dependencies, exports, packaging, or releases change. Update [`docs/architecture.md`](docs/architecture.md) when a deep technical rule changes.
