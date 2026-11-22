import json, subprocess, time, sys, re
from playwright.sync_api import sync_playwright

PORT = 8765
srv = subprocess.Popen(["python3", "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "-d", __import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "..")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

MARKER = (38.8893, -77.0502)
def north(m): return MARKER[0] + m / 111195.0   # metres north of the marker

OVERPASS = {"elements": [
  {"type": "node", "id": 1, "lat": MARKER[0], "lon": MARKER[1], "tags": {"historic": "memorial", "name": "Lincoln Memorial", "wikipedia": "en:Lincoln Memorial", "ref:nrhp": "66000031"}},
  {"type": "node", "id": 9, "lat": MARKER[0] + 0.0030, "lon": MARKER[1], "tags": {"historic": "boundary_stone", "name": "Junk stone"}},
]}
WIKI_NEARBY = {"query": {"pages": [
  {"pageid": 10, "title": "Lincoln Memorial", "description": "Presidential memorial in Washington, D.C.", "coordinates": [{"lat": MARKER[0], "lon": MARKER[1]}], "fullurl": "https://en.wikipedia.org/wiki/Lincoln_Memorial"},
  {"pageid": 11, "title": "Joe's Burger Shack", "description": "Restaurant", "coordinates": [{"lat": MARKER[0], "lon": MARKER[1]}]},
]}}
LEAD = "The Lincoln Memorial is a national memorial in Washington, D.C., dedicated to Abraham Lincoln, the 16th U.S. president. "
FILL = " ".join(f"Sentence {i} gives an ordinary, unremarkable detail about the grounds." for i in range(30))
EXTRACT = LEAD + "Architect Henry Bacon designed it and it was dedicated on May 30, 1922. " + FILL + " Visitors can find parking and hours online.\n\n== References ==\nSmith 2001."
WIKI_FULL = {"query": {"pages": [{"title": "Lincoln Memorial", "extract": EXTRACT, "description": "Presidential memorial", "fullurl": "https://en.wikipedia.org/wiki/Lincoln_Memorial"}]}}

CORS = {"access-control-allow-origin": "*", "content-type": "application/json"}
calls = {"overpass": 0, "nearby": 0, "full": 0}
def wiki_route(route):
    u = route.request.url
    if "generator=geosearch" in u: calls["nearby"] += 1; body = WIKI_NEARBY
    elif "titles=" in u: calls["full"] += 1; body = WIKI_FULL
    else: body = {"query": {"pages": []}}
    route.fulfill(status=200, headers=CORS, body=json.dumps(body))
def overpass_route(route):
    calls["overpass"] += 1
    route.fulfill(status=200, headers=CORS, body=json.dumps(OVERPASS))

FAKE_SPEECH = """
(() => {
  window.__spoken = [];
  const synth = { speaking:false, getVoices(){ return []; }, addEventListener(){}, cancel(){ window.__spoken.push('<cancel>'); },
    speak(u){ if (u.text) window.__spoken.push(u.text); setTimeout(()=>{ u.onend && u.onend({}); }, 5); } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function(t){ this.text = t; };
})();
"""

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail)); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(geolocation={"latitude": north(300), "longitude": MARKER[1], "accuracy": 8}, permissions=["geolocation", "notifications"], viewport={"width": 420, "height": 900})
    ctx.add_init_script(FAKE_SPEECH)
    ctx.route(re.compile(r".*overpass.*"), overpass_route)
    ctx.route(re.compile(r".*wikipedia\.org/w/api\.php.*"), wiki_route)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.goto(f"http://localhost:{PORT}/index.html")
    check("page loads, secure context on localhost", page.evaluate("window.isSecureContext"))
    check("no secure-context warning shown", page.locator("#secure").is_hidden())

    page.click("#startBtn")
    page.wait_for_function("window.__rr.markers.length > 0", timeout=8000)
    check("surroundings loaded; junk stone & burger shack filtered, wiki+OSM merged", page.evaluate("window.__rr.markers.length") == 1, str(page.evaluate("window.__rr.markers.map(m=>m.name)")))
    check("300 m away → no announcement yet", page.locator("#card").is_hidden() and page.evaluate("window.__spoken.length") == 0)
    page.wait_for_function("document.querySelector('#nearby button')")
    check("nearby list shows marker with distance", "Lincoln Memorial" in page.inner_text("#nearby") and "ft" in page.inner_text("#nearby"), page.inner_text("#nearby"))

    ctx.set_geolocation({"latitude": north(120), "longitude": MARKER[1], "accuracy": 8}); page.wait_for_timeout(700)
    check("120 m away → still no announcement", page.locator("#card").is_hidden())

    ctx.set_geolocation({"latitude": north(95), "longitude": MARKER[1], "accuracy": 8})
    page.wait_for_selector("#card:not([hidden])", timeout=6000)
    page.wait_for_function("!document.querySelector('#syn').classList.contains('loading')", timeout=6000)
    check("95 m away → card appears with title", page.inner_text("#title") == "Lincoln Memorial")
    syn = page.inner_text("#syn")
    check("synopsis from Wikipedia lead, <=165 words, no refs/visitor trivia", syn.startswith("The Lincoln Memorial is a national memorial") and len(syn.split()) <= 165 and "Smith 2001" not in syn and "parking" not in syn, f"{len(syn.split())} words")
    check("includes the dedication fact", "1922" in syn)
    page.wait_for_function("window.__spoken.length >= 2", timeout=6000)
    sp = [x for x in page.evaluate("window.__spoken") if x != "<cancel>"]
    check("spoken aloud (title announced first, then sentences)", sp[0].startswith("Lincoln Memorial.") or sp[0] == "Lincoln Memorial.", sp[0][:60])
    page.screenshot(path="/tmp/card.png")
    check("kicker shows listen-time estimate", "sec" in page.inner_text("#kicker").lower(), page.inner_text("#kicker"))
    check("Wikipedia link present", page.locator("#wikiLink").is_visible() and "wikipedia.org" in page.get_attribute("#wikiLink", "href"))
    check("history records it", "Lincoln Memorial" in page.inner_text("#history"))

    note = page.evaluate("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(ns => ns.map(n => [n.title, n.body, n.tag]))")
    check("phone notification raised (SW)", len(note) == 1 and "Lincoln Memorial" in note[0][0], str(note))

    # leave and come back: must not repeat
    page.wait_for_timeout(300)
    n_before = page.evaluate("window.__spoken.length")
    ctx.set_geolocation({"latitude": north(400), "longitude": MARKER[1], "accuracy": 8}); page.wait_for_timeout(500)
    ctx.set_geolocation({"latitude": north(30), "longitude": MARKER[1], "accuracy": 8}); page.wait_for_timeout(1200)
    check("not re-announced within repeat window", page.evaluate("window.__spoken.length") == n_before)

    # poor GPS accuracy is ignored
    page.evaluate("window.__rr.seen = {}; window.__rr.holdUntil = 0; window.__rr.current = null")
    page.click("#settings summary"); page.click("#clearHist")
    ctx.set_geolocation({"latitude": north(10), "longitude": MARKER[1], "accuracy": 500}); page.wait_for_timeout(1200)
    check("fix with ±500 m accuracy does not trigger", page.evaluate("window.__spoken.length") == n_before)
    ctx.set_geolocation({"latitude": north(10), "longitude": MARKER[1], "accuracy": 10}); page.wait_for_timeout(2500)
    check("good fix triggers again after clearing visited", page.evaluate("window.__spoken.length") > n_before)

    # test mode + presets
    page.fill("#simInput", "38.8893, -77.0502"); page.click("#simGo")
    page.wait_for_timeout(1500)
    check("test mode shows Test GPS pill", "Test" in page.inner_text("#gps"), page.inner_text("#gps"))
    page.fill("#simInput", "garbage"); page.click("#simGo")
    check("bad coordinates rejected", page.locator("#error").is_visible() and "Enter coordinates" in page.inner_text("#error"))

    # offline-ish: both APIs fail → friendly error, no crash
    page.screenshot(path="/tmp/shot.png", full_page=False)
    check("no uncaught JS errors", not errs, "; ".join(errs[:3]))
    print("API calls:", calls)
    b.close()
finally:
    srv.terminate()

bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} passed")
sys.exit(1 if bad else 0)
