import './Overview.css';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { ALL, nameLang, useBrands, withBrand } from '../brand.js';
import { BrandChip, Chip, fmtTime, Icon, ICONS, PlatformBadge, PlatformStatus, platformName, PLATFORMS, StageBar, useToast } from '../components/ui.jsx';

const longDate = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function PageHead({ children }) {
  return (
    <header className="page-head">
      <div className="ov-title">
        <p className="eyebrow">
          <span className="ov-date-long">{longDate()}</span>
          <span className="ov-date-short">{shortDate()}</span>
        </p>
        <h1>Overview</h1>
      </div>
      {children}
    </header>
  );
}

/** Small thumbnail of a finished video, or a plain tile when it has none. */
function Thumb({ v }) {
  return v.hasThumb ? (
    <img className="ov-thumb" alt="" loading="lazy" src={`/api/media/${v.id}/thumb?v=${encodeURIComponent(v.updatedAt || '')}`} />
  ) : (
    <span className="ov-thumb ov-thumb-empty" aria-hidden="true">
      <Icon d={ICONS.play} size={14} fill />
    </span>
  );
}

/** Videos made per day this week, as plain bars (today in the strong colour). */
function WeekChart({ week, weekTotal, lastWeekTotal }) {
  const max = Math.max(1, ...week.map((d) => d.count));
  const last = week.length - 1;
  const diff = weekTotal - (lastWeekTotal || 0);
  const trend =
    typeof lastWeekTotal !== 'number' ? null : diff > 0 ? `+${diff} on last week` : diff < 0 ? `${-diff} fewer than last week` : 'Same as last week';
  const summary = week.map((d, i) => `${d.label} ${d.count}${i === last ? ' (today)' : ''}`).join(', ');
  return (
    <section className="card ov-week" aria-labelledby="week-h">
      <div className="ov-week-head">
        <div className="ov-week-total">
          <h2 id="week-h" className="eyebrow">Videos made this week</h2>
          <span className="ov-week-num">
            {weekTotal}
            {trend && <span className={`ov-trend${diff > 0 ? ' up' : diff < 0 ? ' down' : ''}`}>{trend}</span>}
          </span>
        </div>
        <div className="ov-legend" aria-hidden="true">
          <span><i className="ov-swatch" />Made</span>
          <span><i className="ov-swatch today" />Today</span>
        </div>
      </div>
      <div className="ov-bars" role="img" aria-label={`Videos made per day: ${summary}`}>
        {week.map((d, i) => (
          <div className={`ov-bar-col${i === last ? ' today' : ''}`} key={d.date}>
            <span className="ov-bar-n">{d.count}</span>
            <div className={`ov-bar${d.count ? '' : ' zero'}`} style={{ '--p': d.count / max }} />
          </div>
        ))}
      </div>
      <div className="ov-bar-days" aria-hidden="true">
        {week.map((d, i) => (
          <span key={d.date} className={i === last ? 'today' : undefined}>{d.label}</span>
        ))}
      </div>
    </section>
  );
}

export default function Overview() {
  const { picked, brandName } = useBrands();
  const { data, error, reload } = usePoll(withBrand('/api/overview', picked), 3000);
  const chip = (id) => (picked === ALL ? <BrandChip name={brandName(id)} lang={nameLang(brandName(id))} /> : null);
  const [toast, setToast] = useToast();

  const toggle = async () => {
    try {
      await api.send('POST', data.paused ? '/api/queue/resume' : '/api/queue/pause');
      setToast(data.paused ? 'All brands resumed' : 'All brands paused: the current step finishes, nothing new starts');
      reload();
    } catch (e) {
      setToast(e.message);
    }
  };

  if (error && !data)
    return (
      <div className="container">
        <PageHead />
        <div className="card">Cannot reach the API: {error}</div>
      </div>
    );
  if (!data)
    return (
      <div className="container">
        <PageHead />
        <p className="muted">Loading…</p>
      </div>
    );

  const { counts, current, nextPosts, recent, alerts, paused, worker } = data;
  const hasWeek = Array.isArray(data.week) && data.week.length > 0;
  const workerLabel = !worker.alive ? 'Worker not running' : paused ? 'Queue paused' : 'Worker running';
  const workerTone = !worker.alive ? 'danger' : paused ? 'warn' : 'ok';

  const plainKpis = [
    ['Waiting', counts.queued, 'Videos in the queue', 'waiting'],
    ['Being made', counts.working, 'Right now', 'making'],
    ['Failed', counts.failed, 'Need a retry', 'failed'],
  ];

  return (
    <div className="container">
      <PageHead>
        <div className="actions ov-actions">
          <span className={`chip tone-${workerTone} ov-worker`} role="status" aria-label={`Worker status: ${workerLabel}`} title="Runs in Docker and starts automatically when your PC boots.">
            <span className="dot" aria-hidden="true" />
            {workerLabel}
            <span className="sr-only">. Runs in Docker and starts automatically when your PC boots.</span>
          </span>
          <button type="button" className="btn" onClick={toggle} disabled={!worker.alive}>
            <Icon d={paused ? ICONS.play : ICONS.pause} size={16} />
            {paused ? 'Resume all brands' : 'Pause all brands'}
          </button>
          <Link className="btn btn-primary" to="/queue">
            <Icon d={ICONS.plus} size={16} /> New video
          </Link>
        </div>
      </PageHead>

      <section className="kpis ov-kpis" aria-label="Summary">
        <div className="kpi hero ov-kpi-hero">
          <span className="kpi-label">
            Published
            {counts.privateOnly > 0 && <span className="chip chip-gold ov-kpi-chip">{counts.privateOnly} private</span>}
          </span>
          <span className="kpi-value">{counts.published}</span>
          <span className="kpi-note">
            {counts.privateOnly
              ? `${counts.privateOnly} still private (nobody can see ${counts.privateOnly > 1 ? 'them' : 'it'})`
              : 'On at least one platform'}
          </span>
        </div>
        <div className="kpi gold ov-kpi-gold">
          <span className="kpi-label">Ready to post</span>
          <span className="kpi-value">{counts.ready}</span>
          <span className="kpi-note">Rendered, waiting for a slot</span>
        </div>
        {plainKpis.map(([label, value, note, key]) => (
          <div className={`kpi ov-kpi-plain ov-kpi-${key}${key === 'failed' && value > 0 ? ' has-failed' : ''}`} key={key}>
            <span className="kpi-label">
              {label}
              <span className="dot ov-kpi-dot" aria-hidden="true" />
            </span>
            <span className="kpi-value">{value}</span>
            <span className="kpi-note">{note}</span>
          </div>
        ))}
      </section>

      <div className={`ov-grid${hasWeek ? '' : ' no-week'}`}>
        <section className={`card card-hero ov-now${current ? '' : ' idle'}`} aria-labelledby="now-h">
          <div className="ov-now-main">
            <div className="ov-now-head">
              <h2 id="now-h" className="eyebrow">Now in the pipeline</h2>
              {current && <span className="chip chip-gold">{current.stage}</span>}
            </div>
            {current ? (
              <div className="ov-now-text">
                <p className="big-title bn" lang="bn">{current.title || current.topic || 'Finding a topic…'}</p>
                <span className="faint">{current.category ? `${current.category} · ` : ''}started {fmtTime(current.createdAt)}</span>
                {chip(current.brandId) && <div className="inline">{chip(current.brandId)}</div>}
              </div>
            ) : (
              <p className="muted ov-now-empty">Nothing is being made right now.</p>
            )}
            {current && <StageBar video={current} />}
          </div>
          {current && <div className="logbox ov-now-log">{(current.log || []).join('\n') || '…'}</div>}
          <Link className="ov-link ov-now-link" to="/queue">Open the queue</Link>
        </section>

        {hasWeek && <WeekChart week={data.week} weekTotal={data.weekTotal} lastWeekTotal={data.lastWeekTotal} />}

        <section className="card ov-att" aria-labelledby="att-h">
          <div className="ov-card-head">
            <h2 id="att-h" className="eyebrow">Needs your attention</h2>
            {alerts.length > 0 && <span className="chip tone-warn ov-att-count">{alerts.length}</span>}
          </div>
          {alerts.length === 0 && <p className="empty">All good. Nothing needs you.</p>}
          {alerts.map((a, i) => (
            <div className="ov-att-row" key={i}>
              <span className={`pbadge tone-${a.level}`} aria-hidden="true">
                <Icon d={ICONS.alert} size={17} />
              </span>
              <div className="ov-att-text">
                <strong>{a.title}</strong>
                <span className="muted">{a.body}</span>
                {a.href && a.href !== '/' && <Link className="ov-link" to={a.href}>Open</Link>}
              </div>
            </div>
          ))}
        </section>

        <section className="card ov-next" aria-labelledby="next-h">
          <div className="ov-card-head">
            <h2 id="next-h" className="eyebrow">Upcoming posts</h2>
            <Link className="ov-link" to="/schedule">Open schedule</Link>
          </div>
          {nextPosts.length === 0 && <p className="empty">No publishing rules yet. Add one on the Schedule page.</p>}
          {nextPosts.map((p, i) => (
            <div className="ov-post" key={i}>
              <span className="ov-post-time">{fmtTime(p.at)}</span>
              <span className="ov-post-badge"><PlatformBadge id={p.platform} /></span>
              <div className="ov-post-main">
                <span className="bn ov-post-title" lang="bn">{p.title || (i > 0 ? 'Next ready video' : 'No ready video yet')}</span>
                <span className="ov-post-meta">
                  <span className="faint">{platformName(p.platform)}</span>
                  {chip(p.brandId)}
                </span>
              </div>
              {p.connected === false && <span className="ov-post-flag"><Chip tone="danger">Not connected</Chip></span>}
            </div>
          ))}
        </section>
      </div>

      <section className="card ov-recent" aria-labelledby="recent-h">
        <div className="ov-card-head">
          <h2 id="recent-h" className="eyebrow">Latest videos</h2>
          <Link className="ov-link" to="/queue">All videos</Link>
        </div>
        {recent.length === 0 ? (
          <p className="empty">No finished videos yet.</p>
        ) : (
          <>
            <div className="table-wrap ov-table">
              <div className="vtable" role="table" aria-label="Latest videos">
                <div className="tr th" role="row">
                  <span role="columnheader">Video</span>
                  <span role="columnheader">Made</span>
                  {PLATFORMS.map((p) => (
                    <span role="columnheader" key={p.id}>{p.name}</span>
                  ))}
                </div>
                {recent.map((v) => (
                  <div className="tr" role="row" key={v.id}>
                    <span role="cell" className="ov-vcell">
                      <Thumb v={v} />
                      <span className="ov-vcell-text">
                        <span className="bn ov-vtitle" lang="bn">{v.title}</span>
                        {chip(v.brandId)}
                      </span>
                    </span>
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

            <ul className="ov-vcards" aria-label="Latest videos">
              {recent.map((v) => {
                const recs = v.platforms || {};
                const anyPosted = PLATFORMS.some((p) => recs[p.id]);
                return (
                  <li className="ov-vcard" key={v.id}>
                    <Thumb v={v} />
                    <div className="ov-vcard-body">
                      <span className="bn ov-vtitle" lang="bn">{v.title}</span>
                      <span className="ov-vcard-meta">
                        {chip(v.brandId)}
                        <span className="faint">Made {fmtTime(v.createdAt)}</span>
                      </span>
                      <div className="ov-vcard-status">
                        {!anyPosted ? (
                          <span className="faint">Not posted yet</span>
                        ) : (
                          PLATFORMS.map((p) => (
                            <span className="ov-pstat" key={p.id}>
                              <PlatformBadge id={p.id} small />
                              <PlatformStatus rec={recs[p.id]} platform={p.id} />
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      {toast}
    </div>
  );
}
