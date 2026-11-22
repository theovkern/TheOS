# Restoring on a new machine

## Requirements

- Node 20 or newer (`node -v`)
- git
- Homebrew, on macOS only

On Windows, both come from winget: `winget install Git.Git OpenJS.NodeJS.LTS`, then open a
new terminal.

Nothing else. No `jq`, no Developer Mode, no elevated shell.

## 1. TheOS

```sh
git clone git@github.com:theovkern/TheOS.git ~/Documents/TheOS
cd ~/Documents/TheOS
npm run setup
```

`npm run setup` runs five steps. Run them one at a time if something fails:

| Step | What it does |
|---|---|
| `npm run install-tools` | Installs `gh`, `glab`, Atlassian's `acli` (for Jira), Claude Code and Codex. winget on Windows, Homebrew on macOS, release binaries in `~/.local/bin` on Linux (no sudo; delete one and rerun to upgrade it); Claude Code by its native installer and Codex by npm, because those auto-update and the packaged builds do not. Sign in afterwards: `gh auth login`, `glab auth login`, `acli jira auth login --web`, `claude`, `codex login` |
| `npm run install-claude` | Puts Claude Code on PATH, adds the `cc` alias, registers the status line, links `~/.claude/rules` to `rules/`, installs Matt's set, pstack and pstack-codex. On Windows it also adds `claude-use work\|personal`, which swaps the login of every Claude session, running ones included. First time on an account: `claude-use work`, then `/login` in any session |
| `npm run link` | Symlinks my skills into every harness |
| `npm run install-hooks` | Registers the command guard in Claude Code, Cursor, Codex |
| `npm run install-shell` | Windows only: installs posh-git for git tab completion and imports it once the prompt is up and the shell is idle, so new shells don't wait on its ~1.5 s import |

## 2. Check it worked

```sh
npm test
npm run link -- --dry-run
```

The dry run should report every link as `unchanged`. Anything else means a source moved.

Prove the guard is alive — this must print a block message and exit 2:

```sh
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}' | node hooks/deny-dangerous.mjs --claude
echo $?
```

If it exits 0, you are not protected. Do not continue until it exits 2.

## 3. Skills by other people

`npm run install-claude` already installed Matt's set and pstack as Claude Code plugins.
For other harnesses, use the author's installer from the table in the
[README](../README.md). Then run each set's setup skill
(`/setup-matt-pocock-skills`, `/pstack:setup-pstack`).

## 4. Projects

Projects are not in this repository. Clone the ones you need into `projects/`, whose
children are ignored.

```sh
cd projects
gh repo clone theovkern/healthos
gh repo clone theovkern/jlog
gh repo clone theovkern/mssg_dssptch
gh repo clone theovkern/theos-me
```

## 5. Agents act as a GitHub App (Linux, macOS)

Optional. Claude Code sessions then push, open PRs and comment as a GitHub App's bot user in
every repo the App is installed on, so their work is never mistaken for yours. Your own
terminal, and every other repo, keep SSH and your personal login.

1. Once: create a GitHub App under your account (Settings, Developer settings, GitHub Apps)
   with the permissions your agents need, for example Contents, Pull requests and Issues set
   to read and write. Install it on the repos the agents work in. Note its App ID.
2. Per machine: generate a private key in the App's settings, save it as
   `~/.config/agent-app/private-key.pem` and `chmod 600` it. One key per machine, so a lost
   machine costs one revoked key.
3. `npm run install-agent-app -- --app-id <id>`. It installs `agent-app-token` in
   `~/.local/bin`, saves the App ID and puts the `gh`/`git` wrapper block in `~/.bashrc`.
4. Start a new Claude session. A running one keeps the shell it snapshotted at start.

Which repos get the bot is set by the App's installation on GitHub, not here. A repo added
there switches over within an hour, or at once after deleting
`~/.config/agent-app/repos.txt`.

## What is not backed up

`advisory-board` and `teaching` are untracked by explicit decision. They exist only on the
old machine. Copy them by hand or accept losing them.

## Things that bite

**The links point at wherever you cloned TheOS.** Move the clone and every link dangles.
Re-run `npm run link`.

**`~/.claude/skills/synced/` belongs to Claude Code.** Never write there by hand. The linker
refuses the name for this reason.

**Shell functions named `_something` vanish in Claude Code.** Its shell snapshot drops
them. A wrapper that calls such a helper silently falls back to the plain command. The
agent App block keeps its logic in `agent-app-token` for this reason.

**Replaced directories are parked, not deleted.** If `npm run link` reports `replaced`, the
old copy is in `~/.claude/skills-replaced/` or `~/.agents/skills-replaced/`. Check it holds
nothing you wanted before clearing it out.
