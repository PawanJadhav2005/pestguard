import { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { Btn, Card, Chip, ErrorText, Field, H, Loading, Muted, Screen, s } from '../../src/ui';
import { C } from '../../src/theme';

const SKILLS = { gpc: 'General', ter: 'Termite', bed: 'Bed bug', mos: 'Mosquito', rod: 'Rodent', san: 'Disinfection' };
const ROLES = [['technician', 'Technician'], ['callcenter', 'Call center'], ['admin', 'Admin']];

// Admin: add a staff member (id = "new"), edit one, approve a sign-up, or reset a password
export default function StaffForm() {
  const { id } = useLocalSearchParams();
  const isNew = id === 'new';
  const router = useRouter();
  const { user: me } = useAuth();
  const [f, setF] = useState(isNew ? { name: '', email: '', phone: '', role: 'technician', area: '', skills: [], active: true, approved: true } : null);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isNew) return;
    api('/staff').then(r => { const u = r.items.find(x => String(x.id) === String(id)); if (!u) return setErr('Staff member not found'); setF({ ...u, phone: u.phone || '', area: u.area || '' }); }).catch(e => setErr(e.message));
  }, [id]);
  if (!f) return err ? <Screen padTop={false}><ErrorText>{err}</ErrorText></Screen> : <Loading />;
  const set = k => v => setF({ ...f, [k]: v });
  const self = !isNew && Number(id) === me.id;

  const save = async (approve = false) => {
    setErr('');
    if (f.name.trim().length < 2) return setErr('Enter the full name.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr('Enter a valid email.');
    if (isNew && password.length < 8) return setErr('Set a password of at least 8 characters.');
    if (!isNew && password && password.length < 8) return setErr('New password must be at least 8 characters.');
    setBusy(true);
    try {
      const common = { name: f.name.trim(), phone: f.phone.trim() || undefined, area: f.area.trim() || undefined, skills: f.role === 'technician' ? f.skills : [] };
      if (isNew) await api('/staff', { method: 'POST', body: { ...common, email: f.email.trim(), role: f.role, password } });
      else await api(`/staff/${id}`, { method: 'PATCH', body: { ...common, email: f.email.trim(), role: self ? undefined : f.role, ...(password ? { password } : {}), ...(approve ? { approved: true } : {}), ...(f.approved && !self ? { active: f.active } : {}) } });
      Alert.alert(isNew ? 'Staff added' : approve ? 'Approved' : 'Saved', isNew ? `Give ${f.name.trim()} their email and password privately. They can change the password later in Profile.` : approve ? `${f.name} can sign in now.` : password ? 'The new password is set. Share it with them privately.' : undefined);
      router.back();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const reject = () => Alert.alert('Reject this request?', `${f.name}'s sign-up request will be deleted.`, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Reject', style: 'destructive', onPress: async () => { try { await api(`/staff/${id}`, { method: 'DELETE' }); router.back(); } catch (e) { setErr(e.message); } } }]);

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: isNew ? 'Add staff' : !f.approved ? 'Sign-up request' : 'Edit staff' }} />
      {!isNew && !f.approved && <Card style={{ backgroundColor: '#fff6e5' }}><Text style={{ color: C.ink }}>{f.name} created this account and is waiting for approval. Check the details and role, then approve or reject.</Text></Card>}
      <Card style={{ gap: 12 }}>
        <Field label="Full name" value={f.name} onChangeText={set('name')} />
        <Field label="Email (used to sign in)" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Mobile number" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+91 98xxxxxxxx" />
        <H style={{ fontSize: 14 }}>Role</H>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{ROLES.map(([k, l]) => <Chip key={k} label={l} active={f.role === k} onPress={() => !self && set('role')(k)} />)}</View>
        {self && <Muted>You can't change your own role.</Muted>}
        {f.role === 'technician' && <>
          <Field label="Base area" value={f.area} onChangeText={set('area')} placeholder="e.g. Hadapsar" />
          <H style={{ fontSize: 14 }}>Skills</H>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{Object.entries(SKILLS).map(([k, l]) =>
            <Chip key={k} label={l} active={f.skills.includes(k)} onPress={() => set('skills')(f.skills.includes(k) ? f.skills.filter(x => x !== k) : [...f.skills, k])} />)}</View>
        </>}
        <Field label={isNew ? 'Password (at least 8 characters)' : 'Set a new password (leave empty to keep the current one)'} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        {!isNew && f.approved && !self && <View style={s.rowBetween}><View style={{ flex: 1 }}><Text style={{ color: C.ink, fontWeight: '600' }}>Can sign in</Text><Muted>Turn off when someone leaves. Their past work stays saved.</Muted></View>
          <Switch value={f.active} onValueChange={set('active')} trackColor={{ true: C.forest3 }} /></View>}
      </Card>
      <ErrorText>{err}</ErrorText>
      {!isNew && !f.approved ? <>
        <Btn title="Approve and allow sign-in" icon="checkmark-circle-outline" loading={busy} onPress={() => save(true)} />
        <Btn title="Reject request" kind="danger" onPress={reject} />
      </> : <Btn title={isNew ? 'Add staff member' : 'Save changes'} loading={busy} onPress={() => save(false)} />}
    </Screen>
  );
}
