---
name: vscdiff
description: Open one VS Code diff tab per touched file, against a branch, commit, or tag.
disable-model-invocation: true
---

# vscdiff

The argument names the **base**: a branch, commit, tag, or a phrase such as "the last three commits" or "before this session". With no argument, the base is `HEAD`, which shows the uncommitted work.

1. Turn the argument into one git ref that `git rev-parse --verify <ref>` accepts. A branch the user names may exist only on the remote: try `origin/<name>` too. Done when `rev-parse` succeeds; when two refs fit the phrase, ask which one.
2. Preview: `bash <this skill's folder>/open-diff.sh <ref> <scratchpad> --dry-run`. It lists every file it would open, one per line, with its git status (`??` is untracked). Past 20 files, show the user the list and ask before opening.
3. Open: the same command without `--dry-run`. The left side is the file at the merge base of `<ref>` and `HEAD`, so a branch base shows the changes a merge request would, plus the uncommitted work. The right side is the working-tree file, so edits made in the tab land in the repository.
4. Reply with the ref you used and the file count. Print the list only when the user did not see it in step 2.
