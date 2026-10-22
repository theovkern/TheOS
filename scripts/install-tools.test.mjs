import { test } from "node:test";
import assert from "node:assert/strict";
import { installers } from "./install-tools.mjs";

const PACKAGE_MANAGERS = ["winget", "brew"];

for (const os of ["win32", "darwin", "linux"]) {
  test(`${os}: Claude Code and Codex never come from a package manager, which would stop auto-update`, () => {
    const { claude, codex } = installers(os);
    for (const [file] of [...claude, ...codex]) assert.ok(!PACKAGE_MANAGERS.includes(file), `${os} installs with ${file}`);
  });

  test(`${os}: every tool has an installer`, () => {
    assert.deepEqual(Object.keys(installers(os)).sort(), ["acli", "claude", "codex", "gh", "glab"]);
  });
}
