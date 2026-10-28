#!/usr/bin/env node
// Installs my command-line tools: gh (GitHub), glab (GitLab), acli (Atlassian, for Jira),
// Claude Code and Codex. winget on Windows, Homebrew on macOS, release binaries on Linux.
// Claude Code and Codex never come from a package manager: those builds do not auto-update,
// the native installer and npm ones do.
// Safe to run twice: a tool already on PATH is left alone.
import { execFileSync } from "node:child_process";
import { arch, homedir, platform } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = join(homedir(), ".local", "bin");

// A package installed but not yet on this terminal's PATH makes winget exit with one of these.
const WINGET_ALREADY_INSTALLED = [0x8a15002b, 0x8a150061]; // no applicable upgrade, package already installed
// Linux takes each tool's release binary into ~/.local/bin, so it needs neither Homebrew nor sudo.
// These do not self-update: delete one from ~/.local/bin and run this again to upgrade it.
const cpu = { x64: "amd64", arm64: "arm64" }[arch()];
const tarball = (name, latestTag, url, member) => [
  "bash", "-c",
  `set -eo pipefail; mkdir -p "${bin}"; v=$(${latestTag}); v=\${v#v}; curl -fsSL "${url}" | tar -xzO "${member}" > "${bin}/${name}"; chmod +x "${bin}/${name}"`,
];

const winget = (id) => ["winget", "install", "--id", id, "--exact", "--silent", "--accept-package-agreements", "--accept-source-agreements"];

// Each tool maps to the commands that install it, per platform.
export function installers(os) {
  const windows = os === "win32";
  return {
    gh: {
      win32: [winget("GitHub.cli")],
      darwin: [["brew", "install", "gh"]],
      linux: [tarball("gh", "basename $(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/cli/cli/releases/latest)",
        `https://github.com/cli/cli/releases/download/v$v/gh_\${v}_linux_${cpu}.tar.gz`, `gh_\${v}_linux_${cpu}/bin/gh`)],
    }[os],
    glab: {
      win32: [winget("GLab.GLab")],
      darwin: [["brew", "install", "glab"]],
      linux: [tarball("glab", "curl -fsSL https://gitlab.com/api/v4/projects/gitlab-org%2Fcli/releases/permalink/latest | grep -o '\"tag_name\":\"[^\"]*\"' | cut -d'\"' -f4",
        `https://gitlab.com/gitlab-org/cli/-/releases/v$v/downloads/glab_\${v}_linux_${cpu}.tar.gz`, "bin/glab")],
    }[os],
    // acli is not in winget: Atlassian ships a bare exe, put in ~/.local/bin.
    acli: {
      win32: [["curl.exe", "-fsSL", "--create-dirs", "-o", join(bin, "acli.exe"), "https://acli.atlassian.com/windows/latest/acli_windows_amd64/acli.exe"]],
      darwin: [["brew", "tap", "atlassian/homebrew-acli"], ["brew", "install", "acli"]],
      linux: [["curl", "-fsSL", "--create-dirs", "-o", join(bin, "acli"), `https://acli.atlassian.com/linux/latest/acli_linux_${cpu}/acli`], ["chmod", "+x", join(bin, "acli")]],
    }[os],
    claude: windows
      ? [["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"]]
      : [["bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"]],
    // Outside Windows, npm's global prefix is often /usr, writable only with sudo.
    codex: [["npm", "install", "--global", ...(windows ? [] : ["--prefix", join(homedir(), ".local")]), "@openai/codex"]],
  };
}

const has = (file) => {
  try {
    execFileSync(file, ["--version"], { stdio: "ignore", shell: platform() === "win32" });
    return true;
  } catch {
    return false;
  }
};

function main() {
  const windows = platform() === "win32";
  if (platform() === "darwin" && !has("brew")) {
    console.error("Homebrew is missing. Install it from https://brew.sh, then run this again.");
    process.exit(1);
  }

  // ~/.local/bin holds claude and, on Windows, acli; install-claude puts it on PATH for good.
  process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;

  for (const [name, commands] of Object.entries(installers(platform()))) {
    if (has(name)) {
      console.log(`${name.padEnd(12)} already installed`);
      continue;
    }
    console.log(`${name.padEnd(12)} installing...`);
    for (const [file, ...args] of commands) {
      try {
        // shell on Windows so npm resolves to npm.cmd.
        execFileSync(file, args, { stdio: "inherit", shell: windows && file === "npm" });
      } catch (error) {
        if (!(file === "winget" && WINGET_ALREADY_INSTALLED.includes(error.status))) throw error;
      }
    }
    console.log(`${name.padEnd(12)} installed`);
  }

  console.log("\nOpen a new terminal, then sign in once: gh auth login, glab auth login, acli jira auth login --web, claude, codex login");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
