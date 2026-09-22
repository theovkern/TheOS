# The page

One page, read top to bottom: headline, The Map, Learn Deep, Cheat codes, Traps, The Path, Run next, sources.

You write **`<slug>.plan.json`**. `render.py` turns it into HTML. The plan carries judgement; the script carries layout. Design, styling and the diagram are already settled in `template.html`, so a run spends its tokens on what to say.

## The contract

```jsonc
{
  "topic":     "Learning investing",       // as the user would say it
  "slug":      "learning-investing",
  "generated": "2026-09-06",
  "headline":  "...",                      // or null

  "map": {
    "mermaid": "graph TD\n  A[Savings rate] --> B[Capital]",
    "parts": [
      { "name": "...", "purpose": "...", "state": "settled",
        "answer": "..." },
      { "name": "...", "purpose": "...", "state": "contested",
        "camps": [ { "name": "...", "optimises": "...", "pick_when": "..." } ] }
    ]
  },

  "learn_deep":  [ item ],
  "cheat_codes": [ item ],
  "traps":       [ item ],

  "cut_lines": { "learn_deep": 4, "cheat_codes": 3, "traps": 4 },
  "path":      [ { "stage": "...", "topics": ["...", "..."] } ],
  "next":      [ "...", "...", "..." ],
  "sources":   [ { "n": 1, "title": "...", "url": "..." } ]
}
```

An **item** is the same object in all three lists:

| Field | Holds |
| --- | --- |
| `title` | the thing itself, a few words |
| `body` | the required line for its section, below. This is where the item earns its place. |
| `dot` | `green` \| `amber` \| `grey` |
| `sources` | the `n` values backing a non-obvious claim; `[]` when the claim is obvious |
| `type` | Cheat codes only: `rule` \| `habit` \| `template` \| `bet` |
| `dated` | `bet` items only, e.g. `"2026-09"` |
| `link` | one line pointing at the item's other half, when the clash rule split it |

Run `python render.py <slug>.plan.json` and read the warnings. It flags a missing `body`, a contested part with no camps, and a source reference that resolves to nothing.

## `map` — "What is this made of?"

The Synthesist's structure. No length cap: a map that omits parts is not a map.

`mermaid` is a `graph TD` of the dependency edges — nodes are part names, arrows are "depends on". Artifacts render it natively.

Each part carries one `purpose` line: what this part is for.

- `settled` — the question has one answer. Put it in `answer`. The reader stops researching here.
- `contested` — competing answers. Each camp names what it optimises for and what decides between them for this reader.

Settled things still print plainly inside a contested field. Only the genuinely split points go `contested`.

## `learn_deep` — "What must I really understand?"

Things the reader must be able to do themselves.

**`body` names what concretely breaks if they skip this.** Name a failure. "You will understand it better" is not a failure; "your app loses every customer record on the first crash" is.

## `cheat_codes` — "What do I need to understand, but never build?"

Leverage: results without mastery. Know what it does and why it exists. Never how it works inside.

A `type` appears only when the topic holds one.

- **rule** — a decision framework. `body` names what it decides for you, **and where it breaks**. Every rule of thumb has an edge, and naming the edge is what makes it safe to lean on.
- **habit** — a routine you repeat. `body` names the pain it removes before you would have felt it.
- **template** — copy once, move on. `body` names what it saves you from.
- **bet** — a tool carries the work. `body` names what it does, why it exists, and when it stops being enough. Bets age, so they carry `dated`.

## `traps` — "What will hurt me?"

**`body` carries the tell, and why beginners fall for it.**

The tell is how the reader spots it in their own work. A trap they cannot detect is trivia. The why makes it stick, and lets them recognise the same shape in another field.

## `path` — "In what order?"

The Map sorted so nothing arrives before what it depends on. Stages name **topics to tackle**. Everything real but not yet relevant lives in a later stage.

## `next`

Three narrower cheatmaps the reader could run after this one.

## The clash rule

When the Learn Deep judge and the Cheat codes judge claim the same part, ask: **can the reader still get this wrong while using the recommended default?**

- **No** — the default absorbs it completely. Cheat codes only.
- **Yes** — it appears in both. The Cheat codes entry names what carries the work. The Learn Deep entry covers **only the decisions the tool leaves to the reader**, never the internals.

Authentication is the shape: a provider handles the cryptography, and the reader still chooses session length, token contents and logout behaviour — and can build something insecure on a perfect provider.

Each half carries a `link` naming the other.

## Ranking

Every list is ranked by **position in The Map** — what sits upstream ranks higher. Frequency in the findings decides nothing.

`cut_lines` marks where the page draws its divider: the number of items above the line.

## Confidence

Every item carries a `dot`, always visible, because it changes how the item is read:

- `green` — many independent sources agree.
- `amber` — practitioners disagree. Treat as a choice, not an instruction.
- `grey` — an inference. No source states it.

## Sources

Non-obvious claims cite an `n`. Obvious claims cite nothing — a footnote on "use version control" is noise.

## Shape

Every item earns its place through its `body`. There is no item cap and no graveyard section: an item that fails its required line leaves the plan.

The page names topics and decisions. Step-by-step instructions belong to the `teach` skill, which is where this reader goes next.

## Rendering it another way

`plan.json` holds content and this file holds shape, so anything that reads both can produce the page. For a bespoke design on one topic instead of the standard template, hand a Sonnet agent `plan.json`, this file, and the `artifact-design` skill, and let it write the HTML — then skip `render.py`. That costs roughly 35k output tokens a run, which is why the script is the default.
