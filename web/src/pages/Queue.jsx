import './Queue.css';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { ALL, nameLang, useBrands, withBrand } from '../brand.js';
import { BrandChip, Chip, contentLang, fmtTime, graphicLabel, Icon, ICONS, isPublished, PlatformBadge, PlatformStatus, PLATFORMS, StageBar, useToast, VideoStatus } from '../components/ui.jsx';

const TABS = [
  ['active', 'In progress', (v) => v.status === 'queued' || v.status === 'working'],
  ['ready', 'Ready', (v) => v.status === 'ready' && !isPublished(v)],
  ['published', 'Published', isPublished],
  ['failed', 'Failed', (v) => v.status === 'failed' || Object.values(v.platforms || {}).some((p) => p.status === 'failed')],
];

// The brand settings one video may override from this form; must match VIDEO_OPTION_KEYS in server/settings.js.
const VIDEO_OPTION_KEYS = ['VIDEO_FORMAT', 'TARGET_MINUTES', 'SCRIPT_MODE', 'QUESTION_SOURCE', 'LANGUAGE', 'DESIGN_MODE', 'THEME', 'THUMB_STYLE', 'VISUALS']; // form order
const optionName = (spec, v) => (spec.optionLabels && spec.optionLabels[v]) || (v === '' ? 'Claude picks' : v);

/** One per-video override: a select over the setting's options (or a number / text box), with "Brand default" first. */
function VideoOption({ spec, value, brandValue, onChange }) {
  const current = brandValue === '' || brandValue === null || brandValue === undefined ? '' : String(brandValue);
  const label = spec.label.replace(/ \(empty.*\)$/, ''); // "Design theme (empty = Claude picks)" -> "Design theme"; "Video length (min)" stays
  return (
    <label className="field">
      {label}
      {spec.type === 'enum' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Brand default ({optionName(spec, current)})</option>
          {spec.options.filter((o) => o !== '').map((o) => (
            <option key={o} value={o}>{optionName(spec, o)}</option>
          ))}
        </select>
      ) : (
        <input type={spec.type === 'number' ? 'number' : 'text'} min={spec.type === 'number' ? 1 : undefined} step={spec.type === 'number' ? 0.5 : undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`Brand default (${current})`} />
      )}
    </label>
  );
}

function AddVideo({ brands, picked, onAdded, setToast }) {
  const [topic, setTopic] = useState('');
  const [chosen, setChosen] = useState(null);
  const [category, setCategory] = useState('');
  const [platforms, setPlatforms] = useState(PLATFORMS.map((p) => p.id));
  const [prompt, setPrompt] = useState('');
  const [overrides, setOverrides] = useState({}); // SETTING_KEY -> value chosen for this video only ('' = brand default)
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  // The brand follows the one picked in the sidebar (or the only brand there is) until it is chosen here.
  const defaultId = brands.some((b) => b.id === picked) ? picked : brands.length === 1 ? brands[0].id : '';
  const brandId = chosen !== null && brands.some((b) => b.id === chosen) ? chosen : defaultId;
  useEffect(() => setChosen(null), [picked]);
  const { data: brandPage } = usePoll(brandId ? `/api/brands/${brandId}/settings` : null, 60000);
  const categories = (brandPage && brandPage.values.TOPIC_CATEGORIES) || [];
  const lang = contentLang(brandPage && brandPage.values.LANGUAGE);
  // The brand settings one video may change (the server lists them in the schema as option keys).
  const options = VIDEO_OPTION_KEYS.map((k) => ((brandPage && brandPage.schema) || []).find((s) => s.key === k)).filter(Boolean);
  const chosenCount = Object.values(overrides).filter((v) => v !== '').length + (prompt.trim() ? 1 : 0);
  const setOverride = (key, value) => setOverrides((o) => ({ ...o, [key]: value }));
  const flip = (id) => setPlatforms((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const own = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== ''));
      await api.send('POST', '/api/videos', { brandId, topic, category: categories.includes(category) ? category : '', platforms, prompt: prompt.trim(), overrides: own });
      setTopic('');
      setPrompt('');
      setOverrides({});
      setToast('Added to the queue');
      onAdded();
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card q-add" onSubmit={add} aria-labelledby="add-h">
      <div className="q-add-head">
        <h2 id="add-h">Add a video to the queue</h2>
        <span className="faint">Leave the topic empty and AI picks a trending one</span>
      </div>
      {/* What to make and the button on one row (wraps on narrow screens); where it goes and the options below. */}
      <div className="q-add-row">
        <label className="field q-f-brand">
          Brand
          <select required value={brandId} onChange={(e) => { setChosen(e.target.value); setCategory(''); }}>
            <option value="" disabled>Choose a brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id} lang={nameLang(b.name)}>{b.name}{b.active ? '' : ' (off)'}</option>
            ))}
          </select>
        </label>
        <label className="field q-f-topic">
          Topic
          <input lang={lang} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Leave empty and AI picks a trending topic" />
        </label>
        <label className="field q-f-cat">
          Category
          <select lang={lang} value={categories.includes(category) ? category : ''} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Any of my categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary q-add-btn" type="submit" disabled={busy || platforms.length === 0}>
          <Icon d={ICONS.plus} size={16} /> Add to queue
        </button>
      </div>
      <div className="q-add-foot">
        <fieldset className="q-pub">
          <legend className="field">Publish to</legend>
          <div className="q-pills">
            {PLATFORMS.map((p) => (
              <button type="button" key={p.id} className="toggle-pill" aria-pressed={platforms.includes(p.id)} onClick={() => flip(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="button" className="link-btn q-more" aria-expanded={more} aria-controls="video-options" onClick={() => setMore((m) => !m)}>
          {more ? 'Hide options for this video' : 'Options for this video'}{chosenCount ? ` · ${chosenCount} set` : ''}
        </button>
      </div>
      {more && (
        <div id="video-options" className="q-opts">
          <span className="eyebrow">Options for this video</span>
          <label className="field">
            Custom prompt for this video (optional)
            <textarea
              lang={lang}
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
              placeholder="What this video should do, e.g. compare two options and end with one clear recommendation; mention our free course"
            />
            <span className="hint">Goes to the script writer with the brand's standing instructions. It shapes this video only.</span>
          </label>
          {options.length > 0 && (
            <div className="q-opts-grid">
              {options.map((spec) => (
                <VideoOption key={spec.key} spec={spec} value={overrides[spec.key] ?? ''} brandValue={brandPage.values[spec.key]} onChange={(v) => setOverride(spec.key, v)} />
              ))}
            </div>
          )}
          <span className="faint">Each option left on "Brand default" uses the brand's setting at the time the video is made.</span>
        </div>
      )}
    </form>
  );
}

// "Redo a part" of a finished video (POST /api/videos/:id/redo). Order: cheapest first.
const REDO = [
  ['render', 'Video', 'Renders the video again from the finished script and voice. No AI call, no voice credits.'],
  ['thumbnail', 'Thumbnail', 'A new thumbnail design only. The video keeps its opening frame.'],
  ['voice', 'Voice + video', 'Records every scene again (voice credits), then renders the video.'],
  ['script', 'Script + voice + video', 'Writes a new script for the same topic (AI call), records it, renders it.'],
];
const THUMB_STYLES = [['', 'Next style'], ['bigText', 'Big text'], ['question', 'Question'], ['number', 'Number'], ['versus', 'Versus'], ['warning', 'Warning'], ['arrow', 'Before / after'], ['reaction', 'Reaction face'], ['paper', 'Paper note']];
/** Posted or posting somewhere: a remade file would no longer match the copy there, so no redo. */
const postedSomewhere = (v) => Object.values(v.platforms || {}).some((p) => ['pending', 'uploading', 'processing', 'published'].includes(p.status));

function Redo({ v, act }) {
  const [stage, setStage] = useState('render');
  const [style, setStyle] = useState('');
  const info = REDO.find(([id]) => id === stage);
  const go = () => {
    const costly = stage === 'script' ? 'an AI call and voice credits' : stage === 'voice' ? 'voice credits' : null;
    if (costly && !window.confirm(`${info[1]}: this uses ${costly}. Continue?`)) return;
    act('POST', `/api/videos/${v.id}/redo`, { stage, ...(stage === 'thumbnail' ? { style } : {}) }, `Queued: ${info[1].toLowerCase()} again`);
  };
  return (
    <div className="q-block q-redo">
      <h3>Redo a part</h3>
      <div className="q-redo-row">
        <label className="field">
          What
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {REDO.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        {stage === 'thumbnail' && (
          <label className="field">
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {THUMB_STYLES.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="btn" onClick={go}>
          <Icon d={ICONS.retry} size={16} /> Redo
        </button>
      </div>
      <p className="faint" style={{ margin: 0 }}>{info[2]}</p>
    </div>
  );
}

function Detail({ id, brandName, onChanged, setToast }) {
  const { data: v, error, reload } = usePoll(id ? `/api/videos/${id}` : null, 3000);
  if (!id) return <section id="q-detail" className="card q-detail"><p className="empty">Select a video to see its script, log and file.</p></section>;
  if (!v) return <section id="q-detail" className="card q-detail"><p className="muted">{error ? `Could not load this video: ${error}` : 'Loading…'}</p></section>;
  const act = async (method, path, body, msg) => {
    try {
      await api.send(method, path, body);
      setToast(msg);
      reload();
      onChanged();
    } catch (e) {
      setToast(e.message);
    }
  };
  const scenes = (v.script && v.script.scenes) || [];
  const brand = v.brandId ? brandName(v.brandId) : '';
  const own = v.overrides && Object.keys(v.overrides).length > 0 ? v.overrides : null;
  const showThumb = v.files && v.files.thumb && v.status === 'ready';
  return (
    // Sticky with its own scroll on desktop, so a long script or log never leaves the list side of the page empty.
    <section id="q-detail" className="card q-detail detail-panel" aria-labelledby="det-h">
      <div className="q-det-head">
        <div className="q-det-title">
          <span className="eyebrow">Video details</span>
          <h2 id="det-h" className="bn" lang="bn">{v.title || v.topic || 'Topic not picked yet'}</h2>
        </div>
        <VideoStatus video={v} />
      </div>
      {v.error && <div className="banner tone-danger">{v.error}</div>}
      <StageBar video={v} />
      {v.renderer === 'plain' && v.status === 'ready' && (
        <div className="banner tone-warn">Plain render: captions only, no graphics (the animated render failed; the log says why). Redo a part → Video tries again.</div>
      )}
      {v.files && v.files.video && v.status === 'ready' && (
        <video className="preview" controls preload="metadata" src={`/api/media/${v.id}/video?v=${encodeURIComponent(v.updatedAt || '')}`} poster={v.files.thumb ? `/api/media/${v.id}/thumb?v=${encodeURIComponent(v.updatedAt || '')}` : undefined} />
      )}
      <div className="q-media">
        {showThumb && (
          <div className="q-thumb-img">
            <img alt="Thumbnail" src={`/api/media/${v.id}/thumb?v=${encodeURIComponent(v.updatedAt || '')}`} />
          </div>
        )}
        <dl className="q-facts">
          {brand && (
            <>
              <dt>Brand</dt>
              <dd lang={nameLang(brand)}>{brand}</dd>
            </>
          )}
          <dt>Category</dt>
          <dd>{v.category || 'Any category'}</dd>
          <dt>Added</dt>
          <dd>{fmtTime(v.createdAt)}</dd>
          {showThumb && (
            <>
              <dt>Thumbnail</dt>
              <dd>{v.thumbnail && v.thumbnail.style ? v.thumbnail.style : 'Made'}</dd>
            </>
          )}
          {own && (
            <>
              <dt>Own options</dt>
              <dd>{Object.entries(own).map(([k, val]) => `${k.toLowerCase().replace(/_/g, ' ')} = ${val}`).join(' · ')}</dd>
            </>
          )}
        </dl>
      </div>
      {v.prompt && <p className="q-prompt bn" lang="bn">Prompt: {v.prompt}</p>}
      {v.status === 'ready' && (
        <div className="q-block">
          <h3 className="eyebrow">Platforms</h3>
          <div className="q-plats">
            {PLATFORMS.map((p) => (
              <div className="list-row" key={p.id}>
                <PlatformBadge id={p.id} small />
                <span className="q-plat-name">{p.name}</span>
                <PlatformStatus rec={v.platforms[p.id]} platform={p.id} />
                {(!v.platforms[p.id] || ['failed', 'interrupted'].includes(v.platforms[p.id].status)) && (
                  <button type="button" className="btn btn-sm" onClick={() => act('POST', `/api/videos/${v.id}/publish`, { platform: p.id }, `Publishing to ${p.name}`)}>
                    Publish now
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {(v.status === 'ready' || v.status === 'failed') && !postedSomewhere(v) && <Redo v={v} act={act} />}
      {scenes.length > 0 && (
        <details className="q-script">
          <summary>Script · {scenes.length} scenes</summary>
          <ol>
            {scenes.map((s, i) => (
              <li key={i} className="bn" lang="bn">
                {s.narration}
                <span className="faint mono" lang="en"> · {s.broll && s.keywords ? `B-roll: ${s.keywords.join(', ')} (graphic if no clip: ${graphicLabel(s.visual)})` : `Graphic: ${graphicLabel(s.visual)}`}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      <div className="q-block">
        <h3 className="eyebrow">Log</h3>
        <div className="logbox">{(v.log || []).slice(-60).join('\n') || 'No log yet'}</div>
      </div>
      <div className="q-actions">
        {(v.status === 'failed' || v.status === 'queued') && (
          <button type="button" className="btn" onClick={() => act('POST', `/api/videos/${v.id}/retry`, undefined, 'Queued again')}>
            <Icon d={ICONS.retry} size={16} /> {v.status === 'failed' ? 'Retry' : 'Queue again'}
          </button>
        )}
        {v.status !== 'working' && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => window.confirm('Delete this video from the queue? Files on disk stay.') && act('DELETE', `/api/videos/${v.id}`, undefined, 'Deleted')}
          >
            Delete
          </button>
        )}
      </div>
    </section>
  );
}

/** The small coloured tile at the start of a row: its colour says where the video stands. */
const thumbTone = (v) => (v.status === 'ready' && isPublished(v) ? 'published' : v.status);

export default function Queue() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'active';
  // Switch tab but keep the other URL parameters (the picked brand).
  const setTab = (id) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; });
  const [selected, setSelected] = useState(null);
  const { brands, picked, brandName } = useBrands();
  const { data: videos, reload } = usePoll(withBrand('/api/videos?limit=300', picked), 3000);
  const [toast, setToast] = useToast();
  // Pause/resume is global (every brand's queue), the same switch as on the Overview page.
  const { data: overview, reload: reloadOverview } = usePoll('/api/overview', 5000);
  const paused = !!overview?.paused;
  const togglePause = async () => {
    try {
      await api.send('POST', paused ? '/api/queue/resume' : '/api/queue/pause');
      setToast(paused ? 'All brands resumed' : 'All brands paused: the current step finishes, nothing new starts');
      reloadOverview();
    } catch (e) {
      setToast(e.message);
    }
  };
  // Tabs keyboard pattern: arrow keys move between tabs, only the selected tab is in the Tab order.
  const onTabKey = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === tab);
    const next = TABS[(i + step + TABS.length) % TABS.length][0];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  // Below 1200px the details sit under the list, so picking a video also scrolls to them.
  const pick = (id) => {
    setSelected(id);
    if (window.matchMedia && window.matchMedia('(max-width: 1199px)').matches) {
      requestAnimationFrame(() => document.getElementById('q-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const groups = useMemo(() => Object.fromEntries(TABS.map(([id, , fn]) => [id, (videos || []).filter(fn)])), [videos]);
  const list = groups[tab] || [];
  useEffect(() => {
    // The selected video left this tab (deleted, or moved on): show the first one, or nothing when the tab is empty.
    if (videos && !list.some((v) => v.id === selected)) setSelected(list.length ? list[0].id : null);
  }, [tab, list, selected, videos]);

  return (
    <div className="container">
      <header className="page-head">
        <div className="q-head-text">
          <p className="eyebrow">{videos ? `${videos.length} ${videos.length === 1 ? 'video' : 'videos'} · ${(groups.active || []).length} in progress` : 'Videos'}</p>
          <h1>Queue</h1>
          <p className="muted q-lede">The worker makes one video at a time, from topic to render. Finished videos wait for their posting slot.</p>
        </div>
        {overview && (
          <div className="actions">
            <button type="button" className="btn" onClick={togglePause} title="Pauses or resumes every brand's queue">
              <Icon d={paused ? ICONS.play : ICONS.pause} size={16} />
              {paused ? 'Resume queue' : 'Pause queue'}
            </button>
          </div>
        )}
      </header>
      <AddVideo brands={brands} picked={picked} onAdded={reload} setToast={setToast} />
      <div role="tablist" aria-label="Video status" className="tabs q-tabs" onKeyDown={onTabKey}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === id}
            aria-controls="videos-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {label}
            <span className="badge">{(groups[id] || []).length}</span>
          </button>
        ))}
      </div>
      <div className="q-layout">
        <section className="card q-list" aria-label="Videos">
          <div role="tabpanel" id="videos-panel" aria-labelledby={`tab-${tab}`}>
            {!videos && <p className="muted">Loading…</p>}
            {videos && list.length === 0 && <p className="empty">Nothing here.</p>}
            {list.map((v) => (
              // The whole row picks the video for the mouse; the Details button is the keyboard and screen-reader way.
              <div className={`q-row${v.id === selected ? ' is-selected' : ''}`} key={v.id} onClick={() => pick(v.id)}>
                <span className={`q-thumb is-${thumbTone(v)}`} aria-hidden="true">
                  <Icon d={ICONS.play} size={14} fill />
                </span>
                <div className="q-row-main">
                  <span className="q-row-title bn" lang="bn">{v.title || v.topic || 'Topic not picked yet'}</span>
                  <span className="q-row-meta">
                    {v.category || 'Any category'} · {fmtTime(v.createdAt)}
                    {v.lastLog ? ` · ${v.lastLog.replace(/^\[[^\]]*\]\s*/, '').slice(0, 80)}` : ''}
                  </span>
                  <div className="q-row-tags">
                    {(v.targets || []).map((p) => (
                      <PlatformBadge key={p} id={p} small />
                    ))}
                    {picked === ALL && <BrandChip name={brandName(v.brandId)} lang={nameLang(brandName(v.brandId))} />}
                  </div>
                </div>
                <div className="q-row-side">
                  <VideoStatus video={v} />
                  {Object.values(v.platforms || {}).some((p) => p.status === 'failed') && <Chip tone="danger">Post failed</Chip>}
                  {Object.values(v.platforms || {}).some((p) => p.status === 'skipped') && <Chip tone="warn">Skipped somewhere</Chip>}
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-pressed={v.id === selected}
                    onClick={(e) => { e.stopPropagation(); pick(v.id); }}
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <Detail id={selected} brandName={brandName} onChanged={reload} setToast={setToast} />
      </div>
      {toast}
    </div>
  );
}
