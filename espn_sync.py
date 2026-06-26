"""espn_sync.py — CLOUD, PC-OFF auto-updater for FootyHub TV.

Designed to run in GitHub Actions on a cron (every ~15 min). Pulls World Cup 2026
group standings and finished-match results from ESPN's PUBLIC API — which, unlike
Sofascore, is NOT IP-blocked from datacenters and needs NO key — maps them to the
site's flag codes, and writes them to the SAME edge-cached store the public site
reads (Cloudflare R2 / cdn.footyhub.tv) plus the Worker. Result: the group tables
fill and the Predictor settles 24/7, even when the broadcast PC is OFF.

  python3 espn_sync.py            # one pass: standings + settle finished matches
  python3 espn_sync.py --no-settle
  python3 espn_sync.py --mock     # offline self-test of the ESPN->standings mapping

Credentials: env first (GitHub secrets), then LIA_AI/config_local.py for local testing.
  FOOTYHUB_LIVE_SECRET  (Bearer secret for the Worker POST)         [required to write]
  ENDPOINT              (Worker URL; default footyhub-live.workers.dev)
  R2_ENDPOINT / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET           [to write the cdn the site reads]
Pure standard library except boto3 (only needed for the R2 write).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import sys
import time
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

from fh_standings import code_for, rows_to_standings, _DISPLAY   # noqa: E402

# ── config: env (GitHub) first, then config_local.py (local testing) ──────────
_c = None
try:
    sys.path.insert(0, r"c:\Users\arsis\Desktop\LIA_AI")
    import config_local as _c   # noqa: E402  (absent on the GitHub runner — that's fine)
except Exception:
    _c = None


def _cfg(env_key: str, cfg_attr: str, default: str = "") -> str:
    v = os.environ.get(env_key)
    if v:
        return v
    if _c is not None:
        return (getattr(_c, cfg_attr, "") or default)
    return default


SECRET = _cfg("FOOTYHUB_LIVE_SECRET", "FOOTYHUB_LIVE_SECRET")
ENDPOINT = (_cfg("ENDPOINT", "FOOTYHUB_LIVE_ENDPOINT",
                 "https://footyhub-live.footyhubtv.workers.dev")).rstrip("/")
R2_ENDPOINT = _cfg("R2_ENDPOINT", "FOOTYHUB_R2_ENDPOINT")
R2_KEY = _cfg("R2_ACCESS_KEY", "FOOTYHUB_R2_ACCESS_KEY")
R2_SECRET = _cfg("R2_SECRET_KEY", "FOOTYHUB_R2_SECRET_KEY")
R2_BUCKET = _cfg("R2_BUCKET", "FOOTYHUB_R2_BUCKET")

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
_R2_READ = "https://cdn.footyhub.tv/live.json"
ESPN_STAND = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings"
ESPN_BOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"


# ── HTTP helpers (stdlib only) ────────────────────────────────────────────────
def _get_json(url: str, timeout: int = 20):
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _post(url: str, body: str, bearer: bool = True, timeout: int = 20):
    hdrs = {"Content-Type": "application/json", "User-Agent": _UA}
    if bearer:
        hdrs["Authorization"] = f"Bearer {SECRET}"
    req = urllib.request.Request(url, data=body.encode("utf-8"), headers=hdrs, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")[:120]


# ── ESPN standings -> site standings ──────────────────────────────────────────
def _stat(entry: dict, name: str, default=0):
    for s in entry.get("stats", []) or []:
        if s.get("name") == name:
            v = s.get("value")
            return default if v is None else v
    return default


def espn_standings() -> dict:
    d = _get_json(ESPN_STAND)
    rows = []
    for g in d.get("children", []) or []:
        gname = g.get("name") or ""                      # "Group A"
        for e in ((g.get("standings", {}) or {}).get("entries", []) or []):
            t = e.get("team", {}) or {}
            rows.append({
                "group": gname,
                "team": t.get("displayName") or t.get("name") or "",
                "position": int(_stat(e, "rank", 99)),
                "played": int(_stat(e, "gamesPlayed", 0)),
                "wins": int(_stat(e, "wins", 0)),
                "draws": int(_stat(e, "ties", 0)),
                "losses": int(_stat(e, "losses", 0)),
                "goals_for": int(_stat(e, "pointsFor", 0)),
                "goals_against": int(_stat(e, "pointsAgainst", 0)),
                "points": int(_stat(e, "points", 0)),
            })
    return rows_to_standings(rows)


# ── ESPN scoreboard -> finished matches (home_code, away_code, hs, as) ─────────
def espn_finished(days_back: int = 16) -> list:
    """Walk recent days of the ESPN scoreboard, collect COMPLETED matches."""
    out, seen = [], set()
    today = _dt.datetime.now(_dt.timezone.utc).date()
    urls = [ESPN_BOARD] + [
        f"{ESPN_BOARD}?dates={(today - _dt.timedelta(days=i)).strftime('%Y%m%d')}"
        for i in range(0, days_back + 1)
    ]
    for url in urls:
        try:
            d = _get_json(url, timeout=15)
        except Exception:
            continue
        for ev in d.get("events", []) or []:
            comp = (ev.get("competitions") or [{}])[0]
            st = ((comp.get("status") or ev.get("status") or {}).get("type") or {})
            if not (st.get("completed") or st.get("state") == "post"):
                continue
            home = away = None
            for c in comp.get("competitors", []) or []:
                code = code_for((c.get("team", {}) or {}).get("displayName")
                                or (c.get("team", {}) or {}).get("name") or "")
                try:
                    score = int(c.get("score"))
                except (TypeError, ValueError):
                    score = 0
                if c.get("homeAway") == "home":
                    home = (code, score)
                elif c.get("homeAway") == "away":
                    away = (code, score)
            if not home or not away or not home[0] or not away[0]:
                continue
            key = frozenset((home[0], away[0]))
            if key in seen:
                continue
            seen.add(key)
            out.append((home[0], home[1], away[0], away[1]))
    return out


# ── fixtures: unordered code-pair -> site matchId (home_code-away_code) ────────
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


def _scores_map(finished: list) -> dict:
    """ESPN finished list -> {matchId (home_code-away_code): {h, a}} in fixture orientation."""
    idx = _fixture_index()
    out = {}
    for hc, hs, ac, as_ in finished:
        fx = idx.get(frozenset((hc, ac)))
        if not fx:
            continue
        fh, fa = fx
        ah, aa = (hs, as_) if fh == hc else (as_, hs)
        out[fh + "-" + fa] = {"h": ah, "a": aa}
    return out


# ── R2 (the cdn the public site actually reads) ───────────────────────────────
def _upload_r2(body: str) -> bool:
    if not (R2_ENDPOINT and R2_KEY and R2_SECRET and R2_BUCKET):
        return False
    try:
        import boto3
        from botocore.config import Config
        cli = boto3.client(
            "s3", endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_KEY, aws_secret_access_key=R2_SECRET,
            config=Config(signature_version="s3v4", region_name="auto",
                          connect_timeout=5, read_timeout=10, retries={"max_attempts": 2}))
        cli.put_object(Bucket=R2_BUCKET, Key="live.json", Body=body.encode("utf-8"),
                       ContentType="application/json; charset=utf-8",
                       CacheControl="public, max-age=5")
        return True
    except Exception as e:
        print(f"  R2 upload failed: {e}")
        return False


def _read_live() -> dict:
    """Read the freshest live.json (cdn first, then Worker) so we merge, never clobber."""
    for src in (_R2_READ, ENDPOINT + "/live.json"):
        try:
            req = urllib.request.Request(src, headers={"User-Agent": _UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            continue
    return {}


def push_results(standings: dict, scores: dict | None = None, ko: dict | None = None) -> bool:
    if not SECRET:
        print("FOOTYHUB_LIVE_SECRET not set — cannot write (read-only run).")
        return False
    data = _read_live()
    res = data.get("results") or {}
    if standings:
        res["standings"] = standings
    if scores:
        res.setdefault("scores", {}).update(scores)   # accumulate per-match finals (matchId -> {h,a})
    if ko:
        res["ko"] = ko   # resolved knockout bracket
    res["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    res["source"] = "espn"
    data["results"] = res
    body = json.dumps(data, ensure_ascii=False)
    teams = sum(len(v) for v in standings.values())
    ok_w = ok_r2 = False
    try:
        code, txt = _post(ENDPOINT + "/", body)
        ok_w = 200 <= code < 300
        print(f"  worker push -> {code}")
    except Exception as e:
        print(f"  worker push failed: {e}")
    ok_r2 = _upload_r2(body)
    print(f"  R2 (cdn.footyhub.tv) upload -> {'OK' if ok_r2 else 'skipped/failed'}"
          f"  ({len(standings)} groups, {teams} teams)")
    return ok_w or ok_r2


def settle(finished: list) -> None:
    if not SECRET or not finished:
        return
    idx = _fixture_index()
    n = 0
    for hc, hs, ac, as_ in finished:
        fx = idx.get(frozenset((hc, ac)))
        if not fx:
            continue
        fh, fa = fx                                    # fixture orientation
        ah, aa = (hs, as_) if fh == hc else (as_, hs)  # map to fixture home/away
        mid = fh + "-" + fa
        try:
            code, txt = _post(ENDPOINT + "/predict",
                              json.dumps({"op": "settle", "matchId": mid, "ah": ah, "aa": aa}))
            print(f"  settle {mid} {ah}-{aa} -> {code}")
            n += 1
        except Exception as e:
            print(f"  settle {mid} failed: {e}")
        # recap: push each predictor their result + rank (worker fires ONCE per match, dedups re-runs)
        try:
            rc, _ = _post(ENDPOINT + "/predict/recap",
                          json.dumps({"matchId": mid, "home": _DISPLAY.get(fh, fh), "away": _DISPLAY.get(fa, fa)}))
            if rc and rc != 200:
                print(f"  recap {mid} -> {rc}")
        except Exception:
            pass
    print(f"  settle pass complete ({n} finished matches).")


def schedule_kickoffs() -> None:
    """Arm the worker's server-side kickoff lock by populating kick: from fixtures.json.

    The worker already has the guard `if (kick && Date.now() >= kick) return 409` in the
    predict path, but it stays dormant until kick: is set. Populating it from the cloud each
    run makes the lock authoritative and independent of the broadcast PC/script being alive.
    """
    if not SECRET:
        return
    try:
        fx = json.load(open(os.path.join(_HERE, "fixtures.json"), encoding="utf-8"))
    except Exception as e:
        print(f"  schedule: fixtures.json unreadable: {e}")
        return
    kmap = {}
    for m in fx.get("matches", []) or []:
        hc, ac, utc = m.get("home_code"), m.get("away_code"), m.get("utc")
        if not (hc and ac and utc):
            continue
        try:
            ts = _dt.datetime.fromisoformat(str(utc).replace("Z", "+00:00"))
            kmap[f"{hc}-{ac}"] = int(ts.timestamp() * 1000)
        except Exception:
            continue
    if not kmap:
        return
    try:
        code, txt = _post(ENDPOINT + "/predict", json.dumps({"op": "schedule", "map": kmap}))
        print(f"  schedule kickoffs -> {code} ({len(kmap)} matches armed)")
    except Exception as e:
        print(f"  schedule failed: {e}")


_KO_FIX = None
_GL = "ABCDEFGHIJKL"


def _ko_fixtures() -> list:
    global _KO_FIX
    if _KO_FIX is None:
        try:
            fx = json.load(open(os.path.join(_HERE, "fixtures.json"), encoding="utf-8"))
            _KO_FIX = sorted([m for m in fx.get("matches", []) if m.get("stage") == "ko"],
                             key=lambda m: m.get("match_no", 0))
        except Exception:
            _KO_FIX = []
    return _KO_FIX


def _gd_int(r) -> int:
    try:
        return int(str(r.get("gd", "0")).replace("+", ""))
    except Exception:
        return 0


def compute_ko(standings: dict, finished: list) -> dict:
    """Resolve the knockout bracket from FINAL group standings + finished-match scores.

    Returns results.ko = { "<match_no>": {home:{code,name,score?}, away:{...}, winner?} }.
    Empty {} until the group stage is complete (all 12 groups, all teams played 3) — the
    front-end keeps showing placeholder slots until then. Winner/Runner-up + advancement +
    scores are exact; the 8 best-3rd slots use a valid constrained assignment (FIFA's exact
    table may differ, but each team lands in a slot its group is eligible for).
    """
    ko_fix = _ko_fixtures()
    if not ko_fix:
        return {}
    grp = {}
    for L in _GL:
        rows = standings.get(L) or []
        if len(rows) >= 4 and all((r.get("p", 0) or 0) >= 3 for r in rows[:4]):
            grp[L] = rows
    if len(grp) < 12:
        return {}
    thirds = sorted(((L, grp[L][2]) for L in _GL),
                    key=lambda x: (-(x[1].get("pts", 0) or 0), -_gd_int(x[1]), -(x[1].get("gf", 0) or 0)))
    best8 = set(L for L, _ in thirds[:8])
    # constrained bijection: each "3rd X/Y/.." slot -> one qualified third whose group is allowed
    slots = []
    for f in ko_fix:
        for side in ("home", "away"):
            m = re.match(r"3rd\s+([A-L/]+)", str(f.get(side) or ""))
            if m:
                allowed = set(g for g in m.group(1).split("/") if g in _GL) & best8
                slots.append((f.get("match_no"), side, allowed))
    assign, used = {}, set()

    def _bt(i):
        if i >= len(slots):
            return len(used) == len(best8)
        mn, side, allowed = slots[i]
        for g in sorted(allowed):
            if g not in used:
                used.add(g); assign[(mn, side)] = g
                if _bt(i + 1):
                    return True
                used.discard(g); assign.pop((mn, side), None)
        return False
    _bt(0)
    fin = {}
    for hc, hs, ac, as_ in finished:
        fin[(hc, ac)] = (hs, as_)

    def score_for(hc, ac):
        if (hc, ac) in fin:
            return fin[(hc, ac)]
        if (ac, hc) in fin:
            r = fin[(ac, hc)]
            return (r[1], r[0])
        return None

    def team(code):
        return {"code": code, "name": _DISPLAY.get(code, str(code or "").upper())}

    out = {}

    def resolve(label, mn, side):
        lab = str(label or "")
        m = re.match(r"Winner ([A-L])$", lab)
        if m:
            return grp[m.group(1)][0]["code"]
        m = re.match(r"Runner-up ([A-L])$", lab)
        if m:
            return grp[m.group(1)][1]["code"]
        if lab.startswith("3rd"):
            g = assign.get((mn, side))
            return grp[g][2]["code"] if g else None
        m = re.match(r"Winner (\d+)$", lab)
        if m:
            return (out.get(m.group(1)) or {}).get("winner")
        m = re.match(r"Loser (\d+)$", lab)
        if m:
            e = out.get(m.group(1)) or {}
            if e.get("winner") and e.get("home") and e.get("away"):
                return e["away"]["code"] if e["winner"] == e["home"]["code"] else e["home"]["code"]
            return None
        return None

    for f in ko_fix:                                    # sorted by match_no -> Winner-N resolves after N
        mn = str(f.get("match_no"))
        hc = resolve(f.get("home"), f.get("match_no"), "home")
        ac = resolve(f.get("away"), f.get("match_no"), "away")
        e = {}
        if hc:
            e["home"] = team(hc)
        if ac:
            e["away"] = team(ac)
        if hc and ac:
            sc = score_for(hc, ac)
            if sc:
                e["home"]["score"], e["away"]["score"] = sc[0], sc[1]
                if sc[0] != sc[1]:
                    e["winner"] = hc if sc[0] > sc[1] else ac
        out[mn] = e
    return out


def run_once(do_settle: bool = True):
    print(f"ESPN sync @ {time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime())}")
    standings = espn_standings()
    fin = espn_finished()
    scores = _scores_map(fin)
    if standings or scores:
        teams = sum(len(v) for v in standings.values())
        print(f"  ESPN standings: {len(standings)} groups, {teams} teams | scores: {len(scores)} finished")
        ko = compute_ko(standings, fin)
        if ko:
            print(f"  knockout bracket resolved: {len(ko)} matches")
        push_results(standings, scores, ko or None)
    else:
        print("  no standings from ESPN yet.")
    schedule_kickoffs()        # arm the predictor kickoff-lock (cloud-side, PC-independent)
    if do_settle:
        print(f"  ESPN finished matches found: {len(fin)}")
        settle(fin)


def _mock():
    """Offline self-test: ESPN-shaped entries -> standings (no network/push)."""
    sample = {"children": [{"name": "Group A", "standings": {"entries": [
        {"team": {"displayName": "Mexico"}, "stats": [
            {"name": "rank", "value": 1}, {"name": "gamesPlayed", "value": 2},
            {"name": "wins", "value": 2}, {"name": "ties", "value": 0},
            {"name": "losses", "value": 0}, {"name": "pointsFor", "value": 3},
            {"name": "pointsAgainst", "value": 0}, {"name": "points", "value": 6}]},
        {"team": {"displayName": "South Korea"}, "stats": [
            {"name": "rank", "value": 2}, {"name": "gamesPlayed", "value": 2},
            {"name": "points", "value": 3}, {"name": "pointsFor", "value": 2},
            {"name": "pointsAgainst", "value": 3}]},
    ]}}]}
    rows = []
    for g in sample["children"]:
        for e in g["standings"]["entries"]:
            rows.append({
                "group": g["name"], "team": e["team"]["displayName"],
                "position": int(_stat(e, "rank", 99)), "played": int(_stat(e, "gamesPlayed")),
                "wins": int(_stat(e, "wins")), "draws": int(_stat(e, "ties")),
                "losses": int(_stat(e, "losses")), "goals_for": int(_stat(e, "pointsFor")),
                "goals_against": int(_stat(e, "pointsAgainst")), "points": int(_stat(e, "points")),
            })
    st = rows_to_standings(rows)
    print(json.dumps(st, indent=2, ensure_ascii=False))
    assert st["A"][0]["code"] == "mx" and st["A"][0]["pts"] == 6
    assert st["A"][1]["code"] == "kr"
    assert st["A"][0]["gd"] == "+3"
    print("MOCK OK — ESPN mapping verified.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true", help="offline self-test (no network)")
    ap.add_argument("--no-settle", action="store_true", help="standings only")
    a = ap.parse_args()
    if a.mock:
        _mock()
    else:
        run_once(do_settle=not a.no_settle)
