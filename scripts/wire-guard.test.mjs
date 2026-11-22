import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wireClaudeGuard, withClaudeGuard } from "./wire-guard.mjs";

const guardCommands = (settings) => settings.hooks.PreToolUse.filter((e) => JSON.stringify(e).includes("deny-dangerous")).map((e) => e.hooks[0].command);

test("an empty settings file gets the guard on Bash", () => {
  const settings = withClaudeGuard({}, "/g/deny-dangerous.mjs");
  assert.deepEqual(settings.hooks.PreToolUse, [
    { matcher: "Bash", hooks: [{ type: "command", command: 'node "/g/deny-dangerous.mjs" --claude', timeout: 10 }] },
  ]);
});

test("the settings sbx and Claude Code wrote stay as they were", () => {
  const before = {
    model: "opus",
    hooks: { PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "echo hi" }] }], Stop: [{ hooks: [] }] },
  };
  const snapshot = structuredClone(before);
  const after = withClaudeGuard(before, "/g/deny-dangerous.mjs");
  assert.equal(after.model, "opus");
  assert.deepEqual(after.hooks.Stop, before.hooks.Stop);
  assert.equal(after.hooks.PreToolUse[0].matcher, "Edit");
  assert.equal(after.hooks.PreToolUse.length, 2);
  assert.deepEqual(before, snapshot);
});

test("running twice, or after the guard moved, leaves one guard entry pointing at the new place", () => {
  const first = withClaudeGuard({}, "/old/deny-dangerous.mjs");
  const moved = withClaudeGuard(first, "/new/deny-dangerous.mjs");
  assert.deepEqual(guardCommands(moved), ['node "/new/deny-dangerous.mjs" --claude']);
  assert.deepEqual(withClaudeGuard(moved, "/new/deny-dangerous.mjs"), moved);
});

test("the file is created with its folder, then merged into, never overwritten", () => {
  const dir = mkdtempSync(join(tmpdir(), "wire-guard-"));
  const path = join(dir, "nested", "settings.json");
  wireClaudeGuard(path, "/g/deny-dangerous.mjs");
  assert.deepEqual(guardCommands(JSON.parse(readFileSync(path, "utf8"))), ['node "/g/deny-dangerous.mjs" --claude']);

  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), enabledPlugins: { "pstack@cursor-plugins": true } }));
  wireClaudeGuard(path, "/g/deny-dangerous.mjs");
  const merged = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(merged.enabledPlugins, { "pstack@cursor-plugins": true });
  assert.equal(guardCommands(merged).length, 1);
  assert.ok(readFileSync(path, "utf8").endsWith("}\n"));
});
