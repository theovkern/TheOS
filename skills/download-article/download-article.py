import requests
from bs4 import BeautifulSoup
import sys
import re


def download_article(url, output_file=None):
    """
    Download an article from a URL and extract its main text content.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        )
    }

    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()

    soup = BeautifulSoup(response.content, "html.parser")

    # Remove noise elements
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "iframe"]):
        tag.decompose()

    # Try to find the title
    title = None
    if soup.title:
        title = soup.title.get_text(strip=True)
    h1 = soup.find("h1")
    if h1:
        title = h1.get_text(strip=True)

    # Try common article containers first
    article = soup.find("article") or soup.find(
        "div", class_=re.compile(r"(article|post|content|entry)-?(body|content)?", re.I)
    )

    if article:
        paragraphs = article.find_all("p")
    else:
        paragraphs = soup.find_all("p")

    text = "\n\n".join(p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True))

    result = f"{title}\n{'=' * len(title) if title else ''}\n\n{text}"

    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(result)
        print(f"Article saved to {output_file}")
    else:
        print(result)

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python download_article.py <url> [output_file]")
        sys.exit(1)

    url = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    download_article(url, output_file)