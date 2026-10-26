#!/usr/bin/env node
// Verification helper for TheOS. Subcommands: init, doctor, run, guard, clean.
// Every mutating TheOS script resolves the home folder with os.homedir(), so a
// fake HOME/USERPROFILE keeps a run away from the real ~/.claude and ~/.cursor.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const runsRoot = join(tmpdir(), "theos-verify");
const guardPath = join(repoRoot, "hooks", "deny-dangerous.mjs");

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// A run dir is accepted only if it sits directly under runsRoot, so a typo
// cannot point clean at anything else.
function runDirOf(arg) {
  if (!arg) fail("missing <runDir>; create one with: node verify.mjs init");
  const dir = resolve(arg);
  if (dirname(dir) !== runsRoot) fail(`${dir} is not a run dir under ${runsRoot}`);
  if (!existsSync(join(dir, "home"))) fail(`${dir} has no home/; run init first`);
  return dir;
}

function record(dir, name, lines) {
  const evidence = join(dir, "evidence");
  mkdirSync(evidence, { recursive: true });
  const text = lines.join("\n") + "\n";
  writeFileSync(join(evidence, `${name}.txt`), text);
  process.stdout.write(text);
}

const fenced = (label, body) => [`--- ${label} ---`, body.trimEnd() || "(empty)"];

function init() {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(runsRoot, id);
  mkdirSync(join(dir, "home"), { recursive: true });
  mkdirSync(join(dir, "evidence"), { recursive: true });
  console.log(dir);
}

function doctor(dir) {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });

  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  } catch {}
  check("repo is TheOS", pkg.name === "theos", `${repoRoot} package name=${pkg.name}`);
  check("node >= 20", Number(process.versions.node.split(".")[0]) >= 20, process.version);

  const patterns = join(repoRoot, "hooks", "dangerous-patterns.txt");
  check("denylist readable", existsSync(patterns), patterns);

  const canary = spawnSync(process.execPath, [guardPath, "--claude"], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push --force origin main" } }),
    encoding: "utf8",
  });
  check("guard blocks a canary (exit 2)", canary.status === 2, `exit ${canary.status}`);

  if (dir) {
    const fake = join(resolve(dir), "home");
    check("sandbox home is not the real home", resolve(fake) !== resolve(homedir()), fake);
    check("sandbox home exists", existsSync(fake), fake);
  }

  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name} (${c.detail})`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

// Runs a TheOS command in the repo with HOME and USERPROFILE pointed at the sandbox.
function run(dirArg, name, command) {
  const dir = runDirOf(dirArg);
  if (!name || !command.length) fail("usage: run <runDir> <name> -- <command...>");
  const home = join(dir, "home");
  const result = spawnSync(command.join(" "), {
    cwd: repoRoot,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  record(dir, name, [
    `command: ${command.join(" ")}`,
    `sandbox home: ${home}`,
    `exit code: ${result.status}`,
    ...fenced("stdout", result.stdout ?? ""),
    ...fenced("stderr", result.stderr ?? ""),
  ]);
}

// Feeds the guard one hook payload. Dangerous strings are read from cases.json so
// that a live guard on the calling shell never sees them on a command line.
function guard(dirArg, harness, flag, value) {
  const dir = runDirOf(dirArg);
  if (!["claude", "cursor", "codex"].includes(harness)) fail("harness must be claude, cursor or codex");
  let name;
  let command;
  if (flag === "--case") {
    const cases = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));
    const found = cases[value];
    if (!found) fail(`unknown case "${value}"; known: ${Object.keys(cases).join(", ")}`);
    name = `guard-${harness}-${value}`;
    command = found.command;
  } else if (flag === "--command") {
    name = `guard-${harness}-adhoc-${Date.now()}`;
    command = value;
  } else {
    fail("usage: guard <runDir> <harness> --case <name> | --command <text>");
  }
  const payload = harness === "cursor" ? { command } : { tool_name: "Bash", tool_input: { command } };
  const result = spawnSync(process.execPath, [guardPath, `--${harness}`], { input: JSON.stringify(payload), encoding: "utf8" });
  record(dir, name, [
    `harness: ${harness}`,
    `command checked: ${command}`,
    `exit code: ${result.status}`,
    ...fenced("stdout", result.stdout ?? ""),
    ...fenced("stderr", result.stderr ?? ""),
  ]);
}

// Removes the sandbox home and nothing else. Links are unlinked, never followed,
// because the sandbox holds junctions into this repository's skills/.
function removeTree(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return unlinkSync(path);
  for (const entry of readdirSync(path)) removeTree(join(path, entry));
  rmdirSync(path);
}

function clean(dirArg) {
  const dir = runDirOf(dirArg);
  const home = join(dir, "home");
  if (basename(home) !== "home") fail("refusing: not a sandbox home");
  removeTree(home);
  console.log(`removed ${home}`);
  console.log(`evidence kept at ${join(dir, "evidence")}`);
}

const [command, ...rest] = process.argv.slice(2);
const split = rest.indexOf("--");
switch (command) {
  case "init":
    init();
    break;
  case "doctor":
    doctor(rest[0]);
    break;
  case "run":
    run(rest[0], rest[1], split === -1 ? [] : rest.slice(split + 1));
    break;
  case "guard":
    guard(rest[0], rest[1], rest[2], rest[3]);
    break;
  case "clean":
    clean(rest[0]);
    break;
  default:
    fail("usage: verify.mjs init | doctor [runDir] | run <runDir> <name> -- <cmd> | guard <runDir> <harness> --case <name> | clean <runDir>");
}
