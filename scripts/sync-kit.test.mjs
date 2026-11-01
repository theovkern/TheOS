import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KIT_COPIES, KIT_DIR, kitDrift, syncKit } from "./sync-kit.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const scratchRepo = () => {
  const root = mkdtempSync(join(tmpdir(), "sync-kit-"));
  for (const [source] of KIT_COPIES) {
    mkdirSync(dirname(join(root, source)), { recursive: true });
    writeFileSync(join(root, source), `contents of ${source}\n`);
  }
  return root;
};

test("every copy in kits/box matches its source byte for byte (run npm run sync-kit to fix)", () => {
  assert.deepEqual(kitDrift(repoRoot), []);
});

test("a kit with no copies at all is all drift, and syncing makes it whole", () => {
  const root = scratchRepo();
  assert.equal(kitDrift(root).length, KIT_COPIES.length);
  assert.equal(syncKit(root).length, KIT_COPIES.length);
  assert.deepEqual(kitDrift(root), []);
});

test("an edited source is drift until synced, and syncing again changes nothing", () => {
  const root = scratchRepo();
  syncKit(root);
  writeFileSync(join(root, "scripts/tools.json"), "{}\n");
  assert.deepEqual(kitDrift(root), [{ source: "scripts/tools.json", copy: `${KIT_DIR}/files/home/.theos/scripts/tools.json` }]);
  syncKit(root);
  assert.equal(readFileSync(join(root, KIT_DIR, "files/home/.theos/scripts/tools.json"), "utf8"), "{}\n");
  assert.deepEqual(syncKit(root), []);
});

test("an edit made to the copy is drift too, because the source is the only place to edit", () => {
  const root = scratchRepo();
  syncKit(root);
  writeFileSync(join(root, KIT_DIR, "files/home/.theos/hooks/dangerous-patterns.txt"), "allow everything\n");
  assert.equal(kitDrift(root).length, 1);
});

test("every ~/.theos file the kit's spec runs is in the kit", () => {
  const spec = readFileSync(join(repoRoot, KIT_DIR, "spec.yaml"), "utf8");
  const paths = [...spec.matchAll(/\/home\/agent\/(\.theos\/[\w./-]+)/g)].map(([, path]) => path);
  assert.ok(paths.length > 0);
  for (const path of paths) assert.ok(existsSync(join(repoRoot, KIT_DIR, "files/home", path)), `${path} is missing from the kit`);
});

test("the kit's copies work from where the box puts them: tools resolve, the guard is wired and blocks", () => {
  const home = mkdtempSync(join(tmpdir(), "kit-home-"));
  cpSync(join(repoRoot, KIT_DIR, "files/home"), home, { recursive: true });
  const run = (args, input) => spawnSync(process.execPath, args, { env: { ...process.env, HOME: home }, input, encoding: "utf8" });

  const tools = run([join(home, ".theos/scripts/install-tools.mjs"), "--profile", "box", "--print"]);
  assert.equal(tools.status, 0, tools.stderr);
  assert.match(tools.stdout, /^# gh/m);

  assert.equal(run([join(home, ".theos/scripts/wire-guard.mjs")]).status, 0);
  const settings = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  const guardPath = join(home, ".theos/hooks/deny-dangerous.mjs");
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, `node "${guardPath}" --claude`);

  const guard = (cmd) => run([guardPath, "--claude"], JSON.stringify({ tool_name: "Bash", tool_input: { command: cmd } }));
  assert.equal(guard("rm -rf ~").status, 2);
  assert.equal(guard("ls").status, 0);
  rmSync(home, { recursive: true });
});
