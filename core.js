/* Road Trip Rubbernecker – pure logic (no DOM, no network). Used by app.js and by the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TILE_RADIUS = 1200; // metres of surroundings fetched per lookup

  /* ---------- geometry ---------- */
  const EARTH_R = 6371008.8;
  const rad = d => (d * Math.PI) / 180;
  const deg = r => (r * 180) / Math.PI;

  function distanceM(lat1, lon1, lat2, lon2) {
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function bearingDeg(lat1, lon1, lat2, lon2) {
    const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
    const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const compass = b => DIRS[Math.round(((b % 360) + 360) % 360 / 45) % 8];

  function formatDistance(m, units) {
    if (units === 'metric') return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
    const ft = m * 3.28084;
    return ft < 1000 ? `${Math.max(10, Math.round(ft / 10) * 10)} ft` : `${(m / 1609.344).toFixed(1)} mi`;
  }

  /* ---------- text cleaning & summarising ---------- */
  const ABBREV = ['Mr', 'Mrs', 'Ms', 'Dr', 'St', 'Ste', 'Mt', 'Ft', 'Jr', 'Sr', 'Gen', 'Col', 'Capt', 'Lt', 'Sgt', 'Maj',
    'Adm', 'Gov', 'Sen', 'Rep', 'Rev', 'Hon', 'Pres', 'Prof', 'No', 'Nos', 'vs', 'Inc', 'Co', 'Corp', 'Ltd', 'Bros',
    'Ave', 'Blvd', 'Rd', 'Hwy', 'approx', 'ca', 'Jan', 'Feb', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const ABBREV_RE = new RegExp('\\b(' + ABBREV.join('|') + ')\\.', 'g');
  const P = '\u0001'; // placeholder for a protected period

  function protect(t) {
    return t
      .replace(/(\b(?:[A-Za-z]\.){2,})/g, m => m.replace(/\./g, P)) // U.S.  D.C.  p.m.
      .replace(ABBREV_RE, '$1' + P)
      .replace(/\b([A-Z])\.(?=\s?[A-Z])/g, '$1' + P); // initials: John F. Kennedy
  }

  const DROP_SECTIONS = /\n=+\s*(?:References|External links|See also|Further reading|Notes|Bibliography|Sources|Footnotes|Citations|Gallery|Notable people|Notes and references)\s*=+\s*(?:\n|$)/i;

  function cleanWikiText(raw) {
    if (!raw) return '';
    let t = '\n' + String(raw).replace(/\r/g, '');
    t = t.split(DROP_SECTIONS)[0];
    t = t.replace(/\n=+\s*[^=\n]+?\s*=+\s*(?=\n|$)/g, '\n');
    t = t.replace(/\[(?:\d+|[a-z]|citation needed|note \d+)\]/gi, '');
    // drop parentheticals that are pronunciations / alternate-script names, keep date ranges
    t = t.replace(/\s*\(([^()]*)\)/g, (m, inner) =>
      /[ɐ-˿Ͱ-῿　-鿿]|;|pronounced|listen|\bIPA\b/i.test(inner) ? '' : m);
    return t.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  }

  function splitSentences(text) {
    const flat = protect(String(text || '').replace(/\s*\n\s*/g, ' ').trim());
    const out = [];
    const re = /[.!?]["”'’)\]]*\s+(?=["“‘(]?[A-Z0-9])/g;
    let start = 0, m;
    while ((m = re.exec(flat))) {
      const end = m.index + m[0].length;
      out.push(flat.slice(start, end).trim());
      start = end;
    }
    if (start < flat.length) out.push(flat.slice(start).trim());
    return out.map(s => s.split(P).join('.')).filter(Boolean);
  }

  const wordCount = s => (String(s).trim().match(/\S+/g) || []).length;

  function truncateWords(s, max) {
    const w = String(s).trim().split(/\s+/);
    if (w.length <= max) return s.trim();
    return w.slice(0, max).join(' ').replace(/[,;:\s]+$/, '') + '…';
  }

  const GOOD = /\b(built|constructed|founded|established|erected|dedicated|designated|battle|signed|fought|opened|completed|named|listed|commemorat\w*|site of|marks|killed|born|died|treaty|war|settled|incorporated|designed|architect\w*|National Register|Landmark|historic\w*)\b/i;
  const YEAR = /\b(1[4-9]\d\d|20[0-2]\d)\b/;
  const MEH = /\b(visitors?|admission|parking|hours|open (?:daily|to the public)|gift shop|wheelchair|tickets?|restrooms?|phone|currently|as of \d{4}|population|census)\b/i;

  /** Extractive summary: always keeps the lead sentence, fills the word budget with the most "historical" sentences, in original order. */
  function summarize(text, opts) {
    const maxWords = (opts && opts.maxWords) || 150;
    const sents = splitSentences(cleanWikiText(text)).slice(0, 30);
    if (!sents.length) return '';
    if (wordCount(sents.join(' ')) <= maxWords) return sents.join(' ');
    const scored = sents.map((s, i) => {
      const w = wordCount(s);
      let score = (i === 0 ? 100 : 1 / (1 + i * 0.25)) + (YEAR.test(s) ? 0.5 : 0) + (GOOD.test(s) ? 0.5 : 0) - (MEH.test(s) ? 1 : 0);
      if (w > 55) score -= 0.4;
      return { s, i, w, score };
    });
    const picked = new Set();
    let used = 0;
    for (const x of [...scored].sort((a, b) => b.score - a.score)) {
      if (used + x.w > maxWords) { if (!picked.size) { picked.add(x.i); used += x.w; } continue; }
      picked.add(x.i); used += x.w;
    }
    return truncateWords(scored.filter(x => picked.has(x.i)).map(x => x.s).join(' '), maxWords + 15);
  }

  function readSeconds(words, rate, wpm) { return Math.round((words / ((wpm || 150) * (rate || 1))) * 60); }

  /* ---------- names / types ---------- */
  const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'historic', 'historical', 'national', 'site', 'marker', 'memorial', 'monument', 'plaque', 'state']);
  function nameTokens(name) {
    return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w));
  }
  function nameSimilarity(a, b) {
    const A = new Set(nameTokens(a)), B = new Set(nameTokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  const HISTORIC_LABELS = {
    memorial: 'memorial', monument: 'monument', building: 'historic building', castle: 'castle', fort: 'fort',
    battlefield: 'battlefield', ruins: 'ruins', archaeological_site: 'archaeological site', cemetery: 'historic cemetery',
    church: 'historic church', mine: 'historic mine', ship: 'historic ship', locomotive: 'historic locomotive',
    aircraft: 'historic aircraft', railway_station: 'historic railway station', wreck: 'shipwreck', farm: 'historic farm',
    manor: 'manor', house: 'historic house', tomb: 'tomb', city_gate: 'city gate', bridge: 'historic bridge',
    lighthouse: 'lighthouse', mission: 'mission', wayside_shrine: 'shrine', tree: 'historic tree', yes: 'historic site',
    plaque: 'plaque', marker: 'historical marker', heritage: 'heritage site', district: 'historic district'
  };
  const SKIP_HISTORIC = new Set(['boundary_stone', 'milestone', 'stolperstein', 'survey_point', 'charcoal_pile', 'wayside_cross', 'cannon', 'rune_stone', 'highwater_mark', 'pillory']);
  const SKIP_MEMORIAL = new Set(['bench', 'stolperstein', 'ghost_bike', 'plant', 'tree', 'bust_not', 'cairn_not']);

  function typeLabel(t) {
    if (t.memorial === 'plaque' || t.memorial === 'blue_plaque' || t.historic === 'plaque') return 'plaque';
    if (t.historic === 'memorial' && t.memorial && t.memorial !== 'yes') return t.memorial.replace(/_/g, ' ');
    return HISTORIC_LABELS[t.historic] || String(t.historic || 'historic site').replace(/_/g, ' ');
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- OpenStreetMap / Overpass ---------- */
  function overpassQuery(lat, lon, radius, limit) {
    return `[out:json][timeout:20];nwr(around:${Math.round(radius)},${(+lat).toFixed(6)},${(+lon).toFixed(6)})[historic];out center tags ${limit || 250};`;
  }

  function parseOverpass(json) {
    const out = [];
    for (const e of (json && json.elements) || []) {
      const t = e.tags || {};
      const lat = e.lat != null ? e.lat : e.center && e.center.lat;
      const lon = e.lon != null ? e.lon : e.center && e.center.lon;
      if (lat == null || lon == null || !t.historic) continue;
      if (SKIP_HISTORIC.has(t.historic) || SKIP_MEMORIAL.has(t.memorial)) continue;
      const name = t.name || t['name:en'] || '';
      const inscription = (t.inscription || '').trim();
      const description = (t.description || t['description:en'] || '').trim();
      const wp = t.wikipedia || '', swp = t['subject:wikipedia'] || '';
      const wd = t.wikidata || '', swd = t['subject:wikidata'] || '';
      if (!(name || inscription || description || wp || swp || wd || swd)) continue;
      const label = typeLabel(t);
      let title = name;
      if (!title && inscription) title = 'Marker: “' + truncateWords(inscription.replace(/\s+/g, ' '), 8) + '”';
      if (!title) title = cap(label);
      out.push({
        id: `osm:${e.type}/${e.id}`, source: 'osm', osmType: e.type, osmId: e.id,
        name: title, hasName: !!name, lat, lon, typeLabel: label,
        description, inscription, startDate: t.start_date || '',
        nrhp: !!(t['ref:nrhp'] || /nrhp/i.test(t['heritage:operator'] || '')),
        tags: { wikipedia: wp, subjectWikipedia: swp, wikidata: wd, subjectWikidata: swd }
      });
    }
    return out;
  }

  /* ---------- Wikipedia ---------- */
  const wikiApi = lang => `https://${lang || 'en'}.wikipedia.org/w/api.php`;

  function wikiNearbyUrl(lat, lon, radius, limit, lang) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*',
      generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: String(Math.min(10000, Math.round(radius))),
      ggslimit: String(Math.min(50, limit || 50)),
      prop: 'coordinates|description|pageimages|info', colimit: 'max', coprimary: 'primary',
      piprop: 'thumbnail', pithumbsize: '400', inprop: 'url'
    });
    return `${wikiApi(lang)}?${p}`;
  }

  const HIST_RE = /\b(historic(?:al)?|national register|landmark|battle(?:field)?|monument|memorial|fort|fortification|plantation|cemetery|mission|lighthouse|courthouse|bridge|canal|ruins|birthplace|homestead|museum|capitol|armory|archaeological|heritage|district)\b/i;
  function looksHistoric(desc, extract) {
    const d = (desc || '') + ' ' + String(extract || '').slice(0, 400);
    if (HIST_RE.test(d)) return true;
    const y = /\b(1[5-9]\d\d)\b/.exec(d);
    return !!(y && +y[1] <= 1950);
  }

  function parseWikiNearby(json, opts) {
    const includeAll = !!(opts && opts.includeAll);
    const lang = (opts && opts.lang) || 'en';
    const out = [];
    const pages = (json && json.query && json.query.pages) || [];
    for (const p of Array.isArray(pages) ? pages : Object.values(pages)) {
      const c = p.coordinates && p.coordinates[0];
      if (!c) continue;
      if (!includeAll && !looksHistoric(p.description || '', '') && !looksHistoric(p.title, '')) continue;
      out.push({
        id: `wp:${lang}:${p.pageid}`, source: 'wikipedia', lang, wikiTitle: p.title, pageid: p.pageid,
        name: p.title, hasName: true, lat: c.lat, lon: c.lon, typeLabel: (p.description || 'notable place').toLowerCase(),
        description: p.description || '', inscription: '', startDate: '', nrhp: /national register/i.test(p.description || ''),
        thumb: p.thumbnail ? p.thumbnail.source : '', wikiUrl: p.fullurl || '', tags: {}
      });
    }
    return out;
  }

  function wikiFullUrl(title, lang) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1',
      prop: 'extracts|description|pageimages|info', explaintext: '1', exchars: '7000',
      piprop: 'thumbnail', pithumbsize: '500', inprop: 'url', titles: title
    });
    return `${wikiApi(lang)}?${p}`;
  }
  function parseWikiFull(json, lang) {
    const pages = json && json.query && json.query.pages;
    const p = Array.isArray(pages) ? pages[0] : pages && Object.values(pages)[0];
    if (!p || p.missing || !p.extract) return null;
    if (/disambiguation/i.test(p.description || '') || /\b(may|can) refer to\b/i.test(String(p.extract).slice(0, 300))) return null;
    return { title: p.title, lang: lang || 'en', extract: p.extract, description: p.description || '', url: p.fullurl || '', thumb: p.thumbnail ? p.thumbnail.source : '' };
  }

  function wikiSearchUrl(name, lang) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*',
      generator: 'search', gsrsearch: name, gsrlimit: '5', prop: 'coordinates|description|info',
      colimit: 'max', coprimary: 'primary', inprop: 'url'
    });
    return `${wikiApi(lang)}?${p}`;
  }
  /** choose a search hit only if it is geographically close and the title resembles the marker name */
  function pickSearchMatch(json, m) {
    const pages = (json && json.query && json.query.pages) || [];
    let best = null;
    for (const p of Array.isArray(pages) ? pages : Object.values(pages)) {
      if (/disambiguation/i.test(p.description || '')) continue;
      const c = p.coordinates && p.coordinates[0];
      const sim = nameSimilarity(p.title, m.name);
      if (sim < 0.5) continue;
      const d = c ? distanceM(m.lat, m.lon, c.lat, c.lon) : Infinity;
      if (!(d <= 3000) && !(sim === 1 && !c)) continue;
      if (!best || d < best.d) best = { title: p.title, d };
    }
    return best;
  }

  function wikiRefs(m) {
    const titles = [], qids = [];
    const add = (v) => {
      const mm = /^([a-z]{2,3}(?:-[a-z]+)?):(.+)$/i.exec(v || '');
      if (mm) titles.push({ lang: mm[1].toLowerCase(), title: mm[2].trim() });
    };
    if (m.wikiTitle) titles.push({ lang: m.lang || 'en', title: m.wikiTitle });
    const t = m.tags || {};
    add(t.wikipedia); add(t.subjectWikipedia);
    if (/^Q\d+$/.test(t.wikidata || '')) qids.push(t.wikidata);
    if (/^Q\d+$/.test(t.subjectWikidata || '')) qids.push(t.subjectWikidata);
    const seen = new Set();
    return { titles: titles.filter(x => { const k = x.lang + ':' + x.title; return seen.has(k) ? false : (seen.add(k), true); }), qids };
  }

  const wikidataUrl = qid => `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`;
  function parseWikidataTitle(json, qid) {
    const s = json && json.entities && json.entities[qid] && json.entities[qid].sitelinks;
    return (s && s.enwiki && s.enwiki.title) || null;
  }

  /* ---------- merging & triggers ---------- */
  function sameThing(a, b) {
    if (a.id === b.id) return true;
    const d = distanceM(a.lat, a.lon, b.lat, b.lon);
    if (d > 250) return false;
    const ra = wikiRefs(a), rb = wikiRefs(b);
    const hit = (r, other) => r.titles.some(x => other.wikiTitle && x.title.toLowerCase() === other.wikiTitle.toLowerCase());
    if (hit(ra, b) || hit(rb, a)) return true;
    return nameSimilarity(a.name, b.name) >= 0.5 && a.hasName !== false && b.hasName !== false;
  }

  function mergeMarkers(list) {
    const out = [];
    for (const m of list) {
      const o = out.find(x => sameThing(x, m));
      if (!o) { out.push({ ...m, tags: { ...(m.tags || {}) }, keys: [m.id] }); continue; }
      if (m.source === 'osm' && o.source !== 'osm') { o.lat = m.lat; o.lon = m.lon; o.osmType = m.osmType; o.osmId = m.osmId; o.source = 'osm'; if (m.hasName) o.name = m.name; }
      o.wikiTitle = o.wikiTitle || m.wikiTitle; o.lang = o.lang || m.lang;
      o.thumb = o.thumb || m.thumb; o.wikiUrl = o.wikiUrl || m.wikiUrl;
      o.description = o.description || m.description; o.inscription = o.inscription || m.inscription;
      o.startDate = o.startDate || m.startDate; o.nrhp = o.nrhp || m.nrhp;
      for (const k of Object.keys(m.tags || {})) o.tags[k] = o.tags[k] || m.tags[k];
      if (o.typeLabel === 'historic site' || !o.typeLabel) o.typeLabel = m.typeLabel;
      o.keys.push(m.id);
      o.merged = true;
    }
    for (const o of out) if (o.wikiTitle) o.keys.push(`wiki:${(o.lang || 'en')}:${o.wikiTitle.toLowerCase()}`);
    return out;
  }

  const isRecentlySeen = (seen, m, now, windowMs) => (m.keys || [m.id]).some(k => seen[k] && now - seen[k] < windowMs);
  function markSeen(seen, m, now) { for (const k of (m.keys || [m.id])) seen[k] = now; return seen; }

  function pickTriggers(markers, pos, radius, seen, now, windowMs) {
    const res = [];
    for (const m of markers) {
      const d = distanceM(pos.lat, pos.lon, m.lat, m.lon);
      if (d <= radius && !isRecentlySeen(seen, m, now, windowMs)) res.push({ ...m, distance: d });
    }
    return res.sort((a, b) => a.distance - b.distance);
  }

  function needsRefresh(tile, pos, o) {
    o = o || {};
    const now = o.now || Date.now();
    if (!tile) return true;
    if (distanceM(tile.lat, tile.lon, pos.lat, pos.lon) > (o.moveM || 500)) return true;
    if (tile.partial && now - tile.t > (o.retryMs || 30000)) return true;
    return now - tile.t > (o.staleMs || 30 * 60 * 1000);
  }

  /* ---------- synopsis assembly ---------- */
  function shortInscription(m, maxWords) {
    return m.inscription ? truncateWords(m.inscription.replace(/\s+/g, ' '), maxWords || 90) : '';
  }

  function fallbackSynopsis(m, maxWords) {
    const parts = [];
    const label = m.typeLabel || 'historic site';
    const article = /^[aeiou]/i.test(label) ? 'an' : 'a';
    let first = `${m.name} is ${article} ${label}`;
    const yr = /\b(1[0-9]{3}|20[0-2][0-9])\b/.exec(m.startDate || '');
    if (yr) first += ` dating to ${yr[1]}`;
    parts.push(first + '.');
    if (m.nrhp) parts.push('It is listed on the National Register of Historic Places.');
    if (m.description) parts.push(/[.!?]$/.test(m.description) ? m.description : m.description + '.');
    if (m.inscription) {
      const ins = summarize(m.inscription.replace(/\s+/g, ' '), { maxWords: Math.max(40, (maxWords || 150) - 40) });
      parts.push('The marker’s text reads, in part: ' + ins);
    }
    if (parts.length <= 1 + (m.nrhp ? 1 : 0)) parts.push('No further details about this site were found in open sources.');
    return truncateWords(parts.join(' '), (maxWords || 150) + 20);
  }

  function makeSynopsis(m, page, opts) {
    const maxWords = (opts && opts.maxWords) || 150;
    if (page && page.extract) {
      const s = summarize(page.extract, { maxWords });
      if (s) return s;
    }
    return fallbackSynopsis(m, maxWords);
  }

  /** the material handed to an LLM when the user supplies an API key */
  function assembleSource(m, page) {
    const bits = [`Name: ${m.name}`, `Type: ${m.typeLabel || 'historic site'}`];
    if (m.startDate) bits.push(`Date: ${m.startDate}`);
    if (m.description) bits.push(`Description: ${m.description}`);
    if (m.inscription) bits.push(`Marker inscription: ${m.inscription.slice(0, 1500)}`);
    if (page && page.extract) bits.push(`Wikipedia article "${page.title}":\n${cleanWikiText(page.extract).slice(0, 6000)}`);
    return { text: bits.join('\n') };
  }

  return {
    TILE_RADIUS, distanceM, bearingDeg, compass, formatDistance, cleanWikiText, splitSentences, wordCount, truncateWords,
    summarize, readSeconds, nameTokens, nameSimilarity, typeLabel, overpassQuery, parseOverpass, wikiNearbyUrl, looksHistoric,
    parseWikiNearby, wikiFullUrl, parseWikiFull, wikiSearchUrl, pickSearchMatch, wikiRefs, wikidataUrl, parseWikidataTitle,
    mergeMarkers, isRecentlySeen, markSeen, pickTriggers, needsRefresh, shortInscription, fallbackSynopsis, makeSynopsis, assembleSource
  };
});
