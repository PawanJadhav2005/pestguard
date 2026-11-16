import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../src/api';
import { useApi } from '../src/useApi';
import { Btn, Card, Chip, ErrorText, Field, H, Muted, Screen, Segments, ServiceIcon } from '../src/ui';
import { C, SVC, fmt } from '../src/theme';

const PROPS = ['1 BHK', '2 BHK', '3 BHK', 'Bungalow', 'Commercial'];
function slots() {
  const out = [];
  for (let d = 1; d <= 3; d++) for (const [h, label] of [[10, '10 AM – 12 PM'], [14, '2 – 4 PM'], [17, '5 – 7 PM']]) {
    const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0);
    out.push({ at: x, label: `${fmt.day(x)} · ${label}` });
  }
  return out;
}

export default function Book() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const services = useApi('/services');
  const [cust, setCust] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [svc, setSvc] = useState('gpc');
  const [prop, setProp] = useState('2 BHK');
  const [plan, setPlan] = useState(params.plan === 'amc' ? 'amc' : 'once');
  const [slot, setSlot] = useState(0);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const allSlots = slots();
  useEffect(() => { if (params.customerId) api(`/customers/${params.customerId}`).then(r => { setCust(r.customer); setProp(r.customer.propertyType); }).catch(e => setErr(e.message)); }, [params.customerId]);
  useEffect(() => { if (cust) return; const t = setTimeout(() => api(`/customers?pageSize=5&q=${encodeURIComponent(q)}`).then(r => setResults(r.items)).catch(() => {}), 300); return () => clearTimeout(t); }, [q, cust]);
  const s = services.data?.items.find(x => x.code === svc);
  const unit = s?.prices[prop];
  const total = unit ? (plan === 'amc' ? Math.round(unit * 2.4 / 10) * 10 : unit) : null;
  const confirm = async () => {
    if (!cust) return setErr('Choose a customer first.');
    setBusy(true); setErr('');
    try {
      const r = await api('/jobs', { method: 'POST', body: { customerId: cust.id, serviceCode: svc, propertyType: prop, plan, scheduledAt: allSlots[slot].at.toISOString(), notes: notes.trim() || undefined } });
      router.back(); setTimeout(() => router.push(`/job/${r.job.id}`), 50);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Screen padTop={false}>
      <H>Customer</H>
      {cust ? <Card style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>{cust.name}</Text><Muted>{cust.ref} · {cust.area || ''}</Muted></View>
        {!params.customerId && <Pressable onPress={() => setCust(null)}><Text style={{ color: C.forest2, fontWeight: '700' }}>Change</Text></Pressable>}</Card>
        : <><Field value={q} onChangeText={setQ} placeholder="Search customer" />{results.map(c => <Pressable key={c.id} onPress={() => { setCust(c); setProp(c.propertyType); }} style={{ backgroundColor: C.white, padding: 12, borderRadius: 14 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{c.name}</Text><Muted>{c.ref} · {c.area || ''}</Muted></Pressable>)}</>}
      <H>Service</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(services.data?.items || []).filter(x => x.active).map(x =>
        <Pressable key={x.code} onPress={() => setSvc(x.code)} style={{ width: '31.5%', padding: 10, borderRadius: 16, backgroundColor: C.white, alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: svc === x.code ? SVC[x.code]?.color : C.line }}>
          <ServiceIcon code={x.code} size={38} /><Text style={{ fontSize: 12, fontWeight: '600', textAlign: 'center', color: C.ink }}>{x.name}</Text></Pressable>)}</View>
      {s && <Muted>Warranty {s.warranty}</Muted>}
      <H>Property</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{PROPS.map(p => <Chip key={p} label={p} active={prop === p} onPress={() => setProp(p)} />)}</View>
      <H>Plan</H>
      <Segments value={plan} onChange={setPlan} options={[['once', 'One-time'], ['amc', 'AMC · 3 visits/yr']]} />
      <H>Visit slot</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{allSlots.map((x, i) => <Chip key={i} label={x.label} active={slot === i} onPress={() => setSlot(i)} />)}</View>
      <Field label="Problem description" value={notes} onChangeText={setNotes} multiline placeholder="e.g. Cockroaches in kitchen and bathroom for 2 weeks" />
      {total ? <View style={{ backgroundColor: C.forest, borderRadius: 16, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: '#ffffffcc' }}>{s.name} · {prop}{plan === 'amc' ? ' · 3 visits' : ''}</Text><Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{fmt.money(total)}</Text></View> : null}
      <ErrorText>{err}</ErrorText>
      <Btn title="Confirm booking" loading={busy} onPress={confirm} />
    </Screen>
  );
}
