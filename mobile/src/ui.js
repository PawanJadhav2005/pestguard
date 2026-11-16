import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, STATUS_HUE, SVC, fmt } from './theme';

export function Screen({ children, onRefresh, refreshing = false, padTop = true, style }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[{ padding: 16, paddingTop: padTop ? insets.top + 12 : 16, paddingBottom: 32, gap: 12 }, style]}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.forest]} /> : undefined}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Hero({ kicker, title, children, color = C.forest }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.hero, { backgroundColor: color, paddingTop: insets.top + 14 }]}>
      {kicker ? <Text style={s.heroKicker}>{kicker}</Text> : null}
      <Text style={s.heroTitle}>{title}</Text>
      {children}
    </View>
  );
}
export const HeroStat = ({ value, label }) => <View style={s.heroStat}><Text style={s.heroStatV}>{value}</Text><Text style={s.heroStatL}>{label}</Text></View>;

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
export const H = ({ children, style }) => <Text style={[s.h, style]}>{children}</Text>;
export const Muted = ({ children, style }) => <Text style={[s.muted, style]}>{children}</Text>;

export function Btn({ title, onPress, kind = 'primary', icon, disabled, loading, style }) {
  const k = { primary: [C.forest, '#fff'], amber: [C.amber, C.amberInk], soft: [C.mint, C.forest], danger: ['#fbe7e5', C.bad], ghost: ['transparent', C.ink] }[kind];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: k[0], opacity: disabled ? .45 : pressed ? .85 : 1 }, kind === 'ghost' && { borderWidth: 1.5, borderColor: C.line }, style]}>
      {loading ? <ActivityIndicator color={k[1]} /> : <>{icon ? <Ionicons name={icon} size={18} color={k[1]} /> : null}<Text style={[s.btnText, { color: k[1] }]}>{title}</Text></>}
    </Pressable>
  );
}

export const Badge = ({ label, color }) => {
  const c = color || STATUS_HUE[label] || C.grey;
  return <View style={[s.badge, { backgroundColor: c + '22' }]}><Text style={[s.badgeText, { color: c }]}>{label}</Text></View>;
};

export const ServiceIcon = ({ code, size = 44 }) => {
  const sv = SVC[code] || SVC.gpc;
  return <View style={{ width: size, height: size, borderRadius: size * .32, backgroundColor: sv.color + '22', alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={sv.icon} size={size * .52} color={sv.color} /></View>;
};

export function Chip({ label, active, onPress }) {
  return <Pressable onPress={onPress} accessibilityState={{ selected: active }} style={[s.chip, active && { backgroundColor: C.forest, borderColor: C.forest }]}>
    <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text></Pressable>;
}

export function Segments({ value, options, onChange }) {
  return <View style={s.seg}>{options.map(([k, l]) =>
    <Pressable key={k} onPress={() => onChange(k)} style={[s.segBtn, value === k && s.segOn]}><Text style={[s.segText, value === k && { color: C.ink }]}>{l}</Text></Pressable>)}</View>;
}

export const Field = ({ label, style, ...props }) => (
  <View style={{ gap: 5 }}>
    {label ? <Text style={s.label}>{label}</Text> : null}
    <TextInput placeholderTextColor={C.grey} style={[s.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, style]} {...props} />
  </View>
);

export const Empty = ({ title, text, icon = 'checkmark-circle-outline' }) => (
  <View style={{ alignItems: 'center', padding: 28, gap: 6 }}>
    <Ionicons name={icon} size={44} color="#b9cdc4" /><Text style={[s.h, { fontSize: 16 }]}>{title}</Text>{text ? <Muted style={{ textAlign: 'center' }}>{text}</Muted> : null}
  </View>
);
export const Loading = () => <View style={{ padding: 40 }}><ActivityIndicator color={C.forest} /></View>;
export const ErrorText = ({ children }) => children ? <Text style={s.err}>{children}</Text> : null;

export function JobCard({ job, onPress, showDate }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, s.job, pressed && { opacity: .9 }]} accessibilityRole="button">
      <ServiceIcon code={job.serviceCode} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.rowBetween}><Text style={s.jobTitle} numberOfLines={1}>{job.serviceName}</Text>
          <Text style={[s.time, job.overdue && { color: C.bad }]}>{showDate ? `${fmt.day(job.scheduledAt)} · ` : ''}{fmt.time(job.scheduledAt)}</Text></View>
        <Muted numberOfLines={1}>{job.customer.name} · {job.customer.area || ''}</Muted>
        <View style={[s.row, { marginTop: 6, flexWrap: 'wrap' }]}>
          <Badge label={job.status} />{job.overdue ? <Badge label="Overdue" color={C.bad} /> : null}
          <View style={s.tag}><Text style={s.tagText}>{job.propertyType}</Text></View>
          {job.amc ? <View style={s.tag}><Text style={s.tagText}>AMC {job.amc.visitsDone + 1}/{job.amc.visitsTotal}</Text></View> : null}
        </View>
      </View>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  hero: { marginHorizontal: -16, marginTop: -12, paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, gap: 4 },
  heroKicker: { color: '#ffffffcc', fontSize: 13 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 12 },
  heroStat: { flex: 1, backgroundColor: '#ffffff22', borderRadius: 14, padding: 10 },
  heroStatV: { color: '#fff', fontSize: 22, fontWeight: '700' },
  heroStatL: { color: '#ffffffcc', fontSize: 11.5 },
  card: { backgroundColor: C.white, borderRadius: 18, padding: 14, shadowColor: '#0f3228', shadowOpacity: .06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  h: { fontSize: 16, fontWeight: '700', color: C.ink },
  muted: { color: C.muted, fontSize: 13 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14 },
  btnText: { fontWeight: '700', fontSize: 14.5 },
  badge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99 },
  badgeText: { fontSize: 11.5, fontWeight: '700' },
  chip: { borderWidth: 1.5, borderColor: C.line, backgroundColor: C.white, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7 },
  chipText: { fontWeight: '600', fontSize: 12.5, color: C.muted },
  seg: { flexDirection: 'row', backgroundColor: '#e4ece8', borderRadius: 14, padding: 4, gap: 2 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: C.white, elevation: 1 },
  segText: { fontWeight: '600', color: C.muted, fontSize: 13 },
  label: { fontSize: 12, fontWeight: '700', color: C.muted },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.white, fontSize: 15, color: C.ink },
  err: { color: C.bad, fontWeight: '600', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  job: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  jobTitle: { fontWeight: '700', fontSize: 14.5, color: C.ink, flex: 1 },
  time: { fontWeight: '600', fontSize: 13, color: C.ink },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 7, backgroundColor: C.mint2, borderWidth: 1, borderColor: C.line },
  tagText: { fontSize: 11.5, fontWeight: '600', color: C.muted }
});
