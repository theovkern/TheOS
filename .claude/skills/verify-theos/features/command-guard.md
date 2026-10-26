# Command guard

`hooks/deny-dangerous.mjs` reads the hook payload an agent harness sends and blocks catastrophic shell commands, while letting ordinary look-alikes through.

## Sub-features

- `guard-block-claude` a denylisted command exits 2 with the reason on stderr (Claude Code and Codex shape).
- `guard-block-cursor` the same command prints `{"permission":"deny",...}` on stdout and exits 0.
- `guard-allow` ordinary commands exit 0 with no output (Cursor prints `{"permission":"allow"}`).
- `guard-lookalike` `rm -rf node_modules` and `git push --force-with-lease` are allowed.
- `guard-fail-closed` an unreadable or unparseable input blocks everything and says so.

## How to get to it (user POV)

- An agent in Claude Code, Cursor or Codex runs a shell command and the registered hook fires.
- Directly: pipe a payload into `node hooks/deny-dangerous.mjs --claude|--cursor|--codex`.

## Driving it with verify.mjs

Preconditions: `doctor` passes (its canary already proves one block).

- **Block, Claude shape.** `node .claude/skills/verify-theos/verify.mjs guard <runDir> claude --case rm-home`. Exit code `2`, stderr starts `Blocked by the global dangerous-command guard` and names the matched pattern.
- **Block, Cursor shape.** `... guard <runDir> cursor --case force-push`. Exit code `0`, stdout is JSON with `"permission":"deny"`.
- **Block, Codex shape.** `... guard <runDir> codex --case gh-token`. Exit code `2`.
- **Windows pattern.** `... guard <runDir> claude --case windows-rmdir`. Exit code `2`.
- **Allow.** `... guard <runDir> claude --case ls`, then `--case rm-node-modules` and `--case force-with-lease`. Exit code `0`, stdout and stderr empty. For `cursor`, stdout is `{"permission":"allow"}`.
- **Fail closed.** Pipe garbage: `echo not-json | node hooks/deny-dangerous.mjs --claude`. Exit code `2`, stderr says `could not parse the hook payload`. Do not edit `dangerous-patterns.txt` to prove the missing-file path; `npm test` covers it.
- **Proof.** Keep one block and one allow transcript per harness shape you touched.

## Gotchas

- Typing a dangerous string in your own Bash call trips the live guard. Use `--case`.
- A `block` case that exits 0 is a regression; an `allow` case that exits 2 is a false positive. Check `expect` in `cases.json`.
- The patterns are a seatbelt, not a lock. Do not claim a bypass attempt proves safety.
- Changes to `dangerous-patterns.txt` apply on the next command with no restart.
