import { Text, View } from 'react-native';
import { useApi } from '../src/useApi';
import { Badge, Card, Empty, Loading, Muted, Screen, s } from '../src/ui';
import FollowupCard from '../src/FollowupCard';
import { C, fmt } from '../src/theme';

export default function Calls() {
  const calls = useApi('/calls');
  const fu = useApi('/followups');
  if (calls.loading) return <Loading />;
  return (
    <Screen padTop={false} onRefresh={() => { calls.refresh(); fu.refresh(); }} refreshing={calls.refreshing}>
      {!calls.data?.callingConfigured && <Card style={{ backgroundColor: '#fff6e5' }}><Text style={{ color: C.ink }}>Masked calling is not set up yet. Add the Exotel details in the server's .env file.</Text></Card>}
      <Text style={s.h}>Open follow-ups</Text>
      {(fu.data?.items || []).length === 0 ? <Card><Empty title="No follow-ups" /></Card> : fu.data.items.map(f => <FollowupCard key={f.id} f={f} onDone={fu.reload} />)}
      <Text style={s.h}>Recent calls</Text>
      <Card>{(calls.data?.items || []).length === 0 ? <Muted>No calls yet</Muted> : calls.data.items.slice(0, 40).map(l =>
        <View key={l.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line, gap: 2 }}>
          <View style={s.rowBetween}><Text style={{ fontWeight: '600', color: C.ink, flex: 1 }}>{l.customer_name}</Text>
            <Badge label={l.outcome || l.status} color={l.status === 'failed' || l.outcome === 'Complaint' ? C.bad : l.outcome === 'Connected' ? C.good : C.grey} /></View>
          <Muted>{l.by_name} · {fmt.dt(l.created_at)}{l.notes ? ` · ${l.notes}` : ''}</Muted></View>)}</Card>
    </Screen>
  );
}
