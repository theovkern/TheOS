import argparse
import html
import re
import sys
import xml.etree.ElementTree as ET

import requests

WATCH_URL = "https://www.youtube.com/watch?v={video_id}"
INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player?key={api_key}"
# The ANDROID client is used because the default WEB client now requires a
# PO token to unlock the caption endpoint; ANDROID does not.
INNERTUBE_CONTEXT = {"client": {"clientName": "ANDROID", "clientVersion": "20.10.38"}}

VIDEO_ID_RE = re.compile(
    r"(?:v=|/videos/|youtu\.be/|/embed/|/shorts/|/v/)([A-Za-z0-9_-]{11})"
)


def extract_video_id(url):
    """
    Extract the 11-character video ID from any common YouTube URL shape.
    """
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
        return url
    match = VIDEO_ID_RE.search(url)
    if not match:
        raise ValueError(f"Could not extract a video ID from URL: {url}")
    return match.group(1)


def get_caption_tracks(session, video_id):
    """
    Fetch the watch page for the API key, then call the innertube player
    endpoint (the "specific YouTube endpoint" that exposes caption tracks).
    """
    watch_response = session.get(WATCH_URL.format(video_id=video_id), timeout=15)
    watch_response.raise_for_status()

    key_match = re.search(r'"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"', watch_response.text)
    if not key_match:
        raise RuntimeError(f"Could not find INNERTUBE_API_KEY for video {video_id}")
    api_key = key_match.group(1)

    player_response = session.post(
        INNERTUBE_URL.format(api_key=api_key),
        json={"context": INNERTUBE_CONTEXT, "videoId": video_id},
        timeout=15,
    )
    player_response.raise_for_status()
    player_data = player_response.json()

    playability = player_data.get("playabilityStatus", {}).get("status")
    if playability != "OK":
        reason = player_data.get("playabilityStatus", {}).get("reason", playability)
        raise RuntimeError(f"Video {video_id} is not playable: {reason}")

    captions = player_data.get("captions", {}).get("playerCaptionsTracklistRenderer", {})
    tracks = captions.get("captionTracks", [])
    if not tracks:
        raise RuntimeError(f"No captions/transcript available for video {video_id}")
    return tracks


def choose_track(tracks, lang=None):
    """
    Prefer a manually created track in the requested language, then an
    auto-generated (asr) track in that language, then fall back to whatever
    is available (manual before generated).
    """
    def is_generated(track):
        return track.get("kind") == "asr"

    if lang:
        for track in tracks:
            if track["languageCode"] == lang and not is_generated(track):
                return track
        for track in tracks:
            if track["languageCode"] == lang and is_generated(track):
                return track
        raise RuntimeError(f"No transcript found for language '{lang}'")

    manual = [t for t in tracks if not is_generated(t)]
    return (manual or tracks)[0]


def fetch_transcript_snippets(session, track):
    url = track["baseUrl"].replace("&fmt=srv3", "")
    response = session.get(url, timeout=15)
    response.raise_for_status()

    root = ET.fromstring(response.text)
    snippets = []
    for elem in root.findall("text"):
        if elem.text is None:
            continue
        text = html.unescape(elem.text)
        text = re.sub(r"<[^>]*>", "", text)
        snippets.append(
            {
                "start": float(elem.attrib["start"]),
                "duration": float(elem.attrib.get("dur", "0.0")),
                "text": text,
            }
        )
    return snippets


def format_transcript(snippets):
    return "\n".join(snippet["text"].replace("\n", " ") for snippet in snippets)


def download_transcript(url, output_file, lang=None):
    video_id = extract_video_id(url)
    session = requests.Session()

    tracks = get_caption_tracks(session, video_id)
    track = choose_track(tracks, lang)
    snippets = fetch_transcript_snippets(session, track)
    text = format_transcript(snippets)

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(text)

    return text


def main():
    parser = argparse.ArgumentParser(
        description="Download YouTube video transcripts to files."
    )
    parser.add_argument("--urls", nargs="+", required=True, help="YouTube video URLs (or IDs)")
    parser.add_argument("--files", nargs="+", required=True, help="Output file for each URL, same order")
    parser.add_argument("--lang", default=None, help="Preferred language code (e.g. en, de). Defaults to first available track.")
    args = parser.parse_args()

    if len(args.urls) != len(args.files):
        parser.error(f"Got {len(args.urls)} urls but {len(args.files)} files; counts must match")

    exit_code = 0
    for url, output_file in zip(args.urls, args.files):
        try:
            download_transcript(url, output_file, lang=args.lang)
            print(f"Transcript for {url} saved to {output_file}")
        except Exception as exc:
            print(f"Failed to download transcript for {url}: {exc}", file=sys.stderr)
            exit_code = 1

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
