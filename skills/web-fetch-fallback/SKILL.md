---
name: web-fetch-fallback
description: Fetch pages WebFetch is blocked from. Use when WebFetch returns 403, an empty body, or a JS-only shell; for any reddit.com or x.com URL; or to search Reddit.
allowed-tools: Bash
---

# Web fetch fallback

This script is rung 2 of the escalation ladder: **WebFetch → this script →
`claude-in-chrome`**, which reads through the user's logged-in browser.

Enter here directly for reddit.com and x.com — both block WebFetch always.
Climb to `claude-in-chrome` when the script exits 2.

```
python "C:\Users\theo\.claude\skills\web-fetch-fallback\fetch.py" <url-or-reference> [options]
```

Runs on any Python 3.9+, no dependencies. Full flag list: `fetch.py --help`.

## Commands

| Goal | Command |
| --- | --- |
| Comment thread | `fetch.py "https://www.reddit.com/r/Python/comments/abc123/title/"` |
| Subreddit listing | `fetch.py "r/python/top?t=week" --limit 10` |
| Search a subreddit | `fetch.py --search "pyinstaller onefile" --subreddit python` |
| Search all of Reddit | `fetch.py --search "pyside6 packaging" --period year` |
| A user's history | `fetch.py "u/spez"` |
| A tweet | `fetch.py "https://x.com/jack/status/20"` |
| Any blocked page | `fetch.py "https://example.com/article"` |

## Fetch until the content is whole

The script marks its own shortfalls. Output ending in `_Capped at N comments_`,
`_Truncated at N chars_`, or a count of collapsed "load more comments" branches
is partial: re-run with a higher `--comments` or `--max-chars`, and answer from
the complete fetch.

## What each site exposes

- **Reddit** — `old.reddit.com` HTML, which renders whole comment trees without
  JS. The `.json` API answers `403 Blocked` to every User-Agent from this
  machine's IP, so the HTML is the only surface.
- **X** — the syndication embed endpoint: one tweet, plus its parent and quoted
  tweet. Profiles, timelines and search need a logged-in browser.
- **Everything else** — browser User-Agent plus HTML-to-text. Clears UA
  sniffing; Cloudflare interstitials and JS-only pages stay blocked.
