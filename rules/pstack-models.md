# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Agent `model`). Alias entries in a panel list still count toward its fan-out.
# `codex:<model> <effort>` entry: spawn `pstack-codex:codex` for it, as that agent's description says. This overrides the adapter's row for `gpt-*` slugs.
# A list on a role the skill reads as one model, such as `why investigators` or `how explorer`: run each spawn of that role once per entry, with the same brief. Skip an entry that cannot reach what the spawn needs, such as a `codex:` entry for a spawn that needs an MCP, and say so. Hand every report to the next step, labeled with its model.
# budget: large (xhigh)
feature, refactoring: sonnet high
bug-fix: sonnet high
perf-issue: sonnet high
hillclimb: sonnet high
judgment and prose: opus medium
hardest tasks: opus medium
how explorer: sonnet high
how explainer: opus medium
why investigators: sonnet high, codex:gpt-6-luna xhigh
why synthesizer: opus medium
reflect tooling: sonnet high
reflect judgment, divergent, synthesizer: opus medium
arena runners: opus medium, sonnet high
arena cross-judge pool: opus medium, codex:gpt-6-astra xhigh
swarm workers: sonnet high
architect runners: opus medium, sonnet high, codex:gpt-6-astra xhigh
interrogate reviewers: opus medium, sonnet high, codex:gpt-6-astra medium
