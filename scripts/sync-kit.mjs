#!/usr/bin/env node
// An sbx kit is one self-contained directory, so kits/box carries copies of the repo files it runs inside
// a box. This refreshes the copies from their sources. `npm test` fails when one is stale.
// Safe to run twice: a copy that already matches is not touched.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_DIR = "kits/box";

// Under ~/.theos the box has the same layout as the repo, so wire-guard and install-tools find their
// neighbours there exactly as they do here.
const UNDER_THEOS = ["hooks/deny-dangerous.mjs", "hooks/dangerous-patterns.txt", "scripts/install-tools.mjs", "scripts/tools.json", "scripts/wire-guard.mjs"];

/** Each pair is a repo file and where the kit keeps its copy, relative to the kit. */
export const KIT_COPIES = [
  ...UNDER_THEOS.map((source) => [source, `files/home/.theos/${source}`]),
  ["rules/pstack-models.md", "files/home/.claude/rules/pstack-models.md"],
];

const same = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));

/** The copies that are missing or differ from their source. */
export function kitDrift(repoRoot) {
  return KIT_COPIES.filter(([source, copy]) => !same(join(repoRoot, source), join(repoRoot, KIT_DIR, copy))).map(([source, copy]) => ({
    source,
    copy: join(KIT_DIR, copy),
  }));
}

/** Overwrites every drifted copy with its source and returns what it changed. */
export function syncKit(repoRoot) {
  const drift = kitDrift(repoRoot);
  for (const { source, copy } of drift) {
    mkdirSync(dirname(join(repoRoot, copy)), { recursive: true });
    copyFileSync(join(repoRoot, source), join(repoRoot, copy));
  }
  return drift;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const changed = syncKit(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  for (const { source, copy } of changed) console.log(`updated  ${copy}  (from ${source})`);
  if (changed.length === 0) console.log(`${KIT_DIR} is in sync`);
}
