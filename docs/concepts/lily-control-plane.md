# Lily control plane

Lily is the persistent natural-language interface to OmniSeed's governed capabilities, not an alternate runtime. Her stable operational identity is `company_steward`; “Lily”, voice, and presentation preferences are replaceable display configuration.

The flow is: utterance → structured intent → registered operation → policy and authorization → OmniSeed runtime → provider → evidence and observed state. Lily cannot call provider SDKs or treat a proposed operation as completed.

The home surface and persistent panel share the same company context. Lily can explain gaps, project capability, plan, activity, observation, and infrastructure views, and request plan generation. Apply remains approval-governed. In public Demo mode she returns deterministic explanations and projections but clearly states that nothing persists.

Voice uses the browser speech-recognition adapter where supported. It feeds the same transcript and intent pipeline as text; unsupported browsers retain the keyboard-accessible text path.
