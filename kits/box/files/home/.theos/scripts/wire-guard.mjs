#!/usr/bin/env node
// Registers the command guard in Claude Code's settings.json. This is the only place that knows the
// shape of that entry: install-hooks.mjs imports it for a machine, and the box kit carries a copy that
// runs inside the box, where it merges into the file because sbx and Claude Code write the rest of it.
// The guard is the hooks/deny-dangerous.mjs next to this script's folder, in the repo and in the kit alike.
// Safe to run twice: an existing guard entry is replaced, not duplicated.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const mentionsGuard = (entry) => JSON.stringify(entry).includes("deny-dangerous");

/** Pure. The settings with exactly one guard entry in hooks.PreToolUse and everything else as it was. */
export function withClaudeGuard(settings, guard) {
  const hooks = settings.hooks ?? {};
  const others = (hooks.PreToolUse ?? []).filter((entry) => !mentionsGuard(entry));
  const entry = { matcher: "Bash", hooks: [{ type: "command", command: `node "${guard}" --claude`, timeout: 10 }] };
  return { ...settings, hooks: { ...hooks, PreToolUse: [...others, entry] } };
}

export function wireClaudeGuard(settingsPath, guard) {
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(withClaudeGuard(settings, guard), null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const settingsPath = join(homedir(), ".claude", "settings.json");
  wireClaudeGuard(settingsPath, resolve(here, "..", "hooks", "deny-dangerous.mjs"));
  console.log(`Claude Code  ${settingsPath}`);
}
