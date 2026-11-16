import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { api, session } from '../../src/api';
import { useApi } from '../../src/useApi';
import { Badge, Btn, Card, ErrorText, Field, H, Loading, Muted, Screen, s } from '../../src/ui';
import { C, fmt } from '../../src/theme';

// Photos are protected: the app sends the sign-in token with each image request
function Photo({ name, label, contain }) {
  return <View style={{ flex: 1, gap: 4 }}>
    <View style={{ aspectRatio: 1, borderRadius: 14, backgroundColor: contain ? '#fff' : C.mint2, borderWidth: 1, borderColor: C.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {name ? <Image source={{ uri: `${session.baseUrl}/api/files/${name}`, headers: { Authorization: `Bearer ${session.token}` } }} style={{ width: '100%', height: '100%' }} resizeMode={contain ? 'contain' : 'cover'} />
        : <Muted>None</Muted>}
    </View><Muted style={{ textAlign: 'center' }}>{label}</Muted></View>;
}

export default function Review() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const r = useApi(`/reports/${id}`, ['report:reviewed']);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(null);
  if (r.loading) return <Loading />;
  if (r.error) return <Screen padTop={false}><ErrorText>{r.error}</ErrorText></Screen>;
  const x = r.data.report;
  const act = async kind => {
    if (kind === 'return' && comment.trim().length < 4) return setErr('Write what the technician needs to fix.');
    setBusy(kind); setErr('');
    try { await api(`/reports/${x.id}/${kind}`, { method: 'POST', body: kind === 'return' ? { comment } : {} }); router.back(); }
    catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: `Review JB-${x.job_id}` }} />
      <Card style={{ gap: 6 }}>
        <View style={s.rowBetween}><H>{x.service_name}</H><Badge label={x.status} color={{ submitted: C.violet, approved: C.good, returned: C.warn }[x.status]} /></View>
        <Muted>{x.customer_name} · {x.customer_area} · {x.property_type}</Muted>
        <Muted>By {x.technician_name} · {fmt.dt(x.submitted_at)}</Muted>
        <View style={s.rowBetween}><Muted>Amount</Muted><Text style={{ fontWeight: '700', color: C.ink, fontSize: 17 }}>{fmt.money(x.price)}</Text></View>
      </Card>
      <Card style={{ gap: 6 }}>
        <H>Treatment</H>
        <Text style={{ color: C.ink }}>Areas: {x.areas.join(', ')}</Text>
        <Text style={{ color: C.ink }}>Safety checklist: {x.safety_confirmed ? 'completed' : 'not confirmed'}</Text>
        {x.notes ? <Text style={{ color: C.ink }}>Notes: {x.notes}</Text> : null}
        {x.admin_comment ? <Text style={{ color: C.warn }}>Your comment: {x.admin_comment}</Text> : null}
      </Card>
      <Card style={{ gap: 6 }}>
        <H>Chemicals used</H>
        {x.items.length ? x.items.map(i => <View key={i.item_id} style={s.rowBetween}><Text style={{ color: C.ink }}>{i.name}</Text><Text style={{ fontWeight: '700', color: C.ink }}>{i.quantity} {i.unit}</Text></View>) : <Muted>None logged</Muted>}
        <Muted>Already deducted from inventory.</Muted>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}><Photo name={x.before_photo} label="Before" /><Photo name={x.after_photo} label="After" /><Photo name={x.signature} label="Signature" contain /></View>
      {x.status === 'submitted' && <>
        <Field label="Comment (needed to return)" value={comment} onChangeText={setComment} multiline placeholder="e.g. Add a photo of the treated kitchen" />
        <ErrorText>{err}</ErrorText>
        <Btn title="Approve and close job" icon="checkmark-circle-outline" loading={busy === 'approve'} disabled={!!busy} onPress={() => act('approve')} style={{ backgroundColor: C.good }} />
        <Btn title="Return for correction" kind="danger" loading={busy === 'return'} disabled={!!busy} onPress={() => act('return')} />
      </>}
    </Screen>
  );
}
