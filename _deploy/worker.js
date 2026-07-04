var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
var EMPTY = '{"is_live":false,"phase":"pre"}';
var okEmail = /* @__PURE__ */ __name((e) => typeof e === "string" && e.length < 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e), "okEmail");
var _BAD = ["fuck", "shit", "cunt", "nigger", "faggot", "bitch", "asshole", "dick", "pussy", "rape", "nazi", "hitler", "slut", "whore"];
var badName = /* @__PURE__ */ __name((s) => {
  const t = String(s).toLowerCase().replace(/[^a-z]/g, "");
  return _BAD.some((w) => t.includes(w));
}, "badName");
var _b64uDec = /* @__PURE__ */ __name((s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - s.length % 4) % 4);
  const b = atob(s);
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}, "_b64uDec");
var _b64uEnc = /* @__PURE__ */ __name((u) => {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}, "_b64uEnc");
var _te = /* @__PURE__ */ __name((s) => new TextEncoder().encode(s), "_te");
function _concat(...a) {
  let n = 0;
  for (const x of a) n += x.length;
  const o = new Uint8Array(n);
  let p = 0;
  for (const x of a) {
    o.set(x, p);
    p += x.length;
  }
  return o;
}
__name(_concat, "_concat");
async function _hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
__name(_hkdf, "_hkdf");
async function _vapidJWT(aud, sub, jwk) {
  const h = _b64uEnc(_te(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const b = _b64uEnc(_te(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1e3) + 43200, sub })));
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, _te(h + "." + b)));
  return h + "." + b + "." + _b64uEnc(sig);
}
__name(_vapidJWT, "_vapidJWT");
async function _encryptPush(sub, payload) {
  const uaPub = _b64uDec(sub.keys.p256dh), auth = _b64uDec(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await _hkdf(auth, shared, _concat(_te("WebPush: info\0"), uaPub, asPub), 32);
  const cek = await _hkdf(salt, ikm, _te("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await _hkdf(salt, ikm, _te("Content-Encoding: nonce\0"), 12);
  const akey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, akey, _concat(_te(payload), new Uint8Array([2]))));
  return _concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}
__name(_encryptPush, "_encryptPush");
async function _sendPush(sub, payload, env) {
  try {
    const jwt = await _vapidJWT(new URL(sub.endpoint).origin, env.VAPID_SUBJECT || "mailto:contact@footyhub.tv", JSON.parse(env.VAPID_PRIVATE));
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: { TTL: "86400", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}` },
      body: await _encryptPush(sub, payload)
    });
    return r.status;
  } catch (e) {
    return 0;
  }
}
__name(_sendPush, "_sendPush");
function reply(msg, status) {
  return new Response(msg, { status, headers: { ...CORS, "Content-Type": "text/plain" } });
}
__name(reply, "reply");
function confirmHtml(match) {
  const line = match ? `We'll email you before kickoff of <b>${match}</b>.` : `We'll email you before kickoff.`;
  return `<div style="font-family:system-ui,Arial,sans-serif;background:#000;color:#fff;padding:36px 28px;border-radius:16px;max-width:520px;margin:0 auto;text-align:center">
    <img src="https://footyhub-live.footyhubtv.workers.dev/logo.png" alt="FootyHub TV" width="200" style="display:block;margin:0 auto 22px;max-width:200px;height:auto">
    <h1 style="font-size:21px;margin:0 0 10px;color:#fff">You're on the list</h1>
    <p style="color:#cbb9ff;line-height:1.6;margin:0 0 14px;font-size:15px">${line}</p>
    <p style="color:#9d8bbf;font-size:13px;line-height:1.6;margin:0">Live AI football - LIA on the call, Victor on the analysis, a fan for every nation.</p>
    <p style="color:#5e5278;font-size:11px;margin-top:24px">You signed up at footyhub.tv | Entertainment only | 18+</p>
  </div>`;
}
__name(confirmHtml, "confirmHtml");
function blastHtml(body, url) {
  return `<div style="font-family:system-ui,Arial,sans-serif;background:#000;color:#fff;padding:36px 28px;border-radius:16px;max-width:520px;margin:0 auto;text-align:center">
    <img src="https://footyhub-live.footyhubtv.workers.dev/logo.png" alt="FootyHub TV" width="200" style="display:block;margin:0 auto 22px;max-width:200px;height:auto">
    <p style="color:#cbb9ff;line-height:1.6;margin:0 0 22px;font-size:16px">${body}</p>
    <a href="${url || "https://footyhub.tv"}" style="display:inline-block;background:#9646ff;color:#fff;text-decoration:none;font-weight:700;padding:13px 28px;border-radius:50px;font-size:15px">Watch on FootyHub TV &#9656;</a>
    <p style="color:#5e5278;font-size:11px;margin-top:24px">FootyHub TV | Live AI football | Entertainment only | 18+</p>
  </div>`;
}
__name(blastHtml, "blastHtml");
async function sendConfirmation(env, email, match) {
  if (!env.RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIFY_FROM || "FootyHub TV <onboarding@resend.dev>",
        to: [email],
        reply_to: env.NOTIFY_REPLY_TO || "contact@footyhub.tv",
        subject: "You're on the list - FootyHub TV",
        html: confirmHtml(match)
      })
    });
  } catch (e) {
  }
}
__name(sendConfirmation, "sendConfirmation");
//  match-alert blasts (push + email) reused by the scheduled cron 
async function _pushBlast(env, title, body, url) {
  const payload = JSON.stringify({ title, body, url: url || "https://footyhub.tv" });
  const list = await env.LIVE.list({ prefix: "push:" });
  let sent = 0;
  for (const k of list.keys) {
    const raw = await env.LIVE.get(k.name);
    if (!raw) continue;
    const st = await _sendPush(JSON.parse(raw), payload, env);
    if (st >= 200 && st < 300) sent++;
    else if (st === 404 || st === 410) await env.LIVE.delete(k.name);
  }
  return sent;
}
__name(_pushBlast, "_pushBlast");
async function _emailBlast(env, subject, bodyHtml, url) {
  if (!env.RESEND_API_KEY) return 0;
  const html = blastHtml(bodyHtml, url);
  const list = await env.LIVE.list({ prefix: "notify:" });
  let sent = 0;
  for (const k of list.keys) {
    const raw = await env.LIVE.get(k.name);
    if (!raw) continue;
    let email;
    try { email = JSON.parse(raw).email; } catch (e) { continue; }
    if (!email) continue;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.NOTIFY_FROM || "FootyHub TV <onboarding@resend.dev>", to: [email], reply_to: env.NOTIFY_REPLY_TO || "contact@footyhub.tv", subject, html })
      });
      if (r.ok) sent++;
    } catch (e) {}
  }
  return sent;
}
__name(_emailBlast, "_emailBlast");
async function _once(env, key) {
  if (await env.LIVE.get(key)) return false;
  await env.LIVE.put(key, "1", { expirationTtl: 60 * 60 * 24 * 2 });
  return true;
}
__name(_once, "_once");
async function _notifyTick(env) {
  let fx;
  try {
    const r = await fetch("https://footyhub.tv/fixtures.json", { cf: { cacheTtl: 120 } });
    if (!r.ok) return;
    fx = await r.json();
  } catch (e) { return; }
  let bracket = {};
  try { const lv = await env.LIVE.get("live"); if (lv) bracket = ((JSON.parse(lv).results || {}).ko) || {}; } catch (e) {}
  const matches = (fx && fx.matches) || [];
  const now = Date.now();
  for (const m of matches) {
    const ko = Date.parse(m.utc || "");
    if (isNaN(ko)) continue;
    const dt = ko - now;
    if (dt > 10 * 60000 || dt < -10 * 60000) continue;
    let home = m.home, away = m.away, mid = (m.home_code || "") + "-" + (m.away_code || "");
    if (m.stage === "ko") {
      const r = bracket[m.match_no] || bracket[String(m.match_no)] || {};
      if (!(r.home && r.home.name && r.away && r.away.name)) continue;   // teams not decided - never notify a placeholder slot
      home = r.home.name; away = r.away.name; mid = (r.home.code || "") + "-" + (r.away.code || "");
    }
    const teams = (home || "Home") + " v " + (away || "Away");
    if (dt > 0) {
      if (await _once(env, "nsoon:" + mid + ":" + ko)) {
        await _pushBlast(env, "Kicks off in 10 minutes", teams + " is live on FootyHub TV. Pre-game starts now.", "https://footyhub.tv/#live");
        await _emailBlast(env, teams + " kicks off in 10 minutes - FootyHub TV", "<b>" + teams + "</b> kicks off in about 10 minutes. Victor reveals his Medium and Max picks in the live pre-game right now.", "https://footyhub.tv/#live");
      }
    } else {
      if (await _once(env, "nlive:" + mid + ":" + ko)) {
        await _pushBlast(env, "We are LIVE now", teams + " has kicked off. Watch now on FootyHub TV.", "https://footyhub.tv/#live");
        await _emailBlast(env, "LIVE now: " + teams + " - FootyHub TV", "<b>" + teams + "</b> has kicked off. LIA and Victor are on the call. Tap in:", "https://footyhub.tv/#live");
      }
    }
  }
}
__name(_notifyTick, "_notifyTick");
// ── live-scores tick (cron): ESPN scoreboard -> results.live (in-play score+minute, ~1min)
//    + results.scores (finals land <=1min after FT). 24/7, broadcast PC can be OFF.
//    Writes only when something changed (KV free tier = 1000 writes/day; idle hours cost 0).
var NAMECODE = { "mexico": "mx", "southafrica": "za", "safrica": "za", "southkorea": "kr", "skorea": "kr", "czechrepublic": "cz", "czechia": "cz", "canada": "ca", "bosniaherzegovina": "ba", "bosnia": "ba", "qatar": "qa", "switzerland": "ch", "usa": "us", "paraguay": "py", "australia": "au", "turkey": "tr", "turkiye": "tr", "brazil": "br", "morocco": "ma", "haiti": "ht", "scotland": "gb-sct", "germany": "de", "curacao": "cw", "ivorycoast": "ci", "ecuador": "ec", "netherlands": "nl", "japan": "jp", "sweden": "se", "tunisia": "tn", "spain": "es", "capeverde": "cv", "saudiarabia": "sa", "uruguay": "uy", "belgium": "be", "egypt": "eg", "iran": "ir", "newzealand": "nz", "france": "fr", "senegal": "sn", "iraq": "iq", "norway": "no", "argentina": "ar", "algeria": "dz", "austria": "at", "jordan": "jo", "portugal": "pt", "drcongo": "cd", "england": "gb-eng", "croatia": "hr", "ghana": "gh", "panama": "pa", "uzbekistan": "uz", "colombia": "co", "korearepublic": "kr", "iriran": "ir", "cotedivoire": "ci", "unitedstates": "us", "bosniaandherzegovina": "ba", "congodr": "cd", "caboverde": "cv" };
var _lsNorm = /* @__PURE__ */ __name((s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""), "_lsNorm");
var _lsCode = /* @__PURE__ */ __name((n) => NAMECODE[_lsNorm(n)] || "", "_lsCode");
// forward-propagate the knockout bracket server-side so live.json is self-complete:
// "Winner 88" -> Egypt the moment m88 decides, without waiting for ESPN to update the R16
// fixture or for the GitHub cron. Mirrors the site's client-side propagator.
function _koNameSrv(res, code) {
  if (!code) return String(code || "").toUpperCase();
  const st = res.standings || {};
  for (const L in st) { const r = (st[L] || []).find((x) => x && x.code === code); if (r && r.name) return r.name; }
  return String(code).toUpperCase();
}
__name(_koNameSrv, "_koNameSrv");
function _resolveKoSrv(res, label) {
  const s = String(label || ""); let m;
  if (m = s.match(/^Winner ([A-L])$/)) { const r = (res.standings || {})[m[1]] || []; return r.length >= 4 && r[0] ? { code: r[0].code, name: r[0].name } : null; }
  if (m = s.match(/^Runner-up ([A-L])$/)) { const r = (res.standings || {})[m[1]] || []; return r.length >= 4 && r[1] ? { code: r[1].code, name: r[1].name } : null; }
  if (m = s.match(/^Winner (\d+)$/)) { const e = (res.ko || {})[m[1]]; if (e && e.winner) { const t = e.home && e.home.code === e.winner ? e.home : (e.away && e.away.code === e.winner ? e.away : null); return { code: e.winner, name: t && t.name || _koNameSrv(res, e.winner) }; } return null; }
  if (m = s.match(/^Loser (\d+)$/)) { const e = (res.ko || {})[m[1]]; if (e && e.winner && e.home && e.away) { const t = e.home.code === e.winner ? e.away : e.home; return { code: t.code, name: t.name || _koNameSrv(res, t.code) }; } return null; }
  return null;
}
__name(_resolveKoSrv, "_resolveKoSrv");
function _propagateKoSrv(res, matches) {
  res.ko = res.ko || {};
  const kf = matches.filter((m) => m.stage === "ko" && m.match_no != null).sort((a, b) => (a.match_no || 0) - (b.match_no || 0));
  for (const f of kf) {
    const no = String(f.match_no); const e = res.ko[no] || (res.ko[no] = {});
    if (!(e.home && e.home.code)) { const r = _resolveKoSrv(res, f.home_label || f.home); if (r) e.home = Object.assign({}, e.home, r); }
    if (!(e.away && e.away.code)) { const r = _resolveKoSrv(res, f.away_label || f.away); if (r) e.away = Object.assign({}, e.away, r); }
  }
}
__name(_propagateKoSrv, "_propagateKoSrv");
async function _liveScoresTick(env) {
  // fixtures.json gives OUR home/away orientation — results.scores/live keys must match the site's
  let fx;
  try {
    const r = await fetch("https://footyhub.tv/fixtures.json", { cf: { cacheTtl: 300 } });
    if (!r.ok) return;
    fx = await r.json();
  } catch (e) { return; }
  const orient = {};
  for (const m of ((fx && fx.matches) || [])) {
    if (m.home_code && m.away_code) orient[[m.home_code, m.away_code].sort().join("|")] = m.home_code + "-" + m.away_code;
  }
  // ALSO key already-resolved KO slots (QF/SF/Final teams the propagator filled) so their
  // live/FT scores map to the right slot BEFORE the flaky Action bakes real codes into fixtures.
  // Without this, an in-play quarter-final shows "LIVE" with no score until the bake lands.
  try {
    let _pre = {};
    try { _pre = JSON.parse((await env.LIVE.get("live")) || "{}"); } catch (e) {}
    const _pko = (_pre.results || {}).ko || {};
    for (const no in _pko) {
      const e = _pko[no];
      if (e && e.home && e.home.code && e.away && e.away.code)
        orient[[e.home.code, e.away.code].sort().join("|")] = e.home.code + "-" + e.away.code;
    }
  } catch (e) {}
  // ko fixtures indexed by kickoff ts so completed knockout events can update results.ko
  // (pens + winner) within a minute of FT — GitHub's espn-sync cron proved able to skip
  // 50min of runs (2026-07-03), which left the bracket without the shootout result.
  const koFix = [];
  for (const m of ((fx && fx.matches) || [])) {
    if (m.stage !== "ko" || !m.utc) continue;
    const ts = Date.parse(m.utc);
    if (!isNaN(ts)) koFix.push({ no: String(m.match_no), ts });
  }
  const liveNow = {}, finals = {}, koUpd = {};
  let espnOk = false;   // did AT LEAST ONE ESPN window answer? if not, a total outage must NOT wipe live scores
  for (const off of [0, -1]) {   // today + yesterday UTC (matches cross midnight)
    const ds = new Date(Date.now() + off * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
    let sb;
    try {
      const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=" + ds,
        { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) continue;
      sb = await r.json();
      espnOk = true;
    } catch (e) { continue; }
    for (const ev of (sb.events || [])) {
      const comp = (ev.competitions || [])[0] || {};
      const st = ((comp.status || ev.status || {}).type) || {};
      let h = null, a = null;
      for (const c of (comp.competitors || [])) {
        const dn = (c.team || {}).displayName || (c.team || {}).name || "";
        const code = _lsCode(dn);
        if (!code) continue;
        let so = null;
        try { const v = parseInt(c.shootoutScore, 10); if (!isNaN(v)) so = v; } catch (e) {}
        const side = { code, name: dn, score: parseInt(c.score, 10), so };
        if (c.homeAway === "home") h = side;
        else if (c.homeAway === "away") a = side;
      }
      if (!h || !a || isNaN(h.score) || isNaN(a.score)) continue;
      const mid = orient[[h.code, a.code].sort().join("|")];
      if (!mid) continue;
      const flip = mid !== h.code + "-" + a.code;
      const hs = flip ? a.score : h.score, as2 = flip ? h.score : a.score;
      const done = st.completed || st.state === "post";
      if (st.state === "in") {
        const clock = String((comp.status || {}).displayClock || "").replace(/'/g, "").trim();
        liveNow[mid] = { h: hs, a: as2, m: clock };
      } else if (done) {
        finals[mid] = { h: hs, a: as2 };
      }
      if (done) {
        // knockout: attach pens + winner to the matching results.ko slot (kickoff +/-2h)
        const ets = Date.parse(ev.date || "");
        if (!isNaN(ets)) {
          const kf = koFix.filter((k) => Math.abs(k.ts - ets) <= 2 * 3600 * 1000);
          if (kf.length === 1) {
            const pens = h.so !== null && a.so !== null && h.so !== a.so;
            const e2 = {
              home: { code: h.code, name: h.name, score: pens ? h.score + " (" + h.so + ")" : h.score },
              away: { code: a.code, name: a.name, score: pens ? a.score + " (" + a.so + ")" : a.score }
            };
            if (h.score !== a.score) e2.winner = h.score > a.score ? h.code : a.code;
            else if (pens) e2.winner = h.so > a.so ? h.code : a.code;
            koUpd[kf[0].no] = e2;
          }
        }
      }
    }
  }
  // merge into the freshest live.json — touch ONLY results.* (the engine owns the broadcast fields)
  let data = {};
  try { data = JSON.parse((await env.LIVE.get("live")) || EMPTY); } catch (e) { data = {}; }
  try {
    const r = await fetch("https://cdn.footyhub.tv/live.json?cron=" + Date.now(), { headers: { "User-Agent": "Mozilla/5.0" } });
    if (r.ok) { const c = await r.json(); if (String(c.updated || "") >= String(data.updated || "")) data = c; }
  } catch (e) {}
  const res = data.results = data.results || {};
  const before = JSON.stringify({ l: res.live || {}, s: res.scores || {}, k: res.ko || {}, il: data.is_live });
  if (espnOk) res.live = liveNow;   // wholesale replace ONLY when ESPN answered — a total outage leaves prior in-play scores intact (empty liveNow from a FAILURE must not wipe them)
  if (Object.keys(finals).length) {
    res.scores = res.scores || {};
    for (const k in finals) res.scores[k] = finals[k];
  }
  if (Object.keys(koUpd).length) {
    res.ko = res.ko || {};
    for (const k in koUpd) res.ko[k] = koUpd[k];
  }
  try { _propagateKoSrv(res, (fx && fx.matches) || []); } catch (e) {}   // fill downstream ko slots from decided feeders
  // stale-engine kill: the engine pushes every ~15s while live; >7min silence = broadcast over
  try {
    const up = Date.parse(data.updated || "");
    if (data.is_live === true && !isNaN(up) && Date.now() - up > 420000) {
      data.is_live = false;
      data.phase = "off";
    }
  } catch (e) {}
  const after = JSON.stringify({ l: res.live || {}, s: res.scores || {}, k: res.ko || {}, il: data.is_live });
  if (after === before) return;   // nothing changed — no writes, no KV quota spent
  const body = JSON.stringify(data);
  await env.LIVE.put("live", body);
  if (env.CDN) {
    try {
      await env.CDN.put("live.json", body, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=5" } });
    } catch (e) {}
  }
}
__name(_liveScoresTick, "_liveScoresTick");
var worker_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const path = new URL(request.url).pathname;
    if (path === "/logo.png") {
      const img = await env.LIVE.get("logo", { type: "arrayBuffer" });
      if (!img) return reply("Not found", 404);
      return new Response(img, {
        headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" }
      });
    }
    if (path === "/notify") {
      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return reply("Bad JSON", 400);
        }
        const email = String(body.email || "").trim().toLowerCase();
        if (!okEmail(email)) return reply("Bad email", 400);
        const match = String(body.match || "").slice(0, 120);
        await env.LIVE.put("notify:" + email, JSON.stringify({ email, match, ts: Date.now() }));
        ctx.waitUntil(sendConfirmation(env, email, match));
        return reply("OK", 200);
      }
      if (request.method === "GET") {
        const auth = request.headers.get("Authorization") || "";
        if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
        const list = await env.LIVE.list({ prefix: "notify:" });
        const out = [];
        for (const k of list.keys) {
          const v = await env.LIVE.get(k.name);
          if (v) out.push(JSON.parse(v));
        }
        out.sort((a, b) => a.ts - b.ts);
        return new Response(JSON.stringify(out, null, 2), {
          headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" }
        });
      }
      return reply("Method not allowed", 405);
    }
    if (path === "/notify/send") {
      if (request.method !== "POST") return reply("Method not allowed", 405);
      const auth = request.headers.get("Authorization") || "";
      if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
      let b;
      try {
        b = await request.json();
      } catch (e) {
        return reply("Bad JSON", 400);
      }
      if (!env.RESEND_API_KEY) return reply("No email key", 500);
      const subject = String(b.subject || "FootyHub TV").slice(0, 140);
      const html = blastHtml(String(b.body || ""), b.url);
      const list = await env.LIVE.list({ prefix: "notify:" });
      let sent = 0;
      for (const k of list.keys) {
        const raw = await env.LIVE.get(k.name);
        if (!raw) continue;
        let email;
        try {
          email = JSON.parse(raw).email;
        } catch (e) {
          continue;
        }
        if (!email) continue;
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: env.NOTIFY_FROM || "FootyHub TV <onboarding@resend.dev>", to: [email], reply_to: env.NOTIFY_REPLY_TO || "contact@footyhub.tv", subject, html })
          });
          if (r.ok) sent++;
        } catch (e) {
        }
      }
      return new Response(JSON.stringify({ ok: true, sent, total: list.keys.length }), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (path === "/auth") {
      if (request.method !== "POST") return reply("Method not allowed", 405);
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return reply("Bad JSON", 400);
      }
      const cred = String(body.credential || "");
      if (!cred) return reply("No credential", 400);
      let info;
      try {
        const tr = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
        if (!tr.ok) return reply("Invalid token", 401);
        info = await tr.json();
      } catch (e) {
        return reply("Verify failed", 401);
      }
      if (info.aud !== env.GOOGLE_CLIENT_ID) return reply("Wrong audience", 401);
      if (info.email_verified !== "true" && info.email_verified !== true) return reply("Email not verified", 401);
      const user = { email: String(info.email).toLowerCase(), name: info.name || "", picture: info.picture || "", ts: Date.now(), country: request.cf && request.cf.country || "" };
      await env.LIVE.put("user:" + user.email, JSON.stringify(user));
      const session = crypto.randomUUID();
      await env.LIVE.put("sess:" + session, user.email, { expirationTtl: 60 * 60 * 24 * 30 });
      return new Response(
        JSON.stringify({ email: user.email, name: user.name, picture: user.picture, session }),
        { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }
    if (path === "/poll") {
      const cleanId = /* @__PURE__ */ __name((s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60), "cleanId");
      let pollId, payload = null;
      if (request.method === "GET") {
        pollId = cleanId(new URL(request.url).searchParams.get("id"));
      } else if (request.method === "POST") {
        try {
          payload = await request.json();
        } catch (e) {
          return reply("Bad JSON", 400);
        }
        pollId = cleanId(payload.id);
      } else {
        return reply("Method not allowed", 405);
      }
      if (!pollId) return reply("Bad id", 400);
      const wantReset = request.method === "POST" && payload && payload.reset === true;
      if (wantReset) {
        const auth = request.headers.get("Authorization") || "";
        if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
      }
      const stub = env.POLL.get(env.POLL.idFromName(pollId));
      const doReq = new Request("https://do/", {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: request.method === "POST" ? JSON.stringify({ option: payload.option, voter: payload.voter, reset: wantReset }) : void 0
      });
      const res = await stub.fetch(doReq);
      return new Response(await res.text(), {
        status: res.status,
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }
    if (path === "/like") {
      const stub = env.LIKES.get(env.LIKES.idFromName("fans"));
      if (request.method === "POST") {
        let payload;
        try {
          payload = await request.json();
        } catch (e) {
          return reply("Bad JSON", 400);
        }
        if (payload.reset === true) {
          const auth = request.headers.get("Authorization") || "";
          if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
        }
        const res2 = await stub.fetch(new Request("https://do/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
        return new Response(await res2.text(), { status: res2.status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }
      const res = await stub.fetch(new Request("https://do/", { method: "GET" }));
      return new Response(await res.text(), { status: res.status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (path === "/predict/recap") {
      if (request.method !== "POST") return reply("Method not allowed", 405);
      const auth = request.headers.get("Authorization") || "";
      if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
      let rbody;
      try {
        rbody = await request.json();
      } catch (e) {
        return reply("Bad JSON", 400);
      }
      const rstub = env.PREDICTOR.get(env.PREDICTOR.idFromName("season1"));
      const rRes = await rstub.fetch(new Request("https://do/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "recap", matchId: String(rbody.matchId || "") })
      }));
      const rdata = await rRes.json().catch(() => ({}));
      const recaps = rdata && rdata.recaps || [];
      if (!recaps.length) {
        return new Response(JSON.stringify({ ok: true, already: !!(rdata && rdata.already), sent: 0 }),
          { headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const home = String(rbody.home || "").slice(0, 40) || "Home";
      const away = String(rbody.away || "").slice(0, 40) || "Away";
      ctx.waitUntil((async () => {
        for (const rc of recaps) {
          try {
            const pid = await env.LIVE.get("psub:" + rc.user);
            if (!pid) continue;
            const raw = await env.LIVE.get("push:" + pid);
            if (!raw) continue;
            const verb = rc.pts === 3 ? "Spot on!" : rc.pts === 1 ? "Right result." : "Not this time.";
            const rank = rc.rank ? `You're #${rc.rank} of ${rdata.players}.` : "";
            const payload = JSON.stringify({
              title: `${home} ${rdata.ah}-${rdata.aa} ${away} - Full time`,
              body: `${verb} Your prediction ${rc.ph}-${rc.pa} scored +${rc.pts} points. ${rank} Predict today's matches now.`,
              url: "https://footyhub.tv"
            });
            const st = await _sendPush(JSON.parse(raw), payload, env);
            if (st === 404 || st === 410) {
              await env.LIVE.delete("push:" + pid);
              await env.LIVE.delete("psub:" + rc.user);
            }
          } catch (e) {
          }
        }
      })());
      return new Response(JSON.stringify({ ok: true, sent: recaps.length }),
        { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (path === "/predict" || path === "/predict/leaderboard" || path === "/predict/consensus" || path === "/predict/mine") {
      const stub = env.PREDICTOR.get(env.PREDICTOR.idFromName("season1"));
      const corsJson = /* @__PURE__ */ __name(async (res) => new Response(await res.text(), {
        status: res.status,
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" }
      }), "corsJson");
      if (request.method === "POST") {
        let payload;
        try {
          payload = await request.json();
        } catch (e) {
          return reply("Bad JSON", 400);
        }
        if (["settle", "lock", "reset", "seed", "schedule", "resettle", "recap"].includes(payload.op)) {
          const auth = request.headers.get("Authorization") || "";
          if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
        } else {
          const email = await env.LIVE.get("sess:" + String(payload.session || ""));
          if (!email) return reply("Sign in required", 401);
          payload.user = email;
          delete payload.session;
        }
        return corsJson(await stub.fetch(new Request("https://do/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })));
      }
      if (request.method === "GET") {
        const u = new URL(request.url);
        const op = path === "/predict/leaderboard" ? "leaderboard" : path === "/predict/consensus" ? "consensus" : path === "/predict/mine" ? "mine" : "";
        // SECURITY: derive the player from their SESSION server-side - never trust a ?user=
        // param, so nobody can read another player's prediction by guessing their email.
        let _u = "";
        const _s = u.searchParams.get("session") || "";
        if (_s) _u = await env.LIVE.get("sess:" + _s) || "";
        const qs = "?op=" + op + "&matchId=" + encodeURIComponent(u.searchParams.get("matchId") || "") + "&user=" + encodeURIComponent(_u);
        return corsJson(await stub.fetch(new Request("https://do/" + qs, { method: "GET" })));
      }
      return reply("Method not allowed", 405);
    }
    if (path === "/sponsor") {
      if (request.method !== "POST") return reply("Method not allowed", 405);
      let b;
      try {
        b = await request.json();
      } catch (e) {
        return reply("Bad JSON", 400);
      }
      const esc = /* @__PURE__ */ __name((s) => String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]), "esc");
      const name = String(b.name || "").trim().slice(0, 120);
      const company = String(b.company || "").trim().slice(0, 120);
      const email = String(b.email || "").trim().slice(0, 160);
      const budget = String(b.budget || "").trim().slice(0, 60);
      const message = String(b.message || "").trim().slice(0, 2e3);
      if (!name || !company || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply("Missing or invalid fields", 400);
      await env.LIVE.put("sponsor:" + Date.now() + ":" + email, JSON.stringify({ name, company, email, budget, message, ts: Date.now() }), { expirationTtl: 60 * 60 * 24 * 365 });
      if (env.RESEND_API_KEY) {
        const html = `<div style="font-family:system-ui,Arial,sans-serif;padding:20px;max-width:560px">
          <h2 style="margin:0 0 12px">New sponsor inquiry</h2>
          <p style="margin:4px 0"><b>Name:</b> ${esc(name)}</p>
          <p style="margin:4px 0"><b>Company:</b> ${esc(company)}</p>
          <p style="margin:4px 0"><b>Email:</b> ${esc(email)}</p>
          <p style="margin:4px 0"><b>Budget:</b> ${esc(budget) || "\u2014"}</p>
          <p style="margin:12px 0 4px"><b>Message:</b></p>
          <p style="margin:0;white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;color:#111">${esc(message) || "\u2014"}</p>
        </div>`;
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: env.NOTIFY_FROM || "FootyHub TV <onboarding@resend.dev>", to: [env.SPONSOR_TO || "contact@footyhub.tv"], reply_to: email, subject: `Sponsor inquiry - ${company}`, html })
          });
        } catch (e) {
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (path === "/push/subscribe") {
      if (request.method !== "POST") return reply("Method not allowed", 405);
      let sub;
      try {
        sub = await request.json();
      } catch (e) {
        return reply("Bad JSON", 400);
      }
      if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return reply("Bad subscription", 400);
      const id = String(sub.endpoint).slice(-100).replace(/[^a-zA-Z0-9_-]/g, "");
      await env.LIVE.put("push:" + id, JSON.stringify(sub), { expirationTtl: 60 * 60 * 24 * 120 });
      // link this device to the signed-in player so settled-match recaps can reach them
      if (sub.session) {
        const pemail = await env.LIVE.get("sess:" + String(sub.session));
        if (pemail) await env.LIVE.put("psub:" + pemail, id, { expirationTtl: 60 * 60 * 24 * 120 });
      }
      return reply("OK", 200);
    }
    if (path === "/push/send") {
      if (request.method !== "POST") return reply("Method not allowed", 405);
      const auth = request.headers.get("Authorization") || "";
      if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return reply("Bad JSON", 400);
      }
      const payload = JSON.stringify({ title: body.title || "FootyHub TV", body: body.body || "We are live now!", url: body.url || "https://footyhub.tv" });
      const list = await env.LIVE.list({ prefix: "push:" });
      let sent = 0, gone = 0;
      for (const k of list.keys) {
        const raw = await env.LIVE.get(k.name);
        if (!raw) continue;
        const st = await _sendPush(JSON.parse(raw), payload, env);
        if (st >= 200 && st < 300) sent++;
        else if (st === 404 || st === 410) {
          await env.LIVE.delete(k.name);
          gone++;
        }
      }
      return new Response(JSON.stringify({ ok: true, sent, gone, total: list.keys.length }), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (path === "/push/test") {
      if (request.method !== "POST") return reply("Method not allowed", 405);
      let sub;
      try {
        sub = await request.json();
      } catch (e) {
        return reply("Bad JSON", 400);
      }
      if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return reply("Bad subscription", 400);
      const payload = JSON.stringify({ title: "FootyHub TV - test alert", body: "It works! This is how we will alert you 10 minutes before kickoff and when we go live.", url: "https://footyhub.tv/#live" });
      const st = await _sendPush(sub, payload, env);
      return new Response(JSON.stringify({ ok: st >= 200 && st < 300, status: st }), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (request.method === "GET") {
      const data = await env.LIVE.get("live") || EMPTY;
      return new Response(data, {
        headers: {
          ...CORS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
        }
      });
    }
    if (request.method === "POST") {
      const auth = request.headers.get("Authorization") || "";
      if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
      const body = await request.text();
      try {
        JSON.parse(body);
      } catch (e) {
        return reply("Bad JSON", 400);
      }
      await env.LIVE.put("live", body);
      return reply("OK", 200);
    }
    return reply("Method not allowed", 405);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(_notifyTick(env));
    ctx.waitUntil(_liveScoresTick(env));
  }
};
var Poll = class {
  static {
    __name(this, "Poll");
  }
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  async _tally() {
    const c = await this.storage.get("counts") || { home: 0, draw: 0, away: 0 };
    const home = c.home || 0, draw = c.draw || 0, away = c.away || 0;
    return { home, draw, away, total: home + draw + away };
  }
  _json(o) {
    return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
  }
  async fetch(request) {
    if (request.method === "GET") return this._json(await this._tally());
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response("bad json", { status: 400 });
    }
    if (body.reset === true) {
      await this.storage.deleteAll();
      return this._json(await this._tally());
    }
    const option = String(body.option || "");
    const voter = String(body.voter || "").slice(0, 200);
    if (!["home", "draw", "away"].includes(option) || !voter) return new Response("bad vote", { status: 400 });
    const prev = await this.storage.get("v:" + voter);
    if (prev !== option) {
      const counts = await this.storage.get("counts") || { home: 0, draw: 0, away: 0 };
      if (prev && counts[prev] > 0) counts[prev]--;
      counts[option] = (counts[option] || 0) + 1;
      await this.storage.put("counts", counts);
      await this.storage.put("v:" + voter, option);
    }
    return this._json(await this._tally());
  }
};
var Likes = class {
  static {
    __name(this, "Likes");
  }
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  _json(o) {
    return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
  }
  async fetch(request) {
    if (request.method === "GET") return this._json(await this.storage.get("counts") || {});
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response("bad json", { status: 400 });
    }
    if (body.reset === true) {
      await this.storage.deleteAll();
      return this._json({});
    }
    const code = String(body.code || "").toLowerCase().replace(/[^a-z-]/g, "").slice(0, 12);
    const voter = String(body.voter || "").slice(0, 80);
    const like = body.action !== "unlike";
    if (!code || !voter) return new Response("bad", { status: 400 });
    const counts = await this.storage.get("counts") || {};
    const key = "l:" + voter + ":" + code;
    const has = await this.storage.get(key);
    if (like && !has) {
      counts[code] = (counts[code] || 0) + 1;
      await this.storage.put(key, 1);
      await this.storage.put("counts", counts);
    } else if (!like && has) {
      counts[code] = Math.max(0, (counts[code] || 0) - 1);
      await this.storage.delete(key);
      await this.storage.put("counts", counts);
    }
    return this._json({ code, count: counts[code] || 0, liked: like });
  }
};
function huid(s){let h=2166136261>>>0;s=String(s||"");for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
var Predictor = class {
  static {
    __name(this, "Predictor");
  }
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  _json(o) {
    return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
  }
  _score(ph, pa, ah, aa) {
    if (ph === ah && pa === aa) return 3;
    const sgn = /* @__PURE__ */ __name((x) => x > 0 ? 1 : x < 0 ? -1 : 0, "sgn");
    if (sgn(ph - pa) === sgn(ah - aa)) return 1;
    return 0;
  }
  _cmp(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    if (b.exacts !== a.exacts) return b.exacts - a.exacts;
    if (b.played !== a.played) return b.played - a.played;
    return (a.joined || 0) - (b.joined || 0);
  }
  async _board() {
    const list = await this.storage.list({ prefix: "stats:" });
    const rows = [];
    for (const [k, v] of list) rows.push({
      user: k.slice(6),
      uid: huid(k.slice(6)),
      name: v.name || "Guest",
      points: v.points || 0,
      exacts: v.exacts || 0,
      played: v.played || 0,
      streak: v.streak || 0,
      best: v.best || 0,
      refs: v.refs || 0,
      joined: v.joined || 0
    });
    const ranked = rows.filter((r) => (r.played || 0) > 0);   // a "player" = someone who has predicted (no sign-in-only 0-pt rows)
    ranked.sort((a, b) => this._cmp(a, b));
    return ranked;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const op2 = url.searchParams.get("op") || "";
      if (op2 === "leaderboard") {
        const rows = await this._board();
        const cap = url.searchParams.get("full") === "1" ? 2e3 : 50;
        return this._json({
          leaderboard: rows.slice(0, cap).map((r, i) => ({ rank: i + 1, user: r.uid, name: r.name, points: r.points, exacts: r.exacts })),
          players: rows.length
        });
      }
      if (op2 === "consensus") {
        const mId = url.searchParams.get("matchId") || "";
        const list = mId ? await this.storage.list({ prefix: `pred:${mId}:` }) : /* @__PURE__ */ new Map();
        let n = 0, home = 0, draw = 0, away = 0;
        const scores = {};
        for (const [, p] of list) {
          if (!Number.isFinite(p.ph) || !Number.isFinite(p.pa)) continue;
          n++;
          const k = p.ph + "-" + p.pa;
          scores[k] = (scores[k] || 0) + 1;
          if (p.ph > p.pa) home++;
          else if (p.ph < p.pa) away++;
          else draw++;
        }
        let top = null, topc = 0;
        for (const s in scores) if (scores[s] > topc) {
          topc = scores[s];
          top = s;
        }
        return this._json({
          matchId: mId, total: n,
          pctHome: n ? Math.round(home * 100 / n) : 0,
          pctDraw: n ? Math.round(draw * 100 / n) : 0,
          pctAway: n ? Math.round(away * 100 / n) : 0,
          topScore: n >= 3 || topc >= 2 ? top : null, topScoreCount: n >= 3 || topc >= 2 ? topc : 0
        });
      }
      if (op2 === "mine") {
        const u = url.searchParams.get("user") || "";
        const st = u ? await this.storage.get("stats:" + u) || {} : {};
        const ids = Array.isArray(st.matches) ? st.matches.slice(-40).reverse() : [];
        const mine = [];
        for (const mid of ids) {
          const p = await this.storage.get(`pred:${mid}:${u}`);
          if (!p) continue;
          const res = await this.storage.get(`result:${mid}`);
          const settled = !!(res && res.settled);
          mine.push({ matchId: mid, ph: p.ph, pa: p.pa, ah: settled ? res.ah : null, aa: settled ? res.aa : null, pts: settled ? this._score(p.ph, p.pa, res.ah, res.aa) : null, settled });
        }
        return this._json({ mine });
      }
      const matchId2 = url.searchParams.get("matchId") || "";
      const user2 = url.searchParams.get("user") || "";
      const prediction = matchId2 && user2 ? await this.storage.get(`pred:${matchId2}:${user2}`) || null : null;
      const result = matchId2 ? await this.storage.get(`result:${matchId2}`) || null : null;
      const kick = matchId2 ? await this.storage.get("kick:" + matchId2) : null;
      let points = null;
      if (prediction && result && result.settled) points = this._score(prediction.ph, prediction.pa, result.ah, result.aa);
      let rank = null, players = 0, me = null;
      if (user2) {
        const rows = await this._board();
        players = rows.length;
        const i = rows.findIndex((r) => r.user === user2);
        if (i >= 0) {
          rank = i + 1;
          me = { points: rows[i].points, exacts: rows[i].exacts, played: rows[i].played, name: rows[i].name, streak: rows[i].streak, best: rows[i].best, refs: rows[i].refs };
        }
      }
      return this._json({ matchId: matchId2, prediction, result, points, locked: !!result || !!(kick && Date.now() >= kick), kickoff: kick || null, rank, players, me });
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response("bad json", { status: 400 });
    }
    const op = body.op || "";
    if (op === "reset") {
      await this.storage.deleteAll();
      return this._json({ ok: true, reset: true });
    }
    if (op === "seed") {
      const arr = Array.isArray(body.players) ? body.players : [];
      let n = 0;
      for (const p of arr) {
        const name2 = String(p.name || "Player").slice(0, 20);
        const user2 = String(p.user || "seed:" + name2.toLowerCase()).slice(0, 200);
        await this.storage.put("stats:" + user2, {
          points: p.points || 0,
          exacts: p.exacts || 0,
          played: p.played || 0,
          joined: p.joined || 17e11 + n,
          name: name2
        });
        await this.storage.put("uname:" + name2.toLowerCase(), user2);
        n++;
      }
      return this._json({ ok: true, seeded: n });
    }
    if (op === "setname") {
      const user2 = String(body.user || "").slice(0, 200);
      const name2 = String(body.name || "").trim().slice(0, 20);
      if (!user2 || name2.length < 3) return this._json({ ok: false, error: "short" });
      if (!/^[a-zA-Z0-9_\- ]+$/.test(name2)) return this._json({ ok: false, error: "invalid" });
      if (badName(name2)) return this._json({ ok: false, error: "blocked" });
      const lower = name2.toLowerCase();
      const owner = await this.storage.get("uname:" + lower);
      if (owner && owner !== user2) return this._json({ ok: false, error: "taken" });
      const st2 = await this.storage.get("stats:" + user2) || { points: 0, exacts: 0, played: 0, joined: Date.now(), name: name2 };
      if (st2.name && st2.name.toLowerCase() !== lower) await this.storage.delete("uname:" + st2.name.toLowerCase());
      st2.name = name2;
      if (body.over18) {
        st2.over18 = true;
        if (!st2.eligTs) st2.eligTs = Date.now();
      }
      await this.storage.put("stats:" + user2, st2);
      await this.storage.put("uname:" + lower, user2);
      return this._json({ ok: true, name: name2 });
    }
    if (op === "schedule") {
      const map = body.map || {};
      let n = 0;
      for (const k in map) {
        if (map[k]) {
          await this.storage.put("kick:" + k, map[k]);
          n++;
        }
      }
      return this._json({ ok: true, scheduled: n });
    }
    if (op === "lock") {
      const matchId2 = String(body.matchId || "");
      if (!matchId2) return new Response("bad", { status: 400 });
      const ex = await this.storage.get(`result:${matchId2}`);
      if (!ex) await this.storage.put(`result:${matchId2}`, { locked: true });
      return this._json({ ok: true });
    }
    if (op === "resettle") {
      const matchId2 = String(body.matchId || "");
      const ah = parseInt(body.ah), aa = parseInt(body.aa);
      if (!matchId2 || isNaN(ah) || isNaN(aa)) return new Response("bad", { status: 400 });
      const prev = await this.storage.get(`result:${matchId2}`);
      const list = await this.storage.list({ prefix: `pred:${matchId2}:` });
      let n = 0;
      for (const [k, pred] of list) {
        const user2 = k.slice(`pred:${matchId2}:`.length);
        const oldPts = prev && prev.settled ? this._score(pred.ph, pred.pa, prev.ah, prev.aa) : 0;
        const newPts = this._score(pred.ph, pred.pa, ah, aa);
        if (newPts !== oldPts) {
          const st2 = await this.storage.get("stats:" + user2) || { points: 0, exacts: 0, played: 0, joined: 0, name: "Guest" };
          st2.points = Math.max(0, (st2.points || 0) + (newPts - oldPts));
          const dExact = (newPts === 3 ? 1 : 0) - (oldPts === 3 ? 1 : 0);
          st2.exacts = Math.max(0, (st2.exacts || 0) + dExact);
          await this.storage.put("stats:" + user2, st2);
        }
        n++;
      }
      await this.storage.put(`result:${matchId2}`, { ah, aa, settled: true });
      return this._json({ ok: true, resettled: n });
    }
    if (op === "recap") {
      const matchId2 = String(body.matchId || "");
      const result = await this.storage.get(`result:${matchId2}`);
      if (!result || !result.settled) return this._json({ ok: true, skip: true });
      if (await this.storage.get(`recapped:${matchId2}`)) return this._json({ ok: true, already: true });
      await this.storage.put(`recapped:${matchId2}`, true);
      const board = await this._board();
      const rankOf = {};
      board.forEach((r, i) => {
        rankOf[r.user] = i + 1;
      });
      const preds = await this.storage.list({ prefix: `pred:${matchId2}:` });
      const recaps = [];
      for (const [k, p] of preds) {
        const u = k.slice(`pred:${matchId2}:`.length);
        recaps.push({ user: u, ph: p.ph, pa: p.pa, pts: this._score(p.ph, p.pa, result.ah, result.aa), rank: rankOf[u] || null });
      }
      return this._json({ ok: true, ah: result.ah, aa: result.aa, players: board.length, recaps });
    }
    if (op === "settle") {
      const matchId2 = String(body.matchId || "");
      const ah = parseInt(body.ah), aa = parseInt(body.aa);
      if (!matchId2 || isNaN(ah) || isNaN(aa)) return new Response("bad", { status: 400 });
      const ex = await this.storage.get(`result:${matchId2}`);
      if (ex && ex.settled) return this._json({ ok: true, already: true });
      const list = await this.storage.list({ prefix: `pred:${matchId2}:` });
      let n = 0;
      for (const [k, pred] of list) {
        const user2 = k.slice(`pred:${matchId2}:`.length);
        const pts = this._score(pred.ph, pred.pa, ah, aa);
        const st2 = await this.storage.get("stats:" + user2) || { points: 0, exacts: 0, played: 0, joined: 0, name: "Guest" };
        st2.points = (st2.points || 0) + pts;
        if (pts === 3) st2.exacts = (st2.exacts || 0) + 1;
        await this.storage.put("stats:" + user2, st2);
        n++;
      }
      await this.storage.put(`result:${matchId2}`, { ah, aa, settled: true });
      return this._json({ ok: true, settled: n });
    }
    const matchId = String(body.matchId || "");
    const user = String(body.user || "").slice(0, 200);
    const name = String(body.name || "").slice(0, 40);
    const ph = parseInt(body.ph), pa = parseInt(body.pa);
    if (!matchId || !user || isNaN(ph) || isNaN(pa) || ph < 0 || pa < 0 || ph > 99 || pa > 99) return new Response("bad", { status: 400 });
    const kick = await this.storage.get("kick:" + matchId);
    if (kick && Date.now() >= kick) return new Response("kicked off", { status: 409 });
    if (await this.storage.get(`result:${matchId}`)) return new Response("locked", { status: 409 });
    const existed = await this.storage.get(`pred:${matchId}:${user}`);
    await this.storage.put(`pred:${matchId}:${user}`, { ph, pa });
    const st = await this.storage.get("stats:" + user) || { points: 0, exacts: 0, played: 0, joined: Date.now(), name: name || "Player" };
    if (!existed) {
      st.played = (st.played || 0) + 1;
      if (!Array.isArray(st.matches)) st.matches = [];
      st.matches.push(matchId);
      if (st.matches.length > 80) st.matches = st.matches.slice(-80);
    }
    if (!st.joined) st.joined = Date.now();
    const _day = Math.floor(Date.now() / 864e5);
    if (st.lastDay === void 0) st.streak = 1;
    else if (st.lastDay === _day - 1) st.streak = (st.streak || 0) + 1;
    else if (st.lastDay !== _day) st.streak = 1;
    st.lastDay = _day;
    if ((st.best || 0) < (st.streak || 0)) st.best = st.streak;
    if (body.ref && !st.refBy) {
      const _ref = String(body.ref).toLowerCase().replace(/[^a-z0-9_\- ]/g, "").trim().slice(0, 20);
      const refOwner = _ref ? await this.storage.get("uname:" + _ref) : null;
      if (refOwner && refOwner !== user) {
        const rst = await this.storage.get("stats:" + refOwner);
        if (rst) {
          rst.refs = (rst.refs || 0) + 1;
          await this.storage.put("stats:" + refOwner, rst);
          st.refBy = _ref;
        }
      }
    }
    await this.storage.put("stats:" + user, st);
    return this._json({ ok: true, prediction: { ph, pa }, streak: st.streak || 1 });
  }
};
export {
  Likes,
  Poll,
  Predictor,
  worker_default as default
};
//# sourceMappingURL=worker.js.map