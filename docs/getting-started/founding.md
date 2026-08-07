# Start a company

Start OmniSeed with `npm run runtime`, start OmniSeed OS with `npm run dev`, and open `http://localhost:3000/found`. No paid model API is needed; the initial implementation uses `MockFoundingDesigner`.

Describe the company in ordinary language. The proposal separates canonical candidates—company, outcomes, capabilities, policies, observations, and possible resource requirements—from advisory assumptions and open questions. Review each capability using Accept, Reject, Edit, or Ask Lily / explain; capabilities come before resources and unresolved realisation is valid. Add a capability manually when needed.

The advanced preview shows only accepted/edited canonical content. Commit remains disabled until the draft contains valid accepted capability intent. Authorized commit validates Omniform, persists the definition and version-zero state separately, calculates gaps, and generates the first plan. You are then redirected into the normal live company experience.

For the construction SaaS example the expected landing state is eight required capabilities, zero realised, eight missing, and an initial plan containing transparent unresolved requirements. Restarting OmniSeed preserves the company.
