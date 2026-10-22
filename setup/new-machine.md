# Restoring on a new machine

## Requirements

- Node 20 or newer (`node -v`)
- git
- Homebrew, on macOS and Linux

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
| `npm run install-tools` | Installs `gh`, `glab`, Atlassian's `acli` (for Jira), Claude Code and Codex. winget on Windows, Homebrew elsewhere; Claude Code by its native installer and Codex by npm, because those auto-update and the packaged builds do not. Sign in afterwards: `gh auth login`, `glab auth login`, `acli jira auth login --web`, `claude`, `codex login` |
| `npm run install-claude` | Puts Claude Code on PATH, adds the `cc` alias, registers the status line, links `~/.claude/rules` to `rules/`, installs Matt's set, pstack and pstack-codex |
| `npm run link` | Symlinks my skills into every harness |
| `npm run install-hooks` | Registers the command guard in Claude Code, Cursor, Codex |
| `npm run install-shell` | Windows only: installs posh-git and imports it in the PowerShell profile, for git tab completion |

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

## What is not backed up

`advisory-board` and `teaching` are untracked by explicit decision. They exist only on the
old machine. Copy them by hand or accept losing them.

## Things that bite

**The links point at wherever you cloned TheOS.** Move the clone and every link dangles.
Re-run `npm run link`.

**`~/.claude/skills/synced/` belongs to Claude Code.** Never write there by hand. The linker
refuses the name for this reason.

**Replaced directories are parked, not deleted.** If `npm run link` reports `replaced`, the
old copy is in `~/.claude/skills-replaced/` or `~/.agents/skills-replaced/`. Check it holds
nothing you wanted before clearing it out.
