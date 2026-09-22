---
name: download-article
description: Download an article from a URL and extract its main text content (title + body paragraphs). Use when the user wants to fetch, download, save, or extract the readable text of a web article or blog post.
---

# Download Article

Executes `download-article.py` to fetch a URL and extract the article's title and main body text, stripping navigation, scripts, and other page noise.

## Requirements

The script depends on `requests` and `beautifulsoup4`. If they're missing, install them first:

```
pip install requests beautifulsoup4
```

## Usage

Run the bundled script with the article URL. Optionally pass an output file to save the result instead of printing it.

Print to stdout:

```
python skills/download-article/download-article.py <url>
```

Save to a file:

```
python skills/download-article/download-article.py <url> <output_file>
```

## Notes

- The script raises on non-2xx HTTP responses; report the error to the user if the fetch fails.
- Extraction is heuristic (looks for `<article>` or common content containers, falling back to all `<p>` tags), so some sites may yield partial or noisy text.
