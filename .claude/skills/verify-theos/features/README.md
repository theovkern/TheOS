# TheOS verification map

This directory is the maintained source for verifying TheOS's user-facing behavior. Read the index, then use the matching feature file as the recipe.

## Baseline preconditions

- Run from the repo root with a clean `doctor`: `node .claude/skills/verify-theos/verify.mjs doctor <runDir>`.
- Create the run with `init`. The sandbox `home/` starts empty.
- Drive scripts only through `verify.mjs run` so `HOME` and `USERPROFILE` point at the sandbox.
- Never drive against the real home folder.

## Driving conventions

- `<runDir>` is the path `init` printed. `<name>` is a short label for the transcript.
- Treat commands as literal. Keep flags unchanged.
- Observe results with read-only commands on `<runDir>/home`.
- Do not remove proof artifacts during cleanup; `clean` only removes `home/`.

## Proof and skip reporting

- Capture the action and the resulting state, not only the exit code.
- Idempotent features need a second run that reports no change.
- Record the feature ID and entry point with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report `install-tools`, `install-claude`, `install-shell` or `setup` as verified; they are out of scope for the sandbox.

## Feature entry contract

Each feature file starts with an H1 and one paragraph, then exactly four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.mjs`, `Gotchas`.

## Features

- [Link skills](./link-skills.md) covers `npm run link`: creating, re-running, dry-run, and replacing a real directory.
- [Command guard](./command-guard.md) covers blocking and allowing shell commands for each harness, and failing closed.
- [Register hooks](./register-hooks.md) covers `npm run install-hooks` writing the guard into Claude Code, Cursor and Codex config without duplicates.
