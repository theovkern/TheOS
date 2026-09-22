# Agent rules

Every agent-facing rule for this machine lives here. Harness-specific files point at this
one rather than repeating it, so a rule is never true in Claude Code and stale in Cursor.

## What this repository is

TheOS is a distro: skills, hooks, workflow and docs. It is public.

It holds **no project code** and **no personal records**. Project code lives in its own
repository. Personal material lives in the private `theos-me` repository.

## Skills

`skills/` holds skills I wrote. This is their only copy. `npm run link` creates one symlink
per skill in each destination.

**This repository manages my skills and nothing else.** Skills by other people are installed
with their author's own installer and listed in the README. Every author already ships one,
so a wrapper around them would be a second thing to maintain and a place for their versions
and mine to collide.

### Rules

- **Never add a foreign skill to `skills/`.** It is not mine, and a copy here is a fork
  that rots. Install it with its author's installer and add a row to the README table.
- **Never edit a foreign skill.** If one does not fit, write my own under my own name in
  `skills/` and uninstall theirs. Disagreement costs one file, not a maintenance burden.
  The installers copy editable files, so nothing but this rule stops the edit.
- **Never write to `~/.claude/skills/synced/`.** Claude Code owns that folder and syncs it
  from the cloud. The linker refuses the name `synced` for this reason.
- **Never move a skill's only copy.** If a real directory sits where a link belongs, the
  linker parks it in `<destination>-replaced/` rather than deleting it.
- **Read a skill before installing it.** A skill is instructions an agent obeys. Treat an
  install like running someone's script, because that is what it is.

### Adding a skill of my own

1. Write it in `skills/<name>/SKILL.md`.
2. `npm run link`.
3. Commit. It is now backed up, and live in every harness.

## Command guard

`hooks/deny-dangerous.mjs` blocks catastrophic shell commands in every repository on this
machine, registered in Claude Code, Cursor and Codex. See `hooks/README.md`.

If the guard blocks a command: explain the block to the user. Do not retry it, do not
rephrase it to slip past the pattern, and do not disable the guard.

## Projects

`projects/` is a working directory, not a location. Its children are git-ignored so that a
cross-project agent session is one `cd` away, while no project code enters this repository.

Every project lives in its own repository and describes itself in its own README
frontmatter. There is no central project list, because a central list rots.

```yaml
---
name: jlog                  # the repository name
title: Journey Logger       # what a human calls it
status: idea | active | paused | abandoned
started: 2026-06-24
summary: One sentence. What it is and who it is for.
next: One sentence. The next thing that would move it, or why it stopped.
---
```

`status` and `next` are the two fields GitHub cannot give you. They are the whole point:
GitHub shows name, description, language and last push, and none of that says what is
stalled or what was abandoned on purpose.

### Graduation rule

A project earns its own repository when it needs its own CI, deploy, issue tracker,
audience or licence. Until then it is a folder.

Sprawl is decided by this rule, not by mood.

## Code

The linker and the guard follow the same shape: a pure function holding every rule worth
testing, and a thin layer that touches the filesystem or the process.

Test external behaviour — the filesystem result, the block decision — never the internal
shape. Run `npm test`.
