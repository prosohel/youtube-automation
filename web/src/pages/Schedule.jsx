import { useEffect, useMemo, useRef, useState } from 'react';
import './Schedule.css';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { ALL, nameLang, useBrands, withBrand } from '../brand.js';
import { BrandChip, Chip, contentLang, fmtTime, Icon, ICONS, PlatformBadge, platformName, PLATFORMS, Switch, useToast } from '../components/ui.jsx';

const TIME_ZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York'];
const DAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];

/** "9:00 am" / "6:30 pm" / "18:00" -> [hour 0-23, minute], or null. */
function parseClock(t) {
  const m = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i.exec(String(t).trim());
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (/^p/i.test(m[3]) ? 12 : 0);
  } else if (h > 23) return null;
  return [h, min];
}

/** 18, 5 -> "6:05 pm" */
const clock12 = (h, min) => `${h % 12 || 12}:${String(min).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;

/** "9:00 am, 6:00 pm" + days -> cron. All times must share the minutes (one cron line). */
function buildCron(times, days) {
  const parts = times.split(',').map((t) => t.trim()).filter(Boolean).map(parseClock);
  if (!parts.length || parts.some((p) => !p)) return { error: 'Write times like 9:00 am, 6:00 pm' };
  const mins = new Set(parts.map((p) => p[1]));
  if (mins.size > 1) return { error: 'All times in one rule need the same minutes (e.g. 9:30 am, 6:30 pm). Add a second rule for other times.' };
  const dow = days.length === 0 || days.length === 7 ? '*' : [...days].sort().join(',');
  return { cron: `${[...mins][0]} ${parts.map((p) => p[0]).join(',')} * * ${dow}` };
}

/** cron -> editor fields, when it is a plain "minute hours * * days" line. */
function parseCron(cron) {
  const m = /^(\d{1,2}) ([\d,]+) \* \* ([\d,*]+)$/.exec(String(cron || '').trim());
  if (!m) return null;
  const times = m[2].split(',').map((h) => clock12(+h, +m[1])).join(', ');
  return { times, days: m[3] === '*' ? [] : m[3].split(',') };
}

const blank = { brandId: '', kind: 'publish', platform: 'youtube', mode: 'daily', times: '6:00 pm', days: [], cron: '0 18 * * *', tz: 'Asia/Dhaka', count: 1, category: '', pick: 'oldest', privacy: '', caption: '', enabled: true };

function describe(rule) {
  const parsed = parseCron(rule.cron);
  const dayNames = parsed ? (parsed.days.length ? DAYS.filter(([d]) => parsed.days.includes(d)).map(([, n]) => n).join(', ') : 'Every day') : null;
  const when = parsed ? `${dayNames} at ${parsed.times}` : `Cron ${rule.cron}`;
  // The time chips and day line of the rule row; a custom cron line has neither and shows the cron itself.
  const times = parsed ? parsed.times.split(', ') : [];
  return rule.kind === 'make'
    ? { title: `Make ${rule.count} new video${rule.count > 1 ? 's' : ''}`, when, dayNames, times, what: rule.category ? `Category: ${rule.category}` : 'Topics from your categories' }
    : { title: platformName(rule.platform), when, dayNames, times, what: `Posts the ${rule.pick === 'newest' ? 'newest' : 'oldest'} ready video${rule.privacy ? ` · ${rule.privacy}` : ''}` };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Editor({ initial, brands, brandName, onSaved, onCancel, setToast }) {
  const [f, setF] = useState(initial);
  const { data: brandPage } = usePoll(f.brandId ? `/api/brands/${f.brandId}/settings` : null, 60000);
  const categories = (brandPage && brandPage.values.TOPIC_CATEGORIES) || [];
  const lang = contentLang(brandPage && brandPage.values.LANGUAGE);
  // A rule whose brand has been archived keeps showing its brand; saving it is refused by the server.
  const brandOptions = f.brandId && !brands.some((b) => b.id === f.brandId) ? [...brands, { id: f.brandId, name: brandName(f.brandId), active: false }] : brands;
  const [preview, setPreview] = useState({ next: [], error: null });
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const built = f.mode === 'custom' ? { cron: f.cron } : buildCron(f.times, f.mode === 'weekly' ? f.days : []);
  const formRef = useRef(null);

  // Bring the editor into view when it opens (it sits below a list that may be long).
  useEffect(() => {
    if (formRef.current && formRef.current.scrollIntoView) formRef.current.scrollIntoView({ block: 'nearest' });
  }, []);

  useEffect(() => {
    if (built.error) return setPreview({ next: [], error: built.error });
    const t = setTimeout(async () => {
      try {
        const p = await api.get(`/api/rules/preview?cron=${encodeURIComponent(built.cron)}&tz=${encodeURIComponent(f.tz)}`);
        setPreview({ next: p.next, error: null });
      } catch (e) {
        setPreview({ next: [], error: e.message });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [built.cron, built.error, f.tz]);

  const save = async (e) => {
    e.preventDefault();
    if (built.error) return setToast(built.error);
    const body = { brandId: f.brandId, kind: f.kind, cron: built.cron, tz: f.tz, enabled: f.enabled };
    if (f.kind === 'make') Object.assign(body, { count: Number(f.count), category: f.category });
    else Object.assign(body, { platform: f.platform, pick: f.pick, privacy: f.privacy || undefined, caption: f.caption });
    try {
      await api.send(f.id ? 'PUT' : 'POST', f.id ? `/api/rules/${f.id}` : '/api/rules', body);
      setToast('Rule saved');
      onSaved();
    } catch (err) {
      setToast(err.message);
    }
  };

  const seg = (key, options) => (
    <div role="radiogroup" className="segmented">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={f[key] === v} onClick={() => set(key, v)}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <form ref={formRef} className="card sc-editor" onSubmit={save} aria-labelledby="ed-h">
      <div className="sc-ed-head">
        <div className="stack sc-tight">
          <p className="eyebrow">{f.id ? 'Change when it runs' : 'Add to the schedule'}</p>
          <h2 id="ed-h">{f.id ? 'Edit rule' : 'New rule'}</h2>
        </div>
      </div>

      <div className="sc-ed-section">
        <div className="stack sc-seg">
          <span className="field">What happens</span>
          {seg('kind', [['publish', 'Publish a video'], ['make', 'Make new videos']])}
        </div>
        <div className="fields">
          <label className="field">
            Brand
            <select required value={f.brandId} onChange={(e) => setF((o) => ({ ...o, brandId: e.target.value, category: '' }))}>
              <option value="" disabled>Choose a brand</option>
              {brandOptions.map((b) => (
                <option key={b.id} value={b.id} lang={nameLang(b.name)}>{b.name}{b.active ? '' : ' (off)'}</option>
              ))}
            </select>
          </label>
          {f.kind === 'publish' ? (
            <label className="field">
              Platform
              <select value={f.platform} onChange={(e) => set('platform', e.target.value)}>
                {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label className="field">
                How many videos
                <input type="number" min="1" max="10" value={f.count} onChange={(e) => set('count', e.target.value)} />
              </label>
              <label className="field">
                Category
                <select lang={lang} value={f.category} onChange={(e) => set('category', e.target.value)}>
                  <option value="">Any of my categories</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="field">
            Time zone
            <select value={f.tz} onChange={(e) => set('tz', e.target.value)}>
              {[...new Set([f.tz, ...TIME_ZONES])].map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="sc-ed-section subpanel">
        <div className="stack sc-seg">
          <span className="field">Repeat</span>
          {seg('mode', [['daily', 'Every day'], ['weekly', 'Some days'], ['custom', 'Custom cron']])}
        </div>
        {f.mode === 'weekly' && (
          <div className="inline sc-days" role="group" aria-label="Days">
            {DAYS.map(([d, n]) => (
              <button key={d} type="button" className="toggle-pill" aria-pressed={f.days.includes(d)} onClick={() => set('days', f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d])}>
                {n}
              </button>
            ))}
          </div>
        )}
        {f.mode === 'custom' ? (
          <label className="field">
            Cron (minute hour day month weekday)
            <input className="mono" value={f.cron} onChange={(e) => set('cron', e.target.value)} />
          </label>
        ) : (
          <label className="field sc-times-field">
            Times
            <input value={f.times} onChange={(e) => set('times', e.target.value)} placeholder="9:00 am, 6:00 pm" />
            <span className="hint">Separated by commas. 18:00 also works.</span>
          </label>
        )}
      </div>

      {f.kind === 'publish' && (
        <div className="fields">
          <label className="field">
            Which video
            <select value={f.pick} onChange={(e) => set('pick', e.target.value)}>
              <option value="oldest">Oldest ready video</option>
              <option value="newest">Newest ready video</option>
            </select>
          </label>
          {f.platform === 'youtube' && (
            <label className="field">
              YouTube privacy
              <select value={f.privacy} onChange={(e) => set('privacy', e.target.value)}>
                <option value="">Use the default setting</option>
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </label>
          )}
          {f.platform !== 'youtube' && (
            <label className="field sc-span">
              Caption
              <textarea className="mono" value={f.caption} onChange={(e) => set('caption', e.target.value)} placeholder={'{title}\n\n{hashtags}'} />
              <span className="hint">Placeholders: {'{title}'}, {'{description}'}, {'{hashtags}'}. Empty = title + hashtags.</span>
            </label>
          )}
        </div>
      )}

      <div className="sc-ed-foot">
        <span className="muted sc-preview" role="status">
          {preview.error ? <span className="sc-error">{preview.error}</span> : preview.next.length ? <>Next runs: <strong>{preview.next.map(fmtTime).join(' · ')}</strong></> : '…'}
        </span>
        <div className="sc-ed-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={Boolean(preview.error)}>Save rule</button>
        </div>
      </div>
    </form>
  );
}

/** How far ahead the week view goes (in weeks after this one). */
const MAX_WEEKS = 12;

export default function Schedule() {
  const { brands, picked, brandName } = useBrands();
  const { data: rules, reload } = usePoll(withBrand('/api/rules', picked), 15000);
  // Which week the calendar shows: 0 = the next 7 days from today, 1 = the 7 after, ... up to MAX_WEEKS ahead.
  const [offset, setOffset] = useState(0);
  const start = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset * 7);
    return d;
  }, [offset]);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const weekPath = offset === 0 ? '/api/schedule/week' : `/api/schedule/week?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
  const { data: week, reload: reloadWeek } = usePoll(withBrand(weekPath, picked), 30000);
  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  const short = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const range = offset === 0 ? 'next 7 days' : `${short(start)} – ${short(lastDay)}`;
  const Range = range[0].toUpperCase() + range.slice(1);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useToast();
  const chip = (id) => (picked === ALL ? <BrandChip name={brandName(id)} lang={nameLang(brandName(id))} /> : null);
  // A new rule starts on the picked brand, or on the only brand there is.
  const newRule = () => ({ ...blank, brandId: brands.some((b) => b.id === picked) ? picked : brands.length === 1 ? brands[0].id : '' });
  const refresh = () => {
    reload();
    reloadWeek();
  };

  const toggle = async (rule, enabled) => {
    try {
      await api.send('PUT', `/api/rules/${rule.id}`, { ...rule, enabled });
      refresh();
    } catch (e) {
      setToast(e.message);
    }
  };
  const remove = async (rule) => {
    if (!window.confirm('Delete this rule?')) return;
    await api.send('DELETE', `/api/rules/${rule.id}`);
    refresh();
  };
  const edit = (rule) => {
    const parsed = parseCron(rule.cron);
    setEditing({ ...blank, ...rule, privacy: rule.privacy || '', caption: rule.caption || '', category: rule.category || '', ...(parsed ? { mode: parsed.days.length ? 'weekly' : 'daily', ...parsed } : { mode: 'custom' }) });
  };

  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toDateString();
      out.push({ d, key, slots: (week || []).filter((s) => new Date(s.at).toDateString() === key) });
    }
    return out;
  }, [week, start]);

  // Summary numbers, all from the rules and the slots the calendar below shows (today + 6 days).
  const summary = useMemo(() => {
    if (!rules || !week) return null;
    const shown = days.flatMap((d) => d.slots);
    const posts = shown.filter((s) => s.kind === 'publish');
    const makes = shown.filter((s) => s.kind === 'make');
    const on = rules.filter((r) => r.enabled);
    return {
      posts: posts.length,
      postBrands: new Set(posts.map((s) => s.brandId)).size,
      postPlatforms: new Set(posts.map((s) => s.platform)).size,
      toMake: makes.reduce((n, s) => n + (Number(s.count) || 1), 0),
      makeRules: on.filter((r) => r.kind === 'make').length,
      on: on.length,
      total: rules.length,
    };
  }, [rules, week, days]);

  const zones = rules ? [...new Set(rules.map((r) => r.tz))] : [];
  const eyebrow = zones.length === 1 ? `Rule times are ${zones[0]}` : rules && rules.length ? `${plural(rules.length, 'rule')} in ${zones.length} time zones` : 'Make and post on a timetable';
  let localZone = '';
  try {
    localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    localZone = '';
  }

  return (
    <div className="container sc-page">
      <header className="page-head">
        <div className="stack sc-tight sc-head-text">
          <p className="eyebrow">{eyebrow}</p>
          <h1>Schedule</h1>
          <p className="muted sc-lede">When videos get made, and when each platform gets one. A slot missed while the PC was off runs once when it is back.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing(newRule())}>
            <Icon d={ICONS.plus} size={16} /> New rule
          </button>
        </div>
      </header>

      {summary && (
        <section className="kpis" aria-label={`${Range} in numbers`}>
          <div className="kpi hero">
            <span className="kpi-label">{offset === 0 ? 'Posts in the next 7 days' : `Posts, ${range}`}</span>
            <span className="kpi-value">{summary.posts}</span>
            <span className="kpi-note">
              {summary.posts === 0
                ? 'No publish rule is on'
                : picked === ALL
                  ? `Across ${plural(summary.postBrands, 'brand')} and ${plural(summary.postPlatforms, 'platform')}`
                  : `On ${plural(summary.postPlatforms, 'platform')}`}
            </span>
          </div>
          <div className="kpi gold">
            <span className="kpi-label">Videos to make, {range}</span>
            <span className="kpi-value">{summary.toMake}</span>
            <span className="kpi-note">{summary.makeRules ? `From ${plural(summary.makeRules, 'make rule')}` : 'No make rule is on'}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Rules on</span>
            <span className="kpi-value">{summary.on}</span>
            <span className="kpi-note">{summary.total ? `of ${plural(summary.total, 'rule')}${summary.total > summary.on ? `, ${summary.total - summary.on} off` : ''}` : 'No rules yet'}</span>
          </div>
        </section>
      )}

      <section className="card sc-rules-card" aria-labelledby="rules-h">
        <div className="sc-card-head">
          <h2 id="rules-h" className="eyebrow">Rules</h2>
          {summary && summary.total > 0 && <span className="faint">{plural(summary.total, 'rule')}, {summary.on} on</span>}
        </div>
        {rules && rules.length === 0 && <p className="empty">No rules yet. Start with “Make 2 videos every night” and “Publish to YouTube at 18:00”.</p>}
        <div className="sc-rules">
          {(rules || []).map((r) => {
            const d = describe(r);
            const brandTag = chip(r.brandId);
            return (
              <div className={`list-row sc-rule${r.enabled ? '' : ' is-off'}`} key={r.id}>
                <PlatformBadge id={r.kind === 'make' ? 'make' : r.platform} />
                <div className="sc-rule-main">
                  <strong id={`rule-${r.id}`} className="sc-rule-title">{d.title}</strong>
                  <span className="sc-rule-what">{d.what}</span>
                  <span className="faint sc-rule-meta">
                    <span className="sr-only">{d.when}. </span>
                    <span aria-hidden="true">{d.dayNames || 'Custom'} </span>
                    <span>({r.tz})</span>
                    <span className="sc-dot" aria-hidden="true">·</span>
                    <span>Next run <strong className="sc-next">{r.enabled && r.next[0] ? fmtTime(r.next[0]) : 'Off'}</strong></span>
                  </span>
                </div>
                <div className="sc-rule-tags">
                  {brandTag}
                  {d.times.map((t, k) => (
                    <span key={`${t}-${k}`} className="chip sc-time" aria-hidden="true">{t}</span>
                  ))}
                  <code className="mono sc-cron" title="Cron line">{r.cron}</code>
                </div>
                <div className="sc-rule-actions">
                  <span className="sc-switch">
                    <Switch checked={r.enabled} onChange={(v) => toggle(r, v)} labelledBy={`rule-${r.id}`} />
                  </span>
                  <button type="button" className="btn btn-sm" onClick={() => edit(r)}>Edit</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(r)} aria-label={`Delete ${d.title} rule`}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {editing && (
        <Editor
          key={editing.id || 'new'}
          initial={editing}
          brands={brands}
          brandName={brandName}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onCancel={() => setEditing(null)}
          setToast={setToast}
        />
      )}

      <section className="card sc-week-card" aria-labelledby="week-h">
        <div className="sc-card-head">
          <div className="stack sc-tight">
            <h2 id="week-h" className="eyebrow">{Range}</h2>
            {localZone && <span className="faint">Shown in this device’s time ({localZone})</span>}
          </div>
          <div className="sc-week-nav" role="group" aria-label="Choose a week">
            <button type="button" className="btn btn-sm" onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset === 0} aria-label="Previous week">
              <Icon d={ICONS.chevronLeft} size={16} />
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setOffset(0)} disabled={offset === 0}>
              This week
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setOffset((o) => Math.min(MAX_WEEKS, o + 1))} disabled={offset === MAX_WEEKS} aria-label="Next week">
              <Icon d={ICONS.chevronRight} size={16} />
            </button>
          </div>
        </div>
        <div className="table-wrap sc-week-wrap">
          <div className="week">
            {days.map(({ d, key, slots }, i) => (
              <div key={key} className={`day${offset === 0 && i === 0 ? ' today' : ''}`}>
                <div className="sc-day-head">
                  <strong className="sc-day-name">{offset === 0 && i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' })}</strong>
                  <span className="faint">
                    {offset === 0 && i === 0 && <span className="sr-only">{d.toLocaleDateString('en-GB', { weekday: 'long' })} </span>}
                    {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {slots.length === 0 && <span className="faint">Nothing</span>}
                {slots.map((s, j) => (
                  <div className="slot" key={j}>
                    <PlatformBadge id={s.kind === 'make' ? 'make' : s.platform} small />
                    {new Date(s.at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    {s.kind === 'make' && <Chip tone="info">make {s.count}</Chip>}
                    {chip(s.brandId)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="faint sc-scroll-hint">Swipe sideways to see the whole week.</p>
      </section>
      {toast}
    </div>
  );
}
