# pstack-codex

Runs [pstack](https://github.com/cursor/plugins/tree/main/pstack) role seats on OpenAI Codex models from Claude Code, through the local `codex` CLI and your ChatGPT login. Each Codex seat first reads poteto-mode and the principles from the official pstack plugin that Claude Code uses, so both model families work from the same version.

## Install

1. Install the Codex CLI and run `codex login`.
2. Install the official pstack plugin and this plugin:

   ```sh
   claude plugin marketplace add cursor/plugins
   claude plugin install pstack@cursor-plugins
   claude plugin marketplace add theovkern/TheOS
   claude plugin install pstack-codex@theos
   ```

3. Add these lines to `~/.claude/rules/pstack-models.md`. The first line is a comment, and the others add a Codex seat to a role's list:

   ```text
   # `codex:<model> <effort>` entry: spawn `pstack-codex:codex` for it, as that agent's description says. This overrides the adapter's row for `gpt-*` slugs.
   interrogate reviewers: opus xhigh, sonnet xhigh, codex:gpt-6-astra xhigh
   ```

`/pstack:setup-pstack` rewrites `~/.claude/rules/pstack-models.md` and drops models it does not detect. Do step 3 again after each run.
