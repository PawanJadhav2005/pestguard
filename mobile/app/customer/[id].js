import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../src/auth';
import { useApi } from '../../src/useApi';
import { Badge, Btn, Card, ErrorText, H, Loading, Muted, Screen, ServiceIcon, s } from '../../src/ui';
import { C, fmt } from '../../src/theme';

export default function CustomerDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const r = useApi(`/customers/${id}`, ['job:updated']);
  if (r.loading) return <Loading />;
  if (r.error) return <Screen padTop={false}><ErrorText>{r.error}</ErrorText></Screen>;
  const { customer: c, amc, history, openJobs, calls } = r.data;
  const a = amc[0];
  const amcState = !a ? null : new Date(a.end_date) < new Date() ? ['Expired', C.bad] : new Date(a.end_date) < new Date(Date.now() + 30 * 864e5) ? ['Renewal due', C.warn] : ['Active', C.good];
  return (
    <Screen padTop={false} onRefresh={r.refresh} refreshing={r.refreshing}>
      <Stack.Screen options={{ title: c.ref }} />
      <View style={{ backgroundColor: C.forest, marginHorizontal: -16, marginTop: -16, padding: 18, paddingTop: 6, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, gap: 6 }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{c.name}</Text>
        <Text style={{ color: '#ffffffdd' }}>{c.propertyType} · {c.area || ''}</Text>
        <Text style={{ color: '#ffffffcc' }}>{c.address}</Text>
        {user.role !== 'technician' && <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Btn title="Call" icon="call-outline" kind="soft" style={{ flex: 1 }} onPress={() => router.push(`/call/${c.id}`)} />
          <Btn title="Book service" icon="add" kind="amber" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/book', params: { customerId: c.id } })} /></View>}
      </View>
      {c.mobile ? <Card style={s.rowBetween}><Muted>Mobile (admin only)</Muted><Text selectable style={{ fontWeight: '700', color: C.ink }}>{c.mobile}</Text></Card>
        : <View style={[s.row, { gap: 6 }]}><Ionicons name="lock-closed-outline" size={13} color={C.muted} /><Muted>Phone number hidden by the server for your role</Muted></View>}
      {a ? <Card style={{ gap: 4 }}><View style={s.rowBetween}><H>Annual contract</H><Badge label={amcState[0]} color={amcState[1]} /></View>
        <Muted>{a.visits_done} of {a.visits_total} visits done · ends {fmt.date(a.end_date)} · {fmt.money(a.price)}</Muted></Card>
        : <Card style={s.rowBetween}><View style={{ flex: 1 }}><H>No annual contract</H><Muted>Offer an AMC with 3 visits a year</Muted></View>
          {user.role !== 'technician' && <Btn title="Offer AMC" kind="soft" onPress={() => router.push({ pathname: '/book', params: { customerId: c.id, plan: 'amc' } })} />}</Card>}
      {openJobs.length > 0 && <><H>Upcoming visits</H>{openJobs.map(j => <Card key={j.id} style={s.rowBetween}>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>JB-{j.id}</Text><Muted>{fmt.dt(j.scheduled_at)} · {j.technician_name || 'Not assigned yet'}</Muted></View><Badge label={j.status} /></Card>)}</>}
      <H>Service history</H>
      <Card>{history.length ? history.map(h => <View key={h.src + h.id} style={[s.row, { paddingVertical: 8 }]}><ServiceIcon code={h.service_code} size={36} />
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.ink }}>{fmt.date(h.date)} · {h.ref}</Text><Muted>{h.technician_name || '-'}</Muted></View>
        <Text style={{ fontWeight: '700', color: C.ink }}>{fmt.money(h.price)}</Text></View>) : <Muted>No past services</Muted>}</Card>
      {calls.length > 0 && <><H>Calls</H><Card>{calls.map(l => <View key={l.id} style={{ paddingVertical: 6 }}><View style={s.rowBetween}><Text style={{ fontWeight: '700', color: C.ink }}>{l.outcome || l.status}</Text><Muted>{fmt.dt(l.created_at)}</Muted></View>{l.notes ? <Muted>{l.notes}</Muted> : null}</View>)}</Card></>}
    </Screen>
  );
}
