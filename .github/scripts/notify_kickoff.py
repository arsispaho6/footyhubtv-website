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
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + SECRET},
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
        title = f"\U0001F534 LIVE now — {home} v {away}"
        body = "LIA & Victor are calling it live. Tap to watch on YouTube."
    elif kind == "reminder":
        title = f"⏰ Kicks off in ~15 min — {home} v {away}"
        body = "FootyHub TV goes live shortly. LIA & Victor on the call."
    else:
        title = "\U0001F7E3 FootyHub TV — notifications are live"
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


def main():
    if not SECRET:
        print("No secret — nothing to do.")
        return
    if TEST:
        print("TEST mode: sending one test notification…")
        send("test", "FootyHub", "Test")
        return

    fixtures = json.loads((ROOT / "fixtures.json").read_text())
    matches = fixtures.get("matches", fixtures if isinstance(fixtures, list) else [])
    now = datetime.datetime.now(datetime.timezone.utc)
    sent = load_state()
    fired = 0
    for m in matches:
        utc = m.get("utc")
        if not utc:
            continue
        try:
            ko = datetime.datetime.fromisoformat(utc.replace("Z", "+00:00"))
        except Exception:
            continue
        mins_until = (ko - now).total_seconds() / 60.0
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
