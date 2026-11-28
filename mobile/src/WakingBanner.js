import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onLive } from './api';
import { C } from './theme';

// Shown while the free server is waking up, so people wait instead of thinking the app is broken
export default function WakingBanner() {
  const insets = useSafeAreaInsets();
  const [on, setOn] = useState(false);
  useEffect(() => onLive('server:waking', setOn), []);
  if (!on) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 6, backgroundColor: C.ink, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', elevation: 8 }}>
      <ActivityIndicator color={C.amber} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Starting the server…</Text>
        <Text style={{ color: '#ffffffcc', fontSize: 12.5 }}>This can take up to a minute after a quiet period. Please wait.</Text>
      </View>
    </View>
  );
}
