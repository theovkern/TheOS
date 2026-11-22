import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCK, withAgentBlock } from "./install-agent-app.mjs";

const DEBIAN = `# ~/.bashrc: executed by bash(1) for non-login shells.

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac
alias ll='ls -alF'
`;

test("the block lands above the interactive guard, which Claude Code's shells never pass", () => {
  const out = withAgentBlock(DEBIAN);
  assert.ok(out.indexOf(BLOCK) < out.indexOf("# If not running interactively"));
  assert.ok(out.endsWith("alias ll='ls -alF'\n"));
});

test("without the comment, the bare case guard still counts as the guard", () => {
  const out = withAgentBlock("export A=1\ncase $- in\n  *i*) ;;\n  *) return;;\nesac\n");
  assert.ok(out.startsWith("export A=1\n" + BLOCK));
});

test("an older block is replaced in place, keeping everything around it", () => {
  const old = "# healthos-agent: old wording\nif true; then\n  gh() { :; }\nfi\n";
  const out = withAgentBlock("# top\n" + old + "\n# If not running interactively\nrest\n");
  assert.equal(out, "# top\n" + BLOCK + "\n# If not running interactively\nrest\n");
});

test("a bashrc with no guard gets the block at the end", () => {
  assert.equal(withAgentBlock("export A=1\n"), "export A=1\n\n" + BLOCK);
  assert.equal(withAgentBlock(""), BLOCK);
});

test("running twice changes nothing the second time", () => {
  for (const start of ["", "export A=1\n", DEBIAN]) {
    const once = withAgentBlock(start);
    assert.equal(withAgentBlock(once), once);
  }
});

test("the shipped block is one if with no underscore helper the shell snapshot would drop", () => {
  assert.match(BLOCK, /^# healthos-agent:/);
  assert.match(BLOCK, /^fi\n$/m);
  assert.doesNotMatch(BLOCK, /^\s*_\w+\s*\(\)/m);
});
