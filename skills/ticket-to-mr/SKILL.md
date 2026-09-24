---
name: ticket-to-mr
description: Take the current changes to an open merge request — Jira ticket, branch, push, MR with description — creating only the parts that are missing. Use when the user asks to create a Jira ticket, a branch, or a merge request for their changes.
---

# Ticket to MR

The chain is **ticket → branch → push → MR**. Each link may already exist. You find where the chain stops and create only the links after that point. You never create a second ticket, branch, or MR for the same work.

## 1. Find what exists

Check each link in order. Stop checking at the first missing link: every link after it is missing too.

- **Ticket.** A Jira key (`ABC-123`) in the conversation, the current branch name, or `git log <target>..HEAD`. Read the ticket with the Atlassian MCP to confirm it exists.
- **Branch.** The current branch is not the target branch.
- **Push.** `git ls-remote --heads origin <branch>` returns a line, and the remote holds every local commit.
- **MR.** `glab mr list --source-branch <branch>` returns an open MR.

The **target** is the branch the MR merges into. When the user names none, use `origin/HEAD`, else `origin/main`, else `origin/master`, whichever resolves first.

Tell the user in one line which links exist and which you will create.

## 2. Create the missing links

**Ticket.**
- Project: the key that appears most often in `git branch -a` and `git log`. When no key appears, ask the user for the project key. This is the only question you ask.
- Type: `Bug` for a fix, else `Task`. Summary and description come from the intent in the conversation and from the diff.
- Assign it to the user (`atlassianUserInfo`).

**Branch.**
- Name: follow the pattern of the existing branches in `git branch -a`. When there is no pattern, use `<KEY>-<number>-<short-slug>`.
- `git switch -c <branch>`. When the target branch had local commits ahead of `origin`, reset it after the switch: `git branch -f <target> origin/<target>`. The commits stay on the new branch.
- Commit uncommitted changes with a message that starts with the ticket key.

**Push.** `git push -u origin <branch>`.

**MR.**
- Write the description with the `mr-description` skill. The ticket is its source of intent.
- `glab mr create --source-branch <branch> --target-branch <target> --title "<KEY>: <ticket summary>" --description "<description>"`.
- When `glab` is not installed, give the user the MR link that `git push` printed and the description. They create the MR by hand.

## 3. Report

Reply with the ticket link, the branch name, the MR link, and the description in the fenced block that `mr-description` produces. Mark each link as `created` or `existed`. When the MR already existed, still return the description, so the user can update the MR text.
