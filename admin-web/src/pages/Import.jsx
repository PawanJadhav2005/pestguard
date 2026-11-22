import { useState } from 'react';
import { auth } from '../api';
import { fmt } from '../hooks';
import { Badge, Confirm, useToast } from '../components/ui';

const BASE = import.meta.env.VITE_API_URL || '';
const SVC = { gpc: 'General Pest Control', bed: 'Bed Bug', rod: 'Rodent', ter: 'Termite', mos: 'Mosquito', san: 'Disinfection' };

async function send(file, query) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/api/admin/import${query}`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` }, body: form })
    .catch(() => { throw new Error('Cannot reach the server. Check your internet connection.'); });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`);
  return data;
}

// Upload the company's Excel file, check the preview, then import. Safe to repeat.
export default function Import() {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [removeSample, setRemoveSample] = useState(true);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);

  const choose = e => { setFile(e.target.files[0] || null); setPreview(null); setResult(null); setErr(''); };
  const check = async () => {
    if (!file) return setErr('Choose the Excel file first.');
    setBusy('preview'); setErr(''); setResult(null);
    try { setPreview((await send(file, '?commit=0')).preview); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const run = async () => {
    setBusy('import'); setErr('');
    try {
      const r = await send(file, `?commit=1${removeSample ? '&removeSample=1' : ''}`);
      setResult(r.result); setPreview(null); setConfirm(false);
      toast(`Imported ${r.result.historyAdded} past services and ${r.result.jobsAdded} upcoming jobs`);
    } catch (e) { setErr(e.message); setConfirm(false); } finally { setBusy(null); }
  };

  const p = preview;
  return <>
    <div className="card">
      <div className="card-head"><h3>Import company records from Excel</h3><span className="muted sm">Customers, past services and upcoming jobs</span></div>
      <div className="card-body stack">
        <p style={{ margin: 0, maxWidth: '70ch' }}>Upload the company's monthly job sheets (.xlsx). Every sheet with a <b>Name</b> or <b>Customer name</b> column is read.
          Copies of the same job in later sheets are counted once. Nothing is saved until you click <b>Import</b>, and importing the same file again never creates duplicates.</p>
        <div className="row">
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} aria-label="Excel file" />
          <button className="btn primary" disabled={!file || !!busy} onClick={check}>{busy === 'preview' ? 'Reading the file…' : 'Check file'}</button>
        </div>
        {err && <div className="error-box">{err}</div>}
      </div>
    </div>

    {p && <>
      <div className="tiles">
        <div className="tile" style={{ '--h': 'var(--forest-3)' }}><div className="l">Customers</div><div className="v">{fmt.num(p.customers.total)}</div><div className="muted sm">{p.customers.new} new · {p.customers.alreadyImported} already imported</div></div>
        <div className="tile" style={{ '--h': 'var(--info)' }}><div className="l">Past services</div><div className="v">{fmt.num(p.history.total)}</div><div className="muted sm">{p.history.new} new · {p.history.from ? `${fmt.date(p.history.from)} – ${fmt.date(p.history.to)}` : ''}</div></div>
        <div className="tile" style={{ '--h': 'var(--good)' }}><div className="l">Revenue in these records</div><div className="v">{fmt.money(p.history.revenue)}</div></div>
        <div className="tile" style={{ '--h': 'var(--violet)' }}><div className="l">Upcoming jobs</div><div className="v">{p.upcoming.length}</div><div className="muted sm">will appear as unassigned</div></div>
        <div className="tile" style={{ '--h': 'var(--warn)' }}><div className="l">Rows skipped</div><div className="v">{p.skippedTotal}</div><div className="muted sm">listed below</div></div>
      </div>

      <div className="cols">
        <div className="card"><div className="card-head"><h3>What was found</h3></div><div className="card-body stack" style={{ gap: 8 }}>
          <div className="sm">{fmt.num(p.rowsRead)} rows read from {p.sheets.length} sheets · <b>{fmt.num(p.duplicatesRemoved)}</b> repeated rows counted once</div>
          <div className="sm">{p.customers.withPhone} customers have a phone number, {p.customers.withAddress} have an address. Customers without a number can't be called from the app until a number is added.</div>
          <div className="row">{Object.entries(p.byService).sort((a, b) => b[1] - a[1]).map(([k, n]) => <Badge key={k} hue="green">{SVC[k] || k}: {n}</Badge>)}</div>
          <details><summary className="sm" style={{ cursor: 'pointer' }}>Sheets read</summary>
            <div className="sm muted" style={{ marginTop: 6 }}>{p.sheets.map(s => `${s.name} (${s.rows})`).join(' · ')}</div></details>
          {p.upcoming.length > 0 && <div><b className="sm">Upcoming jobs</b>{p.upcoming.map((u, i) => <div key={i} className="sm">{u.date} {u.time || ''} · {u.name} · {u.service || '-'}{!u.isNew && <span className="muted"> (already imported)</span>}</div>)}</div>}
        </div></div>
        <div className="card"><div className="card-head"><h3>Rows that will be skipped</h3><span className="muted sm">Fix them in Excel and import again if needed</span></div>
          {p.skipped.length === 0 ? <div className="empty"><b>None</b></div> :
            <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}><table><thead><tr><th>Sheet</th><th>Row</th><th>Name</th><th>Reason</th></tr></thead>
              <tbody>{p.skipped.map((s, i) => <tr key={i}><td className="sm">{s.sheet}</td><td className="num sm">{s.row}</td><td className="sm">{s.name}</td><td className="sm">{s.reason}</td></tr>)}</tbody></table></div>}
          {p.skippedTotal > p.skipped.length && <div className="pager"><span className="muted">Showing {p.skipped.length} of {p.skippedTotal}</span></div>}
        </div>
      </div>

      <div className="card"><div className="card-body spread">
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={removeSample} onChange={e => setRemoveSample(e.target.checked)} disabled={!p.sampleCustomers} />
          {p.sampleCustomers ? `Also delete the ${p.sampleCustomers} made-up SAMPLE customers, their jobs and the sample stock items` : 'No sample data left'}
        </label>
        <button className="btn primary" disabled={!!busy || (p.customers.new === 0 && p.history.new === 0 && p.upcoming.every(u => !u.isNew) && !(removeSample && p.sampleCustomers))} onClick={() => setConfirm(true)}>Import</button>
      </div></div>
    </>}

    {result && <div className="card"><div className="card-head"><h3>Import finished</h3><Badge hue="green">Done</Badge></div><div className="card-body stack" style={{ gap: 6 }}>
      <div>{fmt.num(result.customers)} customers are in the system, {fmt.num(result.historyAdded)} past services and {result.jobsAdded} upcoming jobs were added.</div>
      {result.removed && (result.removed.customers > 0 || result.removed.items > 0) && <div className="sm">Removed {result.removed.customers} sample customers and {result.removed.items} sample stock items.</div>}
      {result.jobsSkipped.length > 0 && <div className="sm">Not added as jobs: {result.jobsSkipped.map(j => `${j.name} (${j.date}): ${j.reason}`).join('; ')}</div>}
      <div className="sm muted">Next: open <b>Inventory</b> and enter the opening stock for each chemical, then assign the upcoming jobs in <b>Jobs → Needs attention</b>.</div>
    </div></div>}

    {confirm && p && <Confirm title="Import these records?" okLabel={busy === 'import' ? 'Importing…' : 'Import now'} danger={false} onClose={() => !busy && setConfirm(false)} onOk={run}
      message={`${p.customers.new} new customers, ${p.history.new} past services and ${p.upcoming.filter(u => u.isNew).length} upcoming jobs will be added${removeSample && p.sampleCustomers ? `, and the ${p.sampleCustomers} SAMPLE customers will be deleted` : ''}. This can take up to a minute.`} />}
  </>;
}
