#!/usr/bin/env node
// Brings the box it runs in current with the TheOS clone it lives in. The kit's clone step runs it, in a new
// box and in a live one, so there is one definition of a current box. Inside a box only, as the box user.
// Safe to run twice: each step converges. A failing step does not stop the ones after it, because the guard
// must be wired even when a plugin download failed.
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installTools } from "./install-tools.mjs";
import { wireClaudeGuard } from "./wire-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// pstack-codex is not here: Codex is not in a box.
const MARKETPLACES = ["anthropics/claude-plugins-official", "cursor/plugins"];
const PLUGINS = ["mattpocock-skills@claude-plugins-official", "pstack@cursor-plugins"];

/** Makes `link` a symlink to `target`. A real folder already there is parked beside it. */
export function linkRules(link, target) {
  const current = lstatSync(link, { throwIfNoEntry: false });
  if (current?.isSymbolicLink()) {
    if (readlinkSync(link) === target) return;
    rmSync(link);
  } else if (current) {
    // What was parked before is an older copy of the same repo files, so the newest park replaces it.
    rmSync(`${link}-replaced`, { recursive: true, force: true });
    renameSync(link, `${link}-replaced`);
  }
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link, "dir");
}

const claude = (...args) => execFileSync("claude", args, { stdio: "inherit" });

// `install` only adds a missing plugin; `update` moves an installed one to what the marketplace offers.
function installPlugins() {
  for (const marketplace of MARKETPLACES) claude("plugin", "marketplace", "add", marketplace);
  claude("plugin", "marketplace", "update");
  for (const plugin of PLUGINS) {
    claude("plugin", "install", plugin, "--scope", "user");
    claude("plugin", "update", plugin, "--scope", "user");
  }
}

function refresh() {
  const home = homedir();
  // The guard goes last: installing a plugin rewrites ~/.claude/settings.json too.
  const steps = [
    ["tools", () => installTools({ profile: "box", print: false })],
    ["rules", () => linkRules(join(home, ".claude", "rules"), join(root, "rules"))],
    ["plugins", installPlugins],
    ["guard", () => wireClaudeGuard(join(home, ".claude", "settings.json"), join(root, "hooks", "deny-dangerous.mjs"))],
  ];
  const failed = [];
  for (const [name, run] of steps) {
    console.log(`refresh ${name}`);
    try {
      run();
    } catch (error) {
      failed.push(name);
      console.error(`FAIL  ${name}: ${error.message}`);
    }
  }
  if (failed.length > 0) {
    console.error(`refresh failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) refresh();
