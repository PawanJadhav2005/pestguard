import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../../src/api';
import { useApi } from '../../src/useApi';
import { Badge, Btn, Card, Chip, Empty, ErrorText, Field, H, Loading, Muted, Screen, Segments, s } from '../../src/ui';
import { C, fmt } from '../../src/theme';

const CATS = { chemical: 'Chemical', consumable: 'Consumable', equipment: 'Equipment', safety: 'Safety gear' };
const REASON = { stock_in: ['Added', C.good], stock_out: ['Removed', C.bad], adjustment: ['Count corrected', C.info], job_usage: ['Used on job', C.warn], job_usage_reversed: ['Returned', C.violet] };

// Updates by itself: stock changes from anyone (including technician reports) arrive live
export default function Inventory() {
  const items = useApi('/inventory', ['inventory:changed']);
  const moves = useApi('/inventory/movements?limit=50', ['inventory:changed']);
  const [tab, setTab] = useState('stock');
  const [q, setQ] = useState('');
  const [adjust, setAdjust] = useState(null);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(false);
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!items.data) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    setFlash(true); const t = setTimeout(() => setFlash(false), 2500); return () => clearTimeout(t);
  }, [items.data]);
  const all = items.data?.items || [];
  const list = all.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase()));
  const low = all.filter(i => i.active && i.low).length;
  return (
    <>
      <Screen onRefresh={() => { items.refresh(); moves.refresh(); }} refreshing={items.refreshing}>
        <View style={s.rowBetween}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Inventory</Text>
          <Pressable accessibilityLabel="Add item" onPress={() => setAdding(true)} style={{ backgroundColor: C.amber, borderRadius: 12, padding: 9 }}><Ionicons name="add" size={22} color={C.amberInk} /></Pressable>
        </View>
        <View style={s.row}><Muted>{all.filter(i => i.active).length} items · {low} low</Muted>{flash ? <Text style={{ color: C.good, fontWeight: '700', fontSize: 12.5 }}>· Updated just now</Text> : null}</View>
        <Segments value={tab} onChange={setTab} options={[['stock', 'Stock'], ['history', 'History']]} />
        {tab === 'stock' ? <>
          <Field value={q} onChangeText={setQ} placeholder="Search name or SKU" />
          <ErrorText>{items.error}</ErrorText>
          {items.loading ? <Loading /> : list.length === 0 ? <Card><Empty title={all.length ? 'No items match' : 'No inventory yet'} icon="cube-outline" /></Card> :
            list.map(i => {
              const pct = i.reorder_level > 0 ? Math.min(100, i.quantity / (i.reorder_level * 3) * 100) : 100;
              return <Pressable key={i.id} onPress={() => setAdjust(i)} style={{ opacity: i.active ? 1 : .5 }}><Card style={{ gap: 8 }}>
                <View style={s.rowBetween}><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>{i.name}</Text><Muted>{i.sku} · {CATS[i.category]}{!i.active ? ' · not in use' : ''}</Muted></View>
                  <View style={{ alignItems: 'flex-end' }}><Text style={{ fontSize: 18, fontWeight: '700', color: i.low ? C.bad : C.ink }}>{fmt.money(i.quantity).slice(1)} {i.unit}</Text>{i.low ? <Badge label="Low" color={C.bad} /> : null}</View></View>
                <View style={{ height: 7, borderRadius: 4, backgroundColor: C.mint2 }}><View style={{ height: 7, borderRadius: 4, width: `${pct}%`, backgroundColor: i.low ? C.bad : C.forest3 }} /></View>
                <Muted>Reorder at {i.reorder_level} {i.unit} · used {i.used_30d} {i.unit} in 30 days</Muted>
              </Card></Pressable>;
            })}
        </> : moves.loading ? <Loading /> : (moves.data?.items || []).length === 0 ? <Card><Empty title="No stock changes yet" /></Card> :
          <Card>{moves.data.items.map(m => <View key={m.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line, gap: 3 }}>
            <View style={s.rowBetween}><Text style={{ color: C.ink, fontWeight: '600', flex: 1 }}>{m.item_name}</Text>
              <Text style={{ fontWeight: '700', color: m.change > 0 ? C.good : C.bad }}>{m.change > 0 ? '+' : ''}{m.change} {m.unit}</Text></View>
            <View style={s.rowBetween}><View style={s.row}><Badge label={REASON[m.reason][0]} color={REASON[m.reason][1]} />{m.job_id ? <Muted>JB-{m.job_id}</Muted> : null}</View><Muted>{fmt.dt(m.created_at)}</Muted></View>
            <Muted>{m.user_name || '-'} · balance {m.balance_after} {m.unit}{m.note ? ` · ${m.note}` : ''}</Muted>
          </View>)}</Card>}
      </Screen>
      {adjust && <AdjustSheet item={adjust} onClose={() => setAdjust(null)} />}
      {adding && <AddItemSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function Sheet({ title, sub, onClose, children }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
          <View style={[s.rowBetween, { padding: 18, paddingBottom: 6 }]}><View style={{ flex: 1 }}><H style={{ fontSize: 18 }}>{title}</H>{sub ? <Muted>{sub}</Muted> : null}</View>
            <Pressable accessibilityLabel="Close" onPress={onClose}><Ionicons name="close" size={24} color={C.ink} /></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 8, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AdjustSheet({ item, onClose }) {
  const [reason, setReason] = useState('stock_in');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [reorder, setReorder] = useState(String(item.reorder_level));
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const n = Number(qty);
  const after = reason === 'stock_in' ? item.quantity + n : reason === 'stock_out' ? item.quantity - n : n;
  const save = async () => {
    if (qty === '' || isNaN(n) || n < 0 || (reason !== 'adjustment' && n <= 0)) return setErr('Enter a quantity.');
    setBusy(true); setErr('');
    try {
      await api(`/inventory/${item.id}/adjust`, { method: 'POST', body: reason === 'adjustment' ? { reason, countedQuantity: n, note: note || undefined } : { reason, quantity: n, note: note || undefined } });
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const saveSettings = async (body) => {
    setBusy(true); setErr('');
    try { await api(`/inventory/${item.id}`, { method: 'PATCH', body }); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet title={item.name} sub={`Currently ${item.quantity} ${item.unit} in store`} onClose={onClose}>
      <Segments value={reason} onChange={setReason} options={[['stock_in', 'Add'], ['stock_out', 'Remove'], ['adjustment', 'Count']]} />
      <Field label={reason === 'adjustment' ? `Counted quantity (${item.unit})` : `Quantity (${item.unit})`} value={qty} onChangeText={t => setQty(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" autoFocus />
      <Field label="Note" value={note} onChangeText={setNote} placeholder={reason === 'stock_in' ? 'e.g. Purchase bill #4521' : reason === 'stock_out' ? 'e.g. Expired or damaged' : 'e.g. Monthly stock count'} />
      {qty !== '' ? <Text style={{ color: after < 0 ? C.bad : C.ink }}>After saving: <Text style={{ fontWeight: '700' }}>{after} {item.unit}</Text></Text> : null}
      <ErrorText>{err}</ErrorText>
      <Btn title="Save stock change" loading={busy} onPress={save} />
      <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
      <H>Settings</H>
      <View style={[s.row, { alignItems: 'flex-end' }]}>
        <View style={{ flex: 1 }}><Field label={`Low-stock alert at (${item.unit})`} value={reorder} onChangeText={t => setReorder(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" /></View>
        <Btn title="Save" kind="soft" disabled={Number(reorder) === item.reorder_level} onPress={() => saveSettings({ reorderLevel: Number(reorder) })} />
      </View>
      <Btn title={item.active ? 'Stop using this item' : 'Use this item again'} kind="ghost" onPress={() => saveSettings({ active: !item.active })} />
    </Sheet>
  );
}

function AddItemSheet({ onClose }) {
  const [f, setF] = useState({ sku: '', name: '', category: 'chemical', unit: 'ml', quantity: '', reorderLevel: '', costPerUnit: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = k => v => setF({ ...f, [k]: v });
  const num = v => v.replace(/[^0-9.]/g, '');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api('/inventory', { method: 'POST', body: { sku: f.sku.trim(), name: f.name.trim(), category: f.category, unit: f.unit,
        quantity: Number(f.quantity || 0), reorderLevel: Number(f.reorderLevel || 0), costPerUnit: Number(f.costPerUnit || 0) } });
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Add inventory item" onClose={onClose}>
      <Field label="Name" value={f.name} onChangeText={set('name')} placeholder="e.g. Imidacloprid 30.5% SC" />
      <Field label="SKU / code" value={f.sku} onChangeText={set('sku')} autoCapitalize="characters" placeholder="e.g. CHM-IMI" />
      <Text style={s.label}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{Object.entries(CATS).map(([k, l]) => <Chip key={k} label={l} active={f.category === k} onPress={() => set('category')(k)} />)}</View>
      <Text style={s.label}>Unit</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{['ml', 'L', 'g', 'kg', 'pcs', 'blocks', 'packs'].map(u => <Chip key={u} label={u} active={f.unit === u} onPress={() => set('unit')(u)} />)}</View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Opening stock" value={f.quantity} onChangeText={v => set('quantity')(num(v))} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Alert at" value={f.reorderLevel} onChangeText={v => set('reorderLevel')(num(v))} keyboardType="decimal-pad" /></View>
      </View>
      <Field label="Cost per unit (₹)" value={f.costPerUnit} onChangeText={v => set('costPerUnit')(num(v))} keyboardType="decimal-pad" />
      <ErrorText>{err}</ErrorText>
      <Btn title="Add item" loading={busy} onPress={save} />
    </Sheet>
  );
}
