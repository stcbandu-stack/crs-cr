# Repo Instructions — CRS Creative

## Grill scope before building, then build silently

Before writing any code for a new feature or anything that adds new scope (new table, new page, new button, new integration, new external side effect), run **one sharp, hard round of scoping questions first** — before touching code. Don't soften it, don't skip it because it feels obvious. Cover:

- Exact minimum fields/steps required — what's explicitly IN and what's explicitly OUT
- Any external side effect (LINE, email, webhook, third-party API) — confirm it's actually wanted, not just "reusing an existing pattern seemed natural"
- Who can see/do what (which roles, which data)
- Anything existing this change removes, replaces, or could break

For features touching core domain concepts (jobs, claims, accounts, roles, pricing), use the `grill-with-docs` skill to stress-test the plan against this project's existing model and terminology instead of guessing.

**Once scope is locked, stop asking and just build.** Do not ask about implementation-level details — exact UI copy, which DB column is nullable, minor styling, file organization, status workflow shape. Pick the simplest reasonable default and ship it. This user actively wants less, not more: no speculative fields, no extra workflow states, no unrequested integrations, no gold-plating. When unsure whether something is in scope, cutting it is usually right.

## Never let a test reach outside code/DB without asking

Testing confined to code, the database, or the local browser is fine to run solo. But before any test step that could fire a **real external side effect** — a LINE push, an email, a webhook to a real third party — stop and ask first, or find a way to verify without triggering the live effect. A test claim submitted through the UI once fired a real LINE message into the company's production group; don't repeat that.
