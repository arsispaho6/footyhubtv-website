"""update_results.py — push REAL Mundial 2026 standings (+ settle the Predictor) to the site.

Runs on the broadcast PC (residential IP — Sofascore blocks datacenter IPs). Fetches the
World Cup group standings from Sofascore via the same SofascoreClient the engine uses,
maps them to the site's flag codes, and merges them into live.json -> the public site's
group tables fill with real Played / GD / Points. With --settle it also reads each finished
group match and settles the Predictor so the leaderboard earns real points.

  python update_results.py                 # one pass: standings only
  python update_results.py --settle        # one pass: standings + settle finished matches
  python update_results.py --watch         # loop every 10 min (standings + settle)
  python update_results.py --mock          # offline self-test of the mapping/merge (no Sofascore)

Reads FOOTYHUB_LIVE_ENDPOINT / FOOTYHUB_LIVE_SECRET / SOFASCORE_URL from LIA_AI/config_local.py.
Surfshark / any VPN MUST be OFF (proxy IP => Cloudflare 403 => no data).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
import unicodedata

import requests

_HERE = os.path.dirname(os.path.abspath(__file__))
_LIA = r"c:\Users\arsis\Desktop\LIA_AI"
sys.path.insert(0, _LIA)
sys.path.insert(0, _HERE)

import config_local as c                      # noqa: E402
from build_fixtures import TEAM as TEAMS      # name -> (flag_code, display_name)  # noqa: E402

ENDPOINT = (getattr(c, "FOOTYHUB_LIVE_ENDPOINT", "") or "").rstrip("/")
SECRET = getattr(c, "FOOTYHUB_LIVE_SECRET", "") or ""
SOFA_URL = getattr(c, "SOFASCORE_URL", "") or ""
# World Cup 2026 on Sofascore — fixed, so a per-match SOFASCORE_URL (even a friendly) never breaks standings
WC_TID = int(getattr(c, "WC_TOURNAMENT_ID", 0) or 16)
WC_SID = int(getattr(c, "WC_SEASON_ID", 0) or 58210)
WC_NAV = "https://www.sofascore.com/tournament/football/world/world-cup/16"
_HDRS = {
    "Authorization": f"Bearer {SECRET}",
    "Content-Type": "application/json",
    # browser-ish UA so Cloudflare doesn't 1010 the write
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

# ── name -> flag code (handles Sofascore's spellings) ─────────────────────────
def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())

# build lookup from build_fixtures.TEAMS (full name + display name) + Sofascore aliases
_CODE = {}
_DISPLAY = {}
for _full, (_code, _disp) in TEAMS.items():
    _CODE[_norm(_full)] = _code
    _CODE[_norm(_disp)] = _code
    _DISPLAY[_code] = _disp
_ALIASES = {
    "korearepublic": "kr", "southkorea": "kr", "iriran": "ir", "iran": "ir",
    "cotedivoire": "ci", "ivorycoast": "ci", "turkiye": "tr", "turkey": "tr",
    "czechia": "cz", "czechrepublic": "cz", "unitedstates": "us", "usa": "us",
    "bosniaherzegovina": "ba", "bosniaandherzegovina": "ba", "drcongo": "cd",
    "congodr": "cd", "curacao": "cw", "capeverde": "cv", "caboverde": "cv",
    "newzealand": "nz", "saudiarabia": "sa", "southafrica": "za",
}
_CODE.update(_ALIASES)


def code_for(name: str) -> str:
    return _CODE.get(_norm(name), "")


def _gd(gf: int, ga: int) -> str:
    d = int(gf or 0) - int(ga or 0)
    return ("+" + str(d)) if d > 0 else str(d)


def rows_to_standings(rows: list) -> dict:
    """Sofascore standings rows -> {"A":[{code,name,p,w,d,l,gf,ga,gd,pts}], ...} in site order."""
    out: dict = {}
    for r in rows:
        grp = (r.get("group") or "").strip()
        m = re.search(r"group\s*([a-l])\b", grp, re.I)
        if not m:
            continue   # skip non-group sections (e.g. Sofascore's "ranking of 3rd-placed teams")
        key = m.group(1).upper()
        code = code_for(r.get("team", ""))
        if not code:
            print(f"  [warn] no flag code for Sofascore team {r.get('team','')!r} — skipped")
            continue
        gf, ga = int(r.get("goals_for", 0) or 0), int(r.get("goals_against", 0) or 0)
        out.setdefault(key, []).append({
            "code": code, "name": _DISPLAY.get(code, r.get("team", "")),
            "p": int(r.get("played", 0) or 0), "w": int(r.get("wins", 0) or 0),
            "d": int(r.get("draws", 0) or 0), "l": int(r.get("losses", 0) or 0),
            "gf": gf, "ga": ga, "gd": _gd(gf, ga), "pts": int(r.get("points", 0) or 0),
            "pos": int(r.get("position", 99) or 99),
        })
    for key in out:
        out[key].sort(key=lambda x: x.pop("pos"))
    return out


# ── Cloudflare R2 (the site reads live.json from cdn.footyhub.tv = R2, NOT the Worker) ──
_R2_READ = "https://cdn.footyhub.tv/live.json"
_settled = set()   # matchIds already settled this run (dedup across --watch)
_r2_client = None


def _r2():
    global _r2_client
    if _r2_client is not None:
        return _r2_client
    try:
        import boto3
        from botocore.config import Config
        _r2_client = boto3.client(
            "s3",
            endpoint_url=getattr(c, "FOOTYHUB_R2_ENDPOINT", "") or "",
            aws_access_key_id=getattr(c, "FOOTYHUB_R2_ACCESS_KEY", "") or "",
            aws_secret_access_key=getattr(c, "FOOTYHUB_R2_SECRET_KEY", "") or "",
            config=Config(signature_version="s3v4", region_name="auto",
                          connect_timeout=5, read_timeout=8, retries={"max_attempts": 1}),
        )
    except Exception:
        _r2_client = False
    return _r2_client


def _upload_r2(body: str) -> bool:
    bucket = getattr(c, "FOOTYHUB_R2_BUCKET", "") or ""
    cli = _r2()
    if not cli or not bucket:
        return False
    try:
        cli.put_object(Bucket=bucket, Key="live.json", Body=body.encode("utf-8"),
                       ContentType="application/json; charset=utf-8", CacheControl="public, max-age=5")
        return True
    except Exception as e:
        print(f"  R2 upload failed: {e}")
        return False


def push_results(standings: dict, ko: dict | None = None) -> bool:
    if not ENDPOINT:
        print("FOOTYHUB_LIVE_ENDPOINT not set — cannot push.")
        return False
    # GET the live.json the SITE actually reads (R2/cdn), fall back to the Worker — so we
    # merge into the freshest copy and never clobber the engine's match/score fields.
    data = {}
    for src in (_R2_READ, ENDPOINT + "/live.json"):
        try:
            r = requests.get(src, headers={"User-Agent": _HDRS["User-Agent"]}, timeout=15)
            if r.ok:
                data = r.json()
                break
        except Exception:
            pass
    res = data.get("results") or {}
    if standings:
        res["standings"] = standings
    if ko:
        res["ko"] = ko
    res["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    data["results"] = res
    body_str = json.dumps(data, ensure_ascii=False)
    teams = sum(len(v) for v in standings.values())
    ok_w = ok_r2 = False
    try:
        r = requests.post(ENDPOINT + "/", data=body_str.encode("utf-8"), headers=_HDRS, timeout=15)
        ok_w = r.ok
        print(f"  worker push -> {r.status_code}")
    except Exception as e:
        print(f"  worker push failed: {e}")
    ok_r2 = _upload_r2(body_str)
    print(f"  R2 (cdn.footyhub.tv) upload -> {'OK' if ok_r2 else 'FAILED'}  ({len(standings)} groups, {teams} teams)")
    try:
        with open(os.path.join(_HERE, "live.json"), "w", encoding="utf-8") as f:
            f.write(json.dumps(data, indent=2, ensure_ascii=False))
    except Exception:
        pass
    return ok_w or ok_r2


def settle_match(match_id: str, ah: int, aa: int) -> None:
    if not ENDPOINT:
        return
    try:
        r = requests.post(ENDPOINT + "/predict", headers=_HDRS,
                          data=json.dumps({"op": "settle", "matchId": match_id, "ah": ah, "aa": aa}),
                          timeout=15)
        print(f"  settle {match_id} {ah}-{aa} -> {r.status_code} {r.text[:80]}")
    except Exception as e:
        print(f"  settle {match_id} failed: {e}")


# ── fixtures: unordered code-pair -> site matchId (home_code-away_code) ──
def _fixture_index() -> dict:
    idx = {}
    try:
        fx = json.load(open(os.path.join(_HERE, "fixtures.json"), encoding="utf-8"))
        for m in fx.get("matches", []):
            hc, ac = m.get("home_code"), m.get("away_code")
            if hc and ac:
                idx[frozenset((hc, ac))] = (hc, ac)
    except Exception:
        pass
    return idx


def _event_id(url: str) -> int:
    m = re.search(r"#id:(\d+)", url) or re.search(r"[?&]id=(\d+)", url)
    return int(m.group(1)) if m else 0


async def run_once(client, do_settle: bool):
    tid, sid = WC_TID, WC_SID                       # fixed WC tournament/season (never depends on SOFASCORE_URL)
    print(f"World Cup tournament={tid} season={sid}")
    rows = await client.fetch_standings(0, tid, sid)
    standings = rows_to_standings(rows)
    if standings:
        push_results(standings)
    else:
        print("  no standings rows yet.")
    if do_settle:
        await settle_finished(client, tid, sid)


async def settle_finished(client, tid: int, sid: int):
    """Read finished group matches from Sofascore and settle the Predictor (idempotent server-side)."""
    idx = _fixture_index()
    seen = 0
    for page in range(0, 8):
        data = await client._api_fetch(
            f"https://api.sofascore.com/api/v1/unique-tournament/{tid}/season/{sid}/events/last/{page}")
        events = (data or {}).get("events", []) if isinstance(data, dict) else []
        if not events:
            break
        for e in events:
            if (e.get("status", {}) or {}).get("type") != "finished":
                continue
            hc = code_for((e.get("homeTeam", {}) or {}).get("name", ""))
            ac = code_for((e.get("awayTeam", {}) or {}).get("name", ""))
            if not hc or not ac:
                continue
            hs = int((e.get("homeScore", {}) or {}).get("current", 0) or 0)
            as_ = int((e.get("awayScore", {}) or {}).get("current", 0) or 0)
            fx = idx.get(frozenset((hc, ac)))
            if not fx:
                continue
            fh, fa = fx                                   # fixture orientation
            ah, aa = (hs, as_) if fh == hc else (as_, hs)  # map to fixture home/away
            mid = fh + "-" + fa
            if mid in _settled:
                continue
            settle_match(mid, ah, aa)
            _settled.add(mid); seen += 1
    print(f"  settle pass complete ({seen} finished matches).")


async def amain(args):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        # headed (residential IP + real browser => no 403), but pushed off-screen so it
        # never steals focus / appears over OBS during a live broadcast
        browser = await p.chromium.launch(
            headless=False, args=["--window-position=12000,12000", "--window-size=900,700"])
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="en-US",
        )
        page = await ctx.new_page()
        await page.goto(WC_NAV, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(4000)
        from sofascore_data import SofascoreClient
        client = SofascoreClient(page)
        while True:
            try:
                await run_once(client, args.settle or args.watch)
            except Exception as e:
                print(f"[update_results] pass error: {e}")
            if not args.watch:
                break
            await page.wait_for_timeout(int(args.interval * 1000))
        await browser.close()


def _mock():
    """Offline self-test: fake Sofascore rows -> standings -> (no push, just print)."""
    rows = [
        {"group": "Group A", "team": "Mexico", "position": 1, "played": 2, "wins": 2, "draws": 0, "losses": 0, "goals_for": 4, "goals_against": 1, "points": 6},
        {"group": "Group A", "team": "South Africa", "position": 2, "played": 2, "wins": 1, "draws": 0, "losses": 1, "goals_for": 2, "goals_against": 2, "points": 3},
        {"group": "Group A", "team": "Korea Republic", "position": 3, "played": 2, "wins": 1, "draws": 0, "losses": 1, "goals_for": 2, "goals_against": 3, "points": 3},
        {"group": "Group A", "team": "Czechia", "position": 4, "played": 2, "wins": 0, "draws": 0, "losses": 2, "goals_for": 1, "goals_against": 3, "points": 0},
        {"group": "Group E", "team": "Côte d'Ivoire", "position": 1, "played": 1, "wins": 1, "draws": 0, "losses": 0, "goals_for": 1, "goals_against": 0, "points": 3},
    ]
    st = rows_to_standings(rows)
    print(json.dumps(st, indent=2, ensure_ascii=False))
    assert st["A"][0]["code"] == "mx" and st["A"][0]["pts"] == 6
    assert st["A"][2]["code"] == "kr"          # "Korea Republic" -> kr
    assert st["E"][0]["code"] == "ci"          # "Côte d'Ivoire" -> ci
    assert st["A"][0]["gd"] == "+3"
    print("MOCK OK — mapping + standings build verified.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--watch", action="store_true", help="loop forever")
    ap.add_argument("--settle", action="store_true", help="also settle finished matches")
    ap.add_argument("--interval", type=float, default=600.0, help="--watch seconds (default 600)")
    ap.add_argument("--mock", action="store_true", help="offline self-test")
    a = ap.parse_args()
    if a.mock:
        _mock()
    else:
        asyncio.run(amain(a))
