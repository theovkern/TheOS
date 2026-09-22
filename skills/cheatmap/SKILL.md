---
name: cheatmap
description: Build a one-page orientation map for a new topic — what to learn deep, what to rent, what to avoid.
disable-model-invocation: true
argument-hint: "<topic or endeavour>"
---

# cheatmap

Topic: `$ARGUMENTS`

Build one HTML page that orients a beginner: the shape of the field, the few things they must truly understand, the leverage they can rent instead of learning, and the traps.

The product is **subtraction**. Search hands everyone the same facts. The value here is judgement about what matters, and what a beginner can leave alone.

## Where things go

`<slug>` is the topic in lower-case kebab. Everything lives in `C:\Users\theo\.claude\cheatmaps\`. Re-running a topic overwrites it.

| File | Written by | Read by |
| --- | --- | --- |
| `<slug>.lanes.md` | scout | collectors |
| `<slug>.concept.jsonl` | Theory collector | synthesist, Learn Deep judge |
| `<slug>.failure.jsonl` | Field collector | synthesist, Learn Deep + Traps judges |
| `<slug>.practice.jsonl` | Field collector | synthesist, Cheat codes judge |
| `<slug>.dispute.jsonl` | Field collector | synthesist, Traps judge |
| `<slug>.tool.jsonl` | Practice collector | synthesist, Cheat codes judge |
| `<slug>.map.md` | synthesist | judges, you |
| `<slug>.judge-*.json` | judges | you |
| `<slug>.plan.json` | you | `render.py`, critic |
| `<slug>.html` + `.artifact.html` | `render.py` | the user |
| `<slug>.notes.md` | you | the user |

Agents return a **receipt**, never their output — see [`agent-briefs.md`](agent-briefs.md). Your context carries The Map, the judges' items, and the plan. Nothing else needs to be in it.

## 1. Sync

When intent and scope are already sharp enough to research, go to step 2.

Otherwise run the `grilling` skill on two things: **intent** — what the user is actually after; **specifics** — which slice of the topic. Grilling decides its own length.

Done when: you can state the topic in one sentence the user would sign, and you know their starting point.

Anything the user says about their background is free text. Carry it forward as bridge material for the page. Ask for none of it.

## 2. Scout

Dispatch one agent with the **scout brief** in [`agent-briefs.md`](agent-briefs.md).

Done when: `<slug>.lanes.md` exists and the receipt names two or three lanes.

## 3. Collect

Dispatch the collectors in parallel with the **collector briefs** in [`agent-briefs.md`](agent-briefs.md), one per lane the scout named.

Done when: every lane reports **saturation** or its 12-source stop, and every `<slug>.*.jsonl` file its lane owns holds findings.

## 4. Synthesise

Dispatch one agent with the **synthesist brief** in [`agent-briefs.md`](agent-briefs.md).

Read `<slug>.map.md` yourself when it lands. You rank off it in step 6.

Done when: every part carries its purpose line, every edge is traced to a finding or marked `inference`, and the file holds a mermaid diagram.

## 5. Judge

Dispatch three judges in parallel with the **judge briefs** in [`agent-briefs.md`](agent-briefs.md).

Done when: the three `<slug>.judge-*.json` files hold items in the `page-spec.md` shape, each with a `body` that names something concrete.

## 6. Plan

You do this work yourself. It is the reason the earlier stages ran in subagents: your context stays clean for it.

1. Settle clashes between judges by the clash rule in [`page-spec.md`](page-spec.md).
2. Rank each list by position in The Map — what sits upstream ranks higher — and set `cut_lines`.
3. Build `path` from The Map, ordered so nothing arrives before what it depends on.
4. Copy the map's mermaid diagram and parts into `map`.
5. Write `headline` last, once every section exists. Leave it `null` when the topic holds no real reframe.
6. Write `<slug>.plan.json` to the contract in [`page-spec.md`](page-spec.md).

Done when: the plan validates against the contract, and every item carries its `body`, its `dot`, and its sources.

## 7. Subtract

Run the **subtraction pass** in [`checks.md`](checks.md) against `<slug>.plan.json`. No web, no HTML yet.

Done when: all eight checks are answered, the edits are applied to the plan, and what you cut is logged in `<slug>.notes.md`.

## 8. Ship

```
python "C:\Users\theo\.claude\skills\cheatmap\render.py" "C:\Users\theo\.claude\cheatmaps\<slug>.plan.json"
```

Fix every warning it prints in the plan, then run it again. Publish `<slug>.artifact.html` with the Artifact tool for a link.

Report to the user: the link, the local path, items per section, how many sit amber or grey, and the byte size of each intermediate file — the sizes are the only cost measurement this run produces.

Then offer the **critic** in [`agent-briefs.md`](agent-briefs.md) as a choice, never as a default. When three or more items are amber or grey, say so and push for it. Apply its patch to the plan and re-run `render.py`.

## Neighbours

`cheatmap` is the one-shot orientation you run **before** the `teach` skill, and it can seed that skill's mission and resources.
