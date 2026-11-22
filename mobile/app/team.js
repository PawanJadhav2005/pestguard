import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../src/api';
import { useApi } from '../src/useApi';
import { Badge, Btn, Card, ErrorText, Loading, Muted, Screen, s } from '../src/ui';
import { C, fmt } from '../src/theme';

const SKILLS = { gpc: 'General', ter: 'Termite', bed: 'Bed bug', mos: 'Mosquito', rod: 'Rodent', san: 'Disinfection' };
const ROLE = { admin: ['Admin', C.violet], callcenter: ['Call center', C.warn], technician: ['Technician', C.good] };

export default function Team() {
  const router = useRouter();
  const r = useApi('/staff', ['job:updated', 'notification']);
  const toggle = async (u, body) => { try { await api(`/staff/${u.id}`, { method: 'PATCH', body }); r.reload(); } catch (e) { Alert.alert('Could not update', e.message); } };
  if (r.loading) return <Loading />;
  const all = r.data?.items || [];
  const pending = all.filter(u => !u.approved);
  const techs = all.filter(u => u.approved && u.role === 'technician');
  const office = all.filter(u => u.approved && u.role !== 'technician');
  const open = u => router.push(`/staff/${u.id}`);
  return (
    <Screen padTop={false} onRefresh={r.refresh} refreshing={r.refreshing}>
      <Stack.Screen options={{ headerRight: () => <Pressable accessibilityLabel="Add staff" onPress={() => router.push('/staff/new')} style={{ padding: 6 }}><Ionicons name="person-add-outline" size={22} color="#fff" /></Pressable> }} />
      <ErrorText>{r.error}</ErrorText>
      <Btn title="Add staff member" icon="person-add-outline" kind="soft" onPress={() => router.push('/staff/new')} />

      {pending.length > 0 && <>
        <Text style={s.h}>Waiting for approval ({pending.length})</Text>
        {pending.map(u => <Pressable key={u.id} onPress={() => open(u)}><Card style={{ gap: 6, borderLeftWidth: 4, borderLeftColor: C.amber }}>
          <View style={s.rowBetween}><Text style={{ fontWeight: '700', color: C.ink, flex: 1 }}>{u.name}</Text><Badge label={ROLE[u.role][0]} color={ROLE[u.role][1]} /></View>
          <Muted>{u.email} · {u.phone || 'no phone'}{u.signed_up_at ? ` · ${fmt.ago(u.signed_up_at)}` : ''}</Muted>
          <Text style={{ color: C.forest2, fontWeight: '700' }}>Tap to approve or reject</Text>
        </Card></Pressable>)}
      </>}

      <Text style={[s.h, { marginTop: 4 }]}>Technicians</Text>
      {techs.map(u => <Pressable key={u.id} onPress={() => open(u)}><Card style={{ gap: 6, opacity: u.active ? 1 : .5 }}>
        <View style={s.rowBetween}><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>{u.name}{!u.active ? ' (turned off)' : ''}</Text><Muted>{u.area || '-'} · {u.open_jobs} open · {u.completed_jobs} done</Muted></View>
          <View style={{ alignItems: 'center' }}><Switch value={u.available} onValueChange={v => toggle(u, { available: v })} trackColor={{ true: C.forest3 }} /><Muted style={{ fontSize: 11 }}>{u.available ? 'Available' : 'On leave'}</Muted></View></View>
        <Muted>{u.skills.map(k => SKILLS[k]).join(', ') || 'No skills set'}</Muted>
        {!u.phone ? <Text style={{ color: C.warn, fontSize: 12.5 }}>Phone number missing: tap to add it</Text> : null}
      </Card></Pressable>)}

      <Text style={[s.h, { marginTop: 4 }]}>Office staff</Text>
      {office.map(u => <Pressable key={u.id} onPress={() => open(u)}><Card style={[s.rowBetween, { opacity: u.active ? 1 : .5 }]}>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>{u.name}{!u.active ? ' (turned off)' : ''}</Text><Muted>{u.email}</Muted></View>
        <Badge label={ROLE[u.role][0]} color={ROLE[u.role][1]} /></Card></Pressable>)}
      <Muted>Tap anyone to edit their details, reset their password or turn off their sign-in.</Muted>
    </Screen>
  );
}
