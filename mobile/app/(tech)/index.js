import { Linking, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import { useApi } from '../../src/useApi';
import { Badge, Btn, Card, Empty, ErrorText, Hero, HeroStat, JobCard, Loading, Muted, Screen, ServiceIcon, s } from '../../src/ui';
import { C, fmt } from '../../src/theme';

export default function Today() {
  const { user } = useAuth();
  const router = useRouter();
  const r = useApi('/jobs?view=today', ['job:updated']);
  const jobs = (r.data?.items || []).filter(j => j.status !== 'Cancelled');
  const done = jobs.filter(j => ['Completed', 'Awaiting Approval'].includes(j.status)).length;
  const next = jobs.find(j => ['In Progress', 'On the way', 'Accepted', 'Assigned', 'On Hold'].includes(j.status));
  const h = new Date().getHours();
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing} padTop={false}>
      <Hero kicker={`Good ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}`} title={`${user.name.split(' ')[0]}, ${jobs.length - done} job${jobs.length - done === 1 ? '' : 's'} left today`}>
        <View style={{ flexDirection: 'row', gap: 8 }}><HeroStat value={jobs.length} label="Today" /><HeroStat value={done} label="Done" /><HeroStat value={jobs.filter(j => j.overdue).length} label="Late" /></View>
      </Hero>
      <ErrorText>{r.error}</ErrorText>
      {r.loading ? <Loading /> : next ? (
        <Card style={{ gap: 12, marginTop: -4 }}>
          <View style={s.rowBetween}><Text style={{ fontSize: 11.5, fontWeight: '800', letterSpacing: .6, color: C.forest2 }}>{next.status === 'In Progress' ? 'IN PROGRESS' : 'NEXT JOB'} · {fmt.time(next.scheduledAt)}</Text><Badge label={next.status} /></View>
          <View style={s.row}><ServiceIcon code={next.serviceCode} size={54} />
            <View style={{ flex: 1 }}><Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>{next.serviceName}</Text>
              <Muted>{next.customer.name} · {next.propertyType}</Muted><Muted numberOfLines={1}>{next.customer.address}</Muted></View></View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn title="Map" kind="soft" icon="navigate-outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.customer.address)}`)} />
            <Btn title="Call" kind="soft" icon="call-outline" style={{ flex: 1 }} onPress={() => router.push(`/call/${next.customer.id}`)} />
            <Btn title="Open" icon="play" style={{ flex: 1 }} onPress={() => router.push(`/job/${next.id}`)} />
          </View>
        </Card>
      ) : <Card><Empty title="All done for today" text="New jobs will appear here and in Alerts." /></Card>}
      {jobs.length > 0 && <Text style={[s.h, { marginTop: 4 }]}>Today's jobs</Text>}
      {jobs.map(j => <JobCard key={j.id} job={j} onPress={() => router.push(`/job/${j.id}`)} />)}
    </Screen>
  );
}
