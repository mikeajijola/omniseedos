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

## How the code protects this

- Every screen and Lily answer must come from the current company view produced by OmniSeed.
- Keep plan, approval, and apply as separate steps.
- Pass the exact plan and approval through to OmniSeed.
- Never rebuild a plan, add actions, or approve work inside the OS.
- Keep errors such as missing permission and an old plan different and visible.
- Lily, the UI, and the API must call OmniSeed operations. They must not call Providers behind OmniSeed's back.
- Keep missing or unhealthy Providers and unavailable operations visible.
- Keep Company Search inside one company. Keep source information on results.
- Never send credentials, Provider secrets, raw state files, or server file paths to the browser.

[Omniform](https://github.com/mikeajijola/omniform) owns the company language. [OmniSeed](https://github.com/mikeajijola/omniseed) works out company state and carries out changes. OmniSeed OS shows that state and must not copy those rules.

When an upstream rule changes, update the affected screens, errors, examples, and tests. Keep stable IDs behind friendly labels so actions and history still point to the right thing.

Run `npm test` after changes. The exact file roles, request rules, settings, package checks, and security boundaries live in [`docs/architecture.md`](docs/architecture.md).
