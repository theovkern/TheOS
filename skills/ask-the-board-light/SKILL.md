---
name: ask-the-board-light
description: Cheap version of ask-the-board — ask the personal Board of Advisors (Dr. K, Paul Graham, DHH/37signals, Alex Hormozi, Charlie Munger, Ray Dalio) for their take on a question or decision, grounded in condensed per-seat wikis instead of the full knowledge base. Each advisor answers independently in their own voice; agreements and disagreements are flagged rather than smoothed over; takes are synthesized into one recommendation. Use when the user wants a fast/cheap board consult, or explicitly asks for "the light board" / "ask-the-board-light".
---

# Ask the Board (light)

Cheap version of `ask-the-board`. Same mechanics — independent in-voice takes, surfaced tensions, one
synthesized recommendation — but grounded in `projects/advisory-board/knowledge/wiki-light/` instead
of the full `knowledge/wiki/` + `README.md`. The light wikis are condensed to core ideas, key terms,
stances, and the "how this seat argues" section for each seat; recurring stories and source-quality
notes are dropped. Expect a less richly-voiced answer in exchange for a much smaller read.

If the user wants the full-fidelity version (richer voice, more examples), use `ask-the-board`
instead.

## The question

The user's message (whatever follows `/ask-the-board-light`, or the question they just asked in
conversation if invoked that way) is the question to put to the board. If it's genuinely unclear what
's being asked, ask the user to clarify before consulting the board.

## Steps

1. Read `projects/advisory-board/knowledge/wiki-light/board.md` (if not already in context) — the
   condensed board composition, category-coverage lanes, productive tensions, and default routing.
   Use it to decide scope:
   - If the user named specific advisors, that's the scope — full stop.
   - Otherwise, if the question clearly maps to one or two category-coverage lanes, scope to the
     seats listed for that lane.
   - If the question is broad, a life/career decision, or the user asked for "the board" generally,
     scope to all six seats.
   - Tell the user which seats you're consulting if you narrowed it.
2. For each seat in scope, read its file in `projects/advisory-board/knowledge/wiki-light/` (skip any
   already in context). Each ends with a "How this seat argues (for board use)" section: signature
   questions, voice notes, and named tensions. Ground every take in these files.
3. If the question is personal, career, or product-related, also read `career-coach-profile.md` at
   the repo root (`sbos/career-coach-profile.md`, skip if already in context).
4. For **each seat in scope**, in board order (`board.md`), write their take:
   - Lead with the advisor's name.
   - Answer in first person, in their own voice and vocabulary — pull terms from that seat's
     Core ideas / Key terms / Stances, and match the tone in their "How this seat argues" section.
   - Keep each take tight: a few sentences, not an essay.
5. Add a **"Where they agree / disagree"** section (skip if scope is a single seat). Check the
   question against `board.md`'s named tensions first, but also surface any other agreement or
   disagreement that emerges from this specific question. Don't manufacture consensus or force a
   tension where the seats align.
6. Add a **"What I'd actually do"** section: one concrete recommendation, not an average. Use
   `board.md`'s default-routing heuristic as a starting point, weigh any surfaced tensions explicitly,
   and ground the call in the user's situation from `career-coach-profile.md` where relevant.

## Notes

- Don't resolve tensions the board is designed to hold open — the synthesis step is where a side gets
  taken, not where seats get flattened into agreement.
- If a light wiki file is thin for what's being asked, say so briefly and give that seat's take at
  lower confidence rather than inventing depth the grounding doesn't support — or fall back to the
  corresponding file in `knowledge/wiki/` (full version) for that one seat if precision matters more
  than cost for this question.
- The light wikis are a condensed derivative of `knowledge/wiki/` + `README.md`. If those source files
  change materially, `wiki-light/` should be re-derived — treat it as possibly stale if the full docs
  have obviously moved on.
