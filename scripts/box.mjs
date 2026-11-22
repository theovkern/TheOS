#!/usr/bin/env node
// Defines and runs agent boxes: always-on sbx microVMs built from kits/box.
//
//   npm run box -- new <name> [owner/repo] [--theos-ref main] [--memory 6g] [--token | --no-token]
//   npm run box -- update [<name> | --all] [--theos-ref <branch>]
//   npm run box -- ls
//   npm run box -- rm <name> [--yes]
//
// A box is defined by ~/.config/theos/boxes/<name>/sbxenv.yaml. That folder is outside every
// workspace a box can write, which matters because sbx runs the file's host commands as me.
// `new` writes it, gives the box GitHub access through the host's GitHub App when there is one (else
// optionally a token for that box alone), creates and starts the
// sandbox, then checks the box from inside. `update` runs the kit's clone step in a running box
// again, which is all a box needs to catch up with its branch of TheOS, then checks it again.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KIT = join(repoRoot, "kits", "box");
export const DEFAULT_MEMORY = "6g";
export const DEFAULT_REF = "main";
// The same pattern as theos_ref in kits/box/spec.yaml; a test holds the two together.
export const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export const BOOTSTRAP_STEP = "Clone TheOS to ~/.theos and run its refresh script";

export const boxesDir = (home = homedir()) => join(home, ".config", "theos", "boxes");

const USAGE = `usage: npm run box -- new <name> [owner/repo] [--theos-ref ${DEFAULT_REF}] [--memory ${DEFAULT_MEMORY}] [--token | --no-token]
       npm run box -- update [<name> | --all] [--theos-ref <branch>]
       npm run box -- ls
       npm run box -- rm <name> [--yes]`;

const usageError = (message) => new Error(`${message}\n${USAGE}`);

/** Pure. The command line as one of { command: "new" | "update" | "ls" | "rm", ... }, or an error that says what is wrong.
 *  An update with no name is an update of every box. */
export function parseArgs(argv) {
  const flags = { token: "ask", memory: DEFAULT_MEMORY, yes: false, all: false, ref: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--memory") flags.memory = argv[++i];
    else if (arg === "--token") flags.token = "yes";
    else if (arg === "--no-token") flags.token = "no";
    else if (arg === "--yes") flags.yes = true;
    else if (arg === "--all") flags.all = true;
    else if (arg === "--theos-ref") flags.ref = argv[++i] ?? "";
    else if (arg.startsWith("--")) throw usageError(`unknown flag ${arg}`);
    else positional.push(arg);
  }
  const [command, name, repo, ...extra] = positional;
  if (extra.length > 0) throw usageError(`unexpected argument ${extra[0]}`);

  if (command === "ls") {
    if (name) throw usageError("ls takes no arguments");
    return { command };
  }
  if (!["new", "update", "rm"].includes(command)) throw usageError(command ? `unknown command ${command}` : "no command");
  if (flags.ref !== undefined && !REF_PATTERN.test(flags.ref)) throw usageError(`--theos-ref takes a branch name, not ${flags.ref}`);

  if (command === "update") {
    if (repo) throw usageError("update takes a box name or --all");
    if (name && flags.all) throw usageError("give a box name or --all, not both");
    if (flags.ref !== undefined && !name) throw usageError("--theos-ref applies to one box, so name it");
  }
  if ((command !== "update" || name) && (!/^[a-z0-9][a-z0-9-]+$/.test(name ?? "") || name === "default")) {
    throw usageError("a box name is at least two characters of lowercase letters, digits and hyphens, and not \"default\"");
  }
  if (command === "rm") {
    if (repo) throw usageError("rm takes only a name");
    return { command, name, yes: flags.yes };
  }
  if (command === "update") return { command, name, theosRef: flags.ref };

  if (repo !== undefined && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw usageError(`${repo} is not owner/repo`);
  if (!/^[1-9]\d*[mg]$/.test(flags.memory ?? "")) throw usageError(`--memory takes a size like 512m or 6g, not ${flags.memory}`);
  return { command, name, repo, memory: flags.memory, token: flags.token, theosRef: flags.ref ?? DEFAULT_REF };
}

/** Pure. The sbxenv.yaml for one box. Strings are written as JSON, which YAML reads as quoted strings. */
export function renderEnv({ name, repo, memory, kit, theosRef }) {
  return [
    'schemaVersion: "1"',
    `name: ${JSON.stringify(name)}`,
    "agent: claude",
    "",
    "kits:",
    `  - source: ${JSON.stringify(kit)}`,
    "    args:",
    `      theos_ref: ${JSON.stringify(theosRef)}`,
    ...(repo ? [`      repo: ${JSON.stringify(`https://github.com/${repo}`)}`] : []),
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

/** Pure. What a box's sbxenv.yaml says that `update` needs. An env written before theos_ref existed follows main. */
export function storedDefinition(yaml) {
  const arg = (key) => {
    const match = yaml.match(new RegExp(`^\\s+${key}: (".*")\\s*$`, "m"));
    return match ? JSON.parse(match[1]) : undefined;
  };
  return { repo: arg("repo")?.replace(/^https:\/\/github\.com\//, ""), theosRef: arg("theos_ref") ?? DEFAULT_REF };
}

/** Pure. The `command: |` of the kit step with this description, as the text sbx would run before it fills in the args. */
export function kitCommand(spec, description) {
  const lines = spec.split("\n");
  const step = lines.findIndex((line) => line.trim() === `- description: ${description}`);
  if (step < 0) throw new Error(`the kit spec has no step "${description}"`);
  const next = lines.findIndex((line, i) => i > step && /^\s*- description:/.test(line));
  const key = lines.findIndex((line, i) => i > step && /^\s+command: \|\s*$/.test(line));
  if (key < 0 || (next >= 0 && key > next)) throw new Error(`the kit step "${description}" has no command: | block`);

  const indent = (line) => line.match(/^ */)[0].length;
  const block = [];
  for (const line of lines.slice(key + 1)) {
    if (line.trim() !== "" && indent(line) <= indent(lines[key])) break;
    block.push(line);
  }
  const strip = Math.min(...block.filter((line) => line.trim() !== "").map(indent));
  return block.map((line) => line.slice(strip)).join("\n").trim() + "\n";
}

const THEOS_REF_ARG = "${{ kit.args.theos_ref }}";

/** Pure. The shell script that puts a box's ~/.theos at `ref` and refreshes the box: the kit's own step, so
 *  creating a box and updating one cannot drift apart. */
export function bootstrapScript(spec, ref) {
  if (!REF_PATTERN.test(ref)) throw new Error(`${JSON.stringify(ref)} is not a branch name`);
  return kitCommand(spec, BOOTSTRAP_STEP).replace(THEOS_REF_ARG, () => ref);
}

/** Pure. What `update` does to each sandbox: the boxes TheOS defined and that are running get updated, the rest are
 *  skipped with the reason. A named box that cannot be updated is an error instead. */
export function updateTargets(rows, name) {
  if (name) {
    const row = rows.find((candidate) => candidate.name === name);
    if (!row) throw new Error(`no box named ${name}`);
    if (!row.defined) throw new Error(`${name} was not defined by TheOS, so it is left alone`);
    if (row.status !== "running") throw new Error(`${name} is ${row.status}. Start it first: sbx run -d --name ${name}`);
    return [{ name }];
  }
  return rows.map(({ name, status, defined }) => {
    if (!defined) return { name, skip: "not defined by TheOS" };
    return status === "running" ? { name } : { name, skip: `not running (${status})` };
  });
}

export const cloneDir = (repo) => `/home/agent/work/${repo.split("/")[1].replace(/\.git$/, "")}`;

const SENTINEL_ONLY = String.raw`
  const fs = require("fs");
  const found = [];
  const walk = (o) => { for (const [k, v] of Object.entries(o)) typeof v === "object" && v ? walk(v) : /token/i.test(k) && typeof v === "string" && found.push(v); };
  walk(JSON.parse(fs.readFileSync(process.env.HOME + "/.claude/.credentials.json", "utf8")));
  process.exit(found.length > 0 && found.every((v) => v.endsWith("proxy-managed")) ? 0 : 1);
`;

const GUARD_BLOCKS = String.raw`grep -q deny-dangerous ~/.claude/settings.json || exit 1; echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}' | node ~/.theos/hooks/deny-dangerous.mjs --claude`;

/** Checks run inside a box through `sbx exec`. Each says what it proves and how to tell from the result. */
export function smokeChecks({ repo, theosRef = DEFAULT_REF, app }) {
  return [
    {
      label: `~/.theos follows ${theosRef} and ~/.claude/rules links into it`,
      argv: ["bash", "-c", `[ "$(git -C ~/.theos rev-parse --abbrev-ref HEAD)" = '${theosRef}' ] && [ "$(readlink ~/.claude/rules)" = "$HOME/.theos/rules" ]`],
      passes: ({ status }) => status === 0,
    },
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
    ...(app
      ? [{ label: `gh acts as ${app.name}`, argv: ["gh", "api", "/installation/repositories", "--silent"], passes: ({ status }) => status === 0 }]
      : []),
    ...(repo ? [{ label: `${repo} is cloned`, argv: ["test", "-d", `${cloneDir(repo)}/.git`], passes: ({ status }) => status === 0 }] : []),
  ];
}

// ---- IO ------------------------------------------------------------------------------------

const sbx = (args, options = {}) => {
  const result = spawnSync("sbx", args, { stdio: "inherit", encoding: "utf8", ...options });
  if (result.error?.code === "ENOENT") throw new Error("sbx is not installed. Run npm run setup-server.");
  return result;
};

/** The host's GitHub App (TheOS `npm run install-agent-app`), or null. The key stays on the host: sbx runs the
 *  token command there whenever a box talks to GitHub, and the box sees only a placeholder. */
function agentApp() {
  const command = join(homedir(), ".local", "bin", "agent-app-token");
  const key = join(process.env.AGENT_APP_DIR ?? join(homedir(), ".config", "agent-app"), "private-key.pem");
  if (!existsSync(command) || !existsSync(key)) return null;
  const here = spawnSync(command, ["--here"], { cwd: repoRoot, encoding: "utf8" });
  if (here.status !== 0) return null;
  const [name, email] = here.stdout.trim().split("\t");
  return { command, name, email };
}

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

function smokeTest(name, checks) {
  let failed = 0;
  for (const { label, argv, passes } of checks) {
    const result = spawnSync("sbx", ["exec", name, "--", ...argv], { encoding: "utf8", timeout: 180_000 });
    const ok = passes({ status: result.status, stdout: result.stdout ?? "" });
    console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
    if (!ok) failed++;
  }
  return failed === 0;
}

async function createBox({ name, repo, memory, token, theosRef }) {
  const dir = join(boxesDir(), name);
  if (existsSync(dir) || sandboxes().some((box) => box.name === name)) {
    throw new Error(`${name} already exists. Remove it first: npm run box -- rm ${name}`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sbxenv.yaml"), renderEnv({ name, repo, memory, kit: KIT, theosRef }));
  console.log(`defined  ${join(dir, "sbxenv.yaml")}`);

  let tokenStored = false;
  // A failed create can leave a half-made sandbox and the token behind, so sbx cleans up before the definition goes.
  const undo = (message) => {
    sbx(["env", "rm", "--force", dir]);
    if (tokenStored) sbx(["secret", "rm", "github", "--sandbox", name, "-f"]);
    rmSync(dir, { recursive: true });
    throw new Error(message);
  };

  const app = token === "ask" ? agentApp() : null;
  if (app) {
    console.log(`github   ${name} acts as ${app.name}, with tokens minted on this host`);
    if (sbx(["secret", "set", "github", "--sandbox", name, "--command", app.command]).status !== 0) undo("pointing the box at the GitHub App failed");
    tokenStored = true;
  } else if (token === "yes" || (token === "ask" && (await ask(`Store a GitHub token for ${name} now? sbx prompts for it and keeps it on the host. [y/N] `)))) {
    if (sbx(["secret", "set", "github", "--sandbox", name]).status !== 0) undo("storing the token failed");
    tokenStored = true;
  }

  if (sbx(["env", "create", "--force", dir]).status !== 0) undo(`sbx env create failed, so ${name} was cleaned up: sandbox, token and definition`);
  if (sbx(["run", "-d", "--name", name]).status !== 0) throw new Error(`${name} was created but did not start. Try: sbx run -d --name ${name}`);
  if (app) {
    for (const [key, value] of [["user.name", app.name], ["user.email", app.email]]) sbx(["exec", name, "--", "git", "config", "--global", key, value]);
  }

  console.log(`\nChecking ${name} from inside:`);
  if (!smokeTest(name, smokeChecks({ repo, theosRef, app }))) throw new Error(`${name} is running, but a check failed`);
  console.log(`\n${name} is ready. Attach with: sbx run ${name}`);
}

function updateBox(name, theosRef) {
  const { repo, theosRef: stored } = storedDefinition(readFileSync(join(boxesDir(), name, "sbxenv.yaml"), "utf8"));
  const ref = theosRef ?? stored;
  const script = bootstrapScript(readFileSync(join(KIT, "spec.yaml"), "utf8"), ref);

  console.log(`\nUpdating ${name} to ${ref}:`);
  const result = sbx(["exec", name, "--", "sh", "-c", script], { stdio: ["ignore", "inherit", "inherit"], timeout: 600_000 });
  if (result.status !== 0) throw new Error(`updating ${name} failed, so its checks were not run`);

  console.log(`\nChecking ${name} from inside:`);
  if (!smokeTest(name, smokeChecks({ repo, theosRef: ref }))) throw new Error(`${name} was updated, but a check failed`);
  console.log(`${name} is up to date. Sessions already open there keep the old plugins until they restart.`);
}

function updateBoxes({ name, theosRef }) {
  const targets = updateTargets(boxRows(definedBoxes(), sandboxes()), name);
  const failures = [];
  for (const target of targets) {
    if (target.skip) {
      console.log(`skipped  ${target.name}: ${target.skip}`);
      continue;
    }
    try {
      updateBox(target.name, theosRef);
    } catch (error) {
      console.error(error.message);
      failures.push(target.name);
    }
  }
  if (failures.length > 0) throw new Error(`not up to date: ${failures.join(", ")}`);
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
    else if (args.command === "update") updateBoxes(args);
    else if (args.command === "rm") removeBox(args);
    else listBoxes();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
