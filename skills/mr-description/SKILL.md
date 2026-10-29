---
name: mr-description
description: Write a merge request or pull request description from a fixed template (why, changes, results, risk and blast radius) and write it onto the branch's open MR with `glab`, else return it in the chat. Use when the user asks for an MR or PR description, body, or text.
---

# MR description

You write the description. `glab` comes first: when the branch has an open MR, you write the description onto it. The chat is the fallback.

1. Find the **MR**: `glab mr view <branch> --output json`. When it returns an open MR, it gives the target branch, the MR number, and the **current description**. When `glab` is missing or fails, or no MR is open, go on without one.
2. Collect the **facts**:
   - The **intent**. It is already in the conversation or in the ticket. When the conversation lacks it, find the ticket key in the branch name, the MR title, or the commit messages, and read the ticket. The diff shows what changed, never why. Write the intent as the source states it, with no reasons of your own.
   - The **changes**. Read `git log <target>..HEAD` and `git diff <target>...HEAD`. The target is the branch the MR merges into: the user's, else the open MR's, else `origin/HEAD`, else `origin/main`, else `origin/master`, whichever resolves first.
   - The **results**. Only **measurable** output you or the user saw this session: a performance change with the number and where it was measured, before and after screenshots of a changed UI, before and after behaviour. Test counts and green runs are not results.
   - The **risk** and the **blast radius**. Rate each 🟢 low, 🟡 medium, or 🔴 high from the diff.
   - The **ticket key**, for example `PROJ-123`. Find it in the conversation, the branch name, the MR title, or the commit messages.
   - The **project template**. GitLab keeps it in one of two places. Look in this order:
     1. The repository: `.gitlab/merge_request_templates/*.md` on the target branch. Use `Default.md`, else the only file there.
     2. The project settings, as the default description. Run this in the repository:
        ```sh
        glab api projects/:id | PYTHONUTF8=1 python -c "import sys,json; print(json.load(sys.stdin).get('merge_requests_template') or '')"
        ```
        `glab api` has no `--jq` flag, so parse the JSON yourself. `glab` writes UTF-8. `PYTHONUTF8=1` makes Python read and print UTF-8 too. Without it, Python on Windows uses the system code page and fails on symbols such as `✓` or `—`. Empty output means no template. pyrtmf keeps its checklist here.

     When neither has one, there is no project template.
3. When you are unsure whether a result or the risk is worth a reviewer's time, ask the user with the candidate lines before writing. Leave out what they call irrelevant.
4. Write the text. Use the project's own domain words.
   - With a current description, **amend** it. Compare it line by line with the facts. Keep every line that is still true, word for word: the user's wording, extra sections, screenshots, links. Edit the lines the facts contradict. Add the facts it is missing, in the template's section for them. Done when every fact is in the text and every line left is true. Then apply the **Ending** rules below.
   - Fill the template below when the description is empty, or when it describes none of the current diff (the history was rewritten).
5. Run the `pstack:unslop` skill on the lines you wrote. Keep the headings and the facts.
6. With an open MR, write the description to a file in the scratchpad and run `glab mr update <number> --description-file <file>`. Reply with the MR link and one line per section you changed.
7. Without an open MR, or when `glab mr update` fails, reply with the description in one fenced block opened with four backticks and `markdown`, so code blocks inside it survive the copy. Put nothing else in the block. Add the `glab` error in one line when there was one.

## Template

````markdown
## Why

<The intent in one to three sentences. For a bug: what broke, for whom, and how it showed.>

## Changes

- **<Change name>.** <What changed and why, in one or two sentences.>

## Results

<The measurable results: numbers with where they were measured, before and after screenshots.>

## Risk and blast radius

**Risk.** <🟢, 🟡, or 🔴> <The reason in one sentence. Say if a revert undoes it cleanly.>

**Blast radius.** <🟢, 🟡, or 🔴> <What else could break and who would notice: users, other services, data, config.>

<The project template, when there is one.>

Closes <ticket key>
````

## Ending

The description always ends in this order:

1. The **project template**, when there is one. Copy it word for word, below Risk and blast radius. Keep its headings, checklist items, and comments. Tick each checklist box that a fact from this session proves, for example a passing test run or a version bump in the diff. Leave the other boxes open. Leave every box in a section for the reviewer or approver open. When the current description already holds the template, keep that copy and its ticks. Do not add a second copy.
2. `Closes <ticket key>` as the **last line**. Nothing comes after it. When the current description has a `Closes` line somewhere else, move it to the end. When there is no ticket key, leave the line out.

## Section rules

- **Changes.** Write this section only when the MR holds more than one change. One change is fully told by Why. One bullet per change a reviewer would judge on its own. Fold renames and formatting into the change they serve. Leave version bumps out.
- **Results.** Write this section only when there is a measurable result. Passing tests and pipelines belong to the template's checklist and the pipeline, so tick the box instead.
- **Risk and blast radius.** Write this section only when a reviewer learns something from it. A change that is 🟢 on both, such as docs or a test-only change, leaves it out. Each line is one sentence after its emoji.
- Keep each section short. A reviewer reads the whole description before the diff.
