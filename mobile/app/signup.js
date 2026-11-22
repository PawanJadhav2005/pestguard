import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { Btn, Card, Chip, ErrorText, Field, Muted } from '../src/ui';
import { C } from '../src/theme';

// New staff create an account here. It stays locked until the admin approves it.
export default function Signup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '', role: 'technician', area: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = k => v => setF({ ...f, [k]: v });
  const submit = async () => {
    setErr('');
    if (f.name.trim().length < 2) return setErr('Enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr('Enter a valid email address.');
    if (f.phone.replace(/\D/g, '').length < 10) return setErr('Enter your 10-digit mobile number.');
    if (f.password.length < 8) return setErr('Password must be at least 8 characters.');
    if (f.password !== f.confirm) return setErr('The two passwords do not match.');
    setBusy(true);
    try {
      await api('/auth/signup', { method: 'POST', body: { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), password: f.password, role: f.role, area: f.area.trim() || undefined } });
      setDone(true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (done) return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24, gap: 16 }}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="time-outline" size={36} color={C.forest} /></View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink, textAlign: 'center' }}>Account created</Text>
        <Muted style={{ textAlign: 'center', fontSize: 14 }}>The admin has been told about your request. You can sign in with {f.email.trim()} as soon as they approve it.</Muted>
      </View>
      <Btn title="Back to sign in" onPress={() => router.replace('/login')} />
    </View>
  );
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ backgroundColor: C.forest, paddingTop: insets.top + 24, paddingHorizontal: 24, paddingBottom: 60, gap: 8 }}>
          <Pressable accessibilityLabel="Back" onPress={() => router.replace('/login')} style={{ alignSelf: 'flex-start', padding: 4, marginLeft: -4 }}><Ionicons name="arrow-back" size={24} color="#fff" /></Pressable>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>Create account</Text>
          <Text style={{ color: '#ffffffcc' }}>For PestGuard staff. The admin approves new accounts.</Text>
        </View>
        <Card style={{ marginHorizontal: 18, marginTop: -40, gap: 12, padding: 18, marginBottom: 24 }}>
          <Field label="Full name" value={f.name} onChangeText={set('name')} autoComplete="name" />
          <Field label="Email" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Mobile number" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="98xxxxxxxx" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>I work as</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Technician" active={f.role === 'technician'} onPress={() => set('role')('technician')} />
            <Chip label="Call center" active={f.role === 'callcenter'} onPress={() => set('role')('callcenter')} />
          </View>
          {f.role === 'technician' && <Field label="Area you work in (optional)" value={f.area} onChangeText={set('area')} placeholder="e.g. Hadapsar" />}
          <Field label="Password (at least 8 characters)" value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />
          <Field label="Confirm password" value={f.confirm} onChangeText={set('confirm')} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
          <ErrorText>{err}</ErrorText>
          <Btn title="Create account" loading={busy} onPress={submit} />
          <Pressable onPress={() => router.replace('/login')} style={{ alignItems: 'center', padding: 6 }}><Muted>Already have an account? <Text style={{ color: C.forest2, fontWeight: '700' }}>Sign in</Text></Muted></Pressable>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
