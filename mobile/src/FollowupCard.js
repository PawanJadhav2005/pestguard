import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from './api';
import { Badge, Btn, Card, Muted, s } from './ui';
import { C, fmt } from './theme';

export default function FollowupCard({ f, onDone }) {
  const router = useRouter();
  const late = new Date(f.due_at) < new Date();
  return (
    <Card style={{ gap: 8 }}>
      <View style={s.rowBetween}><Pressable onPress={() => router.push(`/customer/${f.customer_id}`)}><Text style={{ fontWeight: '700', fontSize: 15, color: C.ink }}>{f.customer_name}</Text></Pressable>
        <Badge label={f.type} color={{ Renewal: C.warn, Callback: C.info, Feedback: C.good }[f.type]} /></View>
      {f.note ? <Muted>{f.note}</Muted> : null}
      <View style={s.rowBetween}>
        <Text style={{ fontWeight: '700', color: late ? C.bad : C.ink }}>{late ? 'Missed · ' : ''}{fmt.dt(f.due_at)}</Text>
        <View style={s.row}>
          <Btn title="Done" kind="ghost" style={{ paddingVertical: 8 }} onPress={async () => { await api(`/followups/${f.id}/done`, { method: 'POST' }); onDone?.(); }} />
          <Btn title="Call" icon="call-outline" style={{ paddingVertical: 8 }} onPress={() => router.push(`/call/${f.customer_id}`)} />
        </View>
      </View>
    </Card>
  );
}
