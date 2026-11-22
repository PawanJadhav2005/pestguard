import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../src/auth';
import { useApi } from '../../src/useApi';
import { C } from '../../src/theme';

export default function AdminTabs() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const dash = useApi(isAdmin ? '/dashboard' : null, ['report:submitted', 'report:reviewed', 'inventory:changed', 'job:updated']);
  const n = useApi(isAdmin ? '/notifications' : null, ['notification']);
  const staff = useApi(isAdmin ? '/staff' : null, ['notification']);
  const waiting = (staff.data?.items || []).filter(u => !u.approved).length;
  if (!user) return <Redirect href="/login" />;
  if (!isAdmin) return <Redirect href="/" />;
  const c = dash.data?.counts;
  const icon = name => ({ color, size }) => <Ionicons name={name} size={size} color={color} />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.forest, tabBarInactiveTintColor: C.grey, tabBarStyle: { height: 64, paddingBottom: 8 } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: icon('list-outline'), tabBarBadge: c && (c.overdue + c.unassigned) ? c.overdue + c.unassigned : undefined }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarIcon: icon('checkmark-done-outline'), tabBarBadge: c?.awaiting || undefined }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarIcon: icon('cube-outline'), tabBarBadge: dash.data?.lowStock?.length || undefined }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu-outline'), tabBarBadge: (n.data?.unread || 0) + waiting || undefined }} />
    </Tabs>
  );
}
