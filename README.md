# Road Trip Rubbernecker

A phone-friendly web app (PWA). While you travel it watches your location, and when you come within
100 m (adjustable 50–300 m) of a historical marker or historic site it:

1. raises a phone notification,
2. researches the site (OpenStreetMap tags → Wikipedia / Wikidata),
3. shows a ~150-word synopsis (about one minute to read or listen to), and
4. reads it aloud with the device's built-in voice.

## Run it
Deployed automatically to GitHub Pages from `main` (see `.github/workflows/pages.yml`): https://bbrucker50.github.io/Rubbernecker/

It needs HTTPS (location, notifications and install are blocked on plain http), so host the folder on any static host
(GitHub Pages, Netlify, Cloudflare Pages, Hostinger…) and open the https:// address on your phone, then
"Add to Home Screen". For a quick desktop try: `python3 -m http.server 8000` and open http://localhost:8000.

Use **Settings → Test location** (presets for the Lincoln Memorial, Independence Hall, the Alamo, Fort McHenry)
to try it without moving.

## Data sources
- OpenStreetMap via Overpass: every `historic=*` object with a name, inscription, description or wiki link. (ODbL)
- Wikipedia geosearch (+ Wikidata links) for notable historic places. (CC BY-SA 4.0)
- HMdb.org and the Pomeroy Foundation map have no public API, so they are linked, not queried.

## Optional
A Claude API key in Settings rewrites the synopsis more smoothly. Stored only in the browser, sent only to api.anthropic.com.

## Limits worth knowing
- Browsers pause GPS when the screen is off or the app is in the background. Keep the app open (it holds the screen awake) with the
  phone mounted. True background alerts need a native wrapper (e.g. Capacitor).
- Coverage depends on OpenStreetMap/Wikipedia; many roadside markers exist only in HMdb.

## Files
index.html · app.js (UI, GPS, research, speech, notifications) · core.js (pure logic) · sw.js · manifest.webmanifest · test/core.test.js (`node --test test/core.test.js`)
