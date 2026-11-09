#!/usr/bin/env node
// Gives Windows PowerShell git tab completion (branches, remotes, commands) via posh-git.
// posh-git imports the first time the shell sits idle, not before the prompt: importing costs ~1.5 s.
// It cannot import on another thread: a module binds to the runspace that imports it.
// Safe to run twice: the module installs only when missing, the profile block only when absent.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EAGER_BLOCK = "Import-Module posh-git\n$GitPromptSettings.EnablePromptStatus = $false\n";

const ON_TAB_BLOCK = `Register-ArgumentCompleter -Native -CommandName git, tgit, gitk -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    Import-Module posh-git -Global
    $GitPromptSettings.EnablePromptStatus = $false
    $line = $commandAst.Extent.Text
    $column = $cursorPosition - $commandAst.Extent.StartOffset
    (TabExpansion2 -inputScript $line.PadRight($column) -cursorColumn $column).CompletionMatches
}
`;

export const PROFILE_BLOCK = `Register-EngineEvent -SourceIdentifier PowerShell.OnIdle -MaxTriggerCount 1 -Action {
    Import-Module posh-git -Global
    $GitPromptSettings.EnablePromptStatus = $false
} | Out-Null
`;

export function withPoshGit(profile) {
  for (const old of [EAGER_BLOCK, ON_TAB_BLOCK]) {
    if (profile.includes(old)) return profile.replace(old, PROFILE_BLOCK);
  }
  if (/^\s*Import-Module\s+posh-git\b/im.test(profile)) return profile;
  if (profile.trim() === "") return PROFILE_BLOCK;
  return PROFILE_BLOCK + "\n" + profile;
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
