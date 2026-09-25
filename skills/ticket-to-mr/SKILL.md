---
name: ticket-to-mr
description: Take the current changes to an open merge request — Jira ticket, branch, push, MR with description — creating only the parts that are missing. Use when the user asks to create a Jira ticket, a branch, or a merge request for their changes.
---

# Ticket to MR

The chain is **ticket → branch → bump → push → MR**. Each link may already exist. You find where the chain stops and create only the links after that point. You never create a second ticket, branch, bump, or MR for the same work.

## 0. Pick the Jira tool

Every Jira step goes through one tool. Pick it before anything else:

1. **`acli`** when `acli jira auth status` succeeds.
2. Else the **Atlassian MCP** when `atlassianUserInfo` succeeds.
3. Else stop at once. Change nothing, and reply with only this line:

**`FAILED: neither acli nor the Atlassian MCP is connected. Run acli jira auth login or connect the MCP, then run /ticket-to-mr again.`**

When an `acli` command fails later, run that step with the MCP instead.

| Step | `acli` | Atlassian MCP |
|---|---|---|
| Read a ticket | `acli jira workitem view <KEY> --json` | `getJiraIssue` |
| Latest project | `acli jira workitem search --jql "<jql>" --limit 1 --json` | `searchJiraIssuesUsingJql` |
| Create a ticket | `acli jira workitem create --project <P> --type <T> --summary "<s>" --description-file <file> --assignee @me --json` | `createJiraIssue`, assignee from `atlassianUserInfo` |

## 1. Find what exists

Check each link in order. Stop checking at the first missing link: every link after it is missing too.

- **Ticket.** A Jira key (`ABC-123`) in the conversation, the current branch name, or `git log <target>..HEAD`. Read the ticket to confirm it exists.
- **Branch.** The current branch is not the target branch.
- **Bump.** The version in the version file differs from the one on the target branch. A repository without a version file has no bump link: skip it.
- **Push.** `git ls-remote --heads origin <branch>` returns a line, and the remote holds every local commit.
- **MR.** `glab mr view <branch> --output json` returns an open MR. When `glab` fails, the MR counts as missing.

The **target** is the branch the MR merges into. When the user names none, use `origin/HEAD`, else `origin/main`, else `origin/master`, whichever resolves first.

Tell the user in one line which links exist and which you will create.

## 2. Create the missing links

**Ticket.**
- Project: the key that appears most often in `git branch -a` and `git log`. When no key appears, use the project of the user's most recently updated issue: search with `assignee = currentUser() ORDER BY updated DESC`.
- Type: `Bug` for a fix, else `Task`. Summary and description come from the intent in the conversation and from the diff.
- Assign it to the user.

**Branch.**
- Name: follow the pattern of the existing branches in `git branch -a`. When there is no pattern, use `<KEY>-<number>-<short-slug>`.
- `git switch -c <branch>`. When the target branch had local commits ahead of `origin`, reset it after the switch: `git branch -f <target> origin/<target>`. The commits stay on the new branch.
- Commit uncommitted changes with a message that starts with the ticket key.

**Bump.** A commit of its own, after the change commits.
- Level: `patch` for a fix, `minor` for a new feature. `major` only when the user says the change breaks callers.
- Tool: `bump-my-version` (the maintained successor of `bumpversion`). When `bump-my-version --version` fails, install it: `pip install bump-my-version`.
- `bump-my-version bump <level> --no-commit --no-tag`. It reads the version files from the repository's config (`.bumpversion.toml`, `.bumpversion.cfg`, `setup.cfg`, or `[tool.bumpversion]` in `pyproject.toml`).
- When there is no config, add the files the last version-bump commit in `git log` changed: `bump-my-version bump <level> --current-version <version> --no-commit --no-tag <files>`. When there is no such commit, use `package.json`, `pyproject.toml`, `Cargo.toml`, or `VERSION`, whichever holds a version.
- Commit only the files the bump changed. Copy the message of the last bump commit. When there is none, use `<KEY>: bump version to <new version>`.

**Pre-commit.** Runs after the bump, before every push. Skip it when the repository has no `.pre-commit-config.yaml`.
- `pre-commit run --from-ref <target> --to-ref HEAD`.
- When hooks change files, commit those files as `<KEY>: apply pre-commit fixes` and run again.
- When a hook fails without a fix, fix the code, commit, and run again. When you cannot fix it, stop before the push and report the hook output.
- Done when the run passes with no changed files.

**Push.** `git push -u origin <branch>`.

**MR.**
- Write the description with the `mr-description` skill. The ticket is its source of intent. With no MR yet, the skill returns the description in the chat.
- Write the description to a file in the scratchpad, then run `glab mr create --source-branch <branch> --target-branch <target> --title "<KEY>: <ticket summary>" --description-file <file>`.
- When `glab` is missing or fails, give the user the MR link that `git push` printed, the description, and the `glab` error in one line. They create the MR by hand.

## 3. Report

Reply with the ticket link, the branch name, the new version, the MR link, and the description in the fenced block that `mr-description` produces. Mark each link as `created` or `existed`. When the MR already existed, run the `mr-description` skill anyway. It writes the new description onto the MR with `glab`.
