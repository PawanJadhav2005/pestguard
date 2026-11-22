// Screens shared by both apps: Alerts and Profile
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from './api';
import { useAuth } from './auth';
import { useApi } from './useApi';
import { Btn, Card, Empty, ErrorText, H, Loading, Muted, Screen } from './ui';
import { C, fmt } from './theme';

export function AlertsScreen({ inStack = false }) {
  const router = useRouter();
  const r = useApi('/notifications', ['notification']);
  const items = r.data?.items || [];
  const open = async n => {
    await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => {});
    r.reload();
    const m = n.link?.match(/^\/jobs\/(\d+)/); if (m) router.push(`/job/${m[1]}`);
  };
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing} padTop={!inStack}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Alerts</Text>
        {r.data?.unread ? <Pressable onPress={async () => { await api('/notifications/read', { method: 'POST', body: {} }); r.reload(); }}><Text style={{ color: C.forest2, fontWeight: '700' }}>Mark all read</Text></Pressable> : null}
      </View>
      <ErrorText>{r.error}</ErrorText>
      {r.loading ? <Loading /> : items.length === 0 ? <Card><Empty title="No alerts" text="You're all caught up." icon="notifications-outline" /></Card> :
        items.map(n => <Pressable key={n.id} onPress={() => open(n)} style={{ flexDirection: 'row', gap: 12, padding: 13, borderRadius: 16, backgroundColor: n.read ? C.white : '#fff8ec', borderLeftWidth: n.read ? 0 : 3, borderLeftColor: C.amber }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="notifications-outline" size={18} color={C.forest} /></View>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: n.read ? '500' : '700', color: C.ink }}>{n.title}</Text><Muted>{fmt.ago(n.created_at)}</Muted></View>
        </Pressable>)}
    </Screen>
  );
}

export function ProfileScreen({ children, inStack = false }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  return (
    <Screen padTop={!inStack}>
      {!inStack && <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Profile</Text>}
      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '700', fontSize: 19, color: C.amberInk }}>{user?.name?.split(' ').map(p => p[0]).slice(0, 2).join('')}</Text></View>
        <View><H style={{ fontSize: 18 }}>{user?.name}</H><Muted>{user?.email}</Muted><Muted>{{ technician: `Technician · ${user?.area || ''}`, admin: 'Admin', callcenter: 'Call center' }[user?.role]}</Muted></View>
      </Card>
      {children}
      <Btn title="Change password" kind="ghost" icon="key-outline" onPress={() => router.push('/change-password')} />
      <Btn title="Sign out" kind="danger" icon="log-out-outline" onPress={logout} />
    </Screen>
  );
}
