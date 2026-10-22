# TheOS

My agent setup: skills I wrote, a global command guard, and the workflow around them.

It holds no project code.

## What is in here

| Folder | What it holds |
|---|---|
| `skills/` | Skills I wrote. Their only copy. |
| `hooks/` | The global command guard and its denylist. |
| `rules/` | Claude Code rules, linked as `~/.claude/rules`. Holds my pstack model choices. |
| `scripts/` | The skill linker and the hook installer. |
| `agents/` | Subagent definitions. |
| `commands/` | Slash commands. |
| `tools/` | Standalone utilities. |
| `docs/adr/` | Why things are the way they are. |
| `docs/specs/` | What was built and why. |
| `setup/` | New-machine restore notes. |
| `projects/` | A working directory. Its children are ignored; every project has its own repository. |

## Setup on a new machine

```sh
git clone git@github.com:theovkern/TheOS.git
cd TheOS
npm run setup
```

That installs Claude Code with its official installer and puts `~/.local/bin` on PATH. It
adds a `cc` alias for `claude` in bash, zsh and PowerShell, registers my status line, and
installs Matt's set, pstack and my pstack-codex as Claude Code plugins. Then it links my skills into every
harness and registers the command guard. No dependencies to install: every step is plain
Node with nothing underneath it.

Full notes in [`setup/`](./setup/).

## My skills

`skills/` is the only copy. `npm run link` creates one symlink per skill in two places,
which covers four harnesses:

| Destination | Harnesses |
|---|---|
| `~/.claude/skills/` | Claude Code, OpenCode |
| `~/.agents/skills/` | Codex, OpenCode, prime-agent |

```sh
npm run link -- --dry-run   # show the plan, change nothing
npm run link                # do it
```

It uses a directory junction on Windows, so it needs no Developer Mode and no elevated
rights. A real directory in the way is parked in `<destination>-replaced/`, never deleted.

## Skills by other people

Not managed here. Each author ships an installer that already does the job better than a
wrapper around it would, so this is a list of links and commands rather than machinery.
`npm run install-claude` runs the Claude Code column for Matt's set and pstack, nothing more.

| Skills | Claude Code | Cursor | Any agent |
|---|---|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | `claude plugin install mattpocock-skills@claude-plugins-official` | — | `npx skills@latest add mattpocock/skills` |
| [pstack](https://github.com/cursor/plugins/tree/main/pstack) | `claude plugin marketplace add cursor/plugins`, then `claude plugin install pstack@cursor-plugins` | `/add-plugin pstack` | — |
| [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) | — | `/add-plugin cursor-team-kit` | — |
| [davidondrej/skills](https://github.com/davidondrej/skills) | — | — | see the repo |

`npx skills@latest add <owner>/<repo>` asks which skills you want and which agents to put
them on. It is the closest thing to a harness-independent installer.

After installing Matt's set, run `/setup-matt-pocock-skills` once per repo.
After installing pstack, run `/pstack:setup-pstack`.

pstack has no official Codex build. To run pstack panel seats (reviewers, runners, judges)
on Codex models from Claude Code, install my
[pstack-codex](./plugins/pstack-codex/README.md) plugin and follow its README.
Each Codex seat reads poteto-mode and the principles from the official Claude Code plugin,
so both model families work from the same pstack version. `/setup-pstack` drops the
`codex:` lines from `~/.claude/rules/pstack-models.md`. That folder links to `rules/` here,
so `git diff` shows what it changed and `git checkout rules/` brings the lines back.

Two things to know before installing:

- **These installers copy files, they do not pin them.** You get whatever is current.
- **A skill is instructions your agent obeys.** Read a skill before installing it, the same
  way you would read a script before running it.

## The command guard

[`hooks/deny-dangerous.mjs`](./hooks/README.md) blocks catastrophic shell commands —
`rm -rf ~`, `git push --force`, `diskpart`, `format C:` — in every repository on the
machine, in Claude Code, Cursor and Codex alike.

It stops accidents. It does not stop a determined attacker. Read
[`hooks/README.md`](./hooks/README.md) before trusting it with anything.

## Credit

The command guard is forked from
[davidondrej/pi-config](https://github.com/davidondrej/pi-config).

## Status line

[`statusline/statusline.mjs`](./statusline/statusline.mjs) is my Claude Code
status line: model, effort, tokens, and the Claude and Codex 5h and 7d limits with their
reset times. It is one Node script, so it runs the same on Windows, macOS and Linux. It
reads the Codex limits live from `codex app-server`, which spends no model tokens, and caches them for 60
seconds. `refreshInterval` redraws the line while the chat is idle. `npm run install-claude`
points `statusLine` in `~/.claude/settings.json` at this clone.
