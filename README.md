# TheOS

My agent setup: skills I wrote, a global command guard, and the workflow around them.

It holds no project code.

## What is in here

| Folder | What it holds |
|---|---|
| `skills/` | Skills I wrote. Their only copy. |
| `hooks/` | The global command guard and its denylist. |
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

That links my skills into every harness and registers the command guard. No dependencies
to install — the linker and the guard are plain Node with nothing underneath them.

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

| Skills | Claude Code | Cursor | Any agent |
|---|---|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | `/plugin install mattpocock-skills` | — | `npx skills@latest add mattpocock/skills` |
| [pstack](https://github.com/cursor/plugins/tree/main/pstack) | — | `/add-plugin pstack` | — |
| [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) | — | `/add-plugin cursor-team-kit` | — |
| [davidondrej/skills](https://github.com/davidondrej/skills) | — | — | see the repo |

`npx skills@latest add <owner>/<repo>` asks which skills you want and which agents to put
them on. It is the closest thing to a harness-independent installer.

After installing Matt's set, run `/setup-matt-pocock-skills` once per repo.
After installing pstack, run `/setup-pstack`.

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
