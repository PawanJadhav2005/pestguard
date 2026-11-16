import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useApi } from '../../src/useApi';
import { Card, Empty, ErrorText, JobCard, Loading, Screen, Segments } from '../../src/ui';
import { C } from '../../src/theme';

export default function Jobs() {
  const router = useRouter();
  const [tab, setTab] = useState('open');
  const r = useApi(`/jobs?view=${tab}`, ['job:updated']);
  const items = r.data?.items || [];
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>My jobs</Text>
      <Segments value={tab} onChange={setTab} options={[['open', 'Open'], ['today', 'Today'], ['done', 'Done']]} />
      <ErrorText>{r.error}</ErrorText>
      {r.loading ? <Loading /> : items.length === 0 ? <Card><Empty title="Nothing here" /></Card> :
        items.map(j => <JobCard key={j.id} job={j} showDate onPress={() => router.push(`/job/${j.id}`)} />)}
    </Screen>
  );
}
