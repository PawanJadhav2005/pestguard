import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../src/auth';
import { useApi } from '../../src/useApi';
import { C } from '../../src/theme';

export default function TechTabs() {
  const { user } = useAuth();
  const n = useApi(user?.role === 'technician' ? '/notifications' : null, ['notification']);
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'technician') return <Redirect href="/" />;
  const icon = name => ({ color, size }) => <Ionicons name={name} size={size} color={color} />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.forest, tabBarInactiveTintColor: C.grey, tabBarStyle: { height: 64, paddingBottom: 8 } }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: icon('notifications-outline'), tabBarBadge: n.data?.unread || undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
