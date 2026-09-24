---
name: find-session
description: Find the id of a past Claude Code session from what the user remembers about it (topic, words said, project, rough date). Use when the user wants to resume, reopen, or look up an old session, conversation, or chat.
allowed-tools: Bash, Read
---

# Find session

The user remembers a session. You return its id.

1. Turn the user's memory into **terms**: distinct words or short phrases they probably typed, plus names of files, tools, or repos. Also take a `--project` and a `--since`/`--until` date when the user gives one.
2. Search:
   ```
   python "C:\Users\theo\.claude\skills\find-session\find-session.py" <term> [<term> ...] [--project <text>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--limit N]
   ```
   It scans every transcript under `~/.claude/projects`, skips the current session, and ranks by how many terms match, then by weight (title 5, user prompt 3, assistant text 1). Each hit shows id, dates, cwd, title, first prompt, and snippets.
3. Judge the top hits against the user's full description, not only the rank. When no hit fits, search again with synonyms, fewer terms, or a wider date range. Stop after three searches.
4. When two hits stay close, read their first user prompts in `~/.claude/projects/*/<id>.jsonl` to decide.
5. Reply with the best id, its title, date, and cwd, and the resume command:
   ```
   cd "<cwd>"; claude --resume <id>
   ```
   Name up to two runner-ups on one line each. When nothing fits, say so and name the terms you tried.
