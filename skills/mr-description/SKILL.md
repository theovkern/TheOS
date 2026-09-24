---
name: mr-description
description: Write a merge request or pull request description from a fixed template (why, changes, risk and blast radius, results) and return it as GitLab Markdown in the chat. Use when the user asks for an MR or PR description, body, or text.
---

# MR description

You write the description. The user pastes it into GitLab. Return it in the chat only. Do not run `glab`, call the GitLab API, or push it anywhere.

1. Collect the **facts**:
   - The **intent**. It is already in the conversation or in the ticket. When the conversation lacks it, find the ticket key in the branch name or the commit messages and read the ticket. The diff shows what changed, never why. Write the intent as the source states it, with no reasons of your own.
   - The **changes**. Read `git log <target>..HEAD` and `git diff <target>...HEAD`. The target is the branch the MR merges into. When the user names none, use `origin/HEAD`, else `origin/main`, else `origin/master`, whichever resolves first.
   - The **results**. Use only output you or the user saw this session: test runs, before and after behaviour, screenshots.
2. Fill the template below. Use the project's own domain words.
3. Run the `pstack:unslop` skill on the filled text. Keep the headings and the facts.
4. Reply with the description in one fenced block opened with four backticks and `markdown`, so code blocks inside it survive the copy. Put nothing else in the block.

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
