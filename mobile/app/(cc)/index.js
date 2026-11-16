import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import { useApi } from '../../src/useApi';
import { Btn, Card, Empty, ErrorText, Field, Hero, HeroStat, JobCard, Loading, Screen, s } from '../../src/ui';
import FollowupCard from '../../src/FollowupCard';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const fu = useApi('/followups', ['notification']);
  const jobs = useApi('/jobs?view=today', ['job:updated']);
  const calls = useApi('/calls');
  const [q, setQ] = useState('');
  const due = (fu.data?.items || []).filter(f => new Date(f.due_at) < new Date(Date.now() + 864e5));
  const myCallsToday = (calls.data?.items || []).filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length;
  return (
    <Screen padTop={false} onRefresh={() => { fu.refresh(); jobs.refresh(); calls.refresh(); }} refreshing={fu.refreshing}>
      <Hero kicker="Customer care" title={`Hi ${user.name.split(' ')[0]}, ${due.length} call${due.length === 1 ? '' : 's'} due`}>
        <View style={{ flexDirection: 'row', gap: 8 }}><HeroStat value={myCallsToday} label="Calls today" /><HeroStat value={due.length} label="Due" /><HeroStat value={fu.data?.renewals?.length ?? 0} label="Renewals" /></View>
      </Hero>
      <Card style={{ gap: 10, marginTop: -4 }}>
        <Field value={q} onChangeText={setQ} placeholder="Search customer name or reference" returnKeyType="search" onSubmitEditing={() => router.push({ pathname: '/(cc)/customers', params: { q } })} />
        <Btn title="Book a service" kind="amber" icon="add" onPress={() => router.push('/book')} />
      </Card>
      {calls.data && !calls.data.callingConfigured && <Card style={{ backgroundColor: '#fff6e5' }}><Text>Calling isn't set up on the server yet. Call buttons will show an error until the admin adds the provider details.</Text></Card>}
      <Text style={[s.h, { marginTop: 4 }]}>Calls due</Text>
      <ErrorText>{fu.error}</ErrorText>
      {fu.loading ? <Loading /> : due.length === 0 ? <Card><Empty title="No calls due" /></Card> : due.slice(0, 5).map(f => <FollowupCard key={f.id} f={f} onDone={fu.reload} />)}
      <Text style={[s.h, { marginTop: 4 }]}>Today's visits</Text>
      {(jobs.data?.items || []).map(j => <JobCard key={j.id} job={j} onPress={() => router.push(`/job/${j.id}`)} />)}
    </Screen>
  );
}
