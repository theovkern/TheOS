---
name: ask-the-board
description: Ask the personal Board of Advisors (currently Dr. K, Paul Graham, DHH/37signals, Alex Hormozi, Charlie Munger, Ray Dalio — see the board's README for the live roster) for their take on a question or decision. Each advisor answers independently in their own voice, grounded in their knowledge wiki; agreements and disagreements are flagged rather than smoothed over; the takes are synthesized into one recommended decision. Use when the user wants to "ask the board," get advisor opinions, or run a decision past the board.
---

# Ask the Board

Runs a question through the personal advisory board defined in `projects/advisory-board/`. Each seat is a
distinct decision lens that answers independently, in-voice, grounded in curated source material — then
gets synthesized into a recommendation. Never averaged.

## The question

The user's message (whatever follows `/ask-the-board`, or the question they just asked in conversation if
invoked that way) is the question to put to the board. If it's genuinely unclear what's being asked, ask
the user to clarify before consulting the board.

## Cost discipline

This skill is expensive if run naively — reading all six wikis plus README plus the profile is ~15-20k
tokens. Two rules to keep it cheap:

- **Reuse, don't re-read.** If README, a seat's wiki, or the career profile is already present earlier in
  this conversation (from a prior `/ask-the-board` call or otherwise) and nothing in the conversation
  suggests it changed on disk, use what's already in context instead of reading it again.
- **Scope to what's asked.** Only pull in the full six-seat board when the question is genuinely broad or
  the user asks for "the board" / "everyone." If the user names specific advisors ("ask Munger and PG
  about X") or the question obviously sits in one lane, only read the wikis for the relevant seat(s) —
  see step 1 below for how to decide.

## Steps

1. Read `projects/advisory-board/README.md` (if not already in context). It's the source of truth for the
   current board composition (seats), the **Category coverage** lanes, the **Productive tensions**, and
   the **Default routing** guidance. Use it to decide scope for this question:
   - If the user named specific advisors, that's the scope — full stop.
   - Otherwise, if the question clearly maps to one or two of README's category-coverage lanes (e.g.
     "should I hire someone" → building a business), scope to the seats listed for that lane.
   - If the question is broad, a life/career decision, or the user asked for "the board" generally,
     scope to all six seats — this is the default when in doubt, since the tensions between distant seats
     are often exactly what's valuable.
   - Tell the user which seats you're consulting if you narrowed it, so they can ask for the full board
     if that's not what they wanted.
2. For each seat in scope, read its file in `projects/advisory-board/knowledge/wiki/` (skip any already in
   context). Each ends with a "How this seat argues (for board use)" section written specifically for this
   purpose: signature questions, voice notes, and named tensions with other seats. Ground every take in
   these files, not in generic outside knowledge of these public figures.
3. If the question is personal, career, or product-related, also read `career-coach-profile.md` at the
   repo root (`sbos/career-coach-profile.md`, skip if already in context) — it's the user's specific
   situation (goals, blockers, product, constraints) that the board is calibrated against per the README's
   opening line.
4. For **each seat in scope**, in the board order given by README, write their take:
   - Lead with the advisor's name (bold or as a small header).
   - Answer in first person, in their own voice and vocabulary — pull terms and frameworks from that
     seat's wiki (Vocabulary / Core ideas / Stances sections).
   - Ground the take in their actual frameworks, stances, and recurring examples — not a paraphrase of
     what "someone like them" might generically say.
   - Keep each take tight: a few sentences to a short paragraph, not an essay.
5. Add a **"Where they agree / disagree"** section (skip this and step 6's tension-weighing if scope is a
   single seat — there's nothing to cross-reference). Check the question against README's named productive
   tensions first and surface any that are actually in play among the seats in scope — but also call out
   any other agreement or disagreement that emerges specifically from this question, even if it isn't one
   of the pre-named tensions. Don't manufacture consensus that isn't there, and don't force a tension where
   the seats actually align.
6. Add a **"What I'd actually do"** section: one concrete recommendation, not an average of the takes. Use
   README's default-routing heuristic as a starting point (which seat is "upstream" for this kind of
   question), weigh any surfaced tensions explicitly, and ground the call in the user's actual situation
   from `career-coach-profile.md` where relevant. If the honest answer genuinely depends on something
   unresolved, say what that something is and what would resolve it — don't hide behind both-sides-ism.

## Notes

- Don't resolve tensions the board is deliberately designed to hold open (README: "Don't average the
  board"). The synthesis step is where a side gets taken, not where seats get flattened into agreement.
- If a wiki file is missing or thin for a seat, say so briefly and give that seat's take at lower
  confidence rather than skipping the seat or inventing depth the grounding doesn't support.
- The board's composition and tensions can change as `projects/advisory-board/` evolves — treat README and
  the wiki files as the live source of truth (re-reading when not already in context) rather than relying
  on the seat list summarized in this skill's description.
