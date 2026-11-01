#!/usr/bin/env node
// Defines and runs agent boxes: always-on sbx microVMs built from kits/box.
//
//   npm run box -- new <name> [owner/repo] [--memory 6g] [--token | --no-token]
//   npm run box -- ls
//   npm run box -- rm <name> [--yes]
//
// A box is defined by ~/.config/theos/boxes/<name>/sbxenv.yaml. That folder is outside every
// workspace a box can write, which matters because sbx runs the file's host commands as me.
// `new` writes it, optionally stores a GitHub token for that box alone, creates and starts the
// sandbox, then checks the box from inside.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KIT = join(repoRoot, "kits", "box");
export const DEFAULT_MEMORY = "6g";

export const boxesDir = (home = homedir()) => join(home, ".config", "theos", "boxes");

const USAGE = `usage: npm run box -- new <name> [owner/repo] [--memory ${DEFAULT_MEMORY}] [--token | --no-token]
       npm run box -- ls
       npm run box -- rm <name> [--yes]`;

const usageError = (message) => new Error(`${message}\n${USAGE}`);

/** Pure. The command line as one of { command: "new" | "ls" | "rm", ... }, or an error that says what is wrong. */
export function parseArgs(argv) {
  const flags = { token: "ask", memory: DEFAULT_MEMORY, yes: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--memory") flags.memory = argv[++i];
    else if (arg === "--token") flags.token = "yes";
    else if (arg === "--no-token") flags.token = "no";
    else if (arg === "--yes") flags.yes = true;
    else if (arg.startsWith("--")) throw usageError(`unknown flag ${arg}`);
    else positional.push(arg);
  }
  const [command, name, repo, ...extra] = positional;
  if (extra.length > 0) throw usageError(`unexpected argument ${extra[0]}`);

  if (command === "ls") {
    if (name) throw usageError("ls takes no arguments");
    return { command };
  }
  if (command !== "new" && command !== "rm") throw usageError(command ? `unknown command ${command}` : "no command");

  if (!/^[a-z0-9][a-z0-9-]+$/.test(name ?? "") || name === "default") {
    throw usageError("a box name is at least two characters of lowercase letters, digits and hyphens, and not \"default\"");
  }
  if (command === "rm") {
    if (repo) throw usageError("rm takes only a name");
    return { command, name, yes: flags.yes };
  }

  if (repo !== undefined && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw usageError(`${repo} is not owner/repo`);
  if (!/^[1-9]\d*[mg]$/.test(flags.memory ?? "")) throw usageError(`--memory takes a size like 512m or 6g, not ${flags.memory}`);
  return { command, name, repo, memory: flags.memory, token: flags.token };
}

/** Pure. The sbxenv.yaml for one box. Strings are written as JSON, which YAML reads as quoted strings. */
export function renderEnv({ name, repo, memory, kit }) {
  return [
    'schemaVersion: "1"',
    `name: ${JSON.stringify(name)}`,
    "agent: claude",
    "",
    "kits:",
    `  - source: ${JSON.stringify(kit)}`,
    ...(repo ? ["    args:", `      repo: ${JSON.stringify(`https://github.com/${repo}`)}`] : []),
    "",
    "sandboxOptions:",
    `  memory: ${JSON.stringify(memory)}`,
    "",
  ].join("\n");
}

/** Pure. Every sandbox sbx knows and every box defined here, with whether TheOS defines it. */
export function boxRows(defined, sandboxes) {
  const status = new Map(sandboxes.map(({ name, status }) => [name, status]));
  const names = [...new Set([...defined, ...status.keys()])].sort();
  return names.map((name) => ({ name, status: status.get(name) ?? "not created", defined: defined.includes(name) }));
}

export const cloneDir = (repo) => `/home/agent/work/${repo.split("/")[1].replace(/\.git$/, "")}`;

const SENTINEL_ONLY = String.raw`
  const fs = require("fs");
  const found = [];
  const walk = (o) => { for (const [k, v] of Object.entries(o)) typeof v === "object" && v ? walk(v) : /token/i.test(k) && found.push(String(v)); };
  walk(JSON.parse(fs.readFileSync(process.env.HOME + "/.claude/.credentials.json", "utf8")));
  process.exit(found.length > 0 && found.every((v) => v.endsWith("proxy-managed")) ? 0 : 1);
`;

const GUARD_BLOCKS = String.raw`grep -q deny-dangerous ~/.claude/settings.json || exit 1; echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}' | node ~/.theos/hooks/deny-dangerous.mjs --claude`;

/** Checks run inside a fresh box through `sbx exec`. Each says what it proves and how to tell from the result. */
export function smokeChecks({ repo }) {
  return [
    {
      label: "plugins pstack and mattpocock-skills are installed",
      argv: ["claude", "plugin", "list"],
      passes: ({ status, stdout }) => status === 0 && /pstack/.test(stdout) && /mattpocock-skills/.test(stdout),
    },
    {
      label: "the command guard is wired and blocks `rm -rf ~`",
      argv: ["bash", "-c", GUARD_BLOCKS],
      passes: ({ status }) => status === 2,
    },
    { label: "gh is installed", argv: ["gh", "--version"], passes: ({ status }) => status === 0 },
    {
      label: "the Claude credential in the box is only a proxy sentinel",
      argv: ["node", "-e", SENTINEL_ONLY],
      passes: ({ status }) => status === 0,
    },
    {
      label: "Claude answers with no login in the box",
      argv: ["claude", "-p", "Reply with the single word ok."],
      passes: ({ status, stdout }) => status === 0 && /\bok\b/i.test(stdout),
    },
    ...(repo ? [{ label: `${repo} is cloned`, argv: ["test", "-d", `${cloneDir(repo)}/.git`], passes: ({ status }) => status === 0 }] : []),
  ];
}

// ---- IO ------------------------------------------------------------------------------------

const sbx = (args, options = {}) => {
  const result = spawnSync("sbx", args, { stdio: "inherit", encoding: "utf8", ...options });
  if (result.error?.code === "ENOENT") throw new Error("sbx is not installed. Run npm run setup-server.");
  return result;
};

const sandboxes = () => {
  const result = sbx(["ls", "--json"], { stdio: ["ignore", "pipe", "inherit"] });
  if (result.status !== 0) throw new Error("sbx ls failed");
  return JSON.parse(result.stdout || "[]");
};

const definedBoxes = () => (existsSync(boxesDir()) ? readdirSync(boxesDir()).filter((name) => existsSync(join(boxesDir(), name, "sbxenv.yaml"))) : []);

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Piped input that ends mid-question closes the interface without ever answering.
  const answer = await new Promise((resolveAnswer) => {
    rl.once("close", () => resolveAnswer(""));
    rl.question(question).then(resolveAnswer);
  });
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function smokeTest(name, repo) {
  let failed = 0;
  for (const { label, argv, passes } of smokeChecks({ repo })) {
    const result = spawnSync("sbx", ["exec", name, "--", ...argv], { encoding: "utf8", timeout: 180_000 });
    const ok = passes({ status: result.status, stdout: result.stdout ?? "" });
    console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
    if (!ok) failed++;
  }
  return failed === 0;
}

async function createBox({ name, repo, memory, token }) {
  const dir = join(boxesDir(), name);
  if (existsSync(dir) || sandboxes().some((box) => box.name === name)) {
    throw new Error(`${name} already exists. Remove it first: npm run box -- rm ${name}`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sbxenv.yaml"), renderEnv({ name, repo, memory, kit: KIT }));
  console.log(`defined  ${join(dir, "sbxenv.yaml")}`);

  const undo = (message) => {
    rmSync(dir, { recursive: true });
    throw new Error(message);
  };

  if (token === "yes" || (token === "ask" && (await ask(`Store a GitHub token for ${name} now? sbx prompts for it and keeps it on the host. [y/N] `)))) {
    if (sbx(["secret", "set", "github", "--sandbox", name]).status !== 0) undo("storing the token failed");
  }

  if (sbx(["env", "create", "--force", dir]).status !== 0) undo(`sbx env create failed; ${dir} was removed`);
  if (sbx(["run", "-d", "--name", name]).status !== 0) throw new Error(`${name} was created but did not start. Try: sbx run -d --name ${name}`);

  console.log(`\nChecking ${name} from inside:`);
  if (!smokeTest(name, repo)) throw new Error(`${name} is running, but a check failed`);
  console.log(`\n${name} is ready. Attach with: sbx run ${name}`);
}

function removeBox({ name, yes }) {
  const dir = join(boxesDir(), name);
  if (!existsSync(dir)) throw new Error(`${name} is not defined in ${boxesDir()}`);
  if (sandboxes().some((box) => box.name === name)) {
    if (sbx(["env", "rm", ...(yes ? ["--force"] : []), dir]).status !== 0) throw new Error(`sbx could not remove ${name}; its definition is kept`);
  }
  rmSync(dir, { recursive: true });
  console.log(`removed  ${name}`);
}

function listBoxes() {
  const rows = boxRows(definedBoxes(), sandboxes());
  if (rows.length === 0) return console.log("no boxes");
  const width = Math.max(4, ...rows.map(({ name }) => name.length));
  console.log(`${"NAME".padEnd(width)}  ${"STATUS".padEnd(12)}  DEFINED BY TheOS`);
  for (const { name, status, defined } of rows) console.log(`${name.padEnd(width)}  ${status.padEnd(12)}  ${defined ? "yes" : "no"}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "new") await createBox(args);
    else if (args.command === "rm") removeBox(args);
    else listBoxes();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
