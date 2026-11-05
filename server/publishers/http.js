const NAMES = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Replace every secret in a message with *** (error text can echo request details). */
function redact(text, secrets = []) {
  let t = String(text);
  for (const s of secrets) if (s) t = t.split(s).join('***');
  return t;
}

/**
 * fetch + JSON parse + uniform errors: "<Platform>: <API message> (HTTP n)".
 * TikTok reports errors as { error: { code != 'ok', message } }, Meta as { error: { message } }
 * or { debug_info: { message } } on its upload host.
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
  const apiError =
    (body && body.error && body.error.code !== 'ok' && (body.error.message || body.error.code)) ||
    (body && body.debug_info && body.debug_info.message);
  if (!res.ok || apiError) {
    const why = apiError || text.slice(0, 300) || 'no details';
    throw new Error(redact(`${NAMES[platform]}: ${why} (HTTP ${res.status})`, secrets));
  }
  return { status: res.status, body: body || {} };
}

const wait = (ctx, ms) => (ctx.sleep || sleep)(ms);

module.exports = { request, redact, wait, NAMES };
