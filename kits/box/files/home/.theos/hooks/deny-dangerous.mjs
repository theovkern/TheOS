#!/usr/bin/env node
// Global dangerous-command guard.
//
// Forked from davidondrej/pi-config. Three deliberate changes:
//   1. Windows destructive patterns, so the guard is not blind on this machine.
//   2. An unreadable pattern file blocks and shouts. Upstream fails open, which
//      leaves you believing you are protected while everything is allowed.
//   3. Node instead of bash + jq, so a missing jq cannot silently disarm it.
//
// One executable, three harnesses. The harness is named by argv:
//   --claude  exit 2 blocks, reason on stderr   (PreToolUse)
//   --cursor  JSON verdict on stdout            (beforeShellExecution)
//   --codex   exit 2 blocks, reason on stderr
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PATTERNS_FILE = join(dirname(fileURLToPath(import.meta.url)), "dangerous-patterns.txt");

/** POSIX bracket classes, translated to what JavaScript understands.
 *  "[:space:]" sits inside a bracket expression, so replacing it in place turns
 *  "[[:space:]]" into "[\s]" and "[;&|[:space:]]" into "[;&|\s]". Both correct. */
export function toJsRegex(pattern) {
  return pattern.replaceAll("[:space:]", String.raw`\s`);
}

/** Parses the denylist. Throws rather than returning an empty list, because an
 *  empty denylist and a missing denylist look identical to a caller. */
export function loadPatterns(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => {
      try {
        return [new RegExp(toJsRegex(line), "m")];
      } catch {
        return []; // one bad line must not disarm the whole list
      }
    });
}

/** Pure. Returns the matching pattern, or null when the command is allowed. */
export function findMatch(command, patterns) {
  for (const pattern of patterns) {
    if (pattern.test(command)) return pattern;
  }
  return null;
}

/** Pulls the shell command out of whichever payload shape the harness sends. */
export function extractCommand(payload) {
  return String(
    payload?.tool_input?.command ??
      payload?.command ??
      payload?.input?.command ??
      payload?.arguments?.command ??
      "",
  );
}

// ---- CLI -------------------------------------------------------------------
// Everything below runs only when the file is executed as a hook. A test that
// imports this module must not block on stdin.

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {

  const readStdin = async () => {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  };

  const harness = process.argv.find((a) => a.startsWith("--"))?.slice(2) ?? "claude";

  const refuse = (message) => {
    if (harness === "cursor") {
      process.stdout.write(JSON.stringify({ permission: "deny", userMessage: message, agentMessage: message }));
      process.exit(0);
    }
    process.stderr.write(message);
    process.exit(2);
  };

  const allow = () => {
    if (harness === "cursor") process.stdout.write(JSON.stringify({ permission: "allow" }));
    process.exit(0);
  };

  const raw = await readStdin();

  let patterns;
  try {
    patterns = loadPatterns(readFileSync(PATTERNS_FILE, "utf8"));
    if (patterns.length === 0) throw new Error("the denylist is empty");
  } catch (error) {
    refuse(
      `COMMAND GUARD DISARMED. Cannot read the denylist at ${PATTERNS_FILE} (${error.message}).\n` +
        `Every command is blocked until this is fixed, because an unreadable denylist that allows ` +
        `everything is worse than no guard at all. Tell the user to repair the file.`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    refuse(`COMMAND GUARD: could not parse the hook payload as JSON, so the command cannot be checked. Blocking.`);
  }

  const command = extractCommand(payload);
  if (!command) allow();

  const match = findMatch(command, patterns);
  if (!match) allow();

  refuse(
    `Blocked by the global dangerous-command guard (${PATTERNS_FILE}).\n` +
      `Matched pattern: ${match.source}\n` +
      `Do not retry it and do not work around the guard. Explain the block to the user instead.`,
  );
}
