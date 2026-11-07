// One shared dashboard password (DASHBOARD_PASSWORD) with a signed session cookie. No password set: no login,
// as before (the dashboard then listens on this PC only). The OAuth return pages are NOT open: Google and
// TikTok send the browser back with its cookie (SameSite=Lax allows that), so a visitor without a session can
// reach nothing but the login page.

const crypto = require('crypto');

const COOKIE = 'studio_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 5; // wrong passwords per address before it is locked out
const LOCK_MS = 15 * 60 * 1000;
const MIN_LENGTH = 8;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const hmac = (key, s) => crypto.createHmac('sha256', key).update(String(s)).digest('hex');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Only an on-site path may follow a login (never another site, never the login page itself). */
function safeNext(value) {
  const next = typeof value === 'string' ? value : '';
  return /^\/(?![/\\])[^\r\n]*$/.test(next) && !/^\/login(\?|$)/.test(next) ? next : '/';
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function loginPage({ next, error }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · Automation Studio</title>
<style>
:root{color-scheme:light dark;--bg:#f4f5f7;--card:#fff;--ink:#16191f;--muted:#5d6572;--line:#d5d9e0;--accent:#3b5bdb;--bad:#c92a2a}
@media (prefers-color-scheme:dark){:root{--bg:#12151a;--card:#1b1f27;--ink:#e8eaee;--muted:#9aa3b0;--line:#2e3440;--accent:#7c93ff;--bad:#ff8787}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
form{width:min(360px,calc(100vw - 32px));background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px 24px;display:grid;gap:14px}
h1{margin:0;font-size:20px}p{margin:0;color:var(--muted);font-size:14px}
label{font-size:14px;font-weight:600;display:grid;gap:6px}
input[type=password]{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}
input[type=password]:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button{font:inherit;font-weight:600;padding:10px 14px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.err{color:var(--bad);font-size:14px}
</style></head><body>
<form method="post" action="/login">
<h1>Automation Studio</h1>
<p>Enter the dashboard password.</p>
<input type="hidden" name="next" value="${esc(next)}">
<label>Password<input type="password" name="password" autocomplete="current-password" autofocus required></label>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
<button type="submit">Sign in</button>
</form></body></html>`;
}

/**
 * Returns null without a password, else { routes(app), gate }:
 *  - routes: GET/POST /login and POST /logout (register before the gate);
 *  - gate: lets signed-in requests through; /api gets 401, a page gets sent to /login (and back afterwards).
 */
function createAuth({ password, secureCookies = false, now = Date.now }) {
  const pw = String(password || '');
  if (!pw) return null;
  if (pw.length < MIN_LENGTH) throw new Error(`DASHBOARD_PASSWORD must be at least ${MIN_LENGTH} characters`);

  const key = crypto.createHmac('sha256', pw).update('studio-dashboard-session-v1').digest(); // a new password ends every session
  const issue = () => {
    const exp = now() + SESSION_MS;
    return `${exp}.${hmac(key, exp)}`;
  };
  const valid = (token) => {
    const [exp, sig] = String(token || '').split('.');
    if (!/^\d+$/.test(exp || '') || !sig || Number(exp) < now()) return false;
    const want = Buffer.from(hmac(key, exp));
    const got = Buffer.from(sig);
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  };
  const cookieAttrs = `Path=/; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`;
  const signedIn = (req) => valid(readCookie(req.headers.cookie, COOKIE));

  const fails = new Map(); // address -> { n, until }
  const locked = (ip) => {
    const f = fails.get(ip);
    if (!f) return false;
    if (f.until && f.until > now()) return true;
    if (f.until) fails.delete(ip);
    return false;
  };
  const failed = (ip) => {
    const f = fails.get(ip) || { n: 0, until: 0 };
    f.n += 1;
    if (f.n >= MAX_FAILS) {
      f.until = now() + LOCK_MS;
      f.n = 0;
    }
    fails.set(ip, f);
  };

  const noCache = (res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  };

  function routes(app) {
    const express = require('express');
    app.get('/login', (req, res) => {
      noCache(res);
      if (signedIn(req)) return res.redirect(safeNext(req.query.next));
      res.type('html').send(loginPage({ next: safeNext(req.query.next) }));
    });

    app.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
      noCache(res);
      const next = safeNext(req.body && req.body.next);
      if (locked(req.ip)) return res.status(429).type('html').send(loginPage({ next, error: 'Too many wrong passwords. Try again in 15 minutes.' }));
      const given = String((req.body && req.body.password) || '');
      if (crypto.timingSafeEqual(sha256(given), sha256(pw))) {
        fails.delete(req.ip);
        res.set('Set-Cookie', `${COOKIE}=${issue()}; Max-Age=${Math.floor(SESSION_MS / 1000)}; ${cookieAttrs}`);
        return res.redirect(next);
      }
      failed(req.ip);
      await new Promise((r) => setTimeout(r, 400)); // slows guessing
      res.status(401).type('html').send(loginPage({ next, error: 'Wrong password.' }));
    });

    app.post('/logout', (req, res) => {
      noCache(res);
      res.set('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieAttrs}`);
      res.json({ ok: true });
    });
  }

  function gate(req, res, next) {
    if (signedIn(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sign in required' });
    if (req.method === 'GET') return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    res.status(401).type('text').send('Sign in required');
  }

  return { routes, gate, signedIn };
}

module.exports = { createAuth, safeNext, MIN_LENGTH, COOKIE };
