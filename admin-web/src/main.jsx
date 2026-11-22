import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './styles.css';
import { api, auth, connectLive, live, on } from './api';
import { fmt, useApi } from './hooks';
import { ToastProvider, useToast } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Approvals from './pages/Approvals';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Team from './pages/Team';
import Calls from './pages/Calls';
import Settings from './pages/Settings';
import Import from './pages/Import';

const PAGES = [
  ['/', 'Dashboard', '▦'], ['/jobs', 'Jobs', '☰'], ['/approvals', 'Approvals', '✓'], ['/inventory', 'Inventory', '▤'],
  ['/customers', 'Customers', '☺'], ['/team', 'Team', '⚒'], ['/calls', 'Calls & follow-ups', '☎'], ['/settings', 'Services & prices', '⚙'], ['/import', 'Import data', '⇪']
];

function Shell({ user, onLogout }) {
  const [online, setOnline] = useState(false);
  const [pop, setPop] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const dash = useApi('/dashboard', ['report:submitted', 'report:reviewed', 'inventory:changed', 'job:updated']);
  const notifs = useApi('/notifications', ['notification']);

  useEffect(() => {
    const offs = [on('connect', () => setOnline(true)), on('disconnect', () => setOnline(false)), on('notification', n => toast(n.title))];
    const s = connectLive();
    return () => { offs.forEach(o => o()); s.disconnect(); };
  }, []);
  useEffect(() => setPop(false), [loc.pathname]);

  const c = dash.data?.counts || {};
  const counts = { '/approvals': [c.awaiting, false], '/jobs': [c.overdue + c.unassigned, true], '/inventory': [dash.data?.lowStock?.length, true] };
  const title = PAGES.find(p => p[0] === loc.pathname)?.[1] || 'PestGuard';
  const unread = notifs.data?.unread || 0;
  const markAll = async () => { await api('/notifications/read', { method: 'POST', body: {} }); notifs.reload(); };

  return (
    <div className="app">
      <aside className="side">
        <div className="logo"><i>✦</i><span>PestGuard</span></div>
        <nav className="nav" aria-label="Main">
          {PAGES.map(([to, label, ic]) => {
            const [n, alert] = counts[to] || [];
            return <NavLink key={to} to={to} end={to === '/'}><b aria-hidden="true">{ic}</b><span>{label}</span>{n ? <i className={`count ${alert ? 'alert' : ''}`}>{n}</i> : null}</NavLink>;
          })}
        </nav>
        <div className="side-foot"><b>{user.name}</b>Admin · <button className="link" style={{ color: '#fff' }} onClick={onLogout}>Sign out</button></div>
      </aside>
      <div className="main">
        <header className="top">
          <h1>{title}</h1>
          <span className={`live-dot ${online ? 'on' : ''}`} title={online ? 'Live updates on' : 'Reconnecting'}>{online ? 'Live' : 'Offline'}</span>
          <button className="icon-btn" aria-label="Notifications" onClick={() => setPop(p => !p)}>🔔{unread ? <span className="pip">{unread}</span> : null}</button>
          {pop && <div className="pop">
            <div className="pop-head"><h3>Notifications</h3>{unread > 0 && <button className="link sm" onClick={markAll}>Mark all as read</button>}</div>
            <div className="pop-list">{(notifs.data?.items || []).length ? notifs.data.items.map(n =>
              <button key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={async () => {
                await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }); notifs.reload();
                if (n.link) nav(n.link.startsWith('/jobs/') ? `/jobs?open=${n.link.split('/')[2]}` : n.link);
              }}><div style={{ fontWeight: n.read ? 500 : 700 }}>{n.title}</div><div className="muted sm">{fmt.ago(n.created_at)}</div></button>)
              : <div className="empty"><b>No notifications</b></div>}</div>
          </div>}
        </header>
        <main className="content"><div className="page">
          <Routes>
            <Route path="/" element={<Dashboard data={dash} />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/team" element={<Team me={user} />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/import" element={<Import />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div></main>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!auth.token);
  const logout = () => { auth.set(null); live()?.disconnect(); setUser(null); };
  useEffect(() => {
    auth.onUnauthorized(logout);
    if (!auth.token) return;
    api('/auth/me').then(r => r.user.role === 'admin' ? setUser(r.user) : logout()).catch(logout).finally(() => setChecking(false));
  }, []);
  if (checking) return null;
  if (!user) return <Login onLogin={u => setUser(u)} />;
  return <Shell user={user} onLogout={logout} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode><ToastProvider><BrowserRouter><App /></BrowserRouter></ToastProvider></StrictMode>
);
