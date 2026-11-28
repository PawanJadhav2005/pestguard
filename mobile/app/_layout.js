import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth';
import LiveBanner from '../src/LiveBanner';
import WakingBanner from '../src/WakingBanner';
import { C } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: C.forest }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="staff/[id]" options={{ title: 'Staff' }} />
          <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
          <Stack.Screen name="(tech)" options={{ headerShown: false }} />
          <Stack.Screen name="(cc)" options={{ headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          <Stack.Screen name="review/[id]" options={{ title: 'Review report' }} />
          <Stack.Screen name="alerts" options={{ title: 'Alerts' }} />
          <Stack.Screen name="customers" options={{ title: 'Customers' }} />
          <Stack.Screen name="team" options={{ title: 'Team' }} />
          <Stack.Screen name="calls" options={{ title: 'Calls & follow-ups' }} />
          <Stack.Screen name="prices" options={{ title: 'Service prices' }} />
          <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
          <Stack.Screen name="report/[id]" options={{ title: 'Treatment report' }} />
          <Stack.Screen name="customer/[id]" options={{ title: 'Customer' }} />
          <Stack.Screen name="book" options={{ title: 'Book a service', presentation: 'modal' }} />
          <Stack.Screen name="call/[customerId]" options={{ title: 'Call', presentation: 'modal' }} />
        </Stack>
        <LiveBanner />
        <WakingBanner />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
