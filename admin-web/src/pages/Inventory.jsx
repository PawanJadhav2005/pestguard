import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmt, useApi } from '../hooks';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useToast } from '../components/ui';

const CATS = { chemical: 'Chemical', consumable: 'Consumable', equipment: 'Equipment', safety: 'Safety gear' };
const REASON = { stock_in: ['Stock added', 'green'], stock_out: ['Stock removed', 'red'], adjustment: ['Count corrected', 'blue'],
  job_usage: ['Used on job', 'amber'], job_usage_reversed: ['Returned from report', 'violet'] };

// Inventory updates automatically: stock added/removed here, or used in a
// technician's report, pushes a live event and this list reloads by itself.
export default function Inventory() {
  const items = useApi('/inventory', ['inventory:changed']);
  const moves = useApi('/inventory/movements?limit=60', ['inventory:changed']);
  const [tab, setTab] = useState('stock');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [modal, setModal] = useState(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (items.pulse) { setFlash(true); const t = setTimeout(() => setFlash(false), 1500); return () => clearTimeout(t); } }, [items.pulse]);

  const list = useMemo(() => (items.data?.items || []).filter(i =>
    (!cat || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase()))), [items.data, q, cat]);
  const all = items.data?.items || [];
  const low = all.filter(i => i.active && i.low);
  const value = all.filter(i => i.active).reduce((s, i) => s + i.quantity * i.cost_per_unit, 0);

  return <>
    {all.some(i => i.active && i.category !== 'equipment' && Number(i.quantity) === 0) && <div className="error-box" style={{ background: '#fff6e5', color: '#8a5600' }}>
      Some items show 0 in stock. Technicians can't log chemicals that aren't in stock, so use <b>+ Add</b> to enter the opening stock for each item.</div>}
    <div className="tiles">
      <div className="tile" style={{ '--h': 'var(--forest-3)' }}><div className="l">Items in use</div><div className="v">{all.filter(i => i.active).length}</div></div>
      <div className="tile" style={{ '--h': 'var(--bad)' }}><div className="l">Low stock</div><div className="v">{low.length}</div></div>
      <div className="tile" style={{ '--h': 'var(--info)' }}><div className="l">Stock value</div><div className="v">{fmt.money(Math.round(value))}</div></div>
      <div className="tile" style={{ '--h': 'var(--warn)' }}><div className="l">Used on jobs, 30 days</div><div className="v">{all.filter(i => i.used_30d > 0).length} items</div></div>
    </div>

    <div className="card">
      <div className="card-head">
        <div className="toolbar">
          <div className="seg"><button aria-pressed={tab === 'stock'} onClick={() => setTab('stock')}>Stock</button><button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>History</button></div>
          {tab === 'stock' && <>
            <input className="input search" placeholder="Search name or SKU" value={q} onChange={e => setQ(e.target.value)} aria-label="Search inventory" />
            <select className="input" value={cat} onChange={e => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </>}
          {flash && <span className="updated">Updated just now</span>}
        </div>
        <button className="btn primary" onClick={() => setModal({ type: 'new' })}>+ Add item</button>
      </div>

      {tab === 'stock' && (items.loading ? <Loading /> : items.error ? <ErrorBox msg={items.error} retry={items.reload} /> : list.length === 0 ?
        <Empty title={all.length ? 'No items match' : 'No inventory yet'}>{all.length ? 'Try another search.' : 'Add your first item, or import your inventory list (see README).'}</Empty> :
        <div className={`table-wrap ${flash ? 'flash' : ''}`}><table>
          <thead><tr><th>Item</th><th>Category</th><th>In stock</th><th>Reorder at</th><th>Used (30 days)</th><th>Value</th><th className="right">Actions</th></tr></thead>
          <tbody>{list.map(i => {
            const pct = i.reorder_level > 0 ? Math.min(100, i.quantity / (i.reorder_level * 3) * 100) : 100;
            return <tr key={i.id} style={{ opacity: i.active ? 1 : .5 }}>
              <td><b>{i.name}</b><span className="sub">{i.sku}{!i.active && ' · not in use'}</span></td>
              <td>{CATS[i.category]}</td>
              <td><div className="stock-cell"><span className="num"><b>{fmt.num(i.quantity)}</b> {i.unit} {i.low && <Badge hue="red">Low</Badge>}</span>
                <div className="track"><div className="fill" style={{ width: pct + '%', '--c': i.low ? 'var(--bad)' : 'var(--forest-3)' }} /></div></div></td>
              <td className="num">{fmt.num(i.reorder_level)} {i.unit}</td>
              <td className="num">{fmt.num(i.used_30d)} {i.unit}</td>
              <td className="num">{fmt.money(Math.round(i.quantity * i.cost_per_unit))}</td>
              <td className="right" style={{ whiteSpace: 'nowrap' }}>
                <button className="btn sm good" onClick={() => setModal({ type: 'adjust', item: i, reason: 'stock_in' })}>+ Add</button>{' '}
                <button className="btn sm" onClick={() => setModal({ type: 'adjust', item: i, reason: 'stock_out' })}>− Remove</button>{' '}
                <button className="btn sm" onClick={() => setModal({ type: 'edit', item: i })}>Edit</button>
              </td></tr>;
          })}</tbody></table></div>)}

      {tab === 'history' && (moves.loading ? <Loading /> : (moves.data?.items || []).length === 0 ? <Empty title="No stock changes yet" /> :
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>Item</th><th>Change</th><th>Balance</th><th>Type</th><th>By</th><th>Note</th></tr></thead>
          <tbody>{moves.data.items.map(m => <tr key={m.id}>
            <td className="num">{fmt.dt(m.created_at)}</td><td>{m.item_name}</td>
            <td className="num" style={{ color: m.change > 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>{m.change > 0 ? '+' : ''}{fmt.num(m.change)} {m.unit}</td>
            <td className="num">{fmt.num(m.balance_after)} {m.unit}</td>
            <td><Badge hue={REASON[m.reason][1]}>{REASON[m.reason][0]}</Badge>{m.job_id && <span className="sub">JB-{m.job_id}</span>}</td>
            <td>{m.user_name || '-'}</td><td className="sm">{m.note || '-'}</td></tr>)}</tbody></table></div>)}
    </div>

    {modal?.type === 'new' && <ItemModal onClose={() => setModal(null)} />}
    {modal?.type === 'edit' && <ItemModal item={modal.item} onClose={() => setModal(null)} />}
    {modal?.type === 'adjust' && <AdjustModal item={modal.item} initial={modal.reason} onClose={() => setModal(null)} />}
  </>;
}

function ItemModal({ item, onClose }) {
  const toast = useToast();
  const [f, setF] = useState(item ? { name: item.name, category: item.category, unit: item.unit, reorderLevel: item.reorder_level, costPerUnit: item.cost_per_unit, active: item.active }
    : { sku: '', name: '', category: 'chemical', unit: 'ml', quantity: 0, reorderLevel: 0, costPerUnit: 0 });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (item) await api(`/inventory/${item.id}`, { method: 'PATCH', body: f });
      else await api('/inventory', { method: 'POST', body: f });
      toast(item ? `${f.name} updated` : `${f.name} added to inventory`); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Modal title={item ? `Edit ${item.name}` : 'Add inventory item'} onClose={onClose}
    footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{item ? 'Save changes' : 'Add item'}</button></>}>
    {!item && <Field label="SKU / code" hint="A short unique code, e.g. CHM-GEL"><input value={f.sku} onChange={set('sku')} /></Field>}
    <Field label="Name"><input value={f.name} onChange={set('name')} placeholder="e.g. Imidacloprid 30.5% SC" /></Field>
    <div className="grid2">
      <Field label="Category"><select value={f.category} onChange={set('category')}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Unit"><select value={f.unit} onChange={set('unit')}>{['ml', 'L', 'g', 'kg', 'pcs', 'blocks', 'packs'].map(u => <option key={u}>{u}</option>)}</select></Field>
    </div>
    <div className="grid2">
      {!item && <Field label="Opening stock"><input type="number" min="0" value={f.quantity} onChange={set('quantity')} /></Field>}
      <Field label="Alert me when stock falls to"><input type="number" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} /></Field>
      <Field label="Cost per unit (₹)"><input type="number" min="0" step="0.01" value={f.costPerUnit} onChange={set('costPerUnit')} /></Field>
    </div>
    {item && <label className="row"><input type="checkbox" checked={f.active} onChange={set('active')} /> In use (untick to hide it from technicians)</label>}
    {err && <div className="err">{err}</div>}
  </Modal>;
}

function AdjustModal({ item, initial, onClose }) {
  const toast = useToast();
  const [reason, setReason] = useState(initial);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const n = Number(qty);
  const after = reason === 'stock_in' ? item.quantity + n : reason === 'stock_out' ? item.quantity - n : n;
  const save = async () => {
    if (!qty || n < 0 || (reason !== 'adjustment' && n <= 0)) return setErr('Enter a quantity');
    setBusy(true); setErr('');
    try {
      await api(`/inventory/${item.id}/adjust`, { method: 'POST', body: reason === 'adjustment' ? { reason, countedQuantity: n, note } : { reason, quantity: n, note } });
      toast(`${item.name}: now ${fmt.num(after)} ${item.unit}`); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Modal title={item.name} sub={`Currently ${fmt.num(item.quantity)} ${item.unit} in store`} onClose={onClose}
    footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
    <div className="seg">{[['stock_in', 'Add stock'], ['stock_out', 'Remove stock'], ['adjustment', 'Set counted stock']].map(([k, l]) =>
      <button key={k} aria-pressed={reason === k} onClick={() => setReason(k)}>{l}</button>)}</div>
    <Field label={reason === 'adjustment' ? `Counted quantity (${item.unit})` : `Quantity (${item.unit})`}>
      <input type="number" min="0" autoFocus value={qty} onChange={e => setQty(e.target.value)} /></Field>
    <Field label="Note"><input value={note} onChange={e => setNote(e.target.value)} placeholder={reason === 'stock_in' ? 'e.g. Purchase bill #4521' : reason === 'stock_out' ? 'e.g. Expired, damaged, issued to van' : 'e.g. Monthly stock count'} /></Field>
    {qty !== '' && <div className="sm">After saving: <b className="num" style={{ color: after < 0 ? 'var(--bad)' : 'inherit' }}>{fmt.num(after)} {item.unit}</b></div>}
    {err && <div className="err">{err}</div>}
  </Modal>;
}
