# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Agent `model`). Alias entries in a panel list still count toward its fan-out.
# `codex:<model> <effort>` entry: spawn `pstack-codex:codex` for it, as that agent's description says. This overrides the adapter's row for `gpt-*` slugs.
# A list on a role the skill reads as one model, such as `why investigators` or `how explorer`: run each spawn of that role once per entry, with the same brief. Skip an entry that cannot reach what the spawn needs, such as a `codex:` entry for a spawn that needs an MCP, and say so. Hand every report to the next step, labeled with its model.
# budget: large (xhigh)
feature, refactoring: sonnet xhigh
bug-fix: sonnet xhigh
perf-issue: sonnet xhigh
hillclimb: sonnet xhigh
judgment and prose: opus xhigh
hardest tasks: opus xhigh
how explorer: sonnet xhigh
how explainer: opus xhigh
why investigators: sonnet xhigh, codex:gpt-6-luna xhigh
why synthesizer: opus xhigh
reflect tooling: sonnet xhigh
reflect judgment, divergent, synthesizer: opus xhigh
arena runners: opus xhigh, sonnet xhigh
arena cross-judge pool: opus xhigh, codex:gpt-6-astra xhigh
swarm workers: sonnet xhigh
architect runners: opus xhigh, sonnet xhigh, codex:gpt-6-astra xhigh
interrogate reviewers: opus medium, sonnet high, codex:gpt-6-astra medium
