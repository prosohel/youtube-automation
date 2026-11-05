import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import './styles.css';
import { usePoll } from './usePoll.js';
import { Icon, ICONS } from './components/ui.jsx';
import Overview from './pages/Overview.jsx';
import Queue from './pages/Queue.jsx';
import Schedule from './pages/Schedule.jsx';
import Integrations from './pages/Integrations.jsx';

function Sidebar() {
  const { data: health } = usePoll('/api/health', 10000);
  const { data: overview } = usePoll('/api/overview', 10000);
  const alive = health && health.worker.alive;
  const inQueue = overview ? overview.counts.queued + overview.counts.working : 0;
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark">
          <Icon d={ICONS.play} size={16} />
        </div>
        <div>
          <div className="brand-name">Automation Studio</div>
          <div className="brand-sub">Video automation</div>
        </div>
      </div>
      <div className="nav">
        <span className="nav-label">Workspace</span>
        <NavLink to="/" end>
          <Icon d={ICONS.overview} /> Overview
        </NavLink>
        <NavLink to="/queue">
          <Icon d={ICONS.queue} /> Queue
          {inQueue > 0 && <span className="count">{inQueue}</span>}
        </NavLink>
        <NavLink to="/schedule">
          <Icon d={ICONS.schedule} /> Schedule
        </NavLink>
        <NavLink to="/integrations">
          <Icon d={ICONS.plug} /> Integrations
        </NavLink>
      </div>
      <div className="worker-card">
        <strong className="inline" style={{ gap: 8 }}>
          <Icon d={ICONS.box} size={16} /> Docker worker
        </strong>
        <span className="inline" style={{ gap: 8 }}>
          <span className="dot" style={{ background: alive ? '#12b76a' : '#f04438' }} />
          {health ? (alive ? (overview && overview.paused ? 'Running, queue paused' : 'Running') : 'Not running') : 'Checking…'}
        </span>
        <small>Starts with Docker Desktop when the PC boots and picks up unfinished jobs.</small>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Sidebar />
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
    </BrowserRouter>
  );
}
