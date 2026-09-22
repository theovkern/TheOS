---
name: grill-brief
description: Collect a high-level brief on a question or project, and turn it into a prompt for /grill-with-docs.
disable-model-invocation: true
---

Run a `/grilling` session to write a **brief** — the short statement of intent that a `/grill-with-docs` session will then take apart.

Stay at brief altitude: every question is about shape and intent, and the design work belongs to the session this brief feeds. When an answer reaches for a line number, an API, or a library, take it as background and steer back to shape.

Grill until each of these is settled:

- **Kind of change** — fix, hotfix, refactoring, new feature, spike, …
- **Purpose** — what goes wrong, or stays impossible, without it
- **Conceptual change** — what is true of the system afterwards that isn't true now
- **Altitude** — the level it sits at: one function, a module boundary, a system-wide contract
- **Relevant files** — where it lands. Find these yourself; ask only when the search leaves a real choice.

Then write the brief: 5–10 lines of prose covering all five points, at brief altitude throughout. Show it to me and wait for my confirmation before running `/grill-with-docs` with it.
