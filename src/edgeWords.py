"""Free Edge voice with word timings.

Writes the MP3 and a JSON list of the spoken words with their start in seconds:
    [{"text": "আমি", "start": 0.1125}, ...]

The edge-tts command (and its --write-subtitles) only gives sentence timings since edge-tts 7.2, so this
uses the library directly with word boundaries. Called by src/voice.js:
    python3 -I src/edgeWords.py --voice V --rate=+0% --file text.txt --media out.mp3 --words out.json
"""
import argparse
import asyncio
import json

import edge_tts

TICKS_PER_SECOND = 10_000_000  # edge-tts reports offsets in 100 ns ticks


def communicate(text, voice, rate):
    try:
        return edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    except TypeError:
        # edge-tts 7.0/7.1 have no `boundary` argument and send word boundaries by default.
        return edge_tts.Communicate(text, voice, rate=rate)


async def synth(text, voice, rate, media):
    words = []
    with open(media, "wb") as out:
        async for chunk in communicate(text, voice, rate).stream():
            if chunk["type"] == "audio":
                out.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"text": chunk["text"], "start": chunk["offset"] / TICKS_PER_SECOND})
    return words


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--voice", required=True)
    p.add_argument("--rate", default="+0%")
    p.add_argument("--file", required=True)
    p.add_argument("--media", required=True)
    p.add_argument("--words", required=True)
    a = p.parse_args()
    with open(a.file, encoding="utf-8") as f:
        text = f.read()
    # The service now and then sends no audio for a request that works on the next try.
    for attempt in range(3):
        try:
            words = asyncio.run(synth(text, a.voice, a.rate, a.media))
            break
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == 2:
                raise
    with open(a.words, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
