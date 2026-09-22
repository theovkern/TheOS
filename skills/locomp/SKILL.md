---
name: locomp
description: Write the conversation's findings and current state to a Markdown checkpoint file under ./tmp/, so a fresh session with no memory of this one can pick up the work. Use when the user wants to save progress, checkpoint findings, or preserve where things stand before pausing or a context compaction.
---

# locomp

Checkpoint the conversation to disk for a **fresh session** — one that remembers none of this conversation.

1. From what's already established here — do not re-derive or investigate anything new — capture:
   - **Findings**: facts, decisions, and reasoning reached so far, each tied to the file/line it concerns.
   - **Current state**: what's done, what's in progress, what's next, and any open questions or blockers.
2. Write it so the fresh session needs nothing else: spell out context it wouldn't have (branch, ticket, what this work is for) instead of "as discussed above", and reference other artifacts (specs, plans, ADRs, issues, commits, diffs) by path rather than restating them. Redact secrets, credentials, and PII.
3. Save it to `./tmp/<slug>.md` in the current working directory, creating the directory if needed. Pick `<slug>` from the branch, ticket, or topic. If a checkpoint for this same topic already exists there, update it in place instead of adding a duplicate.
4. End the file with a **Sessions** section: this project's session ids, newest edit first, so a rollback needs no lookup. Get them with:
   ```bash
   ls -t "$(ls -d ~/.claude/projects/*"$(basename "$PWD")" | head -1)"/*.jsonl | head -10
   ```
   Record each as `<session-id>` plus its modified time. Mark the current session id.
5. Report the file path back to the user.
