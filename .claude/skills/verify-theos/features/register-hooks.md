# Register hooks

`npm run install-hooks` writes the guard into Claude Code, Cursor and Codex config so every shell command is checked, and is safe to run twice.

## Sub-features

- `hooks-create` writes `.claude/settings.json`, `.cursor/hooks.json` and `.codex/hooks.json` under the home.
- `hooks-idempotent` a second run leaves exactly one guard entry per harness.
- `hooks-preserve` existing unrelated config in those files is kept.

## How to get to it (user POV)

- Run `npm run install-hooks` in the repo root.
- It also runs as part of `npm run setup` on a new machine.

## Driving it with verify.mjs

Preconditions: `doctor` passes and the sandbox home is fresh.

- **Create.** `node .claude/skills/verify-theos/verify.mjs run <runDir> hooks -- npm run install-hooks`. Exit 0 and three lines naming Claude Code, Cursor and Codex paths under `<runDir>/home`. `cat <runDir>/home/.claude/settings.json` shows `hooks.PreToolUse` with matcher `Bash` and a command ending `deny-dangerous.mjs" --claude`.
- **Other harnesses.** `cat <runDir>/home/.cursor/hooks.json` has `hooks.beforeShellExecution` with `--cursor`; `cat <runDir>/home/.codex/hooks.json` has `hooks.PreToolUse` with `--codex`.
- **Idempotent.** `... run <runDir> hooks-again -- npm run install-hooks`, then `grep -c deny-dangerous <runDir>/home/.claude/settings.json` prints `1`.
- **Preserve.** Before the run, write `{"theme":"dark"}` to `<runDir>/home/.claude/settings.json`; after it the file still has `"theme": "dark"` beside `hooks`.
- **Executable works.** Extract the command from the written file and feed it a payload with `verify.mjs guard`; exit code `2` for `--case rm-home`.
- **Proof.** Keep both `run` transcripts and the `cat` outputs saved to `<runDir>/evidence/`.

## Gotchas

- Codex runs a hook only after the user trusts it with `/hooks` inside `codex`. The sandbox cannot prove that step; report it as not verified.
- The written command embeds the absolute repo path, so the file is machine-specific.
- Never run this without the sandbox: it edits the real `~/.claude/settings.json`.
