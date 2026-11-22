import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api';
import { Btn, Card, ErrorText, Field, Muted, Screen } from '../src/ui';

export default function ChangePassword() {
  const router = useRouter();
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr('');
    if (!cur) return setErr('Enter your current password.');
    if (pw.length < 8) return setErr('New password must be at least 8 characters.');
    if (pw !== pw2) return setErr('The new passwords do not match.');
    setBusy(true);
    try { await api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: pw } }); Alert.alert('Password changed', 'Use your new password next time you sign in.'); router.back(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Screen padTop={false}>
      <Card style={{ gap: 12 }}>
        <Field label="Current password" value={cur} onChangeText={setCur} secureTextEntry autoComplete="current-password" />
        <Field label="New password (at least 8 characters)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
        <Field label="Confirm new password" value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" onSubmitEditing={save} />
        <ErrorText>{err}</ErrorText>
        <Btn title="Change password" loading={busy} onPress={save} />
      </Card>
      <Muted>Forgot your current password? Ask the admin to set a new one for you in Team.</Muted>
    </Screen>
  );
}
