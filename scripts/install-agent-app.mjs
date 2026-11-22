#!/usr/bin/env node
// Makes Claude Code shells act on GitHub as the App healthos-agent[bot] in every repo the App is
// installed on. Copies the token script to ~/.local/bin, writes the App ID, and puts the gh/git
// wrapper block in ~/.bashrc above the interactive guard, which Claude Code's shells never pass.
// The private key is the one manual step: generate one per machine (see setup/new-machine.md),
// so a lost machine costs one revoked key. Without a key the block stays off.
// Safe to run twice: the block is replaced in place, never added a second time.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ID = "5757780";
const here = fileURLToPath(new URL("./agent-app/", import.meta.url));
export const BLOCK = readFileSync(join(here, "bashrc.sh"), "utf8");

// Debian and Ubuntu's ~/.bashrc stop non-interactive shells here; the block must come first.
const GUARDS = [/^# If not running interactively/m, /^case \$- in/m, /^\[ -z "\$PS1" \]/m];

export function withAgentBlock(bashrc, block = BLOCK) {
  const old = /^# healthos-agent:.*?^fi\n/ms.exec(bashrc);
  if (old) return bashrc.slice(0, old.index) + block + bashrc.slice(old.index + old[0].length);
  for (const guard of GUARDS) {
    const hit = guard.exec(bashrc);
    if (hit) return bashrc.slice(0, hit.index) + block + "\n" + bashrc.slice(hit.index);
  }
  if (bashrc.trim() === "") return block;
  return bashrc.replace(/\n*$/, "\n\n") + block;
}

function main() {
  if (process.platform === "win32") {
    console.log("Agent App    skipped (Windows has no ~/.bashrc)");
    return;
  }
  const home = homedir();
  const bin = join(home, ".local", "bin");
  const config = join(home, ".config", "healthos-agent");

  mkdirSync(bin, { recursive: true });
  copyFileSync(join(here, "healthos-agent-token"), join(bin, "healthos-agent-token"));
  chmodSync(join(bin, "healthos-agent-token"), 0o755);

  mkdirSync(config, { recursive: true, mode: 0o700 });
  chmodSync(config, 0o700);
  writeFileSync(join(config, "app-id"), APP_ID + "\n", { mode: 0o600 });

  const rc = join(home, ".bashrc");
  const before = existsSync(rc) ? readFileSync(rc, "utf8") : "";
  const after = withAgentBlock(before);
  if (after !== before) writeFileSync(rc, after);

  const key = join(config, "private-key.pem");
  console.log(`Agent App    token script installed, ~/.bashrc ${after === before ? "unchanged" : "updated"}`);
  if (!existsSync(key)) {
    console.log(`             no private key yet: generate one at github.com/settings/apps/healthos-agent`);
    console.log(`             and save it as ${key} (chmod 600). Until then the block stays off.`);
  }
  console.log("             New Claude sessions pick it up; running ones keep their old shell snapshot.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
