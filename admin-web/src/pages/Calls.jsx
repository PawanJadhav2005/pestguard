import { api } from '../api';
import { fmt, useApi } from '../hooks';
import { Badge, Empty, Loading, useToast } from '../components/ui';

export default function Calls() {
  const toast = useToast();
  const calls = useApi('/calls');
  const fu = useApi('/followups');
  return <>
    {calls.data && !calls.data.callingConfigured && <div className="error-box" style={{ background: '#fff6e5', color: '#8a5600' }}>Masked calling is not set up yet. Add the Exotel details in the server's .env file (see README). Until then, call buttons show a clear error and no call is placed.</div>}
    <div className="cols">
      <div className="card"><div className="card-head"><h3>Recent calls</h3></div>
        {calls.loading ? <Loading /> : calls.data.items.length === 0 ? <Empty title="No calls yet" /> :
          <div className="table-wrap"><table><thead><tr><th>When</th><th>Customer</th><th>Staff</th><th>Outcome</th><th>Notes</th></tr></thead>
            <tbody>{calls.data.items.map(l => <tr key={l.id}><td className="num">{fmt.dt(l.created_at)}</td><td>{l.customer_name}<span className="sub">{l.customer_ref}</span></td><td>{l.by_name}</td>
              <td><Badge hue={l.status === 'failed' ? 'red' : l.outcome === 'Complaint' ? 'red' : l.outcome === 'Connected' ? 'green' : 'grey'}>{l.outcome || l.status}</Badge></td><td className="sm">{l.notes || '-'}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="card"><div className="card-head"><h3>Open follow-ups</h3></div>
        {fu.loading ? <Loading /> : fu.data.items.length === 0 ? <Empty title="No follow-ups" /> :
          <div className="table-wrap"><table><tbody>{fu.data.items.map(f => <tr key={f.id}><td><b>{f.customer_name}</b><span className="sub">{f.type} · {f.note}</span></td>
            <td className="num" style={{ color: new Date(f.due_at) < new Date() ? 'var(--bad)' : 'inherit' }}>{fmt.dt(f.due_at)}</td>
            <td><button className="btn sm" onClick={async () => { await api(`/followups/${f.id}/done`, { method: 'POST' }); toast('Marked done'); fu.reload(); }}>Done</button></td></tr>)}</tbody></table></div>}
        {fu.data?.renewals?.length > 0 && <><div className="card-head"><h3>AMCs ending soon</h3></div><div className="table-wrap"><table><tbody>{fu.data.renewals.map(a =>
          <tr key={a.id}><td>{a.customer_name}<span className="sub">{a.customer_ref}</span></td><td>{a.visits_done}/{a.visits_total} visits</td><td className="num">ends {fmt.date(a.end_date)}</td></tr>)}</tbody></table></div></>}
      </div>
    </div>
  </>;
}
