import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../src/auth';
import { useApi } from '../../src/useApi';
import { Card, Empty, ErrorText, H, Hero, HeroStat, JobCard, Loading, Muted, Screen, ServiceIcon, s } from '../../src/ui';
import { C, fmt } from '../../src/theme';

function Tile({ label, value, color, icon, onPress }) {
  return <Pressable onPress={onPress} style={{ width: '48.5%', backgroundColor: C.white, borderRadius: 18, padding: 14, gap: 2, elevation: 2 }}>
    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><Ionicons name={icon} size={17} color={color} /></View>
    <Text style={{ fontSize: 26, fontWeight: '700', color: C.ink }}>{value}</Text><Muted>{label}</Muted></Pressable>;
}

export default function AdminHome() {
  const { user } = useAuth();
  const router = useRouter();
  const d = useApi('/dashboard', ['report:submitted', 'report:reviewed', 'inventory:changed', 'job:updated']);
  const att = useApi('/jobs?view=attention&limit=5', ['job:updated']);
  if (d.loading) return <Loading />;
  if (d.error) return <Screen><ErrorText>{d.error}</ErrorText></Screen>;
  const { counts: c, bySvc, lowStock } = d.data;
  const max = Math.max(1, ...bySvc.map(x => x.revenue));
  return (
    <Screen padTop={false} onRefresh={() => { d.refresh(); att.refresh(); }} refreshing={d.refreshing}>
      <Hero kicker={`Operations · ${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`} title={`${c.open} open jobs, ${c.overdue + c.unassigned} need you`}>
        <View style={{ flexDirection: 'row', gap: 8 }}><HeroStat value={fmt.money(c.revenue7)} label="Revenue, 7 days" /><HeroStat value={c.done7} label="Jobs done" /><HeroStat value={c.activeAmc} label="Active AMCs" /></View>
      </Hero>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: -4 }}>
        <Tile label="Overdue" value={c.overdue} color={C.bad} icon="alert-circle-outline" onPress={() => router.push('/(admin)/jobs')} />
        <Tile label="Unassigned" value={c.unassigned} color={C.warn} icon="person-add-outline" onPress={() => router.push('/(admin)/jobs')} />
        <Tile label="Reports to approve" value={c.awaiting} color={C.violet} icon="checkmark-done-outline" onPress={() => router.push('/(admin)/approvals')} />
        <Tile label="Jobs today" value={c.today} color={C.info} icon="calendar-outline" onPress={() => router.push({ pathname: '/(admin)/jobs', params: { view: 'today' } })} />
      </View>
      {lowStock.length > 0 && <Pressable onPress={() => router.push('/(admin)/inventory')}><Card style={{ backgroundColor: '#fdecea', gap: 4 }}>
        <View style={s.row}><Ionicons name="warning-outline" size={18} color={C.bad} /><H style={{ color: C.bad }}>Low stock ({lowStock.length})</H></View>
        {lowStock.slice(0, 4).map(i => <View key={i.id} style={s.rowBetween}><Text style={{ color: C.ink }}>{i.name}</Text><Text style={{ fontWeight: '700', color: C.bad }}>{i.quantity} {i.unit}</Text></View>)}</Card></Pressable>}
      <H>Needs attention</H>
      {(att.data?.items || []).length === 0 ? <Card><Empty title="All clear" text="Every job is assigned and on time." /></Card> :
        att.data.items.map(j => <JobCard key={j.id} job={j} showDate onPress={() => router.push(`/job/${j.id}`)} />)}
      <H>Revenue by service · 7 days</H>
      <Card style={{ gap: 12 }}>{bySvc.map(x => <View key={x.code} style={[s.row, { gap: 10 }]}><ServiceIcon code={x.code} size={30} />
        <View style={{ flex: 1, gap: 4 }}><View style={s.rowBetween}><Text style={{ color: C.ink, fontSize: 13 }}>{x.name}</Text><Text style={{ fontWeight: '700', color: C.ink, fontSize: 13 }}>{fmt.money(x.revenue)}</Text></View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: C.mint2 }}><View style={{ height: 8, borderRadius: 4, width: `${x.revenue / max * 100}%`, backgroundColor: C.forest3 }} /></View></View></View>)}</Card>
    </Screen>
  );
}
