const settings = require('./settings');

const n = (x) => Number(x || 0).toLocaleString('en-US');

/** "Test" buttons in Integrations. Returns { ok, detail }; never includes a key in the detail. */
async function testService(service, redis, { fetch = globalThis.fetch } = {}) {
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
    case 'youtube':
    case 'tiktok':
    case 'instagram':
    case 'facebook': {
      const cfg = require('../src/config');
      cfg.applySettings(settings.toConfig(s));
      const { getPublisher } = require('./publishers');
      return getPublisher(service).test({ settings: s, fetch, log: () => {} });
    }
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

module.exports = { testService };
