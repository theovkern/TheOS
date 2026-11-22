import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KIT, bootstrapScript } from "./box.mjs";
import { linkRules } from "./box-refresh.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = (prefix) => mkdtempSync(join(tmpdir(), `${prefix}-`));
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

// ---- the bootstrap: the kit's clone step, run in a scratch home against a local repository standing in for GitHub ----

const identity = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...identity } }).trim();

// Its refresh script only records what it ran against, so these tests are about the bootstrap alone.
const REFRESH_STUB = `import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const root = join(dirname(process.argv[1]), "..");
writeFileSync(join(process.env.HOME, "refreshed"), readFileSync(join(root, "VERSION"), "utf8"));
`;

const publish = (origin, version, branch = "main") => {
  write(join(origin, "VERSION"), version);
  write(join(origin, "scripts", "box-refresh.mjs"), REFRESH_STUB);
  git(origin, "add", "-A");
  git(origin, "commit", "-q", "-m", `v${version}`);
  return git(origin, "rev-parse", "HEAD");
};

const newOrigin = () => {
  const origin = scratch("origin");
  git(origin, "init", "-q", "-b", "main");
  return origin;
};

const bootstrap = (home, origin, ref = "main") => {
  const script = bootstrapScript(readFileSync(join(KIT, "spec.yaml"), "utf8"), ref).replaceAll("/home/agent", home).replace("https://github.com/theovkern/TheOS", origin);
  return spawnSync("sh", ["-c", script], { env: { ...process.env, ...identity }, encoding: "utf8" });
};

const head = (home) => git(join(home, ".theos"), "rev-parse", "HEAD");

test("a fresh box gets a clone at the branch, and then the clone's own refresh script runs", () => {
  const origin = newOrigin();
  const first = publish(origin, "1");
  const home = scratch("home");
  const result = bootstrap(home, origin);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(head(home), first);
  assert.equal(git(join(home, ".theos"), "rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.equal(readFileSync(join(home, "refreshed"), "utf8"), "1");
  assert.match(result.stdout, new RegExp(`theos main at ${first.slice(0, 7)}`));
});

test("a box that is behind moves to the new commit, and whatever was edited in ~/.theos is discarded", () => {
  const origin = newOrigin();
  publish(origin, "1");
  const home = scratch("home");
  assert.equal(bootstrap(home, origin).status, 0);

  write(join(home, ".theos", "VERSION"), "edited in the box");
  write(join(home, ".theos", "rules", "stray.md"), "a rule nobody reviewed");
  git(join(home, ".theos"), "commit", "-qam", "a commit made in the box");
  const second = publish(origin, "2");

  const result = bootstrap(home, origin);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(head(home), second);
  assert.equal(readFileSync(join(home, ".theos", "VERSION"), "utf8"), "2");
  assert.ok(!existsSync(join(home, ".theos", "rules", "stray.md")), "an untracked rule would be loaded by Claude Code");
  assert.equal(readFileSync(join(home, "refreshed"), "utf8"), "2", "the script that runs is the one just fetched");
});

test("a box follows whichever branch it is told, and can move between branches", () => {
  const origin = newOrigin();
  publish(origin, "1");
  git(origin, "checkout", "-q", "-b", "dev/x");
  const dev = publish(origin, "dev");
  git(origin, "checkout", "-q", "main");
  const home = scratch("home");

  assert.equal(bootstrap(home, origin, "dev/x").status, 0);
  assert.equal(head(home), dev);
  assert.equal(git(join(home, ".theos"), "rev-parse", "--abbrev-ref", "HEAD"), "dev/x");
  assert.equal(bootstrap(home, origin, "main").status, 0);
  assert.equal(readFileSync(join(home, "refreshed"), "utf8"), "1");
});

test("a box made when the kit shipped copies has them parked in ~/.theos-replaced and gets a clone", () => {
  const origin = newOrigin();
  const first = publish(origin, "1");
  const home = scratch("home");
  write(join(home, ".theos", "hooks", "deny-dangerous.mjs"), "the copy");
  write(join(home, ".theos-replaced", "older"), "an earlier park");

  const result = bootstrap(home, origin);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(home, ".theos-replaced", "hooks", "deny-dangerous.mjs"), "utf8"), "the copy");
  assert.ok(!existsSync(join(home, ".theos-replaced", "older")));
  assert.equal(head(home), first);
});

test("a branch with no refresh script fails with a message that says so, after moving the clone", () => {
  const origin = newOrigin();
  const first = publish(origin, "1");
  git(origin, "checkout", "-q", "-b", "old");
  git(origin, "rm", "-q", "scripts/box-refresh.mjs");
  git(origin, "commit", "-q", "-m", "before the refresh script existed");
  git(origin, "checkout", "-q", "main");
  const home = scratch("home");

  const result = bootstrap(home, origin, "old");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /origin\/old has no scripts\/box-refresh\.mjs/);
  assert.ok(!existsSync(join(home, "refreshed")));
  assert.notEqual(head(home), first);
});

test("a branch that does not exist fails the step", () => {
  const origin = newOrigin();
  publish(origin, "1");
  const result = bootstrap(scratch("home"), origin, "no-such-branch");
  assert.notEqual(result.status, 0);
});

// ---- the refresh script, run in a scratch home with stand-ins for claude and gh ----------------------

const box = ({ claudeFails = "" } = {}) => {
  const home = scratch("refresh-home");
  const bin = join(home, "stub-bin");
  const log = join(home, "claude-calls");
  write(join(bin, "claude"), `#!/bin/sh\necho "$*" >> "${log}"\ncase "$*" in *${JSON.stringify(claudeFails || "@@never@@").slice(1, -1)}*) exit 1;; esac\n`);
  write(join(bin, "gh"), "#!/bin/sh\necho gh stub\n");
  chmodSync(join(bin, "claude"), 0o755);
  chmodSync(join(bin, "gh"), 0o755);
  return {
    home,
    run: () =>
      spawnSync(process.execPath, [join(repoRoot, "scripts", "box-refresh.mjs")], {
        env: { ...process.env, HOME: home, PATH: `${bin}${delimiter}${process.env.PATH}` },
        encoding: "utf8",
      }),
    claudeCalls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []),
    settings: () => JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8")),
  };
};

const guardEntries = (settings) => settings.hooks.PreToolUse.filter((entry) => JSON.stringify(entry).includes("deny-dangerous"));

test("a refresh links the rules, installs and updates both plugins, and wires the guard from the clone it runs in", () => {
  const b = box();
  const result = b.run();
  assert.equal(result.status, 0, result.stderr + result.stdout);

  assert.equal(readlinkSync(join(b.home, ".claude", "rules")), join(repoRoot, "rules"));
  assert.deepEqual(b.claudeCalls(), [
    "plugin marketplace add anthropics/claude-plugins-official",
    "plugin marketplace add cursor/plugins",
    "plugin marketplace update",
    "plugin install mattpocock-skills@claude-plugins-official --scope user",
    "plugin update mattpocock-skills@claude-plugins-official --scope user",
    "plugin install pstack@cursor-plugins --scope user",
    "plugin update pstack@cursor-plugins --scope user",
  ]);
  const guard = guardEntries(b.settings());
  assert.equal(guard.length, 1);
  assert.equal(guard[0].hooks[0].command, `node "${join(repoRoot, "hooks", "deny-dangerous.mjs")}" --claude`);
});

test("a refresh run again changes nothing, and keeps the settings sbx and Claude Code wrote", () => {
  const b = box();
  assert.equal(b.run().status, 0);
  write(join(b.home, ".claude", "settings.json"), JSON.stringify({ ...b.settings(), enabledPlugins: { "pstack@cursor-plugins": true } }));
  assert.equal(b.run().status, 0);
  assert.equal(guardEntries(b.settings()).length, 1);
  assert.deepEqual(b.settings().enabledPlugins, { "pstack@cursor-plugins": true });
  assert.equal(readlinkSync(join(b.home, ".claude", "rules")), join(repoRoot, "rules"));
});

test("a plugin that will not install fails the refresh but still wires the guard", () => {
  const b = box({ claudeFails: "install pstack" });
  const result = b.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL {2}plugins/);
  assert.match(result.stderr, /refresh failed: plugins/);
  assert.equal(guardEntries(b.settings()).length, 1);
  assert.ok(lstatSync(join(b.home, ".claude", "rules")).isSymbolicLink());
});

// ---- the rules link ---------------------------------------------------------------------------------------

test("the rules link replaces a real folder by parking it, never deleting it", () => {
  const dir = scratch("rules");
  const target = join(dir, "theos", "rules");
  const link = join(dir, ".claude", "rules");
  write(join(link, "pstack-models.md"), "the old copy");

  linkRules(link, target);
  assert.equal(readlinkSync(link), target);
  assert.equal(readFileSync(join(link + "-replaced", "pstack-models.md"), "utf8"), "the old copy");
});

test("the rules link is left alone when it is right, and repointed when it points elsewhere", () => {
  const dir = scratch("rules");
  const link = join(dir, ".claude", "rules");
  linkRules(link, join(dir, "a"));
  const inode = lstatSync(link).ino;
  linkRules(link, join(dir, "a"));
  assert.equal(lstatSync(link).ino, inode);
  linkRules(link, join(dir, "b"));
  assert.equal(readlinkSync(link), join(dir, "b"));
  assert.ok(!existsSync(link + "-replaced"), "a link has nothing to park");
});
