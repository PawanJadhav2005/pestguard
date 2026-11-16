import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApi } from '../../src/useApi';
import { Card, Chip, Empty, ErrorText, JobCard, Loading, Screen } from '../../src/ui';
import { C } from '../../src/theme';

const VIEWS = [['attention', 'Needs attention'], ['today', 'Today'], ['open', 'All open'], ['done', 'Completed'], ['all', 'All']];
export default function AdminJobs() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [view, setView] = useState(params.view || 'attention');
  useEffect(() => { if (params.view) setView(params.view); }, [params.view]);
  const r = useApi(`/jobs?view=${view}`, ['job:updated']);
  const items = r.data?.items || [];
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Jobs</Text>
        <Pressable accessibilityLabel="New job" onPress={() => router.push('/book')} style={{ backgroundColor: C.amber, borderRadius: 12, padding: 9 }}><Ionicons name="add" size={22} color={C.amberInk} /></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{VIEWS.map(([k, l]) => <Chip key={k} label={l} active={view === k} onPress={() => setView(k)} />)}</ScrollView>
      <ErrorText>{r.error}</ErrorText>
      {r.loading ? <Loading /> : items.length === 0 ? <Card><Empty title="No jobs here" text={view === 'attention' ? 'Every job is assigned and on time.' : undefined} /></Card> :
        items.map(j => <View key={j.id}>
          <JobCard job={j} showDate onPress={() => router.push(`/job/${j.id}`)} />
          <Text style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 12, color: j.technicianName ? C.muted : C.bad, fontWeight: '600' }}>{j.technicianName || 'Unassigned'}</Text>
        </View>)}
    </Screen>
  );
}
