import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { plan, sshdDropIn, sshdScript, unitFile } from "./install-server.mjs";

const UNIT = { sbx: "/usr/bin/sbx", node: "/usr/bin/node", box: "/home/theo/TheOS/scripts/box.mjs" };

const settled = () => ({
  user: "theo",
  missingTools: [],
  kvmMembers: ["theo"],
  linger: true,
  sshd: { present: true, includesDropIns: true, current: sshdDropIn(), hasAuthorizedKey: true },
  missingSkills: [],
  unit: { ...UNIT, current: unitFile(UNIT), enabled: true },
});

const fresh = () => ({
  ...settled(),
  missingTools: [{ name: "sbx", commands: [["sudo", "apt-get", "install", "-y", "docker-sbx"]] }, { name: "tailscale", commands: [["bash", "-c", "x"]] }],
  kvmMembers: [],
  linger: false,
  sshd: { present: true, includesDropIns: true, current: null, hasAuthorizedKey: true },
  missingSkills: ["skill-a"],
  unit: { ...UNIT, current: null, enabled: false },
});

const names = ({ steps }) => steps.map(({ name }) => name.split(" (")[0]);

test("a machine that is already set up has nothing to do", () => {
  assert.deepEqual(plan(settled()), { steps: [], warnings: [] });
});

test("a bare machine needs everything, in an order where each step can rely on the one before", () => {
  const { steps, warnings } = plan(fresh());
  assert.deepEqual(names({ steps }), [
    "install sbx",
    "install tailscale",
    "add theo to the kvm group",
    "let user services run without a login",
    "harden sshd",
    "share TheOS skills with every box",
    "start the sbx daemon and every box at boot, and update each",
  ]);
  assert.deepEqual(warnings, []);
});

test("only the steps that touch the system need sudo, and the ones that do not can run without a terminal", () => {
  const bySudo = Object.fromEntries(plan(fresh()).steps.map((step) => [step.name.split(" (")[0], step.sudo]));
  assert.deepEqual(Object.values(bySudo), [true, true, true, true, true, false, false]);
  const skills = plan(fresh()).steps.find(({ name }) => /skills/.test(name));
  assert.equal(skills.needs, "sbx", "sharing skills must wait for sbx to exist");
});

test("each step is dropped once its end state holds", () => {
  const withKvm = { ...fresh(), kvmMembers: ["theo", "ai"] };
  assert.ok(!names(plan(withKvm)).includes("add theo to the kvm group"));
  const withSkills = { ...fresh(), missingSkills: [] };
  assert.ok(!names(plan(withSkills)).includes("share TheOS skills with every box"));
  const stale = { ...settled(), unit: { ...UNIT, current: "[Unit]\n", enabled: true } };
  assert.deepEqual(names(plan(stale)), ["start the sbx daemon and every box at boot, and update each"]);
  const disabled = { ...settled(), unit: { ...settled().unit, enabled: false } };
  assert.deepEqual(names(plan(disabled)), ["start the sbx daemon and every box at boot, and update each"]);
});

test("the unit goes into the user's systemd folder and is enabled, never started", () => {
  const step = plan({ ...settled(), unit: { ...UNIT, current: null, enabled: false } }).steps[0];
  assert.match(step.files[0].path, /\.config\/systemd\/user\/theos-boxes\.service$/);
  assert.deepEqual(step.commands, [["systemctl", "--user", "daemon-reload"], ["systemctl", "--user", "enable", "theos-boxes.service"]]);
});

test("ssh password login is never turned off for a user with no key to log in with", () => {
  const { steps, warnings } = plan({ ...fresh(), sshd: { present: true, includesDropIns: true, current: null, hasAuthorizedKey: false } });
  assert.ok(!names({ steps }).includes("harden sshd"));
  assert.match(warnings.join("\n"), /lock you out/);
});

test("an sshd that does not read sshd_config.d, or is not there, is told about and left alone", () => {
  for (const sshd of [{ present: false, includesDropIns: false, current: null, hasAuthorizedKey: true }, { present: true, includesDropIns: false, current: null, hasAuthorizedKey: true }]) {
    const result = plan({ ...settled(), sshd });
    assert.deepEqual(result.steps, []);
    assert.equal(result.warnings.length, 1);
  }
});

test("a drop-in that differs from the wanted one is replaced", () => {
  const { steps } = plan({ ...settled(), sshd: { ...settled().sshd, current: "PasswordAuthentication yes\n" } });
  assert.deepEqual(names({ steps }), ["harden sshd"]);
});

test("a machine with no kvm group is told so instead of being given a step that cannot work", () => {
  const { steps, warnings } = plan({ ...settled(), kvmMembers: null });
  assert.deepEqual(steps, []);
  assert.match(warnings[0], /kvm/);
});

test("the drop-in turns off passwords, keyboard-interactive login, root login and agent forwarding", () => {
  assert.deepEqual(sshdDropIn().trim().split("\n"), ["PasswordAuthentication no", "KbdInteractiveAuthentication no", "PermitRootLogin no", "AllowAgentForwarding no"]);
});

// ---- the scripts, run against stand-ins for sudo, sshd and systemctl --------------------------

const stubs = (bodies) => {
  const root = mkdtempSync(join(tmpdir(), "install-server-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const [name, body] of Object.entries({ sudo: 'exec "$@"', ...bodies })) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return { root, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` } };
};

test("sshd hardening writes the drop-in, checks the config, then reloads", () => {
  const { root, env } = stubs({ sshd: `echo "sshd $*" >> "$LOG"`, systemctl: `echo "systemctl $*" >> "$LOG"` });
  const dropIn = join(root, "10-agent-host.conf");
  const log = join(root, "log");
  const result = spawnSync("bash", ["-c", sshdScript(dropIn)], { env: { ...env, LOG: log }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(dropIn, "utf8"), sshdDropIn());
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), ["sshd -t", "systemctl try-reload-or-restart ssh"]);
});

test("sshd hardening removes its drop-in and does not reload when sshd rejects the config", () => {
  const { root, env } = stubs({ sshd: "exit 1", systemctl: `echo "systemctl $*" >> "$LOG"` });
  const dropIn = join(root, "10-agent-host.conf");
  const log = join(root, "log");
  const result = spawnSync("bash", ["-c", sshdScript(dropIn)], { env: { ...env, LOG: log }, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.ok(!existsSync(dropIn), "a rejected drop-in would break the next login");
  assert.ok(!existsSync(log), "nothing was reloaded");
});

// The command systemd would hand to sh: `$$` and `%h` expanded the way systemd expands them.
const bootScript = (unit, home) => {
  const line = unitFile(unit).split("\n").filter((l) => l.startsWith("ExecStart="))[1];
  return line.replace(/^ExecStart=\/bin\/sh -c '/, "").replace(/'$/, "").replaceAll("$$", "$").replaceAll("%h", home);
};

const stubProgram = (path, log, failOn) => {
  writeFileSync(path, `#!/bin/sh\necho "$(basename "$0") $*" >> "${log}"\ncase "$*" in *${failOn}*) exit 1;; esac\n`);
  chmodSync(path, 0o755);
};

test("at boot the unit starts the daemon, then starts and updates every defined box, and keeps going when one fails", () => {
  const home = mkdtempSync(join(tmpdir(), "unit-home-"));
  const boxes = join(home, ".config", "theos", "boxes");
  for (const name of ["alpha", "broken", "delta", "gamma"]) {
    mkdirSync(join(boxes, name), { recursive: true });
    writeFileSync(join(boxes, name, "sbxenv.yaml"), "x");
  }
  mkdirSync(join(boxes, "stray"));
  const log = join(home, "log");
  const unit = { sbx: join(home, "sbx"), node: join(home, "node"), box: join(home, "box.mjs") };
  stubProgram(unit.sbx, log, "broken");
  stubProgram(unit.node, log, "delta");

  assert.equal(unitFile(unit).split("\n").find((l) => l.startsWith("ExecStart=")), `ExecStart=-${unit.sbx} daemon start --detach`);
  const result = spawnSync("/bin/sh", ["-c", bootScript(unit, home)], { encoding: "utf8" });

  assert.equal(result.status, 1, "a failed box makes the unit fail, so systemctl shows it");
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
    "sbx run -d --name alpha",
    `node ${unit.box} update alpha`,
    "sbx run -d --name broken",
    "sbx run -d --name delta",
    `node ${unit.box} update delta`,
    "sbx run -d --name gamma",
    `node ${unit.box} update gamma`,
  ]);
});

test("with no boxes defined the unit succeeds", () => {
  const home = mkdtempSync(join(tmpdir(), "unit-home-"));
  assert.equal(spawnSync("/bin/sh", ["-c", bootScript({ sbx: "/nonexistent/sbx", node: "/nonexistent/node", box: "/nonexistent/box.mjs" }, home)]).status, 0);
});

test("stopping or failing the unit leaves the sbx daemon and the boxes it started running", () => {
  const unit = { sbx: "/usr/bin/sbx", node: "/usr/bin/node", box: "/x/box.mjs" };
  assert.ok(unitFile(unit).split("\n").includes("KillMode=process"));
});
