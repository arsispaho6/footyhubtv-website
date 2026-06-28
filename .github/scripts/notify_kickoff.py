#!/usr/bin/env python3
"""Fire push + email notifications around each Mundial 2026 kickoff via the FootyHub
edge Worker. Run by .github/workflows/notify-kickoff.yml every 5 min. Stdlib only.

Beats per match: T-15min reminder, T-0 "live now". A committed state file makes each
beat fire exactly once. Set TEST=true to send a single test notification instead.
"""
import json, os, sys, urllib.request, urllib.error, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
ENDPOINT = os.environ.get("ENDPOINT", "https://footyhub-live.footyhubtv.workers.dev").rstrip("/")
SECRET = os.environ.get("FOOTYHUB_LIVE_SECRET", "")
TEST = os.environ.get("TEST", "").lower() == "true"
STATE = ROOT / ".notify_state.json"

REMINDER_LO, REMINDER_HI = 10, 20      # minutes-before-kickoff window for the reminder
LIVE_LO, LIVE_HI = -6, 1               # minutes-relative-to-kickoff window for "live now"


def _post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        ENDPOINT + path, data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + SECRET,
            # browser-like UA + Accept so Cloudflare Bot Fight Mode doesn't 403 (error 1010) the runner
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode("utf-8", "replace")[:300]
            print(f"  {path} -> {r.status} {body}")
            return r.status < 400
    except urllib.error.HTTPError as e:
        print(f"  {path} -> HTTP {e.code} {e.read().decode('utf-8','replace')[:300]}")
    except Exception as e:
        print(f"  {path} -> ERROR {e}")
    return False


def send(kind, home, away):
    """kind: 'reminder' | 'live' | 'test'."""
    if kind == "live":
        title = f"LIVE now: {home} v {away}"
        body = "LIA and Victor are calling it live. Tap to watch on YouTube."
    elif kind == "reminder":
        title = f"Kicks off in 15 minutes: {home} v {away}"
        body = "FootyHub TV goes live shortly. LIA and Victor on the call."
    else:
        title = "FootyHub TV - notifications are live"
        body = "This is a test. You'll get a ping like this before every kickoff."
    url = "https://footyhub.tv/"
    # NOTE: contract inferred from the Worker's other secret-gated endpoints
    # (Authorization: Bearer <secret>). If the first manual test logs a 4xx,
    # adjust the field names below to match the deployed Worker once.
    ok_push = _post("/push/send", {"title": title, "body": body, "url": url, "tag": "kickoff"})
    ok_mail = _post("/notify/send", {
        "subject": title, "title": title, "body": body, "url": url,
        "match": f"{home} v {away}",
    })
    return ok_push or ok_mail


def load_state():
    try:
        return set(json.loads(STATE.read_text()).get("sent", []))
    except Exception:
        return set()


def save_state(sent):
    STATE.write_text(json.dumps({"sent": sorted(sent)}, indent=0))


def load_ko_map():
    """Live resolved knockout bracket -> {str(match_no): (home_name, away_name)}.
    Only DECIDED matches are returned, so we never notify a placeholder slot
    like "Runner-up A v Runner-up B" — the teams must be real first."""
    out = {}
    for url in ("https://cdn.footyhub.tv/live.json", ENDPOINT + "/"):
        try:
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (compatible; FootyHubNotifier/1.0)",  # Cloudflare 403s the default Python-urllib UA
            })
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read().decode("utf-8"))
            ko = ((data.get("results") or {}).get("ko")) or {}
            for no, v in ko.items():
                h = (v or {}).get("home") or {}
                a = (v or {}).get("away") or {}
                if h.get("name") and a.get("name"):
                    out[str(no)] = (h["name"], a["name"])
            if out:
                return out
        except Exception:
            continue
    return out


def main():
    if not SECRET:
        print("No secret - nothing to do.")
        return
    if TEST:
        print("TEST mode: sending one test notification...")
        send("test", "FootyHub", "Test")
        return

    fixtures = json.loads((ROOT / "fixtures.json").read_text())
    matches = fixtures.get("matches", fixtures if isinstance(fixtures, list) else [])
    ko_map = load_ko_map()   # real teams for knockout matches (decided rounds only)
    now = datetime.datetime.now(datetime.timezone.utc)
    sent = load_state()
    fired = 0
    for m in matches:
        utc = m.get("utc")
        if not utc:
            continue
        try:
            kt = datetime.datetime.fromisoformat(utc.replace("Z", "+00:00"))
        except Exception:
            continue
        mins_until = (kt - now).total_seconds() / 60.0
        if m.get("stage") == "ko":
            decided = ko_map.get(str(m.get("match_no")))
            if not decided:
                continue   # teams not decided yet — never send a placeholder slot
            home, away = decided
        else:
            home, away = m.get("home", "?"), m.get("away", "?")
        for kind, lo, hi in (("reminder", REMINDER_LO, REMINDER_HI), ("live", LIVE_LO, LIVE_HI)):
            key = f"{utc}|{kind}"
            if key in sent:
                continue
            if lo <= mins_until <= hi:
                print(f"[{kind}] {home} v {away} (kickoff {utc}, {mins_until:.1f} min away)")
                if send(kind, home, away):
                    sent.add(key)
                    fired += 1
    if fired:
        save_state(sent)
    print(f"Done. {fired} notification beat(s) fired.")


if __name__ == "__main__":
    main()
