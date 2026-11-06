import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { ALL, nameLang, useBrands, withBrand } from '../brand.js';
import { BrandChip, Chip, contentLang, fmtTime, Icon, ICONS, PlatformBadge, platformName, PLATFORMS, Switch, useToast } from '../components/ui.jsx';

const TIME_ZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York'];
const DAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];

/** "09:00, 18:00" + days -> cron. All times must share the minutes (one cron line). */
function buildCron(times, days) {
  const parts = times.split(',').map((t) => t.trim()).filter(Boolean).map((t) => /^(\d{1,2}):(\d{2})$/.exec(t));
  if (!parts.length || parts.some((p) => !p || +p[1] > 23 || +p[2] > 59)) return { error: 'Write times like 09:00, 18:00' };
  const mins = new Set(parts.map((p) => +p[2]));
  if (mins.size > 1) return { error: 'All times in one rule need the same minutes (e.g. 09:30, 18:30). Add a second rule for other times.' };
  const dow = days.length === 0 || days.length === 7 ? '*' : [...days].sort().join(',');
  return { cron: `${[...mins][0]} ${parts.map((p) => +p[1]).join(',')} * * ${dow}` };
}

/** cron -> editor fields, when it is a plain "minute hours * * days" line. */
function parseCron(cron) {
  const m = /^(\d{1,2}) ([\d,]+) \* \* ([\d,*]+)$/.exec(String(cron || '').trim());
  if (!m) return null;
  const times = m[2].split(',').map((h) => `${h.padStart(2, '0')}:${m[1].padStart(2, '0')}`).join(', ');
  return { times, days: m[3] === '*' ? [] : m[3].split(',') };
}

const blank = { brandId: '', kind: 'publish', platform: 'youtube', mode: 'daily', times: '18:00', days: [], cron: '0 18 * * *', tz: 'Asia/Dhaka', count: 1, category: '', pick: 'oldest', privacy: '', caption: '', enabled: true };

function describe(rule) {
  const parsed = parseCron(rule.cron);
  const when = parsed
    ? `${parsed.days.length ? DAYS.filter(([d]) => parsed.days.includes(d)).map(([, n]) => n).join(', ') : 'Every day'} at ${parsed.times}`
    : `Cron ${rule.cron}`;
  return rule.kind === 'make'
    ? { title: `Make ${rule.count} new video${rule.count > 1 ? 's' : ''}`, when, what: rule.category ? `Category: ${rule.category}` : 'Topics from your categories' }
    : { title: platformName(rule.platform), when, what: `Posts the ${rule.pick === 'newest' ? 'newest' : 'oldest'} ready video${rule.privacy ? ` · ${rule.privacy}` : ''}` };
}

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
    <form className="card grow-3" onSubmit={save} aria-labelledby="ed-h">
      <h2 id="ed-h">{f.id ? 'Edit rule' : 'New rule'}</h2>
      <div className="stack" style={{ gap: 8 }}>
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
      <div className="stack" style={{ gap: 8 }}>
        <span className="field">Repeat</span>
        {seg('mode', [['daily', 'Every day'], ['weekly', 'Some days'], ['custom', 'Custom cron']])}
      </div>
      {f.mode === 'weekly' && (
        <div className="inline" style={{ gap: 6 }} role="group" aria-label="Days">
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
        <label className="field" style={{ maxWidth: 360 }}>
          Times
          <input value={f.times} onChange={(e) => set('times', e.target.value)} placeholder="09:00, 18:00" />
          <span className="hint">24-hour clock, separated by commas.</span>
        </label>
      )}
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
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              Caption
              <textarea className="mono" value={f.caption} onChange={(e) => set('caption', e.target.value)} placeholder={'{title}\n\n{hashtags}'} />
              <span className="hint">Placeholders: {'{title}'}, {'{description}'}, {'{hashtags}'}. Empty = title + hashtags.</span>
            </label>
          )}
        </div>
      )}
      <div className="between">
        <span className="muted" role="status">
          {preview.error ? <span style={{ color: 'var(--danger)' }}>{preview.error}</span> : preview.next.length ? <>Next runs: <strong style={{ color: 'var(--ink)' }}>{preview.next.map(fmtTime).join(' · ')}</strong></> : '…'}
        </span>
        <div className="inline">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={Boolean(preview.error)}>Save rule</button>
        </div>
      </div>
    </form>
  );
}

export default function Schedule() {
  const { brands, picked, brandName } = useBrands();
  const { data: rules, reload } = usePoll(withBrand('/api/rules', picked), 15000);
  const { data: week, reload: reloadWeek } = usePoll(withBrand('/api/schedule/week', picked), 30000);
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
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      const key = d.toDateString();
      out.push({ d, key, slots: (week || []).filter((s) => new Date(s.at).toDateString() === key) });
    }
    return out;
  }, [week]);

  return (
    <div className="container">
      <header className="between">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Schedule</h1>
          <p className="muted" style={{ margin: 0 }}>When videos get made, and when each platform gets one. A slot missed while the PC was off runs once when it is back.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(newRule())}>
          <Icon d={ICONS.plus} size={16} /> New rule
        </button>
      </header>

      <section className="card card-tight" aria-labelledby="rules-h">
        <h2 id="rules-h" className="eyebrow">Rules</h2>
        {rules && rules.length === 0 && <p className="empty">No rules yet. Start with “Make 2 videos every night” and “Publish to YouTube at 18:00”.</p>}
        {(rules || []).map((r) => {
          const d = describe(r);
          return (
            <div className="list-row" key={r.id}>
              <PlatformBadge id={r.kind === 'make' ? 'make' : r.platform} />
              <div className="stack" style={{ gap: 2, flex: '2 1 240px', minWidth: 0 }}>
                <strong id={`rule-${r.id}`}>{d.title}</strong>
                <span style={{ color: 'var(--ink-2)' }}>{d.when} <span className="faint">({r.tz})</span></span>
                <span className="faint">{d.what}</span>
                {chip(r.brandId) && <div className="inline">{chip(r.brandId)}</div>}
              </div>
              <code className="mono" style={{ background: 'var(--neutral-bg)', borderRadius: 8, padding: '6px 10px' }}>{r.cron}</code>
              <div className="stack" style={{ gap: 2, flex: '1 1 140px' }}>
                <span className="faint">Next run</span>
                <strong style={{ fontSize: 13.5 }}>{r.enabled && r.next[0] ? fmtTime(r.next[0]) : 'Off'}</strong>
              </div>
              <Switch checked={r.enabled} onChange={(v) => toggle(r, v)} labelledBy={`rule-${r.id}`} />
              <button type="button" className="btn btn-sm" onClick={() => edit(r)}>Edit</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(r)} aria-label={`Delete ${d.title} rule`}>Delete</button>
            </div>
          );
        })}
      </section>

      {editing && (
        <div className="row">
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
        </div>
      )}

      <section className="card" aria-labelledby="week-h">
        <h2 id="week-h" className="eyebrow">Next 7 days</h2>
        <div className="table-wrap">
          <div className="week">
            {days.map(({ d, key, slots }, i) => (
              <div key={key} className={`day${i === 0 ? ' today' : ''}`}>
                <div className="stack" style={{ gap: 0 }}>
                  <span className="eyebrow" style={{ fontSize: 11 }}>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700 }}>{d.getDate()}</span>
                </div>
                {slots.length === 0 && <span className="faint">Nothing</span>}
                {slots.map((s, j) => (
                  <div className="slot" key={j}>
                    <PlatformBadge id={s.kind === 'make' ? 'make' : s.platform} small />
                    {new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {s.kind === 'make' && <Chip tone="info">make {s.count}</Chip>}
                    {chip(s.brandId)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      {toast}
    </div>
  );
}
