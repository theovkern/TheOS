import argparse
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)

CONTENT_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote"]

PREFIXES = {
    "h1": "# ",
    "h2": "## ",
    "h3": "### ",
    "h4": "#### ",
    "h5": "##### ",
    "h6": "###### ",
    "li": "- ",
    "blockquote": "> ",
    "p": "",
}


def load_boilerplate(path):
    if not path:
        return set()
    with open(path, encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip() and not line.strip().startswith("#")}


def load_urls(args_urls):
    """A single positional arg pointing at an existing file is treated as a
    newline-separated list of URLs; otherwise every positional arg is a URL."""
    if len(args_urls) == 1:
        try:
            with open(args_urls[0], encoding="utf-8") as f:
                lines = [line.strip() for line in f]
            return [line for line in lines if line and not line.startswith("#")]
        except (OSError, UnicodeDecodeError):
            pass
    return args_urls


def find_content_container(soup):
    article = soup.find("article") or soup.find("main")
    if article:
        return article
    import re

    article = soup.find(
        "div", class_=re.compile(r"(article|post|content|entry)-?(body|content)?", re.I)
    )
    return article or soup


def find_title(soup, container):
    for level in ("h1", "h2", "h3"):
        h = container.find(level)
        if h:
            text = h.get_text(strip=True)
            if text:
                return text
    if soup.title:
        return soup.title.get_text(strip=True)
    return None


def extract_page(url, boilerplate):
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    response.raise_for_status()

    soup = BeautifulSoup(response.content, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "iframe", "noscript"]):
        tag.decompose()

    container = find_content_container(soup)
    title = find_title(soup, container)

    blocks = []
    seen = set()
    for el in container.find_all(CONTENT_TAGS):
        if el.name == "li" and el.find(["ul", "ol"]):
            # A list item that wraps a nested list; its own get_text() would
            # duplicate the nested items, which are picked up separately below.
            continue
        text = re.sub(r"\s+", " ", el.get_text(" ", strip=True))
        if not text or text in seen or text in boilerplate:
            continue
        seen.add(text)
        blocks.append(PREFIXES.get(el.name, "") + text)

    body = "\n\n".join(blocks)
    return title, body


def main():
    parser = argparse.ArgumentParser(
        description="Fetch one or more URLs, extract main text content, and concatenate into one file."
    )
    parser.add_argument("output_file", help="Path to write the concatenated output to")
    parser.add_argument(
        "urls",
        nargs="+",
        help="One or more URLs, or a single path to a text file listing one URL per line",
    )
    parser.add_argument(
        "--boiler-file",
        help="Optional path to a file of exact boilerplate strings to strip (one per line)",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append to output_file instead of overwriting it",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Seconds to wait between requests (default: 1.0)",
    )
    args = parser.parse_args()

    urls = load_urls(args.urls)
    boilerplate = load_boilerplate(args.boiler_file)

    mode = "a" if args.append else "w"
    ok, failed = 0, []

    with open(args.output_file, mode, encoding="utf-8") as out:
        for i, url in enumerate(urls):
            try:
                title, body = extract_page(url, boilerplate)
            except Exception as exc:  # noqa: BLE001 - report and continue the batch
                print(f"FAILED {url}: {exc}", file=sys.stderr)
                failed.append(url)
                continue

            out.write("=" * 80 + "\n")
            out.write(f"SOURCE: {url}\n")
            if title:
                out.write(f"TITLE: {title}\n")
            out.write("=" * 80 + "\n\n")
            out.write(body)
            out.write("\n\n")
            ok += 1
            print(f"[{i + 1}/{len(urls)}] fetched: {title or url}")

            if i < len(urls) - 1:
                time.sleep(args.delay)

    print(f"\nWrote {ok}/{len(urls)} pages to {args.output_file}")
    if failed:
        print(f"Failed ({len(failed)}):", file=sys.stderr)
        for url in failed:
            print(f"  {url}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
