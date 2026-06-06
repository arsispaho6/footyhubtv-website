"""Build the Mundial 2026 group-stage fixture list for the website.

Source: Sky Sports / FIFA day-by-day schedule (UK kick-off times, BST = UTC+1 in June).
We store each kickoff as an absolute UTC instant so the site can render it in EACH
visitor's local timezone. Writes:
  - fixtures.json  (data record)
  - fixtures.js    (window.FIXTURES = [...]  — loaded by the site via <script src>,
                    which works on file:// too, unlike fetch())

Re-run after editing RAW:  python build_fixtures.py
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
BST = timezone(timedelta(hours=1))  # British Summer Time (June) = UTC+1

# name -> (flag_code, display_name)  — display matches the rest of the site
TEAM = {
    "Mexico": ("mx", "Mexico"), "South Africa": ("za", "S. Africa"),
    "South Korea": ("kr", "S. Korea"), "Czech Republic": ("cz", "Czechia"),
    "Canada": ("ca", "Canada"), "Bosnia & Herzegovina": ("ba", "Bosnia"),
    "Qatar": ("qa", "Qatar"), "Switzerland": ("ch", "Switzerland"),
    "USA": ("us", "USA"), "Paraguay": ("py", "Paraguay"),
    "Australia": ("au", "Australia"), "Turkey": ("tr", "Türkiye"),
    "Brazil": ("br", "Brazil"), "Morocco": ("ma", "Morocco"),
    "Haiti": ("ht", "Haiti"), "Scotland": ("gb-sct", "Scotland"),
    "Germany": ("de", "Germany"), "Curacao": ("cw", "Curaçao"),
    "Ivory Coast": ("ci", "Ivory Coast"), "Ecuador": ("ec", "Ecuador"),
    "Netherlands": ("nl", "Netherlands"), "Japan": ("jp", "Japan"),
    "Sweden": ("se", "Sweden"), "Tunisia": ("tn", "Tunisia"),
    "Spain": ("es", "Spain"), "Cape Verde": ("cv", "Cape Verde"),
    "Saudi Arabia": ("sa", "Saudi Arabia"), "Uruguay": ("uy", "Uruguay"),
    "Belgium": ("be", "Belgium"), "Egypt": ("eg", "Egypt"),
    "Iran": ("ir", "Iran"), "New Zealand": ("nz", "New Zealand"),
    "France": ("fr", "France"), "Senegal": ("sn", "Senegal"),
    "Iraq": ("iq", "Iraq"), "Norway": ("no", "Norway"),
    "Argentina": ("ar", "Argentina"), "Algeria": ("dz", "Algeria"),
    "Austria": ("at", "Austria"), "Jordan": ("jo", "Jordan"),
    "Portugal": ("pt", "Portugal"), "DR Congo": ("cd", "DR Congo"),
    "England": ("gb-eng", "England"), "Croatia": ("hr", "Croatia"),
    "Ghana": ("gh", "Ghana"), "Panama": ("pa", "Panama"),
    "Uzbekistan": ("uz", "Uzbekistan"), "Colombia": ("co", "Colombia"),
}

# (day, hour, minute, home, away, group) — June 2026, BST kick-off
RAW = [
    (11, 20, 0, "Mexico", "South Africa", "A"),
    (12, 3, 0, "South Korea", "Czech Republic", "A"),
    (12, 20, 0, "Canada", "Bosnia & Herzegovina", "B"),
    (13, 2, 0, "USA", "Paraguay", "D"),
    (13, 20, 0, "Qatar", "Switzerland", "B"),
    (13, 23, 0, "Brazil", "Morocco", "C"),
    (14, 2, 0, "Haiti", "Scotland", "C"),
    (14, 5, 0, "Australia", "Turkey", "D"),
    (14, 18, 0, "Germany", "Curacao", "E"),
    (14, 21, 0, "Netherlands", "Japan", "F"),
    (15, 0, 0, "Ivory Coast", "Ecuador", "E"),
    (15, 3, 0, "Sweden", "Tunisia", "F"),
    (15, 17, 0, "Spain", "Cape Verde", "H"),
    (15, 20, 0, "Belgium", "Egypt", "G"),
    (15, 23, 0, "Saudi Arabia", "Uruguay", "H"),
    (16, 2, 0, "Iran", "New Zealand", "G"),
    (16, 20, 0, "France", "Senegal", "I"),
    (16, 23, 0, "Iraq", "Norway", "I"),
    (17, 2, 0, "Argentina", "Algeria", "J"),
    (17, 5, 0, "Austria", "Jordan", "J"),
    (17, 18, 0, "Portugal", "DR Congo", "K"),
    (17, 21, 0, "England", "Croatia", "L"),
    (18, 0, 0, "Ghana", "Panama", "L"),
    (18, 3, 0, "Uzbekistan", "Colombia", "K"),
    (18, 17, 0, "Czech Republic", "South Africa", "A"),
    (18, 20, 0, "Switzerland", "Bosnia & Herzegovina", "B"),
    (18, 23, 0, "Canada", "Qatar", "B"),
    (19, 2, 0, "Mexico", "South Korea", "A"),
    (19, 20, 0, "USA", "Australia", "D"),
    (19, 23, 0, "Scotland", "Morocco", "C"),
    (20, 1, 30, "Brazil", "Haiti", "C"),
    (20, 4, 0, "Turkey", "Paraguay", "D"),
    (20, 18, 0, "Netherlands", "Sweden", "F"),
    (20, 21, 0, "Germany", "Ivory Coast", "E"),
    (21, 1, 0, "Ecuador", "Curacao", "E"),
    (21, 5, 0, "Tunisia", "Japan", "F"),
    (21, 17, 0, "Spain", "Saudi Arabia", "H"),
    (21, 20, 0, "Belgium", "Iran", "G"),
    (21, 23, 0, "Uruguay", "Cape Verde", "H"),
    (22, 2, 0, "New Zealand", "Egypt", "G"),
    (22, 18, 0, "Argentina", "Austria", "J"),
    (22, 22, 0, "France", "Iraq", "I"),
    (23, 1, 0, "Norway", "Senegal", "I"),
    (23, 4, 0, "Jordan", "Algeria", "J"),
    (23, 18, 0, "Portugal", "Uzbekistan", "K"),
    (23, 21, 0, "England", "Ghana", "L"),
    (24, 0, 0, "Panama", "Croatia", "L"),
    (24, 3, 0, "Colombia", "DR Congo", "K"),
    (24, 20, 0, "Switzerland", "Canada", "B"),
    (24, 20, 0, "Bosnia & Herzegovina", "Qatar", "B"),
    (24, 23, 0, "Morocco", "Haiti", "C"),
    (24, 23, 0, "Scotland", "Brazil", "C"),
    (25, 2, 0, "South Africa", "South Korea", "A"),
    (25, 2, 0, "Czech Republic", "Mexico", "A"),
    (25, 21, 0, "Curacao", "Ivory Coast", "E"),
    (25, 21, 0, "Ecuador", "Germany", "E"),
    (26, 0, 0, "Tunisia", "Netherlands", "F"),
    (26, 0, 0, "Japan", "Sweden", "F"),
    (26, 3, 0, "Turkey", "USA", "D"),
    (26, 3, 0, "Paraguay", "Australia", "D"),
    (26, 20, 0, "Norway", "France", "I"),
    (26, 20, 0, "Senegal", "Iraq", "I"),
    (27, 1, 0, "Cape Verde", "Saudi Arabia", "H"),
    (27, 1, 0, "Uruguay", "Spain", "H"),
    (27, 4, 0, "New Zealand", "Belgium", "G"),
    (27, 4, 0, "Egypt", "Iran", "G"),
    (27, 22, 0, "Panama", "England", "L"),
    (27, 22, 0, "Croatia", "Ghana", "L"),
    (28, 0, 30, "Colombia", "Portugal", "K"),
    (28, 0, 30, "DR Congo", "Uzbekistan", "K"),
    (28, 3, 0, "Algeria", "Austria", "J"),
    (28, 3, 0, "Jordan", "Argentina", "J"),
]


# Knockout bracket (placeholder slots until the groups decide the teams).
# (month, day, hour, minute, home_label, away_label, round, venue, match_no) — BST kick-off
KO_RAW = [
    # Round of 32
    (6, 28, 20, 0, "Runner-up A", "Runner-up B", "Round of 32", "Los Angeles", 73),
    (6, 29, 18, 0, "Winner C", "Runner-up F", "Round of 32", "Houston", 76),
    (6, 29, 21, 30, "Winner E", "3rd A/B/C/D/F", "Round of 32", "Foxborough", 74),
    (6, 30, 2, 0, "Winner F", "Runner-up C", "Round of 32", "Guadalajara", 75),
    (6, 30, 18, 0, "Runner-up E", "Runner-up I", "Round of 32", "Arlington", 78),
    (6, 30, 22, 0, "Winner I", "3rd C/D/F/G/H", "Round of 32", "New Jersey", 77),
    (7, 1, 2, 0, "Winner A", "3rd C/E/F/H/I", "Round of 32", "Mexico City", 79),
    (7, 1, 17, 0, "Winner L", "3rd E/H/I/J/K", "Round of 32", "Atlanta", 80),
    (7, 1, 21, 0, "Winner G", "3rd A/E/H/I/J", "Round of 32", "Seattle", 82),
    (7, 2, 1, 0, "Winner D", "3rd B/E/F/I/J", "Round of 32", "Santa Clara", 81),
    (7, 2, 20, 0, "Winner H", "Runner-up J", "Round of 32", "Los Angeles", 84),
    (7, 3, 0, 0, "Runner-up K", "Runner-up L", "Round of 32", "Toronto", 83),
    (7, 3, 4, 0, "Winner B", "3rd E/F/G/I/J", "Round of 32", "Vancouver", 85),
    (7, 3, 19, 0, "Runner-up D", "Runner-up G", "Round of 32", "Arlington", 88),
    (7, 3, 23, 0, "Winner J", "Runner-up H", "Round of 32", "Miami", 86),
    (7, 4, 2, 30, "Winner K", "3rd D/E/I/J/L", "Round of 32", "Kansas City", 87),
    # Round of 16
    (7, 4, 18, 0, "Winner 73", "Winner 75", "Round of 16", "Houston", 90),
    (7, 4, 22, 0, "Winner 74", "Winner 77", "Round of 16", "Philadelphia", 89),
    (7, 5, 21, 0, "Winner 76", "Winner 78", "Round of 16", "New Jersey", 91),
    (7, 6, 1, 0, "Winner 79", "Winner 80", "Round of 16", "Mexico City", 92),
    (7, 6, 20, 0, "Winner 83", "Winner 84", "Round of 16", "Arlington", 93),
    (7, 7, 1, 0, "Winner 81", "Winner 82", "Round of 16", "Seattle", 94),
    (7, 7, 17, 0, "Winner 86", "Winner 88", "Round of 16", "Atlanta", 95),
    (7, 7, 21, 0, "Winner 85", "Winner 87", "Round of 16", "Vancouver", 96),
    # Quarter-finals
    (7, 9, 21, 0, "Winner 89", "Winner 90", "Quarter-final", "Foxborough", 97),
    (7, 10, 20, 0, "Winner 93", "Winner 94", "Quarter-final", "Los Angeles", 98),
    (7, 11, 22, 0, "Winner 91", "Winner 92", "Quarter-final", "Miami", 99),
    (7, 12, 2, 0, "Winner 95", "Winner 96", "Quarter-final", "Kansas City", 100),
    # Semi-finals
    (7, 14, 20, 0, "Winner 97", "Winner 98", "Semi-final", "Arlington", 101),
    (7, 15, 20, 0, "Winner 99", "Winner 100", "Semi-final", "Atlanta", 102),
    # Third place + Final
    (7, 18, 22, 0, "Loser 101", "Loser 102", "Third-place play-off", "Miami", 103),
    (7, 19, 20, 0, "Winner 101", "Winner 102", "Final", "New Jersey", 104),
]


def _utc(month: int, day: int, h: int, m: int) -> str:
    return datetime(2026, month, day, h, m, tzinfo=BST).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build() -> list[dict]:
    out = []
    for day, h, m, home, away, grp in RAW:
        hc, hn = TEAM[home]
        ac, an = TEAM[away]
        out.append({
            "utc": _utc(6, day, h, m),
            "home": hn, "home_code": hc, "away": an, "away_code": ac,
            "group": grp, "stage": "group",
        })
    for mo, day, h, m, hl, al, rnd, venue, no in KO_RAW:
        out.append({
            "utc": _utc(mo, day, h, m),
            "home": hl, "home_code": None, "away": al, "away_code": None,
            "group": None, "stage": "ko", "round": rnd, "venue": venue, "match_no": no,
        })
    out.sort(key=lambda x: x["utc"])
    return out


def main() -> None:
    matches = build()
    payload = {
        "tournament": "Mundial 2026",
        "source": "FIFA / Sky Sports day-by-day schedule (UK kickoff → UTC)",
        "count": len(matches),
        "matches": matches,
    }
    with open(os.path.join(HERE, "fixtures.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    with open(os.path.join(HERE, "fixtures.js"), "w", encoding="utf-8") as f:
        f.write("// Auto-generated by build_fixtures.py — do not edit by hand.\n")
        f.write("window.FIXTURES = " + json.dumps(matches, ensure_ascii=False) + ";\n")
    print(f"wrote {len(matches)} fixtures -> fixtures.json + fixtures.js")
    print("first:", matches[0]["utc"], matches[0]["home"], "vs", matches[0]["away"])
    print("last: ", matches[-1]["utc"], matches[-1]["home"], "vs", matches[-1]["away"])


if __name__ == "__main__":
    main()
