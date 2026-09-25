---
name: mr-description
description: Write a merge request or pull request description from a fixed template (why, changes, risk and blast radius, results) and write it onto the branch's open MR with `glab`, else return it in the chat. Use when the user asks for an MR or PR description, body, or text.
---

# MR description

You write the description. `glab` comes first: when the branch has an open MR, you write the description onto it. The chat is the fallback.

1. Find the **MR**: `glab mr view <branch> --output json`. When it returns an open MR, it gives the target branch, the MR number, and the **current description**. When `glab` is missing or fails, or no MR is open, go on without one.
2. Collect the **facts**:
   - The **intent**. It is already in the conversation or in the ticket. When the conversation lacks it, find the ticket key in the branch name, the MR title, or the commit messages, and read the ticket. The diff shows what changed, never why. Write the intent as the source states it, with no reasons of your own.
   - The **changes**. Read `git log <target>..HEAD` and `git diff <target>...HEAD`. The target is the branch the MR merges into: the user's, else the open MR's, else `origin/HEAD`, else `origin/main`, else `origin/master`, whichever resolves first.
   - The **results**. Use only output you or the user saw this session: test runs, before and after behaviour, screenshots.
3. Write the text. Use the project's own domain words.
   - With a current description, **amend** it. Compare it line by line with the facts. Keep every line that is still true, word for word: the user's wording, extra sections, screenshots, links. Edit the lines the facts contradict. Add the facts it is missing, in the template's section for them. Done when every fact is in the text and every line left is true.
   - Fill the template below when the description is empty, or when it describes none of the current diff (the history was rewritten).
4. Run the `pstack:unslop` skill on the lines you wrote. Keep the headings and the facts.
5. With an open MR, write the description to a file in the scratchpad and run `glab mr update <number> --description-file <file>`. Reply with the MR link and one line per section you changed.
6. Without an open MR, or when `glab mr update` fails, reply with the description in one fenced block opened with four backticks and `markdown`, so code blocks inside it survive the copy. Put nothing else in the block. Add the `glab` error in one line when there was one.

## Template

````markdown
## Why

<The intent in one to three sentences. For a bug: what broke, for whom, and how it showed. Add `Closes #<id>` when an issue exists.>

## Changes

- **<Change name>.** <What changed and why, in one or two sentences.>

## Risk and blast radius

**Risk.** <Low, medium, or high, and the reason. Say if a revert undoes it cleanly.>

**Blast radius.** <What else could break and who would notice: users, other services, data, config.>

## Results

<What proves it works: the tests that ran and their outcome, before and after behaviour, screenshots to attach.>
````

## Section rules

- **Changes.** Write this section only when the MR holds more than one change. One change is fully told by Why. One bullet per change a reviewer would judge on its own. Fold renames and formatting into the change they serve. Leave version bumps out.
- **Results.** Report only what was observed. When nothing ran, write `Not tested.` and name the check a reviewer should run.
- Keep each section short. A reviewer reads the whole description before the diff.
