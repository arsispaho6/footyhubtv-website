"""fh_standings.py — pure team-name -> flag-code mapping + group-standings builder.

Shared by update_results.py (Sofascore, broadcast PC) and espn_sync.py (ESPN, cloud).
Imports ONLY build_fixtures.TEAM + stdlib, so it runs unchanged on a GitHub Actions
runner (no config_local, no playwright, no network) as well as on the broadcast PC.
"""
from __future__ import annotations

import re
import unicodedata

from build_fixtures import TEAM as TEAMS   # name -> (flag_code, display_name)


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


# build lookup from build_fixtures.TEAMS (full name + display name) + feed aliases
_CODE: dict[str, str] = {}
_DISPLAY: dict[str, str] = {}
for _full, (_code, _disp) in TEAMS.items():
    _CODE[_norm(_full)] = _code
    _CODE[_norm(_disp)] = _code
    _DISPLAY[_code] = _disp

# spellings used by Sofascore AND/OR ESPN that differ from build_fixtures
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
    """Feed standings rows -> {"A":[{code,name,p,w,d,l,gf,ga,gd,pts}], ...} in group order.

    Each row needs: group ("Group A"), team, position, played, wins, draws, losses,
    goals_for, goals_against, points. Non-group sections (e.g. "ranking of 3rd-placed
    teams") are skipped so junk like "Group S" never reaches the site.
    """
    out: dict = {}
    for r in rows:
        grp = (r.get("group") or "").strip()
        m = re.search(r"group\s*([a-l])\b", grp, re.I)
        if not m:
            continue
        key = m.group(1).upper()
        code = code_for(r.get("team", ""))
        if not code:
            print(f"  [warn] no flag code for team {r.get('team','')!r} — skipped")
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
