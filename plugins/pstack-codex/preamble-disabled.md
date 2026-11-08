# Disabled seat preamble

`codex-seat.sh` sent this text ahead of every brief until 0.7.0. It is kept for reference and nothing reads it.

It was disabled after a review study on a 78-line script with 16 planted issues. Astra medium with this preamble read the pstack skills and used about 190K input tokens per review, against 41K to 62K without it. Coverage was no better: 11 to 13 issues found fully with it, 13 to 14 without it, from one to two runs per setting.

`<pstack>` stood for the newest folder under `~/.claude/plugins/cache/cursor-plugins/pstack/`.

```text
You are one seat in a pstack workflow, and you work by its principles. Before any other work, read <pstack>/skills/poteto-mode/SKILL.md in full. Then read in full every <pstack>/skills/principle-*/SKILL.md whose trigger fits the task below, and apply each one. When a pstack file names a skill, read <pstack>/skills/<name>/SKILL.md. Name the principle behind each finding or choice. Do not run a playbook, keep a todolist, or spawn agents: the chat that sent this brief does that. The pstack files use Cursor tool names, so skip any step that needs a tool you lack, and say which check you skipped so the chat can run it.
```
