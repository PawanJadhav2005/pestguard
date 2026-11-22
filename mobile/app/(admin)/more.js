import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../src/auth';
import { useApi } from '../../src/useApi';
import { Btn, Card, Muted, Screen } from '../../src/ui';
import { C } from '../../src/theme';

export default function More() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const n = useApi('/notifications', ['notification']);
  const staff = useApi('/staff', ['notification']);
  const waiting = (staff.data?.items || []).filter(u => !u.approved).length;
  const Row = ({ icon, label, sub, to, badge }) => (
    <Pressable onPress={() => router.push(to)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={19} color={C.forest} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.ink }}>{label}</Text>{sub ? <Muted>{sub}</Muted> : null}</View>
      {badge ? <View style={{ backgroundColor: C.bad, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{badge}</Text></View> : null}
      <Ionicons name="chevron-forward" size={18} color={C.grey} />
    </Pressable>);
  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>More</Text>
      <Card style={{ paddingVertical: 4 }}>
        <Row icon="notifications-outline" label="Alerts" to="/alerts" badge={n.data?.unread} />
        <Row icon="people-outline" label="Customers" sub="Search, history, mobile numbers" to="/customers" />
        <Row icon="construct-outline" label="Team" sub="Add staff, approve sign-ups, leave, passwords" to="/team" badge={waiting} />
        <Row icon="call-outline" label="Calls & follow-ups" to="/calls" />
        <Row icon="pricetag-outline" label="Service prices" to="/prices" />
        <Row icon="key-outline" label="Change my password" to="/change-password" />
      </Card>
      <Card><Text style={{ fontWeight: '700', color: C.ink }}>{user.name}</Text><Muted>{user.email} · Admin</Muted></Card>
      <Btn title="Sign out" kind="danger" icon="log-out-outline" onPress={logout} />
    </Screen>
  );
}
