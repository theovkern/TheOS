#!/usr/bin/env python3
"""Render a cheatmap plan into HTML.

    python render.py <path-to-slug.plan.json>

The plan holds content. This script holds layout. Nothing here makes an
editorial decision, so the page costs zero model tokens to produce and every
cheatmap comes out the same shape.

Writes two files beside the plan:

    <slug>.html           standalone page, opens in a browser
    <slug>.artifact.html  fragment for the Artifact tool (no doctype, no
                          mermaid library - Artifacts render mermaid natively)

Schema: see `page-spec.md`. Standard library only, Python 3.9+.
"""

from __future__ import annotations

import html
import json
import pathlib
import sys

DOTS = {"green": "\U0001F7E2", "amber": "\U0001F7E0", "grey": "⚪"}
MERMAID_CDN = "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"

warnings = []


def esc(value):
    return html.escape("" if value is None else str(value))


def warn(message):
    warnings.append(message)


def sup(refs):
    if not refs:
        return ""
    return "".join('<sup><a href="#s%d">%d</a></sup>' % (int(n), int(n)) for n in refs)


def render_item(item, where):
    for field in ("title", "body", "dot"):
        if not item.get(field):
            warn("%s: item %r has no %s" % (where, item.get("title", "?"), field))
    dot = DOTS.get(item.get("dot"), DOTS["grey"])
    tag = '<span class="tag">%s</span>' % esc(item["type"]) if item.get("type") else ""
    dated = '<span class="dated">%s</span>' % esc(item["dated"]) if item.get("dated") else ""
    xref = '<p class="xref">%s</p>' % esc(item["link"]) if item.get("link") else ""
    return (
        '<li class="item">'
        '<p class="head"><span class="dot">%s</span>'
        '<span class="title">%s</span>%s%s</p>'
        '<p class="body">%s%s</p>%s</li>'
    ) % (dot, esc(item.get("title")), tag, dated, esc(item.get("body")), sup(item.get("sources")), xref)


def render_items(items, cut, where):
    out = []
    for index, item in enumerate(items):
        if cut and index == int(cut):
            out.append(
                '<li class="cut"><span>1–%d carry most of it. '
                "Below the line is real, and smaller.</span></li>" % int(cut)
            )
        out.append(render_item(item, where))
    return '<ol class="items">' + "".join(out) + "</ol>"


def render_part(part):
    if part.get("state") == "contested":
        camps = "".join(
            "<li><b>%s</b> — optimises for %s. Pick it when %s.</li>"
            % (esc(c.get("name")), esc(c.get("optimises")), esc(c.get("pick_when")))
            for c in part.get("camps", [])
        )
        if not camps:
            warn("map: contested part %r names no camps" % part.get("name"))
        detail = '<ul class="camps">%s</ul>' % camps
        mark = "⚔️"
    else:
        answer = part.get("answer")
        detail = '<p class="answer">%s</p>' % esc(answer) if answer else ""
        mark = "✅"
    if not part.get("purpose"):
        warn("map: part %r has no purpose line" % part.get("name"))
    return (
        '<li class="part">'
        '<p class="head"><span class="dot">%s</span><span class="title">%s</span></p>'
        '<p class="body">%s</p>%s</li>'
    ) % (mark, esc(part.get("name")), esc(part.get("purpose")), detail)


def render_path(stages):
    out = []
    for number, stage in enumerate(stages, 1):
        topics = "".join("<li>%s</li>" % esc(t) for t in stage.get("topics", []))
        out.append(
            '<li class="stage">'
            '<p class="head"><span class="n">%d</span><span class="title">%s</span></p>'
            "<ul>%s</ul></li>" % (number, esc(stage.get("stage")), topics)
        )
    return '<ol class="path">' + "".join(out) + "</ol>"


def render_sources(sources):
    if not sources:
        return ""
    rows = "".join(
        '<li id="s%d" value="%d"><a href="%s">%s</a></li>'
        % (int(s["n"]), int(s["n"]), esc(s.get("url")), esc(s.get("title") or s.get("url")))
        for s in sources
    )
    return (
        '<details class="sources"><summary>Sources (%d)</summary><ol>%s</ol></details>'
        % (len(sources), rows)
    )


SECTIONS = (
    ("learn_deep", "Learn Deep", "What must I really understand?"),
    ("cheat_codes", "Cheat codes", "What do I need to understand, but never build?"),
    ("traps", "Traps", "What will hurt me?"),
)


def build_body(plan):
    parts = ['<div class="wrap">']
    parts.append(
        "<header><h1>%s</h1><p class=\"meta\">cheatmap · %s</p></header>"
        % (esc(plan.get("topic")), esc(plan.get("generated")))
    )

    if plan.get("headline"):
        parts.append('<p class="headline">%s</p>' % esc(plan["headline"]))

    the_map = plan.get("map") or {}
    parts.append('<section><h2>The Map</h2><p class="q">What is this made of?</p>')
    if the_map.get("mermaid"):
        parts.append('<pre class="mermaid">%s</pre>' % esc(the_map["mermaid"]))
    else:
        warn("map: no mermaid diagram")
    parts.append(
        '<ul class="items">'
        + "".join(render_part(p) for p in the_map.get("parts", []))
        + "</ul></section>"
    )

    cuts = plan.get("cut_lines") or {}
    for key, title, question in SECTIONS:
        items = plan.get(key) or []
        if not items:
            warn("%s: empty" % key)
            continue
        parts.append(
            '<section><h2>%s</h2><p class="q">%s</p>%s</section>'
            % (title, question, render_items(items, cuts.get(key), key))
        )

    if plan.get("path"):
        parts.append(
            '<section><h2>The Path</h2><p class="q">In what order?</p>%s</section>'
            % render_path(plan["path"])
        )

    if plan.get("next"):
        rows = "".join("<li>%s</li>" % esc(t) for t in plan["next"])
        parts.append('<section><h2>Run next</h2><ul class="next">%s</ul></section>' % rows)

    parts.append(render_sources(plan.get("sources")))
    parts.append("</div>")
    return "".join(parts)


def check_source_refs(plan):
    known = set(int(s["n"]) for s in plan.get("sources", []) if "n" in s)
    for key, _, _ in SECTIONS:
        for item in plan.get(key) or []:
            for ref in item.get("sources") or []:
                if int(ref) not in known:
                    warn(
                        "%s: %r cites source %s, which is not listed"
                        % (key, item.get("title"), ref)
                    )


MERMAID_INIT = (
    "<script>mermaid.initialize({startOnLoad:true,securityLevel:'loose',"
    'theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"});</script>'
)


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    plan_path = pathlib.Path(sys.argv[1])
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    check_source_refs(plan)

    head = (pathlib.Path(__file__).parent / "template.html").read_text(encoding="utf-8")
    head = head.replace("__TITLE__", esc(plan.get("topic")))
    body = build_body(plan)

    slug = plan.get("slug") or plan_path.stem.replace(".plan", "")
    out_dir = plan_path.parent

    fragment = out_dir / ("%s.artifact.html" % slug)
    fragment.write_text(head + "\n" + body + "\n", encoding="utf-8")

    standalone = out_dir / ("%s.html" % slug)
    standalone.write_text(
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        + head
        + "\n</head>\n<body>\n"
        + body
        + '\n<script src="%s"></script>\n' % MERMAID_CDN
        + MERMAID_INIT
        + "\n</body>\n</html>\n",
        encoding="utf-8",
    )

    for message in warnings:
        print("warn: %s" % message, file=sys.stderr)
    print("%s  %d bytes" % (standalone, standalone.stat().st_size))
    print("%s  %d bytes" % (fragment, fragment.stat().st_size))
    print("%d warnings" % len(warnings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
