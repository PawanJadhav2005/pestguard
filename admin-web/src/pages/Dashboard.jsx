import { useNavigate } from 'react-router-dom';
import { fmt, useApi } from '../hooks';
import { Badge, Empty, ErrorBox, Loading } from '../components/ui';

const COLORS = { gpc: '#e0742f', ter: '#8a5a2b', bed: '#b5405a', mos: '#2f6fd0', rod: '#6a6f7c', san: '#14775d' };
export default function Dashboard({ data }) {
  const nav = useNavigate();
  const attention = useApi('/jobs?view=attention&limit=6', ['job:updated']);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox msg={data.error} retry={data.reload} />;
  const { counts: c, bySvc, lowStock } = data.data;
  const max = Math.max(1, ...bySvc.map(s => s.revenue));
  return <>
    <div className="tiles">
      <button className="tile" style={{ '--h': 'var(--bad)' }} onClick={() => nav('/jobs')}><div className="l">Overdue</div><div className="v">{c.overdue}</div></button>
      <button className="tile" style={{ '--h': 'var(--warn)' }} onClick={() => nav('/jobs')}><div className="l">Unassigned</div><div className="v">{c.unassigned}</div></button>
      <button className="tile" style={{ '--h': 'var(--violet)' }} onClick={() => nav('/approvals')}><div className="l">Reports to approve</div><div className="v">{c.awaiting}</div></button>
      <div className="tile" style={{ '--h': 'var(--info)' }}><div className="l">Jobs today</div><div className="v">{c.today}</div></div>
      <div className="tile" style={{ '--h': 'var(--good)' }}><div className="l">Revenue, 7 days</div><div className="v">{fmt.money(c.revenue7)}</div></div>
      <div className="tile" style={{ '--h': 'var(--forest-3)' }}><div className="l">Active AMCs</div><div className="v">{c.activeAmc}</div></div>
    </div>
    <div className="cols">
      <div className="card"><div className="card-head"><h3>Needs attention</h3><button className="link sm" onClick={() => nav('/jobs')}>See all jobs</button></div>
        {attention.loading ? <Loading /> : (attention.data?.items || []).length === 0 ? <Empty title="All clear">Every job is assigned and on time.</Empty> :
          <div className="table-wrap"><table><tbody>{attention.data.items.map(j => <tr key={j.id}>
            <td><button className="link" onClick={() => nav(`/jobs?open=${j.id}`)}>{j.ref}</button><span className="sub">{j.serviceName}</span></td>
            <td>{j.customer.name}<span className="sub">{j.customer.area}</span></td><td className="num">{fmt.dt(j.scheduledAt)}</td>
            <td><Badge>{j.status}</Badge> {j.overdue && <Badge hue="red">Overdue</Badge>}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="card"><div className="card-head"><h3>Low stock</h3><button className="link sm" onClick={() => nav('/inventory')}>Inventory</button></div>
        {lowStock.length === 0 ? <Empty title="Stock is fine">No item is at its reorder level.</Empty> :
          <div className="table-wrap"><table><tbody>{lowStock.map(i => <tr key={i.id}><td>{i.name}</td><td className="right num"><b style={{ color: 'var(--bad)' }}>{fmt.num(i.quantity)} {i.unit}</b><span className="sub">reorder at {fmt.num(i.reorder_level)}</span></td></tr>)}</tbody></table></div>}
      </div>
    </div>
    <div className="card"><div className="card-head"><h3>Revenue by service</h3><span className="muted sm">Approved jobs, last 7 days</span></div>
      <div className="card-body">{bySvc.map(s => <div key={s.code} className="hbar"><span>{s.name}</span><div className="track"><div className="fill" style={{ width: `${s.revenue / max * 100}%`, '--c': COLORS[s.code] }} /></div><span className="num right"><b>{fmt.money(s.revenue)}</b> <span className="muted sm">{s.jobs} jobs</span></span></div>)}</div>
    </div>
  </>;
}
