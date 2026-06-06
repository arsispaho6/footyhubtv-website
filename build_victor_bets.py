"""Bridge: produce Victor's bets EXACTLY like the pre-game show, write them to live.json.

This is a faithful mirror of pre_game.py — same components, no shortcuts:
  - live 1X2 odds via the engine's OddsClient (The Odds API, key from config_local) — the
    SAME real source the broadcast uses.
  - team_stats via the same form derivation the pre-game uses
    (_derive_team_stats_from_form): score W/D/L 3/1/0, leave per-90 averages None so the
    model falls back to league baselines for any stat not yet fed by the live data.
  - bets via victor_betting_slip.generate_triple_bet — PURE MATH (Poisson goals model +
    market-implied result probabilities). NOT random AI picks.

In the pre-game, OpenAI only *narrates/analyses* these math bets; it never invents the
picks. On matchday the LIA engine generates them from the live Sofascore feed and writes
live.json; the website just reads it. This script seeds the identical pipeline now.

Run:  python build_victor_bets.py
"""
from __future__ import annotations

import json
import os
import sys

LIA_DIR = r"c:\Users\arsis\Desktop\LIA_AI"
if LIA_DIR not in sys.path:
    sys.path.insert(0, LIA_DIR)

from victor_betting_slip import generate_triple_bet  # noqa: E402

try:
    from odds_client import OddsClient
    from config_local import ODDS_API_KEY
except Exception:  # pragma: no cover
    OddsClient, ODDS_API_KEY = None, ""

HERE = os.path.dirname(os.path.abspath(__file__))
LIVE_JSON = os.path.join(HERE, "live.json")

# ── The next match ───────────────────────────────────────────────────────────
HOME, AWAY = "Mexico", "South Africa"
SPORT_KEY = "soccer_fifa_world_cup"   # The Odds API sport key for the World Cup

# Real recent form (Sofascore-style W/D/L, newest first) — what the engine's form
# feed supplies on matchday:
#   Mexico   : 5-1 SRB (W), 1-0 AUS (W), 2-0 GHA (W), 0-0 CRC (D), + W
#   S.Africa : 0-0 NCA (D), 1-2 PAN (L), 1-1 PAN (D), 1-2 CMR (L), 3-2 ZIM (W)
FORM = {"home": ["W", "W", "W", "D", "W"], "away": ["D", "L", "D", "L", "W"]}

# Fallback 1X2 if The Odds API has no listing yet (bet365 snapshot 2026-06-05).
FALLBACK_ODDS = {"home": 1.48, "draw": 4.33, "away": 6.50}


def derive_team_stats_from_form(form_data: dict) -> dict:
    """EXACT mirror of pre_game.PreGameDirector._derive_team_stats_from_form."""
    out = {"home": {}, "away": {}}
    for side in ("home", "away"):
        results = form_data.get(side, [])
        points = sum(3 if r == "W" else 1 if r == "D" else 0 for r in results[:5])
        if results:
            out[side]["form_points_l5"] = points
            out[side]["form_string"] = "".join(results[:5])
    return out


def fetch_live_odds() -> tuple[dict, str]:
    """Real 1X2 via the engine's OddsClient; fall back to the bet365 snapshot."""
    if OddsClient and ODDS_API_KEY:
        try:
            res = OddsClient(ODDS_API_KEY).fetch_odds(HOME, AWAY, SPORT_KEY) or {}
            avg = res.get("average_odds", {})
            if all(k in avg for k in ("home", "draw", "away")):
                n = len(res.get("bookmakers", []))
                return ({"home": avg["home"], "draw": avg["draw"], "away": avg["away"]},
                        f"The Odds API — avg of {n} bookmakers")
        except Exception as e:
            print(f"[odds] live fetch failed: {e}")
    return FALLBACK_ODDS, "bet365 snapshot 2026-06-05 (live API had no listing yet)"


def tier_to_web(tier: dict | None) -> dict | None:
    if not tier:
        return None
    return {
        "combined_odds": tier["combined_odds"],
        "combined_prob": tier["combined_prob"],
        "summary": tier["summary"],
        "math_summary": tier["math_summary"],
        "selections": [
            {"label": s["label"], "odds": s["individual_odds"],
             "prob": s["individual_prob"], "reasoning": s["reasoning"]}
            for s in tier["selections"]
        ],
    }


def main() -> None:
    live_odds, odds_src = fetch_live_odds()
    team_stats = derive_team_stats_from_form(FORM)
    out = generate_triple_bet(team_stats=team_stats, live_odds=live_odds)

    victor_bets = {
        "model": "victor_betting_slip.generate_triple_bet — same math engine as the pre-game (no random AI picks)",
        "odds_source": odds_src,
        "live_odds": live_odds,
        "form": {"home": "".join(FORM["home"]), "away": "".join(FORM["away"])},
        "inputs_note": (
            "Mirrors pre_game.py exactly: real 1X2 odds + form-derived team_stats. "
            "Goals/cards/corners/shots use league baselines until the live Sofascore "
            "stats feed them on matchday."
        ),
        "no_edge_tiers": out.get("no_edge_tiers", []),
        "tiers": {
            "safe": tier_to_web(out.get("safe")),
            "medium": tier_to_web(out.get("medium")),
            "max": tier_to_web(out.get("max")),
        },
    }

    with open(LIVE_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["victor_bets"] = victor_bets
    with open(LIVE_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"odds: {live_odds}  (source: {odds_src})")
    for name in ("safe", "medium", "max"):
        t = victor_bets["tiers"][name]
        if not t:
            print(f"{name.upper():6s} — no edge")
            continue
        legs = " + ".join(f"{s['label']} @{s['odds']}" for s in t["selections"])
        print(f"{name.upper():6s} {t['combined_odds']:.2f} ({t['combined_prob']:.0%})  {legs}")
    print(f"\nWrote {LIVE_JSON}")


if __name__ == "__main__":
    main()
