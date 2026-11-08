const settings = require('./settings');
const brands = require('./brands');

const n = (x) => Number(x || 0).toLocaleString('en-US');
const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook'];
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * "Test" buttons in Integrations. Returns { ok, detail }; never includes a key in the detail.
 * A platform is tested with one brand's own accounts (brandId required, 400 without it); the shared keys need none.
 */
async function testService(service, redis, { fetch = globalThis.fetch, brandId } = {}) {
  if (PLATFORMS.includes(service)) {
    if (!brandId) throw badRequest('Pick a brand');
    const brand = await brands.getBrand(redis, String(brandId));
    if (!brand) throw badRequest('Unknown brand');
    const { brandContext } = require('./publishFlow');
    const { getPublisher } = require('./publishers');
    return getPublisher(service).test({ ...(await brandContext(redis, brand)), fetch, log: () => {} });
  }

  const s = await settings.loadSettings(redis);
  const getJson = async (url, headers = {}) => {
    const res = await fetch(url, { headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body.detail && (body.detail.message || body.detail)) || body.message || `HTTP ${res.status}`);
    return body;
  };

  switch (service) {
    case 'elevenlabs': {
      if (!s.ELEVENLABS_API_KEY) return { ok: false, detail: 'No ElevenLabs API key saved' };
      const b = await getJson('https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': s.ELEVENLABS_API_KEY });
      return { ok: true, detail: `${b.tier} plan · ${n(b.character_count)} / ${n(b.character_limit)} credits used` };
    }
    case 'r2': {
      const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((k) => !s[k]);
      if (need.length) return { ok: false, detail: `Missing ${need.join(', ')}` };
      // Write, read back and delete one tiny object: proves the token has Object Read & Write on this bucket.
      const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const c = new S3Client({ region: 'auto', endpoint: `https://${s.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: s.R2_ACCESS_KEY_ID, secretAccessKey: s.R2_SECRET_ACCESS_KEY } });
      const Key = `_connection-test/${Date.now()}.txt`;
      await c.send(new PutObjectCommand({ Bucket: s.R2_BUCKET, Key, Body: 'ok', ContentType: 'text/plain' }));
      await c.send(new GetObjectCommand({ Bucket: s.R2_BUCKET, Key }));
      await c.send(new DeleteObjectCommand({ Bucket: s.R2_BUCKET, Key }));
      return { ok: true, detail: `Bucket "${s.R2_BUCKET}" · read, write and delete work` };
    }
    case 'pixabay': {
      if (!s.PIXABAY_API_KEY) return { ok: false, detail: 'No Pixabay API key saved' };
      const b = await getJson(`https://pixabay.com/api/videos/?key=${encodeURIComponent(s.PIXABAY_API_KEY)}&q=laptop&per_page=3`);
      return { ok: true, detail: `Working · ${n(b.totalHits)} clips for "laptop"` };
    }
    case 'pexels': {
      if (!s.PEXELS_API_KEY) return { ok: false, detail: 'No Pexels API key saved' };
      const b = await getJson('https://api.pexels.com/videos/search?query=laptop&per_page=1', { Authorization: s.PEXELS_API_KEY });
      return { ok: true, detail: `Working · ${n(b.total_results)} clips for "laptop"` };
    }
    case 'claude': {
      const cfg = require('../src/config');
      cfg.applySettings(settings.toConfig(s));
      const { askJson } = require('../src/llm');
      const out = await askJson({
        prompt: 'Reply with ok set to true.',
        name: 'reply',
        description: 'Reply',
        maxTokens: 50,
        schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      });
      return { ok: out.ok === true, detail: `${s.LLM_PROVIDER === 'api' ? 'Anthropic API' : 'Claude Code'} answered (${s.CLAUDE_MODEL})` };
    }
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

module.exports = { testService };
