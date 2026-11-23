# pstack-codex

Runs [pstack](https://github.com/cursor/plugins/tree/main/pstack) role seats on OpenAI Codex models from Claude Code, through the local `codex` CLI and your ChatGPT login. A Codex seat gets the same brief a Claude seat gets, with nothing added for read-only seats. Seats used to read poteto-mode and the pstack principles first. That cost about three times the tokens without better reviews, so it is off. The old text is in [preamble-disabled.md](./preamble-disabled.md).

## Install

1. Install the Codex CLI and run `codex login`.
2. Install the official pstack plugin and this plugin:

   ```sh
   claude plugin marketplace add cursor/plugins
   claude plugin install pstack@cursor-plugins
   claude plugin marketplace add theovkern/TheOS
   claude plugin install pstack-codex@theos
   ```

3. Add these lines to `~/.claude/rules/pstack-models.md`. The first two lines are comments, and the others add a Codex seat to a role:

   ```text
   # `codex:<model> <effort>` entry: spawn `pstack-codex:codex` for it, as that agent's description says. This overrides the adapter's row for `gpt-*` slugs.
   # A list on a role the skill reads as one model, such as `judgment and prose`: run each spawn of that role once per entry, with the same brief. Skip an entry that cannot reach what the spawn needs, such as a `codex:` entry for a spawn that needs an MCP, and say so. Hand every report to the next step, labeled with its model.
   interrogate reviewers: opus xhigh, sonnet xhigh, codex:gpt-6-astra xhigh
   judgment and prose: opus xhigh, codex:gpt-6-luna xhigh
   ```

## Lists on single-model roles

pstack reads a list only on its panel roles, such as `interrogate reviewers`. Every other role takes one model. The second comment line lets any role take a list, so two model families answer the same brief side by side. With `judgment and prose: opus xhigh, codex:gpt-6-luna xhigh`, each judgment call runs on both models and the chat gets both reports. A Codex entry is skipped for a spawn that needs an MCP, because Codex has no MCP access. Keep lists off code-writing roles: two writers on one brief edit the same files.

## Code-writing seats

A `codex:` entry also works in a delegate role, such as `bug-fix: codex:gpt-6-astra xhigh`. The seat runs in the Codex `workspace-write` sandbox with network access. The seat can also write to the npm cache, so it can install dependencies and run the build. On Windows it uses the elevated sandbox, because the unelevated one blocks child processes and so blocks `npm install`. The sandbox keeps `.git` read-only, so a Codex delegate leaves its changes uncommitted, and the chat commits them and reruns the tests. The same rule means no seat, reader or writer, can check out a commit, so the chat hands each seat a worktree already at the commit it needs. Codex also has no browser, Atlassian or Claude-only tools, so the chat runs those checks.

The relay runs Codex in the background and polls it, so a seat can take longer than the 10-minute limit of one shell call.

`/pstack:setup-pstack` rewrites `~/.claude/rules/pstack-models.md` and drops models it does not detect. Do step 3 again after each run.
