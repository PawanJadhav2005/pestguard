import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { Btn, Card, Chip, ErrorText, Field, H, Muted, Screen } from '../../src/ui';
import { C } from '../../src/theme';

const OUTCOMES = ['Connected', 'No answer', 'Busy', 'Booked service', 'Complaint', 'Wrong number', 'Feedback received'];

// Masked call: the server asks the calling provider to ring YOUR phone first,
// then connects you to the customer. Their number never reaches this app.
export default function Call() {
  const { customerId } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [phase, setPhase] = useState('starting'); // starting | ringing | failed | log
  const [msg, setMsg] = useState('');
  const [callId, setCallId] = useState(null);
  const [name, setName] = useState('');
  const [outcome, setOutcome] = useState('Connected');
  const [notes, setNotes] = useState('');
  const [callback, setCallback] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => {
    api(`/customers/${customerId}`).then(r => setName(r.customer.name)).catch(() => {});
    api('/calls', { method: 'POST', body: { customerId: Number(customerId) } })
      .then(r => { setCallId(r.callId); setMsg(r.message); setPhase('ringing'); started.current = Date.now(); })
      .catch(e => { setMsg(e.message); setPhase('failed'); });
  }, [customerId]);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api(`/calls/${callId}/outcome`, { method: 'POST', body: { outcome, notes: notes.trim() || undefined,
        durationSec: outcome === 'Connected' || outcome === 'Booked service' ? Math.round((Date.now() - started.current) / 1000) : 0,
        callbackAt: callback ? new Date(Date.now() + 2 * 36e5).toISOString() : undefined } });
      router.back();
      if (outcome === 'Booked service' && user.role === 'callcenter') setTimeout(() => router.push({ pathname: '/book', params: { customerId } }), 50);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (phase !== 'log') return (
    <View style={{ flex: 1, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'space-between', padding: 28, paddingVertical: 60 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6, backgroundColor: '#ffffff22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, alignItems: 'center' }}>
          <Ionicons name="lock-closed" size={13} color="#fff" /><Text style={{ color: '#fff', fontSize: 12.5 }}>Number hidden · company line</Text></View>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: phase === 'failed' ? '#d4443c55' : '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={phase === 'failed' ? 'alert' : 'call'} size={40} color="#fff" /></View>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>{name || 'Customer'}</Text>
        <Text style={{ color: '#ffffffdd', textAlign: 'center', maxWidth: 300 }}>{phase === 'starting' ? 'Connecting…' : msg}</Text>
      </View>
      {phase === 'ringing' && <Btn title="Call finished · log outcome" kind="amber" onPress={() => setPhase('log')} style={{ alignSelf: 'stretch' }} />}
      {phase === 'failed' && <Btn title="Close" kind="soft" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />}
    </View>
  );
  return (
    <Screen padTop={false}>
      <H>How did the call go?</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{OUTCOMES.map(o => <Chip key={o} label={o} active={outcome === o} onPress={() => setOutcome(o)} />)}</View>
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="What did the customer say?" />
      <Pressable onPress={() => setCallback(v => !v)}><Card style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Ionicons name={callback ? 'checkbox' : 'square-outline'} size={22} color={C.forest} /><Text style={{ color: C.ink }}>Schedule a callback in 2 hours</Text></Card></Pressable>
      <ErrorText>{err}</ErrorText>
      <Btn title="Save" loading={busy} onPress={save} />
      <Muted>Saved to the customer's call history.</Muted>
    </Screen>
  );
}
