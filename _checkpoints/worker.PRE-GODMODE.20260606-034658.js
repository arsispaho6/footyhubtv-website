// FootyHub TV edge Worker — routed by path:
//   /          live.json   (GET = no-cache read · POST w/ secret = write)
//   /notify    email capture (POST {email,match} = store + send confirmation · GET w/ secret = list)
// State in KV (binding LIVE). Write secret in WRITE_SECRET.
// Email sending via Resend: set secrets RESEND_API_KEY (+ optional NOTIFY_FROM).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const EMPTY = '{"is_live":false,"phase":"pre"}';
const okEmail = (e) =>
  typeof e === "string" && e.length < 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const _BAD = ["fuck", "shit", "cunt", "nigger", "faggot", "bitch", "asshole", "dick", "pussy", "rape", "nazi", "hitler", "slut", "whore"];
const badName = (s) => { const t = String(s).toLowerCase().replace(/[^a-z]/g, ""); return _BAD.some((w) => t.includes(w)); };

function reply(msg, status) {
  return new Response(msg, { status, headers: { ...CORS, "Content-Type": "text/plain" } });
}

function confirmHtml(match) {
  const line = match ? `We'll email you before kickoff of <b>${match}</b>.` : `We'll email you before kickoff.`;
  return `<div style="font-family:system-ui,Arial,sans-serif;background:#000;color:#fff;padding:36px 28px;border-radius:16px;max-width:520px;margin:0 auto;text-align:center">
    <img src="https://footyhub-live.footyhubtv.workers.dev/logo.png" alt="FootyHub TV" width="200" style="display:block;margin:0 auto 22px;max-width:200px;height:auto">
    <h1 style="font-size:21px;margin:0 0 10px;color:#fff">You're on the list 🟣</h1>
    <p style="color:#cbb9ff;line-height:1.6;margin:0 0 14px;font-size:15px">${line}</p>
    <p style="color:#9d8bbf;font-size:13px;line-height:1.6;margin:0">Live AI football — LIA on the call, Victor on the analysis, a fan for every nation.<br>See you at the Mundial 2026 opener.</p>
    <p style="color:#5e5278;font-size:11px;margin-top:24px">You signed up at footyhub.tv · Entertainment only · 18+</p>
  </div>`;
}

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
        subject: "You're on the list — FootyHub TV 🟣",
        html: confirmHtml(match),
      }),
    });
  } catch (e) { /* best-effort */ }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const path = new URL(request.url).pathname;

    // ── Logo (served from KV, for email + anywhere) ──
    if (path === "/logo.png") {
      const img = await env.LIVE.get("logo", { type: "arrayBuffer" });
      if (!img) return reply("Not found", 404);
      return new Response(img, {
        headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }

    // ── Email capture ──
    if (path === "/notify") {
      if (request.method === "POST") {
        let body;
        try { body = await request.json(); } catch (e) { return reply("Bad JSON", 400); }
        const email = String(body.email || "").trim().toLowerCase();
        if (!okEmail(email)) return reply("Bad email", 400);
        const match = String(body.match || "").slice(0, 120);
        await env.LIVE.put("notify:" + email, JSON.stringify({ email, match, ts: Date.now() }));
        ctx.waitUntil(sendConfirmation(env, email, match)); // send after responding
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
          headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      return reply("Method not allowed", 405);
    }

    // ── Google Sign-In: verify the ID token server-side, store the user ──
    if (path === "/auth") {
      if (request.method !== "POST") return reply("Method not allowed", 405);
      let body;
      try { body = await request.json(); } catch (e) { return reply("Bad JSON", 400); }
      const cred = String(body.credential || "");
      if (!cred) return reply("No credential", 400);
      let info;
      try {
        const tr = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
        if (!tr.ok) return reply("Invalid token", 401);
        info = await tr.json();
      } catch (e) { return reply("Verify failed", 401); }
      if (info.aud !== env.GOOGLE_CLIENT_ID) return reply("Wrong audience", 401);
      if (info.email_verified !== "true" && info.email_verified !== true) return reply("Email not verified", 401);
      const user = { email: String(info.email).toLowerCase(), name: info.name || "", picture: info.picture || "", ts: Date.now() };
      await env.LIVE.put("user:" + user.email, JSON.stringify(user));
      // issue a server session token (the ONLY thing trusted for writes — closes impersonation/Sybil)
      const session = crypto.randomUUID();
      await env.LIVE.put("sess:" + session, user.email, { expirationTtl: 60 * 60 * 24 * 30 });
      return new Response(
        JSON.stringify({ email: user.email, name: user.name, picture: user.picture, session }),
        { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    // ── Fan poll (1X2): GET ?id=<pollId> → tallies · POST {id,option,voter} → vote.
    // Backed by a Durable Object (atomic counts — accurate, instant, no lost/stale votes). ──
    if (path === "/poll") {
      const cleanId = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60);
      let pollId, payload = null;
      if (request.method === "GET") {
        pollId = cleanId(new URL(request.url).searchParams.get("id"));
      } else if (request.method === "POST") {
        try { payload = await request.json(); } catch (e) { return reply("Bad JSON", 400); }
        pollId = cleanId(payload.id);
      } else {
        return reply("Method not allowed", 405);
      }
      if (!pollId) return reply("Bad id", 400);
      const wantReset = request.method === "POST" && payload && payload.reset === true;
      if (wantReset) {  // reset requires the write secret
        const auth = request.headers.get("Authorization") || "";
        if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
      }
      const stub = env.POLL.get(env.POLL.idFromName(pollId));
      const doReq = new Request("https://do/", {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: request.method === "POST" ? JSON.stringify({ option: payload.option, voter: payload.voter, reset: wantReset }) : undefined,
      });
      const res = await stub.fetch(doReq);
      return new Response(await res.text(), {
        status: res.status,
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // ── Predictor game + season leaderboard (Durable Object, atomic) ──
    if (path === "/predict" || path === "/predict/leaderboard") {
      const stub = env.PREDICTOR.get(env.PREDICTOR.idFromName("season1"));
      const corsJson = async (res) => new Response(await res.text(), {
        status: res.status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
      if (request.method === "POST") {
        let payload;
        try { payload = await request.json(); } catch (e) { return reply("Bad JSON", 400); }
        if (["settle", "lock", "reset", "seed", "schedule"].includes(payload.op)) {   // engine/admin-only, needs the secret
          const auth = request.headers.get("Authorization") || "";
          if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
        } else {   // predict / setname: require a valid session; derive the user from it (never trust the client's email)
          const email = await env.LIVE.get("sess:" + String(payload.session || ""));
          if (!email) return reply("Sign in required", 401);
          payload.user = email;
          delete payload.session;
        }
        return corsJson(await stub.fetch(new Request("https://do/", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })));
      }
      if (request.method === "GET") {
        const u = new URL(request.url);
        const op = path === "/predict/leaderboard" ? "leaderboard" : "";
        const qs = "?op=" + op + "&matchId=" + encodeURIComponent(u.searchParams.get("matchId") || "") +
          "&user=" + encodeURIComponent(u.searchParams.get("user") || "");
        return corsJson(await stub.fetch(new Request("https://do/" + qs, { method: "GET" })));
      }
      return reply("Method not allowed", 405);
    }

    // ── live.json ──
    if (request.method === "GET") {
      const data = (await env.LIVE.get("live")) || EMPTY;
      return new Response(data, {
        headers: {
          ...CORS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      });
    }
    if (request.method === "POST") {
      const auth = request.headers.get("Authorization") || "";
      if (!env.WRITE_SECRET || auth !== `Bearer ${env.WRITE_SECRET}`) return reply("Unauthorized", 401);
      const body = await request.text();
      try { JSON.parse(body); } catch (e) { return reply("Bad JSON", 400); }
      await env.LIVE.put("live", body);
      return reply("OK", 200);
    }
    return reply("Method not allowed", 405);
  },
};

// ── Durable Object: one instance per poll id, atomic vote counts ──
export class Poll {
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  async _tally() {
    const c = (await this.storage.get("counts")) || { home: 0, draw: 0, away: 0 };
    const home = c.home || 0, draw = c.draw || 0, away = c.away || 0;
    return { home, draw, away, total: home + draw + away };
  }
  _json(o) {
    return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
  }
  async fetch(request) {
    if (request.method === "GET") return this._json(await this._tally());
    let body;
    try { body = await request.json(); } catch (e) { return new Response("bad json", { status: 400 }); }
    if (body.reset === true) { await this.storage.deleteAll(); return this._json(await this._tally()); }
    const option = String(body.option || "");
    const voter = String(body.voter || "").slice(0, 200);
    if (!["home", "draw", "away"].includes(option) || !voter) return new Response("bad vote", { status: 400 });
    const prev = await this.storage.get("v:" + voter);  // one vote per voter (change allowed)
    if (prev !== option) {
      const counts = (await this.storage.get("counts")) || { home: 0, draw: 0, away: 0 };
      if (prev && counts[prev] > 0) counts[prev]--;
      counts[option] = (counts[option] || 0) + 1;
      await this.storage.put("counts", counts);
      await this.storage.put("v:" + voter, option);
    }
    return this._json(await this._tally());
  }
}

// ── Durable Object: predictor game + tie-broken season leaderboard ──
export class Predictor {
  constructor(ctx) { this.storage = ctx.storage; }
  _json(o) { return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } }); }
  _score(ph, pa, ah, aa) {
    if (ph === ah && pa === aa) return 3;                       // exact score
    const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
    if (sgn(ph - pa) === sgn(ah - aa)) return 1;                // right winner / draw
    return 0;
  }
  _cmp(a, b) {                                                  // sort: best player first
    if (b.points !== a.points) return b.points - a.points;
    if (b.exacts !== a.exacts) return b.exacts - a.exacts;      // tie-break 1: most exact scores
    if (b.played !== a.played) return b.played - a.played;      // tie-break 2: most matches played
    return (a.joined || 0) - (b.joined || 0);                   // tie-break 3: joined earlier
  }
  async _board() {
    const list = await this.storage.list({ prefix: "stats:" });
    const rows = [];
    for (const [k, v] of list) rows.push({
      user: k.slice(6), name: v.name || "Guest",
      points: v.points || 0, exacts: v.exacts || 0, played: v.played || 0, joined: v.joined || 0,
    });
    rows.sort((a, b) => this._cmp(a, b));
    return rows;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const op = url.searchParams.get("op") || "";
      if (op === "leaderboard") {
        const rows = await this._board();
        const cap = url.searchParams.get("full") === "1" ? 2000 : 50;
        return this._json({
          leaderboard: rows.slice(0, cap).map((r, i) => ({ rank: i + 1, user: r.user, name: r.name, points: r.points, exacts: r.exacts })),
          players: rows.length,
        });
      }
      const matchId = url.searchParams.get("matchId") || "";
      const user = url.searchParams.get("user") || "";
      const prediction = (matchId && user) ? (await this.storage.get(`pred:${matchId}:${user}`)) || null : null;
      const result = matchId ? (await this.storage.get(`result:${matchId}`)) || null : null;
      let points = null;
      if (prediction && result && result.settled) points = this._score(prediction.ph, prediction.pa, result.ah, result.aa);
      let rank = null, players = 0, me = null;
      if (user) {
        const rows = await this._board();
        players = rows.length;
        const i = rows.findIndex((r) => r.user === user);
        if (i >= 0) { rank = i + 1; me = { points: rows[i].points, exacts: rows[i].exacts, played: rows[i].played, name: rows[i].name }; }
      }
      return this._json({ matchId, prediction, result, points, locked: !!result, rank, players, me });
    }
    let body;
    try { body = await request.json(); } catch (e) { return new Response("bad json", { status: 400 }); }
    const op = body.op || "";
    if (op === "reset") { await this.storage.deleteAll(); return this._json({ ok: true, reset: true }); }
    if (op === "seed") {                                          // admin/demo: write fake players directly
      const arr = Array.isArray(body.players) ? body.players : [];
      let n = 0;
      for (const p of arr) {
        const name = String(p.name || "Player").slice(0, 20);
        const user = String(p.user || "seed:" + name.toLowerCase()).slice(0, 200);
        await this.storage.put("stats:" + user, {
          points: p.points || 0, exacts: p.exacts || 0, played: p.played || 0,
          joined: p.joined || (1700000000000 + n), name,
        });
        await this.storage.put("uname:" + name.toLowerCase(), user);
        n++;
      }
      return this._json({ ok: true, seeded: n });
    }
    if (op === "setname") {                                       // pick / change a unique username
      const user = String(body.user || "").slice(0, 200);
      const name = String(body.name || "").trim().slice(0, 20);
      if (!user || name.length < 3) return this._json({ ok: false, error: "short" });
      if (!/^[a-zA-Z0-9_\- ]+$/.test(name)) return this._json({ ok: false, error: "invalid" });
      if (badName(name)) return this._json({ ok: false, error: "blocked" });
      const lower = name.toLowerCase();
      const owner = await this.storage.get("uname:" + lower);
      if (owner && owner !== user) return this._json({ ok: false, error: "taken" });
      const st = (await this.storage.get("stats:" + user)) || { points: 0, exacts: 0, played: 0, joined: Date.now(), name };
      if (st.name && st.name.toLowerCase() !== lower) await this.storage.delete("uname:" + st.name.toLowerCase());
      st.name = name;
      await this.storage.put("stats:" + user, st);
      await this.storage.put("uname:" + lower, user);
      return this._json({ ok: true, name });
    }
    if (op === "schedule") {                                      // store kickoff times (ms) per matchId
      const map = body.map || {};
      let n = 0;
      for (const k in map) { if (map[k]) { await this.storage.put("kick:" + k, map[k]); n++; } }
      return this._json({ ok: true, scheduled: n });
    }
    if (op === "lock") {
      const matchId = String(body.matchId || "");
      if (!matchId) return new Response("bad", { status: 400 });
      const ex = await this.storage.get(`result:${matchId}`);
      if (!ex) await this.storage.put(`result:${matchId}`, { locked: true });
      return this._json({ ok: true });
    }
    if (op === "settle") {
      const matchId = String(body.matchId || "");
      const ah = parseInt(body.ah), aa = parseInt(body.aa);
      if (!matchId || isNaN(ah) || isNaN(aa)) return new Response("bad", { status: 400 });
      const ex = await this.storage.get(`result:${matchId}`);
      if (ex && ex.settled) return this._json({ ok: true, already: true });
      const list = await this.storage.list({ prefix: `pred:${matchId}:` });
      let n = 0;
      for (const [k, pred] of list) {
        const user = k.slice((`pred:${matchId}:`).length);
        const pts = this._score(pred.ph, pred.pa, ah, aa);
        const st = (await this.storage.get("stats:" + user)) || { points: 0, exacts: 0, played: 0, joined: 0, name: "Guest" };
        st.points = (st.points || 0) + pts;
        if (pts === 3) st.exacts = (st.exacts || 0) + 1;
        await this.storage.put("stats:" + user, st);
        n++;
      }
      await this.storage.put(`result:${matchId}`, { ah, aa, settled: true });
      return this._json({ ok: true, settled: n });
    }
    // submit a prediction (locked once the match has a result/lock)
    const matchId = String(body.matchId || "");
    const user = String(body.user || "").slice(0, 200);
    const name = String(body.name || "").slice(0, 40);
    const ph = parseInt(body.ph), pa = parseInt(body.pa);
    if (!matchId || !user || isNaN(ph) || isNaN(pa) || ph < 0 || pa < 0 || ph > 99 || pa > 99) return new Response("bad", { status: 400 });
    const kick = await this.storage.get("kick:" + matchId);
    if (kick && Date.now() >= kick) return new Response("kicked off", { status: 409 });   // server-side kickoff lock
    if (await this.storage.get(`result:${matchId}`)) return new Response("locked", { status: 409 });
    const existed = await this.storage.get(`pred:${matchId}:${user}`);
    await this.storage.put(`pred:${matchId}:${user}`, { ph, pa });
    const st = (await this.storage.get("stats:" + user)) || { points: 0, exacts: 0, played: 0, joined: Date.now(), name: name || "Player" };
    if (!existed) st.played = (st.played || 0) + 1;
    if (!st.joined) st.joined = Date.now();
    await this.storage.put("stats:" + user, st);   // username is set only via op=setname
    return this._json({ ok: true, prediction: { ph, pa } });
  }
}
