import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmt, useApi } from '../hooks';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useToast } from '../components/ui';

export default function Customers() {
  const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const [amc, setAmc] = useState(''); const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const r = useApi(`/customers?page=${page}&pageSize=20${dq ? `&q=${encodeURIComponent(dq)}` : ''}${amc ? `&amc=${amc}` : ''}`);
  const [open, setOpen] = useState(null); const [add, setAdd] = useState(false);
  const d = r.data; const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return <>
    <div className="card">
      <div className="card-head">
        <div className="toolbar">
          <input className="input search" placeholder="Search name, reference or address" value={q} onChange={e => setQ(e.target.value)} aria-label="Search customers" />
          <div className="chips">{[['', 'All'], ['active', 'AMC active'], ['renewal', 'Renewal due'], ['none', 'No AMC']].map(([k, l]) => <button key={k} className="chip" aria-pressed={amc === k} onClick={() => { setAmc(k); setPage(1); }}>{l}</button>)}</div>
        </div>
        <button className="btn primary" onClick={() => setAdd(true)}>+ Add customer</button>
      </div>
      {r.loading ? <Loading /> : r.error ? <ErrorBox msg={r.error} retry={r.reload} /> : d.items.length === 0 ? <Empty title="No customers found">{!dq && !amc && 'Add customers here or import your customer list (see README).'}</Empty> : <>
        <div className="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Mobile</th><th>Address</th><th>Property</th><th>Last service</th><th>AMC</th></tr></thead>
          <tbody>{d.items.map(c => <tr key={c.id}>
            <td><button className="link" onClick={() => setOpen(c.id)}>{c.name}</button><span className="sub">{c.ref}</span></td>
            <td className="num">{c.mobile || <span className="muted">-</span>}</td><td style={{ maxWidth: 280 }}>{c.address || <span className="muted">-</span>}</td><td>{c.propertyType}{c.category && c.category !== c.propertyType && <span className="sub">{c.category}</span>}</td>
            <td>{c.lastService ? <>{fmt.date(c.lastService.date)}<span className="sub">{fmt.money(c.lastService.price)}</span></> : '-'}</td>
            <td>{c.amc ? <Badge hue={new Date(c.amc.endDate) < new Date() ? 'red' : new Date(c.amc.endDate) < new Date(Date.now() + 30 * 864e5) ? 'amber' : 'green'}>{c.amc.visitsDone}/{c.amc.visitsTotal} · ends {fmt.date(c.amc.endDate)}</Badge> : '-'}</td>
          </tr>)}</tbody></table></div>
        <div className="pager"><span className="muted">{d.total} customers</span><div className="row">
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span>
          <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div></>}
    </div>
    {open && <CustomerModal id={open} onClose={() => setOpen(null)} />}
    {add && <AddCustomer onClose={() => { setAdd(false); r.reload(); }} />}
  </>;
}

function CustomerModal({ id, onClose }) {
  const r = useApi(`/customers/${id}`);
  if (r.loading) return <Modal title="Customer" onClose={onClose}><Loading /></Modal>;
  if (r.error) return <Modal title="Customer" onClose={onClose}><ErrorBox msg={r.error} /></Modal>;
  const { customer: c, amc, history, openJobs, calls } = r.data;
  return <Modal wide title={c.name} sub={[c.ref, c.category || c.propertyType, c.address].filter(Boolean).join(' · ')} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
    <dl className="kv"><dt>Mobile</dt><dd>{c.mobile || 'Not recorded'}</dd><dt>Area</dt><dd>{c.area || '-'}</dd>
      {amc[0] && <><dt>AMC</dt><dd>{amc[0].visits_done} of {amc[0].visits_total} visits · ends {fmt.date(amc[0].end_date)} · {fmt.money(amc[0].price)}</dd></>}</dl>
    {openJobs.length > 0 && <div><h3 style={{ marginBottom: 6 }}>Upcoming</h3>{openJobs.map(j => <div key={j.id} className="spread sm" style={{ padding: '4px 0' }}><span>JB-{j.id} · {fmt.dt(j.scheduled_at)} · {j.technician_name || 'unassigned'}</span><Badge>{j.status}</Badge></div>)}</div>}
    <div><h3 style={{ marginBottom: 6 }}>Service history</h3>{history.length ? <table><thead><tr><th>Date</th><th>Ref</th><th>Service</th><th>Technician</th><th className="right">Price</th></tr></thead>
      <tbody>{history.map(h => <tr key={h.src + h.id}><td>{fmt.date(h.date)}</td><td>{h.ref}</td><td>{h.description || h.service_code}</td><td>{h.technician_name || '-'}</td><td className="right num">{fmt.money(h.price)}</td></tr>)}</tbody></table> : <span className="muted sm">No past services</span>}</div>
    {calls.length > 0 && <div><h3 style={{ marginBottom: 6 }}>Calls</h3>{calls.map(l => <div key={l.id} className="sm" style={{ padding: '3px 0' }}><b>{l.outcome || l.status}</b> · {fmt.dt(l.created_at)} · {l.by_name}{l.notes && ` · ${l.notes}`}</div>)}</div>}
  </Modal>;
}

function AddCustomer({ onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ ref: '', name: '', mobile: '', address: '', area: '', propertyType: '2 BHK' });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try { const body = { ...f }; if (!body.ref) delete body.ref; await api('/customers', { method: 'POST', body }); toast(`${f.name} added`); onClose(); }
    catch (e) { setErr(e.message); }
  };
  return <Modal title="Add customer" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Add customer</button></>}>
    <div className="grid2"><Field label="Name"><input value={f.name} onChange={set('name')} /></Field><Field label="Mobile"><input value={f.mobile} onChange={set('mobile')} placeholder="+91 98xxxxxxxx" /></Field></div>
    <Field label="Address"><input value={f.address} onChange={set('address')} /></Field>
    <div className="grid2"><Field label="Area"><input value={f.area} onChange={set('area')} /></Field>
      <Field label="Property"><select value={f.propertyType} onChange={set('propertyType')}>{['1 BHK', '2 BHK', '3 BHK', 'Bungalow', 'Commercial'].map(p => <option key={p}>{p}</option>)}</select></Field></div>
    <Field label="Customer reference (optional)" hint="Leave blank to generate one"><input value={f.ref} onChange={set('ref')} /></Field>
    {err && <div className="err">{err}</div>}
  </Modal>;
}
