import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOTSTRAP_STEP, KIT, REF_PATTERN, bootstrapScript, boxRows, cloneDir, kitCommand, parseArgs, renderEnv, smokeChecks, storedDefinition, updateTargets } from "./box.mjs";

test("new takes a name, an optional owner/repo, and defaults to main, 6g and asking about a token", () => {
  assert.deepEqual(parseArgs(["new", "box2"]), { command: "new", name: "box2", repo: undefined, memory: "6g", token: "ask", theosRef: "main" });
  assert.deepEqual(parseArgs(["new", "box2", "theovkern/TheOS", "--memory", "2g", "--no-token", "--theos-ref", "agent-boxes"]), {
    command: "new", name: "box2", repo: "theovkern/TheOS", memory: "2g", token: "no", theosRef: "agent-boxes",
  });
  assert.equal(parseArgs(["new", "box2", "--token"]).token, "yes");
});

test("update takes one box, or every box when given --all or nothing, and --theos-ref only for one box", () => {
  assert.deepEqual(parseArgs(["update", "box2"]), { command: "update", name: "box2", theosRef: undefined });
  assert.deepEqual(parseArgs(["update", "box2", "--theos-ref", "dev/x"]), { command: "update", name: "box2", theosRef: "dev/x" });
  for (const argv of [["update"], ["update", "--all"]]) assert.deepEqual(parseArgs(argv), { command: "update", name: undefined, theosRef: undefined });
  assert.throws(() => parseArgs(["update", "box2", "--all"]), /not both/);
  assert.throws(() => parseArgs(["update", "--all", "--theos-ref", "dev"]), /one box/);
  assert.throws(() => parseArgs(["update", "box2", "a/b"]), /box name or --all/);
  assert.throws(() => parseArgs(["update", "Box"]), /box name/);
});

test("flags may come before the positional arguments", () => {
  assert.deepEqual(parseArgs(["--memory", "3g", "new", "box2"]).memory, "3g");
});

test("rm takes a name and optionally --yes; ls takes nothing", () => {
  assert.deepEqual(parseArgs(["rm", "box2"]), { command: "rm", name: "box2", yes: false });
  assert.deepEqual(parseArgs(["rm", "box2", "--yes"]), { command: "rm", name: "box2", yes: true });
  assert.deepEqual(parseArgs(["ls"]), { command: "ls" });
  assert.throws(() => parseArgs(["ls", "box2"]), /ls takes no arguments/);
});

test("anything sbx or YAML would misread is refused before a file is written", () => {
  for (const name of ["", "b", "Box", "box_1", "-box", "box 1", "a/b", "default"]) assert.throws(() => parseArgs(["new", name]), /box name/, `name ${JSON.stringify(name)}`);
  assert.throws(() => parseArgs(["new"]), /box name/);
  for (const repo of ["theovkern", "a/b/c", "https://github.com/a/b", "a/b c", "a/$(x)"]) assert.throws(() => parseArgs(["new", "box2", repo]), /owner\/repo/, repo);
  for (const memory of ["6", "g", "0g", "6gb", "-1g", undefined]) assert.throws(() => parseArgs(["new", "box2", "--memory", memory].filter(Boolean)), /--memory/, String(memory));
  for (const ref of ["", "-x", "a b", "a;b", "$(x)", "a'b"]) assert.throws(() => parseArgs(["new", "box2", "--theos-ref", ref]), /--theos-ref/, JSON.stringify(ref));
  assert.throws(() => parseArgs(["new", "box2", "--theos-ref"]), /--theos-ref/);
  assert.throws(() => parseArgs(["new", "box2", "--password"]), /unknown flag/);
  assert.throws(() => parseArgs(["new", "box2", "a/b", "extra"]), /unexpected argument/);
  assert.throws(() => parseArgs(["frobnicate"]), /unknown command/);
  assert.throws(() => parseArgs([]), /no command/);
});

test("a box with a repo is an sbxenv.yaml that passes the branch and the repo URL to the kit", () => {
  assert.equal(
    renderEnv({ name: "box2", repo: "theovkern/TheOS", memory: "6g", kit: "/home/u/TheOS/kits/box", theosRef: "main" }),
    [
      'schemaVersion: "1"',
      'name: "box2"',
      "agent: claude",
      "",
      "kits:",
      '  - source: "/home/u/TheOS/kits/box"',
      "    args:",
      '      theos_ref: "main"',
      '      repo: "https://github.com/theovkern/TheOS"',
      "",
      "sandboxOptions:",
      '  memory: "6g"',
      "",
    ].join("\n"),
  );
});

test("a box without a repo passes the kit only the branch, and a path with odd characters stays one string", () => {
  const yaml = renderEnv({ name: "42", repo: undefined, memory: "2g", kit: 'C:\\my "kits"\\box: one', theosRef: "dev" });
  assert.ok(yaml.includes('theos_ref: "dev"') && !yaml.includes("repo:"));
  assert.ok(yaml.includes('name: "42"'), "a numeric name must not become a YAML number");
  assert.ok(yaml.includes(String.raw`source: "C:\\my \"kits\"\\box: one"`));
});

test("the kit is the one in this repository, as an absolute path", () => {
  assert.match(KIT, /^\/.*\/kits\/box$|^[A-Z]:\\.*\\kits\\box$/);
});

test("a stored definition gives back its branch and repo, and one that predates the branch follows main", () => {
  const env = (args) => renderEnv({ name: "box2", memory: "2g", kit: "/k", ...args });
  assert.deepEqual(storedDefinition(env({ repo: "theovkern/TheOS", theosRef: "agent-boxes" })), { repo: "theovkern/TheOS", theosRef: "agent-boxes" });
  assert.deepEqual(storedDefinition(env({ theosRef: "main" })), { repo: undefined, theosRef: "main" });
  const old = 'schemaVersion: "1"\nname: "boxtest"\nkits:\n  - source: "/k"\n    args:\n      repo: "https://github.com/a/b"\n';
  assert.deepEqual(storedDefinition(old), { repo: "a/b", theosRef: "main" });
  assert.deepEqual(storedDefinition('name: "x"\nkits:\n  - source: "/k"\n'), { repo: undefined, theosRef: "main" });
});

test("update runs the boxes TheOS defined that are running, skips the rest with a reason, and refuses a named box it cannot update", () => {
  const rows = [
    { name: "box1", status: "running", defined: true },
    { name: "box3", status: "not created", defined: true },
    { name: "box4", status: "stopped", defined: true },
    { name: "cxprobe", status: "running", defined: false },
  ];
  assert.deepEqual(updateTargets(rows, undefined), [
    { name: "box1" },
    { name: "box3", skip: "not running (not created)" },
    { name: "box4", skip: "not running (stopped)" },
    { name: "cxprobe", skip: "not defined by TheOS" },
  ]);
  assert.deepEqual(updateTargets(rows, "box1"), [{ name: "box1" }]);
  assert.throws(() => updateTargets(rows, "box4"), /stopped.*sbx run -d --name box4/);
  assert.throws(() => updateTargets(rows, "cxprobe"), /not defined by TheOS/);
  assert.throws(() => updateTargets(rows, "nope"), /no box named nope/);
});

const spec = readFileSync(join(KIT, "spec.yaml"), "utf8");

test("the kit's clone step is found by its description, with its block dedented and the next step left out", () => {
  const yaml = [
    "setup:",
    "  install:",
    "    - description: first",
    '      user: "1000"',
    "      command: |",
    "        set -e",
    "        if x; then",
    "          y",
    "        fi",
    "",
    "    - description: second",
    "      command: |",
    "        other",
    "",
  ].join("\n");
  assert.equal(kitCommand(yaml, "first"), "set -e\nif x; then\n  y\nfi\n");
  assert.equal(kitCommand(yaml, "second"), "other\n");
  assert.throws(() => kitCommand(yaml, "third"), /no step "third"/);
  assert.throws(() => kitCommand("- description: one\n- description: two\n  command: |\n    x\n", "one"), /no command/);
});

test("the bootstrap is the kit's own step with the branch filled in, and a branch that is not a branch name never reaches a shell", () => {
  const script = bootstrapScript(spec, "agent-boxes");
  assert.match(script, /^set -eu\n/);
  assert.match(script, /^ref='agent-boxes'$/m);
  assert.ok(!script.includes("${{"), "no template left for the shell to see");
  assert.ok(!script.includes("kit.args.repo"), "only the clone step, not the one after it");
  for (const ref of ["", "-x", "a b", "a'; echo pwned; '"]) assert.throws(() => bootstrapScript(spec, ref), /not a branch name/);
});

test("the kit ships no files, takes the branch as an argument with the same pattern as the command line, and the step this file looks for exists", () => {
  assert.ok(!existsSync(join(KIT, "files")), "a kit with files cannot be added to a live box");
  const pattern = spec.match(/theos_ref:[\s\S]*?pattern: '(.*)'/)[1];
  assert.equal(pattern, REF_PATTERN.source);
  assert.match(spec, /default: main/);
  assert.ok(kitCommand(spec, BOOTSTRAP_STEP).length > 0);
});

test("the list shows defined boxes that were never created and sandboxes TheOS did not define", () => {
  assert.deepEqual(
    boxRows(["box1", "box3"], [{ name: "box1", status: "running" }, { name: "cxprobe", status: "stopped" }]),
    [
      { name: "box1", status: "running", defined: true },
      { name: "box3", status: "not created", defined: true },
      { name: "cxprobe", status: "stopped", defined: false },
    ],
  );
});

test("the smoke test checks that ~/.theos follows the stored branch", () => {
  const clone = smokeChecks({ theosRef: "dev/x" })[0];
  assert.match(clone.label, /follows dev\/x/);
  assert.match(clone.argv[2], /= 'dev\/x' \]/);
});

test("the smoke test checks the clone only when the box has a repo", () => {
  assert.ok(!smokeChecks({}).some(({ label }) => /cloned/.test(label)));
  const clone = smokeChecks({ repo: "theovkern/TheOS.git" }).find(({ label }) => /cloned/.test(label));
  assert.deepEqual(clone.argv, ["test", "-d", "/home/agent/work/TheOS/.git"]);
  assert.equal(cloneDir("a/b"), "/home/agent/work/b");
});

const check = (matches) => smokeChecks({}).find(({ label }) => matches.test(label));

test("the plugin check needs both plugins, and the guard check fails when the guard lets `rm -rf ~` through", () => {
  const plugins = check(/plugins/);
  assert.ok(plugins.passes({ status: 0, stdout: "pstack@cursor-plugins\nmattpocock-skills@claude-plugins-official" }));
  assert.ok(!plugins.passes({ status: 0, stdout: "pstack@cursor-plugins" }));
  assert.ok(check(/guard/).passes({ status: 2, stdout: "" }));
  assert.ok(!check(/guard/).passes({ status: 0, stdout: "" }));
});

test("Claude's answer check needs a success exit and the word ok", () => {
  assert.ok(check(/answers/).passes({ status: 0, stdout: "ok\n" }));
  assert.ok(!check(/answers/).passes({ status: 1, stdout: "" }));
  assert.ok(!check(/answers/).passes({ status: 0, stdout: "Not logged in" }));
});

test("the credential check passes only when every token in the file is a proxy sentinel, and prints nothing either way", () => {
  const home = mkdtempSync(join(tmpdir(), "box-creds-"));
  mkdirSync(join(home, ".claude"));
  const [, ...args] = check(/credential/).argv;
  const verdict = (credentials) => {
    writeFileSync(join(home, ".claude", ".credentials.json"), JSON.stringify(credentials));
    const result = spawnSync(process.execPath, args, { env: { ...process.env, HOME: home }, encoding: "utf8" });
    assert.equal(result.stdout + result.stderr, "");
    return result.status;
  };
  assert.equal(verdict({ claudeAiOauth: { accessToken: "sk-ant-oat01-proxy-managed", refreshToken: "sk-ant-ort01-proxy-managed", scopes: ["a"] } }), 0);
  assert.equal(verdict({ claudeAiOauth: { accessToken: "sk-ant-oat01-proxy-managed", refreshToken: "sk-ant-ort01-real-secret" } }), 1);
  assert.equal(verdict({ claudeAiOauth: { expiresAt: 1 } }), 1, "a file with no token at all proves nothing");
});

// ---- the command, run against a stand-in `sbx` that records its calls ----------------------

const BOX = join(dirname(fileURLToPath(import.meta.url)), "box.mjs");

const standIn = ({ sandboxes = [], failOn = "" } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "box-cli-"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "ls.json"), JSON.stringify(sandboxes));
  writeFileSync(
    join(root, "bin", "sbx"),
    [
      "#!/bin/sh",
      `printf '%s' "$*" | tr '\\n' ' ' >> "${root}/calls"; echo >> "${root}/calls"`,
      `case "$*" in`,
      `  "ls --json") cat "${root}/ls.json"; exit 0;;`,
      `  *${JSON.stringify(failOn || "@@never@@")}*) exit 1;;`,
      `  *deny-dangerous*) exit 2;;`,
      `  *"plugin list"*) echo "pstack mattpocock-skills";;`,
      `  *" -p "*) echo ok;;`,
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(root, "bin", "sbx"), 0o755);
  const dir = (name) => join(root, ".config", "theos", "boxes", name);
  return {
    dir,
    run: (args, input = "") =>
      spawnSync(process.execPath, [BOX, ...args], { env: { ...process.env, HOME: root, PATH: `${join(root, "bin")}${delimiter}${process.env.PATH}` }, input, encoding: "utf8" }),
    execCalls: () => {
      const log = join(root, "calls");
      return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter((call) => call.startsWith("exec ")) : [];
    },
    sbxCalls: () => {
      const log = join(root, "calls");
      return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter((call) => call && !call.startsWith("ls ") && !call.startsWith("exec ")) : [];
    },
  };
};

test("new defines the box, creates it, starts it, and checks it, without storing a token when told not to", () => {
  const sbx = standIn();
  const result = sbx.run(["new", "box2", "theovkern/TheOS", "--memory", "2g", "--no-token"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(sbx.sbxCalls(), [`env create --force ${sbx.dir("box2")}`, "run -d --name box2"]);
  assert.match(readFileSync(join(sbx.dir("box2"), "sbxenv.yaml"), "utf8"), /repo: "https:\/\/github.com\/theovkern\/TheOS"/);
  assert.match(result.stdout, /pass {2}the command guard/);
});

test("new asks about a token and stores one for this box alone, before the box exists, only on yes", () => {
  const yes = standIn();
  assert.equal(yes.run(["new", "box2"], "y\n").status, 0);
  assert.deepEqual(yes.sbxCalls(), ["secret set github --sandbox box2", `env create --force ${yes.dir("box2")}`, "run -d --name box2"]);

  const no = standIn();
  assert.equal(no.run(["new", "box2"], "\n").status, 0);
  assert.ok(!no.sbxCalls().some((call) => call.startsWith("secret")));

  const eof = standIn();
  assert.equal(eof.run(["new", "box2"], "").status, 0, "no answer at all means no token");
  assert.ok(!eof.sbxCalls().some((call) => call.startsWith("secret")));
});

test("new that fails to create leaves nothing behind, so it can be run again", () => {
  const sbx = standIn({ failOn: "env create" });
  const result = sbx.run(["new", "box2", "--no-token"]);
  assert.equal(result.status, 1);
  assert.ok(!existsSync(sbx.dir("box2")));
  assert.ok(!sbx.sbxCalls().some((call) => call.startsWith("run")));
});

test("new refuses a name that is taken, by a definition or by any sandbox", () => {
  const taken = standIn({ sandboxes: [{ name: "box2", status: "running" }] });
  assert.equal(taken.run(["new", "box2", "--no-token"]).status, 1);
  assert.deepEqual(taken.sbxCalls(), []);
});

test("new exits non-zero when the box runs but a check fails", () => {
  const sbx = standIn({ failOn: "gh --version" });
  const result = sbx.run(["new", "box2", "--no-token"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL {2}gh is installed/);
});

test("rm removes the sandbox and its secrets through sbx, then the definition", () => {
  const sbx = standIn({ sandboxes: [{ name: "box2", status: "running" }] });
  mkdirSync(sbx.dir("box2"), { recursive: true });
  writeFileSync(join(sbx.dir("box2"), "sbxenv.yaml"), "x");
  assert.equal(sbx.run(["rm", "box2", "--yes"]).status, 0);
  assert.deepEqual(sbx.sbxCalls(), [`env rm --force ${sbx.dir("box2")}`]);
  assert.ok(!existsSync(sbx.dir("box2")));
});

test("rm keeps the definition when sbx cannot remove the sandbox, and removes it when there is no sandbox", () => {
  const stuck = standIn({ sandboxes: [{ name: "box2", status: "running" }], failOn: "env rm" });
  mkdirSync(stuck.dir("box2"), { recursive: true });
  writeFileSync(join(stuck.dir("box2"), "sbxenv.yaml"), "x");
  assert.equal(stuck.run(["rm", "box2", "--yes"]).status, 1);
  assert.ok(existsSync(stuck.dir("box2")));

  const orphan = standIn();
  mkdirSync(orphan.dir("box2"), { recursive: true });
  writeFileSync(join(orphan.dir("box2"), "sbxenv.yaml"), "x");
  assert.equal(orphan.run(["rm", "box2"]).status, 0);
  assert.deepEqual(orphan.sbxCalls(), []);
  assert.ok(!existsSync(orphan.dir("box2")));
});

test("rm of a box nobody defined is an error, and never touches sbx", () => {
  const sbx = standIn({ sandboxes: [{ name: "box1", status: "running" }] });
  const result = sbx.run(["rm", "box1", "--yes"]);
  assert.equal(result.status, 1);
  assert.deepEqual(sbx.sbxCalls(), []);
});

test("ls shows what is defined and what sbx runs", () => {
  const sbx = standIn({ sandboxes: [{ name: "box1", status: "running" }] });
  mkdirSync(sbx.dir("box3"), { recursive: true });
  writeFileSync(join(sbx.dir("box3"), "sbxenv.yaml"), "x");
  const result = sbx.run(["ls"]);
  assert.match(result.stdout, /box1 +running +no/);
  assert.match(result.stdout, /box3 +not created +yes/);
});

// ---- update, against the same stand-in ---------------------------------------------------------

const define = (sbx, name, args = "") => {
  mkdirSync(sbx.dir(name), { recursive: true });
  writeFileSync(join(sbx.dir(name), "sbxenv.yaml"), renderEnv({ name, memory: "2g", kit: KIT, theosRef: "main", ...JSON.parse(args || "{}") }));
};

const bootstraps = (sbx) => sbx.execCalls().filter((call) => call.includes(" -- sh -c "));

test("new stores the branch in the definition, main unless told otherwise", () => {
  const sbx = standIn();
  assert.equal(sbx.run(["new", "box2", "--no-token", "--theos-ref", "agent-boxes"]).status, 0);
  assert.match(readFileSync(join(sbx.dir("box2"), "sbxenv.yaml"), "utf8"), /theos_ref: "agent-boxes"/);
  assert.ok(sbx.execCalls().some((call) => call.includes("rev-parse --abbrev-ref HEAD") && call.includes("'agent-boxes'")), "the checks look at that branch");

  const plain = standIn();
  assert.equal(plain.run(["new", "box3", "--no-token"]).status, 0);
  assert.match(readFileSync(join(plain.dir("box3"), "sbxenv.yaml"), "utf8"), /theos_ref: "main"/);
});

test("update runs the kit's bootstrap in the running box with its stored branch, then checks the box", () => {
  const sbx = standIn({ sandboxes: [{ name: "box2", status: "running" }] });
  define(sbx, "box2", JSON.stringify({ theosRef: "agent-boxes", repo: "theovkern/TheOS" }));
  const result = sbx.run(["update", "box2"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(bootstraps(sbx).length, 1);
  assert.match(bootstraps(sbx)[0], /^exec box2 -- sh -c set -eu .*ref='agent-boxes'.* exec node "\$dir\/scripts\/box-refresh.mjs"\s*$/);
  assert.match(result.stdout, /pass {2}~\/\.theos follows agent-boxes/);
  assert.match(result.stdout, /pass {2}the command guard/);
  assert.match(result.stdout, /pass {2}theovkern\/TheOS is cloned/);
  assert.deepEqual(sbx.sbxCalls(), [], "an update never creates, starts or removes anything");
});

test("update of every box skips what TheOS did not define and what is not running, and says why", () => {
  const sbx = standIn({
    sandboxes: [{ name: "box1", status: "running" }, { name: "box2", status: "running" }, { name: "box4", status: "stopped" }],
  });
  define(sbx, "box2");
  define(sbx, "box4");
  const result = sbx.run(["update"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skipped {2}box1: not defined by TheOS/);
  assert.match(result.stdout, /skipped {2}box4: not running \(stopped\)/);
  assert.equal(bootstraps(sbx).length, 1);
  assert.match(bootstraps(sbx)[0], /^exec box2 /);
});

test("update with --theos-ref uses that branch once and leaves the stored one alone", () => {
  const sbx = standIn({ sandboxes: [{ name: "box2", status: "running" }] });
  define(sbx, "box2");
  const before = readFileSync(join(sbx.dir("box2"), "sbxenv.yaml"), "utf8");
  const result = sbx.run(["update", "box2", "--theos-ref", "agent-boxes"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(bootstraps(sbx)[0], /ref='agent-boxes'/);
  assert.match(result.stdout, /pass {2}~\/\.theos follows agent-boxes/);
  assert.equal(readFileSync(join(sbx.dir("box2"), "sbxenv.yaml"), "utf8"), before);
});

test("update fails when the bootstrap fails, without running the checks, and the next box is still updated", () => {
  const sbx = standIn({
    sandboxes: [{ name: "alpha", status: "running" }, { name: "beta", status: "running" }],
    failOn: "exec alpha -- sh -c",
  });
  define(sbx, "alpha");
  define(sbx, "beta");
  const result = sbx.run(["update", "--all"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /updating alpha failed/);
  assert.match(result.stderr, /not up to date: alpha/);
  assert.equal(bootstraps(sbx).length, 2);
  assert.ok(!sbx.execCalls().some((call) => /^exec alpha -- (claude|gh)/.test(call)), "a failed update is not checked");
  assert.ok(sbx.execCalls().some((call) => /^exec beta -- gh/.test(call)));
});

test("update exits non-zero when the box was updated but a check fails", () => {
  const sbx = standIn({ sandboxes: [{ name: "box2", status: "running" }], failOn: "gh --version" });
  define(sbx, "box2");
  const result = sbx.run(["update", "box2"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL {2}gh is installed/);
});

test("update of a named box that is stopped, unknown or not TheOS's is an error that never reaches the box", () => {
  const sbx = standIn({ sandboxes: [{ name: "box1", status: "running" }, { name: "box4", status: "stopped" }] });
  define(sbx, "box4");
  for (const name of ["box1", "box4", "ghost"]) assert.equal(sbx.run(["update", name]).status, 1, name);
  assert.deepEqual(sbx.execCalls(), []);
});
