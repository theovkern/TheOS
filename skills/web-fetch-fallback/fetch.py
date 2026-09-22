#!/usr/bin/env python3
"""Fetch pages that Claude Code's built-in crawler cannot reach, as Markdown.

Sites like Reddit and X block automated fetchers, but each exposes *some*
surface that a normal HTTP client can still read. This script dispatches on the
hostname and uses whichever surface works, falling back to generic HTML->text
extraction for everything else.

  reddit.com  -> old.reddit.com server-rendered HTML (the .json API is blocked
                 outright from many IPs, including this machine's; the old UI
                 renders posts and full comment trees without JS)
  x.com       -> cdn.syndication.twimg.com embed endpoint (single tweets)
  everything  -> browser User-Agent + HTML-to-text

Standard library only: runs under any Python 3.9+ with no virtualenv.
"""

from __future__ import annotations

import argparse
import gzip
import html
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from datetime import datetime, timezone
from html.parser import HTMLParser

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
TIMEOUT = 30
RETRIES = 3
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
             "link", "meta", "param", "source", "track", "wbr"}

EXIT_OK, EXIT_ERROR, EXIT_BLOCKED = 0, 1, 2


class Blocked(Exception):
    """The site refused the request (bot block or rate limit)."""


class Unsupported(Exception):
    """The site never exposes this surface to unauthenticated clients."""


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
def http_get(url: str, headers: dict[str, str] | None = None) -> tuple[str, str]:
    """GET a URL with browser-ish headers. Returns (body_text, final_url)."""
    base = {
        "User-Agent": CHROME_UA,
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "close",
    }
    base.update(headers or {})

    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=base)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read()
                encoding = (resp.headers.get("Content-Encoding") or "").lower()
                if encoding == "gzip":
                    raw = gzip.decompress(raw)
                elif encoding == "deflate":
                    raw = zlib.decompress(raw, -zlib.MAX_WBITS)
                charset = resp.headers.get_content_charset() or "utf-8"
                return raw.decode(charset, "replace"), resp.geturl()
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code in (429, 500, 502, 503, 504) and attempt < RETRIES - 1:
                time.sleep(2 ** attempt)
                continue
            if exc.code in (401, 403, 429):
                raise Blocked(f"HTTP {exc.code} {exc.reason} for {url}") from exc
            raise
        except urllib.error.URLError as exc:
            last = exc
            if attempt < RETRIES - 1:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError(f"unreachable: {last}")


def ts(epoch: float | None) -> str:
    if not epoch:
        return "unknown date"
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def iso(value: str | None) -> str:
    if not value:
        return "unknown date"
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M UTC")
    except ValueError:
        return value


# --------------------------------------------------------------------------- #
# Generic HTML -> text
# --------------------------------------------------------------------------- #
BLOCK_TAGS = {"p", "div", "section", "article", "header", "footer", "li", "tr",
              "br", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"}
DROP_TAGS = {"script", "style", "noscript", "svg", "head", "nav", "iframe", "form"}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self._drop = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in DROP_TAGS:
            self._drop += 1
        elif tag == "title":
            self._in_title = True
        elif tag in BLOCK_TAGS and self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in DROP_TAGS:
            self._drop = max(0, self._drop - 1)
        elif tag == "title":
            self._in_title = False
        elif tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._drop and data.strip():
            self.parts.append(re.sub(r"[ \t\r\f\v]+", " ", data))


def html_to_text(markup: str) -> tuple[str, str]:
    parser = TextExtractor()
    parser.feed(markup)
    text = "".join(parser.parts)
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return parser.title.strip(), text.strip()


# --------------------------------------------------------------------------- #
# Reddit: parse old.reddit.com's server-rendered HTML
# --------------------------------------------------------------------------- #
class Thing:
    """A post or comment scraped from old.reddit's markup."""

    def __init__(self, kind: str, depth: int, attrs: dict[str, str]) -> None:
        self.kind = kind                       # "link" | "comment"
        self.depth = depth
        self.author = attrs.get("data-author", "[unknown]")
        self.permalink = attrs.get("data-permalink", "")
        self.subreddit = attrs.get("data-subreddit-prefixed", "")
        self.url = attrs.get("data-url", "")
        self.nsfw = attrs.get("data-nsfw") == "true"
        self.title = ""
        self.score = ""
        self.when = ""
        self.num_comments = ""
        self.body: list[str] = []
        self.has_body = False


class OldRedditParser(HTMLParser):
    """Rebuild the post/comment tree from old.reddit's nested `thing` divs."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.things: list[Thing] = []
        self._stack: list[str | None] = []      # one entry per open element
        self._open_things: list[Thing] = []
        self._md_depth: int | None = None       # stack depth where the body div opened
        self._md_target: Thing | None = None
        self._pending: str | None = None        # "title" | "num_comments" | "time"
        self._line: list[str] = []
        self._link_href = ""
        self.more_counts: list[str] = []

    # -- helpers ----------------------------------------------------------- #
    @staticmethod
    def _classes(attrs: dict[str, str]) -> set[str]:
        return set(html.unescape(attrs.get("class", "")).split())

    def _flush_line(self, prefix: str = "", blank_after: bool = False) -> None:
        line = "".join(self._line).strip()
        self._line = []
        if self._md_target is None:
            return
        body = self._md_target.body
        # A single <p> can hold hard line breaks; keep each on its own line so
        # the renderer can indent every one of them.
        for part in line.splitlines():
            part = part.strip()
            if part:
                body.append(prefix + part)
        if blank_after and body and body[-1] != "":
            body.append("")

    # -- parsing ----------------------------------------------------------- #
    def handle_starttag(self, tag, attrs_list):
        attrs = {k: (v or "") for k, v in attrs_list}
        classes = self._classes(attrs)

        if tag not in VOID_TAGS:
            self._stack.append(tag)

        if self._md_target is not None:
            self._handle_body_start(tag, attrs, classes)
            return

        if tag == "div" and ("thing" in classes or "search-result-link" in classes):
            # Listings and threads use `thing` divs; search results use their own
            # markup, but both carry the same fields under different class names.
            kind = attrs.get("data-type") or ("link" if "search-result-link" in classes else "")
            if kind in ("link", "comment"):
                thing = Thing(kind, len(self._open_things), attrs)
                self.things.append(thing)
                self._open_things.append(thing)
                # Remember which stack depth this thing closes at.
                thing._stack_depth = len(self._stack)  # type: ignore[attr-defined]
            return

        if not self._open_things:
            return
        current = self._open_things[-1]

        if tag == "div" and "md" in classes and not current.has_body:
            current.has_body = True
            self._md_target = current
            self._md_depth = len(self._stack)
        elif tag in ("span", "div") and "score" in classes and "unvoted" in classes:
            current.score = attrs.get("title", "")
        elif tag == "time" and not current.when:
            current.when = iso(attrs.get("datetime"))
        elif tag == "a" and "title" in classes and current.kind == "link":
            self._pending = "title"
        elif tag == "a" and "comments" in classes and current.kind == "link":
            self._pending = "num_comments"
        elif tag == "span" and "morecomments" in classes:
            self._pending = "more"
        # -- search-result dialect --
        elif tag == "a" and "search-title" in classes:
            current.permalink = urllib.parse.urlsplit(html.unescape(attrs.get("href", ""))).path
            self._pending = "title"
        elif tag == "a" and "search-comments" in classes:
            self._pending = "num_comments"
        elif tag == "span" and "search-score" in classes:
            self._pending = "score"
        elif tag == "a" and "search-subreddit-link" in classes:
            self._pending = "subreddit"
        elif tag == "a" and "author" in classes and current.author == "[unknown]":
            self._pending = "author"

    def _handle_body_start(self, tag, attrs, classes):
        if tag in ("p", "blockquote", "pre", "li", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._flush_line()
        elif tag == "a":
            self._link_href = html.unescape(attrs.get("href", ""))
        elif tag == "br":
            self._flush_line()

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return

        # Body div closing?
        if self._md_target is not None and self._md_depth == len(self._stack):
            self._flush_line()
            while self._md_target.body and self._md_target.body[-1] == "":
                self._md_target.body.pop()
            self._md_target = None
            self._md_depth = None
        elif self._md_target is not None:
            if tag in ("p", "li", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6"):
                prefix = "- " if tag == "li" else "> " if tag == "blockquote" else ""
                self._flush_line(prefix, blank_after=tag != "li")
            elif tag == "a" and self._link_href and not self._link_href.startswith("#"):
                text = "".join(self._line[-1:]).strip()
                if text and text not in self._link_href:
                    self._line[-1:] = [f"[{text}]({self._link_href})"]
                self._link_href = ""

        if self._stack:
            self._stack.pop()

        # Close any things whose div just ended.
        while self._open_things and getattr(self._open_things[-1], "_stack_depth", 0) > len(self._stack):
            self._open_things.pop()

    def handle_data(self, data):
        if self._md_target is not None:
            self._line.append(data)
            return
        if not self._pending or not self._open_things:
            return
        current = self._open_things[-1]
        text = data.strip()
        if not text:
            return
        if self._pending == "title":
            current.title += text
        elif self._pending == "num_comments":
            current.num_comments = text
        elif self._pending == "more":
            self.more_counts.append(text)
        elif self._pending == "score":
            current.score = re.sub(r"\s*points?$", "", text)
        elif self._pending == "author":
            current.author = text
        elif self._pending == "subreddit":
            current.subreddit = text
        self._pending = None


def reddit_url(target: str, sort: str | None, limit: int) -> str:
    """Normalise any Reddit reference to an old.reddit.com URL."""
    target = target.strip()
    if not target.startswith(("http://", "https://")):
        target = "https://old.reddit.com/" + target.lstrip("/")

    parsed = urllib.parse.urlsplit(target)
    path = parsed.path
    if path.endswith(".json"):
        path = path[: -len(".json")]

    params = dict(urllib.parse.parse_qsl(parsed.query))
    if sort:
        params["sort"] = sort
    if "limit" not in params:
        params["limit"] = str(limit)

    return urllib.parse.urlunsplit(
        ("https", "old.reddit.com", path, urllib.parse.urlencode(params), "")
    )


def reddit_search_url(query: str, subreddit: str | None, sort: str, period: str, limit: int) -> str:
    params = {"q": query, "sort": sort, "t": period, "limit": str(limit)}
    if subreddit:
        sub = subreddit.strip().lstrip("/")
        sub = sub[2:] if sub.startswith("r/") else sub
        params["restrict_sr"] = "on"
        path = f"/r/{sub}/search"
    else:
        path = "/search"
    return urllib.parse.urlunsplit(
        ("https", "old.reddit.com", path, urllib.parse.urlencode(params), "")
    )


def render_reddit(things: list[Thing], more: list[str], comment_limit: int, max_depth: int) -> str:
    posts = [t for t in things if t.kind == "link"]
    comments = [t for t in things if t.kind == "comment"]
    out: list[str] = []

    if len(posts) == 1 and comments:
        post = posts[0]
        out.append(f"# {post.title or '(untitled)'}")
        meta = f"{post.subreddit} · u/{post.author} · {post.score or '?'} points · {post.when}"
        if post.num_comments:
            meta += f" · {post.num_comments}"
        out.append(meta)
        out.append(f"https://www.reddit.com{post.permalink}")
        if post.url and not post.url.startswith("/r/"):
            out.append(f"Links to: {post.url}")
        if post.body:
            out.append("")
            out.extend(post.body)
        out.append("")
        out.append("## Comments")
        out.append("")

        shown = 0
        for comment in comments:
            if shown >= comment_limit:
                out.append(f"_Capped at {comment_limit} comments — raise with --comments._")
                break
            if comment.depth > max_depth:
                continue
            pad = "  " * comment.depth
            out.append(f"{pad}- **u/{comment.author}** · {comment.score or '?'} points · {comment.when}")
            for line in comment.body:
                out.append(f"{pad}  {line}" if line else "")
            out.append("")
            shown += 1
        if more:
            out.append(f"_{len(more)} collapsed 'load more comments' branches were not expanded._")
        return "\n".join(out).rstrip() + "\n"

    if posts:
        for index, post in enumerate(posts, 1):
            out.append(f"{index}. **{post.title or '(untitled)'}**")
            meta = f"   {post.subreddit} · u/{post.author} · {post.score or '?'} points · {post.when}"
            if post.num_comments:
                meta += f" · {post.num_comments}"
            out.append(meta)
            out.append(f"   https://www.reddit.com{post.permalink}")
            if post.body:
                excerpt = " ".join(post.body)[:300]
                out.append(f"   {excerpt}{'…' if len(' '.join(post.body)) > 300 else ''}")
            out.append("")
        return "\n".join(out).rstrip() + "\n"

    if comments:  # e.g. a user's comment history
        for comment in comments:
            out.append(f"- **u/{comment.author}** in {comment.subreddit} · "
                       f"{comment.score or '?'} points · {comment.when}")
            out.append(f"  https://www.reddit.com{comment.permalink}")
            out.extend(f"  {line}" if line else "" for line in comment.body)
            out.append("")
        return "\n".join(out).rstrip() + "\n"

    return ""


def fetch_reddit(url: str, args) -> str:
    markup, _ = http_get(url, {"Cookie": "over18=1"})
    if args.raw:
        return markup

    parser = OldRedditParser()
    parser.feed(markup)
    rendered = render_reddit(parser.things, parser.more_counts, args.comments, args.max_depth)
    if rendered.strip():
        return rendered

    # Search pages and other layouts don't use `thing` divs — fall back to text.
    title, text = html_to_text(markup)
    print("note: no post/comment markup found; falling back to text extraction",
          file=sys.stderr)
    return f"# {title}\n\n{text}\n" if title else text + "\n"


# --------------------------------------------------------------------------- #
# X / Twitter: the syndication (embed) endpoint
# --------------------------------------------------------------------------- #
def js_base36(value: float, digits: int = 12) -> str:
    """Port of JS `Number.prototype.toString(36)` for a positive float."""
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    whole, frac = int(value), value - int(value)
    out = ""
    while whole:
        out = alphabet[whole % 36] + out
        whole //= 36
    out = out or "0"
    if frac:
        out += "."
        for _ in range(digits):
            frac *= 36
            digit = int(frac)
            out += alphabet[digit]
            frac -= digit
    return out


def tweet_token(tweet_id: str) -> str:
    """The cache-busting token the embed endpoint expects (as react-tweet derives it)."""
    return js_base36((int(tweet_id) / 1e6) * math.pi).replace("0", "").replace(".", "")


def tweet_id_from(url: str) -> str | None:
    match = re.search(r"/status(?:es)?/(\d+)", urllib.parse.urlsplit(url).path)
    return match.group(1) if match else None


def render_tweet(data: dict, depth: int = 0) -> list[str]:
    user = data.get("user") or {}
    pad = "  " * depth
    out = [
        f"{pad}**{user.get('name', '?')}** (@{user.get('screen_name', '?')}) · "
        f"{iso(data.get('created_at'))}"
    ]

    text = data.get("text") or ""
    for entity in ((data.get("entities") or {}).get("urls") or []):
        if entity.get("url") and entity.get("expanded_url"):
            text = text.replace(entity["url"], entity["expanded_url"])
    for line in text.strip().splitlines():
        out.append(f"{pad}{line}")

    stats = []
    if data.get("favorite_count") is not None:
        stats.append(f"{data['favorite_count']} likes")
    if data.get("conversation_count") is not None:
        stats.append(f"{data['conversation_count']} replies")
    if stats:
        out.append(f"{pad}_{' · '.join(stats)}_")

    for photo in data.get("photos") or []:
        out.append(f"{pad}[image] {photo.get('url', '')}")
    if data.get("video"):
        variants = data["video"].get("variants") or []
        if variants:
            out.append(f"{pad}[video] {variants[-1].get('src', '')}")

    if data.get("quoted_tweet"):
        out.append(f"{pad}Quoting:")
        out.extend(render_tweet(data["quoted_tweet"], depth + 1))
    return out


def fetch_x(url: str, args) -> str:
    tweet_id = tweet_id_from(url)
    if not tweet_id:
        raise Unsupported(
            "X only exposes single tweets to unauthenticated clients. Profiles, "
            "timelines and search need a logged-in browser — the claude-in-chrome "
            "skill can read those."
        )

    endpoint = (
        "https://cdn.syndication.twimg.com/tweet-result"
        f"?id={tweet_id}&token={tweet_token(tweet_id)}&lang=en"
    )
    body, _ = http_get(endpoint, {"Accept": "application/json"})
    if args.raw:
        return body

    data = json.loads(body)
    out: list[str] = []
    if data.get("parent"):
        out.append("Replying to:")
        out.extend(render_tweet(data["parent"], 1))
        out.append("")
    out.extend(render_tweet(data))
    out.append("")
    out.append(f"https://x.com/{(data.get('user') or {}).get('screen_name', 'i')}/status/{tweet_id}")
    out.append("")
    out.append("_Note: the embed endpoint returns the tweet itself (plus any parent "
               "and quoted tweet), not the reply thread._")
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# Generic
# --------------------------------------------------------------------------- #
def fetch_generic(url: str, args) -> str:
    markup, final = http_get(url)
    if args.raw:
        return markup
    title, text = html_to_text(markup)
    header = f"# {title}\n\n" if title else ""
    if final != url:
        header += f"_Redirected to {final}_\n\n"
    if len(text) > args.max_chars:
        text = text[: args.max_chars] + f"\n\n_Truncated at {args.max_chars} chars (--max-chars)._"
    return header + text + "\n"


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def classify(target: str) -> tuple[str, str]:
    """Return (host, absolute-url) for a URL or a bare reference like 'r/python'."""
    target = target.strip()
    if target.startswith(("http://", "https://")):
        host = urllib.parse.urlsplit(target).netloc.lower()
        return host.removeprefix("www."), target

    first = target.lstrip("/").split("/", 1)[0].split("?", 1)[0]
    if "." in first:  # bare domain, e.g. "example.com/page"
        return first.lower().removeprefix("www."), "https://" + target.lstrip("/")
    # No dot in the first segment: a Reddit shorthand such as r/python or u/spez.
    return "reddit.com", target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fetch crawler-blocked pages (Reddit, X, and the general web) as Markdown.",
    )
    parser.add_argument("target", nargs="?",
                        help="URL, or a bare Reddit reference like 'r/python' or 'u/spez'.")
    parser.add_argument("--search", metavar="QUERY", help="Search Reddit instead of fetching a URL.")
    parser.add_argument("--subreddit", help="Restrict --search to this subreddit.")
    parser.add_argument("--sort", help="Sort order: listings hot|new|top|rising, "
                                       "threads confidence|top|new|old|qa, search relevance|top|new|comments.")
    parser.add_argument("--period", default="all",
                        choices=["hour", "day", "week", "month", "year", "all"],
                        help="Time window for --search / top listings (default: all).")
    parser.add_argument("--limit", type=int, default=25, help="Listing results (default: 25).")
    parser.add_argument("--comments", type=int, default=150, help="Max comments rendered (default: 150).")
    parser.add_argument("--max-depth", type=int, default=6, help="Max comment nesting depth (default: 6).")
    parser.add_argument("--max-chars", type=int, default=40000,
                        help="Truncate generic page text (default: 40000).")
    parser.add_argument("--raw", action="store_true", help="Print the raw response instead of Markdown.")
    args = parser.parse_args(argv)

    if not args.target and not args.search:
        parser.error("provide a URL/reference, or --search QUERY")

    # Windows consoles default to cp1252, which mangles quotes, dashes and emoji.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    try:
        if args.search:
            url = reddit_search_url(args.search, args.subreddit,
                                    args.sort or "relevance", args.period, args.limit)
            output = fetch_reddit(url, args)
        else:
            host, target = classify(args.target)

            if host.endswith("reddit.com") or host.endswith("redd.it"):
                output = fetch_reddit(reddit_url(target, args.sort, args.limit), args)
            elif host in ("x.com", "twitter.com", "mobile.twitter.com",
                          "vxtwitter.com", "fxtwitter.com"):
                output = fetch_x(target, args)
            else:
                args.target = target
                output = fetch_generic(target, args)

        sys.stdout.write(output)
        return EXIT_OK

    except Unsupported as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_BLOCKED
    except Blocked as exc:
        print(f"error: blocked — {exc}\n"
              "Retry once in a minute; if it persists, climb to the claude-in-chrome skill.",
              file=sys.stderr)
        return EXIT_BLOCKED
    except urllib.error.HTTPError as exc:
        print(f"error: HTTP {exc.code} {exc.reason}", file=sys.stderr)
        return EXIT_ERROR
    except urllib.error.URLError as exc:
        print(f"error: network failure: {exc.reason}", file=sys.stderr)
        return EXIT_ERROR
    except json.JSONDecodeError:
        print("error: expected JSON but got something else (usually a block page).", file=sys.stderr)
        return EXIT_BLOCKED


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
