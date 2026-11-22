import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { session } from '../src/api';
import { Btn, Card, ErrorText, Field, Muted } from '../src/ui';
import { C } from '../src/theme';

export default function Login() {
  const { user, login } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(session.baseUrl);
  const [showServer, setShowServer] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Redirect href="/" />;
  const submit = async () => {
    if (!email || !password) return setErr('Enter your email and password.');
    setBusy(true); setErr('');
    try { await session.setServer(server.trim()); await login(email.trim(), password); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ backgroundColor: C.forest, paddingTop: insets.top + 40, paddingHorizontal: 24, paddingBottom: 70, gap: 14 }}>
          <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="shield-checkmark" size={32} color={C.amberInk} /></View>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700' }}>PestGuard</Text>
          <Text style={{ color: '#ffffffcc' }}>For technicians, call center and admins</Text>
        </View>
        <Card style={{ marginHorizontal: 18, marginTop: -44, gap: 14, padding: 18 }}>
          <Text style={{ fontSize: 19, fontWeight: '700', color: C.ink }}>Sign in</Text>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
          {showServer
            ? <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" keyboardType="url" placeholder="http://192.168.1.10:4000" />
            : <Pressable onPress={() => setShowServer(true)}><Muted>Server: {server} · <Text style={{ color: C.forest2, fontWeight: '700' }}>Change</Text></Muted></Pressable>}
          <ErrorText>{err}</ErrorText>
          <Btn title="Sign in" onPress={submit} loading={busy} />
          <Pressable onPress={() => { session.setServer(server.trim()); router.push('/signup'); }} style={{ alignItems: 'center', padding: 6 }}>
            <Muted>New here? <Text style={{ color: C.forest2, fontWeight: '700' }}>Create an account</Text></Muted></Pressable>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
