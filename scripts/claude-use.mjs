#!/usr/bin/env node
// Switches the Claude login every session uses, like /login does: running sessions
// pick up ~/.claude/.credentials.json on their next request. Each account's login is
// stashed in ~/.claude-accounts/, saved back on every switch because tokens rotate.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ACCOUNTS = ["personal", "work"];
// Before the first switch nothing records who is logged in; it is the everyday account.
const FIRST_ACTIVE = "personal";

// credentials: the parsed .credentials.json, or null when logged out.
// config: the parsed ~/.claude.json; oauthAccount is what /status shows.
// stash: { [account]: { credentials, oauthAccount } }
export function swap({ active, target, credentials, config, stash }) {
  const nextStash = { ...stash };
  if (credentials) nextStash[active] = { credentials, oauthAccount: config.oauthAccount ?? null };
  const saved = nextStash[target];
  const nextConfig = { ...config };
  if (saved?.oauthAccount) nextConfig.oauthAccount = saved.oauthAccount;
  else delete nextConfig.oauthAccount;
  return { stash: nextStash, credentials: saved?.credentials ?? null, config: nextConfig, needsLogin: !saved };
}

const home = homedir();
const credentialsPath = join(home, ".claude", ".credentials.json");
const configPath = join(home, ".claude.json");
const stashDir = join(home, ".claude-accounts");
const activePath = join(stashDir, "active");
const stashPath = (account) => join(stashDir, `${account}.json`);

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);
// Write beside, then rename, so a running session never reads half a file.
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
};

function main(target) {
  const active = existsSync(activePath) ? readFileSync(activePath, "utf8").trim() : FIRST_ACTIVE;
  if (!target) {
    console.log("Usage: claude-use <" + ACCOUNTS.join("|") + ">");
    console.log("Switches the login of every Claude session, running ones included.");
    console.log(`Current account: ${active}`);
    return;
  }
  if (!ACCOUNTS.includes(target)) {
    console.error(`Unknown account "${target}". Choose one of: ${ACCOUNTS.join(", ")}`);
    process.exit(1);
  }
  if (target === active) {
    console.log(`Already on ${target}.`);
    return;
  }

  const stash = Object.fromEntries(ACCOUNTS.map((a) => [a, readJson(stashPath(a))]).filter(([, v]) => v));
  const next = swap({ active, target, credentials: readJson(credentialsPath), config: readJson(configPath) ?? {}, stash });

  for (const [account, entry] of Object.entries(next.stash)) writeJson(stashPath(account), entry);
  if (next.credentials) writeJson(credentialsPath, next.credentials);
  else rmSync(credentialsPath, { force: true });
  writeJson(configPath, next.config);
  writeFileSync(activePath, target + "\n");

  console.log(`Claude account: ${target}`);
  if (next.needsLogin) console.log(`No saved login for ${target} yet. Run /login in any session; the next switch saves it.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) main(process.argv[2]);
