#!/usr/bin/env node
// Links my own skills into every agent harness at once.
//
// Only my skills. Foreign skills are installed with their author's own
// installer, listed in the README, and never linked from here.
//
// Split in two on purpose: planLinks is pure and holds every rule worth
// testing, applyPlan only touches the filesystem.
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Claude Code owns this folder and syncs it from the cloud. Two writers over
// one directory is a fight nobody wins.
export const RESERVED_NAMES = new Set(["synced"]);

// Two destinations cover four harnesses:
//   ~/.claude/skills  Claude Code, OpenCode
//   ~/.agents/skills  Codex, OpenCode, prime-agent
export const DESTINATIONS = ["~/.claude/skills", "~/.agents/skills"];

/** Walks a directory and returns { skillName: absolutePath } for every SKILL.md. */
export function discoverSkills(dir) {
  const found = {};
  if (!existsSync(dir)) return found;

  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const path = join(current, entry.name);
      if (existsSync(join(path, "SKILL.md"))) found[entry.name] = path;
      else walk(path);
    }
  };

  walk(dir);
  return found;
}

/**
 * Pure. Turns skills plus destinations into intended links.
 * Returns { links, errors } and never throws, so a caller can report every
 * problem at once instead of one per run.
 *
 * @param skills       { skillName: absPath }
 * @param destinations [absPath]
 */
export function planLinks(skills, destinations) {
  const errors = [];
  const links = [];

  for (const [name, from] of Object.entries(skills)) {
    if (RESERVED_NAMES.has(name)) {
      errors.push(`"${name}" is a reserved directory name and cannot be linked`);
      continue;
    }
    for (const destination of destinations) {
      links.push({ name, from, to: join(destination, name), destination });
    }
  }

  // A stable order keeps the printed plan and the tests readable.
  links.sort((a, b) => a.to.localeCompare(b.to));
  return { links, errors };
}

/**
 * Performs a plan. Returns a per-link outcome so the caller can print a summary.
 * A real directory in the way is moved aside rather than deleted, because a
 * hand-written skill at that path may have no other copy.
 */
export function applyPlan(links, { dryRun = false } = {}) {
  const results = [];
  const linkType = platform() === "win32" ? "junction" : "dir";

  for (const link of links) {
    const target = resolve(link.from);
    mkdirSync(link.destination, { recursive: true });

    let action = "created";

    if (existsSync(link.to) || isDanglingLink(link.to)) {
      const stat = lstatSync(link.to);

      if (stat.isSymbolicLink() || isJunction(link.to)) {
        if (resolve(readlinkSync(link.to)) === target) {
          results.push({ ...link, action: "unchanged" });
          continue;
        }
        if (!dryRun) unlinkSync(link.to);
        action = "relinked";
      } else {
        // Parked outside the skills folder on purpose: a backup left beside the
        // links is read by the harness as one more skill.
        const atticDir = `${link.destination}-replaced`;
        const aside = join(atticDir, `${link.name}-${Date.now()}`);
        if (!dryRun) {
          mkdirSync(atticDir, { recursive: true });
          renameSync(link.to, aside);
        }
        action = `replaced (old copy kept at ${aside})`;
      }
    }

    if (!dryRun) symlinkSync(target, link.to, linkType);
    results.push({ ...link, action });
  }

  return results;
}

const isDanglingLink = (path) => {
  try { lstatSync(path); return true; } catch { return false; }
};

// A Windows junction reports as a symlink to lstat, and readlink resolves it,
// so one check covers both platforms.
const isJunction = (path) => {
  try { readlinkSync(path); return true; } catch { return false; }
};

export const expandHome = (path) => (path.startsWith("~") ? join(homedir(), path.slice(1)) : path);

// ---- CLI -------------------------------------------------------------------

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dryRun = process.argv.includes("--dry-run");

  const skills = discoverSkills(join(repoRoot, "skills"));
  const destinations = DESTINATIONS.map((d) => resolve(expandHome(d)));
  const { links, errors } = planLinks(skills, destinations);

  if (errors.length) {
    console.error("cannot link:\n");
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }

  for (const result of applyPlan(links, { dryRun })) {
    console.log(`${dryRun ? "[dry-run] " : ""}${result.action.padEnd(10)} ${result.to}`);
  }

  console.log(`\n${Object.keys(skills).length} skills, ${links.length} links across ${destinations.length} destinations.`);
}
