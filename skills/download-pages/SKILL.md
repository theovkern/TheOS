---
name: download-pages
description: Download multiple web pages and concatenate their extracted main text content into one file, each section labeled with its source URL. Use when the user wants to fetch several related pages (e.g. a curated source list for a persona/knowledge corpus) into a single raw-text file, rather than one page at a time.
---

# Download Pages

Executes `download-pages.py` to fetch a list of URLs and extract each page's main text
content (title + headings + paragraphs + list items + blockquotes), concatenating the
results into one output file with a `SOURCE:`/`TITLE:` header per page. This is the
multi-URL generalization of `skills/download-article/` — reach for that one for a single
page, this one when building up a raw-source file from several pages in one pass.

## Requirements

The script depends on `requests` and `beautifulsoup4`. If they're missing, install them first:

```
pip install requests beautifulsoup4
```

## Usage

Pass the output file, then either URLs directly or a path to a file listing one URL per line:

```
python skills/download-pages/download-pages.py <output_file> <url1> <url2> <url3> ...
```

```
python skills/download-pages/download-pages.py <output_file> <urls_list.txt>
```

Useful flags:

- `--append` — add to `output_file` instead of overwriting it (for building a corpus up across several separate runs)
- `--delay <seconds>` — pause between requests (default 1.0s); be a considerate scraper on sites you hit repeatedly
- `--boiler-file <path>` — path to a file of exact strings (one per line) to strip from every page, for sites with recurring nav/ad boilerplate that isn't caught by the generic `<nav>`/`<footer>`/`<header>` removal (e.g. "Learn More", "Watch", app-store CTAs). Off by default so it never silently drops real content on sites you haven't checked.

## Notes

- **Do not read the output file back to verify it after running.** Trust the script's own
  stdout/exit code — it prints `[i/N] fetched: <title>` per page and a final `Wrote X/Y pages`
  count, and exits nonzero with a `FAILED <url>: ...` list on stderr for anything that failed.
  That's sufficient confirmation; re-reading a multi-page output file to eyeball the extracted
  text spends tokens the script's own reporting already makes unnecessary.
- The script raises per-URL and reports failures at the end without aborting the whole batch — check stderr for a `FAILED <url>: ...` list and the exit code (1 if any URL failed).
- Content-container detection tries `<article>`, then `<main>`, then common `content`/`post`/`entry` div classes, falling back to the whole page — same heuristic as `download-article`, so some sites may still need a custom extractor for the trickiest layouts.
- Within a single page, exact-duplicate text blocks are dropped automatically (handles sites that repeat a heading right before its own body, e.g. principles.com).
- **Curate the URL list deliberately** — this script does not crawl or discover links. For a large site (e.g. a whole book mirrored page-per-section), pick the specific pages relevant to what you're grounding, rather than pointing it at every link found in a site-wide table of contents; a full-site crawl is a materially bigger, slower operation than "download a few pages" and usually isn't what's needed for building a persona/raw-source corpus.
