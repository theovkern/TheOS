# Spec 0001: TheOS repository setup

Status: ready-for-agent
Date: 2026-09-22
Source: grilling session, 14 rounds, ~30 decisions

## Problem statement

I have skills, workflow knowledge, hooks and projects scattered across four places with no single home and no backup.

- 11 skills sit in `TheOS/skills/` and load nowhere, because `.claude/skills/` is empty.
- 16 skills sit in `~/.claude/skills/`, live but in no git repo at all. One dead disk and they are gone. Some are hand-copied foreign skills with no record of where they came from.
- Foreign skills install as whole plugins. I cannot take 10 of 50, and unwanted skills pollute my agents.
- My skills only work in Claude Code. I also use Codex, OpenCode and prime-agent, and each looks in a different folder.
- Nothing stops an agent running `rm -rf ~` in any repo on this machine.
- 8 project folders sit inside the repo. Two are real git repos, one is empty, three are single files. TheOS has zero commits, so none of it is tracked.
- GitHub shows me name, description, language and last push. It cannot tell me what is stalled, what matters, or what I abandoned.

## Solution

TheOS becomes a public distro: skills, hooks, workflow and docs. It holds no project code.

A skill manager built on npm git dependencies fetches foreign skills from their authors' own repositories, pins them by commit, and symlinks the chosen ones into every agent harness at once. My own skills live in the same tree and link the same way.

A global command guard blocks catastrophic shell commands in every repo on the machine.

Projects live in their own repositories. `projects/` stays as a working directory whose children are ignored, so cross-project agent sessions remain possible.

## User stories

1. As the repo owner, I want my own skills in git, so that a dead laptop does not destroy work I cannot rewrite.
2. As the repo owner, I want one command to install every skill, so that setting up a new machine is not an afternoon.
3. As the repo owner, I want to pick individual foreign skills, so that 40 skills I never use do not sit in my agent's context.
4. As the repo owner, I want foreign skills pinned to a commit, so that an upstream change cannot alter my agent's behaviour without me choosing it.
5. As the repo owner, I want foreign skills fetched from the author's own repository, so that a stranger republishing on npm cannot inject instructions my agent will obey.
6. As the repo owner, I want installs to skip lifecycle scripts, so that a dependency cannot run code on my machine during setup.
7. As the repo owner, I want my skills to work in Claude Code, so that my main harness sees them.
8. As the repo owner, I want my skills to work in Codex, so that I am not locked to one vendor.
9. As the repo owner, I want my skills to work in OpenCode and prime-agent, so that trying a new harness costs nothing.
10. As the repo owner, I want the link step to work on Windows without Developer Mode, so that setup does not require an OS setting change.
11. As the repo owner, I want the same link step to work on Linux, so that the eventual move costs nothing.
12. As the repo owner, I want a name clash to fail loudly, so that two skills with the same name never silently overwrite each other.
13. As the repo owner, I want to never edit a foreign skill, so that I never carry a fork or a patch that breaks on update.
14. As the repo owner, I want to write my own skill when a foreign one does not fit, so that disagreement costs one file and no machinery.
15. As the repo owner, I want a global command guard, so that no agent in any repo can run `rm -rf ~` or force-push over history.
16. As the repo owner, I want the guard registered in Claude Code, Codex and Cursor, so that switching harness does not switch off safety.
17. As the repo owner, I want the guard to warn loudly when `jq` is missing, so that I never believe I am protected while the guard silently allows everything.
18. As the repo owner, I want Windows patterns in the denylist, so that the guard is not blind to recursive force deletes, `format` and `diskpart`.
19. As the repo owner, I want TheOS public, so that my GitHub shows work.
20. As the repo owner, I want personal content out of TheOS, so that public costs me nothing in privacy.
21. As the repo owner, I want project code out of TheOS, so that the repo stays small, fast and clearly scoped.
22. As the repo owner, I want `projects/` to stay as a folder with ignored children, so that a cross-project agent session is still one `cd` away.
23. As the repo owner, I want every project in its own repository, so that each has its own CI, issues, visibility and release.
24. As the repo owner, I want a written graduation rule, so that repo sprawl is decided by a rule and not by mood.
25. As the repo owner, I want each project to describe itself in its own README frontmatter, so that there is no central list to rot.
26. As the repo owner, I want `AGENTS.md` to hold all agent rules and `CLAUDE.md` to point at it, so that the rules are not harness-specific.
27. As the repo owner, I want an ADR of this session, so that in three months I know why the plugin was dropped.
28. As the repo owner, I want to know which of my 16 global skills are actually mine, so that I do not commit other people's work as my own.
29. As the repo owner, I want unmodified copies replaced by links, so that they update with upstream instead of rotting.
30. As the repo owner, I want to know what writes `~/.claude/skills/synced/`, so that the link script does not fight another tool.
31. As the repo owner, I want `jlog` and `mssg_dssptch` in repositories, so that a one-file PRD is still backed up.
32. As the repo owner, I want a private `theos-me` repository, so that docs about me and my idea list have a home that is never public.
33. As the repo owner, I want my business ideas as a plain list with descriptions and no priority field, so that the list does not become a planning tool I then avoid.
34. As the repo owner, I want a `tools/` folder, so that standalone utilities have a home that is not `scripts/`.
35. As the repo owner, I want `commands/` present and empty, so that adding a slash command later needs no restructuring.

## Implementation decisions

### Repository layout

```
TheOS/
  skills/                 own skills, the only copy
  hooks/                  forked command guard
  agents/                 subagent definitions
  commands/               empty, reserved for slash commands
  tools/                  standalone utilities
  scripts/link-skills.mjs the skill linker
  docs/adr/               decision records
  docs/specs/             this file
  setup/                  new-machine restore notes
  projects/               children ignored
  package.json            foreign skill sources
  AGENTS.md CLAUDE.md README.md .gitignore
```

Removed: `config/`, `memory/`, `.claude-plugin/`, the pipeline image, and the local copies of `grill-me`, `grilling` and `research`.

`.gitignore` ignores `projects/*` with a `.gitkeep` exception, plus `node_modules/` and `.claude/settings.local.json`.

### Not a Claude plugin

TheOS ships no plugin manifest. A plugin serves Claude Code only, and the symlink path already serves every harness. Adding a marketplace manifest later is roughly 15 lines and nothing here blocks it.

### Skill sources

`package.json` dependencies are git references, never registry packages:

- `github:mattpocock/skills` pinned to a tag
- `github:cursor/plugins` for pstack, which lives in the `pstack/` subfolder

Rationale: the registry copies of both are published by third parties, not the authors. The npm package carrying the mattpocock name is maintained by an unrelated account, while the author's own manifest sets `private` to true. A skill is instructions an agent obeys, so a republished skill is a larger risk than a republished library.

davidondrej's hooks are copied into `hooks/`, not linked. They become my files, because they need Windows patterns and a fail-loud change.

### Link targets

Two destinations cover four harnesses:

| Destination | Harnesses |
|---|---|
| `~/.claude/skills/` | Claude Code, OpenCode |
| `~/.agents/skills/` | Codex, OpenCode, prime-agent |

Pi is out of scope. It uses `~/.pi/agent/skills/` and is not installed.

### The linker

`scripts/link-skills.mjs`, Node, no dependencies. It reads a selection list, resolves each skill to a source directory, and creates one symlink per skill in each destination. On Windows it falls back to a directory junction, which needs no elevated rights. A name collision between two sources is a hard error, never an overwrite.

### Foreign skill edits

None. If a foreign skill does not fit, I write my own under my own name and stop linking theirs. No forks, no patch files.

### Hooks

`hooks/deny-dangerous.sh` plus `hooks/dangerous-patterns.txt`, forked from davidondrej. Registered globally in Claude Code (`PreToolUse`, block via exit 2), Codex (`~/.codex/hooks.json`), and Cursor (`~/.cursor/hooks.json`, block via JSON on stdout). Three required changes: Windows destructive-command patterns, a loud warning when `jq` is absent instead of failing open, and a README note that a denylist stops accidents and not a determined attacker.

### Projects

Out of the repository. `projects/` holds clones and its children are ignored.

New private repositories: `jlog`, `mssg_dssptch`, `theos-me`.
Existing: `healthos`.
Deleted: `readclone`, an empty folder; its idea moves into the `theos-me` list.
Left untracked by explicit decision: `advisory-board`, `teaching`.
Undecided: the two loose `.html` files.

Graduation rule, to be recorded in the ADR: a project earns its own repository when it needs its own CI, deploy, issue tracker, audience or licence.

### Documentation

`AGENTS.md` holds every agent-facing rule. `CLAUDE.md` is a single pointer to it. ADR 0001 records this session's decisions and their reasons.

## Testing decisions

A good test here exercises external behaviour, which means the filesystem result, and never the internal shape of the linker.

The single seam is `link-skills.mjs`. Split it once, at the highest point: a pure function that takes a source list and a destination list and returns a plan of intended links, and a thin applier that performs filesystem calls. Everything worth testing lives in the planner.

Planner tests, no filesystem needed:

- two sources offering the same skill name produce an error, not a link
- a skill selected from a source that does not provide it produces an error
- own skills and foreign skills both appear in the plan, once per destination

Applier tests, against a temporary directory:

- an existing real directory at the target is replaced by a link
- an existing correct link is left alone and the run is idempotent
- a destination that does not exist yet is created

No prior art exists in this repository, since the linker is its first code.

## Out of scope

- The dashboard. Agreed only to be read-only, its own repository, and aimed at "what do I work on next, what did I abandon". No design exists.
- n8n workflows. They belong in a separate `automations` repository, because they deploy to an n8n instance rather than to the dashboard's host. A workflow serving a single project lives in that project's repository.
- Pi harness support.
- Patching or forking foreign skills.
- Committing `advisory-board` and `teaching`.
- Splitting personal records out of project repositories.
- Publishing TheOS as an installable Claude plugin.

## Further notes

Three risks recorded deliberately.

`advisory-board` and `teaching` hold 98 files of real work and are backed up nowhere. Leaving them untracked is a decision, not a default, and it stays true until changed.

pstack is built for Cursor. Its setup skill writes a Cursor rules file. Some pstack skills will reference Cursor-only concepts that do nothing elsewhere.

Three entries in `~/.claude/skills/` are already symlinks into `~/.agents/skills/`, and a `synced/` folder holds two files of unknown origin. Something already writes there. That must be identified before the linker runs, or two tools will fight over the same directory.
