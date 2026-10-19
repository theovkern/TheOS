#!/usr/bin/env node
// Saves the current Codex rate limits for the status line. `account/rateLimits/read`
// on `codex app-server` reads the account's limits and spends no model tokens.
import { spawn } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CACHE = join(homedir(), ".cache", "theos", "codex-limits.json");

// Same shape as the `rate_limits` entries in Codex session logs, so one parser reads both.
const toWindow = (w) => w && { used_percent: w.usedPercent, resets_at: w.resetsAt };

const server = spawn("codex", ["app-server"], { shell: true, stdio: ["pipe", "pipe", "ignore"] });
const send = (message) => server.stdin.write(JSON.stringify(message) + "\n");
const finish = (code) => {
  server.kill();
  process.exit(code);
};
setTimeout(() => finish(1), 15000);

let buffer = "";
server.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id === 1) {
      send({ method: "initialized" });
      send({ id: 2, method: "account/rateLimits/read" });
    }
    if (message.id === 2) {
      const limits = message.result?.rateLimits;
      if (!limits) finish(1);
      mkdirSync(dirname(CACHE), { recursive: true });
      writeFileSync(CACHE + ".tmp", JSON.stringify({ primary: toWindow(limits.primary), secondary: toWindow(limits.secondary) }));
      renameSync(CACHE + ".tmp", CACHE);
      finish(0);
    }
  }
});
send({ id: 1, method: "initialize", params: { clientInfo: { name: "theos-statusline", version: "1" } } });
