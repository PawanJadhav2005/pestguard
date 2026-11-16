import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApi } from '../../src/useApi';
import { Btn, Card, Empty, ErrorText, Loading, Muted, Screen, s } from '../../src/ui';
import FollowupCard from '../../src/FollowupCard';
import { C, fmt } from '../../src/theme';

export default function Followups() {
  const router = useRouter();
  const r = useApi('/followups', ['notification']);
  const items = r.data?.items || [];
  const renewals = (r.data?.renewals || []).filter(a => !items.some(f => f.customer_id === a.customer_id && f.type === 'Renewal'));
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Follow-ups</Text>
      <ErrorText>{r.error}</ErrorText>
      {r.loading ? <Loading /> : items.length === 0 ? <Card><Empty title="No follow-ups" text="Callbacks you schedule after a call show up here." /></Card> : items.map(f => <FollowupCard key={f.id} f={f} onDone={r.reload} />)}
      {renewals.length > 0 && <Text style={[s.h, { marginTop: 6 }]}>AMCs ending soon</Text>}
      {renewals.map(a => <Card key={a.id} style={s.rowBetween}>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>{a.customer_name}</Text><Muted>{a.visits_done}/{a.visits_total} visits · ends {fmt.date(a.end_date)}</Muted></View>
        <Btn title="Call" icon="call-outline" onPress={() => router.push(`/call/${a.customer_id}`)} /></Card>)}
    </Screen>
  );
}
