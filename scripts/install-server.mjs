#!/usr/bin/env node
// Makes a Linux machine the host for the agent boxes (npm run box):
//   - installs sbx and Tailscale (the server profile of tools.json)
//   - puts me in the kvm group, which sbx needs for its microVMs
//   - lets my user services run without a login (linger)
//   - hardens sshd: keys only, no root, no agent forwarding
//   - shares TheOS's skills with every box
//   - starts the sbx daemon and every defined box at boot, then brings each up to date, from a user systemd unit
// Run it in a real terminal. It asks for sudo once. With no terminal it does the steps that need no
// root and prints the rest as a shell script, then exits 0.
// Safe to run twice: each step first checks whether its end state already holds.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandLine, isInstalled, runCommands, systemPlan } from "./install-tools.mjs";
import { discoverSkills } from "./link-skills.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SSHD_DROP_IN = "/etc/ssh/sshd_config.d/10-agent-host.conf";
export const UNIT_NAME = "theos-boxes.service";
export const SKILLS_REPO = "theovkern/TheOS";

const SSHD_SETTINGS = ["PasswordAuthentication no", "KbdInteractiveAuthentication no", "PermitRootLogin no", "AllowAgentForwarding no"];

export const sshdDropIn = () => SSHD_SETTINGS.map((setting) => `${setting}\n`).join("");

/** The user unit that brings the boxes back after a boot and up to date. `$` is doubled and `%h` used because
 *  systemd expands both in a command line before the shell sees it. The daemon start may fail harmlessly when
 *  the daemon is already up, hence the leading `-`; a box that fails to start or to update does fail the unit,
 *  but not the boxes after it. `node` and `box` are absolute because a user unit has almost no PATH.
 *  The daemon and every box VM start inside this unit's cgroup, so KillMode=process: under the default,
 *  a restart or a failed update would kill all of them, mid-write. */
export const unitFile = ({ sbx, node, box }) =>
  [
    "[Unit]",
    "Description=TheOS agent boxes: the sbx daemon, then every defined box, started and updated",
    "",
    "[Service]",
    "Type=oneshot",
    "RemainAfterExit=yes",
    "TimeoutStartSec=30min",
    "KillMode=process",
    `ExecStart=-${sbx} daemon start --detach`,
    `ExecStart=/bin/sh -c 'status=0; for dir in "%h"/.config/theos/boxes/*/; do [ -f "$$dir/sbxenv.yaml" ] || continue; name="$$(basename "$$dir")"; "${sbx}" run -d --name "$$name" && "${node}" "${box}" update "$$name" || status=1; done; exit $$status'`,
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");

/** Installs the drop-in, has sshd check the whole config, and only then reloads. A config sshd rejects
 *  would stop the next login from working, so it is removed instead. */
export const sshdScript = (path = SSHD_DROP_IN) =>
  [
    "set -e",
    `printf '%s\\n' ${SSHD_SETTINGS.map((setting) => `'${setting}'`).join(" ")} | sudo tee ${path} > /dev/null`,
    `sudo sshd -t || { sudo rm -f ${path}; echo 'sshd -t rejected the drop-in, so it was removed' >&2; exit 1; }`,
    "sudo systemctl try-reload-or-restart ssh",
  ].join("\n");

/**
 * Pure. What this machine still needs, in order, and what is wrong enough to say so.
 * facts: user, missingTools [{ name, commands }], kvmMembers (null without a kvm group), linger,
 *   sshd { present, includesDropIns, current, hasAuthorizedKey }, missingSkills, unit { current, enabled, sbx, node, box }.
 * A step: { name, sudo, commands, files?: [{ path, content }], needs?: "sbx" }.
 */
export function plan(facts) {
  const steps = [];
  const warnings = [];

  for (const { name, commands } of facts.missingTools) steps.push({ name: `install ${name}`, sudo: true, commands });

  if (facts.kvmMembers === null) warnings.push("This machine has no kvm group, so sbx cannot run microVMs here.");
  else if (!facts.kvmMembers.includes(facts.user)) {
    steps.push({ name: `add ${facts.user} to the kvm group (log out and in afterwards)`, sudo: true, commands: [["sudo", "usermod", "-aG", "kvm", facts.user]] });
  }

  if (!facts.linger) steps.push({ name: "let user services run without a login", sudo: true, commands: [["sudo", "loginctl", "enable-linger", facts.user]] });

  if (!facts.sshd.present) warnings.push("No sshd config directory here, so the ssh hardening was skipped.");
  else if (!facts.sshd.includesDropIns) warnings.push("sshd_config does not include sshd_config.d, so the ssh hardening would have no effect and was skipped.");
  else if (facts.sshd.current !== sshdDropIn()) {
    if (facts.sshd.hasAuthorizedKey) steps.push({ name: "harden sshd", sudo: true, commands: [["bash", "-c", sshdScript()]] });
    else warnings.push("~/.ssh/authorized_keys holds no key, so password login was left on: turning it off would lock you out.");
  }

  if (facts.missingSkills.length > 0) {
    steps.push({ name: "share TheOS skills with every box", sudo: false, needs: "sbx", commands: [["sbx", "skills", "add", SKILLS_REPO, "--force"]] });
  }

  if (facts.unit.current !== unitFile(facts.unit) || !facts.unit.enabled) {
    steps.push({
      name: "start the sbx daemon and every box at boot, and update each",
      sudo: false,
      files: [{ path: join(homedir(), ".config", "systemd", "user", UNIT_NAME), content: unitFile(facts.unit) }],
      commands: [["systemctl", "--user", "daemon-reload"], ["systemctl", "--user", "enable", UNIT_NAME]],
    });
  }

  return { steps, warnings };
}

// ---- IO ------------------------------------------------------------------------------------

const output = (argv) => {
  try {
    return execFileSync(argv[0], argv.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

const readOrNull = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);

function gatherFacts() {
  const user = userInfo().username;
  const kvmGroup = output(["getent", "group", "kvm"]);
  const sbx = output(["sh", "-c", "command -v sbx"]) ?? "/usr/bin/sbx";
  const stored = new Set((output(["sbx", "skills", "ls"]) ?? "").split("\n").slice(1).map((line) => line.split(/\s+/)[0]));
  const authorizedKeys = readOrNull(join(homedir(), ".ssh", "authorized_keys")) ?? "";
  const unitPath = join(homedir(), ".config", "systemd", "user", UNIT_NAME);
  let sshdCurrent = null;
  try {
    sshdCurrent = readOrNull(SSHD_DROP_IN);
  } catch {}

  return {
    user,
    missingTools: systemPlan("server").filter(({ check, commands }) => commands.length > 0 && !isInstalled(check)),
    kvmMembers: kvmGroup === null ? null : kvmGroup.split(":")[3].split(","),
    linger: output(["loginctl", "show-user", user, "--property=Linger", "--value"]) === "yes",
    sshd: {
      present: existsSync("/etc/ssh/sshd_config.d"),
      includesDropIns: /^Include\s+\/etc\/ssh\/sshd_config\.d\/\*\.conf/m.test(readOrNull("/etc/ssh/sshd_config") ?? ""),
      current: sshdCurrent,
      hasAuthorizedKey: authorizedKeys.split("\n").some((line) => line.trim() && !line.trim().startsWith("#")),
    },
    missingSkills: Object.keys(discoverSkills(join(repoRoot, "skills"))).filter((name) => !stored.has(name)),
    unit: {
      current: readOrNull(unitPath),
      enabled: output(["systemctl", "--user", "is-enabled", UNIT_NAME]) === "enabled",
      sbx,
      node: process.execPath,
      box: join(repoRoot, "scripts", "box.mjs"),
    },
  };
}

function run(step) {
  for (const { path, content } of step.files ?? []) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  runCommands(step.commands);
}

function main() {
  if (process.platform !== "linux") {
    console.error("The server setup is for Linux.");
    process.exit(1);
  }
  const { steps, warnings } = plan(gatherFacts());
  for (const warning of warnings) console.log(`note: ${warning}`);
  if (steps.length === 0) return console.log("This machine is already set up as a box host.");

  const terminal = process.stdin.isTTY && process.stdout.isTTY;
  if (terminal && steps.some(({ sudo }) => sudo)) {
    try {
      execFileSync("sudo", ["-v"], { stdio: "inherit" });
    } catch {
      console.error("sudo did not authenticate, so nothing was changed.");
      process.exit(1);
    }
  }

  const todo = [];
  for (const step of steps) {
    if (step.sudo && !terminal) {
      todo.push(step);
      continue;
    }
    if (step.needs && !isInstalled([step.needs, "version"])) {
      console.log(`skipped  ${step.name}: ${step.needs} is not installed yet, so run this again after the install`);
      continue;
    }
    console.log(`running  ${step.name}`);
    run(step);
  }

  if (todo.length > 0) {
    console.log("\nThese need sudo and there is no terminal to ask in. Run them in one, or run `npm run setup-server` there:\n");
    for (const step of todo) {
      console.log(`# ${step.name}`);
      for (const command of step.commands) console.log(commandLine(command));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
