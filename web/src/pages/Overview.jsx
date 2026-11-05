import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { Chip, fmtTime, Icon, ICONS, PlatformBadge, PlatformStatus, platformName, PLATFORMS, StageBar, useToast } from '../components/ui.jsx';

export default function Overview() {
  const { data, error, reload } = usePoll('/api/overview', 3000);
  const [toast, setToast] = useToast();

  const toggle = async () => {
    try {
      await api.send('POST', data.paused ? '/api/queue/resume' : '/api/queue/pause');
      setToast(data.paused ? 'Queue resumed' : 'Queue paused: the current step finishes, nothing new starts');
      reload();
    } catch (e) {
      setToast(e.message);
    }
  };

  if (error && !data) return <div className="container"><h1>Overview</h1><div className="card">Cannot reach the API: {error}</div></div>;
  if (!data) return <div className="container"><h1>Overview</h1><p className="muted">Loading…</p></div>;

  const { counts, current, nextPosts, recent, alerts, paused, worker } = data;
  const workerLabel = !worker.alive ? 'Worker not running' : paused ? 'Queue paused' : 'Worker running';
  const dot = !worker.alive ? '#f04438' : paused ? '#f79009' : '#12b76a';

  return (
    <div className="container">
      <header className="between">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Overview</h1>
          <p className="muted" style={{ margin: 0 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Link className="btn btn-primary" to="/queue">
          <Icon d={ICONS.plus} size={16} /> New video
        </Link>
      </header>

      <section className="card" aria-label="Worker status" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
        <div className="inline" style={{ gap: '10px 20px' }}>
          <strong className="inline" style={{ gap: 10 }}>
            <span className="dot" style={{ background: dot, boxShadow: `0 0 0 4px ${dot}33` }} />
            {workerLabel}
          </strong>
          <span className="muted">Runs in Docker and starts automatically when your PC boots.</span>
        </div>
        <button type="button" className="btn" onClick={toggle} disabled={!worker.alive}>
          <Icon d={paused ? ICONS.play : ICONS.pause} size={16} />
          {paused ? 'Resume queue' : 'Pause queue'}
        </button>
      </section>

      <section className="kpis" aria-label="Summary">
        {[
          ['Waiting', counts.queued, 'Videos in the queue'],
          ['Being made', counts.working, 'Right now'],
          ['Ready to post', counts.ready, 'Rendered, waiting for a slot'],
          ['Published', counts.published, 'On at least one platform'],
          ['Failed', counts.failed, 'Need a retry'],
        ].map(([label, value, note]) => (
          <div className="kpi" key={label}>
            <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>{label}</span>
            <span className="kpi-value">{value}</span>
            <span className="faint">{note}</span>
          </div>
        ))}
      </section>

      <div className="row">
        <section className="card grow-2" aria-labelledby="now-h">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <h2 id="now-h" className="eyebrow">Now in the pipeline</h2>
              {current ? (
                <>
                  <p className="big-title bn" lang="bn">{current.title || current.topic || 'Finding a topic…'}</p>
                  <span className="faint">{current.category ? `${current.category} · ` : ''}started {fmtTime(current.createdAt)}</span>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Nothing is being made right now.</p>
              )}
            </div>
            {current && <Chip tone="info">{current.stage}</Chip>}
          </div>
          {current && (
            <>
              <StageBar video={current} />
              <div className="logbox">{(current.log || []).join('\n') || '…'}</div>
            </>
          )}
          <Link to="/queue" style={{ fontWeight: 600, textDecoration: 'none' }}>Open the queue</Link>
        </section>

        <section className="card grow-1 card-tight" aria-labelledby="att-h">
          <div className="between">
            <h2 id="att-h" className="eyebrow">Needs your attention</h2>
            {alerts.length > 0 && <Chip tone="warn">{alerts.length}</Chip>}
          </div>
          {alerts.length === 0 && <p className="empty">All good. Nothing needs you.</p>}
          {alerts.map((a, i) => (
            <div className="list-row" key={i} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <span className={`pbadge tone-${a.level}`} aria-hidden="true">
                <Icon d={ICONS.alert} size={17} />
              </span>
              <div className="stack" style={{ gap: 3 }}>
                <strong>{a.title}</strong>
                <span className="muted" style={{ fontSize: 13 }}>{a.body}</span>
                {a.href && a.href !== '/' && <Link to={a.href} style={{ fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>Open</Link>}
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="row">
        <section className="card grow-3 card-tight" aria-labelledby="next-h">
          <div className="between">
            <h2 id="next-h" className="eyebrow">Upcoming posts</h2>
            <Link to="/schedule" style={{ fontWeight: 600, textDecoration: 'none' }}>Open schedule</Link>
          </div>
          {nextPosts.length === 0 && <p className="empty">No publishing rules yet. Add one on the Schedule page.</p>}
          {nextPosts.map((p, i) => (
            <div className="list-row" key={i}>
              <span style={{ width: 150, fontWeight: 600, color: 'var(--ink-2)', fontSize: 13 }}>{fmtTime(p.at)}</span>
              <PlatformBadge id={p.platform} />
              <div className="stack" style={{ gap: 2, flex: '1 1 240px', minWidth: 0 }}>
                <span className="bn" lang="bn" style={{ fontWeight: 500 }}>{p.title || (i > 0 ? 'Next ready video' : 'No ready video yet')}</span>
                <span className="faint">{platformName(p.platform)}</span>
              </div>
              {p.connected === false && <Chip tone="danger">Not connected</Chip>}
            </div>
          ))}
        </section>
      </div>

      <section className="card" aria-labelledby="recent-h">
        <div className="between">
          <h2 id="recent-h" className="eyebrow">Ready videos</h2>
          <Link to="/queue" style={{ fontWeight: 600, textDecoration: 'none' }}>All videos</Link>
        </div>
        {recent.length === 0 ? (
          <p className="empty">No finished videos yet.</p>
        ) : (
          <div className="table-wrap">
            <div className="vtable" role="table" aria-label="Ready videos">
              <div className="tr th" role="row">
                <span role="columnheader">Video</span>
                <span role="columnheader">Made</span>
                {PLATFORMS.map((p) => (
                  <span role="columnheader" key={p.id}>{p.name}</span>
                ))}
              </div>
              {recent.map((v) => (
                <div className="tr" role="row" key={v.id}>
                  <span role="cell" className="bn" lang="bn" style={{ fontWeight: 500 }}>{v.title}</span>
                  <span role="cell" className="faint">{fmtTime(v.createdAt)}</span>
                  {PLATFORMS.map((p) => (
                    <span role="cell" key={p.id}>
                      <PlatformStatus rec={v.platforms[p.id]} platform={p.id} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      {toast}
    </div>
  );
}
