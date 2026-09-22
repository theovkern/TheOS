# The subtraction pass

Run against `<slug>.plan.json`, before any HTML exists, with no web access. It is cheap: it re-reads a few thousand tokens of JSON rather than a rendered page.

Its bias is **removal**. A model asked "did I do my best?" answers "yes, and I could add more", then pads — so this pass never asks that. It answers eight fixed questions.

## The eight checks

1. **Headline** — is it a real reframe, or a sentence that would fit any topic? A platitude is cut, and `headline` goes to `null`.
2. **Required lines** — does every `body` name something concrete? A vague one means the item drops out, or moves down a rank.
3. **Placement** — is anything in `cheat_codes` that the reader must do themselves, or the reverse? Move it. Where an item sits in both, apply the clash rule in [`page-spec.md`](page-spec.md) and confirm it earns both places.
4. **Traps** — is each one a real pattern with a tell, or a warning to be careful? A warning is cut.
5. **Ranking** — does item 1 really sit upstream of item 5? Reorder, and move `cut_lines` to where it belongs.
6. **Instructions** — does any `path` stage tell the reader what to do rather than what to tackle? Rewrite it as a topic.
7. **Dots** — is anything `green` with no `sources` entry you can point at? Make it `grey`.
8. **What is missing that beats item N?** Name it, and name the item it beats.

## What the pass may change

- **Reorder** — freely, as often as the ranking needs.
- **Add** — at most one item per pass, and only through check 8. The new item names the item it outranks. Outranking means it sorts above; the beaten item stays on the page.
- **Remove** — only through a failed `body`, checks 1 to 4. An addition never removes anything.

## How many passes

Run once.

Run a second time only when the first pass moved an item between sections — the structure changed, so the ranking is worth re-reading. Stop at two.

## Log

Append to `<slug>.notes.md`: what was cut, what moved, what was added, and the reason for each. The log stays in the notes and off the page.
