# Link skills

`npm run link` makes one link per skill in `skills/` inside each harness's skills folder, so a skill written once is live in Claude Code, Codex and OpenCode.

## Sub-features

- `link-create` links every skill into `~/.claude/skills` and `~/.agents/skills`.
- `link-idempotent` a second run reports every link as `unchanged`.
- `link-dry-run` `--dry-run` prints the plan and writes nothing.
- `link-replace` a real directory in the way is moved to `<destination>-replaced/`, not deleted.
- `link-reserved` a skill named `synced` is refused.

## How to get to it (user POV)

- Run `npm run link` in the repo root.
- Run `npm run link -- --dry-run` to preview.
- It also runs as part of `npm run setup`.

## Driving it with verify.mjs

Preconditions: `doctor` passes and `<runDir>/home` is empty.

- **Dry run.** `node .claude/skills/verify-theos/verify.mjs run <runDir> link-dry -- npm run link -- --dry-run`. Exit 0, lines start with `[dry-run] created`, and `ls <runDir>/home` shows nothing.
- **Create.** `... run <runDir> link -- npm run link`. Exit 0, last line reads `N skills, 2N links across 2 destinations.`, and `ls <runDir>/home/.claude/skills` and `ls <runDir>/home/.agents/skills` list the same names as `ls skills`.
- **Link target.** `ls <runDir>/home/.claude/skills/ask-the-board` shows `SKILL.md`, the repo's copy.
- **Idempotent.** `... run <runDir> link-again -- npm run link`. Every line starts with `unchanged`.
- **Replace.** Start from a fresh `init`, run `mkdir -p <runDir>/home/.claude/skills/locomp` so a real directory sits where a link belongs, then run `npm run link`. The `locomp` line says `replaced (old copy kept at ...-replaced/...)` and `ls <runDir>/home/.claude/skills-replaced` lists the parked directory.
- **Proof.** Keep the `link` and `link-again` transcripts plus the two `ls` listings.

## Gotchas

- `link` links untracked skill folders in `skills/` too; a count mismatch with `git ls-files` is not a bug.
- `ls skills` counts directories that hold a `SKILL.md`; nested folders without one are walked, not linked.
- On Windows the links are junctions. Do not `rm -r` the sandbox home by hand; use `clean`.
- Cleanup must leave `skills/` intact. Verify with `ls skills` afterward.
