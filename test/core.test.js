const test = require('node:test');
const assert = require('node:assert/strict');
const RR = require('../core.js');

const LINCOLN = { lat: 38.8893, lon: -77.0502 };

test('distance & bearing', () => {
  const d = RR.distanceM(0, 0, 1, 0);
  assert.ok(Math.abs(d - 111195) < 200, `1° lat ≈ 111.2 km, got ${d}`);
  assert.ok(RR.distanceM(38.8893, -77.0502, 38.8893, -77.0502) === 0);
  // ~100 m east at DC latitude
  const dLon = 100 / (111320 * Math.cos(38.8893 * Math.PI / 180));
  const d100 = RR.distanceM(LINCOLN.lat, LINCOLN.lon, LINCOLN.lat, LINCOLN.lon + dLon);
  assert.ok(Math.abs(d100 - 100) < 1, `got ${d100}`);
  assert.equal(Math.round(RR.bearingDeg(0, 0, 1, 0)), 0);
  assert.equal(Math.round(RR.bearingDeg(0, 0, 0, 1)), 90);
  assert.equal(RR.compass(0), 'north');
  assert.equal(RR.compass(91), 'east');
  assert.equal(RR.compass(359), 'north');
  assert.equal(RR.compass(225), 'southwest');
});

test('formatDistance', () => {
  assert.equal(RR.formatDistance(100, 'imperial'), '330 ft');
  assert.equal(RR.formatDistance(2000, 'imperial'), '1.2 mi');
  assert.equal(RR.formatDistance(100, 'metric'), '100 m');
  assert.equal(RR.formatDistance(2500, 'metric'), '2.5 km');
});

test('sentence splitting protects abbreviations, initials, acronyms', () => {
  const s = RR.splitSentences('Gen. Robert E. Lee surrendered at Appomattox. The U.S. Army accepted at 3 p.m. on April 9, 1865. It ended the war!');
  assert.equal(s.length, 3, JSON.stringify(s));
  assert.ok(s[0].startsWith('Gen. Robert E. Lee'));
  assert.ok(s[1].includes('U.S. Army') && s[1].includes('p.m.'));
});

test('wiki cleaning removes refs, pronunciations, trailing sections, keeps date ranges', () => {
  const raw = 'Fort Foo (pronounced "foo"; Chinese: 福) was built in 1812[1] (1812–1815) to guard the harbor.[citation needed]\n\n== History ==\nIt saw action.\n\n== References ==\nSmith, J. 2001.';
  const c = RR.cleanWikiText(raw);
  assert.ok(!c.includes('pronounced'));
  assert.ok(!c.includes('[1]') && !c.includes('citation needed'));
  assert.ok(c.includes('(1812–1815)'));
  assert.ok(!c.includes('Smith, J.') && !c.includes('== History'));
  assert.ok(c.includes('It saw action.'));
});

const LONG = (() => {
  const lead = 'The Old Mill is a historic gristmill in Springfield, Ohio. ';
  const filler = [];
  for (let i = 0; i < 30; i++) filler.push(`Sentence number ${i} describes an ordinary detail of the building that is not especially notable at all. `);
  const good = 'It was built in 1823 by Josiah Hart and designated a National Historic Landmark in 1976. ';
  const bad = 'Visitors can find parking and admission hours on the website. ';
  return lead + filler.slice(0, 8).join('') + good + bad + filler.slice(8).join('');
})();

test('summarize: keeps lead, respects budget, prefers historical sentences, drops visitor trivia', () => {
  const s = RR.summarize(LONG, { maxWords: 100 });
  assert.ok(s.startsWith('The Old Mill is a historic gristmill'));
  assert.ok(RR.wordCount(s) <= 115, `words=${RR.wordCount(s)}`);
  assert.ok(s.includes('built in 1823'));
  assert.ok(!s.includes('parking'));
  // original order preserved
  assert.ok(s.indexOf('Old Mill') < s.indexOf('1823'));
});

test('summarize: short text returned whole; empty safe; huge single sentence truncated', () => {
  assert.equal(RR.summarize('A small plaque. It marks a spring.', { maxWords: 150 }), 'A small plaque. It marks a spring.');
  assert.equal(RR.summarize('', {}), '');
  const one = Array(300).fill('word').join(' ') + '.';
  assert.ok(RR.wordCount(RR.summarize(one, { maxWords: 50 })) <= 66);
});

test('default 150-word synopsis fits about a minute of speech', () => {
  const s = RR.summarize(LONG, { maxWords: 150 });
  assert.ok(RR.readSeconds(RR.wordCount(s), 1) <= 70);
});

const OVERPASS = {
  elements: [
    { type: 'node', id: 1, lat: 38.8893, lon: -77.0502, tags: { historic: 'memorial', name: 'Lincoln Memorial', wikipedia: 'en:Lincoln Memorial', wikidata: 'Q217325', 'ref:nrhp': '66000031' } },
    { type: 'way', id: 2, center: { lat: 38.8895, lon: -77.0500 }, tags: { historic: 'building', name: 'Old Stone House', start_date: '1765', description: 'Oldest unchanged building in DC.' } },
    { type: 'node', id: 3, lat: 38.889, lon: -77.05, tags: { historic: 'boundary_stone', name: 'Stone 7' } },
    { type: 'node', id: 4, lat: 38.889, lon: -77.05, tags: { historic: 'memorial', memorial: 'bench', name: 'Bench for Bob' } },
    { type: 'node', id: 5, lat: 38.889, lon: -77.05, tags: { historic: 'yes' } },
    { type: 'node', id: 6, lat: 38.8891, lon: -77.0501, tags: { historic: 'memorial', memorial: 'plaque', inscription: 'On this spot in 1863 the first regiment of volunteers mustered before marching south.' } },
    { type: 'node', id: 7, tags: { historic: 'monument', name: 'No coords' } }
  ]
};

test('parseOverpass keeps real sites, drops junk, builds titles', () => {
  const m = RR.parseOverpass(OVERPASS);
  assert.deepEqual(m.map(x => x.id), ['osm:node/1', 'osm:way/2', 'osm:node/6']);
  assert.equal(m[0].nrhp, true);
  assert.equal(m[0].tags.wikipedia, 'en:Lincoln Memorial');
  assert.equal(m[1].lat, 38.8895); // way centre used
  assert.equal(m[1].typeLabel, 'historic building');
  assert.equal(m[2].typeLabel, 'plaque');
  assert.ok(m[2].name.startsWith('Marker: “On this spot in 1863'));
  assert.equal(m[2].hasName, false);
});

test('overpassQuery is well-formed', () => {
  const q = RR.overpassQuery(38.8893, -77.0502, 1200);
  assert.equal(q, '[out:json][timeout:20];nwr(around:1200,38.889300,-77.050200)[historic];out center tags 250;');
});

const WIKI_NEARBY = {
  query: {
    pages: [
      { pageid: 10, title: 'Lincoln Memorial', description: 'Presidential memorial in Washington, D.C.', coordinates: [{ lat: 38.8893, lon: -77.05, primary: true }], fullurl: 'https://en.wikipedia.org/wiki/Lincoln_Memorial', thumbnail: { source: 'https://x/y.jpg' } },
      { pageid: 11, title: 'Joe’s Burger Shack', description: 'Restaurant in Washington', coordinates: [{ lat: 38.8894, lon: -77.0501 }] },
      { pageid: 12, title: 'Old Brick Church', description: 'Historic church in Virginia, U.S.', coordinates: [{ lat: 38.8896, lon: -77.0503 }] },
      { pageid: 13, title: 'No Coords Place', description: 'Historic site' }
    ]
  }
};
test('parseWikiNearby filters non-historic unless includeAll', () => {
  assert.deepEqual(RR.parseWikiNearby(WIKI_NEARBY).map(x => x.name), ['Lincoln Memorial', 'Old Brick Church']);
  assert.equal(RR.parseWikiNearby(WIKI_NEARBY, { includeAll: true }).length, 3);
});

test('wikiNearbyUrl has geosearch params and clamps radius/limit', () => {
  const u = new URL(RR.wikiNearbyUrl(38.9, -77.0, 99999, 500));
  assert.equal(u.searchParams.get('generator'), 'geosearch');
  assert.equal(u.searchParams.get('ggsradius'), '10000');
  assert.equal(u.searchParams.get('ggslimit'), '50');
  assert.equal(u.searchParams.get('origin'), '*');
});

test('merge: OSM + Wikipedia duplicates collapse, OSM coordinates win, wiki data attached', () => {
  const merged = RR.mergeMarkers([...RR.parseOverpass(OVERPASS), ...RR.parseWikiNearby(WIKI_NEARBY)]);
  const lm = merged.filter(m => /Lincoln Memorial/.test(m.name));
  assert.equal(lm.length, 1);
  assert.equal(lm[0].source, 'osm');
  assert.equal(lm[0].wikiTitle, 'Lincoln Memorial');
  assert.equal(lm[0].lat, 38.8893);
  assert.ok(lm[0].keys.some(k => k.startsWith('wiki:en:lincoln memorial')));
  assert.ok(merged.some(m => m.name === 'Old Brick Church'));
  assert.ok(merged.some(m => m.name === 'Old Stone House'));
});

test('merge does not collapse different things with partially overlapping names', () => {
  const a = { id: 'a', name: 'Lincoln Memorial', lat: 1, lon: 1, hasName: true, tags: {} };
  const b = { id: 'b', name: 'Lincoln Memorial Reflecting Pool', lat: 1.0001, lon: 1, hasName: true, tags: {} };
  assert.equal(RR.mergeMarkers([a, b]).length, 2);
});

test('pickTriggers: radius, ordering, and repeat suppression (incl. alternate keys)', () => {
  const markers = RR.mergeMarkers([...RR.parseOverpass(OVERPASS), ...RR.parseWikiNearby(WIKI_NEARBY)]);
  const pos = { lat: 38.8893, lon: -77.0502 };
  const now = 1_000_000;
  let t = RR.pickTriggers(markers, pos, 100, {}, now, 1e6);
  assert.ok(t.length >= 3);
  assert.ok(t.every((x, i) => i === 0 || t[i - 1].distance <= x.distance));
  assert.equal(t[0].name.startsWith('Lincoln'), true);
  // tighter radius excludes farther ones
  const tight = RR.pickTriggers(markers, pos, 5, {}, now, 1e6);
  assert.deepEqual(tight.map(x => x.name), ['Lincoln Memorial']);
  // seen suppresses, even via the wiki key after the OSM id is gone
  const seen = RR.markSeen({}, t[0], now);
  assert.ok(!RR.pickTriggers(markers, pos, 100, seen, now + 1000, 1e6).some(x => x.id === t[0].id));
  const wikiOnly = { id: 'wp:en:10', keys: ['wp:en:10', 'wiki:en:lincoln memorial'], lat: pos.lat, lon: pos.lon };
  assert.ok(RR.isRecentlySeen(seen, wikiOnly, now + 1000, 1e6));
  // expires after window
  assert.ok(RR.pickTriggers(markers, pos, 100, seen, now + 2e6, 1e6).some(x => x.id === t[0].id));
  // far away: nothing
  assert.equal(RR.pickTriggers(markers, { lat: 40, lon: -75 }, 100, {}, now, 1e6).length, 0);
});

test('needsRefresh: moved, partial retry, stale, no tile', () => {
  const tile = { lat: 38.8893, lon: -77.0502, t: 1000 };
  const here = { lat: 38.8893, lon: -77.0502 };
  assert.equal(RR.needsRefresh(null, here), true);
  assert.equal(RR.needsRefresh(tile, here, { now: 2000 }), false);
  assert.equal(RR.needsRefresh(tile, { lat: 38.8960, lon: -77.0502 }, { now: 2000 }), true); // ~745 m
  assert.equal(RR.needsRefresh({ ...tile, partial: true }, here, { now: 2000 }), false);
  assert.equal(RR.needsRefresh({ ...tile, partial: true }, here, { now: 40000 }), true);
  assert.equal(RR.needsRefresh(tile, here, { now: 1000 + 31 * 60 * 1000 }), true);
});

test('wikiRefs parses tags and wikidata ids', () => {
  const r = RR.wikiRefs({ wikiTitle: 'Foo', tags: { wikipedia: 'de:Bar', subjectWikipedia: 'en:Baz', wikidata: 'Q42', subjectWikidata: 'garbage' } });
  assert.deepEqual(r.titles.map(x => x.lang + ':' + x.title), ['en:Foo', 'de:Bar', 'en:Baz']);
  assert.deepEqual(r.qids, ['Q42']);
});

test('parseWikiFull / disambiguation / missing / wikidata', () => {
  const ok = RR.parseWikiFull({ query: { pages: [{ title: 'Fort X', extract: 'Fort X is a fort.', description: 'Fort', fullurl: 'u' }] } }, 'en');
  assert.equal(ok.title, 'Fort X');
  assert.equal(RR.parseWikiFull({ query: { pages: [{ title: 'X', missing: true }] } }, 'en'), null);
  assert.equal(RR.parseWikiFull({ query: { pages: [{ title: 'X', extract: 'X may refer to:\n- a\n- b' }] } }, 'en'), null);
  assert.equal(RR.parseWikiFull({ query: { pages: [{ title: 'X', extract: 'e', description: 'Topics referred to by the same term (disambiguation)' }] } }, 'en'), null);
  assert.equal(RR.parseWikidataTitle({ entities: { Q1: { sitelinks: { enwiki: { title: 'Earth' } } } } }, 'Q1'), 'Earth');
  assert.equal(RR.parseWikidataTitle({ entities: { Q1: {} } }, 'Q1'), null);
});

test('pickSearchMatch requires nearby + similar title', () => {
  const m = { name: 'Old Stone House', lat: 38.9, lon: -77.06 };
  const json = { query: { pages: [
    { title: 'Old Stone House (Washington, D.C.)', coordinates: [{ lat: 38.9, lon: -77.0601 }], description: 'Historic house' },
    { title: 'Old Stone House', coordinates: [{ lat: 45, lon: -100 }] },
    { title: 'Stone', coordinates: [{ lat: 38.9, lon: -77.06 }] }
  ] } };
  assert.equal(RR.pickSearchMatch(json, m).title, 'Old Stone House (Washington, D.C.)');
  assert.equal(RR.pickSearchMatch({ query: { pages: [{ title: 'Old Stone House', coordinates: [{ lat: 45, lon: -100 }] }] } }, m), null);
});

test('fallback synopsis from tags only', () => {
  const m = RR.parseOverpass(OVERPASS);
  const s1 = RR.fallbackSynopsis(m[1], 150);
  assert.match(s1, /^Old Stone House is a historic building dating to 1765\./);
  assert.match(s1, /Oldest unchanged building in DC\./);
  const s2 = RR.fallbackSynopsis(m[2], 150);
  assert.match(s2, /The marker’s text reads, in part: On this spot in 1863/);
  const thin = RR.fallbackSynopsis({ name: 'Mystery Ruins', typeLabel: 'ruins', tags: {} }, 150);
  assert.match(thin, /No further details/);
  assert.match(RR.fallbackSynopsis(m[0], 150), /National Register of Historic Places/);
});

test('makeSynopsis prefers the Wikipedia extract, falls back otherwise', () => {
  const m = RR.parseOverpass(OVERPASS)[1];
  assert.ok(RR.makeSynopsis(m, { extract: LONG }, { maxWords: 100 }).startsWith('The Old Mill'));
  assert.match(RR.makeSynopsis(m, null, {}), /Old Stone House is a historic building/);
});
