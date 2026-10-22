#!/usr/bin/env node
// Gives Windows PowerShell git tab completion (branches, remotes, commands) via posh-git.
// Safe to run twice: the module installs only when missing, the profile lines only when absent.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PROFILE_LINES = ["Import-Module posh-git", "$GitPromptSettings.EnablePromptStatus = $false"];

export function withPoshGit(profile) {
  if (/^\s*Import-Module\s+posh-git\b/im.test(profile)) return profile;
  const block = PROFILE_LINES.join("\n") + "\n";
  if (profile.trim() === "") return block;
  return block + "\n" + profile;
}

const powershell = (script) =>
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim();

function main() {
  if (process.platform !== "win32") {
    console.log("Shell        skipped (not Windows)");
    return;
  }

  const installed = powershell("[bool](Get-Module -ListAvailable posh-git)") === "True";
  if (!installed) {
    console.log("posh-git     installing from the PowerShell Gallery");
    powershell("Install-Module posh-git -Scope CurrentUser -Force -AllowClobber");
  }

  const profilePath = powershell("$PROFILE");
  const before = existsSync(profilePath) ? readFileSync(profilePath, "utf8") : "";
  const after = withPoshGit(before);
  if (after !== before) {
    mkdirSync(dirname(profilePath), { recursive: true });
    writeFileSync(profilePath, after);
  }
  console.log(`posh-git     ${installed ? "present" : "installed"}, profile ${after === before ? "unchanged" : "updated"}: ${profilePath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
