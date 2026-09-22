---
name: comment-cleanup
description: Prosecute every comment a change added — delete the ones with no WHY, cut the survivors to a third. Runs directory by directory, file by file, logging each finished file so a fresh session resumes without loss. Use when the user runs /comment-cleanup, asks to clean up or trim comments, or before committing a change whose comments have not been graded.
---

Comments are guilty until proven innocent. You **prosecute** each one: argue out loud why it is allowed to exist, and delete it unless the reason is obvious and load-bearing. Less is more. A comment that survives is still cut to **a third** of its current size or shorter, essence intact. Bullets welcome. This binds ordinary comments and the decision-explaining prose inside docstrings alike.

`CLAUDE.md` under `# Code comments` is ground truth where it exists and overrides this file. Where it does not, the verdicts in step 4 stand alone.

## 1. Pin the change set and resume

Read `progress-cleansing-comments.txt` in the repo root if it exists. Every path listed there is finished — skip it.

Pin the diff: `git diff --merge-base main`, or whatever fixed point the user names.

Grade only comments the change **added or edited**. Untouched comments elsewhere in a file stay, however bad — widening the diff hides the change under a comment sweep.

Done when you can name the changed files and the already-finished ones.

## 2. Build the worklist

Group the remaining changed files by directory. Work directories in the order they appear, files inside a directory in alphabetical order.

Done when every unfinished changed file sits in exactly one directory group, in a fixed order.

## 3. Announce the file

Before any edit, print the file's path on its own line. The user reads this to restart a session at the right place, so it comes before reading the file, not after.

Do steps 3 through 6 for one file, then return here for the next. One file in flight at a time.

## 4. Prosecute every comment in that file

List every comment the diff introduced in this file as `file:line` plus its text — `#`, `//`, `"""`, `NOTE:` blocks included. A multi-line block is one entry.

Give each entry one verdict, first hit wins:

- **narration** — restates the line below it, labels a block, names a phase (`# initialize`, `# add the combo box`). Delete.
- **diff-talk** — speaks to whoever reads the diff, not whoever reads the file next year (`# fixed the race`, `# was 30s before`, `# new`). Delete.
- **moving target** — points at a spec section, doc heading, or PR number. Rewrite it to state the constraint itself, or delete it.
- **stale** — describes code this change removed or replaced. Delete.
- **decoration** — true, but a competent reader reconstructs it from the code in seconds. Delete. This verdict is the default; reach for **keep** only when you can name the specific thing the reader would get wrong without it.
- **bloat** — a real WHY buried in hedging, restated context, or an aside. Rewrite to **a third of its length or shorter**. That is the bar it must clear. Prose rarely gets there; bullets do.
- **keep** — a gotcha, workaround, historical constraint, or invariant the reader cannot reconstruct from the code. State the specific misunderstanding it prevents. Then cut it to **a third** too, unless every word carries a distinct fact.

Two comments in the same file are independent. Neighbours prove nothing, and house style proves less — the old comments here are the reason this pass exists.

Done when every entry carries a verdict, each **keep** names the misunderstanding it prevents, and every survivor is a third of its old length or shorter.

## 5. Apply

Make the deletions and rewrites in this file only.

This is a comment-only edit: **skip pytest, flake8 and every other check** — no behaviour changed, so a run buys nothing.

Done when the file's diff contains comment lines only.

## 6. Log the file

Call `/amend-filepath-to-file <path>` with the path you announced in step 3. It verifies the path and appends it to `progress-cleansing-comments.txt`.

Do this immediately after the edit, never batched at the end — an interrupted session must lose at most one file.

Done when the script prints `OK:`. On `ERROR:`, fix the path and call it again.

Then go back to step 3 for the next file. Done with the loop when the worklist is empty.

## 7. Report

One line of counts: _N prosecuted — K kept, D deleted, R rewritten, across F files._

Then, only where the user's judgement is genuinely needed:

- comments you deleted whose WHY might be real — `file:line` plus the text, so they can be put back.
- code so unclear its comment was carrying the explanation. Name it. The fix is clearer code, and that is a separate change.
