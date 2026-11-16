import { Text, View } from 'react-native';
import { ProfileScreen } from '../../src/screens';
import { useApi } from '../../src/useApi';
import { Card, H, Muted } from '../../src/ui';
import { C } from '../../src/theme';

export default function Profile() {
  const done = useApi('/jobs?status=Completed&limit=200');
  const stock = useApi('/inventory', ['inventory:changed']);
  return (
    <ProfileScreen>
      <Card style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}><Text style={{ fontSize: 26, fontWeight: '700', color: C.ink }}>{done.data?.items.length ?? '-'}</Text><Muted>Jobs completed</Muted></View>
      </Card>
      <H>Store stock</H>
      <Card>{(stock.data?.items || []).map(i => <View key={i.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text style={{ color: C.ink, flex: 1 }}>{i.name}</Text><Text style={{ fontWeight: '700', color: C.ink }}>{i.quantity} {i.unit}</Text></View>)}</Card>
    </ProfileScreen>
  );
}
