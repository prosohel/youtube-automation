import { useEffect, useState } from 'react';

export const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', mono: 'YT' },
  { id: 'tiktok', name: 'TikTok', mono: 'TT' },
  { id: 'instagram', name: 'Instagram', mono: 'IG' },
  { id: 'facebook', name: 'Facebook', mono: 'FB' },
];
export const platformName = (id) => (PLATFORMS.find((p) => p.id === id) || { name: id }).name;

export function PlatformBadge({ id, small }) {
  const p = PLATFORMS.find((x) => x.id === id) || { name: 'Make videos', mono: 'AI', id: 'make' };
  return (
    <span className={`pbadge p-${p.id}${small ? ' sm' : ''}`} title={p.name} aria-label={p.name} role="img">
      {p.mono}
    </span>
  );
}

export function Chip({ tone = 'neutral', children }) {
  return <span className={`chip tone-${tone}`}>{children}</span>;
}

/** Small tag naming the brand a video, rule or slot belongs to (shown when every brand is listed together). */
export function BrandChip({ name, lang }) {
  if (!name) return null;
  return (
    <span className="chip tone-neutral brand-chip" title={`Brand: ${name}`}>
      <span className="sr-only">Brand: </span>
      <span lang={lang}>{name}</span>
    </span>
  );
}

export function Switch({ checked, onChange, label, labelledBy, describedBy, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={Boolean(checked)}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

/** Status of a video on one platform, as a coloured chip. */
export function PlatformStatus({ rec, platform }) {
  if (!rec) return <span className="faint">Not posted</span>;
  const tone = { published: 'ok', processing: 'info', uploading: 'info', pending: 'info', interrupted: 'warn', failed: 'danger', skipped: 'warn', removed: 'neutral' }[rec.status] || 'neutral';
  let label = { published: 'Published', processing: 'Processing', uploading: 'Uploading', pending: 'Waiting', interrupted: 'Will re-check', failed: 'Failed', skipped: 'Skipped', removed: 'Removed' }[rec.status] || rec.status;
  if (platform === 'youtube' && rec.status === 'published' && rec.privacy) label = rec.privacy[0].toUpperCase() + rec.privacy.slice(1);
  const chip = (
    <Chip tone={tone}>
      {label}
      {typeof rec.views === 'number' ? ` · ${rec.views.toLocaleString()} views` : ''}
    </Chip>
  );
  return rec.url ? (
    <a href={rec.url} target="_blank" rel="noreferrer" title={rec.error || rec.url}>
      {chip}
    </a>
  ) : rec.status === 'skipped' && rec.error ? (
    // Over a platform's length or size limit: the reason matters more than the chip.
    <span className="inline" style={{ gap: 6, alignItems: 'baseline' }}>
      {chip}
      <span className="faint" style={{ fontSize: '0.85em' }}>{rec.error}</span>
    </span>
  ) : (
    <span title={rec.error || ''}>{chip}</span>
  );
}

export const STAGES = ['topic', 'script', 'voice', 'render'];
const STAGE_NAMES = { topic: 'Topic', script: 'Script', voice: 'Voice', render: 'Render' };

export function StageBar({ video }) {
  const done = video.done || {};
  return (
    <ol className="stagebar" aria-label="Progress">
      {STAGES.map((s) => {
        const isDone = done[s];
        const active = !isDone && video.stage === s && video.status === 'working';
        return (
          <li key={s}>
            <div className="bar">
              <div style={{ width: isDone ? '100%' : active ? '50%' : '0%' }} />
            </div>
            <span className={`stage-label ${isDone ? 'is-done' : active ? 'is-active' : 'is-todo'}`}>
              {STAGE_NAMES[s]}
              {active ? ' …' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Posted on at least one platform. */
export const isPublished = (v) => Object.values(v.platforms || {}).some((p) => p.status === 'published');
/** Posted, but every posted copy is private (YouTube "private", TikTok "SELF_ONLY"), so nobody can see it yet. */
export const isPrivateOnly = (v) =>
  isPublished(v) && Object.values(v.platforms || {}).filter((p) => p.status === 'published').every((p) => ['private', 'SELF_ONLY'].includes(p.privacy));

/** One line naming the graphic Claude picked for a scene, e.g. "bars (3)" or "big number ৫ জিবি". */
export function graphicLabel(visual) {
  const v = visual || {};
  const n = (list) => (Array.isArray(list) ? list.length : 0);
  switch (v.type) {
    case 'bigNumber': return `big number ${v.value || ''}`.trim();
    case 'stat': return `stat ${v.value || ''}`.trim();
    case 'bars': return `bars (${n(v.bars)})`;
    case 'line': return `line (${n(v.points)} points)`;
    case 'donut': return `donut (${n(v.slices)})`;
    case 'timeline': return `timeline (${n(v.events)} events)`;
    case 'list': return `list (${n(v.items)})`;
    case 'compare': return 'compare';
    default: return v.icon ? `icon ${v.icon}` : 'icon';
  }
}

export const VIDEO_STATUS = {
  queued: ['neutral', 'Waiting'],
  working: ['info', 'Making'],
  ready: ['ok', 'Ready'],
  failed: ['danger', 'Failed'],
};

export function VideoStatus({ video }) {
  // A finished video that went out shows where it stands with viewers, not just "Ready".
  if (video.status === 'ready' && isPublished(video)) return <Chip tone="ok">{isPrivateOnly(video) ? 'Published · private' : 'Published'}</Chip>;
  const [tone, label] = VIDEO_STATUS[video.status] || ['neutral', video.status];
  return <Chip tone={tone}>{video.status === 'working' ? `${label}: ${video.stage}` : label}</Chip>;
}

/** "bn" for a Bangla channel, so typed and shown channel text is read with a Bangla voice. */
export const contentLang = (language) => (/bangla|bengali|\bbn\b/i.test(language || '') ? 'bn' : undefined);

export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

/** Bottom-right message that disappears after a few seconds. */
export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
  return [node, setMsg];
}

/** A stroke icon from ICONS; with fill it is painted solid instead (the play mark). */
export function Icon({ d, size = 18, fill = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

export const ICONS = {
  overview: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
  queue: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  schedule: ['M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  plug: ['M12 22v-5', 'M9 8V2', 'M15 8V2', 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z'],
  box: ['M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'],
  plus: ['M5 12h14', 'M12 5v14'],
  play: ['M6 3l14 9-14 9V3z'],
  pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  retry: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'm4.9 4.9 1.4 1.4', 'm17.7 17.7 1.4 1.4', 'M2 12h2', 'M20 12h2', 'm4.9 19.1 1.4-1.4', 'm17.7 6.3 1.4-1.4'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  monitor: ['M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 21h8', 'M12 17v4'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  chevronLeft: ['m15 18-6-6 6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  check: ['M20 6 9 17l-5-5'],
};
