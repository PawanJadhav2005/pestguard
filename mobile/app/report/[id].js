import { useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import SignatureScreen from 'react-native-signature-canvas';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, uploadFile } from '../../src/api';
import { useApi } from '../../src/useApi';
import { Btn, Card, Chip, ErrorText, Field, H, Loading, Muted, Screen, s } from '../../src/ui';
import { AREAS, C } from '../../src/theme';

const SAFETY = ['Customer briefed on precautions', 'Food, utensils and water covered', 'Children and pets moved out'];

// Treatment report. On submit the server saves it, deducts the chemicals from the
// central store, and the admin portal receives it instantly.
export default function Report() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const inv = useApi('/inventory', ['inventory:changed']);
  const [safety, setSafety] = useState([false, false, false]);
  const [areas, setAreas] = useState([]);
  const [lines, setLines] = useState([]); // { item, qty }
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState({ before: null, after: null }); // { uri, mimeType }
  const [sig, setSig] = useState(null); // base64 png
  const [picker, setPicker] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  const takePhoto = async kind => {
    const choose = async fromCamera => {
      const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permission needed', 'Allow access in your phone settings to add photos.');
      const res = await (fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: 'images', quality: 0.6 });
      if (res.canceled) return;
      const a = res.assets[0];
      if (a.fileSize && a.fileSize > 5 * 1024 * 1024) return Alert.alert('Photo too large', 'Pick a photo under 5 MB.');
      setPhotos(p => ({ ...p, [kind]: { uri: a.uri, mimeType: a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' } }));
    };
    Alert.alert(kind === 'before' ? 'Before photo' : 'After photo', undefined, [
      { text: 'Take photo', onPress: () => choose(true) }, { text: 'Choose from gallery', onPress: () => choose(false) }, { text: 'Cancel', style: 'cancel' }]);
  };

  const submit = async () => {
    setErr('');
    if (safety.includes(false)) return setErr('Tick all three safety checks.');
    if (!areas.length) return setErr('Select at least one treated area.');
    if (lines.some(l => !(Number(l.qty) > 0))) return setErr('Enter a quantity for every chemical, or remove the empty line.');
    const over = lines.find(l => Number(l.qty) > l.item.quantity);
    if (over) return setErr(`Only ${over.item.quantity} ${over.item.unit} of ${over.item.name} is in the store. Tell the admin.`);
    if (!photos.after) return setErr('Add an after photo.');
    if (!sig) return setErr("Get the customer's signature.");
    setBusy(true);
    try {
      const afterPhoto = await uploadFile(photos.after.uri, photos.after.mimeType);
      const beforePhoto = photos.before ? await uploadFile(photos.before.uri, photos.before.mimeType) : undefined;
      const f = new File(Paths.cache, `signature-${Date.now()}.png`);
      await f.write(sig.replace(/^data:image\/png;base64,/, ''), { encoding: 'base64' });
      const signature = await uploadFile(f.uri, 'image/png');
      await api(`/jobs/${id}/report`, { method: 'POST', body: {
        areas, safetyConfirmed: true, notes: notes.trim() || undefined, afterPhoto, beforePhoto, signature,
        items: lines.map(l => ({ itemId: l.item.id, quantity: Number(l.qty) }))
      } });
      Alert.alert('Report sent', 'The admin has it now. Stock was updated.');
      router.back();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (inv.loading) return <Loading />;
  const used = new Set(lines.map(l => l.item.id));
  return (
    <>
      <Screen padTop={false}>
        <Card style={{ gap: 4 }}><H>Safety checklist</H>
          {SAFETY.map((t, i) => <Pressable key={t} onPress={() => setSafety(v => v.map((x, k) => k === i ? !x : x))} style={[s.rowBetween, { paddingVertical: 8 }]}>
            <Text style={{ color: C.ink, flex: 1 }}>{t}</Text><Switch value={safety[i]} onValueChange={() => setSafety(v => v.map((x, k) => k === i ? !x : x))} trackColor={{ true: C.forest3 }} /></Pressable>)}</Card>

        <Card style={{ gap: 10 }}><H>Areas treated</H>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{AREAS.map(a => <Chip key={a} label={a} active={areas.includes(a)} onPress={() => setAreas(v => v.includes(a) ? v.filter(x => x !== a) : [...v, a])} />)}</View></Card>

        <Card style={{ gap: 10 }}>
          <View style={s.rowBetween}><H>Chemicals used</H><Pressable onPress={() => setPicker(true)}><Text style={{ color: C.forest2, fontWeight: '700' }}>+ Add</Text></Pressable></View>
          {lines.length === 0 ? <Muted>No chemicals added yet.</Muted> : lines.map((l, i) => (
            <View key={l.item.id} style={[s.row, { alignItems: 'flex-end' }]}>
              <View style={{ flex: 1 }}><Text style={{ color: C.ink, fontWeight: '600' }}>{l.item.name}</Text><Muted>{l.item.quantity} {l.item.unit} in store</Muted></View>
              <Field value={l.qty} onChangeText={t => setLines(v => v.map((x, k) => k === i ? { ...x, qty: t.replace(/[^0-9.]/g, '') } : x))} keyboardType="decimal-pad" placeholder={l.item.unit} style={{ width: 84 }} />
              <Pressable accessibilityLabel="Remove" onPress={() => setLines(v => v.filter((_, k) => k !== i))} style={{ padding: 10 }}><Ionicons name="close-circle" size={24} color={C.bad} /></Pressable>
            </View>))}
          <Muted>Quantities are deducted from the store when you submit.</Muted>
        </Card>

        <Card style={{ gap: 10 }}><H>Photos</H>
          <View style={{ flexDirection: 'row', gap: 10 }}>{['before', 'after'].map(k => (
            <Pressable key={k} onPress={() => takePhoto(k)} style={{ flex: 1, aspectRatio: 1, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: '#c8d8d1', backgroundColor: C.mint2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {photos[k] ? <Image source={{ uri: photos[k].uri }} style={{ width: '100%', height: '100%' }} /> : <><Ionicons name="camera-outline" size={28} color={C.muted} /><Muted>{k === 'before' ? 'Before (optional)' : 'After (required)'}</Muted></>}
            </Pressable>))}</View></Card>

        <Card style={{ gap: 10 }}><H>Notes for customer</H><Field value={notes} onChangeText={setNotes} multiline placeholder="e.g. Sealed gaps behind the sink. Next service in 3 months." /></Card>

        <Card style={{ gap: 10 }}>
          <View style={s.rowBetween}><H>Customer signature</H>{sig ? <Pressable onPress={() => setSig(null)}><Text style={{ color: C.forest2, fontWeight: '700' }}>Clear</Text></Pressable> : null}</View>
          <Pressable onPress={() => setSigOpen(true)} style={{ height: 120, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: '#c8d8d1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            {sig ? <Image source={{ uri: sig }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : <Muted>Tap to let the customer sign</Muted>}
          </Pressable></Card>

        <ErrorText>{err}</ErrorText>
        <Btn title="Submit treatment report" kind="amber" icon="checkmark-circle-outline" loading={busy} onPress={submit} />
      </Screen>

      <Modal visible={picker} animationType="slide" transparent onRequestClose={() => setPicker(false)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', padding: 16, gap: 10 }}>
            <View style={s.rowBetween}><H>Choose chemical</H><Pressable onPress={() => setPicker(false)}><Ionicons name="close" size={24} color={C.ink} /></Pressable></View>
            <ScrollView>{(inv.data?.items || []).map(i => (
              <Pressable key={i.id} disabled={used.has(i.id)} onPress={() => { setLines(v => [...v, { item: i, qty: '' }]); setPicker(false); }}
                style={{ padding: 13, borderRadius: 14, backgroundColor: C.white, marginBottom: 8, opacity: used.has(i.id) ? .4 : 1 }}>
                <Text style={{ color: C.ink, fontWeight: '600' }}>{i.name}</Text><Muted>{i.quantity} {i.unit} in store{i.quantity <= 0 ? ' · out of stock' : ''}</Muted>
              </Pressable>))}</ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={sigOpen} animationType="slide" onRequestClose={() => setSigOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 40 }}>
          <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.ink, marginBottom: 8 }}>Customer signature</Text>
          <SignatureScreen onOK={data => { setSig(data); setSigOpen(false); }} onEmpty={() => Alert.alert('Please sign first')}
            descriptionText="Sign above" clearText="Clear" confirmText="Save" autoClear={false} imageType="image/png" />
          <Btn title="Cancel" kind="ghost" style={{ margin: 16 }} onPress={() => setSigOpen(false)} />
        </View>
      </Modal>
    </>
  );
}
