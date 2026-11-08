# 0001. Model lists on single-model pstack roles

Date: 2026-11-08. Status: accepted.

## Context

I wanted `/pstack:why` investigators to run on Codex `gpt-6-luna` beside Sonnet, so two model families answer the same brief and the synthesizer can compare them.

pstack reads a model list only on its panel roles, such as `interrogate reviewers` or `architect runners`. Every other role, `why investigators` among them, takes one model. A split by category does not work either, because a Codex seat has no MCP access and can only search git.

The model config, `~/.claude/rules/pstack-models.md` (`rules/pstack-models.md` here), is read only by agents. Claude Code loads it into every session as text, and `/pstack:setup-pstack`, itself a skill, writes it. No script parses it. A search of every file in pstack 0.15.32 found the name `pstack-models` only in Markdown, and none of its scripts (`.mjs`, `.ts`, `.sh`, `watch-pr`) reads a rule file. The skills tell the chat to read the role's line from the config, so the config already decides which model each spawn uses.

## Decision

The config gets one more comment line, owned and documented by the `pstack-codex` plugin:

```text
# A list on a role the skill reads as one model, such as `why investigators` or `how explorer`: run each spawn of that role once per entry, with the same brief. Skip an entry that cannot reach what the spawn needs, such as a `codex:` entry for a spawn that needs an MCP, and say so. Hand every report to the next step, labeled with its model.
```

With `why investigators: sonnet xhigh, codex:gpt-6-luna xhigh`, the source-control investigator runs on both models. Jira and Confluence run on Sonnet only.

pstack stays unchanged. This is the same mechanism the existing `codex:` comment line uses.

## Consequences

- Any single-model role can take a list without a pstack change.
- The rule works only as far as the chat follows the comment. Nothing validates it, so a misread or a typo fails silently.
- `/pstack:setup-pstack` rewrites the config and drops both comment lines. Re-add them after each run, as the plugin README says.
- If a future pstack version stops taking the model from the config, the rule stops working without warning. Re-check after pstack upgrades.

## Alternatives

- **Change pstack upstream.** It would work for everyone and could be enforced in skill text, but it means getting a change accepted into `cursor/plugins`. It is worth doing only once a second model proves its value.
- **Split investigators by category.** Codex reaches only git, so the split would collapse into "luna on git, Sonnet elsewhere" and give no comparison.
- **Run both models by hand once.** It needs no config, but it is not repeatable, and the next session forgets it.
