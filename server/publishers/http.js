const NAMES = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Replace every secret in a message with *** (error text can echo request details). */
function redact(text, secrets = []) {
  let t = String(text);
  for (const s of secrets) if (s) t = t.split(s).join('***');
  return t;
}

/**
 * An error for a platform that is not set up. `config` tells the publish flow that this is not the video's
 * fault, so it does not use up one of the video's publish attempts.
 */
const notConnected = (message) => Object.assign(new Error(message), { config: true });

/**
 * fetch + JSON parse + uniform errors: "<Platform>: <API message> (HTTP n)".
 * TikTok reports errors as { error: { code != 'ok', message } }, Meta as { error: { message } }
 * or { debug_info: { message } } on its upload host, OAuth endpoints as { error: 'code', error_description }.
 * A rejected sign-in (HTTP 401, TikTok access_token_invalid, Meta code 190) sets `auth` on the error.
 */
async function request(ctx, platform, url, opts = {}, secrets = []) {
  const res = await (ctx.fetch || globalThis.fetch)(url, opts);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const err = body && body.error;
  const apiError =
    (typeof err === 'string' && (body.error_description || err)) ||
    (err && err.code !== 'ok' && (err.message || err.code)) ||
    (body && body.debug_info && body.debug_info.message);
  if (!res.ok || apiError) {
    const why = apiError || text.slice(0, 300) || 'no details';
    const e = new Error(redact(`${NAMES[platform]}: ${why} (HTTP ${res.status})`, secrets));
    if (res.status === 401 || (err && (err.code === 190 || err.code === 'access_token_invalid'))) e.auth = true;
    throw e;
  }
  return { status: res.status, body: body || {} };
}

const wait = (ctx, ms) => (ctx.sleep || sleep)(ms);

module.exports = { request, redact, wait, notConnected, NAMES };
