import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApi } from '../../src/useApi';
import { Badge, Card, Empty, ErrorText, Loading, Muted, Screen, Segments, ServiceIcon, s } from '../../src/ui';
import { C, fmt } from '../../src/theme';

// Reports arrive here the moment a technician submits them
export default function Approvals() {
  const router = useRouter();
  const [status, setStatus] = useState('submitted');
  const r = useApi(`/reports?status=${status}`, ['report:submitted', 'report:reviewed']);
  const items = r.data?.items || [];
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Approvals</Text>
      <Segments value={status} onChange={setStatus} options={[['submitted', 'Waiting'], ['returned', 'Returned'], ['approved', 'Approved']]} />
      <ErrorText>{r.error}</ErrorText>
      {r.loading ? <Loading /> : items.length === 0 ? <Card><Empty title={status === 'submitted' ? 'No reports waiting' : 'Nothing here'} text={status === 'submitted' ? 'New treatment reports appear here instantly.' : undefined} /></Card> :
        items.map(x => <Pressable key={x.id} onPress={() => router.push(`/review/${x.id}`)}><Card style={{ gap: 8 }}>
          <View style={s.row}><ServiceIcon code={x.service_code} /><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>JB-{x.job_id} · {x.service_name}</Text>
            <Muted>{x.customer_name} · by {x.technician_name}</Muted></View>{status === 'submitted' ? <Badge label="Review" color={C.violet} /> : null}</View>
          <Muted>{x.items.length ? x.items.map(i => `${i.name}: ${i.quantity} ${i.unit}`).join(' · ') : 'No chemicals logged'}</Muted>
          <View style={s.rowBetween}><Muted>{fmt.dt(x.submitted_at)}</Muted><Text style={{ fontWeight: '700', color: C.ink }}>{fmt.money(x.price)}</Text></View>
        </Card></Pressable>)}
    </Screen>
  );
}
