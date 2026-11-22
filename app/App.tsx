import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { engine } from './src/engine';
import RR from './src/rr';
import type { Marker } from './src/types';

const C = { bg: '#16120e', panel: '#221c16', panel2: '#2c241b', ink: '#f4ead8', dim: '#b3a58d', accent: '#e8a33d', accentInk: '#1a1206', line: '#3a3025', ok: '#7bc47f', bad: '#e5705c' };
const PRESETS: [string, number, number][] = [
  ['Lincoln Memorial', 38.8893, -77.0502], ['Independence Hall', 39.9489, -75.15],
  ['The Alamo', 29.426, -98.4861], ['Fort McHenry', 39.2634, -76.5804]
];

function useEngine() {
  useSyncExternalStore(engine.subscribe, engine.getRev);
  return engine.S;
}

function Btn({ label, onPress, primary, danger, small }: { label: string; onPress: () => void; primary?: boolean; danger?: boolean; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [s.btn, primary && s.btnPrimary, danger && s.btnDanger, small && s.btnSmall, pressed && { opacity: 0.7 }]}>
      <Text style={[s.btnText, primary && { color: C.accentInk, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={s.chips}>
      {options.map(([v, label]) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} style={[s.chip, v === value && s.chipOn]}>
          <Text style={[s.chipText, v === value && { color: C.accentInk, fontWeight: '700' }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={s.row}><Text style={s.rowLabel}>{label}</Text>{children}</View>;
}

function Screen() {
  const S = useEngine();
  const insets = useSafeAreaInsets();
  const [showSettings, setShowSettings] = useState(false);
  const [sim, setSim] = useState('');
  const [key, setKey] = useState('');
  const [simErr, setSimErr] = useState('');
  const set = S.settings;
  const cur = S.current;
  const rec = cur ? S.research[cur.id] : undefined;

  useEffect(() => {
    if (S.running && set.wake) void activateKeepAwakeAsync('rr');
    return () => { void deactivateKeepAwake('rr'); };
  }, [S.running, set.wake]);

  const near = S.pos
    ? S.markers.map(m => ({ m, d: RR.distanceM(S.pos!.lat, S.pos!.lon, m.lat, m.lon) })).filter(x => x.d <= 805).sort((a, b) => a.d - b.d).slice(0, 12)
    : [];
  const closest = S.pos && S.markers.length
    ? S.markers.map(m => ({ m, d: RR.distanceM(S.pos!.lat, S.pos!.lon, m.lat, m.lon) })).sort((a, b) => a.d - b.d)[0]
    : null;

  let status = 'Tap Start. It keeps watching with the screen off.';
  if (S.running) {
    if (!S.pos) status = 'Waiting for a GPS fix…';
    else if (S.tileLoading && !S.tile) status = 'Looking up markers around you…';
    else if (!S.markers.length) status = 'Watching · no known historical sites nearby right now.';
    else status = `Watching · ${S.markers.length} site${S.markers.length === 1 ? '' : 's'} nearby · closest: ${closest!.m.name} (${RR.formatDistance(closest!.d, set.units)})`;
  }
  const gps = !S.running ? 'GPS off' : !S.pos ? 'Locating…' : `${S.mode === 'test' ? 'Test' : S.mode === 'background' ? 'BG' : 'GPS'} ±${Math.round(S.pos.acc || 0)} m`;

  const goSim = () => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(sim);
    if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) { setSimErr('Enter coordinates like 38.8893, -77.0502'); return; }
    setSimErr(''); void engine.setSim(+m[1], +m[2]);
  };
  const open = (url?: string | null) => { if (url && /^https:\/\//.test(url)) void Linking.openURL(url); };

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}>
      <View style={s.header}>
        <View>
          <Text style={s.h1}>Road Trip Rubbernecker</Text>
          <Text style={s.sub}>HISTORICAL MARKERS, READ TO YOU</Text>
        </View>
        <Text style={[s.pill, S.running && S.pos && S.pos.acc <= 200 && { color: C.ok }]}>{gps}</Text>
      </View>

      <Pressable accessibilityRole="button" onPress={() => (S.running ? void engine.stop() : void engine.start())}
        style={[s.big, S.running ? s.bigStop : s.bigGo]}>
        <Text style={[s.bigText, !S.running && { color: C.accentInk }]}>{S.running ? 'Stop exploring' : 'Start exploring'}</Text>
      </Pressable>
      <Text style={s.status}>{status}</Text>
      {!!S.error && <Text style={s.warn}>{S.error}</Text>}
      {!!S.notice && (
        <View style={s.warnBox}>
          <Text style={s.warnText}>{S.notice}</Text>
          <Btn small label="Open app settings" onPress={() => void Linking.openSettings()} />
        </View>
      )}

      {cur && (
        <View style={s.card}>
          <Text style={s.kicker}>
            {'HISTORICAL MARKER NEARBY' + (rec ? ` · ~${RR.readSeconds(RR.wordCount(rec.synopsis), set.rate)} SEC` : '')}
          </Text>
          <Text style={s.title}>{cur.name}</Text>
          <Text style={s.meta}>{[engine.typeText(cur), engine.where(cur)].filter(Boolean).join(' · ')}</Text>
          {!!rec?.thumb && <Image source={{ uri: rec.thumb }} style={s.thumb} accessibilityIgnoresInvertColors />}
          <Text style={[s.syn, !rec && { color: C.dim, fontStyle: 'italic' }]}>{rec ? rec.synopsis : 'Researching this site…'}</Text>
          {!!rec?.inscription && <Text style={s.ins}>Marker text: {rec.inscription}</Text>}
          <View style={s.btnRow}>
            <Btn primary label={S.speaking ? '■ Stop' : '▶ Read aloud'} onPress={() => engine.toggleSpeak()} />
            {S.queue.length > 0 && <Btn label="Next ▸" onPress={() => engine.skip()} />}
            {!!rec?.wikiUrl && <Btn label="Wikipedia" onPress={() => open(rec.wikiUrl)} />}
            {!!cur.osmType && <Btn label="Map" onPress={() => open(`https://www.openstreetmap.org/${cur.osmType}/${cur.osmId}`)} />}
          </View>
          {S.queue.length > 0 && <Text style={s.meta}>{S.queue.length} more marker{S.queue.length > 1 ? 's' : ''} nearby — tap Next</Text>}
        </View>
      )}

      <Text style={s.h2}>WITHIN HALF A MILE</Text>
      {near.length === 0 && <Text style={s.empty}>{S.pos ? 'No markers within half a mile.' : 'Start exploring to see markers around you.'}</Text>}
      {near.map(({ m, d }: { m: Marker; d: number }) => (
        <Pressable key={m.id} style={s.item} onPress={() => engine.readManually(m)}>
          <View style={{ flex: 1 }}>
            <Text style={s.itemName}>{m.name}</Text>
            <Text style={s.itemSub}>{m.typeLabel || ''}</Text>
          </View>
          <Text style={s.itemDist}>{RR.formatDistance(d, set.units)} {RR.compass(RR.bearingDeg(S.pos!.lat, S.pos!.lon, m.lat, m.lon))}</Text>
        </Pressable>
      ))}

      <Text style={s.h2}>VISITED</Text>
      {S.history.length === 0 && <Text style={s.empty}>Nothing yet.</Text>}
      {S.history.slice(0, 15).map(h => (
        <View key={h.id} style={s.hist}>
          <Text style={s.itemSub}>{new Date(h.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {h.typeLabel || ''}</Text>
          <Text style={s.itemName}>{h.name}</Text>
        </View>
      ))}

      <Pressable onPress={() => setShowSettings(v => !v)} style={s.settingsHead}>
        <Text style={s.itemName}>{showSettings ? '▾' : '▸'} Settings & test mode</Text>
      </Pressable>
      {showSettings && (
        <View style={s.settings}>
          <Row label={`Alert distance: ${set.radius} m`}>
            <View style={s.stepper}>
              <Btn small label="−" onPress={() => engine.updateSettings({ radius: Math.max(50, set.radius - 10) })} />
              <Btn small label="+" onPress={() => engine.updateSettings({ radius: Math.min(300, set.radius + 10) })} />
            </View>
          </Row>
          <Row label="Read aloud automatically"><Switch value={set.autoSpeak} onValueChange={v => engine.updateSettings({ autoSpeak: v })} trackColor={{ true: C.accent, false: C.line }} /></Row>
          <Row label="Phone notifications"><Switch value={set.notify} onValueChange={v => engine.updateSettings({ notify: v })} trackColor={{ true: C.accent, false: C.line }} /></Row>
          <Row label="Keep screen awake (app open)"><Switch value={set.wake} onValueChange={v => engine.updateSettings({ wake: v })} trackColor={{ true: C.accent, false: C.line }} /></Row>
          <Row label={`Speech speed: ${set.rate.toFixed(1)}×`}>
            <View style={s.stepper}>
              <Btn small label="−" onPress={() => engine.updateSettings({ rate: Math.max(0.7, Math.round((set.rate - 0.1) * 10) / 10) })} />
              <Btn small label="+" onPress={() => engine.updateSettings({ rate: Math.min(1.4, Math.round((set.rate + 0.1) * 10) / 10) })} />
            </View>
          </Row>
          <Text style={s.rowLabel}>Synopsis length</Text>
          <Chips value={set.maxWords} options={[[100, 'Short'], [150, 'One minute'], [200, 'Long']]} onChange={v => engine.updateSettings({ maxWords: v })} />
          <Text style={s.rowLabel}>Units</Text>
          <Chips value={set.units} options={[['imperial', 'Feet / miles'], ['metric', 'Meters / km']]} onChange={v => engine.updateSettings({ units: v })} />
          <Text style={s.rowLabel}>Don’t repeat a marker for</Text>
          <Chips value={set.repeatHours} options={[[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [168, '1 week']]} onChange={v => engine.updateSettings({ repeatHours: v })} />
          <Row label="Include every Wikipedia place"><Switch value={set.includeAllWiki} onValueChange={v => engine.updateSettings({ includeAllWiki: v })} trackColor={{ true: C.accent, false: C.line }} /></Row>
          <Text style={s.rowLabel}>Claude API key (optional)</Text>
          <Text style={s.itemSub}>Rewrites the synopsis more smoothly. Stored in Android’s secure storage and sent only to api.anthropic.com.</Text>
          <View style={s.inline}>
            <TextInput style={s.input} value={key} onChangeText={setKey} placeholder={S.apiKey ? '•••••• saved' : 'sk-ant-…'} placeholderTextColor={C.dim} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Btn small label="Save" onPress={() => { void engine.setApiKey(key); setKey(''); }} />
          </View>
          <Text style={s.rowLabel}>Test location (lat, lon)</Text>
          <View style={s.inline}>
            <TextInput style={s.input} value={sim} onChangeText={setSim} placeholder="38.8893, -77.0502" placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false} />
            <Btn small label="Go" onPress={goSim} />
          </View>
          {!!simErr && <Text style={s.warn}>{simErr}</Text>}
          <View style={s.chips}>
            {PRESETS.map(([n, la, lo]) => <Btn key={n} small label={n} onPress={() => { setSim(`${la}, ${lo}`); setSimErr(''); void engine.setSim(la, lo); }} />)}
          </View>
          {!!S.sim && <Btn label="Stop test mode" onPress={() => void engine.clearSim()} />}
          <View style={{ height: 10 }} />
          <Btn label="Clear visited list" onPress={() => engine.clearHistory()} />
        </View>
      )}

      <Text style={s.foot}>
        Marker data © OpenStreetMap contributors (ODbL). Summaries adapted from Wikipedia (CC BY-SA 4.0). Not every marker is in these sources; HMdb.org has the most complete U.S. listing. Passengers read; drivers drive.
      </Text>
    </ScrollView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Screen />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  h1: { color: C.ink, fontSize: 19, fontWeight: '700', fontFamily: 'serif' },
  sub: { color: C.dim, fontSize: 10.5, letterSpacing: 0.8 },
  pill: { color: C.dim, backgroundColor: C.panel2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, overflow: 'hidden' },
  big: { borderRadius: 14, paddingVertical: 17, alignItems: 'center' },
  bigGo: { backgroundColor: C.accent }, bigStop: { backgroundColor: '#5a2a22', borderWidth: 1, borderColor: '#7a382d' },
  bigText: { color: C.ink, fontSize: 18, fontWeight: '700' },
  status: { color: C.dim, fontSize: 14, marginTop: 10, minHeight: 20 },
  warn: { color: '#f3d49a', backgroundColor: '#3b2a12', borderRadius: 10, padding: 10, marginTop: 10, fontSize: 14, overflow: 'hidden' },
  warnBox: { backgroundColor: '#3b2a12', borderRadius: 10, padding: 10, marginTop: 10, gap: 8 },
  warnText: { color: '#f3d49a', fontSize: 14 },
  card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 16 },
  kicker: { color: C.accent, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.9 },
  thumb: { width: 96, height: 96, borderRadius: 10, marginTop: 10 },
  title: { color: C.ink, fontSize: 23, fontWeight: '700', fontFamily: 'serif', marginTop: 4 },
  meta: { color: C.dim, fontSize: 14, marginTop: 4 },
  syn: { color: C.ink, fontSize: 17, lineHeight: 26, marginTop: 10 },
  ins: { color: C.dim, fontSize: 14, marginTop: 10 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  btn: { backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  btnSmall: { minHeight: 36, paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: C.accent, borderColor: C.accent }, btnDanger: { backgroundColor: '#5a2a22' },
  btnText: { color: C.ink, fontSize: 15 },
  h2: { color: C.dim, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, marginTop: 24, marginBottom: 8 },
  empty: { color: C.dim, fontSize: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  itemName: { color: C.ink, fontSize: 16, fontWeight: '600' }, itemSub: { color: C.dim, fontSize: 13 }, itemDist: { color: C.accent, fontSize: 14 },
  hist: { backgroundColor: C.panel2, borderRadius: 10, padding: 10, marginBottom: 8 },
  settingsHead: { backgroundColor: C.panel, borderRadius: 14, borderColor: C.line, borderWidth: 1, padding: 14, marginTop: 24 },
  settings: { backgroundColor: C.panel, borderRadius: 14, borderColor: C.line, borderWidth: 1, padding: 14, marginTop: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowLabel: { color: C.ink, fontSize: 15, flexShrink: 1, marginTop: 4 },
  stepper: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderColor: C.line, borderWidth: 1, backgroundColor: C.panel2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent }, chipText: { color: C.ink, fontSize: 14 },
  inline: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, color: C.ink, backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, minHeight: 40 },
  foot: { color: C.dim, fontSize: 12, marginTop: 28 }
});
