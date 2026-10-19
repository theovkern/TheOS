#!/usr/bin/env node
// Status line: Model | Effort | Tokens | 5h [bar] | 7d | Resets | Codex 5h [bar] | Codex 7d | Codex Resets
// `node statusline.mjs` renders the line from Claude Code's JSON on stdin.
// `node statusline.mjs --refresh-codex` saves the live Codex limits to the cache.
//
// Color scheme (tuned for a terminal that renders dimmed colors):
//   - Dim cyan  = identity/session info (Model, Effort) and reset times.
//   - Bold blue = context usage (Tokens).
//   - Traffic light = usage meters, by percent spent: <33 green, <66 yellow, else red.
//   - Bold cyan = the "Resets:" labels and their "5h"/"7d" markers.
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CACHE = join(homedir(), ".cache", "theos", "codex-limits.json");
const CACHE_MAX_AGE_S = 60;
const REFRESH_LOCK_S = 30;

const RESET = "\x1b[0m";
const DIM_CYAN = "\x1b[2;36m";
const BOLD_BLUE = "\x1b[1;34m";
const BOLD_CYAN = "\x1b[1;36m";

const wrap = (code, text) => code + text + RESET;
const tierColor = (pct) => (pct < 33 ? "\x1b[1;32m" : pct < 66 ? "\x1b[1;33m" : "\x1b[1;31m");
const bar = (pct, width = 10) => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
};
const toPct = (value) => {
  const n = Number(value);
  return value === null || value === undefined || Number.isNaN(n) ? null : Math.round(n);
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n) => String(n).padStart(2, "0");
function fmtReset(epochSeconds) {
  const n = Number(epochSeconds);
  if (epochSeconds === null || epochSeconds === undefined || Number.isNaN(n)) return null;
  const reset = new Date(n * 1000);
  const time = `${pad(reset.getHours())}:${pad(reset.getMinutes())}`;
  return reset.toDateString() === new Date().toDateString() ? time : `${DAYS[reset.getDay()]} ${time}`;
}

const resetsSegment = (label, entries) => {
  const bits = entries
    .map(([marker, ts]) => [marker, fmtReset(ts)])
    .filter(([, time]) => time !== null)
    .map(([marker, time]) => wrap(BOLD_CYAN, marker) + " " + wrap(DIM_CYAN, time));
  return bits.length ? wrap(BOLD_CYAN, label) + " " + bits.join(" | ") : null;
};

// Takes a `rate_limits` object as Codex session logs and the cache store it. A window
// whose reset time has passed shows 0% and no reset time.
function codexWindows(limits) {
  const now = Date.now() / 1000;
  const windows = ["primary", "secondary"].map((key) => {
    const w = limits?.[key];
    const pct = toPct(w?.used_percent);
    if (pct === null) return { pct: null, resetsAt: null };
    const resetsAt = w.resets_at ?? null;
    return resetsAt !== null && Number(resetsAt) < now ? { pct: 0, resetsAt: null } : { pct, resetsAt };
  });
  return windows.some((w) => w.pct !== null) ? windows : null;
}

const ageSeconds = (path) => {
  try {
    return (Date.now() - statSync(path).mtimeMs) / 1000;
  } catch {
    return null;
  }
};

function startCodexRefresh() {
  const lock = CACHE + ".refreshing";
  const lockAge = ageSeconds(lock);
  if (lockAge !== null && lockAge < REFRESH_LOCK_S) return;
  try {
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(lock, "");
    spawn(process.execPath, [fileURLToPath(import.meta.url), "--refresh-codex"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } catch {}
}

// Reads one JSON object that starts at `start`, ignoring anything after it.
function jsonObjectAt(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("unterminated object");
}

function tail(path, bytes) {
  const fd = openSync(path, "r");
  try {
    const size = statSync(path).size;
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

// Fallback when there is no cache: the newest `rate_limits` entry in the newest session logs.
// Only the newest dated folders are listed, and only the last 1 MB of a file is read.
function codexLimitsFromLogs() {
  const base = join(homedir(), ".codex", "sessions");
  const subdirs = (path) => {
    try {
      return readdirSync(path).filter((e) => /^\d+$/.test(e)).sort().reverse();
    } catch {
      return [];
    }
  };
  const files = [];
  for (const y of subdirs(base).slice(0, 1))
    for (const m of subdirs(join(base, y)).slice(0, 2))
      for (const d of subdirs(join(base, y, m)).slice(0, 2)) {
        const folder = join(base, y, m, d);
        try {
          for (const f of readdirSync(folder))
            if (f.startsWith("rollout-") && f.endsWith(".jsonl")) {
              const path = join(folder, f);
              files.push({ path, mtime: statSync(path).mtimeMs });
            }
        } catch {}
      }
  files.sort((a, b) => b.mtime - a.mtime);
  for (const { path } of files.slice(0, 3)) {
    let text;
    try {
      text = tail(path, 1048576);
    } catch {
      continue;
    }
    const starts = [...text.matchAll(/"rate_limits":\s*\{/g)].map((m) => m.index + m[0].length - 1);
    for (const start of starts.reverse()) {
      try {
        const windows = codexWindows(jsonObjectAt(text, start));
        if (windows) return windows;
      } catch {}
    }
  }
  return null;
}

function codexLimits() {
  const age = ageSeconds(CACHE);
  if (age === null || age > CACHE_MAX_AGE_S) startCodexRefresh();
  if (age !== null) {
    try {
      const windows = codexWindows(JSON.parse(readFileSync(CACHE, "utf8")));
      if (windows) return windows;
    } catch {}
  }
  return codexLimitsFromLogs();
}

function render(d) {
  const parts = [wrap(DIM_CYAN, d.model?.display_name || d.model?.id || "Unknown")];

  const effort = d.effort?.level;
  if (effort) parts.push(wrap(DIM_CYAN, "Effort: " + String(effort)[0].toUpperCase() + String(effort).slice(1)));

  // total_input_tokens is null until the first API response of the session.
  const total = Number.parseInt(d.context_window?.total_input_tokens, 10) || 0;
  parts.push(wrap(BOLD_BLUE, "Tokens: " + (total >= 1000 ? (total / 1000).toFixed(1) + "k" : String(total))));

  const rl = d.rate_limits || {};
  const five = toPct(rl.five_hour?.used_percentage);
  const week = toPct(rl.seven_day?.used_percentage);
  if (five !== null) parts.push(wrap(tierColor(five), `5h: [${bar(five)}] ${five}%`));
  if (week !== null) parts.push(wrap(tierColor(week), `7d: ${week}%`));
  const claudeResets = resetsSegment("Resets:", [
    ["5h", rl.five_hour?.resets_at],
    ["7d", rl.seven_day?.resets_at],
  ]);
  if (claudeResets) parts.push(claudeResets);
  // rate_limits is absent until the first API response of the session.
  if (five === null && week === null && Object.keys(rl).length === 0) parts.push(wrap(DIM_CYAN, "Limits: warming up"));

  let codex = null;
  try {
    codex = codexLimits();
  } catch {}
  if (codex) {
    const [c5, c7] = codex;
    if (c5.pct !== null) parts.push(wrap(tierColor(c5.pct), `Codex 5h: [${bar(c5.pct)}] ${c5.pct}%`));
    if (c7.pct !== null) parts.push(wrap(tierColor(c7.pct), `Codex 7d: ${c7.pct}%`));
    const codexResets = resetsSegment("Codex Resets:", [
      ["5h", c5.resetsAt],
      ["7d", c7.resetsAt],
    ]);
    if (codexResets) parts.push(codexResets);
  }
  return parts.join(" | ");
}

// `account/rateLimits/read` on `codex app-server` reads the account's limits and spends
// no model tokens. The cache uses the session-log shape, so one parser reads both.
function refreshCodex() {
  const toWindow = (w) => w && { used_percent: w.usedPercent, resets_at: w.resetsAt };
  const server = spawn("codex", ["app-server"], { shell: true, stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
  const send = (message) => server.stdin.write(JSON.stringify(message) + "\n");
  const finish = (code) => {
    server.kill();
    process.exit(code);
  };
  setTimeout(() => finish(1), 15000);
  server.on("error", () => finish(1));

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
}

if (process.argv.includes("--refresh-codex")) {
  refreshCodex();
} else {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  process.stdout.write(render(input));
}
