import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../src/api';
import { useApi } from '../src/useApi';
import { Btn, Card, Field, H, Loading, Muted, Screen, ServiceIcon, s } from '../src/ui';
import { C } from '../src/theme';

const PROPS = ['1 BHK', '2 BHK', '3 BHK', 'Bungalow', 'Commercial'];
export default function Prices() {
  const r = useApi('/services');
  if (r.loading) return <Loading />;
  return (
    <Screen padTop={false}>
      <Muted>New prices apply to new bookings only. Past jobs keep the price they were booked at.</Muted>
      {r.data.items.map(sv => <ServiceCard key={sv.code} sv={sv} onSaved={r.reload} />)}
    </Screen>
  );
}
function ServiceCard({ sv, onSaved }) {
  const [p, setP] = useState(Object.fromEntries(PROPS.map(k => [k, String(sv.prices[k] ?? '')])));
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const dirty = PROPS.some(k => Number(p[k]) !== sv.prices[k]);
  const save = async () => {
    setBusy(true); setMsg('');
    try { await api(`/services/${sv.code}`, { method: 'PATCH', body: { prices: Object.fromEntries(PROPS.map(k => [k, Number(p[k])])) } }); setMsg('Saved'); onSaved(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return <Card style={{ gap: 10 }}>
    <View style={s.row}><ServiceIcon code={sv.code} size={36} /><View style={{ flex: 1 }}><H>{sv.name}</H><Muted>Warranty {sv.warranty}</Muted></View></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{PROPS.map(k => <View key={k} style={{ width: '31%' }}>
      <Field label={k} value={p[k]} onChangeText={t => setP({ ...p, [k]: t.replace(/[^0-9]/g, '') })} keyboardType="number-pad" /></View>)}</View>
    {msg ? <Text style={{ color: msg === 'Saved' ? C.good : C.bad, fontWeight: '600' }}>{msg}</Text> : null}
    <Btn title="Save prices" kind="soft" disabled={!dirty} loading={busy} onPress={save} />
  </Card>;
}
