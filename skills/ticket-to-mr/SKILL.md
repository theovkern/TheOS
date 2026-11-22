---
name: ticket-to-mr
description: Take the current changes to an open merge or pull request (ticket, branch, push, MR or PR with description), creating only the parts that are missing. The ticket lives in Jira, GitHub, GitLab or wherever the repo's issue tracker doc says. Use when the user asks to create a ticket, an issue, a branch, a merge request or a pull request for their changes.
---

# Ticket to MR

The chain is **ticket → branch → bump → push → MR**. Each link may already exist. You find where the chain stops and create only the links after that point. You never create a second ticket, branch, bump, or MR for the same work.

**MR** means a GitLab merge request or a GitHub pull request, whichever the **host** takes.

## 0. Pick the tracker and the host

They are independent: a Jira ticket can go with a GitLab MR, a GitHub issue with a GitHub PR.

**Tracker.** The first that applies:

1. **The tracker doc.** `docs/agents/issue-tracker.md` exists in the repository. Its heading names the tracker. Create the ticket as its "publish to the issue tracker" section says, and read one as its "fetch the relevant ticket" section says, with the commands it gives. When it describes Jira, use the Jira tool below.
2. **GitHub.** `git remote get-url origin` is on `github.com`. Read with `gh issue view <n> --json number,title,body,url`, create with `gh issue create --title "<s>" --body-file <file> --assignee @me`. When `gh` acts as a GitHub App bot, `@me` is the bot and the assign fails: create the issue without `--assignee`.
3. **Jira**, through the Jira tool.

**Jira tool.** Every Jira step goes through one tool:

1. The **Atlassian MCP** when `atlassianUserInfo` succeeds.
2. Else **`acli`** when `acli jira auth status` succeeds.
3. Else stop at once. Change nothing, and reply with only this line:

**`FAILED: neither the Atlassian MCP nor acli is connected. Connect the MCP or run acli jira auth login, then run /ticket-to-mr again.`**

When an MCP call fails later, run that step with `acli` instead.

| Step | Atlassian MCP | `acli` |
|---|---|---|
| Read a ticket | `getJiraIssue` | `acli jira workitem view <KEY> --json` |
| Latest project | `searchJiraIssuesUsingJql` | `acli jira workitem search --jql "<jql>" --limit 1 --json` |
| Create a ticket | `createJiraIssue`, assignee from `atlassianUserInfo` | `acli jira workitem create --project <P> --type <T> --summary "<s>" --description-file <file> --assignee @me --json` |

**Host.** `origin` on `github.com` is GitHub, any other host is GitLab.

| Step | GitHub | GitLab |
|---|---|---|
| Open MR | `gh pr view <branch> --json number,url,state,body` | `glab mr view <branch> --output json` |
| Create | `gh pr create --head <branch> --base <target> --title "<title>" --body-file <file>` | `glab mr create --source-branch <branch> --target-branch <target> --title "<title>" --description-file <file>` |
| Update description | `gh pr edit <number> --body-file <file>` | `glab mr update <number> --description-file <file>` |

The **ref** is how the ticket is named in branches, commits and titles: a Jira key (`ABC-123`), an issue number (`#42`) on GitHub or GitLab, or what the tracker doc names it.

## 1. Find what exists

Check each link in order. Stop checking at the first missing link: every link after it is missing too.

- **Ticket.** A ref in the conversation, the current branch name (`ABC-123-…`, `42-…`), or `git log <target>..HEAD`. Read the ticket to confirm it exists.
- **Branch.** The current branch is not the target branch.
- **Bump.** The version in the version file differs from the one on the target branch. A repository without a version file has no bump link: skip it.
- **Push.** `git ls-remote --heads origin <branch>` returns a line, and the remote holds every local commit.
- **MR.** The host's "Open MR" returns an open one. When the CLI fails, the MR counts as missing.

The **target** is the branch the MR merges into. When the user names none, use `origin/HEAD`, else `origin/main`, else `origin/master`, whichever resolves first.

Tell the user in one line the tracker, the host, which links exist and which you will create.

## 2. Create the missing links

**Ticket.** Summary and description come from the intent in the conversation and from the diff. Assign it to the user.
- Jira: the project is the key that appears most often in `git branch -a` and `git log`. When no key appears, use the project of the user's most recently updated issue: search with `assignee = currentUser() ORDER BY updated DESC`. Type: `Bug` for a fix, else `Task`.
- Other trackers: as step 0 says.

**Branch.**
- Name: follow the pattern of the existing branches in `git branch -a`. When there is no pattern, use `<ABC-123>-<short-slug>` for Jira, `<42>-<short-slug>` for an issue number.
- `git switch -c <branch>`. When the target branch had local commits ahead of `origin`, reset it after the switch: `git branch -f <target> origin/<target>`. The commits stay on the new branch.
- Commit uncommitted changes. Copy the message style of `git log <target>`. When there is no style to copy, start a Jira commit with the key (`ABC-123: …`).

**Bump.** A commit of its own, after the change commits.
- Level: `patch` for a fix, `minor` for a new feature. `major` only when the user says the change breaks callers.
- Tool: `bump-my-version` (the maintained successor of `bumpversion`). When `bump-my-version --version` fails, install it: `pip install bump-my-version`.
- `bump-my-version bump <level> --no-commit --no-tag`. It reads the version files from the repository's config (`.bumpversion.toml`, `.bumpversion.cfg`, `setup.cfg`, or `[tool.bumpversion]` in `pyproject.toml`).
- When there is no config, add the files the last version-bump commit in `git log` changed: `bump-my-version bump <level> --current-version <version> --no-commit --no-tag <files>`. When there is no such commit, use `package.json`, `pyproject.toml`, `Cargo.toml`, or `VERSION`, whichever holds a version.
- When the repository has a `CHANGELOG.md`, add an entry for the new version. Copy the format of the newest entry: heading, date, sections. Write one line per change: what it does for the user, from the ticket and the diff. When an `Unreleased` section exists, move its lines under the new version.
- Commit only the files the bump changed, plus `CHANGELOG.md`. Copy the message of the last bump commit. When there is none, use `Bump version to <new version>`, with the Jira key in front for Jira.

**Pre-commit.** Runs after the bump, before every push. Skip it when the repository has no `.pre-commit-config.yaml`.
- `pre-commit run --from-ref <target> --to-ref HEAD`.
- When hooks change files, commit those files as `Apply pre-commit fixes`, with the Jira key in front for Jira, and run again.
- When a hook fails without a fix, fix the code, commit, and run again. When you cannot fix it, stop before the push and report the hook output.
- Done when the run passes with no changed files.

**Push.** `git push -u origin <branch>`.

**MR.**
- Write the description with the `mr-description` skill. The ticket is its source of intent. It leaves the description in a file in the scratchpad.
- For an issue number, end the description with `Closes #<n>`, so merging closes the issue.
- Title: `<KEY>: <ticket summary>` for Jira, else the ticket summary.
- Run the host's "Create" with that file.
- When the CLI is missing or fails, give the user the link that `git push` printed, the description file, and the CLI error in one line. They create the MR by hand.

## 3. Report

Reply with the ticket link, the branch name, the new version, the MR link, and the path of the description file. Mark each link as `created` or `existed`. When the MR already existed, run the `mr-description` skill anyway, then the host's "Update description" with its file, unless it already wrote onto the MR.
