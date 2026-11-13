import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './Integrations.css';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { Chip, contentLang, PlatformBadge, Switch, useToast } from '../components/ui.jsx';
import Brands from './Brands.jsx';

const GROUPS = [
  { id: 'ai', title: 'AI models', sub: 'Who finds topics and writes scripts.', tests: [['claude', 'Test Claude']],
    note: 'Inside Docker, Claude Code has no browser login: run "claude setup-token" in a terminal on this PC and paste the token here. Or switch to the Anthropic API.' },
  { id: 'voice', title: 'Voice', sub: 'Narration for every scene. If the main voice fails, the whole video is redone with the free Edge voice.', tests: [['elevenlabs', 'Test ElevenLabs']] },
  { id: 'visuals', title: 'B-roll and visuals', sub: 'Your clips in the footage folder are used first, then stock sites.', tests: [['pixabay', 'Test Pixabay'], ['pexels', 'Test Pexels']] },
  { id: 'storage', title: 'Video storage', sub: 'Where finished videos are kept. Cloudflare R2: 10 GB free, no download fees; the dashboard streams from it and local copies expire after publishing.', tests: [['r2', 'Test R2']] },
  // The apps below are shared by every brand; each brand signs in to its own accounts on its card under Brands.
  { id: 'youtube', title: 'YouTube app', platform: 'youtube', sub: 'The Google project every brand signs in through. Uploads stay private until Google approves it (YouTube API audit).', tests: [] },
  { id: 'tiktok', title: 'TikTok app', platform: 'tiktok', sub: 'Content Posting API. Until TikTok audits your app, posts can only be private (SELF_ONLY).', tests: [] },
  { id: 'meta', title: 'Instagram and Facebook app', platform: 'instagram', sub: 'The Meta app behind both. Each brand adds its own Page and Instagram account.', tests: [] },
];

/** The compact list of shared keys: which secret makes each one ready, and the test that proves it. */
const KEY_ROWS = [
  { id: 'claude', group: 'ai', mono: 'AI', name: 'Claude', test: 'claude', keys: (v) => (v.LLM_PROVIDER === 'api' ? ['ANTHROPIC_API_KEY'] : ['CLAUDE_CODE_OAUTH_TOKEN']) },
  { id: 'elevenlabs', group: 'voice', mono: 'EL', name: 'ElevenLabs voice', test: 'elevenlabs', keys: () => ['ELEVENLABS_API_KEY'] },
  { id: 'pixabay', group: 'visuals', mono: 'PB', name: 'Pixabay footage', test: 'pixabay', keys: () => ['PIXABAY_API_KEY'] },
  { id: 'pexels', group: 'visuals', mono: 'PX', name: 'Pexels footage', test: 'pexels', keys: () => ['PEXELS_API_KEY'] },
  { id: 'r2', group: 'storage', mono: 'R2', name: 'Cloudflare R2 storage', test: 'r2', keys: () => ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'], unused: (v) => v.STORAGE !== 'r2' },
  { id: 'youtube-app', group: 'youtube', platform: 'youtube', name: 'YouTube app', keys: () => ['YOUTUBE_CLIENT_SECRET'] },
  { id: 'tiktok-app', group: 'tiktok', platform: 'tiktok', name: 'TikTok app', keys: () => ['TIKTOK_CLIENT_SECRET'] },
];

const isSecret = (spec) => Boolean(spec.secret);

// Channel text typed in these fields is in the channel's language (Bangla), so it gets lang="bn".
const CHANNEL_TEXT = ['NICHE'];

/** The patch for the keys typed in `draft`: a blank secret stays as it is, a list typed one per line becomes a list. */
export function buildPatch(draft, specs) {
  const patch = {};
  for (const [k, val] of Object.entries(draft)) {
    const spec = specs.find((s) => s.key === k);
    if (isSecret(spec) && val === '') continue; // blank secret = unchanged
    const isList = spec.type === 'json' && !isSecret(spec) && typeof val === 'string'; // typed one per line
    patch[k] = isList ? val.split('\n').map((x) => x.trim()).filter(Boolean) : val;
  }
  return patch;
}

/** Connection tests and their last answers. With `brandId` every test uses that brand's own accounts. */
export function useTests(brandId) {
  const [results, setResults] = useState({});
  const run = useCallback(
    async (service) => {
      setResults((r) => ({ ...r, [service]: { ok: null, detail: 'Testing…' } }));
      const query = brandId ? `?brand=${encodeURIComponent(brandId)}` : '';
      const res = await api.send('POST', `/api/test/${service}${query}`).catch((e) => ({ ok: false, detail: e.message }));
      setResults((r) => ({ ...r, [service]: res }));
    },
    [brandId],
  );
  return [results, run];
}

/** The answer of one connection test, read out when it changes. */
export function TestResult({ result }) {
  if (!result) return null;
  const tone = result.ok ? ' ok' : result.ok === false ? ' bad' : '';
  return <span role="status" className={`in-result${tone}`}>{result.detail}</span>;
}

/** Move to a settings card and put the keyboard there too. */
export function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const heading = el.querySelector('h2');
  if (heading) heading.focus({ preventScroll: true });
}

/** One setting as a form control. `requires` names a switch that must be on first (sound cues need sound effects). */
export function Field({ spec, value, draft, setDraft, values, effective, lang, idPrefix = '' }) {
  const v = draft[spec.key] !== undefined ? draft[spec.key] : value;
  const set = (x) => setDraft((d) => ({ ...d, [spec.key]: x }));
  const id = `${idPrefix}f-${spec.key}`; // idPrefix keeps ids unique when several brand cards are open
  const current = (key) => (draft[key] !== undefined ? draft[key] : values[key]);
  // A value this machine swaps for another (a Windows path inside Docker): say what is really used.
  const used = effective && Object.prototype.hasOwnProperty.call(effective, spec.key) ? effective[spec.key] : undefined;
  const blocked = Boolean(spec.requires && !current(spec.requires));
  const usedNote = used !== undefined && <span className="hint">Docker uses “{String(used)}” instead of this value.</span>;

  if (spec.key === 'YOUTUBE_TOKEN') return null; // shown as a Connect button on the brand's card
  if (spec.type === 'boolean') {
    const hintId = spec.hint ? `${id}-hint` : undefined;
    return (
      <div className={`in-toggle${blocked ? ' blocked' : ''}`}>
        <div className="in-toggle-text">
          <strong id={id}>{spec.label}</strong>
          {spec.hint && <span id={hintId} className="faint">{spec.hint}</span>}
        </div>
        <Switch checked={Boolean(v)} onChange={set} labelledBy={id} describedBy={hintId} disabled={blocked} />
      </div>
    );
  }
  if (isSecret(spec)) {
    const saved = value && value.set;
    const typed = typeof draft[spec.key] === 'string' ? draft[spec.key] : '';
    const multiline = spec.type === 'json';
    return (
      <label className={`field${multiline ? ' in-wide' : ''}`}>
        {/* The badge stays beside the label even when a long label wraps. */}
        <span className="in-label-row">
          {spec.label}
          {draft[spec.key] === null ? <Chip tone="warn">Will be cleared</Chip> : saved ? <Chip tone="ok">Saved</Chip> : <Chip>Not set</Chip>}
        </span>
        {multiline ? (
          <textarea className="mono" value={typed} onChange={(e) => set(e.target.value)} placeholder={saved ? 'Saved. Paste new JSON to replace it.' : 'Paste the whole client_secret.json here'} />
        ) : (
          <input type="password" autoComplete="off" value={typed} onChange={(e) => set(e.target.value)} placeholder={saved ? 'Saved. Type to replace.' : 'Not set'} />
        )}
        {saved && draft[spec.key] !== null && (
          <button type="button" className="link-btn in-clear" onClick={() => set(null)}>
            Clear saved value
          </button>
        )}
      </label>
    );
  }
  if (spec.type === 'enum') {
    return (
      <label className="field">
        {spec.label}
        <select value={v ?? ''} disabled={blocked} onChange={(e) => set(e.target.value)}>
          {spec.options.map((o) => <option key={o} value={o}>{spec.optionLabels?.[o] || (o === '' ? 'Claude picks per video' : o)}</option>)}
        </select>
        {spec.optionHints?.[v ?? ''] && <span className="hint">{spec.optionHints[v ?? '']}</span>}
      </label>
    );
  }
  if (spec.type === 'text') {
    return (
      <label className="field in-wide">
        {spec.label}
        <textarea lang={lang} rows={5} value={v ?? ''} disabled={blocked} onChange={(e) => set(e.target.value)} placeholder="Optional. e.g. Talk to beginners. Always give one practical step at the end. Never mention prices. Keep a calm, friendly tone." />
        {spec.hint && <span className="hint">{spec.hint}</span>}
      </label>
    );
  }
  if (spec.type === 'json') {
    const text = Array.isArray(v) ? v.join('\n') : typeof v === 'string' ? v : JSON.stringify(v ?? '', null, 2);
    return (
      <label className="field in-wide">
        {spec.label}
        {/* The draft keeps the text exactly as typed (new lines, spaces); it becomes a list only on Save. */}
        <textarea lang="bn" value={text} disabled={blocked} onChange={(e) => set(e.target.value)} />
        <span className="hint">One per line.</span>
      </label>
    );
  }
  return (
    <label className="field">
      {spec.label}
      <input
        type={spec.type === 'number' ? 'number' : 'text'}
        lang={CHANNEL_TEXT.includes(spec.key) ? lang : undefined}
        value={v ?? ''}
        disabled={blocked}
        onChange={(e) => set(e.target.value)}
      />
      {spec.hint && <span className="hint">{spec.hint}</span>}
      {usedNote}
    </label>
  );
}

/** Settings as a form grid, with the on/off ones gathered underneath as toggle tiles. */
export function FieldGrid({ specs, values, fieldProps }) {
  const inputs = specs.filter((s) => s.type !== 'boolean' && s.key !== 'YOUTUBE_TOKEN');
  const toggles = specs.filter((s) => s.type === 'boolean');
  return (
    <>
      {inputs.length > 0 && (
        <div className="fields">
          {inputs.map((s) => <Field key={s.key} spec={s} value={values[s.key]} {...fieldProps} />)}
        </div>
      )}
      {toggles.length > 0 && (
        <div className="in-toggles">
          {toggles.map((s) => <Field key={s.key} spec={s} value={values[s.key]} {...fieldProps} />)}
        </div>
      )}
    </>
  );
}

function GroupCard({ group, schema, values, effective, onSaved, setToast, results, runTest }) {
  const [draft, setDraft] = useState({});
  const specs = schema.filter((s) => s.group === group.id);
  const picks = specs.filter((s) => s.subgroup === 'claude');
  const fieldProps = { draft, setDraft, values, effective, lang: contentLang(values.LANGUAGE) };
  const dirty = Object.keys(draft).length > 0;
  const shown = group.tests.filter(([svc]) => results[svc]);

  const save = async () => {
    try {
      await api.send('PUT', '/api/settings', buildPatch(draft, specs));
      setDraft({});
      setToast(`${group.title} saved`);
      onSaved();
    } catch (e) {
      setToast(e.message);
    }
  };

  return (
    <section className="card" id={`group-${group.id}`} aria-labelledby={`g-${group.id}`}>
      <div className="in-card-head stacked">
        <div className="in-card-title">
          {group.platform && <PlatformBadge id={group.platform} />}
          <h2 id={`g-${group.id}`} tabIndex={-1}>{group.title}</h2>
        </div>
        <p className="faint">{group.sub}</p>
      </div>
      {group.note && <div className="banner tone-info">{group.note}</div>}
      <FieldGrid specs={specs.filter((s) => !s.subgroup)} values={values} fieldProps={fieldProps} />
      {picks.length > 0 && (
        <fieldset className="subpanel stack">
          <legend>Claude decides per video</legend>
          <FieldGrid specs={picks} values={values} fieldProps={fieldProps} />
        </fieldset>
      )}
      <div className="in-card-foot">
        {shown.length > 0 && (
          <div className="in-results">
            {shown.map(([svc]) => <TestResult key={svc} result={results[svc]} />)}
          </div>
        )}
        <div className="in-buttons">
          {group.tests.map(([svc, label]) => (
            <button key={svc} type="button" className="btn btn-sm" onClick={() => runTest(svc)}>{label}</button>
          ))}
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>Save</button>
        </div>
      </div>
    </section>
  );
}

/** One line per shared key or app: is it saved, does it work, and a way to its settings. */
function KeysCard({ schema, values, results, runTest }) {
  const rows = KEY_ROWS.filter((r) => schema.some((s) => s.group === r.group));
  const saved = (key) => Boolean(values[key] && values[key].set);
  const state = (r) => {
    const res = r.test && results[r.test];
    if (res && res.ok) return ['ok', 'Working'];
    if (res && res.ok === false) return ['danger', 'Failed'];
    if (res) return ['info', 'Testing…'];
    if (r.unused && r.unused(values)) return ['neutral', 'Not in use'];
    return r.keys(values).every(saved) ? ['neutral', 'Key saved'] : ['warn', 'Not set'];
  };
  return (
    <section className="card in-keys" aria-labelledby="keys-h">
      <h2 id="keys-h" className="eyebrow">Shared keys</h2>
      {rows.map((r) => {
        const [tone, label] = state(r);
        return (
          <div key={r.id} className="in-key">
            {r.platform ? <PlatformBadge id={r.platform} /> : <span className="pbadge p-make" aria-hidden="true">{r.mono}</span>}
            <div className="in-key-text">
              <strong>{r.name}</strong>
              <Chip tone={tone}>{label}</Chip>
            </div>
            <div className="in-key-actions">
              <button type="button" className="link-btn" onClick={() => goTo(`group-${r.group}`)} aria-label={`Edit ${r.name}`}>Edit</button>
              {r.test && (
                <button type="button" className="btn btn-sm" onClick={() => runTest(r.test)} aria-label={`Test ${r.name}`}>Test</button>
              )}
            </div>
            {/* The card below announces the answer; here it is only shown. */}
            {r.test && results[r.test] && results[r.test].ok === false && <span className="in-result bad">{results[r.test].detail}</span>}
          </div>
        );
      })}
    </section>
  );
}

function HeadText() {
  return (
    <div className="in-head-text">
      <p className="eyebrow">Brands, accounts and keys</p>
      <h1>Integrations</h1>
      <p className="faint">Each brand has its own channel settings, voice, look and accounts. Videos for a brand are posted only to that brand’s accounts.</p>
    </div>
  );
}

export default function Integrations() {
  const { data, reload } = usePoll('/api/settings', 120000);
  const { data: clips } = usePoll('/api/clips', 120000);
  const [params] = useSearchParams();
  const [toast, setToast] = useToast();
  const [results, runTest] = useTests();
  const yt = params.get('youtube');
  const channel = params.get('channel');
  const tt = params.get('tiktok');
  const ttAccount = params.get('account');
  useEffect(() => {
    if (yt) setToast(yt === 'connected' ? `YouTube connected${channel ? `: ${channel}` : ''}` : `YouTube: ${yt}`);
  }, [yt, channel, setToast]);
  useEffect(() => {
    // Errors from the server already start with "TikTok:"; TikTok's own (a cancelled sign-in) do not.
    if (tt) setToast(tt === 'connected' ? `TikTok connected${ttAccount ? `: ${ttAccount}` : ''}` : /^TikTok/.test(tt) ? tt : `TikTok: ${tt}`);
  }, [tt, ttAccount, setToast]);

  if (!data) {
    return (
      <div className="container">
        <header className="page-head"><HeadText /></header>
        <p className="muted" role="status">Loading…</p>
      </div>
    );
  }
  const groups = GROUPS.filter((g) => data.schema.some((s) => s.group === g.id));
  return (
    <div className="container">
      <Brands
        setToast={setToast}
        head={<HeadText />}
        side={<KeysCard schema={data.schema} values={data.values} results={results} runTest={runTest} />}
      />
      <section className="stack" style={{ gap: 16 }} aria-labelledby="shared-h">
        <div className="in-shared-head">
          <p className="eyebrow">Every brand</p>
          <h2 id="shared-h">Shared keys and apps</h2>
          <p className="faint">Keys are saved on this PC only (in Redis, inside Docker) and are never shown again after saving.</p>
        </div>
        <div className="in-groups">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} schema={data.schema} values={data.values} effective={data.effective || {}} onSaved={reload} setToast={setToast} results={results} runTest={runTest} />
          ))}
          <section className="card" aria-labelledby="lib-h">
            <div className="in-card-head stacked">
              <h2 id="lib-h">Saved clip library</h2>
              <p className="faint">Files in the footage folder. A scene uses a clip when 2 or more words of its file name match the scene keywords.</p>
            </div>
            <div className="in-clips">
              {(clips || []).map((c) => {
                const name = c.file.replace(/\.[^.]+$/, '');
                return <Chip key={c.file}><span title={name}>{name}</span></Chip>;
              })}
              {clips && clips.length === 0 && <span className="faint">No clips yet.</span>}
            </div>
          </section>
        </div>
      </section>
      {toast}
    </div>
  );
}
