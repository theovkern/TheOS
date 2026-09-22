# Command guard

`deny-dangerous.mjs` blocks catastrophic shell commands before any agent runs them.
`dangerous-patterns.txt` is the denylist: one POSIX-ERE regex per line, `#` comments ignored.

Forked from [davidondrej/pi-config](https://github.com/davidondrej/pi-config).

## What a denylist is and is not

A denylist stops accidents. It does not stop a determined attacker.

Anything on this list can be spelled another way — through a variable, a base64 string,
a script file, a different binary. The guard is a seatbelt, not a locked door. Treat it
as protection against a confused agent, never as permission to run an untrusted one.

## Changes from upstream

1. **Windows patterns.** Section 11 covers recursive force deletes (`rmdir /s`, `del /s`,
   `Remove-Item -Recurse`), `format`, `diskpart`, shadow-copy and boot-config destruction,
   registry hive deletion, and the Windows credential store.
2. **Fails closed, loudly.** Upstream returns an empty pattern list when the file cannot be
   read, which allows everything. This fork blocks every command and says so. A guard that
   silently allows everything is worse than no guard, because you stop watching.
3. **Node, not bash + `jq`.** Node parses the hook payload itself. A missing `jq` cannot
   disarm the guard, because there is no `jq`.

## Registration

One executable serves three harnesses. The flag picks the reply format.

| Harness | File | Flag | Block signal |
|---|---|---|---|
| Claude Code | `~/.claude/settings.json` → `hooks.PreToolUse`, matcher `Bash` | `--claude` | exit 2, reason on stderr |
| Cursor | `~/.cursor/hooks.json` → `beforeShellExecution` | `--cursor` | `{"permission":"deny"}` on stdout |
| Codex | `~/.codex/hooks.json` → `beforeShellExecution` | `--codex` | exit 2, reason on stderr |

Re-register on a new machine with `npm run install-hooks`.

Codex is not installed on this machine yet, so its registration is written but unverified.

## Editing the denylist

Changes take effect on the next command. No restart.

Add a pattern, then prove both directions in `deny-dangerous.test.mjs`: the dangerous
command blocks, and the ordinary command that looks like it does not. A pattern with no
"allows" test is how `rm -rf node_modules` ends up forbidden.

```
npm test
```
