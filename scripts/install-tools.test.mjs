import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PLACEHOLDERS, PLATFORMS, PROFILES, commandLine, expand, installPlan, loadRegistry, parseArgs } from "./install-tools.mjs";

const registry = loadRegistry();
const PACKAGE_MANAGERS = ["winget", "brew"];
const plan = (profile, os, values = { bin: "/home/u/.local/bin", home: "/home/u", cpu: "amd64" }) => installPlan(registry, { profile, os, values });
const names = (profile, os) => plan(profile, os).map(({ name }) => name).sort();

test("every tool names real profiles and platforms, and only the placeholders that exist", () => {
  for (const [name, tool] of Object.entries(registry)) {
    assert.ok(tool.profiles.length > 0 && tool.profiles.every((p) => PROFILES.includes(p)), `${name} profiles`);
    for (const [os, commands] of Object.entries(tool.install)) {
      assert.ok(PLATFORMS.includes(os), `${name} installs on ${os}`);
      for (const command of commands) {
        assert.ok(command.length > 0 && command.every((a) => typeof a === "string"), `${name} on ${os} is a list of strings`);
        for (const [, key] of command.join(" ").matchAll(/(?<![$%])\{(\w+)\}/g)) assert.ok(PLACEHOLDERS.includes(key), `${name} on ${os} uses {${key}}`);
      }
    }
  }
});

for (const os of PLATFORMS) {
  test(`${os}: Claude Code and Codex never come from a package manager, which would stop auto-update`, () => {
    for (const { name, commands } of plan("host", os)) {
      if (name !== "claude" && name !== "codex") continue;
      for (const [file] of commands) assert.ok(!PACKAGE_MANAGERS.includes(file), `${os} installs ${name} with ${file}`);
    }
  });

  test(`${os}: a work machine and a box install the tools their profile lists, on every platform`, () => {
    assert.deepEqual(names("host", os), ["acli", "claude", "codex", "gh", "glab"]);
    assert.deepEqual(names("box", os), ["gh"]);
    for (const { name, commands } of [...plan("host", os), ...plan("box", os)]) assert.ok(commands.length > 0, `${name} has no installer on ${os}`);
  });
}

test("the server profile installs sbx and Tailscale on Linux", () => {
  assert.deepEqual(names("server", "linux"), ["sbx", "tailscale"]);
});

test("sbx is checked with `sbx version`, which has no --version flag", () => {
  assert.deepEqual(plan("server", "linux").find(({ name }) => name === "sbx").check, ["sbx", "version"]);
});

test("linux: no host or box tool needs Homebrew or sudo", () => {
  for (const { name, commands } of [...plan("host", "linux"), ...plan("box", "linux")]) {
    for (const command of commands) assert.ok(!/\b(brew|sudo)\b/.test(command.join(" ")), `${name} runs ${command.join(" ")}`);
  }
});

const commandsOf = (profile, os, values) => Object.fromEntries(plan(profile, os, values).map(({ name, commands }) => [name, commands]));
const winget = (id) => ["winget", "install", "--id", id, "--exact", "--silent", "--accept-package-agreements", "--accept-source-agreements"];

// The commands `npm run install-tools` ran before it read tools.json, copied from that version of this file.
test("the host profile still expands to the commands it always ran", () => {
  assert.deepEqual(commandsOf("host", "linux"), {
    gh: [["bash", "-c", "set -eo pipefail; mkdir -p \"/home/u/.local/bin\"; v=$(basename $(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/cli/cli/releases/latest)); v=${v#v}; curl -fsSL \"https://github.com/cli/cli/releases/download/v$v/gh_${v}_linux_amd64.tar.gz\" | tar -xzO \"gh_${v}_linux_amd64/bin/gh\" > \"/home/u/.local/bin/gh\"; chmod +x \"/home/u/.local/bin/gh\""]],
    glab: [["bash", "-c", "set -eo pipefail; mkdir -p \"/home/u/.local/bin\"; v=$(curl -fsSL https://gitlab.com/api/v4/projects/gitlab-org%2Fcli/releases/permalink/latest | grep -o '\"tag_name\":\"[^\"]*\"' | cut -d'\"' -f4); v=${v#v}; curl -fsSL \"https://gitlab.com/gitlab-org/cli/-/releases/v$v/downloads/glab_${v}_linux_amd64.tar.gz\" | tar -xzO \"bin/glab\" > \"/home/u/.local/bin/glab\"; chmod +x \"/home/u/.local/bin/glab\""]],
    acli: [["curl", "-fsSL", "--create-dirs", "-o", "/home/u/.local/bin/acli", "https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli"], ["chmod", "+x", "/home/u/.local/bin/acli"]],
    claude: [["bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"]],
    codex: [["npm", "install", "--global", "--prefix", "/home/u/.local", "@openai/codex"]],
  });

  assert.deepEqual(commandsOf("host", "darwin"), {
    gh: [["brew", "install", "gh"]],
    glab: [["brew", "install", "glab"]],
    acli: [["brew", "tap", "atlassian/homebrew-acli"], ["brew", "install", "acli"]],
    claude: [["bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"]],
    codex: [["npm", "install", "--global", "--prefix", "/home/u/.local", "@openai/codex"]],
  });

  assert.deepEqual(commandsOf("host", "win32", { bin: String.raw`C:\Users\u\.local\bin`, home: String.raw`C:\Users\u`, cpu: "amd64" }), {
    gh: [winget("GitHub.cli")],
    glab: [winget("GLab.GLab")],
    acli: [["curl.exe", "-fsSL", "--create-dirs", "-o", String.raw`C:\Users\u\.local\bin\acli.exe`, "https://acli.atlassian.com/windows/latest/acli_windows_amd64/acli.exe"]],
    claude: [["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"]],
    codex: [["npm", "install", "--global", "@openai/codex"]],
  });
});

test("arm64 machines get arm64 release binaries", () => {
  const [[, , script]] = commandsOf("box", "linux", { bin: "/b", home: "/h", cpu: "arm64" }).gh;
  assert.match(script, /linux_arm64\.tar\.gz/);
  assert.doesNotMatch(script, /amd64/);
});

test("a machine whose CPU has no release spelling fails loudly instead of fetching a URL that does not exist", () => {
  assert.throws(() => expand(["curl", "x_{cpu}"], { bin: "/b", home: "/h", cpu: undefined }), /\{cpu\}/);
});

test("shell variables and curl's own braces survive expansion", () => {
  assert.deepEqual(expand(["echo ${v#v} %{url_effective} {bin}"], { bin: "/b", home: "/h", cpu: "amd64" }), ["echo ${v#v} %{url_effective} /b"]);
});

test("parseArgs defaults to the host profile and rejects what it does not know", () => {
  assert.deepEqual(parseArgs([]), { profile: "host", print: false });
  assert.deepEqual(parseArgs(["--profile", "box", "--print"]), { profile: "box", print: true });
  assert.throws(() => parseArgs(["--profile", "laptop"]), /host, server, box/);
  assert.throws(() => parseArgs(["--profil", "box"]), /unknown argument/);
});

test("a printed command line runs in a shell with exactly the arguments it was printed from", () => {
  const argv = ["bash", "-c", "echo \"it's $HOME\"; echo ${v#v}", "with space"];
  const out = execFileSync("bash", ["-c", `printf '%s\\n' ${commandLine(argv)}`], { encoding: "utf8" }).trimEnd().split("\n");
  assert.deepEqual(out, argv);
});
