---
name: verify-theos
description: Drive and prove TheOS's real behavior from the terminal - the skill linker (`npm run link`), the dangerous-command guard (`hooks/deny-dangerous.mjs`) and the hook registrar (`npm run install-hooks`) - inside a throwaway fake home folder. Use when a change touches scripts/, hooks/ or skills/ layout and you must show it works, not just that `npm test` passes.
---

# Verify TheOS

TheOS is a distro, not a server. Its surface is CLI scripts that write into the home folder (`~/.claude`, `~/.agents`, `~/.cursor`, `~/.codex`) and one hook executable that agents call. Never run those scripts against the real home during verification. Every drive goes through `verify.mjs`, which points `HOME` and `USERPROFILE` at a sandbox, because the scripts resolve the home with `os.homedir()`.

Helper: `.claude/skills/verify-theos/verify.mjs` (Node, no dependencies). Run it from the repo root. All paths below are relative to the repo root.

## Launch

Nothing to start. Create a sandbox run:

```
node .claude/skills/verify-theos/verify.mjs init
```

It prints a run dir, `<os tmp>/theos-verify/<timestamp>`, holding `home/` (the fake home, starts empty) and `evidence/`. Keep that path; every other command takes it as `<runDir>`. An empty `home/` is a valid start state: each script creates the folders it needs.

Ready means `doctor` passes.

## Doctor

```
node .claude/skills/verify-theos/verify.mjs doctor <runDir>
```

Read-only. Checks: the repo is TheOS (`package.json` name `theos`), Node is 20 or newer, the denylist file exists, the guard exits 2 on a canary command, and the sandbox home exists and is not the real home. Exit 0 means worth driving. Any `FAIL` line means stop and report it.

## Drive

Two helpers, both write a transcript to `<runDir>/evidence/<name>.txt` and echo it.

Run a TheOS script in the sandbox. The transcript holds the command, exit code, stdout and stderr:

```
node .claude/skills/verify-theos/verify.mjs run <runDir> <name> -- npm run link
node .claude/skills/verify-theos/verify.mjs run <runDir> <name> -- npm run install-hooks
```

Feed the guard one hook payload as a given harness (`claude`, `cursor`, `codex`). Prefer `--case`, which reads a named command from `cases.json` (each entry says whether it must `block` or `allow`):

```
node .claude/skills/verify-theos/verify.mjs guard <runDir> claude --case rm-home
node .claude/skills/verify-theos/verify.mjs guard <runDir> cursor --case force-push
node .claude/skills/verify-theos/verify.mjs guard <runDir> claude --command "ls -la"
```

Why `--case`: the live guard on your own shell also reads the command line you type, so a literal `rm -rf ~` in a Bash call is blocked before it reaches the helper. Use `--command` only for harmless strings. Add new dangerous strings to `cases.json`.

Inspect results with read-only commands against `<runDir>/home` (`ls`, `cat`, `readlink`). The per-feature recipes are in `features/README.md`; read the matching file and follow it.

Out of scope on purpose: `install-tools`, `install-claude`, `install-shell` and `setup` install real software and edit the real PowerShell profile and plugin state. A sandbox home does not contain that. Verify them by reading their `*.test.mjs` plus a human run on a spare machine, and say they were not driven.

## Evidence

Proof for a feature is the transcript pair of action and resulting state:

- The `run` or `guard` transcript (command, exit code, streams).
- A read-only second view of what changed on disk (`ls`/`cat` of the sandbox), saved with `... > <runDir>/evidence/<name>.txt`.
- For link and registration: run the action twice and show the second run changes nothing.
- Exercise the real entry point (`npm run link`, the hook executable fed the JSON the harness sends), never an imported function. `npm test` is not proof; it is a separate check.
- `link --dry-run` prints `[dry-run] created` lines and writes nothing. Confirm that by listing the sandbox, not by trusting the flag.

Evidence lives in `<runDir>/evidence/` and survives cleanup. Report that path to the user.

## Cleanup

```
node .claude/skills/verify-theos/verify.mjs clean <runDir>
```

Deletes only `<runDir>/home`, and only for a run dir directly under `<os tmp>/theos-verify`. The sandbox contains Windows junctions (or symlinks) into this repo's `skills/`; the helper unlinks them and never follows them. After cleanup, check `ls skills` still lists every skill and that `<runDir>/evidence` still has your transcripts. Run clean after a failed attempt too.

Never kill processes by name; this skill starts none.

## Isolation

Runs do not collide: each `init` makes a new timestamped dir. The scripts hold no ports or locks. The one shared thing is this working tree: `link` links whatever is in `skills/`, including untracked skill folders.

## Features

See [features/README.md](features/README.md).
