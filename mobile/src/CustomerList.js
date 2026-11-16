import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from './api';
import { Badge, Chip, Empty, ErrorText, Field, Muted } from './ui';
import { C, fmt } from './theme';

// Server-side search and paging. The server never sends phone numbers to this app.
export function CustomerList({ inStack = false }) {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(params.q || '');
  const [amc, setAmc] = useState('');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async (p = 1) => {
    setLoading(true); setErr('');
    try {
      const r = await api(`/customers?page=${p}&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}${amc ? `&amc=${amc}` : ''}`);
      setItems(prev => p === 1 ? r.items : [...prev, ...r.items]); setTotal(r.total); setPage(p);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, [q, amc]);
  useEffect(() => { const t = setTimeout(() => load(1), 300); return () => clearTimeout(t); }, [load]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: inStack ? 12 : insets.top + 12 }}>
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
        {!inStack && <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Customers</Text>}
        <Field value={q} onChangeText={setQ} placeholder="Search name, reference or address" />
        <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>{[['', 'All'], ['active', 'AMC active'], ['renewal', 'Renewal due'], ['none', 'No AMC']].map(([k, l]) => <Chip key={k} label={l} active={amc === k} onPress={() => setAmc(k)} />)}</View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Ionicons name="lock-closed-outline" size={13} color={C.muted} /><Muted>{inStack ? 'Tap a customer to see their number and history.' : 'Phone numbers are hidden. Tap the phone icon to call through the company line.'}</Muted></View>
        <ErrorText>{err}</ErrorText>
      </View>
      <FlatList data={items} keyExtractor={c => String(c.id)} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
        onEndReached={() => { if (!loading && items.length < total) load(page + 1); }} onEndReachedThreshold={0.4}
        ListEmptyComponent={!loading ? <Empty title="No customers found" text="Try another name or filter." icon="search-outline" /> : null}
        ListFooterComponent={loading ? <ActivityIndicator color={C.forest} style={{ padding: 16 }} /> : null}
        renderItem={({ item: c }) => {
          const ren = c.amc && new Date(c.amc.endDate) < new Date(Date.now() + 30 * 864e5);
          return <Pressable onPress={() => router.push(`/customer/${c.id}`)} style={{ backgroundColor: C.white, borderRadius: 16, padding: 13, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '700', color: C.forest }}>{c.name.split(' ').map(p => p[0]).slice(0, 2).join('')}</Text></View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{c.name}</Text><Muted>{c.ref} · {c.area || '-'} · {c.propertyType}{c.mobile ? ` · ${c.mobile}` : ''}</Muted>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {c.amc ? <Badge label={ren ? (new Date(c.amc.endDate) < new Date() ? 'AMC expired' : 'Renewal due') : 'AMC active'} color={ren ? C.warn : C.good} /> : null}
                {c.lastService ? <Muted>Last: {fmt.date(c.lastService.date)} · {fmt.money(c.lastService.price)}</Muted> : null}
              </View>
            </View>
            <Pressable accessibilityLabel={`Call ${c.name}`} onPress={() => router.push(`/call/${c.id}`)} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="call-outline" size={20} color={C.forest} /></Pressable>
          </Pressable>;
        }} />
    </View>
  );
}
