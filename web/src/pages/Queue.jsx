import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { Chip, fmtTime, Icon, ICONS, PlatformBadge, PlatformStatus, PLATFORMS, StageBar, useToast, VideoStatus } from '../components/ui.jsx';

const isPublished = (v) => Object.values(v.platforms || {}).some((p) => p.status === 'published');
const TABS = [
  ['active', 'In progress', (v) => v.status === 'queued' || v.status === 'working'],
  ['ready', 'Ready', (v) => v.status === 'ready' && !isPublished(v)],
  ['published', 'Published', isPublished],
  ['failed', 'Failed', (v) => v.status === 'failed' || Object.values(v.platforms || {}).some((p) => p.status === 'failed')],
];

function AddVideo({ categories, onAdded, setToast }) {
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('');
  const [platforms, setPlatforms] = useState(PLATFORMS.map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const flip = (id) => setPlatforms((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.send('POST', '/api/videos', { topic, category, platforms });
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
      <div className="inline" style={{ alignItems: 'flex-end', gap: 14 }}>
        <label className="field" style={{ flex: '3 1 280px' }}>
          Topic
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Leave empty and AI picks a trending topic" />
        </label>
        <label className="field" style={{ flex: '1 1 200px' }}>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Any of my categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, flex: '2 1 300px' }}>
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
  const { data: v, reload } = usePoll(id ? `/api/videos/${id}` : null, 3000);
  if (!id) return <section className="card grow-1"><p className="empty">Select a video to see its script, log and file.</p></section>;
  if (!v) return <section className="card grow-1"><p className="muted">Loading…</p></section>;
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
    <section className="card grow-1" aria-labelledby="det-h" style={{ alignSelf: 'flex-start' }}>
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
                {s.broll && s.keywords ? <span className="faint mono"> · B-roll: {s.keywords.join(', ')}</span> : null}
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
  const [selected, setSelected] = useState(null);
  const { data: videos, reload } = usePoll('/api/videos?limit=300', 3000);
  const { data: settings } = usePoll('/api/settings', 60000);
  const [toast, setToast] = useToast();
  const categories = (settings && settings.values.TOPIC_CATEGORIES) || [];

  const groups = useMemo(() => Object.fromEntries(TABS.map(([id, , fn]) => [id, (videos || []).filter(fn)])), [videos]);
  const list = groups[tab] || [];
  useEffect(() => {
    if (list.length && !list.some((v) => v.id === selected)) setSelected(list[0].id);
  }, [tab, list, selected]);

  return (
    <div className="container">
      <header className="stack" style={{ gap: 4 }}>
        <h1>Queue</h1>
        <p className="muted" style={{ margin: 0 }}>The worker makes one video at a time, from topic to render. Finished videos wait for their posting slot.</p>
      </header>
      <AddVideo categories={categories} onAdded={reload} setToast={setToast} />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <section className="card grow-3" aria-label="Videos" style={{ paddingTop: 8 }}>
          <div role="tablist" aria-label="Video status" className="tabs">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setParams({ tab: id })}>
                {label}
                <span className="badge">{(groups[id] || []).length}</span>
              </button>
            ))}
          </div>
          {!videos && <p className="muted">Loading…</p>}
          {videos && list.length === 0 && <p className="empty">Nothing here.</p>}
          <div>
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
