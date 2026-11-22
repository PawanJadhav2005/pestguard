import { useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { Badge, ErrorBox, Field, Loading, Modal, useToast } from '../components/ui';

const SKILLS = { gpc: 'General', ter: 'Termite', bed: 'Bed bug', mos: 'Mosquito', rod: 'Rodent', san: 'Disinfection' };
const ROLE = { admin: 'Admin', callcenter: 'Call center', technician: 'Technician' };
export default function Team({ me }) {
  const toast = useToast();
  const r = useApi('/staff', ['job:updated']);
  const [add, setAdd] = useState(false);
  const patch = async (u, body, msg) => { try { await api(`/staff/${u.id}`, { method: 'PATCH', body }); toast(msg); r.reload(); } catch (e) { toast(e.message, true); } };
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox msg={r.error} retry={r.reload} />;
  const pending = r.data.items.filter(u => !u.approved);
  const reject = async u => { try { await api(`/staff/${u.id}`, { method: 'DELETE' }); toast(`${u.name}'s request was rejected`); r.reload(); } catch (e) { toast(e.message, true); } };
  return <>
    {pending.length > 0 && <div className="card"><div className="card-head"><h3>Waiting for approval ({pending.length})</h3><span className="muted sm">People who created an account in the app</span></div>
      <div className="table-wrap"><table><tbody>{pending.map(u => <tr key={u.id}>
        <td><b>{u.name}</b><span className="sub">{u.email} · {u.phone || 'no phone'}</span></td>
        <td><Badge hue={u.role === 'technician' ? 'green' : 'amber'}>{ROLE[u.role]}</Badge></td>
        <td className="right" style={{ whiteSpace: 'nowrap' }}>
          <button className="btn sm good" onClick={() => patch(u, { approved: true }, `${u.name} can sign in now`)}>Approve</button>{' '}
          <button className="btn sm danger" onClick={() => reject(u)}>Reject</button></td></tr>)}</tbody></table></div></div>}
    <div className="spread"><span className="muted">{r.data.items.length - pending.length} staff accounts</span><button className="btn primary" onClick={() => setAdd(true)}>+ Add staff</button></div>
    <div className="card"><div className="table-wrap"><table>
      <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Area</th><th>Skills</th><th>Open / done</th><th>Available</th><th>Active</th></tr></thead>
      <tbody>{r.data.items.filter(u => u.approved).map(u => <tr key={u.id} style={{ opacity: u.active ? 1 : .55 }}>
        <td><b>{u.name}</b><span className="sub">{u.email}</span></td><td><Badge hue={{ admin: 'violet', callcenter: 'amber', technician: 'green' }[u.role]}>{ROLE[u.role]}</Badge></td>
        <td className="num">{u.phone || <span className="muted">Missing</span>}</td><td>{u.area || '-'}</td>
        <td className="sm">{u.skills.map(s => SKILLS[s]).join(', ') || '-'}</td>
        <td className="num">{u.role === 'technician' ? `${u.open_jobs} / ${u.completed_jobs}` : '-'}</td>
        <td>{u.role === 'technician' ? <label className="switch" aria-label={`${u.name} available`}><input type="checkbox" checked={u.available} onChange={e => patch(u, { available: e.target.checked }, `${u.name} is ${e.target.checked ? 'available' : 'on leave'}`)} /><span /></label> : '-'}</td>
        <td>{u.id === me.id ? <span className="muted sm">You</span> : <label className="switch" aria-label={`${u.name} active`}><input type="checkbox" checked={u.active} onChange={e => patch(u, { active: e.target.checked }, `${u.name} ${e.target.checked ? 'can sign in' : 'can no longer sign in'}`)} /><span /></label>}</td>
      </tr>)}</tbody></table></div></div>
    <p className="muted sm">Staff phone numbers are used to connect masked calls: the staff phone rings first, then the customer.</p>
    {add && <AddStaff onClose={() => { setAdd(false); r.reload(); }} />}
  </>;
}
function AddStaff({ onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'technician', phone: '', area: '', skills: [] });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try { await api('/staff', { method: 'POST', body: { ...f, phone: f.phone || undefined, area: f.area || undefined } }); toast(`${f.name} added. Share the password with them privately.`); onClose(); }
    catch (e) { setErr(e.message); }
  };
  return <Modal title="Add staff member" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Add</button></>}>
    <div className="grid2"><Field label="Full name"><input value={f.name} onChange={set('name')} /></Field>
      <Field label="Role"><select value={f.role} onChange={set('role')}><option value="technician">Technician</option><option value="callcenter">Call center</option><option value="admin">Admin</option></select></Field></div>
    <div className="grid2"><Field label="Email (used to sign in)"><input type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label="Temporary password" hint="At least 8 characters"><input value={f.password} onChange={set('password')} /></Field></div>
    <div className="grid2"><Field label="Phone"><input value={f.phone} onChange={set('phone')} placeholder="+91 98xxxxxxxx" /></Field>
      <Field label="Base area"><input value={f.area} onChange={set('area')} /></Field></div>
    {f.role === 'technician' && <Field label="Skills"><div className="chips">{Object.entries(SKILLS).map(([k, l]) =>
      <button type="button" key={k} className="chip" aria-pressed={f.skills.includes(k)} onClick={() => setF({ ...f, skills: f.skills.includes(k) ? f.skills.filter(s => s !== k) : [...f.skills, k] })}>{l}</button>)}</div></Field>}
    {err && <div className="err">{err}</div>}
  </Modal>;
}
