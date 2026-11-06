import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { nameLang, notifyBrandsChanged, useBrands } from '../brand.js';
import { Chip, contentLang, PlatformBadge, Switch } from '../components/ui.jsx';
import { buildPatch, Field } from './Integrations.jsx';

// What each section of a brand card edits. Every key here is a brand key (the server sends no other in /api/brands/:id/settings).
const CHANNEL_KEYS = ['NICHE', 'LANGUAGE', 'VIDEO_FORMAT', 'TARGET_MINUTES', 'TOPIC_CATEGORIES', 'PRIVACY_STATUS', 'YT_CATEGORY_ID', 'SYNTHETIC_MEDIA'];
const LOOK_KEYS = ['THEME', 'VISUALS', 'THUMB_STYLE', 'THUMB_INTRO', 'SHOW_BRAND', 'BRAND_HANDLE'];
const SIGN_IN_KEYS = ['YOUTUBE_TOKEN', 'TIKTOK_ACCESS_TOKEN', 'TIKTOK_REFRESH_TOKEN'];

const pick = (schema, keys) => keys.map((k) => schema.find((s) => s.key === k)).filter(Boolean);
const enc = encodeURIComponent;

/** The accounts a brand is connected to, as [platform, text] pairs. */
function accountChips(accounts) {
  const a = accounts || {};
  const out = [];
  // A recorded account may have no name or id yet (a migrated sign-in whose channel is not confirmed): never print null.
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  if (a.youtube) out.push(['youtube', `YouTube: ${text(a.youtube.name) || text(a.youtube.id) || 'signed in'}`]);
  if (a.tiktok) out.push(['tiktok', text(a.tiktok.username) ? `TikTok: @${text(a.tiktok.username).replace(/^@/, '')}` : 'TikTok: connected']);
  if (a.facebook) out.push(['facebook', text(a.facebook.id) ? `Facebook: Page ${text(a.facebook.id)}` : 'Facebook: connected']);
  if (a.instagram) out.push(['instagram', text(a.instagram.id) ? `Instagram: ${text(a.instagram.id)}` : 'Instagram: connected']);
  return out;
}

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

/** One section of a brand's settings, with its own draft, Save and Test buttons. Everything it sends names `brand.id`. */
function Section({ brand, title, blocks, data, reload, onChanged, setToast }) {
  const [draft, setDraft] = useState({});
  const [results, setResults] = useState({});
  const specs = blocks.flatMap((b) => b.specs);
  const dirty = Object.keys(draft).length > 0;
  const fieldProps = { draft, setDraft, values: data.values, effective: data.effective || {}, lang: contentLang(data.values.LANGUAGE), idPrefix: `${brand.id}-` };

  const save = async () => {
    try {
      await api.send('PUT', `/api/brands/${enc(brand.id)}/settings`, buildPatch(draft, specs));
      await reload(); // show the saved values before the draft goes away
      setDraft({});
      setToast(`${title} saved`);
      onChanged(); // the accounts shown in the header may have changed
    } catch (e) {
      setToast(e.message);
    }
  };
  const runTest = async (service) => {
    setResults((r) => ({ ...r, [service]: { ok: null, detail: 'Testing…' } }));
    const res = await api.send('POST', `/api/test/${service}?brand=${enc(brand.id)}`).catch((e) => ({ ok: false, detail: e.message }));
    setResults((r) => ({ ...r, [service]: res }));
  };

  return (
    <fieldset className="subpanel stack">
      <legend>{title}</legend>
      {blocks.map((b) => (
        <div key={b.id} className="stack" style={{ gap: 10 }}>
          {b.title && (
            <div className="inline" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <PlatformBadge id={b.platform} />
              <div className="stack" style={{ gap: 2 }}>
                <strong>{b.title}</strong>
                {b.sub && <span className="faint">{b.sub}</span>}
              </div>
            </div>
          )}
          {b.top}
          {b.specs.length > 0 && (
            <div className="fields">
              {b.specs.map((s) => <Field key={s.key} spec={s} value={data.values[s.key]} {...fieldProps} />)}
            </div>
          )}
          {b.tests && (
            <div className="between">
              <div className="stack" style={{ gap: 4 }}>
                {b.tests.map(([svc]) =>
                  results[svc] ? (
                    <span key={svc} role="status" style={{ fontSize: 13, color: results[svc].ok ? 'var(--ok)' : results[svc].ok === false ? 'var(--danger)' : 'var(--ink-3)' }}>
                      {results[svc].detail}
                    </span>
                  ) : null
                )}
              </div>
              <div className="inline">
                {b.tests.map(([svc, label]) => (
                  <button key={svc} type="button" className="btn btn-sm" onClick={() => runTest(svc)}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="between" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!dirty} onClick={save} aria-label={`Save ${title}`}>Save</button>
      </div>
    </fieldset>
  );
}

/** The settings of one brand, loaded when its card is opened. */
function BrandBody({ brand, onChanged, setToast }) {
  const { data, error, reload } = usePoll(`/api/brands/${enc(brand.id)}/settings`, 120000);
  if (!data) return <p className="muted" role="status">{error || 'Loading…'}</p>;

  const { schema, values } = data;
  const isSet = (key) => Boolean(values[key] && values[key].set);
  const signedIn = isSet('YOUTUBE_TOKEN');
  const tiktokSignedIn = isSet('TIKTOK_REFRESH_TOKEN') || isSet('TIKTOK_ACCESS_TOKEN');
  // Sign-ins come from the Connect buttons, never typed in.
  const group = (id) => schema.filter((s) => s.group === id && !SIGN_IN_KEYS.includes(s.key));
  const sections = [
    { id: 'channel', title: 'Channel', blocks: [{ id: 'channel', specs: pick(schema, CHANNEL_KEYS) }] },
    { id: 'voice', title: 'Voice', blocks: [{ id: 'voice', specs: group('voice') }] },
    { id: 'look', title: 'Look', blocks: [{ id: 'look', specs: pick(schema, LOOK_KEYS) }] },
    {
      id: 'accounts',
      title: 'Accounts',
      blocks: [
        {
          id: 'youtube', platform: 'youtube', title: 'YouTube', specs: [], tests: [['youtube', 'Test YouTube']],
          sub: 'This brand’s own channel. Uploads stay private until Google approves your API project.',
          top: (
            <div className="inline">
              {signedIn ? <Chip tone="ok">Signed in</Chip> : <Chip tone="danger">Not signed in</Chip>}
              <a className="btn btn-sm" href={`/api/youtube/connect?brand=${enc(brand.id)}`}>{signedIn ? 'Reconnect YouTube' : 'Connect YouTube'}</a>
              <span className="faint">Posting checks the channel first and needs read access. If YouTube posts fail with “Reconnect YouTube for this brand”, connect again.</span>
            </div>
          ),
        },
        {
          id: 'tiktok', platform: 'tiktok', title: 'TikTok', specs: group('tiktok'), tests: [['tiktok', 'Test TikTok']],
          sub: 'This brand’s own TikTok account. Until TikTok audits your app, posts are “Only me” and the account must be set to Private.',
          top: (
            <div className="inline">
              {tiktokSignedIn ? <Chip tone="ok">Signed in</Chip> : <Chip tone="danger">Not signed in</Chip>}
              <a className="btn btn-sm" href={`/api/tiktok/connect?brand=${enc(brand.id)}`}>{tiktokSignedIn ? 'Reconnect TikTok' : 'Connect TikTok'}</a>
              <span className="faint">Sign in with this brand’s TikTok account and allow posting. It must be a target user of your TikTok sandbox.</span>
            </div>
          ),
        },
        {
          id: 'meta', platform: 'instagram', title: 'Instagram and Facebook', specs: group('meta'), tests: [['instagram', 'Test Instagram'], ['facebook', 'Test Facebook']],
          sub: 'A Page or Instagram account can belong to one brand only.',
        },
      ],
    },
  ];
  return (
    <div className="stack">
      {sections.map((s) => (
        <Section key={s.id} brand={brand} title={s.title} blocks={s.blocks} data={data} reload={reload} onChanged={onChanged} setToast={setToast} />
      ))}
      <span className="faint">Test buttons use the values already saved.</span>
    </div>
  );
}

function BrandCard({ brand, isPicked, startOpen, focus, onChanged, setToast }) {
  const [open, setOpen] = useState(isPicked || startOpen);
  const [name, setName] = useState(brand.name);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const cancelled = useRef(false); // Escape: leave without saving the typed name
  const bodyId = `brand-body-${brand.id}`;
  const activeId = `brand-active-${brand.id}`;

  useEffect(() => { if (isPicked) setOpen(true); }, [isPicked]);
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

  const chips = accountChips(brand.accounts);
  return (
    <section className="card brand-card" ref={ref} aria-label={`Brand ${brand.name}`}>
      <div className="brand-card-head">
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
        <div className="inline">
          <span id={activeId} className="field">Active</span>
          <Switch checked={brand.active} onChange={(v) => update({ active: v }, v ? 'Brand is on' : 'Brand is off')} labelledBy={activeId} disabled={busy} />
        </div>
      </div>
      <div className="inline" style={{ gap: 6 }}>
        {chips.length === 0 && <Chip>Not connected</Chip>}
        {chips.map(([platform, text]) => (
          <Chip key={platform} tone="ok"><span lang={nameLang(text)}>{text}</span></Chip>
        ))}
      </div>
      <div className="between">
        <button type="button" className="link-btn" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide settings' : 'Show settings'}
        </button>
        <div className="inline">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => update({ archived: true }, `${brand.name} archived`)}>Archive</button>
          <DeleteButton onDelete={remove} />
        </div>
      </div>
      {open && (
        <div id={bodyId}>
          <BrandBody brand={brand} onChanged={onChanged} setToast={setToast} />
        </div>
      )}
    </section>
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
    <li className="between">
      <span className="inline">
        <strong lang={nameLang(brand.name)}>{brand.name}</strong>
        <Chip>Archived</Chip>
      </span>
      <span className="inline">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={unarchive}>Unarchive</button>
        <DeleteButton onDelete={remove} />
      </span>
    </li>
  );
}

function AddBrand({ brands, onAdded, setToast }) {
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
    <form className="subpanel stack" onSubmit={submit} aria-label="Add brand">
      <h3 style={{ fontSize: 15 }}>Add brand</h3>
      <div className="fields">
        <label className="field">
          Name
          <input lang={nameLang(name)} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
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
      <div className="between" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>Add brand</button>
      </div>
    </form>
  );
}

/** The Brands section of Integrations: one card per brand with its own settings and accounts. */
export default function Brands({ setToast }) {
  const { data, error, reload } = usePoll('/api/brands?archived=1', 60000);
  const { picked } = useBrands();
  const [params] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [justAdded, setJustAdded] = useState(null);

  const onChanged = useCallback(() => {
    notifyBrandsChanged(); // the sidebar picker and the other pages
    return reload();
  }, [reload]);
  const onAdded = useCallback(
    (made) => {
      setJustAdded(made.id);
      return onChanged();
    },
    [onChanged],
  );

  const live = (data || []).filter((b) => !b.archived);
  const archived = (data || []).filter((b) => b.archived);
  // After the YouTube sign-in Google sends us back to /integrations?brand=<id>&youtube=...: show that brand.
  const returnedTo = params.get('youtube') ? params.get('brand') : null;

  return (
    <section className="stack" aria-labelledby="brands-h">
      <div className="stack" style={{ gap: 4 }}>
        <h2 id="brands-h" style={{ fontSize: 20 }}>Brands</h2>
        <span className="faint">Each brand has its own channel settings, voice, look and accounts. Videos for a brand are posted only to that brand’s accounts.</span>
      </div>
      {!data && <p className="muted" role="status">{error || 'Loading brands…'}</p>}
      {data && live.length === 0 && <p className="muted">No brands yet. Add one below.</p>}
      {live.map((b) => (
        <BrandCard
          key={b.id}
          brand={b}
          isPicked={picked === b.id}
          startOpen={justAdded === b.id}
          focus={returnedTo === b.id}
          onChanged={onChanged}
          setToast={setToast}
        />
      ))}
      {data && (
        <div className="card">
          <AddBrand brands={live} onAdded={onAdded} setToast={setToast} />
          <div className="between">
            <span id="show-archived" className="field">Show archived ({archived.length})</span>
            <Switch checked={showArchived} onChange={setShowArchived} labelledBy="show-archived" />
          </div>
          {showArchived && (
            archived.length === 0 ? (
              <span className="faint">No archived brands.</span>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
                {archived.map((b) => <ArchivedRow key={b.id} brand={b} onChanged={onChanged} setToast={setToast} />)}
              </ul>
            )
          )}
        </div>
      )}
    </section>
  );
}
