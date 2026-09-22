---
name: implement-delegated
description: "Run /implement through sequential Sonnet subagents so this session stays out of context rot. Takes a spec path, or the work agreed in this conversation."
disable-model-invocation: true
---

Run `/mattpocock-skills:implement` on the spec at `$ARGUMENTS`. With no argument, the work is the one this conversation has already settled — restate it in one paragraph and treat that paragraph as the spec.

Do the implementation work in **sequential Sonnet subagents**, one at a time. Keep the coding out of this session: your own context holds the spec, the carry-forward, and each report, and nothing more.

`/implement` is user-invoked only, so it cannot load here and cannot load in a subagent. Its whole-run steps are written out here in its own words, and they are yours: use `/mattpocock-skills:tdd` where possible, at pre-agreed seams; run the full test suite and `flake8` once at the end; once done, use `/mattpocock-skills:code-review` to review the work; commit your work to the current branch. Its per-slice steps travel in the dispatch template below.

## Lazy split

Cut one slice at a time, and cut it at a seam the spec names.

Cut only the **next** slice. The slices after it stay uncut until their turn, because a cut made before the code is read is a guess about names, seams and file layout that the earlier slices have not yet fixed.

## Dispatch

Each subagent gets one message, filled in from this template. Everything inside the block is addressed to the subagent; everything outside it is yours.

```markdown
## Objective

<the one slice, in the spec's own words>

## Boundaries

Files and seams you may touch: <...>
Work that belongs to later slices, and stays as it is: <...>

## Carry-forward

<the names and decisions the earlier reports recorded>

## Run rules

Note your starting commit with `git rev-parse HEAD` before you touch anything; the
squash at the end needs it.

Build this slice with `/mattpocock-skills:tdd`. Each cycle runs in this order:

1. Write a failing test for one behaviour, at a seam the objective names. One behaviour
   is one cycle, whether it takes one `def test_` or a parametrized set of cases at that
   same seam. Write no source code.
2. Run it. It goes **red**, and red for the reason the test is about.
3. Commit the test on its own: `git commit -m "red: <the behaviour>"`.
4. Write the least source code that turns it green. Run the test again.
5. Commit that code: `git commit -m "green: <the behaviour>"`.

Tests for a second behaviour belong to the next cycle, behind their own `red:` commit.

NOTE: the paired `red:`/`green:` commits are the only record that the test existed
before the code it covers. The orchestrator reads them back out of `git reflog`, so a
cycle whose test and source land in one commit reads as a cycle that never went red, and
a `red:` commit carrying two behaviours reads as the horizontal slicing `/tdd` rules out.

Report once the objective's seam is built. Anything the objective still leaves unbuilt
goes under Remainder.

Run typechecking and single test files as you go. The orchestrator runs the full test
suite and `flake8` once, after the last slice.

Last, squash this slice into a single commit: `git reset --soft <your starting commit>`,
then commit the slice as a whole.

## Report

End your reply with these seven headings:

- **Red trail** — your `red:`/`green:` commit subjects, in the order you made them.
- **Files touched** — paths, one per line.
- **Seams tested** — the public boundary each new test observes.
- **Names introduced** — modules, types, functions and fixtures a later slice must reuse.
- **Decisions made** — every choice the spec left open, and the reason.
- **Remainder** — the part of this objective still unbuilt.
- **Spec gaps** — anything this slice revealed that the spec does not cover.
```

## Loop

Dispatch the next subagent only after the previous one reports.

Check the red trail first, against `git reflog`, not against the report — a subagent that skipped the order writes a report that says it did not. `git reflog --date=relative | head -30` lists the commits the squash folded away, and `git show --stat <the red: commit>` names the files each one carried.

A slice passes when every behaviour appears as a `red:` commit that carries test files alone, ahead of the `green:` commit that covers it, and no `red:` commit covers two behaviours. Re-dispatch a slice that fails this, quoting what the reflog showed.

Then re-cut the next slice from the report, and route each heading:

- **Names introduced** and **Decisions made** — fold into the carry-forward.
- **Remainder** — becomes the next slice.
- **Spec gaps** — go to the user before the next dispatch. The user decides whether a gap becomes a slice.

The work is done when every seam the spec names has a slice that reported it, and the last report's **Remainder** is empty.

Run the `/mattpocock-skills:code-review` step of `/implement` in **Opus subagents**.

Squash the slice commits into the branch's final shape once the review is done.
