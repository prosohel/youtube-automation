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

function AddVideo({ brands, picked, onAdded, setToast }) {
  const [topic, setTopic] = useState('');
  const [chosen, setChosen] = useState(null);
  const [category, setCategory] = useState('');
  const [platforms, setPlatforms] = useState(PLATFORMS.map((p) => p.id));
  const [busy, setBusy] = useState(false);
  // The brand follows the one picked in the sidebar (or the only brand there is) until it is chosen here.
  const defaultId = brands.some((b) => b.id === picked) ? picked : brands.length === 1 ? brands[0].id : '';
  const brandId = chosen !== null && brands.some((b) => b.id === chosen) ? chosen : defaultId;
  useEffect(() => setChosen(null), [picked]);
  const { data: brandPage } = usePoll(brandId ? `/api/brands/${brandId}/settings` : null, 60000);
  const categories = (brandPage && brandPage.values.TOPIC_CATEGORIES) || [];
  const lang = contentLang(brandPage && brandPage.values.LANGUAGE);
  const flip = (id) => setPlatforms((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.send('POST', '/api/videos', { brandId, topic, category: categories.includes(category) ? category : '', platforms });
      setTopic('');
      setToast('Added to the queue');
      onAdded();
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={add} aria-labelledby="add-h">
      <h2 id="add-h">Add a video to the queue</h2>
      {/* Two rows: what to make, then where it goes and the button, so the platform pills never wrap one by one. */}
      <div className="inline" style={{ alignItems: 'flex-end', gap: 14 }}>
        <label className="field" style={{ flex: '1 1 180px' }}>
          Brand
          <select required value={brandId} onChange={(e) => { setChosen(e.target.value); setCategory(''); }}>
            <option value="" disabled>Choose a brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id} lang={nameLang(b.name)}>{b.name}{b.active ? '' : ' (off)'}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: '3 1 280px' }}>
          Topic
          <input lang={lang} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Leave empty and AI picks a trending topic" />
        </label>
        <label className="field" style={{ flex: '1 1 220px' }}>
          Category
          <select lang={lang} value={categories.includes(category) ? category : ''} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Any of my categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend className="field" style={{ padding: '0 0 6px' }}>Publish to</legend>
          <div className="inline" style={{ gap: 8 }}>
            {PLATFORMS.map((p) => (
              <button type="button" key={p.id} className="toggle-pill" aria-pressed={platforms.includes(p.id)} onClick={() => flip(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-primary" type="submit" disabled={busy || platforms.length === 0}>
          <Icon d={ICONS.plus} size={16} /> Add to queue
        </button>
      </div>
    </form>
  );
}

function Detail({ id, onChanged, setToast }) {
  const { data: v, error, reload } = usePoll(id ? `/api/videos/${id}` : null, 3000);
  if (!id) return <section className="card grow-1"><p className="empty">Select a video to see its script, log and file.</p></section>;
  if (!v) return <section className="card grow-1"><p className="muted">{error ? `Could not load this video: ${error}` : 'Loading…'}</p></section>;
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
  return (
    // Sticky with its own scroll, so a long script or log never leaves the list side of the page empty.
    <section className="card grow-1 detail-panel" aria-labelledby="det-h">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="det-h" className="eyebrow">Video</h2>
        <p className="big-title bn" lang="bn">{v.title || v.topic || 'Topic not picked yet'}</p>
        <div className="inline">
          <VideoStatus video={v} />
          <span className="faint">{v.category || 'Any category'} · added {fmtTime(v.createdAt)}</span>
        </div>
        {v.error && <div className="banner tone-danger">{v.error}</div>}
      </div>
      <StageBar video={v} />
      {v.files && v.files.video && v.status === 'ready' && (
        <video className="preview" controls preload="metadata" src={`/api/media/${v.id}/video`} poster={v.files.thumb ? `/api/media/${v.id}/thumb` : undefined} />
      )}
      {v.status === 'ready' && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>Platforms</h3>
          {PLATFORMS.map((p) => (
            <div className="list-row" key={p.id}>
              <PlatformBadge id={p.id} small />
              <span style={{ flex: 1 }}>{p.name}</span>
              <PlatformStatus rec={v.platforms[p.id]} platform={p.id} />
              {(!v.platforms[p.id] || ['failed', 'interrupted'].includes(v.platforms[p.id].status)) && (
                <button type="button" className="btn btn-sm" onClick={() => act('POST', `/api/videos/${v.id}/publish`, { platform: p.id }, `Publishing to ${p.name}`)}>
                  Publish now
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {scenes.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 36 }}>Script · {scenes.length} scenes</summary>
          <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenes.map((s, i) => (
              <li key={i} className="bn" lang="bn">
                {s.narration}
                <span className="faint mono" lang="en"> · {s.broll && s.keywords ? `B-roll: ${s.keywords.join(', ')} (graphic if no clip: ${graphicLabel(s.visual)})` : `Graphic: ${graphicLabel(s.visual)}`}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <h3>Log</h3>
        <div className="logbox">{(v.log || []).slice(-60).join('\n') || 'No log yet'}</div>
      </div>
      <div className="inline">
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

export default function Queue() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'active';
  // Switch tab but keep the other URL parameters (the picked brand).
  const setTab = (id) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; });
  const [selected, setSelected] = useState(null);
  const { brands, picked, brandName } = useBrands();
  const { data: videos, reload } = usePoll(withBrand('/api/videos?limit=300', picked), 3000);
  const [toast, setToast] = useToast();
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

  const groups = useMemo(() => Object.fromEntries(TABS.map(([id, , fn]) => [id, (videos || []).filter(fn)])), [videos]);
  const list = groups[tab] || [];
  useEffect(() => {
    // The selected video left this tab (deleted, or moved on): show the first one, or nothing when the tab is empty.
    if (videos && !list.some((v) => v.id === selected)) setSelected(list.length ? list[0].id : null);
  }, [tab, list, selected, videos]);

  return (
    <div className="container">
      <header className="stack" style={{ gap: 4 }}>
        <h1>Queue</h1>
        <p className="muted" style={{ margin: 0 }}>The worker makes one video at a time, from topic to render. Finished videos wait for their posting slot.</p>
      </header>
      <AddVideo brands={brands} picked={picked} onAdded={reload} setToast={setToast} />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <section className="card grow-3" aria-label="Videos" style={{ paddingTop: 8 }}>
          <div role="tablist" aria-label="Video status" className="tabs" onKeyDown={onTabKey}>
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
          <div role="tabpanel" id="videos-panel" aria-labelledby={`tab-${tab}`}>
            {!videos && <p className="muted">Loading…</p>}
            {videos && list.length === 0 && <p className="empty">Nothing here.</p>}
            {list.map((v) => (
              <div className="list-row" key={v.id} style={{ background: v.id === selected ? '#f8faff' : undefined, borderRadius: 10, paddingLeft: 8, paddingRight: 8 }}>
                <div className="stack" style={{ gap: 4, flex: '1 1 300px', minWidth: 0 }}>
                  <span className="bn" lang="bn" style={{ fontWeight: 600 }}>{v.title || v.topic || 'Topic not picked yet'}</span>
                  <span className="faint">
                    {v.category || 'Any category'} · {fmtTime(v.createdAt)}
                    {v.lastLog ? ` · ${v.lastLog.slice(9, 90)}` : ''}
                  </span>
                  <div className="inline" style={{ gap: 4 }}>
                    {(v.targets || []).map((p) => (
                      <PlatformBadge key={p} id={p} small />
                    ))}
                    {picked === ALL && <BrandChip name={brandName(v.brandId)} lang={nameLang(brandName(v.brandId))} />}
                  </div>
                </div>
                <VideoStatus video={v} />
                {Object.values(v.platforms || {}).some((p) => p.status === 'failed') && <Chip tone="danger">Post failed</Chip>}
                <button type="button" className="btn btn-sm" aria-pressed={v.id === selected} onClick={() => setSelected(v.id)}>
                  Details
                </button>
              </div>
            ))}
          </div>
        </section>
        <Detail id={selected} onChanged={reload} setToast={setToast} />
      </div>
      {toast}
    </div>
  );
}
