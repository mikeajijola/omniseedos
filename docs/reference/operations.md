# Structured operations

Initial read operations are `get_company`, `list_capabilities`, `get_capability`, `list_gaps`, `get_plan`, `get_state`, `list_findings`, `get_evidence`, and `explain_change`. Mutations such as `approve_plan` and `apply_approved_plan` require authorization, policy evaluation, and a plan. Human buttons, agent tools, APIs, and machine commands must call the same operation.
