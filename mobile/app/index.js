import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/auth';
import { C } from '../src/theme';

export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.forest, justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={user.role === 'technician' ? '/(tech)' : user.role === 'admin' ? '/(admin)' : '/(cc)'} />;
}
