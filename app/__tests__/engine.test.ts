/* eslint-disable import/first -- jest.mock() calls must precede the imports they mock */
const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (k in mockStore ? mockStore[k] : null),
    setItem: async (k: string, v: string) => { mockStore[k] = v; },
    removeItem: async (k: string) => { delete mockStore[k]; }
  }
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-speech', () => ({
  speak: jest.fn((_t: string, o: any) => { setTimeout(() => o?.onDone?.(), 0); }),
  stop: jest.fn(async () => {})
}));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationHandler: jest.fn()
}));
const mockStartUpdates = jest.fn(async () => {});
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  startLocationUpdatesAsync: (...a: any[]) => (mockStartUpdates as any)(...a),
  stopLocationUpdatesAsync: jest.fn(async () => {}),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() }))
}));
let mockTaskFn: any;
jest.mock('expo-task-manager', () => ({ defineTask: (_n: string, fn: any) => { mockTaskFn = fn; } }));

import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import { engine } from '../src/engine';
import '../src/background';

const M = { lat: 38.8893, lon: -77.0502 };
const north = (m: number) => M.lat + m / 111195;
const OVERPASS = { elements: [
  { type: 'node', id: 1, lat: M.lat, lon: M.lon, tags: { historic: 'memorial', name: 'Lincoln Memorial', wikipedia: 'en:Lincoln Memorial', 'ref:nrhp': '66000031' } },
  { type: 'node', id: 9, lat: M.lat + 0.003, lon: M.lon, tags: { historic: 'boundary_stone', name: 'Junk' } }
] };
const NEARBY = { query: { pages: [
  { pageid: 10, title: 'Lincoln Memorial', description: 'Presidential memorial in Washington, D.C.', coordinates: [{ lat: M.lat, lon: M.lon }], fullurl: 'https://en.wikipedia.org/wiki/Lincoln_Memorial' },
  { pageid: 11, title: 'Burger Shack', description: 'Restaurant', coordinates: [{ lat: M.lat, lon: M.lon }] }
] } };
const FILL = Array.from({ length: 30 }, (_, i) => `Sentence ${i} is an ordinary detail about the grounds.`).join(' ');
const FULL = { query: { pages: [{ title: 'Lincoln Memorial', description: 'Presidential memorial', fullurl: 'https://en.wikipedia.org/wiki/Lincoln_Memorial',
  extract: 'The Lincoln Memorial is a national memorial in Washington, D.C., dedicated to Abraham Lincoln. Henry Bacon designed it and it was dedicated in 1922. ' + FILL + '\n\n== References ==\nSmith 2001.' }] } };

const fetchMock = jest.fn(async (url: string) => {
  const body = /overpass/.test(url) ? OVERPASS : /generator=geosearch/.test(url) ? NEARBY : /titles=/.test(url) ? FULL : { query: { pages: [] } };
  return { ok: true, status: 200, json: async () => body } as any;
});
(global as any).fetch = fetchMock;

async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition'); await new Promise(r => setTimeout(r, 10)); }
}
const spoken = () => (Speech.speak as jest.Mock).mock.calls.map(c => c[0] as string);

test('walking up to a marker: lookup, 100 m trigger, notification, speech, no repeat', async () => {
  await engine.ready;
  await engine.setSim(north(300), M.lon);
  await until(() => engine.S.markers.length > 0);
  expect(engine.S.markers.map(m => m.name)).toEqual(['Lincoln Memorial']); // junk stone + burger shack filtered, wiki merged
  expect(engine.S.running).toBe(true);
  expect(engine.S.mode).toBe('test');
  expect(mockStartUpdates).not.toHaveBeenCalled(); // test mode doesn't need GPS
  expect(spoken()).toHaveLength(0);

  engine.onFix({ lat: north(120), lon: M.lon, acc: 8, t: Date.now() });
  expect(engine.S.current).toBeNull();

  engine.onFix({ lat: north(95), lon: M.lon, acc: 8, t: Date.now() });
  await until(() => spoken().length > 1);
  expect(engine.S.current?.name).toBe('Lincoln Memorial');
  const text = spoken().join(' ');
  expect(text.startsWith('Lincoln Memorial.')).toBe(true);
  expect(text).toContain('dedicated in 1922');
  expect(text).not.toContain('Smith 2001');
  const rec = engine.S.research[engine.S.current!.id];
  expect(RRwords(rec.synopsis)).toBeLessThanOrEqual(165);

  const notes = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map(c => c[0]);
  expect(notes.length).toBeGreaterThanOrEqual(2); // immediate + synopsis update replacing it
  expect(new Set(notes.map(n => n.identifier)).size).toBe(1);
  expect(notes[0].content.title).toContain('Lincoln Memorial');
  expect(notes[0].trigger).toEqual({ channelId: 'markers' });

  await until(() => !engine.S.speaking);
  const n = spoken().length;
  engine.onFix({ lat: north(400), lon: M.lon, acc: 8, t: Date.now() });
  engine.onFix({ lat: north(30), lon: M.lon, acc: 8, t: Date.now() });
  await new Promise(r => setTimeout(r, 100));
  expect(spoken().length).toBe(n);
  expect(engine.S.history[0].name).toBe('Lincoln Memorial');
});

test('poor GPS accuracy never triggers', async () => {
  engine.clearHistory();
  engine.S.holdUntil = 0; engine.S.current = null;
  const n = spoken().length;
  engine.onFix({ lat: north(10), lon: M.lon, acc: 500, t: Date.now() });
  await new Promise(r => setTimeout(r, 100));
  expect(spoken().length).toBe(n);
});

test('background task feeds real locations into the engine', async () => {
  await engine.clearSim();
  engine.S.running = true; // as if the foreground service is active
  engine.S.tile = { lat: north(20), lon: M.lon, t: Date.now() };
  await mockTaskFn({ data: { locations: [{ coords: { latitude: north(20), longitude: M.lon, accuracy: 6, speed: 20 }, timestamp: 1 }] }, error: null });
  expect(engine.S.pos?.lat).toBeCloseTo(north(20), 6);
  await mockTaskFn({ data: {}, error: new Error('x') }); // errors are swallowed
});

test('start() uses the background foreground-service when permitted', async () => {
  await engine.stop();
  await engine.start();
  expect(mockStartUpdates).toHaveBeenCalledTimes(1);
  const [, opts] = mockStartUpdates.mock.calls[0] as any[];
  expect(opts.foregroundService.notificationTitle).toMatch(/Rubbernecker/);
  expect(engine.S.mode).toBe('background');
  await engine.stop();
  expect(engine.S.running).toBe(false);
});

function RRwords(s: string) { return s.trim().split(/\s+/).length; }
