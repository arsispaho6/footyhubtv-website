# FootyHub TV — Site Plan (source of truth)

> Co-built by Aristotelis + Claude. Started 2026-06-03. We build top→bottom, section by section: 2 options → pick → lock → next. Nothing goes live until explicitly approved.

## 0. North-star
Beautiful, advanced, **original**, **AI-first** — the AI characters ARE the brand. Not a generic template.

## 1. Decisions locked
- **Positioning:** B2C-first (channel fans watch). B2B licensing demoted to `/partners`.
- **Player:** EMBED YouTube/Twitch iframe on our site (not link-out, not self-host). "Also live on" buttons for Twitch/TikTok.
- **Broadcast content:** ONLY our own overlays (no real match footage) → safe to clip + multistream, no Content ID risk.
- **Victor / betting:** fictional 18+ scoreboard now ("Entertainment only · Not financial advice"). Data model built so it can become real-money affiliate + **paid tipster product** later, no rewrite.
- **Logo:** keep the graffiti "FootyHubTV" (transparent `logo-trans.png`).
- **Tournament naming:** use **"Mundial 2026"** everywhere. NEVER "FIFA" / "FIFA World Cup" (FIFA trademark — legal risk + implies official affiliation we don't have). "World Cup 2026" acceptable as a generic alt. Aligns with Rule #1 (no false official claims).

## 2. The Cast
- **LIA + Victor = permanent stars** (the two faces of the channel). Full star treatment.
- **Fans = rotating squad of 42.** The right fans are fielded per match (e.g. by team nationality). Shown dynamically as "Tonight's fans" from `live.json`. Luis/Mateo = current test pair only, NOT standard.
- Unique feature: "we field the right fans for every match."
- AI signature throughout: voiceprint/waveform + voice sample per host.

## 3. Pages
- `/` — Home, **adaptive**: OFF-AIR ↔ LIVE
- `/hosts` — The Cast (LIA & Victor big; Fan Squad gallery of 42, tonight's highlighted)
- `/schedule` — Fixtures we'll cover
- `/watch` — VOD replays (later)
- `/partners` — relocated B2B pitch

## 4. Homepage layout (top → bottom)
**OFF-AIR (≈95% of the time):**
1. Nav  2. Live ticker  3. Hero (logo + slogan + next match + "Notify me")  4. The Cast (LIA, Victor + tonight's fans)  5. Latest clips  6. Mundial 2026  7. Partners ribbon + Footer

**LIVE:** hero becomes the watch experience → YouTube embed (center) + live chat (right) + score & Victor's bet card (left) + "also live on Twitch/TikTok".

## 5. Tech
- Static HTML/CSS/JS on **GitHub Pages** (repo `arsispaho6/footyhubtv-website`, domain footyhub.tv). No server.
- **`live.json`** = single source the Python engine writes (`is_live`, teams, score, minute, kickoff, `yt_video_id`, tonight's fans, `victor_bets[]`). Site polls it → swaps off-air/live.
- Email capture: Formspree or Buttondown (free). TODO: 1 signup.
- Multistream: Restream.io (OBS → YT+Twitch+TikTok).

## 6. Need from owner
- Brand: keep purple? fonts? intro jingle mp3? host face images (or stylized)?
- One-line slogan; OK on AI-written host bios.
- When created: YouTube channel ID + Twitch + TikTok handles.
- Email for the Notify list service.

## 7. Status
- Working preview: `mockup.html` (LOCAL, untracked, NOT deployed). Live `footyhub.tv` untouched.
- **#1 Nav — ✅ LOCKED.** AI Command Bar: brand + On-Air chip (voiceprint + shows the LIVE match; off-air → "Next" match) + Watch/Cast/Schedule/For-Media + 🌐 lang + social + Watch Live CTA + animated glow underline.
- **#2 Live ticker — ✅ LOCKED.** FootyHub-first content: On air · Next on FootyHub · Victor's Triple Bet · Tonight's fans · Mundial 2026 · New clip. Labeled chips, infinite scroll, pause on hover.
- **#3 Hero — ✅ LOCKED (Variant B "Tonight Showcase").** Split: left = logo + slogan + sub; right = "Tonight on FootyHub" poster (match + countdown + **Notify me** under the countdown + Tonight's cast LIA/Victor/fans with voiceprints). (Variant A "Centered Spotlight" kept behind the A/B toggle as fallback.)
- **#4 The Cast — built, awaiting review.** Layout: **World Map**. LIA & Victor = 2 permanent star host cards (voiceprint + "Hear" voice-sample button). Below: world-map panel, **fans = one per nation (48 of World Cup 2026)** as glowing flag pins; tonight's two nations highlighted (pulsing). **✅ LOCKED — Flag Wall.** World map rejected; replaced by a clean grid of 48 nation flag-chips (real local flag SVGs in `flags/`, built from a JS list — one line to add/edit nations). Tonight's two nations get a "TONIGHT" badge + glow. Header "Every nation has a voice · 48 fans" + "Tonight ▸ Brazil vs Japan" caption. Names shown under each flag. NOTE: flag EMOJI don't render on Windows browsers → must use flag IMAGES everywhere (done: map/ticker/poster all use `flags/*.svg`). The 48 nations are placeholders → swap the official WC2026 draw list at build.

## 8. Data architecture (how everything becomes REAL — discussed 2026-06-04)
Site has NO data of its own. The Python engine (which already computes teams/score/minute/kickoff/Victor-bets/active-fans for the broadcast) writes a small **`live.json`** (is_live, phase, match{home/away/codes/competition/kickoff/score/minute}, platforms{youtube_id/twitch/tiktok}, tonight_fans[], victor_bets[]). The site polls it and renders REAL data. Every demo value in `mockup.html` maps 1:1 to a real `live.json` field — going live = wire the JSON, not redesign. Non-live data: `nations.json` (48 from official WC2026 draw, one-time), schedule/fixtures list, clips/VOD (from clip pipeline, fast-follow). This is the web-version of Rule #1 (no fabricated facts).

## 9. Modern interaction layer (researched + APPROVED 2026-06-04)
GOAL: award-level (Awwwards-tier) "minimal but alive" — NOT a flat one-background scroll. KEY: achievable on vanilla static GitHub Pages, no build step.
- **Stack (stay vanilla):** GSAP + ScrollTrigger + SplitText (now 100% free since Apr 2025, CDN) + Lenis smooth scroll (~3KB) + native CSS (scroll-driven animations `animation-timeline`, cross-document View Transitions `@view-transition`, `@property` gradients) + a lightweight WebGL shader for the hero (raw GL or OGL). No framework migration.
- **Signature moment (✅ approved via `poc-hero.html`):** hero = animated violet WebGL shader-gradient (mouse-reactive) + scramble/decode text on the wordmark & a rotating "Now: LIA→Victor→48 nations→you" line + staggered entrance + magnetic Watch Live button + grain/vignette. Owner reaction: "τέλειο".
- **Per-section plan:** Hero=pinned shader scene; Cast/Flag-wall=bento + scroll-reveal + custom cursor; Clips=horizontal-scroll pin; Mundial=scrollytelling; routes=View Transitions; global=Lenis + grain + one-violet system.
- **Guardrails:** `prefers-reduced-motion` gates everything; mobile fallbacks (no cursor/scroll-hijack on touch); pin CDN versions; content in DOM for SEO; `@supports` fallbacks (Firefox behind). 
- **POC file:** `poc-hero.html` (local, untracked).
- **Method:** finish section LAYOUTS first, then one cohesive pass to apply this interaction layer across the whole site.

## 10. Status log
- ✅ Locked: #1 Nav · #2 Ticker · #3 Hero (B) · #4 Cast (Flag Wall) · #5 Clips (Reel Strip + follow CTA) · modern interaction direction (POC approved).
- Homepage mockup (`mockup.html`) sections + interaction layer + intro hero + Cast pick-a-fan + Mundial hub + footer = **DONE (mockup level)**. Still local/untracked; live site untouched.

## 11. Remaining backlog (a lot still to do — 2026-06-05)
### A. Finish the homepage (it's a mockup)
- ✅ DONE: poster off/live states (next-match + notify-with-match-picker / live-match + Watch now + up-next), watch page (player+chat+score+bet) reachable via Watch now + back, Mundial banner Pre/Live/Done states, all nav/footer links wired (scroll/open), Mundial hub (Groups↔Standings, scroll-lock), native cursor.
- LIVE watch page polish (animated chat, viewer count) — optional next
- Mobile / responsive pass (100vh→svh, touch fallbacks, layout at <760px)
- ✅ DONE (2026-06-05): swapped placeholders → REAL data. 48 WC2026 teams in official 12 groups A→L (5 Dec 2025 draw); opening match Mexico v South Africa (11 Jun, Estadio Azteca) everywhere; live countdown to 11 Jun kickoff; tonight's fans Santiago(mx)+Thabo(za); zeroed pre-tournament standings; honest empty states (replays/clips — no broadcasts yet); 48 real flag SVGs. YouTube channel @FootyHub_TV (ID UCNODmrFpJQZvyc0K_A2xk7w) wired into social + embed label.
- Accessibility: proper prefers-reduced-motion (RM is force-OFF in demo), focus states, contrast
- Per-section polish from owner review
### B. The other pages / routes
- `/hosts` (LIA & Victor full bios + 48-fan squad), `/schedule`, `/watch` (VOD grid), `/partners` (relocate live B2B copy)
- Mundial hub → its own real page (currently an overlay)
- `/match/{teams}` programmatic SEO pages (growth engine)
### C. Make it real (data + services)
- ✅ DONE (2026-06-05): `live.json` contract created (is_live/match/score/kickoff/platforms/tonight_fans/victor_bets) + `mundial.json` (12 groups). Site polls `live.json` every 10s via guarded `syncLive()` (overrides countdown + is_live), falls back to inline real data on file://. Data flow = Sofascore → engine → live.json → site (site never scrapes Sofascore directly). NEXT: engine writes live.json for real; deeper fields (score/minute/victor_bets) into the DOM.
- "Are we live?" manual flag first (YouTube API auto-detect later)
- Email capture service (Formspree/Buttondown) for "Notify me"
### D. Distribution & launch
- Owner creates YT/Twitch/TikTok channels (@footyhubtv) → drop IDs into config
- Multistream (Restream) OBS → all 3
- Clip pipeline (auto 9:16 from broadcasts) — top-of-funnel
- Deploy to GitHub Pages (with approval) · SEO meta/sitemap · analytics
- Host images/avatars (replace letter avatars) · intro jingle integration **Correction logged:** fans rotate = one per NATION (home+away of each match), not arbitrary personalities; LIA/Victor neutral hosts.
