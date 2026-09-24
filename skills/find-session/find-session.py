"""Rank past Claude Code sessions by how well they match the given terms."""

import argparse
import glob
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

PROJECTS = os.path.expanduser("~/.claude/projects")
WEIGHT = {"title": 5, "user": 3, "assistant": 1}
SNIPPET_WIDTH = 90


@dataclass
class Session:
    id: str
    cwd: str = ""
    started: str = ""
    last: str = ""
    title: str = ""
    first_prompt: str = ""
    hits: dict = field(default_factory=dict)
    snippets: list = field(default_factory=list)

    def score(self):
        return (len(self.hits), sum(self.hits.values()))


def text_of(message):
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    return " ".join(part.get("text", "") for part in content if part.get("type") == "text")


def typed_prompt(text):
    if text.startswith("Base directory for this skill:"):
        return text.partition("ARGUMENTS:")[2].strip()
    if text.startswith(("<", "[Request interrupted", "Caveat:")):
        return ""
    return text


def match(session, patterns, source, text):
    for term, pattern in patterns.items():
        found = pattern.search(text)
        if not found:
            continue
        session.hits[term] = session.hits.get(term, 0) + WEIGHT[source]
        if source != "assistant" and len(session.snippets) < 3:
            start = max(0, found.start() - SNIPPET_WIDTH // 2)
            snippet = " ".join(text[start:start + SNIPPET_WIDTH].split())
            session.snippets.append(f"{source}: ...{snippet}...")


def scan(path, patterns):
    session = Session(id=os.path.basename(path)[:-len(".jsonl")])
    custom_title = ""
    with open(path, encoding="utf-8", errors="replace") as lines:
        for line in lines:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            kind = record.get("type")
            if kind == "custom-title":
                custom_title = record.get("customTitle") or custom_title
                continue
            if kind == "ai-title":
                session.title = record.get("aiTitle") or session.title
                continue
            if kind not in ("user", "assistant") or record.get("isSidechain"):
                continue
            session.cwd = session.cwd or record.get("cwd", "")
            stamp = record.get("timestamp", "")
            session.started = session.started or stamp
            session.last = stamp or session.last
            text = text_of(record.get("message", {}))
            if kind == "user":
                text = typed_prompt(text)
                if not text:
                    continue
                session.first_prompt = session.first_prompt or " ".join(text[:200].split())
            match(session, patterns, kind, text)
    session.title = custom_title or session.title
    match(session, patterns, "title", session.title)
    return session


def day(stamp):
    return stamp[:10] if stamp else "?"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("terms", nargs="+", help="words or phrases; each is matched case-insensitively")
    parser.add_argument("--project", help="keep sessions whose working directory contains this text")
    parser.add_argument("--since", help="keep sessions active on or after YYYY-MM-DD")
    parser.add_argument("--until", help="keep sessions started on or before YYYY-MM-DD")
    parser.add_argument("--limit", type=int, default=8)
    args = parser.parse_args()

    patterns = {term: re.compile(re.escape(term), re.IGNORECASE) for term in args.terms}
    current = os.environ.get("CLAUDE_CODE_SESSION_ID", "")
    since = args.since and datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc).timestamp()

    sessions = []
    for path in glob.glob(os.path.join(PROJECTS, "*", "*.jsonl")):
        if os.path.basename(path).startswith(current or "\0") or (since and os.path.getmtime(path) < since):
            continue
        session = scan(path, patterns)
        if not session.hits or not session.started:
            continue
        if args.project and args.project.lower() not in session.cwd.lower():
            continue
        if args.until and day(session.started) > args.until:
            continue
        sessions.append(session)

    sessions.sort(key=lambda s: (s.score(), s.last), reverse=True)
    for session in sessions[:args.limit]:
        matched, weight = session.score()
        print(f"{session.id}  {day(session.started)} .. {day(session.last)}  terms {matched}/{len(patterns)}  weight {weight}")
        print(f"  cwd:    {session.cwd}")
        print(f"  title:  {session.title or '-'}")
        print(f"  first:  {session.first_prompt or '-'}")
        for snippet in session.snippets:
            print(f"  {snippet}")
        print()
    print(f"{len(sessions)} matching sessions; showed {min(len(sessions), args.limit)}.")


if __name__ == "__main__":
    main()
