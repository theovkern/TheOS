import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KIT, boxRows, cloneDir, parseArgs, renderEnv, smokeChecks } from "./box.mjs";

test("new takes a name, an optional owner/repo, and defaults to 6g and asking about a token", () => {
  assert.deepEqual(parseArgs(["new", "box2"]), { command: "new", name: "box2", repo: undefined, memory: "6g", token: "ask" });
  assert.deepEqual(parseArgs(["new", "box2", "theovkern/TheOS", "--memory", "2g", "--no-token"]), {
    command: "new", name: "box2", repo: "theovkern/TheOS", memory: "2g", token: "no",
  });
  assert.equal(parseArgs(["new", "box2", "--token"]).token, "yes");
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
  assert.throws(() => parseArgs(["new", "box2", "--password"]), /unknown flag/);
  assert.throws(() => parseArgs(["new", "box2", "a/b", "extra"]), /unexpected argument/);
  assert.throws(() => parseArgs(["frobnicate"]), /unknown command/);
  assert.throws(() => parseArgs([]), /no command/);
});

test("a box with a repo is an sbxenv.yaml that passes the repo URL to the kit", () => {
  assert.equal(
    renderEnv({ name: "box2", repo: "theovkern/TheOS", memory: "6g", kit: "/home/u/TheOS/kits/box" }),
    [
      'schemaVersion: "1"',
      'name: "box2"',
      "agent: claude",
      "",
      "kits:",
      '  - source: "/home/u/TheOS/kits/box"',
      "    args:",
      '      repo: "https://github.com/theovkern/TheOS"',
      "",
      "sandboxOptions:",
      '  memory: "6g"',
      "",
    ].join("\n"),
  );
});

test("a box without a repo passes the kit no arguments, and a path with odd characters stays one string", () => {
  const yaml = renderEnv({ name: "42", repo: undefined, memory: "2g", kit: 'C:\\my "kits"\\box: one' });
  assert.ok(!yaml.includes("args:"));
  assert.ok(yaml.includes('name: "42"'), "a numeric name must not become a YAML number");
  assert.ok(yaml.includes(String.raw`source: "C:\\my \"kits\"\\box: one"`));
});

test("the kit is the one in this repository, as an absolute path", () => {
  assert.match(KIT, /^\/.*\/kits\/box$|^[A-Z]:\\.*\\kits\\box$/);
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
