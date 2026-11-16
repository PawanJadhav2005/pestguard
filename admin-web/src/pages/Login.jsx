import { useState } from 'react';
import { api, auth } from '../api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!email || !password) return setErr('Enter your email and password.');
    setBusy(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (r.user.role !== 'admin') { setErr('This portal is for admins. Technicians and call center staff use the mobile app.'); return; }
      auth.set(r.token); onLogin(r.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <div className="login">
    <section className="login-brand">
      <div className="logo"><i>✦</i>PestGuard</div>
      <div><h1>Admin portal</h1><p style={{ opacity: .85, maxWidth: '40ch' }}>Assign jobs, approve treatment reports and keep chemical stock up to date. Changes appear live.</p></div>
      <span style={{ opacity: .7, fontSize: 12.5 }}>Technicians and call center staff use the PestGuard mobile app.</span>
    </section>
    <section className="login-form">
      <form className="login-card" onSubmit={submit} noValidate>
        <h2 style={{ fontSize: 24 }}>Sign in</h2>
        <label className="field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" style={{ justifyContent: 'center', padding: 10 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section>
  </div>;
}
