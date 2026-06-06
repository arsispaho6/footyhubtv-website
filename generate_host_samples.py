"""Generate the 'Hear LIA' / 'Hear Victor' voice samples for the website.

Uses the REAL ElevenLabs voices from the LIA_AI engine (config_local), so the
samples sound exactly like the on-air hosts. Writes audio/lia.mp3 + audio/victor.mp3.

Edit SAMPLES below to change what they say, then:  python generate_host_samples.py
"""
from __future__ import annotations

import os
import sys

import requests

sys.path.insert(0, r"c:\Users\arsis\Desktop\LIA_AI")
import config_local as c  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio")

# filename -> (voice_id, line). Keep lines GENERIC (no match-specific facts → Rule #1).
# NOTE: "Leah" is the phonetic spelling of LIA (Lía) so the TTS says "LEE-ah", not "LY-ah".
# The on-screen text stays "LIA"; only the audio uses the phonetic form.
SAMPLES = {
    "lia.mp3":    (c.VOICE_LIA,    "Leah on the call — every goal, every emotion, live."),
    "victor.mp3": (c.VOICE_VICTOR, "I'm Victor, analyst and tipster. The numbers don't lie."),
}

VOICE_SETTINGS = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": True}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for fname, (voice_id, text) in SAMPLES.items():
        resp = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": c.ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": VOICE_SETTINGS},
            timeout=90,
        )
        if resp.status_code == 200:
            with open(os.path.join(OUT, fname), "wb") as f:
                f.write(resp.content)
            print(f"OK  {fname}  {len(resp.content)} bytes")
        else:
            print(f"FAIL {fname}  {resp.status_code}  {resp.text[:200]}")


if __name__ == "__main__":
    main()
