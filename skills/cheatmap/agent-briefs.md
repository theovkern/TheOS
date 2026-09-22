# Agent briefs

One brief per stage. Each agent gets its brief plus the named input files, and nothing else.

## Receipts

Every agent writes its work to its file and returns a **receipt**: at most 150 words saying what it wrote, how many items, and anything that went wrong. Content travels in files. The orchestrator's context then holds only what it judges with, which is what keeps a run affordable.

## Models

Collecting is mechanical. Judging is not.

| Stage | Model |
| --- | --- |
| Scout | Sonnet |
| Collectors ×2–3 | Sonnet |
| Synthesist | Opus |
| Judges ×3 | Opus |
| Critic | Opus |

The Synthesist and the judges hold the product: the structure everything ranks off, and the decision to drop a weak item. A cheaper model keeps what it should cut, so the saving lands as a longer page.

The page itself is rendered by `render.py`, so no agent writes HTML.

## Scout

One agent, Sonnet. Ten searches, roughly. It forms no opinions and ranks nothing.

Writes `<slug>.lanes.md`:

- **Vocabulary** — what practitioners call things, including the words a beginner would never guess.
- **Shape** — the rough parts of the field and how they relate.
- **Arguments** — where practitioners visibly disagree.
- **Lanes** — **two or three** collector lanes for this topic, each with the places to look and what it is expected to find. Default lanes are Theory, Field and Practice below. Adapt them, say why, and drop a lane the topic does not support rather than padding it.

Receipt names the lanes only. The collectors read the file.

Done when: each lane brief is concrete enough for another agent to act on with no further context.

## Collectors

Two or three agents in parallel, Sonnet. Each reads `<slug>.lanes.md` and writes **one JSONL file per kind it owns**, one finding per line:

```json
{"claim":"...","kind":"concept","why":"...","source":"https://...","strength":"many independent"}
```

`strength` is `many independent`, `one strong` or `single voice`. `why` is the load-bearing field — what it solves, or what breaks without it. A finding with a vague `why` never reaches the file.

| Lane | Writes |
| --- | --- |
| Theory | `<slug>.concept.jsonl` |
| Field | `<slug>.failure.jsonl`, `<slug>.practice.jsonl`, `<slug>.dispute.jsonl` |
| Practice | `<slug>.tool.jsonl` |

Each kind has exactly one owning lane, so parallel collectors never write the same file.

Receipt: lane, sources read, findings per file, saturation reached yes/no.

### Budget

**Saturation** ends a lane: stop once two sources in a row add no new claim. Stop at **12 sources** regardless. A shallow topic finishes in six.

**Fetch shallow.** The top of a thread carries its findings; the long tail repeats them.

```
python "C:\Users\theo\.claude\skills\web-fetch-fallback\fetch.py" <url> --comments 40 --max-depth 3 --max-chars 8000
```

`web-fetch-fallback` tells you to re-run with higher caps when its output is truncated. Here, truncated is the target — keep the caps above.

Read search results first and open a page only when its snippet promises a claim you do not already hold. Most pages you would open add nothing.

For a page over a few thousand words, redirect the fetch to a file in the system temp directory and read it with `head` and `grep` rather than pulling all of it into context.

### Lane 1 — Theory

Primary sources only: official docs, specs, standards, canonical texts, source code. Search and fetch directly. Supplies `kind: concept`.

### Lane 2 — Field

Practitioner experience. Forums, Reddit, Hacker News, mailing lists, conference talks, "what I wish I knew" write-ups, post-mortems.

Reddit and X go through `web-fetch-fallback` with the caps above.

Hunt three things: what people report going wrong (`failure`), the moves experienced people treat as obvious (`practice`), and where they visibly split (`dispute`).

### Lane 3 — Practice

What the field uses today. Which tools, services, frameworks and defaults carry work for people; which are dead or dying; what each one costs to adopt and to leave.

Date every claim. Supplies `kind: tool`, and it is the lane that ages.

## Synthesist

One agent, Opus. Reads every `<slug>.*.jsonl`. Holds **no opinions** — it ranks nothing and recommends nothing. It builds structure.

Writes `<slug>.map.md`:

- **Parts** — the components of the topic, each with one line: what this part is for.
- **Edges** — what depends on what, and what causes what. Every edge names the finding it rests on, or is marked `inference`.
- **Settled** — parts where the findings agree on one answer. Mark the answer.
- **Contested** — parts where the findings hold competing answers. Name each camp, what it optimises for, and what decides between them.
- **Diagram** — a mermaid `graph TD` of the edges, nodes named for the parts.

Done when: every part carries its purpose line, and every edge is traced or marked.

## Judges

Three agents in parallel, Opus. No web access. Each reads `<slug>.map.md` plus **only its own kinds** — a third of the corpus, which is where this stage stopped being expensive.

| Judge | Reads | Writes |
| --- | --- | --- |
| Learn Deep | `concept`, `failure` | `<slug>.judge-deep.json` |
| Cheat codes | `tool`, `practice` | `<slug>.judge-cheat.json` |
| Traps | `failure`, `dispute` | `<slug>.judge-traps.json` |

Each judge holds **one intention** and reads the whole map through it:

- **Learn Deep** — what the user must be able to do themselves. Lens: what does the rest of the map rest on.
- **Cheat codes** — what gives results without mastery. Lens: what does something outside the user carry for them.
- **Traps** — what will hurt the user. Lens: which edges of the map do beginners take wrongly.

Each file is a **JSON array of items in the `page-spec.md` item shape**, ranked by position in the map, so the orchestrator merges rather than retypes. An item whose `body` reads vague is dropped by the judge, before it ever reaches the plan.

Judges may claim the same part of the map. Leave the clash in; the orchestrator settles it with the clash rule.

Receipt: item count, and any part of the map the lens found nothing in.

## Critic

One agent, Opus. Offered after the page ships, never run by default. It has web access, and it reads `<slug>.plan.json`. It attacks **conclusions**, not findings — placement and certainty are where this skill fails, and facts are the cheap part.

It checks only four things:

1. The `headline`.
2. Every `amber` and `grey` item.
3. Items whose `body` reads weak.
4. Items worded "must", "never" or "always". Strong wording is where invented certainty hides.

It returns a **patch**: a list of `section / title / change / counter-source`. The orchestrator applies the patch to `plan.json` and re-runs `render.py`. The critic edits nothing itself.

Done when: each checked item is confirmed or downgraded, and the patch names a source for every downgrade.
