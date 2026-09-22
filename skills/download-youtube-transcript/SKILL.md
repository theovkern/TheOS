---
name: download-youtube-transcript
description: Download the transcript/captions of one or more YouTube videos and save each to a file. Use when the user wants to fetch, download, save, or extract the transcript, captions, or subtitles of a YouTube video.
---

# Download YouTube Transcript

Executes `download-youtube-transcript.py` to fetch the transcript of one or more YouTube videos and save each as plain text.

## How it works

YouTube does not expose captions directly on the watch page. The script:

1. Fetches the video's watch page (`https://www.youtube.com/watch?v=<id>`) and extracts the page's `INNERTUBE_API_KEY`.
2. Calls the internal `https://www.youtube.com/youtubei/v1/player` endpoint (POST, with an `ANDROID` client context) to get the list of available `captionTracks`. The `ANDROID` client is used deliberately — the default `WEB` client's caption URLs require a PO token and return an empty (but HTTP 200) response without one.
3. Picks a track: a manually created transcript in the requested language if available, otherwise an auto-generated (asr) one, otherwise whatever exists.
4. Fetches that track's `baseUrl`, which returns the transcript as simple XML (`<text start="..." dur="...">...</text>` per line).
5. Strips tags/entities and writes the plain text (one caption line per line) to the output file.

## Requirements

The script depends on `requests`. If missing, install it first:

```
pip install requests
```

## Usage

Pass matching lists of URLs and output files (same order, same length):

```
python skills/download-youtube-transcript/download-youtube-transcript.py --urls <url1> [<url2> ...] --files <file1> [<file2> ...] [--lang <code>]
```

Example, two videos at once:

```
python skills/download-youtube-transcript/download-youtube-transcript.py \
  --urls "https://www.youtube.com/watch?v=jNQXAC9IVRw" "https://youtu.be/dQw4w9WgXcQ" \
  --files zoo.txt rickroll.txt
```

`--lang` is optional (e.g. `en`, `de`); without it the script picks whatever transcript language is available, preferring a manually created one.

Accepted URL shapes: `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, or a bare 11-character video ID.

## Notes

- Raises per-video (continuing with the rest) if a video has no transcript, is unavailable, or the URL is invalid; failures are reported to stderr and reflected in the process exit code.
- `--urls` and `--files` must have the same count or the script exits with an error before doing any work.
- Output is one transcript line per caption cue, newline-separated, UTF-8 encoded — timestamps are discarded.
