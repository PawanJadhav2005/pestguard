import { Alert, Switch, Text, View } from 'react-native';
import { api } from '../src/api';
import { useApi } from '../src/useApi';
import { Badge, Card, ErrorText, Loading, Muted, Screen, s } from '../src/ui';
import { C } from '../src/theme';

const SKILLS = { gpc: 'General', ter: 'Termite', bed: 'Bed bug', mos: 'Mosquito', rod: 'Rodent', san: 'Disinfection' };
export default function Team() {
  const r = useApi('/staff', ['job:updated']);
  const toggle = async (u, body) => { try { await api(`/staff/${u.id}`, { method: 'PATCH', body }); r.reload(); } catch (e) { Alert.alert('Could not update', e.message); } };
  if (r.loading) return <Loading />;
  const techs = (r.data?.items || []).filter(u => u.role === 'technician');
  const others = (r.data?.items || []).filter(u => u.role !== 'technician');
  return (
    <Screen padTop={false} onRefresh={r.refresh} refreshing={r.refreshing}>
      <ErrorText>{r.error}</ErrorText>
      {techs.map(u => <Card key={u.id} style={{ gap: 6, opacity: u.active ? 1 : .5 }}>
        <View style={s.rowBetween}><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>{u.name}</Text><Muted>{u.area || '-'} · {u.open_jobs} open · {u.completed_jobs} done</Muted></View>
          <View style={{ alignItems: 'center' }}><Switch value={u.available} onValueChange={v => toggle(u, { available: v })} trackColor={{ true: C.forest3 }} /><Muted style={{ fontSize: 11 }}>{u.available ? 'Available' : 'On leave'}</Muted></View></View>
        <Muted>{u.skills.map(k => SKILLS[k]).join(', ') || 'No skills set'}</Muted>
        {!u.phone ? <Text style={{ color: C.warn, fontSize: 12.5 }}>Phone missing: add it in the web portal so masked calls work</Text> : null}
      </Card>)}
      <Text style={[s.h, { marginTop: 6 }]}>Office staff</Text>
      {others.map(u => <Card key={u.id} style={s.rowBetween}><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>{u.name}</Text><Muted>{u.email}</Muted></View>
        <Badge label={u.role === 'admin' ? 'Admin' : 'Call center'} color={u.role === 'admin' ? C.violet : C.warn} /></Card>)}
    </Screen>
  );
}
