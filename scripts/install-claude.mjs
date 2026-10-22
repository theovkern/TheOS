#!/usr/bin/env node
// Installs Claude Code, puts it on PATH, adds the `cc` shortcut, registers my
// status line, links my rules, and installs the foreign plugins listed in the README with
// Claude Code's own installer.
// Safe to run twice: every step checks before it changes anything.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const statusline = join(repoRoot, "statusline", "statusline.mjs");
const home = homedir();
const windows = platform() === "win32";
const bin = join(home, ".local", "bin");

// Each entry is installed with `claude plugin install`, the authors' installer.
// pstack-codex is mine, in plugins/, installed from this repo's marketplace.
const MARKETPLACES = ["cursor/plugins", "theovkern/TheOS"];
const PLUGINS = ["mattpocock-skills@claude-plugins-official", "pstack@cursor-plugins", "pstack-codex@theos"];

const run = (file, args) => execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryRun = (file, args) => {
  try {
    return run(file, args);
  } catch {
    return null;
  }
};
const powershell = (script) => run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);

// A marked block in a profile file, replaced on every run instead of appended.
const BEGIN = "# >>> TheOS >>>";
const END = "# <<< TheOS <<<";
const writeBlock = (path, lines) => {
  const block = [BEGIN, ...lines, END].join("\n");
  const old = existsSync(path) ? readFileSync(path, "utf8") : "";
  const pattern = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
  const next = pattern.test(old) ? old.replace(pattern, block) : `${old}${old && !old.endsWith("\n") ? "\n" : ""}${block}\n`;
  mkdirSync(dirname(path), { recursive: true });
  if (next !== old) writeFileSync(path, next);
  console.log(`${next === old ? "unchanged" : "updated  "}  ${path}`);
};

// --- Claude Code: official native installer, into ~/.local/bin ---------------
process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;
const version = tryRun("claude", ["--version"]);
if (version) {
  console.log(`Claude Code  ${version}, already installed`);
} else {
  console.log("Claude Code  installing...");
  if (windows) powershell("irm https://claude.ai/install.ps1 | iex");
  else run("bash", ["-c", "curl -fsSL https://claude.ai/install.sh | bash"]);
  console.log(`Claude Code  ${run("claude", ["--version"])}`);
}

// --- PATH and the `cc` shortcut -----------------------------------------------
// An alias, never a `cc` executable: on macOS and Linux `cc` is the C compiler,
// and an alias only exists in interactive shells, so builds still find gcc.
if (windows) {
  const userPath = powershell('[Environment]::GetEnvironmentVariable("Path", "User")');
  const entries = userPath.split(";").filter(Boolean);
  if (entries.some((p) => p.replace(/\\$/, "").toLowerCase() === bin.toLowerCase())) {
    console.log(`PATH         ${bin}, already set`);
  } else {
    powershell(`[Environment]::SetEnvironmentVariable("Path", "${[...entries, bin].join(";")}", "User")`);
    console.log(`PATH         added ${bin} (new terminals only)`);
  }

  const profiles = [powershell("$PROFILE")];
  const pwsh = tryRun("pwsh", ["-NoProfile", "-Command", "$PROFILE"]);
  if (pwsh) profiles.push(pwsh);
  for (const profile of profiles) writeBlock(profile, ["Set-Alias -Name cc -Value claude"]);
}

// Git Bash on Windows reads ~/.bashrc too, so the POSIX block goes everywhere.
const posix = ['case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac', "alias cc=claude"];
for (const rc of [".bashrc", ".zshrc"]) writeBlock(join(home, rc), posix);

// --- Status line ----------------------------------------------------------------
const settingsPath = join(home, ".claude", "settings.json");
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
settings.statusLine = { type: "command", command: `node "${statusline}"`, refreshInterval: 30 };
mkdirSync(dirname(settingsPath), { recursive: true });
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log(`status line  ${settingsPath}`);

// --- Rules: ~/.claude/rules is a link to rules/ in this repo ---------------------
// The whole folder, not single files: Windows links a folder without Developer
// Mode, and /pstack:setup-pstack rewrites its file in place, so the change
// lands in git where it can be reviewed or reverted.
const rulesSource = join(repoRoot, "rules");
const rulesLink = join(home, ".claude", "rules");
const linked = existsSync(rulesLink) ? realpathSync(rulesLink) : null;
if (linked && linked.toLowerCase() === realpathSync(rulesSource).toLowerCase()) {
  console.log(`rules        ${rulesLink}, already linked`);
} else {
  if (existsSync(rulesLink)) {
    renameSync(rulesLink, `${rulesLink}-replaced`);
    console.log(`rules        parked the old folder in ${rulesLink}-replaced`);
  }
  symlinkSync(rulesSource, rulesLink, windows ? "junction" : "dir");
  console.log(`rules        ${rulesLink} -> ${rulesSource}`);
}

// --- Foreign plugins ------------------------------------------------------------
for (const marketplace of MARKETPLACES) {
  run("claude", ["plugin", "marketplace", "add", marketplace]);
  console.log(`marketplace  ${marketplace}`);
}
for (const plugin of PLUGINS) {
  run("claude", ["plugin", "install", plugin, "--scope", "user"]);
  console.log(`plugin       ${plugin}`);
}

console.log("\nOpen a new terminal for PATH and `cc`. Then run /setup-matt-pocock-skills and /pstack:setup-pstack once.");
