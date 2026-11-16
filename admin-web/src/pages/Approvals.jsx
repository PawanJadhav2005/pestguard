import { useEffect, useState } from 'react';
import { api, fileUrl } from '../api';
import { fmt, useApi } from '../hooks';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useToast } from '../components/ui';

// Treatment reports arrive here the moment a technician submits them (live event).
export default function Approvals() {
  const [status, setStatus] = useState('submitted');
  const r = useApi(`/reports?status=${status}`, ['report:submitted', 'report:reviewed']);
  const [open, setOpen] = useState(null);
  const items = r.data?.items || [];
  return <>
    <div className="spread">
      <div className="chips">{[['submitted', 'Waiting for approval'], ['returned', 'Returned'], ['approved', 'Approved']].map(([k, l]) =>
        <button key={k} className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <span className="muted sm">New reports appear here automatically.</span>
    </div>
    {r.loading ? <Loading /> : r.error ? <ErrorBox msg={r.error} retry={r.reload} /> : items.length === 0 ?
      <div className="card"><Empty title={status === 'submitted' ? 'No reports waiting' : 'Nothing here'}>{status === 'submitted' && 'When a technician submits a treatment report it shows up here instantly.'}</Empty></div> :
      <div className="card"><div className="table-wrap"><table>
        <thead><tr><th>Job</th><th>Customer</th><th>Technician</th><th>Chemicals used</th><th>Submitted</th><th className="right"></th></tr></thead>
        <tbody>{items.map(x => <tr key={x.id}>
          <td><b>JB-{x.job_id}</b><span className="sub">{x.service_name} · {fmt.money(x.price)}</span></td>
          <td>{x.customer_name}<span className="sub">{x.customer_area}</span></td>
          <td>{x.technician_name}</td>
          <td className="sm">{x.items.length ? x.items.map(i => `${i.name}: ${fmt.num(i.quantity)} ${i.unit}`).join(' · ') : <span className="muted">None</span>}</td>
          <td className="num">{fmt.dt(x.submitted_at)}</td>
          <td className="right"><button className={`btn sm ${status === 'submitted' ? 'primary' : ''}`} onClick={() => setOpen(x)}>{status === 'submitted' ? 'Review' : 'View'}</button></td>
        </tr>)}</tbody></table></div></div>}
    {open && <Review report={open} onClose={() => setOpen(null)} />}
  </>;
}

function Photo({ name, label, sig }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let on = true; fileUrl(name).then(u => on && setUrl(u)); return () => { on = false; }; }, [name]);
  return <div className={`photo ${sig ? 'sig' : ''}`}>{name ? (url ? <img src={url} alt={label} /> : <span className="spinner" />) : `No ${label.toLowerCase()}`}<span className="cap">{label}</span></div>;
}

function Review({ report: x, onClose }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const act = async kind => {
    if (kind === 'return' && comment.trim().length < 4) return setErr('Write what the technician needs to fix.');
    setBusy(true); setErr('');
    try {
      await api(`/reports/${x.id}/${kind}`, { method: 'POST', body: kind === 'return' ? { comment } : {} });
      toast(kind === 'approve' ? `JB-${x.job_id} approved and closed` : `JB-${x.job_id} returned to ${x.technician_name}`); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Modal wide title={`JB-${x.job_id} · ${x.service_name}`} sub={`${x.customer_name} · by ${x.technician_name} · ${fmt.dt(x.submitted_at)}`} onClose={onClose}
    footer={x.status === 'submitted' ? <><button className="btn" onClick={onClose}>Close</button>
      <button className="btn danger" disabled={busy} onClick={() => act('return')}>Return for correction</button>
      <button className="btn good" disabled={busy} onClick={() => act('approve')}>Approve and close job</button></> : <button className="btn" onClick={onClose}>Close</button>}>
    <dl className="kv">
      <dt>Status</dt><dd><Badge hue={{ submitted: 'violet', approved: 'green', returned: 'amber' }[x.status]}>{x.status}</Badge></dd>
      <dt>Areas treated</dt><dd>{x.areas.join(', ')}</dd>
      <dt>Safety checklist</dt><dd>{x.safety_confirmed ? 'Completed' : 'Not confirmed'}</dd>
      <dt>Amount</dt><dd>{fmt.money(x.price)} ({x.property_type})</dd>
      {x.notes && <><dt>Notes</dt><dd>{x.notes}</dd></>}
      {x.admin_comment && <><dt>Your comment</dt><dd>{x.admin_comment}</dd></>}
    </dl>
    <div><h3 style={{ marginBottom: 8 }}>Chemicals used</h3>
      {x.items.length ? <table><tbody>{x.items.map(i => <tr key={i.item_id}><td>{i.name}</td><td className="right num"><b>{fmt.num(i.quantity)} {i.unit}</b></td></tr>)}</tbody></table>
        : <span className="muted sm">None logged</span>}
      <div className="muted sm" style={{ marginTop: 6 }}>Already deducted from inventory when the report was submitted.</div></div>
    <div className="photos"><Photo name={x.before_photo} label="Before" /><Photo name={x.after_photo} label="After" /><Photo name={x.signature} label="Signature" sig /></div>
    {x.status === 'submitted' && <Field label="Comment (needed to return)"><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="e.g. Please add a photo of the treated kitchen area" /></Field>}
    {err && <div className="err">{err}</div>}
  </Modal>;
}
