#!/usr/bin/env node
// Installs the command-line tools that tools.json lists for one profile:
//   host    a machine I work on: gh, glab, acli (Atlassian, for Jira), Claude Code and Codex
//   server  the machine that runs the agent boxes: sbx and Tailscale
//   box     an agent box: gh (everything else is in the sbx image)
// winget on Windows, Homebrew on macOS, release binaries on Linux. Claude Code and Codex never come from
// a package manager: those builds do not auto-update, the native installer and npm ones do.
// Safe to run twice: a tool already on PATH is left alone.
//
// Usage: install-tools.mjs [--profile host|server|box] [--print]
//   --print  writes the commands for the tools that are missing, as a shell script, and runs nothing.
//
// tools.json maps each tool to its profiles and, per platform, the commands that install it. A command
// may use these placeholders, expanded here and nowhere else:
//   {bin}   ~/.local/bin, where Linux release binaries and Claude Code go
//   {home}  the home directory
//   {cpu}   amd64 or arm64, the spelling release URLs use
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { arch, homedir, platform } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROFILES = ["host", "server", "box"];
export const PLATFORMS = ["linux", "darwin", "win32"];
export const PLACEHOLDERS = ["bin", "cpu", "home"];

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(homedir(), ".local", "bin");

// A package installed but not yet on this terminal's PATH makes winget exit with one of these.
const WINGET_ALREADY_INSTALLED = [0x8a15002b, 0x8a150061]; // no applicable upgrade, package already installed

export const loadRegistry = (path = join(here, "tools.json")) => JSON.parse(readFileSync(path, "utf8"));

export const systemValues = () => ({ bin, home: homedir(), cpu: { x64: "amd64", arm64: "arm64" }[arch()] });

export function expand(argv, values) {
  return argv.map((arg) =>
    arg.replace(new RegExp(`\\{(${PLACEHOLDERS.join("|")})\\}`, "g"), (_, key) => {
      if (values[key] === undefined) throw new Error(`no value for {${key}} on this machine (cpu ${arch()})`);
      return values[key];
    }),
  );
}

/** What to install for one profile on one platform: the tools in order, each with the command that
 *  tells whether it is installed and the commands that install it (empty when this platform has none). */
export function installPlan(registry, { profile, os, values }) {
  return Object.entries(registry)
    .filter(([, tool]) => tool.profiles.includes(profile))
    .map(([name, tool]) => ({
      name,
      check: [name, ...(tool.check ?? ["--version"])],
      commands: (tool.install[os] ?? []).map((argv) => expand(argv, values)),
    }));
}

export function parseArgs(argv) {
  const options = { profile: "host", print: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--print") options.print = true;
    else if (argv[i] === "--profile") options.profile = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!PROFILES.includes(options.profile)) throw new Error(`profile must be one of ${PROFILES.join(", ")}, not ${options.profile}`);
  return options;
}

const shellQuote = (arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`);

/** One argv as a line a POSIX shell runs the same way. */
export const commandLine = (argv) => argv.map(shellQuote).join(" ");

const has = ([file, ...args]) => {
  try {
    execFileSync(file, args, { stdio: "ignore", shell: platform() === "win32" });
    return true;
  } catch {
    return false;
  }
};

/** Installs what is missing, or with print writes the commands that would. */
export function installTools({ profile, print }) {
  const os = platform();
  const windows = os === "win32";
  const plan = installPlan(loadRegistry(), { profile, os, values: systemValues() });

  if (os === "darwin" && !print && plan.some(({ commands }) => commands.some(([file]) => file === "brew")) && !has(["brew", "--version"])) {
    console.error("Homebrew is missing. Install it from https://brew.sh, then run this again.");
    process.exit(1);
  }

  // ~/.local/bin holds claude and, on Windows, acli; install-claude puts it on PATH for good.
  process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;

  for (const { name, check, commands } of plan) {
    if (has(check)) {
      console.log(print ? `# ${name}: already installed` : `${name.padEnd(12)} already installed`);
      continue;
    }
    if (commands.length === 0) {
      console.log(print ? `# ${name}: no installer for ${os}` : `${name.padEnd(12)} no installer for ${os}`);
      continue;
    }
    if (print) {
      console.log(`# ${name}`);
      for (const command of commands) console.log(commandLine(command));
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

  if (profile === "host" && !print) {
    console.log("\nOpen a new terminal, then sign in once: gh auth login, glab auth login, acli jira auth login --web, claude, codex login");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  installTools(options);
}
