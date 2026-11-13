import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import './styles.css';
import { usePoll } from './usePoll.js';
import { ALL, nameLang, useBrands, withBrand } from './brand.js';
import { useTheme } from './theme.js';
import { Icon, ICONS } from './components/ui.jsx';
import Overview from './pages/Overview.jsx';
import Queue from './pages/Queue.jsx';
import Schedule from './pages/Schedule.jsx';
import Integrations from './pages/Integrations.jsx';

const MODES = [
  ['light', 'Light', ICONS.sun],
  ['dark', 'Dark', ICONS.moon],
  ['auto', 'Auto', ICONS.monitor],
];
const MODE_NAME = { light: 'light', dark: 'dark', auto: 'auto (follows this device)' };

const signOut = async () => {
  await fetch('/logout', { method: 'POST' });
  window.location.assign('/login');
};

/** The brand picker; the sidebar (desktop) and the top bar (tablet, phone) each show one. */
function BrandSelect({ id, brands, picked, setPicked }) {
  return (
    <select id={id} value={picked} onChange={(e) => setPicked(e.target.value)}>
      <option value={ALL}>All brands</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id} lang={nameLang(b.name)}>
          {b.name}
          {b.active ? '' : ' (off)'}
        </option>
      ))}
    </select>
  );
}

function workerState(health, overview) {
  if (!health) return { cls: '', short: 'Checking', long: 'Checking…', color: 'var(--ink-4)' };
  if (!health.worker.alive) return { cls: 'off', short: 'Stopped', long: 'Not running', color: 'var(--dot-danger)' };
  if (overview && overview.paused) return { cls: 'paused', short: 'Paused', long: 'Running, queue paused', color: 'var(--dot-warn)' };
  return { cls: '', short: 'Running', long: 'Running', color: 'var(--dot-ok)' };
}

function Shell() {
  const { data: health } = usePoll('/api/health', 10000);
  const { brands, picked, setPicked } = useBrands();
  const { data: overview } = usePoll(withBrand('/api/overview', picked), 10000);
  const { mode, setMode, next } = useTheme();
  const inQueue = overview ? overview.counts.queued + overview.counts.working : 0;
  const worker = workerState(health, overview);
  const pickerProps = { brands, picked, setPicked };
  const nextMode = MODES[(MODES.findIndex(([m]) => m === mode) + 1) % MODES.length][0];
  const modeIcon = (MODES.find(([m]) => m === mode) || MODES[2])[2];

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">
            <Icon d={ICONS.play} size={16} fill />
          </div>
          <div>
            <div className="brand-name">Automation Studio</div>
            <div className="brand-sub">Video automation</div>
          </div>
        </div>
        <div className="brand-picker">
          <label htmlFor="brand-select" className="nav-label">Brand</label>
          <BrandSelect id="brand-select" {...pickerProps} />
        </div>
        <div className="nav">
          <span className="nav-label">Workspace</span>
          <NavLink to="/" end>
            <span className="nav-icon"><Icon d={ICONS.overview} /></span>
            Overview
          </NavLink>
          <NavLink to="/queue">
            <span className="nav-icon">
              <Icon d={ICONS.queue} />
              {inQueue > 0 && <span className="count" aria-label={`${inQueue} in the queue`}>{inQueue}</span>}
            </span>
            Queue
          </NavLink>
          <NavLink to="/schedule">
            <span className="nav-icon"><Icon d={ICONS.schedule} /></span>
            Schedule
          </NavLink>
          <NavLink to="/integrations">
            <span className="nav-icon"><Icon d={ICONS.plug} /></span>
            <span className="label-long">Integrations</span>
            <span className="label-short">Connect</span>
          </NavLink>
        </div>
        <div className="sidebar-foot">
          <div className="theme-switch" role="radiogroup" aria-label="Colour theme">
            {MODES.map(([m, label, icon]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                <Icon d={icon} size={14} /> {label}
              </button>
            ))}
          </div>
          <div className="worker-card">
            <strong className="inline" style={{ gap: 8 }}>
              <Icon d={ICONS.box} size={16} /> Docker worker
            </strong>
            <span className="inline" style={{ gap: 8 }}>
              <span className="dot" style={{ background: worker.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${worker.color} 22%, transparent)` }} />
              {worker.long}
            </span>
            <small>Starts with Docker Desktop when the PC boots and picks up unfinished jobs.</small>
          </div>
          {health && health.auth ? (
            <button type="button" className="btn btn-sm signout" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </nav>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-row">
            <div className="topbar-brand">
              <div className="brand-mark">
                <Icon d={ICONS.play} size={15} fill />
              </div>
              <span>Automation Studio</span>
            </div>
            <span className={`live-pill ${worker.cls}`} title={`Docker worker: ${worker.long}`}>
              <span className="dot" style={{ background: worker.color }} />
              {worker.short}
            </span>
            <button type="button" className="icon-btn" onClick={next} aria-label={`Colour theme: ${MODE_NAME[mode]}. Switch to ${MODE_NAME[nextMode]}`} title={`Theme: ${MODE_NAME[mode]}`}>
              <Icon d={modeIcon} size={18} />
            </button>
            {health && health.auth ? (
              <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
                <Icon d={ICONS.logout} size={18} />
              </button>
            ) : null}
          </div>
          <label className="topbar-picker" htmlFor="brand-select-top">
            <span>Brand</span>
            <BrandSelect id="brand-select-top" {...pickerProps} />
          </label>
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="*" element={<Overview />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
