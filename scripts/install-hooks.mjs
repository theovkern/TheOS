#!/usr/bin/env node
// Registers the command guard in every harness on this machine.
// Safe to run twice: an existing guard entry is replaced, not duplicated.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const guard = join(repoRoot, "hooks", "deny-dangerous.mjs");
const home = homedir();

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
};

const command = (flag) => `node "${guard}" --${flag}`;
const mentionsGuard = (entry) => JSON.stringify(entry).includes("deny-dangerous");

// --- Claude Code: PreToolUse, blocks on exit 2 -------------------------------
const claudePath = join(home, ".claude", "settings.json");
const claude = readJson(claudePath, {});
claude.hooks ??= {};
claude.hooks.PreToolUse = (claude.hooks.PreToolUse ?? []).filter((e) => !mentionsGuard(e));
claude.hooks.PreToolUse.push({
  matcher: "Bash",
  hooks: [{ type: "command", command: command("claude"), timeout: 10 }],
});
writeJson(claudePath, claude);
console.log(`Claude Code  ${claudePath}`);

// --- Cursor: beforeShellExecution, blocks via JSON on stdout -----------------
const cursorPath = join(home, ".cursor", "hooks.json");
const cursor = readJson(cursorPath, { version: 1 });
cursor.version ??= 1;
cursor.hooks ??= {};
cursor.hooks.beforeShellExecution = [{ command: command("cursor") }];
writeJson(cursorPath, cursor);
console.log(`Cursor       ${cursorPath}`);

// --- Codex: beforeShellExecution, blocks on exit 2 ---------------------------
const codexPath = join(home, ".codex", "hooks.json");
const codex = readJson(codexPath, {});
codex.hooks ??= {};
codex.hooks.beforeShellExecution = [{ command: command("codex") }];
writeJson(codexPath, codex);
console.log(`Codex        ${codexPath}`);

console.log("\nGuard registered. Verify with:");
console.log(`  echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}' | node "${guard}" --claude`);
console.log("  (it must print a block message and exit 2)");
