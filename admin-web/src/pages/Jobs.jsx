import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmt, useApi } from '../hooks';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useToast } from '../components/ui';

const VIEWS = [['attention', 'Needs attention'], ['today', 'Today'], ['open', 'All open'], ['done', 'Completed'], ['all', 'All']];

export default function Jobs() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('attention');
  const [tech, setTech] = useState('');
  const r = useApi(`/jobs?view=${view}${tech ? `&technicianId=${tech}` : ''}`, ['job:updated']);
  const staff = useApi('/staff');
  const techs = (staff.data?.items || []).filter(u => u.role === 'technician');
  const [newJob, setNewJob] = useState(false);
  const openId = params.get('open');
  const items = r.data?.items || [];
  return <>
    <div className="card">
      <div className="card-head">
        <div className="toolbar">
          <div className="chips">{VIEWS.map(([k, l]) => <button key={k} className="chip" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}</div>
          <select className="input" value={tech} onChange={e => setTech(e.target.value)} aria-label="Technician"><option value="">All technicians</option>{techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        <button className="btn primary" onClick={() => setNewJob(true)}>+ New job</button>
      </div>
      {r.loading ? <Loading /> : r.error ? <ErrorBox msg={r.error} retry={r.reload} /> : items.length === 0 ? <Empty title="No jobs here">{view === 'attention' && 'Every job is assigned and on time.'}</Empty> :
        <div className="table-wrap"><table>
          <thead><tr><th>Job</th><th>Customer</th><th>Scheduled</th><th>Technician</th><th>Status</th><th className="right"></th></tr></thead>
          <tbody>{items.map(j => <tr key={j.id}>
            <td><button className="link" onClick={() => setParams({ open: j.id })}>{j.ref}</button><span className="sub">{j.serviceName} · {j.propertyType} · {fmt.money(j.price)}</span></td>
            <td>{j.customer.name}<span className="sub">{j.customer.ref} · {j.customer.area}</span></td>
            <td className="num">{fmt.dt(j.scheduledAt)}</td>
            <td>{j.technicianName || <span className="muted">Unassigned</span>}</td>
            <td><Badge>{j.status}</Badge> {j.overdue && <Badge hue="red">Overdue</Badge>}</td>
            <td className="right"><button className="btn sm" onClick={() => setParams({ open: j.id })}>Open</button></td>
          </tr>)}</tbody></table></div>}
    </div>
    {openId && <JobModal id={openId} techs={techs} onClose={() => setParams({})} />}
    {newJob && <NewJob techs={techs} onClose={() => setNewJob(false)} />}
  </>;
}

function JobModal({ id, techs, onClose }) {
  const toast = useToast();
  const r = useApi(`/jobs/${id}`, ['job:updated']);
  const [mode, setMode] = useState(null);
  const [sel, setSel] = useState(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  if (r.loading) return <Modal title="Loading job" onClose={onClose}><Loading /></Modal>;
  if (r.error) return <Modal title="Job" onClose={onClose}><ErrorBox msg={r.error} /></Modal>;
  const { job: j, events, report } = r.data;
  const canChange = ['Pending', 'Assigned', 'Accepted', 'On Hold'].includes(j.status);
  const area = j.customer.area;
  const ranked = techs.filter(t => t.available && t.active && t.skills.includes(j.serviceCode))
    .sort((a, b) => ((a.area === area ? -3 : 0) + a.open_jobs) - ((b.area === area ? -3 : 0) + b.open_jobs));
  const best = ranked[0]?.id;
  const doAssign = async () => {
    const t = sel || best; if (!t) return setErr('Pick a technician');
    try { await api(`/jobs/${j.id}/assign`, { method: 'POST', body: { technicianId: t } }); toast(`${j.ref} assigned. The technician has been notified.`); setMode(null); r.reload(); }
    catch (e) { setErr(e.message); }
  };
  const doCancel = async () => {
    try { await api(`/jobs/${j.id}/cancel`, { method: 'POST', body: { reason } }); toast(`${j.ref} cancelled`); onClose(); } catch (e) { setErr(e.message); }
  };
  return <Modal wide title={`${j.ref} · ${j.serviceName}`} sub={<><Badge>{j.status}</Badge> {j.overdue && <Badge hue="red">Overdue</Badge>} {j.priority} priority · {j.infestation} infestation</>} onClose={onClose}
    footer={mode === 'assign' ? <><button className="btn" onClick={() => setMode(null)}>Back</button><button className="btn primary" onClick={doAssign}>Confirm</button></>
      : mode === 'cancel' ? <><button className="btn" onClick={() => setMode(null)}>Keep job</button><button className="btn danger" onClick={doCancel}>Cancel job</button></>
      : <>{canChange && <><button className="btn danger" onClick={() => { setErr(''); setMode('cancel'); }}>Cancel job</button>
          <button className="btn primary" onClick={() => { setErr(''); setSel(j.technicianId); setMode('assign'); }}>{j.technicianId ? 'Reassign' : 'Assign technician'}</button></>}
        <button className="btn" onClick={onClose}>Close</button></>}>
    {mode === 'assign' ? <div className="stack" style={{ gap: 8 }}>
      {techs.map(t => { const ok = t.available && t.active && t.skills.includes(j.serviceCode);
        return <button key={t.id} className="opt" disabled={!ok} aria-pressed={(sel || best) === t.id} onClick={() => setSel(t.id)}>
          <div style={{ flex: 1 }}><b>{t.name}</b> {t.id === best && <span className="tag">BEST MATCH</span>}<div className="muted sm">{t.area || '-'}{t.area === area ? ' (same area)' : ''} · {t.open_jobs} open jobs</div></div>
          <span className="muted sm">{!t.active ? 'Inactive' : !t.available ? 'On leave' : !t.skills.includes(j.serviceCode) ? 'Not trained' : ''}</span></button>; })}
    </div> : mode === 'cancel' ? <Field label="Reason"><textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Customer travelling, will call back" /></Field> : <>
      <dl className="kv">
        <dt>Customer</dt><dd>{j.customer.name} ({j.customer.ref})</dd>
        <dt>Mobile</dt><dd>{j.customer.mobile || '-'} <span className="muted sm">· visible to admins only</span></dd>
        <dt>Address</dt><dd>{j.customer.address}</dd>
        <dt>Scheduled</dt><dd>{fmt.dt(j.scheduledAt)}</dd>
        <dt>Technician</dt><dd>{j.technicianName || 'Not assigned'}</dd>
        <dt>Price</dt><dd>{fmt.money(j.price)} · {j.propertyType} · warranty {j.warranty}</dd>
        {j.amc && <><dt>AMC</dt><dd>{j.amc.visitsDone} of {j.amc.visitsTotal} visits done</dd></>}
        {j.notes && <><dt>Notes</dt><dd>{j.notes}</dd></>}
        {report && <><dt>Report</dt><dd>{report.areas.join(', ')} · {report.items.map(i => `${i.name} ${fmt.num(i.quantity)} ${i.unit}`).join(', ') || 'no chemicals'}</dd></>}
      </dl>
      <div><h3 style={{ marginBottom: 8 }}>History</h3><ul className="timeline">{[...events].reverse().map((e, i) => <li key={i}><span className="muted num">{fmt.dt(e.created_at)}</span><span>{e.text}</span></li>)}</ul></div>
    </>}
    {err && <div className="err">{err}</div>}
  </Modal>;
}

function NewJob({ techs, onClose }) {
  const toast = useToast();
  const services = useApi('/services');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [cust, setCust] = useState(null);
  const tomorrow = new Date(Date.now() + 864e5); tomorrow.setHours(11, 0, 0, 0);
  const local = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  const [f, setF] = useState({ serviceCode: 'gpc', plan: 'once', priority: 'Normal', infestation: 'Medium', scheduledAt: local(tomorrow), notes: '', technicianId: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => api(`/customers?pageSize=6&q=${encodeURIComponent(q)}`).then(r => setResults(r.items)).catch(() => {}), 250); return () => clearTimeout(t); }, [q]);
  const svc = services.data?.items.find(s => s.code === f.serviceCode);
  const unit = svc && cust ? svc.prices[cust.propertyType] : null;
  const total = unit ? (f.plan === 'amc' ? Math.round(unit * 2.4 / 10) * 10 : unit) : null;
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!cust) return setErr('Choose a customer');
    setBusy(true); setErr('');
    try {
      const r = await api('/jobs', { method: 'POST', body: { customerId: cust.id, serviceCode: f.serviceCode, plan: f.plan, priority: f.priority, infestation: f.infestation,
        scheduledAt: new Date(f.scheduledAt).toISOString(), notes: f.notes || undefined, technicianId: f.technicianId ? Number(f.technicianId) : undefined } });
      toast(`${r.job.ref} created`); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Modal title="New job" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Create job</button></>}>
    <Field label="Customer">{cust ? <div className="opt" style={{ cursor: 'default' }}><div style={{ flex: 1 }}><b>{cust.name}</b><div className="muted sm">{cust.ref} · {cust.area} · {cust.propertyType}</div></div><button className="link" onClick={() => setCust(null)}>Change</button></div>
      : <><input placeholder="Search name or reference" value={q} onChange={e => setQ(e.target.value)} autoFocus />
        <div className="stack" style={{ gap: 6 }}>{results.map(c => <button key={c.id} className="opt" onClick={() => setCust(c)}><div><b>{c.name}</b><div className="muted sm">{c.ref} · {c.area}</div></div></button>)}</div></>}</Field>
    <div className="grid2">
      <Field label="Service"><select value={f.serviceCode} onChange={set('serviceCode')}>{(services.data?.items || []).filter(s => s.active).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
      <Field label="Plan"><select value={f.plan} onChange={set('plan')}><option value="once">One-time</option><option value="amc">AMC · 3 visits a year</option></select></Field>
      <Field label="Priority"><select value={f.priority} onChange={set('priority')}>{['Low', 'Normal', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}</select></Field>
      <Field label="Infestation"><select value={f.infestation} onChange={set('infestation')}>{['Low', 'Medium', 'High'].map(p => <option key={p}>{p}</option>)}</select></Field>
    </div>
    <Field label="Visit time"><input type="datetime-local" value={f.scheduledAt} onChange={set('scheduledAt')} /></Field>
    <Field label="Technician (optional)"><select value={f.technicianId} onChange={set('technicianId')}><option value="">Assign later</option>
      {techs.filter(t => t.active && t.available && t.skills.includes(f.serviceCode)).map(t => <option key={t.id} value={t.id}>{t.name} · {t.area} · {t.open_jobs} open</option>)}</select></Field>
    <Field label="Notes"><textarea value={f.notes} onChange={set('notes')} placeholder="e.g. Cockroaches in kitchen for 2 weeks" /></Field>
    {total && <div className="spread"><span className="muted">Total</span><b style={{ fontSize: 20, fontFamily: 'var(--display)' }}>{fmt.money(total)}</b></div>}
    {err && <div className="err">{err}</div>}
  </Modal>;
}
