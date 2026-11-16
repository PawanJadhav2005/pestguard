import { useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { Loading, useToast } from '../components/ui';

const PROPS = ['1 BHK', '2 BHK', '3 BHK', 'Bungalow', 'Commercial'];
export default function Settings() {
  const r = useApi('/services');
  if (r.loading) return <Loading />;
  return <div className="card">
    <div className="card-head"><h3>Service prices</h3><span className="muted sm">New prices apply to new bookings only. Past jobs keep the price they were booked at.</span></div>
    <div className="table-wrap"><table>
      <thead><tr><th>Service</th>{PROPS.map(p => <th key={p}>{p} (₹)</th>)}<th>Warranty</th><th></th></tr></thead>
      <tbody>{r.data.items.map(s => <Row key={s.code} s={s} onSaved={r.reload} />)}</tbody></table></div>
  </div>;
}
function Row({ s, onSaved }) {
  const toast = useToast();
  const [p, setP] = useState(s.prices);
  const [w, setW] = useState(s.warranty);
  const dirty = JSON.stringify(p) !== JSON.stringify(s.prices) || w !== s.warranty;
  const save = async () => {
    try { await api(`/services/${s.code}`, { method: 'PATCH', body: { prices: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Number(v)])), warranty: w } }); toast(`${s.name} prices saved`); onSaved(); }
    catch (e) { toast(e.message, true); }
  };
  return <tr><td><b>{s.name}</b></td>
    {PROPS.map(k => <td key={k}><input className="input num" style={{ width: 92 }} type="number" min="1" value={p[k] ?? ''} onChange={e => setP({ ...p, [k]: e.target.value })} aria-label={`${s.name} ${k}`} /></td>)}
    <td><input className="input" style={{ width: 110 }} value={w} onChange={e => setW(e.target.value)} aria-label={`${s.name} warranty`} /></td>
    <td><button className="btn sm primary" disabled={!dirty} onClick={save}>Save</button></td></tr>;
}
