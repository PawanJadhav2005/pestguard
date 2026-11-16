import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onLive } from './api';
import { C } from './theme';

// Shows incoming notifications as a banner at the top while the app is open
export default function LiveBanner() {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState(null);
  const y = useRef(new Animated.Value(-120)).current;
  useEffect(() => onLive('notification', n => {
    setMsg(n.title);
    Animated.sequence([
      Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(y, { toValue: -120, duration: 220, useNativeDriver: true })
    ]).start(() => setMsg(null));
  }), []);
  if (!msg) return null;
  return (
    <Animated.View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 6, transform: [{ translateY: y }] }}>
      <Pressable onPress={() => setMsg(null)} style={{ backgroundColor: C.ink, borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: C.amber, elevation: 6 }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>{msg}</Text>
      </Pressable>
    </Animated.View>
  );
}
