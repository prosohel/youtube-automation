import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { Chip, contentLang, PlatformBadge, Switch, useToast } from '../components/ui.jsx';
import Brands from './Brands.jsx';

const GROUPS = [
  { id: 'ai', title: 'AI models', sub: 'Who finds topics and writes scripts.', tests: [['claude', 'Test Claude']],
    note: 'Inside Docker, Claude Code has no browser login: run "claude setup-token" in a terminal on this PC and paste the token here. Or switch to the Anthropic API.' },
  { id: 'voice', title: 'Voice', sub: 'Narration for every scene. If the main voice fails, the whole video is redone with the free Edge voice.', tests: [['elevenlabs', 'Test ElevenLabs']] },
  { id: 'visuals', title: 'B-roll and visuals', sub: 'Your clips in the footage folder are used first, then stock sites.', tests: [['pixabay', 'Test Pixabay'], ['pexels', 'Test Pexels']] },
  // The apps below are shared by every brand; each brand signs in to its own accounts on its card under Brands.
  { id: 'youtube', title: 'YouTube app', platform: 'youtube', sub: 'The Google project every brand signs in through. Uploads stay private until Google approves it (YouTube API audit).', tests: [] },
  { id: 'tiktok', title: 'TikTok app', platform: 'tiktok', sub: 'Content Posting API. Until TikTok audits your app, posts can only be private (SELF_ONLY).', tests: [] },
  { id: 'meta', title: 'Instagram and Facebook app', platform: 'instagram', sub: 'The Meta app behind both. Each brand adds its own Page and Instagram account.', tests: [] },
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
      <div className="stack" style={{ gap: 2 }}>
        <div className="between" style={{ minHeight: 44, flexWrap: 'nowrap' }}>
          <span id={id} className="field">{spec.label}</span>
          <Switch checked={Boolean(v)} onChange={set} labelledBy={id} describedBy={hintId} disabled={blocked} />
        </div>
        {spec.hint && <span id={hintId} className="faint">{spec.hint}</span>}
      </div>
    );
  }
  if (isSecret(spec)) {
    const saved = value && value.set;
    const typed = typeof draft[spec.key] === 'string' ? draft[spec.key] : '';
    const multiline = spec.type === 'json';
    return (
      <label className="field" style={multiline ? { gridColumn: '1 / -1' } : undefined}>
        {/* The badge stays beside the label even when a long label wraps. */}
        <span className="between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          {spec.label}
          {draft[spec.key] === null ? <Chip tone="warn">Will be cleared</Chip> : saved ? <Chip tone="ok">Saved</Chip> : <Chip>Not set</Chip>}
        </span>
        {multiline ? (
          <textarea className="mono" value={typed} onChange={(e) => set(e.target.value)} placeholder={saved ? 'Saved. Paste new JSON to replace it.' : 'Paste the whole client_secret.json here'} />
        ) : (
          <input type="password" autoComplete="off" value={typed} onChange={(e) => set(e.target.value)} placeholder={saved ? 'Saved. Type to replace.' : 'Not set'} />
        )}
        {saved && draft[spec.key] !== null && (
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 13 }} onClick={() => set(null)}>
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
          {spec.options.map((o) => <option key={o} value={o}>{o === '' ? 'Claude picks per video' : spec.optionLabels?.[o] || o}</option>)}
        </select>
        {spec.optionHints?.[v ?? ''] && <span className="hint">{spec.optionHints[v ?? '']}</span>}
      </label>
    );
  }
  if (spec.type === 'json') {
    const text = Array.isArray(v) ? v.join('\n') : typeof v === 'string' ? v : JSON.stringify(v ?? '', null, 2);
    return (
      <label className="field" style={{ gridColumn: '1 / -1' }}>
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

function GroupCard({ group, schema, values, effective, onSaved, setToast }) {
  const [draft, setDraft] = useState({});
  const [results, setResults] = useState({});
  const specs = schema.filter((s) => s.group === group.id);
  const picks = specs.filter((s) => s.subgroup === 'claude');
  const fieldProps = { draft, setDraft, values, effective, lang: contentLang(values.LANGUAGE) };
  const dirty = Object.keys(draft).length > 0;

  const save = async () => {
    const patch = {};
    for (const [k, val] of Object.entries(draft)) {
      const spec = specs.find((s) => s.key === k);
      if (isSecret(spec) && val === '') continue; // blank secret = unchanged
      const isList = spec.type === 'json' && !isSecret(spec) && typeof val === 'string'; // typed one per line
      patch[k] = isList ? val.split('\n').map((x) => x.trim()).filter(Boolean) : val;
    }
    try {
      await api.send('PUT', '/api/settings', patch);
      setDraft({});
      setToast(`${group.title} saved`);
      onSaved();
    } catch (e) {
      setToast(e.message);
    }
  };
  const runTest = async (service) => {
    setResults((r) => ({ ...r, [service]: { ok: null, detail: 'Testing…' } }));
    const res = await api.send('POST', `/api/test/${service}`).catch((e) => ({ ok: false, detail: e.message }));
    setResults((r) => ({ ...r, [service]: res }));
  };

  return (
    <section className="card" aria-labelledby={`g-${group.id}`}>
      <div className="inline" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        {group.platform && <PlatformBadge id={group.platform} />}
        <div className="stack" style={{ gap: 2 }}>
          <h2 id={`g-${group.id}`} style={{ fontSize: 17 }}>{group.title}</h2>
          <span className="faint">{group.sub}</span>
        </div>
      </div>
      {group.note && <div className="banner tone-info">{group.note}</div>}
      <div className="fields">
        {specs.filter((s) => !s.subgroup).map((s) => (
          <Field key={s.key} spec={s} value={values[s.key]} {...fieldProps} />
        ))}
      </div>
      {picks.length > 0 && (
        <fieldset className="subpanel">
          <legend>Claude decides per video</legend>
          <div className="fields">
            {picks.map((s) => (
              <Field key={s.key} spec={s} value={values[s.key]} {...fieldProps} />
            ))}
          </div>
        </fieldset>
      )}
      <div className="between">
        <div className="stack" style={{ gap: 4 }}>
          {group.tests.map(([svc]) =>
            results[svc] ? (
              <span key={svc} role="status" style={{ fontSize: 13, color: results[svc].ok ? 'var(--ok)' : results[svc].ok === false ? 'var(--danger)' : 'var(--ink-3)' }}>
                {results[svc].detail}
              </span>
            ) : null
          )}
        </div>
        <div className="inline">
          {group.tests.map(([svc, label]) => (
            <button key={svc} type="button" className="btn btn-sm" onClick={() => runTest(svc)}>{label}</button>
          ))}
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>Save</button>
        </div>
      </div>
    </section>
  );
}

export default function Integrations() {
  const { data, reload } = usePoll('/api/settings', 120000);
  const { data: clips } = usePoll('/api/clips', 120000);
  const [params] = useSearchParams();
  const [toast, setToast] = useToast();
  const yt = params.get('youtube');
  useEffect(() => {
    if (yt) setToast(yt === 'connected' ? 'YouTube connected' : `YouTube: ${yt}`);
  }, [yt, setToast]);

  if (!data) return <div className="container"><h1>Integrations</h1><p className="muted">Loading…</p></div>;
  return (
    <div className="container">
      <header className="stack" style={{ gap: 4 }}>
        <h1>Integrations & settings</h1>
        <p className="muted" style={{ margin: 0 }}>Keys are saved on this PC only (in Redis, inside Docker) and are never shown again after saving.</p>
      </header>
      {GROUPS.filter((g) => data.schema.some((s) => s.group === g.id)).map((g) => (
        <GroupCard key={g.id} group={g} schema={data.schema} values={data.values} effective={data.effective || {}} onSaved={reload} setToast={setToast} />
      ))}
      <Brands setToast={setToast} />
      <section className="card" aria-labelledby="lib-h">
        <h2 id="lib-h" style={{ fontSize: 17 }}>Saved clip library</h2>
        <span className="faint">Files in the footage folder. A scene uses a clip when 2 or more words of its file name match the scene keywords.</span>
        <div className="inline" style={{ gap: 6 }}>
          {(clips || []).map((c) => <Chip key={c.file}>{c.file.replace(/\.[^.]+$/, '')}</Chip>)}
          {clips && clips.length === 0 && <span className="faint">No clips yet.</span>}
        </div>
      </section>
      {toast}
    </div>
  );
}
