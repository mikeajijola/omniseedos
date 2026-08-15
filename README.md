# OmniSeed OS

OmniSeed OS is the optional first-party human operating environment for an OmniSeed-managed company. It is neither the company nor its source of truth. It projects engine-owned instance, Capability, Realisation, plan, observation, evidence, and activity state, and it discovers the company-declared steward.

OmniSeed OS is the place where one company is seen and operated.

## The idea

Every company made with OmniSeed can have its own operating environment.

That is OmniSeed OS.

Running a company should not require understanding the machinery underneath it.

It belongs to one company. It shows the company as OmniSeed currently understands it.

OmniSeed OS does not make up company state. It shows what OmniSeed has worked out from the company's definition, saved state, Providers, and evidence.

Lily lives here. Lily is the company's steward.

A founder should be able to ask Lily:

- “What can my company do?”
- “What are we missing?”
- “Where are we running?”
- “What needs my approval?”
- “Why is Customer Support not working?”

Lily should answer from real company state. She must not guess that something exists or hide a problem.

## How it fits

Company as Code means a company can be described, created, checked, and changed through code.

The company may use people, software, AI agents, services, or machines to do its work. Where it is safe and useful, that work can be automated.

```text
Company as Code
      ↓
Omniform describes the company
      ↓
OmniSeed makes the company real
      ↓
OmniSeed OS is where the company is seen and operated
```

[Omniform](https://github.com/mikeajijola/omniform) describes the company.

[OmniSeed](https://github.com/mikeajijola/omniseed) plans work, asks Providers to do it, and checks what happened.

OmniSeed OS gives people a simple way to see and operate that same company.

## A small example

Imagine Customer Support is not working.

OmniSeed may know that the company needs an inbox, but the chosen email Provider is not connected.

OmniSeed OS should show that missing connection. Lily should be able to explain it in plain words:

> Customer Support cannot receive messages because the email Provider is not connected.

The interface must not hide the problem with a fake green light. It must not call the email Provider behind OmniSeed's back.

Once the problem is fixed and OmniSeed checks it, the OS can show the new state.

## What this project owns

OmniSeed OS owns the experience of using one company.

It owns:

- the company screen
- the web API used by that screen
- Lily's entry point
- clear views of Capabilities, missing parts, plans, and approvals

It does not own:

- the Omniform language
- Provider selection or Provider truth
- plan and approval rules
- the source of truth about what is running

Lily and the interface use the same company operations as every other actor. They are friendly doors into OmniSeed, not shortcuts around it.

## Try it

You need Node.js 22 or newer. With all three repositories beside each other:

```sh
npm install --no-save ../omniform ../omniseed
npm test
OMNIFORM_PATH=../omniform/examples/company.omniform.yaml npm start
```

Open `http://localhost:4310`.

`OMNIFORM_PATH` chooses the company file. `PORT` chooses the web port. More settings are explained in [`docs/architecture.md`](docs/architecture.md).

The example server starts without Provider implementations. This is intentional. Missing Providers stay visible until a real deployment registers them.

## For developers

Read [`docs/architecture.md`](docs/architecture.md) for settings, web routes, the engine connection, Company Search, security boundaries, and production package checks.

## Project status

OmniSeed OS is in Generation 1 and early development.

Licensing has not been decided. The package does not declare a license yet.
