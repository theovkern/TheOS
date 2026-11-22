// The one place that knows the shape of the command guard's entry in Claude Code's settings.json.
// install-hooks.mjs uses it for a machine and box-refresh.mjs for a box, where it merges into the file
// because sbx and Claude Code write the rest of it.
// Safe to run twice: an existing guard entry is replaced, not duplicated.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

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
