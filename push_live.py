"""Upload live.json to the FootyHub edge endpoint (Cloudflare Worker), so the public
GitHub Pages site can poll fresh live data (no-cache).

  python push_live.py           # upload once
  python push_live.py --watch   # keep running, upload whenever live.json changes

Reads the endpoint URL + secret from LIA_AI/config_local.py
(FOOTYHUB_LIVE_ENDPOINT, FOOTYHUB_LIVE_SECRET). Run this alongside the engine on
match days so every live.json the engine writes reaches the site within seconds.
"""
from __future__ import annotations

import hashlib
import os
import sys
import time

import requests

sys.path.insert(0, r"c:\Users\arsis\Desktop\LIA_AI")
import config_local as c  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LIVE = os.path.join(HERE, "live.json")


def push() -> bool:
    url = getattr(c, "FOOTYHUB_LIVE_ENDPOINT", "") or ""
    secret = getattr(c, "FOOTYHUB_LIVE_SECRET", "") or ""
    if not url:
        print("FOOTYHUB_LIVE_ENDPOINT not set in config_local.py — deploy the Worker first.")
        return False
    if not os.path.exists(LIVE):
        print(f"live.json not found at {LIVE}")
        return False
    with open(LIVE, "rb") as f:
        body = f.read()
    try:
        r = requests.post(
            url, data=body,
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
            timeout=15,
        )
        print(f"{'OK  ' if r.status_code == 200 else 'FAIL'} {r.status_code} -> {url}")
        return r.status_code == 200
    except Exception as e:
        print(f"push error: {e}")
        return False


def watch(interval: float = 5.0) -> None:
    print(f"watching {LIVE} every {interval:.0f}s — Ctrl+C to stop")
    last = None
    while True:
        try:
            if os.path.exists(LIVE):
                h = hashlib.md5(open(LIVE, "rb").read()).hexdigest()
                if h != last and push():
                    last = h
        except Exception as e:
            print(f"watch error: {e}")
        time.sleep(interval)


if __name__ == "__main__":
    watch() if "--watch" in sys.argv else push()
