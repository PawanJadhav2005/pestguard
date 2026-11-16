import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { useApi } from '../../src/useApi';
import { Badge, Btn, Card, ErrorText, Field, H, Loading, Muted, Screen, ServiceIcon, s } from '../../src/ui';
import { C, PREP, SVC, fmt } from '../../src/theme';

// What the technician can do next, by current status (the server enforces the same rules)
const NEXT = { 'Assigned': ['Accepted', 'Accept job'], 'Accepted': ['On the way', 'Start travel'], 'On the way': ['In Progress', 'Start treatment'], 'On Hold': ['In Progress', 'Resume job'] };
const STEPS = ['Assigned', 'Accepted', 'On the way', 'In Progress', 'Awaiting Approval', 'Completed'];

export default function JobDetail() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const r = useApi(`/jobs/${id}`, ['job:updated']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  if (r.loading) return <Loading />;
  if (r.error) return <Screen padTop={false}><ErrorText>{r.error}</ErrorText></Screen>;
  const { job: j, events, report } = r.data;
  const isTech = user.role === 'technician';
  const color = SVC[j.serviceCode]?.color || C.forest;
  const step = STEPS.indexOf(j.status);

  const setStatus = async (status, why) => {
    setBusy(true); setErr('');
    try { await api(`/jobs/${j.id}/status`, { method: 'POST', body: { status, reason: why } }); setReasonFor(null); setReason(''); r.reload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const submitReason = async () => {
    if (reason.trim().length < 5) return setErr('Please give a short reason.');
    if (reasonFor === 'reschedule') {
      setBusy(true);
      try { await api(`/jobs/${j.id}/reschedule-request`, { method: 'POST', body: { reason } }); setReasonFor(null); setReason(''); Alert.alert('Request sent', 'The admin will reschedule this job.'); }
      catch (e) { setErr(e.message); } finally { setBusy(false); }
    } else setStatus(reasonFor, reason);
  };

  return (
    <Screen padTop={false} onRefresh={r.refresh} refreshing={r.refreshing}>
      <Stack.Screen options={{ title: j.ref, headerStyle: { backgroundColor: color } }} />
      <View style={{ backgroundColor: color, marginHorizontal: -16, marginTop: -16, padding: 18, paddingTop: 6, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, gap: 10 }}>
        <View style={s.row}><View style={{ backgroundColor: '#ffffff33', borderRadius: 16 }}><ServiceIcon code={j.serviceCode} size={54} /></View>
          <View style={{ flex: 1 }}><Text style={{ color: '#fff', fontSize: 21, fontWeight: '700' }}>{j.serviceName}</Text>
            <Text style={{ color: '#ffffffdd' }}>{fmt.dt(j.scheduledAt)} · {j.propertyType}</Text></View></View>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          <Badge label={j.status} color="#fff" />{j.overdue ? <Badge label="Overdue" color="#ffd6d3" /> : null}
          <Badge label={`${j.infestation} infestation`} color="#fff" />{j.amc ? <Badge label={`AMC visit ${j.amc.visitsDone + 1} of ${j.amc.visitsTotal}`} color={C.amber} /> : null}
        </View>
        {step >= 0 && <View style={{ flexDirection: 'row', gap: 4 }}>{STEPS.map((_, i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? C.amber : '#ffffff44' }} />)}</View>}
      </View>

      <Card style={{ gap: 8 }}>
        {[['Customer', j.customer.name], ['Address', j.customer.address], ['Phone', j.customer.mobile || 'Hidden · use the call button'], ['Price', fmt.money(j.price)], ['Warranty', j.warranty], ['Technician', j.technicianName || 'Not assigned']].map(([k, v]) =>
          <View key={k} style={s.rowBetween}><Muted>{k}</Muted><Text style={{ color: C.ink, fontWeight: '500', flex: 1, textAlign: 'right' }}>{v}</Text></View>)}
        {j.notes ? <View style={{ backgroundColor: '#fff8ec', borderRadius: 12, padding: 10 }}><Text style={{ color: C.ink }}><Text style={{ fontWeight: '700' }}>Note: </Text>{j.notes}</Text></View> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Btn title="Directions" kind="soft" icon="navigate-outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.customer.address)}`)} />
          <Btn title="Call" kind="soft" icon="call-outline" style={{ flex: 1 }} onPress={() => router.push(`/call/${j.customer.id}`)} />
        </View>
      </Card>

      <Card style={{ gap: 8 }}><H>Customer preparation</H>{(PREP[j.serviceCode] || []).map(p => <View key={p} style={s.row}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.amber }} /><Text style={{ color: C.ink, flex: 1 }}>{p}</Text></View>)}</Card>

      {report && <Card style={{ gap: 6 }}>
        <View style={s.rowBetween}><H>Treatment report</H><Badge label={report.status} color={{ submitted: C.violet, approved: C.good, returned: C.warn }[report.status]} /></View>
        {report.admin_comment && report.status === 'returned' ? <View style={{ backgroundColor: '#fff3e0', padding: 10, borderRadius: 12 }}><Text style={{ color: C.ink }}><Text style={{ fontWeight: '700' }}>Admin: </Text>{report.admin_comment}</Text></View> : null}
        <Muted>Areas: {report.areas.join(', ')}</Muted>
        {report.items.map(i => <View key={i.item_id} style={s.rowBetween}><Text style={{ color: C.ink }}>{i.name}</Text><Text style={{ fontWeight: '700' }}>{i.quantity} {i.unit}</Text></View>)}
      </Card>}

      <Card style={{ gap: 6 }}><H>Activity</H>{[...events].reverse().slice(0, 8).map((e, i) => <View key={i} style={[s.rowBetween, { alignItems: 'flex-start' }]}><Text style={{ color: C.ink, flex: 1 }}>{e.text}</Text><Muted>{fmt.dt(e.created_at)}</Muted></View>)}</Card>

      {isTech && reasonFor && <Card style={{ gap: 10 }}>
        <H>{reasonFor === 'reschedule' ? 'Request reschedule' : reasonFor === 'On Hold' ? 'Put job on hold' : 'Unable to complete'}</H>
        <Field label="Reason" value={reason} onChangeText={setReason} multiline placeholder={reasonFor === 'reschedule' ? 'e.g. Customer not home till 6 PM. Can do tomorrow 10 AM.' : 'e.g. Waiting for customer to clear the kitchen'} />
        <View style={{ flexDirection: 'row', gap: 8 }}><Btn title="Cancel" kind="ghost" style={{ flex: 1 }} onPress={() => { setReasonFor(null); setErr(''); }} /><Btn title="Send" style={{ flex: 1 }} loading={busy} onPress={submitReason} /></View>
      </Card>}
      <ErrorText>{err}</ErrorText>

      {user.role === 'admin' && reasonFor === 'cancel' && <Card style={{ gap: 10 }}>
        <H>Cancel {j.ref}</H>
        <Field label="Reason" value={reason} onChangeText={setReason} multiline placeholder="e.g. Customer travelling, will call back" />
        <View style={{ flexDirection: 'row', gap: 8 }}><Btn title="Keep job" kind="ghost" style={{ flex: 1 }} onPress={() => { setReasonFor(null); setErr(''); }} />
          <Btn title="Cancel job" kind="danger" style={{ flex: 1 }} loading={busy} onPress={async () => {
            if (reason.trim().length < 3) return setErr('Please give a reason.');
            setBusy(true); setErr('');
            try { await api(`/jobs/${j.id}/cancel`, { method: 'POST', body: { reason } }); setReasonFor(null); setReason(''); r.reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
          }} /></View>
      </Card>}
      {user.role === 'admin' && !reasonFor && ['Pending', 'Assigned', 'Accepted', 'On Hold'].includes(j.status) && <View style={{ gap: 8 }}>
        <Btn title={j.technicianId ? 'Reassign technician' : 'Assign technician'} icon="person-add-outline" onPress={() => setAssignOpen(true)} />
        <Btn title="Cancel job" kind="danger" onPress={() => { setErr(''); setReasonFor('cancel'); }} />
      </View>}
      {user.role === 'admin' && j.status === 'Awaiting Approval' && report && <Btn title="Review report" kind="amber" onPress={() => router.push(`/review/${report.id}`)} />}
      {assignOpen && <AssignSheet job={j} onClose={() => setAssignOpen(false)} onDone={() => { setAssignOpen(false); r.reload(); }} />}

      {isTech && !reasonFor && <View style={{ gap: 8 }}>
        {NEXT[j.status] && <Btn title={NEXT[j.status][1]} loading={busy} onPress={() => setStatus(NEXT[j.status][0])} />}
        {j.status === 'In Progress' && <Btn title={report?.status === 'returned' ? 'Fix and resubmit report' : 'Fill treatment report'} kind="amber" icon="document-text-outline" onPress={() => router.push(`/report/${j.id}`)} />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['Assigned', 'Accepted', 'On Hold'].includes(j.status) && <Btn title="Reschedule" kind="ghost" style={{ flex: 1 }} onPress={() => setReasonFor('reschedule')} />}
          {j.status === 'In Progress' && <Btn title="Put on hold" kind="ghost" style={{ flex: 1 }} onPress={() => setReasonFor('On Hold')} />}
          {['In Progress', 'On Hold'].includes(j.status) && <Btn title="Can't complete" kind="danger" style={{ flex: 1 }} onPress={() => setReasonFor('Unable to Complete')} />}
        </View>
        {j.status === 'Awaiting Approval' && <Card style={{ backgroundColor: '#f3eefc' }}><Text style={{ color: C.ink }}>Report sent. You'll get an alert when the admin approves it.</Text></Card>}
      </View>}
    </Screen>
  );
}

// Admin: pick a technician. Best match = trained for the service, same area, fewest open jobs.
function AssignSheet({ job: j, onClose, onDone }) {
  const staff = useApi('/staff');
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const techs = (staff.data?.items || []).filter(u => u.role === 'technician');
  const ok = t => t.active && t.available && t.skills.includes(j.serviceCode);
  const best = techs.filter(ok).sort((a, b) => ((a.area === j.customer.area ? -3 : 0) + a.open_jobs) - ((b.area === j.customer.area ? -3 : 0) + b.open_jobs))[0]?.id;
  const chosen = sel || (best !== j.technicianId ? best : null) || null;
  const save = async () => {
    if (!chosen) return setErr('Pick a technician.');
    setBusy(true); setErr('');
    try { await api(`/jobs/${j.id}/assign`, { method: 'POST', body: { technicianId: chosen } }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', padding: 18, gap: 10 }}>
          <View style={s.rowBetween}><View style={{ flex: 1 }}><H style={{ fontSize: 18 }}>{j.technicianId ? 'Reassign' : 'Assign'} {j.ref}</H><Muted>{j.serviceName} · {j.customer.area} · {fmt.dt(j.scheduledAt)}</Muted></View>
            <Pressable accessibilityLabel="Close" onPress={onClose}><Ionicons name="close" size={24} color={C.ink} /></Pressable></View>
          {staff.loading ? <Loading /> : <ScrollView contentContainerStyle={{ gap: 8 }}>{techs.map(t => (
            <Pressable key={t.id} disabled={!ok(t)} onPress={() => setSel(t.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: C.white, borderWidth: 1.5, borderColor: chosen === t.id ? C.forest : C.line, opacity: ok(t) ? 1 : .45 }}>
              <View style={{ flex: 1 }}>
                <View style={s.row}><Text style={{ fontWeight: '700', color: C.ink }}>{t.name}</Text>{t.id === best ? <View style={{ backgroundColor: '#fff1d8', paddingHorizontal: 6, borderRadius: 5 }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: '#8a5600' }}>BEST MATCH</Text></View> : null}{t.id === j.technicianId ? <Muted>· current</Muted> : null}</View>
                <Muted>{t.area || '-'}{t.area === j.customer.area ? ' (same area)' : ''} · {t.open_jobs} open jobs</Muted>
              </View>
              <Muted>{!t.active ? 'Inactive' : !t.available ? 'On leave' : !t.skills.includes(j.serviceCode) ? 'Not trained' : ''}</Muted>
            </Pressable>))}</ScrollView>}
          <ErrorText>{err}</ErrorText>
          <Btn title="Confirm" loading={busy} onPress={save} />
        </View>
      </View>
    </Modal>
  );
}
