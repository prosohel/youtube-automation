import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { ALL, nameLang, notifyBrandsChanged, useBrands } from '../brand.js';
import { Chip, contentLang, Icon, ICONS, PlatformBadge, Switch } from '../components/ui.jsx';
import { buildPatch, FieldGrid, goTo, TestResult, useTests } from './Integrations.jsx';

// What each section of a brand card edits. Every key here is a brand key (the server sends no other in /api/brands/:id/settings).
const CHANNEL_KEYS = ['NICHE', 'VIDEO_INSTRUCTIONS', 'LANGUAGE', 'SCRIPT_MODE', 'VIDEO_FORMAT', 'TARGET_MINUTES', 'TOPIC_CATEGORIES', 'QUESTION_SOURCE', 'QUESTION_MIX', 'QUESTION_SUBJECT', 'QUESTIONS_PER_VIDEO', 'EXTRA_LINK'];
const YOUTUBE_KEYS = ['PRIVACY_STATUS', 'YT_CATEGORY_ID', 'YT_PLAYLIST', 'YT_NOTIFY_SUBSCRIBERS', 'SYNTHETIC_MEDIA'];
const LOOK_KEYS = ['THEME', 'VISUALS', 'DESIGN_MODE', 'DESIGN_MINUTES', 'THUMB_STYLE', 'THUMB_INTRO', 'SHOW_BRAND', 'BRAND_HANDLE'];
const SIGN_IN_KEYS = ['YOUTUBE_TOKEN', 'TIKTOK_ACCESS_TOKEN', 'TIKTOK_REFRESH_TOKEN'];

const pick = (schema, keys) => keys.map((k) => schema.find((s) => s.key === k)).filter(Boolean);
const enc = encodeURIComponent;
// A recorded account may have no name or id yet (a migrated sign-in whose channel is not confirmed): never print null.
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const sectionId = (brand, id) => `brand-${brand.id}-${id}`;

/** Delete asks twice, so one stray click cannot remove a brand. */
function DeleteButton({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirming(true)}>Delete</button>;
  }
  return (
    <>
      <button type="button" className="btn btn-sm btn-danger" onClick={async () => { await onDelete(); setConfirming(false); }}>Confirm delete</button>
      <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
    </>
  );
}

// The look of each thumbnail style as a small tile; unknown styles show their first letters.
const THUMB_GLYPHS = { bigText: 'Aa', versus: 'VS', question: '?', number: '10', warning: '!', arrow: '→', reaction: ':O', paper: '✎' };

/** The thumbnail styles as tiles: the same setting as the Thumbnail style select, picked by its look. */
function ThumbTiles({ spec, draft, setDraft, values }) {
  if (!spec) return null;
  const v = draft[spec.key] !== undefined ? draft[spec.key] : values[spec.key];
  const styles = spec.options.filter(Boolean);
  return (
    <div className="in-thumbs" role="group" aria-label="Thumbnail styles">
      {styles.map((o, i) => {
        const label = (spec.optionLabels && spec.optionLabels[o]) || o;
        return (
          <button key={o} type="button" className="in-thumb" aria-pressed={v === o} onClick={() => setDraft((d) => ({ ...d, [spec.key]: o }))}>
            <span className={`in-thumb-art t-${i % 8}`} aria-hidden="true">{THUMB_GLYPHS[o] || o.slice(0, 2)}</span>
            <span className="in-thumb-name">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One settings card of a brand, with its own draft and Save button. Everything it sends names `brand.id`. */
function Section({ brand, id, title, sub, platform, chip, blocks, data, reload, onChanged, setToast }) {
  const [draft, setDraft] = useState({});
  const specs = blocks.flatMap((b) => b.specs);
  const dirty = Object.keys(draft).length > 0;
  const fieldProps = { draft, setDraft, values: data.values, effective: data.effective || {}, lang: contentLang(data.values.LANGUAGE), idPrefix: `${brand.id}-` };
  const headId = `${sectionId(brand, id)}-h`;

  const save = async () => {
    try {
      await api.send('PUT', `/api/brands/${enc(brand.id)}/settings`, buildPatch(draft, specs));
      await reload(); // show the saved values before the draft goes away
      setDraft({});
      setToast(`${title} saved`);
      onChanged(); // the accounts shown in the brand panel may have changed
    } catch (e) {
      setToast(e.message);
    }
  };

  return (
    <section className="card" id={sectionId(brand, id)} aria-labelledby={headId}>
      <div className="in-card-head">
        <div className="in-card-title">
          {platform && <PlatformBadge id={platform} />}
          <h2 id={headId} tabIndex={-1}>{title}</h2>
          {chip}
        </div>
        <p className="faint">{sub}</p>
      </div>
      {blocks.map((b) => (
        <div key={b.id} className="in-block">
          {b.title && (
            <div className="in-block-head">
              <PlatformBadge id={b.platform} />
              <div>
                <strong>{b.title}</strong>
                {b.sub && <span className="faint">{b.sub}</span>}
              </div>
            </div>
          )}
          {b.note && <span className="faint">{b.note}</span>}
          <FieldGrid specs={b.specs} values={data.values} fieldProps={fieldProps} />
          {b.thumbs && <ThumbTiles spec={b.specs.find((s) => s.key === 'THUMB_STYLE')} draft={draft} setDraft={setDraft} values={data.values} />}
        </div>
      ))}
      <div className="in-card-foot">
        <div className="in-buttons">
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty} onClick={save} aria-label={`Save ${title}`}>Save</button>
        </div>
      </div>
    </section>
  );
}

/** The accounts of a brand as rows: who it posts as, and the button that connects, sets up or tests it. */
function accountRows(brand, values) {
  const a = brand.accounts || {};
  const isSet = (key) => Boolean(values && values[key] && values[key].set);
  // Until the brand's settings arrive, the accounts recorded on the brand stand in for its sign-ins.
  const yt = values ? isSet('YOUTUBE_TOKEN') : Boolean(a.youtube);
  const tt = values ? isSet('TIKTOK_REFRESH_TOKEN') || isSet('TIKTOK_ACCESS_TOKEN') : Boolean(a.tiktok);
  const ytName = a.youtube ? text(a.youtube.name) || text(a.youtube.id) : '';
  const ttUser = a.tiktok ? text(a.tiktok.username).replace(/^@/, '') : '';
  const igId = (a.instagram && text(a.instagram.id)) || text(values && values.INSTAGRAM_USER_ID);
  const fbId = (a.facebook && text(a.facebook.id)) || text(values && values.FACEBOOK_PAGE_ID);
  const ig = Boolean(a.instagram || igId);
  const fb = Boolean(a.facebook || fbId);
  return [
    {
      id: 'youtube', name: 'YouTube', on: yt, test: ['youtube', 'Test YouTube'],
      detail: yt ? (ytName ? `${ytName} · signed in` : 'Signed in') : 'Not signed in',
      href: `/api/youtube/connect?brand=${enc(brand.id)}`, action: yt ? 'Reconnect' : 'Connect',
    },
    {
      id: 'tiktok', name: 'TikTok', on: tt, test: ['tiktok', 'Test TikTok'],
      detail: tt ? (ttUser ? `@${ttUser} · signed in` : 'Signed in') : 'Not signed in',
      href: `/api/tiktok/connect?brand=${enc(brand.id)}`, action: tt ? 'Reconnect' : 'Connect',
    },
    { id: 'instagram', name: 'Instagram', on: ig, test: ['instagram', 'Test Instagram'], detail: ig ? (igId ? `Account ${igId}` : 'Connected') : 'Not set up', action: ig ? 'Edit' : 'Set up' },
    { id: 'facebook', name: 'Facebook', on: fb, test: ['facebook', 'Test Facebook'], detail: fb ? (fbId ? `Page ${fbId}` : 'Connected') : 'Not set up', action: fb ? 'Edit' : 'Set up' },
  ];
}

/** The teal panel of the brand on screen: its name, on/off switch, a one-line summary and its accounts. */
function BrandHero({ brand, values, focus, onChanged, setToast, results, runTest }) {
  const [name, setName] = useState(brand.name);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const cancelled = useRef(false); // Escape: leave without saving the typed name
  const activeId = `brand-active-${brand.id}`;
  const { data: overview } = usePoll(`/api/overview?brand=${enc(brand.id)}`, 60000);
  const { data: rules } = usePoll(`/api/rules?brand=${enc(brand.id)}`, 60000);

  useEffect(() => setName(brand.name), [brand.name]);
  useEffect(() => { if (focus && ref.current) ref.current.scrollIntoView({ block: 'start' }); }, [focus]);

  const update = async (patch, message) => {
    setBusy(true);
    try {
      await api.send('PUT', `/api/brands/${enc(brand.id)}`, patch);
      if (message) setToast(message);
      await onChanged();
    } catch (e) {
      setToast(e.message);
      setName(brand.name);
    } finally {
      setBusy(false);
    }
  };
  const rename = () => {
    const next = name.trim();
    if (cancelled.current) {
      cancelled.current = false;
      setName(brand.name);
    } else if (!next) setName(brand.name);
    else if (next !== brand.name) update({ name: next }, 'Name saved');
  };
  const remove = async () => {
    try {
      await api.send('DELETE', `/api/brands/${enc(brand.id)}`);
      setToast(`Deleted ${brand.name}`);
      await onChanged();
    } catch (e) {
      setToast(e.message); // e.g. the brand still has videos or rules
    }
  };

  const summary = [
    brand.active ? 'On, posting to its own accounts' : 'Off',
    values && text(values.LANGUAGE),
    values && values.VIDEO_FORMAT ? (values.VIDEO_FORMAT === 'shorts' ? 'Shorts' : 'Landscape') : '',
  ].filter(Boolean).join(' · ');
  const rows = accountRows(brand, values);
  // Videos are queued, working, ready (not posted yet), failed or published: together, every video of the brand.
  const c = overview && overview.counts;
  const stats = [
    ['Videos', c ? c.queued + c.working + c.ready + c.failed + c.published : null],
    ['Published', c ? c.published : null],
    ['Rules', rules ? rules.length : null],
  ];

  return (
    <section className="card card-hero in-hero" ref={ref} aria-label={`Brand ${brand.name}`}>
      <div className="in-hero-box">
        <div className="in-hero-top">
          <input
            className="brand-name-input"
            aria-label="Brand name"
            lang={nameLang(name)}
            value={name}
            maxLength={80}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
            }}
          />
          <span className="in-active">
            <span id={activeId}>Active</span>
            <Switch checked={brand.active} onChange={(v) => update({ active: v }, v ? 'Brand is on' : 'Brand is off')} labelledBy={activeId} disabled={busy} />
          </span>
        </div>
        <span className="in-summary">
          <Icon d={brand.active ? ICONS.check : ICONS.pause} size={14} />
          {summary}
        </span>
        <dl className="in-hero-stats">
          {stats.map(([label, n]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{n === null ? '–' : n}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="in-hero-sub">
        <h3>Accounts</h3>
        <span className="faint">Test buttons use the values already saved.</span>
      </div>
      <ul className="in-accts">
        {rows.map((r) => (
          <li key={r.id} className={`in-acct${r.on ? ' on' : ''}`}>
            <PlatformBadge id={r.id} />
            <div className="in-acct-text">
              <strong>{r.name}</strong>
              <span lang={nameLang(r.detail)}>{r.detail}</span>
            </div>
            <div className="in-acct-actions">
              {r.href ? (
                <a className="btn btn-sm" href={r.href} aria-label={`${r.action} ${r.name}`}>{r.action}</a>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => goTo(sectionId(brand, 'accounts'))} aria-label={`${r.action} ${r.name}`}>{r.action}</button>
              )}
              <button type="button" className="btn btn-sm" onClick={() => runTest(r.test[0])} aria-label={r.test[1]}>Test</button>
            </div>
            <TestResult result={results[r.test[0]]} />
          </li>
        ))}
      </ul>
      <div className="in-hero-foot">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => update({ archived: true }, `${brand.name} archived`)}>Archive</button>
        <DeleteButton onDelete={remove} />
      </div>
    </section>
  );
}

/** The brand on screen: its panel and keys on one side, its settings cards on the other. */
function BrandView({ brand, focus, onChanged, setToast, side }) {
  const { data, error, reload } = usePoll(`/api/brands/${enc(brand.id)}/settings`, 120000);
  const [results, runTest] = useTests(brand.id);

  let main;
  if (!data) {
    main = <p className="muted" role="status">{error || 'Loading…'}</p>;
  } else {
    const { schema, values } = data;
    const signedIn = Boolean(values.YOUTUBE_TOKEN && values.YOUTUBE_TOKEN.set);
    // Sign-ins come from the Connect buttons, never typed in.
    const group = (id) => schema.filter((s) => s.group === id && !SIGN_IN_KEYS.includes(s.key));
    const sections = [
      { id: 'channel', title: 'Channel', sub: 'What the videos are about', blocks: [{ id: 'channel', specs: pick(schema, CHANNEL_KEYS) }] },
      {
        id: 'youtube', title: 'YouTube upload', platform: 'youtube', sub: 'Privacy, category, playlist and labels',
        chip: signedIn ? null : <Chip tone="danger">Not signed in</Chip>,
        blocks: [{ id: 'youtube', specs: pick(schema, YOUTUBE_KEYS) }],
      },
      { id: 'voice', title: 'Voice', sub: 'Who narrates this brand’s videos', blocks: [{ id: 'voice', specs: group('voice') }] },
      { id: 'look', title: 'Look', sub: 'Theme, visuals and thumbnails', blocks: [{ id: 'look', specs: pick(schema, LOOK_KEYS), thumbs: true }] },
      {
        id: 'accounts',
        title: 'Accounts',
        sub: 'How each account posts',
        blocks: [
          {
            id: 'youtube', platform: 'youtube', title: 'YouTube', specs: [],
            sub: 'This brand’s own channel. Uploads stay private until Google approves your API project.',
            note: 'Posting checks the channel first and needs read access. If YouTube posts fail with “Reconnect YouTube for this brand”, connect again.',
          },
          {
            id: 'tiktok', platform: 'tiktok', title: 'TikTok', specs: group('tiktok'),
            sub: 'This brand’s own TikTok account. Until TikTok audits your app, posts are “Only me” and the account must be set to Private.',
            note: 'Sign in with this brand’s TikTok account and allow posting. It must be a target user of your TikTok sandbox.',
          },
          {
            id: 'meta', platform: 'instagram', title: 'Instagram and Facebook', specs: group('meta'),
            sub: 'A Page or Instagram account can belong to one brand only.',
          },
        ],
      },
    ];
    main = sections.map((s) => (
      <Section key={s.id} brand={brand} {...s} data={data} reload={reload} onChanged={onChanged} setToast={setToast} />
    ));
  }

  return (
    <div className="in-layout">
      <div className="in-side">
        <BrandHero brand={brand} values={data ? data.values : null} focus={focus} onChanged={onChanged} setToast={setToast} results={results} runTest={runTest} />
        {side}
      </div>
      <div className="in-main">{main}</div>
    </div>
  );
}

function ArchivedRow({ brand, onChanged, setToast }) {
  const [busy, setBusy] = useState(false);
  const unarchive = async () => {
    setBusy(true);
    try {
      await api.send('PUT', `/api/brands/${enc(brand.id)}`, { archived: false });
      setToast(`${brand.name} is back (switched off)`);
      await onChanged();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await api.send('DELETE', `/api/brands/${enc(brand.id)}`);
      setToast(`Deleted ${brand.name}`);
      await onChanged();
    } catch (e) {
      setToast(e.message);
    }
  };
  return (
    <li>
      <span>
        <strong lang={nameLang(brand.name)}>{brand.name}</strong>
        <Chip>Archived</Chip>
      </span>
      <span>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={unarchive}>Unarchive</button>
        <DeleteButton onDelete={remove} />
      </span>
    </li>
  );
}

function AddBrand({ brands, onAdded, onClose, setToast }) {
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const made = await api.send('POST', '/api/brands', { name: clean, copyFrom: copyFrom || undefined });
      setToast(`${made.name} added`);
      setName('');
      setCopyFrom('');
      await onAdded(made);
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="add-brand" className="card" onSubmit={submit} aria-labelledby="add-brand-h">
      <div className="in-card-head">
        <h2 id="add-brand-h">Add brand</h2>
        <p className="faint">Its own channel, voice, look and accounts</p>
      </div>
      <div className="fields">
        <label className="field">
          Name
          <input lang={nameLang(name)} value={name} maxLength={80} autoFocus={Boolean(onClose)} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Copy settings from
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Nothing (start with defaults)</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span className="hint">Copies the channel, voice and look. Accounts and sign-ins are never copied.</span>
        </label>
      </div>
      <div className="in-add-foot">
        {onClose && <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>}
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>Add brand</button>
      </div>
    </form>
  );
}

/**
 * The brands part of Integrations: a header with the brand switch and New brand, then one brand at a time
 * (its panel, `side` under it, and its settings cards). `head` is the title block on the left of the header.
 */
export default function Brands({ setToast, head, side }) {
  const { data, error, reload } = usePoll('/api/brands?archived=1', 60000);
  const { picked } = useBrands();
  const [params] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [adding, setAdding] = useState(false);

  const onChanged = useCallback(() => {
    notifyBrandsChanged(); // the sidebar picker and the other pages
    return reload();
  }, [reload]);
  const onAdded = useCallback(
    (made) => {
      setChosen(made.id);
      setAdding(false);
      return onChanged();
    },
    [onChanged],
  );

  // After a YouTube or TikTok sign-in we come back to /integrations?brand=<id>&youtube=...: show that brand.
  const returnedTo = params.get('youtube') || params.get('tiktok') ? params.get('brand') : null;
  // The brand picked in the sidebar is the one shown, until another is chosen here.
  useEffect(() => { if (picked && picked !== ALL) setChosen(picked); }, [picked]);
  useEffect(() => { if (returnedTo) setChosen(returnedTo); }, [returnedTo]);

  const live = (data || []).filter((b) => !b.archived);
  const archived = (data || []).filter((b) => b.archived);
  const current = live.find((b) => b.id === chosen) || live.find((b) => b.id === picked) || live[0] || null;
  const addOpen = adding || Boolean(data && live.length === 0);

  const archivedCard = data && (
    <section className="card" aria-labelledby="archived-h">
      <div className="between" style={{ flexWrap: 'nowrap' }}>
        <h2 id="archived-h" className="eyebrow">Archived brands</h2>
        <span className="inline in-archived-toggle" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <span id="show-archived" className="faint">Show archived ({archived.length})</span>
          <Switch checked={showArchived} onChange={setShowArchived} labelledBy="show-archived" />
        </span>
      </div>
      {showArchived && (
        archived.length === 0 ? (
          <span className="faint">No archived brands.</span>
        ) : (
          <ul className="in-archived-list">
            {archived.map((b) => <ArchivedRow key={b.id} brand={b} onChanged={onChanged} setToast={setToast} />)}
          </ul>
        )
      )}
    </section>
  );
  const sideCards = (
    <>
      {side}
      {archivedCard}
    </>
  );

  return (
    <>
      <header className="page-head in-page-head">
        {head}
        {/* With no brands the Add brand form is always open, so there is nothing to toggle. */}
        {data && live.length > 0 && (
          <div className="actions">
            {live.length > 1 && (
              <div role="radiogroup" aria-label="Brand shown" className="segmented in-brand-switch">
                {live.map((b) => (
                  <button key={b.id} type="button" role="radio" aria-checked={current && current.id === b.id} lang={nameLang(b.name)} title={b.name} onClick={() => setChosen(b.id)}>
                    {b.name}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="btn btn-primary in-new-brand" aria-expanded={addOpen} aria-controls={addOpen ? 'add-brand' : undefined} onClick={() => setAdding((o) => !o)}>
              <Icon d={ICONS.plus} size={16} />
              New brand
            </button>
          </div>
        )}
      </header>
      {addOpen && <AddBrand brands={live} onAdded={onAdded} onClose={live.length > 0 ? () => setAdding(false) : null} setToast={setToast} />}
      <section aria-label="Brands" className="stack" style={{ gap: 16 }}>
        {!data && <p className="muted" role="status">{error || 'Loading brands…'}</p>}
        {data && live.length === 0 && <p className="muted">No brands yet. Add one above.</p>}
        {current ? (
          <BrandView key={current.id} brand={current} focus={returnedTo === current.id} onChanged={onChanged} setToast={setToast} side={sideCards} />
        ) : (
          <div className="in-layout">
            <div className="in-side">{sideCards}</div>
            <div className="in-main" />
          </div>
        )}
      </section>
    </>
  );
}
