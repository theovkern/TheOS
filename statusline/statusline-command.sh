#!/usr/bin/env bash
# Status line: Model | Effort | Tokens | 5h [bar] | 7d | Resets | Codex 5h [bar] | Codex 7d
# Uses Python for JSON parsing (jq is not installed on this machine).
#
# Color scheme (tuned for a terminal that renders dimmed colors):
#   - Cyan   = identity/session info (Model, Effort)         - passive, dim
#   - Blue   = context usage (Tokens)                        - bold, active
#   - Traffic-light (green/yellow/red) = usage meters (5h and 7d rate
#     limits), tiered by percentage spent: <33% green, <66% yellow,
#     >=66% red. The 5h limit is shown as a filled progress bar plus
#     percentage; the 7d limit is shown as a plain percentage only.
#   - Bold cyan = headline emphasis for the "Resets:" label and the
#     "5h"/"7d" markers within it, so the reset segment reads at a
#     glance; the reset time values themselves stay dim cyan.
input=$(cat)

python_bin="$(command -v python || command -v python3)"
if [ -z "$python_bin" ]; then
  printf '%s' "$input" | head -c 0  # no python available; emit nothing
  exit 0
fi

printf '%s' "$input" | "$python_bin" -c '
import sys, json, datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

RESET = "\x1b[0m"
DIM_CYAN = "\x1b[2;36m"    # identity/session info - Model, Effort (passive)
BOLD_BLUE = "\x1b[1;34m"   # context usage - Tokens, Ctx % (active)
BOLD_CYAN = "\x1b[1;36m"   # headline labels - Resets:, 5h/7d markers (emphasis)

def tier_color(pct):
    # Traffic-light tiering for usage meters (rate limits): three levels
    if pct < 33:
        return "\x1b[1;32m"    # bold green - plenty of headroom
    elif pct < 66:
        return "\x1b[1;33m"    # bold yellow - moderate usage
    else:
        return "\x1b[1;31m"    # bold red - heavy usage / near limit

def wrap(code, text):
    return code + text + RESET

def bar(pct, width=10):
    filled = int(round(pct / 100.0 * width))
    filled = max(0, min(width, filled))
    return "█" * filled + "░" * (width - filled)

model = (d.get("model") or {}).get("display_name") or (d.get("model") or {}).get("id") or "Unknown"
parts = [wrap(DIM_CYAN, model)]

effort = (d.get("effort") or {}).get("level")
if effort:
    parts.append(wrap(DIM_CYAN, "Effort: " + str(effort).capitalize()))

cw = d.get("context_window") or {}
raw_total = cw.get("total_input_tokens")
# total_input_tokens is null until the first API response of the session;
# default to 0 so the Tokens segment always renders instead of vanishing
# on startup and only appearing after the first message completes.
try:
    total = int(raw_total) if raw_total is not None else 0
except (TypeError, ValueError):
    total = 0
tokens = "%.1fk" % (total / 1000) if total >= 1000 else str(total)
parts.append(wrap(BOLD_BLUE, "Tokens: " + tokens))

rl = d.get("rate_limits") or {}
five = (rl.get("five_hour") or {}).get("used_percentage")
week = (rl.get("seven_day") or {}).get("used_percentage")
had_limit = False

def fmt_reset(ts):
    # Convert a resets_at epoch timestamp to a short local (PC) time string.
    try:
        now = datetime.datetime.now()
        reset_dt = datetime.datetime.fromtimestamp(float(ts))
        if reset_dt.date() == now.date():
            return reset_dt.strftime("%H:%M")
        return reset_dt.strftime("%a %H:%M")
    except (TypeError, ValueError, OSError, OverflowError):
        return None

if five is not None:
    try:
        five_pct = round(float(five))
        parts.append(wrap(tier_color(five_pct), "5h: [%s] %d%%" % (bar(five_pct), five_pct)))
        had_limit = True
    except (TypeError, ValueError):
        pass
if week is not None:
    try:
        week_pct = round(float(week))
        parts.append(wrap(tier_color(week_pct), "7d: %d%%" % week_pct))
        had_limit = True
    except (TypeError, ValueError):
        pass

# Codex 5h / weekly limits (percent used), read from the newest Codex session
# log. Only the newest dated folders are listed and only the file tail is read.
# Shows nothing if no log or no rate_limits entry is found.
def codex_limits():
    import os, re, time
    base = os.path.join(os.path.expanduser("~"), ".codex", "sessions")
    def subdirs(p):
        try:
            return sorted((e for e in os.listdir(p) if e.isdigit()), reverse=True)
        except OSError:
            return []
    files = []
    for y in subdirs(base)[:1]:
        for m in subdirs(os.path.join(base, y))[:2]:
            for dd in subdirs(os.path.join(base, y, m))[:2]:
                folder = os.path.join(base, y, m, dd)
                try:
                    for f in os.listdir(folder):
                        if f.startswith("rollout-") and f.endswith(".jsonl"):
                            p = os.path.join(folder, f)
                            files.append((os.path.getmtime(p), p))
                except OSError:
                    pass
    files.sort(reverse=True)
    for _, path in files[:3]:
        try:
            with open(path, "rb") as fh:
                fh.seek(0, 2)
                size = fh.tell()
                fh.seek(max(0, size - 1048576))
                text = fh.read().decode("utf-8", "ignore")
        except OSError:
            continue
        hits = list(re.finditer(r"\"rate_limits\":\s*\{", text))
        for mt in reversed(hits):
            try:
                obj, _ = json.JSONDecoder().raw_decode(text, mt.end() - 1)
            except ValueError:
                continue
            out = []
            for key in ("primary", "secondary"):
                w = obj.get(key) if isinstance(obj, dict) else None
                if not isinstance(w, dict) or w.get("used_percent") is None:
                    out.append(None)
                    continue
                try:
                    pct = float(w["used_percent"])
                    ra = w.get("resets_at")
                    if ra is not None and float(ra) < time.time():
                        pct = 0.0
                    out.append(int(round(pct)))
                except (TypeError, ValueError):
                    out.append(None)
            if any(v is not None for v in out):
                return out
    return None

# Show both the 5h and the 7d (weekly) reset times, side by side, converted
# to local (PC) time. The "Resets:" label and the "5h"/"7d" markers are
# bolded so this reads as a headline at a glance; the time values stay in
# the same dim, passive style as the rest of the identity/session info.
five_reset = fmt_reset((rl.get("five_hour") or {}).get("resets_at"))
week_reset = fmt_reset((rl.get("seven_day") or {}).get("resets_at"))
reset_bits = []
if five_reset is not None:
    reset_bits.append(wrap(BOLD_CYAN, "5h") + " " + wrap(DIM_CYAN, five_reset))
if week_reset is not None:
    reset_bits.append(wrap(BOLD_CYAN, "7d") + " " + wrap(DIM_CYAN, week_reset))
if reset_bits:
    parts.append(wrap(BOLD_CYAN, "Resets:") + " " + " | ".join(reset_bits))

if not had_limit and not rl:
    # rate_limits is entirely absent until the first API response of the
    # session completes; show a placeholder so the segment does not just
    # disappear on a fresh session (mirrors the "Ctx: warming up" behavior).
    parts.append(wrap(DIM_CYAN, "Limits: warming up"))

# Codex segments go last, rendered exactly like the Claude 5h / 7d segments.
try:
    cx = codex_limits()
except Exception:
    cx = None
if cx:
    if cx[0] is not None:
        v = cx[0]
        parts.append(wrap(tier_color(v), "Codex 5h: [%s] %d%%" % (bar(v), v)))
    if cx[1] is not None:
        v = cx[1]
        parts.append(wrap(tier_color(v), "Codex 7d: %d%%" % v))

sys.stdout.write(" | ".join(parts))
'
