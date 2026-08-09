# Generation 1 invariants

- Omniform serialization is format-neutral; YAML and JSON normalize to one canonical object.
- JSON Schema remains structural authority.
- Company Search is a first-class primitive with a replaceable provider.
- Search is governed retrieval and indexing, never canonical company truth.
- Lily and UI invoke OmniSeed operations and never call search vendors directly.
- Missing Company Search implementations remain visible provider gaps; no fallback is fabricated.
- One OmniSeed OS instance and every search request are isolated to one company by default.
