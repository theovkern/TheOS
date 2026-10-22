#!/usr/bin/env node
// Installs the forge and tracker CLIs: gh (GitHub), glab (GitLab), acli (Atlassian, for Jira).
// Each is the vendor's own CLI, installed with the platform's package manager where one carries it.
// Safe to run twice: a tool already on PATH is left alone.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const windows = platform() === "win32";
const mac = platform() === "darwin";
const bin = join(homedir(), ".local", "bin");

const run = (file, args) => execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const has = (file) => {
  try {
    run(file, ["--version"]);
    return true;
  } catch {
    return existsSync(join(bin, windows ? `${file}.exe` : file));
  }
};
const winget = (id) =>
  run("winget", ["install", "--id", id, "--exact", "--silent", "--accept-package-agreements", "--accept-source-agreements"]);

// acli is not in winget. Atlassian ships a bare exe, so it goes into ~/.local/bin, which
// install-claude already put on PATH.
const ACLI_EXE = "https://acli.atlassian.com/windows/latest/acli_windows_amd64/acli.exe";

const TOOLS = [
  { name: "gh", windows: () => winget("GitHub.cli"), mac: () => run("brew", ["install", "gh"]) },
  { name: "glab", windows: () => winget("GLab.GLab"), mac: () => run("brew", ["install", "glab"]) },
  {
    name: "acli",
    windows: () => {
      mkdirSync(bin, { recursive: true });
      run("curl.exe", ["-fsSL", "-o", join(bin, "acli.exe"), ACLI_EXE]);
    },
    mac: () => {
      run("brew", ["tap", "atlassian/homebrew-acli"]);
      run("brew", ["install", "acli"]);
    },
  },
];

if (!windows && !mac) {
  console.log("CLIs         skipped (install gh, glab and acli with your distribution's packages)");
} else {
  for (const tool of TOOLS) {
    if (has(tool.name)) {
      console.log(`${tool.name.padEnd(12)} already installed`);
      continue;
    }
    console.log(`${tool.name.padEnd(12)} installing...`);
    (windows ? tool.windows : tool.mac)();
    console.log(`${tool.name.padEnd(12)} installed`);
  }
  console.log("\nOpen a new terminal, then sign in: gh auth login, glab auth login, acli jira auth login --web");
}
