/* Atlas of the Real — a living wallpaper of the world you are actually standing on.
   Real Earth, real sun, real Milan. Only achieved goals may orbit. */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const MILAN = { lon: 9.19, lat: 45.4642 };
  const STORE_KEY = 'atlasOfTheReal.discoveries.v1';
  const DEG = Math.PI / 180;
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Each category has a colour and a line glyph drawn in a 24×24 box.
  const CATS = {
    body:   { label: 'Body',   color: '#ff6b6b', d: 'M12 3 L21 19 L3 19 Z M12 10 V14' },
    mind:   { label: 'Mind',   color: '#6ff3ff', d: 'M4 12 A8 8 0 1 1 20 12 A8 8 0 1 1 4 12 Z M10.5 12 A1.5 1.5 0 1 1 13.5 12 A1.5 1.5 0 1 1 10.5 12 Z' },
    craft:  { label: 'Craft',  color: '#ffb347', d: 'M12 2 L22 12 L12 22 L2 12 Z M12 8 V16 M8 12 H16' },
    wealth: { label: 'Wealth', color: '#ffe066', d: 'M12 2 L20.7 7 V17 L12 22 L3.3 17 V7 Z M12 8 L15 12 L12 16 L9 12 Z' },
    bonds:  { label: 'Bonds',  color: '#ff7ad9', d: 'M2.5 12 A5 5 0 1 1 12.5 12 A5 5 0 1 1 2.5 12 Z M11.5 12 A5 5 0 1 1 21.5 12 A5 5 0 1 1 11.5 12 Z' },
    voyage: { label: 'Voyage', color: '#8cff9e', d: 'M3 20 L12 3 L21 20 L12 15 Z' },
  };
  const CAT_KEYS = Object.keys(CATS);
  for (const k of CAT_KEYS) CATS[k].path = new Path2D(CATS[k].d);

  // Words that betray a dream rather than an achievement.
  const DREAM_RX = /\b(will|i'll|shall|gonna|going to|want(?:s)? to|wanna|wish(?:es)?|someday|some day|one day|dream(?:s|ing|ed)?|plan(?:s|ning)? to|hope(?:s)? to|would like|aspire|bucket list|eventually|to-?do|goal:)\b/i;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysAgo = (s) => Math.round((parseDay(todayStr()) - parseDay(s)) / 86400000);
  const agoText = (s) => {
    const n = daysAgo(s);
    if (n <= 0) return 'TODAY';
    if (n === 1) return 'YESTERDAY';
    if (n < 60) return `${n} DAYS AGO`;
    if (n < 730) return `${Math.round(n / 30.44)} MONTHS AGO`;
    return `${(n / 365.25).toFixed(1).replace(/\.0$/, '')} YEARS AGO`;
  };
  const fmtDay = (s) => parseDay(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDay(s));

  function glyphSVG(cat) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'glyph');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', CATS[cat].d);
    svg.appendChild(p);
    return svg;
  }

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  let storageOK = true;
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(validShape) : [];
    } catch { storageOK = false; return []; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(items)); storageOK = true; }
    catch { storageOK = false; }
    if (!remote) $('storeNote').textContent = storageOK ? 'Saved in this browser' : 'Storage blocked — export to keep';
  }
  // Cloud sync when hosted on claude.ai (private per person); local storage otherwise.
  let remote = null;
  function remotePut(it) { if (remote) remote.doc(it.id).set({ ...it }).catch(() => toast('SYNC FAILED · SAVED LOCALLY', true)); }
  function remoteDel(id) { if (remote) remote.doc(id).delete().catch(() => toast('SYNC FAILED', true)); }
  async function connectCloud() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const uidv = await user.id();
      if (!uidv) return;
      const col = db.collection('data/users/' + uidv);
      let first = true;
      col.onSnapshot((snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(validShape);
        if (first) {
          first = false;
          remote = col;
          const have = new Set(rows.map((r) => r.id));
          const local = items.filter((x) => !have.has(x.id));
          if (local.length) { local.forEach(remotePut); rows.push(...local); }
        }
        items = rows;
        save(); layoutOrbits(); renderLog();
        $('storeNote').textContent = 'Synced to your account';
      }, () => { $('storeNote').textContent = 'Offline · saved in this browser'; });
    } catch { /* stay local */ }
  }

  function validShape(x) {
    return x && typeof x.title === 'string' && x.title.trim() && isDay(x.date) && CATS[x.category];
  }

  let items = load();
  let filter = 'all';
  let litId = null;      // hovered/highlighted discovery
  let openId = null;     // expanded in the list
  let editingId = null;

  // ---------------------------------------------------------------------------
  // Reality check — the dream filter
  // ---------------------------------------------------------------------------
  function realityCheck(title, date) {
    if (!title.trim()) return { head: 'NO SIGNAL', msg: 'Name what you achieved.' };
    if (!isDay(date)) return { head: 'NO TIMESTAMP', msg: 'When did it become real? Pick the date.' };
    if (date > todayStr()) return { head: 'DREAM DETECTED', msg: 'That date hasn\'t happened yet. The future is where dreams live — come back and log it once it\'s real.' };
    const m = title.match(DREAM_RX);
    if (m) return { head: 'DREAM DETECTED', msg: `“${m[0]}” sounds like a dream, not a discovery. Only achieved goals exist in this world — write it as something you have done.` };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Discovery log UI
  // ---------------------------------------------------------------------------
  const sorted = () => [...items].sort((a, b) => (b.date.localeCompare(a.date)) || ((b.loggedAt || 0) - (a.loggedAt || 0)));

  function renderChips() {
    const chips = $('chips');
    chips.textContent = '';
    const mk = (key, label, n, color) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', String(filter === key));
      if (color) b.style.setProperty('--c', color);
      if (key !== 'all') b.appendChild(glyphSVG(key));
      b.append(label.toUpperCase());
      const s = document.createElement('span');
      s.className = 'n';
      s.textContent = n;
      b.appendChild(s);
      b.addEventListener('click', () => { filter = filter === key && key !== 'all' ? 'all' : key; renderLog(); });
      chips.appendChild(b);
    };
    mk('all', 'All', items.length);
    for (const k of CAT_KEYS) {
      const n = items.filter((x) => x.category === k).length;
      if (n || filter === k) mk(k, CATS[k].label, n, CATS[k].color);
    }
  }

  function renderLog() {
    $('count').textContent = items.length;
    const meta = $('logMeta');
    meta.textContent = '';
    if (items.length) {
      const s = sorted();
      const last = s[0], first = s[s.length - 1];
      meta.append('LATEST ');
      const b1 = document.createElement('b'); b1.textContent = agoText(last.date); meta.append(b1);
      meta.append('  ·  SINCE ');
      const b2 = document.createElement('b'); b2.textContent = fmtDay(first.date); meta.append(b2);
    } else {
      meta.textContent = 'AWAITING FIRST VERIFIED DISCOVERY';
    }

    renderChips();

    const list = $('entries');
    list.textContent = '';
    const shown = sorted().filter((x) => filter === 'all' || x.category === filter);
    $('empty').hidden = items.length > 0;

    for (const it of shown) {
      const cat = CATS[it.category];
      const li = document.createElement('li');
      li.className = 'entry' + (openId === it.id ? ' open' : '') + (litId === it.id ? ' lit' : '');
      li.dataset.id = it.id;
      li.style.setProperty('--c', cat.color);

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'entry-main';
      main.setAttribute('aria-expanded', String(openId === it.id));
      main.appendChild(glyphSVG(it.category));
      const t = document.createElement('span'); t.className = 'entry-title'; t.textContent = it.title;
      const tm = document.createElement('time'); tm.dateTime = it.date; tm.textContent = fmtDay(it.date);
      main.append(t, tm);
      main.addEventListener('click', () => { openId = openId === it.id ? null : it.id; renderLog(); });

      const body = document.createElement('div');
      body.className = 'entry-body';
      const c = document.createElement('div'); c.className = 'entry-cat'; c.textContent = `${cat.label.toUpperCase()} · ${agoText(it.date)}`;
      body.appendChild(c);
      if (it.note) { const p = document.createElement('p'); p.className = 'entry-note'; p.textContent = it.note; body.appendChild(p); }
      const acts = document.createElement('div'); acts.className = 'entry-actions';
      const eb = document.createElement('button'); eb.type = 'button'; eb.className = 'btn ghost'; eb.textContent = 'EDIT';
      eb.addEventListener('click', () => openDialog(it));
      const db = document.createElement('button'); db.type = 'button'; db.className = 'btn ghost danger'; db.textContent = 'DELETE';
      db.addEventListener('click', () => {
        if (confirm(`Remove “${it.title}” from your log?`)) {
          items = items.filter((x) => x.id !== it.id);
          remoteDel(it.id);
          save(); layoutOrbits(); renderLog(); toast('DISCOVERY REMOVED');
        }
      });
      acts.append(eb, db);
      body.appendChild(acts);

      li.append(main, body);
      li.addEventListener('mouseenter', () => setLit(it.id));
      li.addEventListener('mouseleave', () => setLit(null));
      list.appendChild(li);
    }
    planetInfo = `DISCOVERIES ${items.length}  ·  DREAMS 0  ·  SENTINELS NONE`;
  }

  function setLit(id) {
    litId = id;
    for (const li of document.querySelectorAll('.entry')) li.classList.toggle('lit', li.dataset.id === id);
  }

  let toastTimer;
  function toast(msg, bad = false) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('bad', bad);
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // --- Dialog ---------------------------------------------------------------
  const dlg = $('logDialog');
  (function buildCatPicker() {
    const wrap = $('catPick');
    for (const k of CAT_KEYS) {
      const lab = document.createElement('label'); lab.className = 'cat-opt';
      const inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'category'; inp.value = k;
      const span = document.createElement('span'); span.style.setProperty('--c', CATS[k].color);
      span.append(glyphSVG(k), CATS[k].label.toUpperCase());
      lab.append(inp, span);
      wrap.appendChild(lab);
    }
  })();

  function openDialog(it = null) {
    editingId = it ? it.id : null;
    $('dlgKicker').textContent = it ? 'AMEND DISCOVERY' : 'NEW DISCOVERY';
    $('dlgTitle').textContent = it ? 'Edit achieved goal' : 'Log an achieved goal';
    $('saveBtn').textContent = it ? 'SAVE CHANGES' : 'UPLOAD DISCOVERY';
    $('fTitle').value = it ? it.title : '';
    $('fDate').value = it ? it.date : todayStr();
    $('fDate').max = todayStr();
    $('fNote').value = it ? (it.note || '') : '';
    const cat = it ? it.category : (filter !== 'all' ? filter : 'craft');
    for (const r of dlg.querySelectorAll('input[name=category]')) r.checked = r.value === cat;
    $('formError').hidden = true;
    dlg.showModal();
    $('fTitle').focus();
  }

  function showError(e) {
    const box = $('formError');
    box.textContent = '';
    const b = document.createElement('b'); b.textContent = e.head;
    box.append(b, e.msg);
    box.hidden = false;
  }

  $('logForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = $('fTitle').value.trim().replace(/\s+/g, ' ');
    const date = $('fDate').value;
    const note = $('fNote').value.trim();
    const catEl = dlg.querySelector('input[name=category]:checked');
    const category = catEl ? catEl.value : 'craft';
    const err = realityCheck(title, date);
    if (err) { showError(err); return; }

    if (editingId) {
      const it = items.find((x) => x.id === editingId);
      if (it) { Object.assign(it, { title, date, note, category }); remotePut(it); }
      toast('DISCOVERY AMENDED');
    } else {
      const it = { id: uid(), title, date, category, note, loggedAt: Date.now() };
      items.push(it);
      remotePut(it);
      openId = it.id;
      burst = { id: it.id, t0: performance.now() };
      toast(`DISCOVERY UPLOADED · ${CATS[category].label.toUpperCase()}`);
    }
    save(); layoutOrbits(); renderLog();
    dlg.close();
  });
  $('cancelBtn').addEventListener('click', () => dlg.close());
  $('addBtn').addEventListener('click', () => openDialog());
  for (const id of ['fTitle', 'fDate']) $(id).addEventListener('input', () => { $('formError').hidden = true; });

  document.addEventListener('keydown', (e) => {
    if (!introDone) { skipIntro(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (dlg.open || tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openDialog(); }
    if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); replayIntro(); }
  });

  // --- Export / import -----------------------------------------------------
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'atlas-of-the-real', version: 1, exportedAt: new Date().toISOString(), discoveries: items }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `achieved-goals-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const arr = Array.isArray(data) ? data : data.discoveries;
      if (!Array.isArray(arr)) throw new Error('shape');
      const have = new Set(items.map((x) => x.id));
      let added = 0, rejected = 0;
      for (const raw of arr) {
        const x = { id: raw.id || uid(), title: String(raw.title || '').trim(), date: raw.date, category: raw.category, note: String(raw.note || ''), loggedAt: raw.loggedAt || Date.now() };
        if (!validShape(x) || realityCheck(x.title, x.date)) { rejected++; continue; }
        if (have.has(x.id)) continue;
        items.push(x); have.add(x.id); added++; remotePut(x);
      }
      save(); layoutOrbits(); renderLog();
      toast(rejected ? `IMPORTED ${added} · ${rejected} DREAMS FILTERED` : `IMPORTED ${added} DISCOVERIES`, added === 0 && rejected > 0);
    } catch {
      toast('IMPORT FAILED · UNREADABLE FILE', true);
    }
  });

  // ---------------------------------------------------------------------------
  // Clock & sun
  // ---------------------------------------------------------------------------
  function sunPosition(date) {
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
    const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
    const eps = (23.439 - 0.0000004 * n) * DEG;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const gmst = ((280.46061837 + 360.98564736629 * n) % 360) * DEG;
    let lon = (ra - gmst) / DEG;
    lon = ((lon % 360) + 540) % 360 - 180;
    return { lon, lat: dec / DEG, dec, ra, gmst };
  }
  function sunAltitude(lat, lon, s) {
    const H = s.gmst + lon * DEG - s.ra;
    return Math.asin(Math.sin(lat * DEG) * Math.sin(s.dec) + Math.cos(lat * DEG) * Math.cos(s.dec) * Math.cos(H)) / DEG;
  }

  const fmtHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', second: '2-digit' });
  const fmtDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTZ = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', timeZoneName: 'short' });

  let sun = sunPosition(new Date());
  let nightCircles = [];
  function updateSun() {
    sun = sunPosition(new Date());
    const anti = [sun.lon + 180, -sun.lat];
    nightCircles = [96, 93, 90, 87, 84].map((r) => d3.geoCircle().center(anti).radius(r).precision(2)());
  }

  function tick() {
    const now = new Date();
    const hm = fmtHM.format(now);
    const tz = (fmtTZ.formatToParts(now).find((p) => p.type === 'timeZoneName') || {}).value || '';
    $('clockHM').textContent = hm;
    $('clockS').textContent = ':' + fmtS.format(now).padStart(2, '0');
    $('clockDate').textContent = `MILANO · ${fmtDate.format(now).toUpperCase().replace(/,/g, '')} · ${tz}`;
    $('locTime').textContent = `${hm} ${tz}`;
    const alt = sunAltitude(MILAN.lat, MILAN.lon, sun);
    const phase = alt > 6 ? 'DAYLIGHT' : alt > -0.8 ? 'GOLDEN HOUR' : alt > -6 ? 'TWILIGHT' : 'NIGHT';
    $('locSun').textContent = `${phase} · ${alt >= 0 ? '+' : '−'}${Math.abs(alt).toFixed(0)}°`;
    milanNight = alt < -0.8;
  }

  // ---------------------------------------------------------------------------
  // The sky: Milky Way → Solar System → Earth
  // ---------------------------------------------------------------------------
  const canvas = $('sky');
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  const galaxy = document.createElement('canvas');
  let W = 0, H = 0, DPR = 1, CX = 0, CY = 0, R = 100, RIGHT = 0, TOPB = 0, BOTB = 0, mobile = false;
  let planetInfo = '';
  let milanNight = false;
  let burst = null;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;
  const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(proj, ctx);
  const topo = window.WORLD_110M;
  const countries = topojson.feature(topo, topo.objects.countries);
  const land = topojson.merge(topo, topo.objects.countries.geometries);
  const italy = countries.features.find((f) => f.properties && f.properties.name === 'Italy');

  // --- A realistic Earth: biome colours by latitude, clouds, city lights ----
  const WET = new Set(['India', 'Bangladesh', 'China', 'Vietnam', 'Laos', 'Thailand', 'Myanmar', 'Japan', 'South Korea', 'North Korea', 'Taiwan', 'Nepal', 'Bhutan', 'Cuba', 'Mozambique', 'Madagascar', 'Zimbabwe', 'eSwatini', 'Lesotho', 'Paraguay', 'Uruguay', 'Haiti', 'Dominican Rep.', 'Jamaica', 'Puerto Rico', 'Bahamas', 'Zambia', 'Malawi']);
  const landTiles = countries.features.map((f) => {
    const name = (f.properties && f.properties.name) || '';
    const lat = d3.geoCentroid(f)[1];
    const a = Math.abs(lat);
    const j = mulberry32(strHash(name));
    let c;
    if (name === 'Antarctica' || name === 'Greenland') c = [226, 234, 242];
    else if (a > 62) c = [128, 130, 112];
    else if (a > 48) c = [62, 86, 52];
    else if (a >= 14 && a <= 34 && !WET.has(name)) c = [168, 138, 92];
    else if (a < 14) c = [38, 78, 36];
    else c = [78, 100, 56];
    const n = (j() - 0.5) * 16;
    return { f, fill: `rgb(${Math.round(c[0] + n)},${Math.round(c[1] + n)},${Math.round(c[2] + n * 0.6)})` };
  });

  const clouds = (() => {
    const r = mulberry32(4242);
    const batches = [[], [], []];
    // streaky systems: many small puffs stretched along the winds
    for (let i = 0; i < 60; i++) {
      const band = r();
      const lat = band < 0.35 ? (r() - 0.5) * 22 : (r() < 0.5 ? -1 : 1) * (36 + r() * 28);
      const lon = r() * 360 - 180;
      const n = 6 + Math.floor(r() * 10);
      const tilt = (r() - 0.5) * 0.6;
      for (let k = 0; k < n; k++) {
        const u = (r() - 0.5) * 26;
        batches[k % 3].push(d3.geoCircle().center([lon + u, lat + u * tilt + (r() - 0.5) * 3]).radius(0.7 + r() * 2.2).precision(12)());
      }
    }
    return batches;
  })();

  const cloudLayer = document.createElement('canvas');
  const cloudProj = d3.geoOrthographic().clipAngle(90).precision(1);

  const CITIES = [
    [9.19, 45.46], [2.35, 48.86], [-0.13, 51.51], [13.4, 52.52], [12.5, 41.9], [-3.7, 40.42], [2.17, 41.39], [4.9, 52.37], [16.37, 48.21], [37.62, 55.75], [30.52, 50.45], [21.01, 52.23], [28.98, 41.01], [23.73, 37.98], [14.27, 40.85], [7.68, 45.07], [11.25, 43.77], [8.68, 50.11], [11.58, 48.14], [6.96, 50.94],
    [-74.0, 40.71], [-87.63, 41.88], [-118.24, 34.05], [-122.42, 37.77], [-95.37, 29.76], [-80.19, 25.76], [-77.04, 38.9], [-79.38, 43.65], [-73.57, 45.5], [-99.13, 19.43], [-84.39, 33.75], [-112.07, 33.45],
    [-46.63, -23.55], [-43.17, -22.91], [-58.38, -34.6], [-70.65, -33.45], [-77.04, -12.05], [-74.07, 4.71],
    [31.24, 30.04], [3.38, 6.52], [36.82, -1.29], [28.05, -26.2], [18.42, -33.92], [-7.59, 33.57], [3.06, 36.75], [38.74, 9.03],
    [55.27, 25.2], [46.68, 24.71], [51.39, 35.69], [44.37, 33.31], [72.88, 19.08], [77.21, 28.61], [88.36, 22.57], [80.27, 13.08], [77.59, 12.97], [67.0, 24.86], [90.41, 23.81],
    [116.4, 39.9], [121.47, 31.23], [113.26, 23.13], [114.17, 22.32], [104.07, 30.67], [139.69, 35.69], [135.5, 34.69], [126.98, 37.57], [121.56, 25.03], [100.5, 13.76], [106.85, -6.21], [103.82, 1.35], [120.98, 14.6], [105.85, 21.03],
    [151.21, -33.87], [144.96, -37.81], [153.03, -27.47], [115.86, -31.95], [174.76, -36.85],
  ];

  // Twinkling stars and shooting stars live on the animated layer.
  const STAR_COLS = ['170,195,255', '205,220,255', '255,255,255', '255,244,222', '255,222,180', '255,196,150'];
  const rnd = mulberry32(20081);
  const twinklers = Array.from({ length: 90 }, () => ({
    x: rnd(), y: rnd(), r: 0.5 + Math.pow(rnd(), 2) * 1.5, ph: rnd() * Math.PI * 2, sp: 0.3 + rnd() * 1.2,
    hue: STAR_COLS[Math.floor(rnd() * STAR_COLS.length)],
  }));
  let shooting = null;
  let nextShoot = performance.now() + 9000;

  function layout() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    mobile = W <= 860;
    if (mobile) {
      const sp = document.querySelector('.planet-space');
      const top = sp.offsetTop, hh = sp.offsetHeight;
      CX = W / 2; CY = top + hh / 2;
      R = Math.min(W * 0.21, hh * 0.22);
      RIGHT = W; TOPB = top + 10; BOTB = top + hh - 10;
    } else {
      const panelW = document.querySelector('.log').offsetWidth + 56;
      const avail = W - panelW;
      RIGHT = avail;
      CX = avail / 2 + 20;
      CY = H * 0.53;
      R = Math.max(80, Math.min(avail * 0.19, H * 0.23));
      TOPB = 88; BOTB = H - 48;
    }
    proj.translate([CX, CY]).scale(R);
    renderBackground();
    if (!galaxyBuilt) { buildGalaxy(); galaxyBuilt = true; }
    layoutOrbits();
  }

  function blob(b, x, y, r, rgb, a) {
    const g = b.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.4, `rgba(${rgb},${a * 0.4})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    b.fillStyle = g;
    b.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function ellBlob(b, x, y, r, sy, rot, rgb, a) {
    b.save(); b.translate(x, y); b.rotate(rot); b.scale(1, sy);
    blob(b, 0, 0, r, rgb, a);
    b.restore();
  }
  const gauss = (r) => (r() + r() + r() + r() - 2) / 2;

  // Deep sky: Milky Way band with dust rifts, nebulae, clusters, distant galaxies
  function renderBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const b = bg.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    const r = mulberry32(7);
    const M = Math.max(W, H), m = Math.min(W, H);

    const base = b.createRadialGradient(W * 0.45, H * 0.5, 0, W * 0.45, H * 0.5, M * 0.8);
    base.addColorStop(0, '#05070f');
    base.addColorStop(1, '#010103');
    b.fillStyle = base;
    b.fillRect(0, 0, W, H);

    // Milky Way band
    const ax = -0.15 * W, ay = H * 1.0, bx = W * 1.15, by = -H * 0.05;
    const ang = Math.atan2(by - ay, bx - ax);
    const len = Math.hypot(bx - ax, by - ay);
    const at = (t, off) => [ax + Math.cos(ang) * len * t - Math.sin(ang) * off, ay + Math.sin(ang) * len * t + Math.cos(ang) * off];
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i <= 44; i++) {
      const t = i / 44;
      const core = Math.exp(-Math.pow((t - 0.3) / 0.14, 2));
      const [x, y] = at(t, gauss(r) * m * 0.03);
      ellBlob(b, x, y, M * (0.12 + core * 0.08), 0.28, ang, core > 0.4 ? '255,226,190' : '190,195,230', 0.03 + core * 0.04);
    }
    for (let i = 0; i < 16000; i++) {
      const t = r();
      const core = Math.exp(-Math.pow((t - 0.3) / 0.16, 2));
      const [x, y] = at(t, gauss(r) * m * (0.11 + core * 0.04));
      b.fillStyle = `rgba(${STAR_COLS[Math.floor(r() * 6)]},${0.04 + r() * 0.22 + core * 0.1})`;
      const s = 0.35 + r() * 0.8;
      b.fillRect(x, y, s, s);
    }
    // dark dust rifts across the band
    b.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 70; i++) {
      const t = r();
      const [x, y] = at(t, (gauss(r) * 0.5 - 0.01) * m * 0.07);
      ellBlob(b, x, y, M * (0.015 + r() * 0.05), 0.3 + r() * 0.3, ang + (r() - 0.5) * 0.4, '2,3,8', 0.35 + r() * 0.3);
    }
    b.globalCompositeOperation = 'lighter';

    // Emission and reflection nebulae
    const neb = [[W * 0.2, H * 0.62, '255,70,110'], [W * 0.62, H * 0.14, '255,90,120'], [W * 0.82, H * 0.78, '90,140,255']];
    for (const [nx, ny, col] of neb) {
      for (let k = 0; k < 9; k++) ellBlob(b, nx + gauss(r) * m * 0.08, ny + gauss(r) * m * 0.06, m * (0.03 + r() * 0.07), 0.5 + r() * 0.5, r() * 3, col, 0.025 + r() * 0.03);
    }

    // Field stars, colour by temperature, brightness by a power law
    for (let i = 0; i < 2600; i++) {
      const mag = Math.pow(r(), 4);
      b.fillStyle = `rgba(${STAR_COLS[Math.floor(r() * 6)]},${0.2 + mag * 0.8})`;
      b.beginPath(); b.arc(r() * W, r() * H, 0.3 + mag * 1.3, 0, Math.PI * 2); b.fill();
    }
    // A few bright stars with diffraction spikes
    for (let i = 0; i < 12; i++) {
      const x = r() * W, y = r() * H, col = STAR_COLS[Math.floor(r() * 6)], s = 1.2 + r() * 1.2;
      blob(b, x, y, s * 7, col, 0.35);
      b.fillStyle = `rgba(${col},0.35)`;
      b.fillRect(x - s * 9, y - 0.4, s * 18, 0.8);
      b.fillRect(x - 0.4, y - s * 9, 0.8, s * 18);
      b.fillStyle = '#fff'; b.beginPath(); b.arc(x, y, s * 0.8, 0, Math.PI * 2); b.fill();
    }
    // Open clusters (young, blue)
    for (const [ox, oy] of [[W * 0.36, H * 0.22], [W * 0.08, H * 0.4]]) {
      blob(b, ox, oy, m * 0.06, '140,170,255', 0.06);
      for (let i = 0; i < 36; i++) {
        const x = ox + gauss(r) * m * 0.03, y = oy + gauss(r) * m * 0.025, s = 0.5 + Math.pow(r(), 3) * 1.6;
        blob(b, x, y, s * 4, '170,195,255', 0.25);
        b.fillStyle = 'rgba(225,235,255,0.95)'; b.beginPath(); b.arc(x, y, s * 0.7, 0, Math.PI * 2); b.fill();
      }
    }
    // Globular clusters (old, golden)
    for (const [gx, gy, sz] of [[W * 0.55, H * 0.9, 1], [W * 0.93, H * 0.32, 0.7]]) {
      blob(b, gx, gy, m * 0.03 * sz, '255,225,180', 0.22);
      for (let i = 0; i < 520 * sz; i++) {
        const rr = Math.abs(gauss(r)) * m * 0.018 * sz, th = r() * Math.PI * 2;
        b.fillStyle = `rgba(255,232,200,${0.15 + r() * 0.45})`;
        b.fillRect(gx + Math.cos(th) * rr, gy + Math.sin(th) * rr, 0.7, 0.7);
      }
    }
    // Distant galaxies, and one large spiral neighbour
    for (let i = 0; i < 14; i++) {
      const x = r() * W, y = r() * H, s = 3 + r() * 9, rot = r() * Math.PI;
      ellBlob(b, x, y, s, 0.25 + r() * 0.5, rot, r() < 0.5 ? '230,220,255' : '255,230,200', 0.2);
      b.fillStyle = 'rgba(255,245,230,0.6)'; b.fillRect(x - 0.5, y - 0.5, 1, 1);
    }
    const anx = mobile ? W * 0.82 : W * 0.12, any = mobile ? H * 0.07 + 70 : H * 0.83;
    ellBlob(b, anx, any, m * 0.1, 0.28, -0.6, '200,200,255', 0.07);
    ellBlob(b, anx, any, m * 0.05, 0.3, -0.6, '255,230,200', 0.16);
    ellBlob(b, anx, any, m * 0.012, 0.5, -0.6, '255,240,220', 0.6);
    ellBlob(b, anx + m * 0.04, any - m * 0.035, m * 0.008, 0.7, 0, '255,235,215', 0.3);
    b.globalCompositeOperation = 'source-over';
  }

  // A face-on spiral galaxy, ours, for the opening shot
  let GAL_SUN = { x: 0, y: 0 };
  let galaxyBuilt = false;
  function buildGalaxy() {
    const S = 1100, c = S / 2;
    galaxy.width = galaxy.height = S;
    const g = galaxy.getContext('2d');
    const r = mulberry32(99);
    g.globalCompositeOperation = 'lighter';
    blob(g, c, c, S * 0.5, '150,165,230', 0.08);
    const b = 0.34, r0 = 30, rMax = S * 0.46;
    for (let arm = 0; arm < 4; arm++) {
      const off = arm * Math.PI / 2, major = arm % 2 === 0, N = major ? 11000 : 5000;
      for (let i = 0; i < N; i++) {
        const t = Math.pow(r(), 0.85);
        const rr = r0 + t * (rMax - r0);
        const th = off + Math.log(rr / r0) / b + gauss(r) * 0.22;
        const sc = gauss(r) * rr * 0.2;
        const x = c + Math.cos(th) * rr - Math.sin(th) * sc, y = c + Math.sin(th) * rr + Math.cos(th) * sc;
        const q = r();
        const col = q < 0.62 ? '190,210,255' : q < 0.85 ? '255,255,255' : q < 0.93 ? '255,225,190' : '255,120,150';
        g.fillStyle = `rgba(${col},${(0.12 + r() * 0.4) * (1 - t * 0.55)})`;
        const s = 0.6 + r() * (q > 0.93 ? 2.2 : 1.4);
        g.fillRect(x, y, s, s);
      }
    }
    for (let arm = 0; arm < 4; arm += 2) {
      for (let i = 0; i < 60; i++) {
        const rr = r0 + r() * (rMax - r0), th = arm * Math.PI / 2 + Math.log(rr / r0) / b;
        blob(g, c + Math.cos(th) * rr, c + Math.sin(th) * rr, rr * 0.16, '150,175,255', 0.05);
      }
    }
    for (let i = 0; i < 9000; i++) {
      const rr = Math.abs(gauss(r)) * rMax * 0.7, th = r() * Math.PI * 2;
      g.fillStyle = `rgba(255,236,210,${0.08 + r() * 0.25})`;
      g.fillRect(c + Math.cos(th) * rr, c + Math.sin(th) * rr, 0.8, 0.8);
    }
    ellBlob(g, c, c, S * 0.16, 0.7, 0.4, '255,210,150', 0.35);
    blob(g, c, c, S * 0.07, '255,236,200', 0.7);
    // dust lanes trailing the arms
    g.globalCompositeOperation = 'destination-out';
    for (let arm = 0; arm < 4; arm += 2) {
      for (let i = 0; i < 2600; i++) {
        const rr = r0 * 2 + r() * (rMax - r0 * 2);
        const th = arm * Math.PI / 2 + Math.log(rr / r0) / b - 0.2 + gauss(r) * 0.06;
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.beginPath(); g.arc(c + Math.cos(th) * rr, c + Math.sin(th) * rr, 1.5 + r() * 4, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    const rs = S * 0.3, ths = Math.log(rs / r0) / b + 0.35;
    GAL_SUN = { x: c + Math.cos(ths) * rs, y: c + Math.sin(ths) * rs };
  }

  // --- The real solar system ------------------------------------------------
  // Mean longitude at J2000 (deg) and daily motion: good enough for placing planets today.
  const PLANETS = [
    { n: 'MERCURY', a: 0.387, L: 252.25, w: 4.09233445, c: '#a9a59e', s: 1.5 },
    { n: 'VENUS', a: 0.723, L: 181.98, w: 1.60213034, c: '#efe2bd', s: 2.6 },
    { n: 'EARTH', a: 1, L: 100.46, w: 0.9856091, c: '#6fa8ff', s: 2.4 },
    { n: 'MARS', a: 1.524, L: 355.43, w: 0.5240384, c: '#d0683f', s: 2.0 },
    { n: 'JUPITER', a: 5.203, L: 34.35, w: 0.08308529, c: '#d9b892', s: 4.4 },
    { n: 'SATURN', a: 9.537, L: 50.08, w: 0.03344414, c: '#e6d3a2', s: 3.8 },
    { n: 'URANUS', a: 19.19, L: 314.06, w: 0.01172834, c: '#a9e3e8', s: 3.0 },
    { n: 'NEPTUNE', a: 30.07, L: 304.35, w: 0.00598103, c: '#5d82e0', s: 3.0 },
  ];
  const helioLon = (p) => ((p.L + p.w * (Date.now() / 86400000 - 10957.5)) % 360) * DEG;

  function sunScreenDir(rot) {
    const L = lightDir(rot);
    const m = Math.hypot(L.x, L.y);
    return m < 0.25 ? { x: -0.75, y: -0.66 } : { x: L.x / m, y: L.y / m };
  }

  function systemGeom(rot, k) {
    const d = sunScreenDir(rot);
    const tx = d.x > 0 ? (RIGHT - CX) / d.x : d.x < 0 ? -CX / d.x : Infinity;
    const top = mobile ? TOPB - 40 : 0, bot = mobile ? BOTB + 40 : H;
    const ty = d.y > 0 ? (bot - CY) / d.y : d.y < 0 ? (top - CY) / d.y : Infinity;
    const dist = Math.min(tx, ty) * 0.97 * k;
    const Sx = CX + d.x * dist, Sy = CY + d.y * dist, q = 0.4;
    const ex = CX - Sx, ey = CY - Sy;
    return { Sx, Sy, q, rx: Math.hypot(ex, ey / q), phiE: Math.atan2(ey / q, ex) };
  }

  function drawSun(x, y, k, a) {
    const m = Math.min(W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= a;
    blob(ctx, x, y, m * (0.25 + 0.45 * k), '255,170,90', 0.09);
    blob(ctx, x, y, m * (0.08 + 0.18 * k), '255,214,160', 0.28);
    blob(ctx, x, y, 10 + 26 * k, '255,248,230', 0.95);
    ctx.fillStyle = `rgba(255,236,210,${0.12 * k})`;
    ctx.fillRect(x - m * 0.5 * k, y - 0.6, m * k, 1.2);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath(); ctx.arc(x, y, 3 + 6 * k, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSolar(rot, k, a, labelA, orbitA, showEarthDot) {
    const g = systemGeom(rot, k);
    const lamE = helioLon(PLANETS[2]);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.lineWidth = 1;
    for (const p of PLANETS) {
      if (p.n === 'EARTH' && !showEarthDot) continue;
      ctx.beginPath();
      ctx.ellipse(g.Sx, g.Sy, p.a * g.rx, p.a * g.rx * g.q, 0, 0, Math.PI * 2);
      ctx.strokeStyle = p.n === 'EARTH' ? `rgba(120,170,255,${orbitA * 1.6})` : `rgba(170,190,255,${orbitA})`;
      ctx.stroke();
    }
    drawSun(g.Sx, g.Sy, Math.min(1, k * 1.2), 1);
    ctx.font = '500 9.5px "JetBrains Mono", monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.textAlign = 'left';
    for (const p of PLANETS) {
      if (p.n === 'EARTH') continue;
      const phi = g.phiE + (helioLon(p) - lamE);
      const x = g.Sx + p.a * g.rx * Math.cos(phi), y = g.Sy + p.a * g.rx * g.q * Math.sin(phi);
      if (x < -20 || y < -20 || x > W + 20 || y > (mobile ? BOTB + 200 : H) + 20) continue;
      if (Math.hypot(x - CX, y - CY) < R * 1.25 && k > 0.95) continue; // hidden by Earth up close
      const s = p.s;
      blob(ctx, x, y, s * 3.5, '255,255,255', 0.12);
      const dx = g.Sx - x, dy = g.Sy - y, dm = Math.hypot(dx, dy) || 1;
      const sg = ctx.createLinearGradient(x + dx / dm * s, y + dy / dm * s, x - dx / dm * s, y - dy / dm * s);
      sg.addColorStop(0, p.c); sg.addColorStop(1, '#0b0b12');
      if (p.n === 'SATURN') {
        ctx.strokeStyle = 'rgba(230,214,170,0.7)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.ellipse(x, y, s * 2.3, s * 0.7, -0.35, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      if (labelA > 0.01) {
        ctx.fillStyle = `rgba(200,215,240,${0.55 * labelA})`;
        ctx.fillText(p.n, x + s + 6, y + 3);
      }
    }
    if (showEarthDot) {
      blob(ctx, CX, CY, 14, '110,170,255', 0.55);
      ctx.fillStyle = '#8fc0ff';
      ctx.beginPath(); ctx.arc(CX, CY, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return g;
  }

  function drawGalaxyStage(p) {
    const pa = 0.4, e = ease(clamp01(p / pa));
    const c = galaxy.width / 2;
    const s0 = (1.05 * Math.min(W, H)) / galaxy.width, s = s0 * Math.pow(80, e);
    const m0 = new DOMMatrix().scale(s).rotate(-28).scale(1, 0.58).translate(-c, -c);
    const v = m0.transformPoint(new DOMPoint(GAL_SUN.x, GAL_SUN.y));
    const midY = mobile ? CY : H / 2;
    const sp = { x: lerp(W / 2 + v.x, CX, e), y: lerp(midY + v.y, CY, e) };
    const alpha = p < 0.24 ? 1 : Math.max(0, 1 - (p - 0.24) / 0.14);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(sp.x - v.x, sp.y - v.y);
    ctx.scale(s, s);
    ctx.rotate(-28 * DEG);
    ctx.scale(1, 0.58);
    ctx.drawImage(galaxy, -c, -c);
    ctx.restore();
    const ma = alpha * clamp01(1 - (p - 0.1) / 0.1) * clamp01(p / 0.04);
    if (ma > 0) {
      ctx.save();
      ctx.globalAlpha = ma;
      ctx.strokeStyle = '#fff4b0'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sp.x + 9, sp.y - 6); ctx.lineTo(sp.x + 34, sp.y - 26); ctx.stroke();
      ctx.fillStyle = '#fff4b0';
      ctx.font = '600 12px "Chakra Petch", sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillText('YOU ARE HERE', sp.x + 38, sp.y - 26);
      ctx.font = '500 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255,244,200,0.7)';
      ctx.fillText('THE SUN · ORION ARM', sp.x + 38, sp.y - 12);
      ctx.restore();
    }
  }

  function drawCaption(p) {
    const caps = [
      [0.02, 0.27, 'THE MILKY WAY', '100,000 LIGHT-YEARS ACROSS · SOME 200 BILLION STARS'],
      [0.33, 0.6, 'THE SOLAR SYSTEM', 'ONE STAR · EIGHT PLANETS · TODAY\'S REAL POSITIONS'],
      [0.66, 0.9, 'THE PALE BLUE DOT', 'EVERYTHING YOU HAVE EVER ACHIEVED HAPPENED HERE'],
    ];
    for (const [a0, a1, t1, t2] of caps) {
      const a = clamp01((p - a0) / 0.05) * clamp01((a1 - p) / 0.05);
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      const y = mobile ? TOPB + 6 : H * 0.14;
      const x = mobile ? W / 2 : (RIGHT + W) / 2 > W * 0.6 ? W / 2 : W / 2;
      ctx.fillStyle = '#eafcff';
      ctx.font = `600 ${mobile ? 17 : 24}px "Chakra Petch", sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = mobile ? '5px' : '9px';
      ctx.fillText(t1, x, y);
      ctx.font = `500 ${mobile ? 9 : 11}px "JetBrains Mono", monospace`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
      ctx.fillStyle = 'rgba(200,220,240,0.7)';
      ctx.fillText(t2, x, y + (mobile ? 20 : 26));
      ctx.restore();
    }
    const sa = clamp01((0.88 - p) / 0.06) * clamp01(p / 0.06) * 0.45;
    if (sa > 0) {
      ctx.save();
      ctx.globalAlpha = sa;
      ctx.textAlign = 'center';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillStyle = '#cfe6ff';
      ctx.fillText('CLICK OR PRESS ANY KEY TO SKIP', W / 2, (mobile ? BOTB : H - 28));
      ctx.restore();
    }
  }

  // --- Constellation of achieved goals -------------------------------------
  let constel = [];
  let orbitPts = [];
  function layoutOrbits() {
    const arr = [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.loggedAt || 0) - (b.loggedAt || 0));
    const step = Math.min(0.62, (Math.PI * 2 * 0.9) / Math.max(1, arr.length));
    constel = arr.map((it, i) => ({ it, a0: -2.3 + i * step, rf: 1.4 + 0.42 * ((i * 0.618034) % 1) }));
  }
  function starPos(m, t) {
    const a = m.a0 + (reduceMotion ? 0 : t * 0.0000035);
    const x = CX + Math.cos(a) * m.rf * R, y = CY + Math.sin(a) * m.rf * R * 0.84;
    return { x: Math.max(18, Math.min(RIGHT - 18, x)), y: Math.max(TOPB + 10, Math.min(BOTB - 10, y)) };
  }

  function drawStar(cat, x, y, size, alpha, lit) {
    const c = CATS[cat];
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * (lit ? 2.6 : 1.9));
    g.addColorStop(0, c.color + 'aa');
    g.addColorStop(0.3, c.color + '33');
    g.addColorStop(1, c.color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
    const sl = size * (lit ? 2.4 : 1.7);
    const sp = ctx.createLinearGradient(x - sl, y, x + sl, y);
    sp.addColorStop(0, c.color + '00'); sp.addColorStop(0.5, '#ffffffcc'); sp.addColorStop(1, c.color + '00');
    ctx.fillStyle = sp; ctx.fillRect(x - sl, y - 0.5, sl * 2, 1);
    const sv = ctx.createLinearGradient(x, y - sl, x, y + sl);
    sv.addColorStop(0, c.color + '00'); sv.addColorStop(0.5, '#ffffffcc'); sv.addColorStop(1, c.color + '00');
    ctx.fillStyle = sv; ctx.fillRect(x - 0.5, y - sl, 1, sl * 2);
    ctx.globalCompositeOperation = 'source-over';
    const gs = size * 0.95;
    ctx.translate(x - gs / 2, y - gs / 2);
    ctx.scale(gs / 24, gs / 24);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.stroke(c.path);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, lit ? 1.8 : 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawConstellation(t, milanPt) {
    if (!constel.length) return;
    const pts = constel.map((m) => ({ m, ...starPos(m, t) }));
    ctx.save();
    // the lines between goals, in the order you achieved them
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(180,205,255,0.32)';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    // the thread that ties the first goal back to where you stand
    const first = pts[0];
    let ox, oy;
    if (milanPt) { [ox, oy] = milanPt; }
    else { const a = Math.atan2(first.y - CY, first.x - CX); ox = CX + Math.cos(a) * R; oy = CY + Math.sin(a) * R; }
    const tg = ctx.createLinearGradient(ox, oy, first.x, first.y);
    tg.addColorStop(0, 'rgba(255,236,170,0.75)');
    tg.addColorStop(1, 'rgba(255,236,170,0.15)');
    ctx.strokeStyle = tg;
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = reduceMotion ? 0 : -t * 0.01;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(first.x, first.y); ctx.stroke();
    ctx.restore();

    const newest = pts[pts.length - 1].m.it.id;
    for (const p of pts) {
      const it = p.m.it;
      const inFilter = filter === 'all' || it.category === filter;
      const lit = litId === it.id || hoverId === it.id;
      let size = 15;
      if (it.id === newest && !reduceMotion) size *= 1 + 0.12 * Math.sin(t * 0.003);
      let alpha = inFilter ? 1 : 0.25;
      if (lit) { size *= 1.4; alpha = 1; }
      if (burst && burst.id === it.id) {
        const k = (t - burst.t0) / 1800;
        if (k < 1) {
          ctx.save();
          ctx.strokeStyle = CATS[it.category].color;
          ctx.globalAlpha *= 1 - k;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 8 + k * 60, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          size *= 1 + (1 - k) * 0.8;
        } else burst = null;
      }
      drawStar(it.category, p.x, p.y, size, alpha, lit);
      if (lit) {
        ctx.save();
        ctx.strokeStyle = CATS[it.category].color;
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const a0 = i * Math.PI / 2 + t * 0.002;
          ctx.beginPath(); ctx.arc(p.x, p.y, size * 1.15, a0, a0 + 0.8); ctx.stroke();
        }
        ctx.restore();
      }
      orbitPts.push({ id: it.id, x: p.x, y: p.y, r: Math.max(14, size), front: true });
    }
  }

  // --- The Moon -------------------------------------------------------------
  function moonPos(t) {
    const a = 0.8 + (reduceMotion ? 0 : t * 0.000006);
    const rr = R * 2.05;
    const ex = Math.cos(a) * rr, ey = Math.sin(a) * rr * 0.28, tl = -0.18;
    return { x: CX + ex * Math.cos(tl) - ey * Math.sin(tl), y: CY + ex * Math.sin(tl) + ey * Math.cos(tl), front: Math.sin(a) > 0 };
  }
  function drawMoon(t, rot, front) {
    const m = moonPos(t);
    if (m.front !== front) return;
    const r = Math.max(3, R * 0.11);
    const d = sunScreenDir(rot);
    ctx.save();
    const g = ctx.createLinearGradient(m.x + d.x * r, m.y + d.y * r, m.x - d.x * r, m.y - d.y * r);
    g.addColorStop(0, '#d9d5cc'); g.addColorStop(0.45, '#9c988f'); g.addColorStop(0.58, '#16161b'); g.addColorStop(1, '#0b0b0f');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(60,60,70,0.25)';
    ctx.beginPath(); ctx.arc(m.x - r * 0.3, m.y - r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.arc(m.x + r * 0.25, m.y + r * 0.3, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // --- Earth ----------------------------------------------------------------
  const drag = { on: false, x: 0, y: 0, lon: 0, lat: 0, lastMove: -1e9 };
  const offset = { lon: 0, lat: 0 };

  function currentRotation(t) {
    const sway = reduceMotion ? 0 : 38 * Math.sin(t * 0.00009);
    if (!drag.on && t - drag.lastMove > 3500) {
      offset.lon *= 0.985; offset.lat *= 0.985;
    }
    return [-MILAN.lon + sway + offset.lon, -(MILAN.lat - 20) + offset.lat, 0];
  }

  function lightDir(rot) {
    const p = d3.geoRotation(rot)([sun.lon, sun.lat]);
    const l = p[0] * DEG, f = p[1] * DEG;
    return { x: Math.cos(f) * Math.sin(l), y: -Math.sin(f), z: Math.cos(f) * Math.cos(l) };
  }

  function drawPlanet(t, rot, R) {
    const L = lightDir(rot);
    const lx = CX + L.x * R * 0.55, ly = CY + L.y * R * 0.55;

    // thin blue atmosphere, brighter toward the sun
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(CX, CY, R * 0.97, CX, CY, R * 1.12);
    halo.addColorStop(0, 'rgba(110,170,255,0.5)');
    halo.addColorStop(0.35, 'rgba(80,140,255,0.14)');
    halo.addColorStop(1, 'rgba(80,140,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(CX, CY, R * 1.12, 0, Math.PI * 2); ctx.fill();
    blob(ctx, CX + L.x * R, CY + L.y * R, R * 0.9, '150,200,255', 0.18);
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip();

    const oc = ctx.createRadialGradient(lx, ly, R * 0.05, CX, CY, R * 1.05);
    oc.addColorStop(0, '#2f78bd');
    oc.addColorStop(0.4, '#14508f');
    oc.addColorStop(0.75, '#0a2d5e');
    oc.addColorStop(1, '#041633');
    ctx.fillStyle = oc;
    ctx.fillRect(CX - R, CY - R, R * 2, R * 2);

    for (const tile of landTiles) {
      ctx.beginPath(); path(tile.f);
      ctx.fillStyle = tile.fill;
      ctx.fill();
    }
    ctx.beginPath(); path(land);
    const ls = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 1.4);
    ls.addColorStop(0, 'rgba(255,250,230,0.16)');
    ls.addColorStop(1, 'rgba(255,250,230,0)');
    ctx.fillStyle = ls;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,40,30,0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // sun glint on the ocean
    blob(ctx, lx, ly, R * 0.22, '255,255,240', 0.14 * Math.max(0, L.z));

    // drifting clouds
    const drift = reduceMotion ? 0 : t * 0.0012;
    const cs = Math.max(8, Math.round(R * 0.7));
    if (cloudLayer.width !== cs) { cloudLayer.width = cloudLayer.height = cs; }
    const cc = cloudLayer.getContext('2d');
    cc.clearRect(0, 0, cs, cs);
    cloudProj.scale(cs / 2).translate([cs / 2, cs / 2]).rotate([rot[0] + drift, rot[1], rot[2]]);
    const cpath = d3.geoPath(cloudProj, cc);
    clouds.forEach((batch, i) => {
      cc.beginPath();
      for (const c of batch) cpath(c);
      cc.fillStyle = `rgba(250,252,255,${0.3 + i * 0.15})`;
      cc.fill();
    });
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha *= 0.85;
    ctx.drawImage(cloudLayer, CX - R, CY - R, R * 2, R * 2);
    ctx.globalAlpha /= 0.85;

    if (italy) {
      ctx.beginPath(); path(italy);
      ctx.strokeStyle = 'rgba(255,226,150,0.75)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // the real night side, with a soft terminator
    for (const c of nightCircles) {
      ctx.beginPath(); path(c);
      ctx.fillStyle = 'rgba(2,4,14,0.19)';
      ctx.fill();
    }
    // city lights on the night side
    if (nightCircles[2]) {
      ctx.save();
      ctx.beginPath(); path(nightCircles[2]); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const center = [-rot[0], -rot[1]];
      for (const c of CITIES) {
        if (d3.geoDistance(c, center) > Math.PI / 2 - 0.05) continue;
        const [x, y] = proj(c);
        blob(ctx, x, y, Math.max(3, R * 0.035), '255,196,110', 0.55);
      }
      ctx.restore();
    }

    const limb = ctx.createRadialGradient(lx, ly, R * 0.5, CX, CY, R * 1.02);
    limb.addColorStop(0, 'rgba(0,0,10,0)');
    limb.addColorStop(1, 'rgba(0,2,14,0.55)');
    ctx.fillStyle = limb;
    ctx.fillRect(CX - R, CY - R, R * 2, R * 2);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(CX, CY, R - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,180,255,0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawMilan(t, rot) {
    const center = [-rot[0], -rot[1]];
    const dist = d3.geoDistance([MILAN.lon, MILAN.lat], center);
    if (dist > Math.PI / 2 - 0.04) return null;
    const fade = Math.min(1, (Math.PI / 2 - 0.04 - dist) / 0.25);
    const base = ctx.globalAlpha;

    ctx.save();
    ctx.globalAlpha = base * fade;
    for (const k of [0, 0.5]) {
      const ph = (((reduceMotion ? 0.3 : t / 3200) + k) % 1);
      ctx.beginPath();
      path(d3.geoCircle().center([MILAN.lon, MILAN.lat]).radius(0.5 + ph * 10).precision(4)());
      ctx.strokeStyle = `rgba(255,236,170,${(1 - ph) * 0.8})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    const [x, y] = proj([MILAN.lon, MILAN.lat]);
    if (milanNight) blob(ctx, x, y, 16, '255,220,140', 0.8);

    const top = y - Math.max(60, R * 0.7);
    const beam = ctx.createLinearGradient(0, y, 0, top);
    beam.addColorStop(0, 'rgba(255,240,170,0.9)');
    beam.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(x - 0.6, top, 1.2, y - top);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#fff4b0';
    ctx.shadowColor = '#ffd27a';
    ctx.shadowBlur = 10;
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();

    const ly = top + 6;
    const sub = 'YOU ARE HERE · 45.46°N 9.19°E';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    const wSub = ctx.measureText(sub).width;
    let mode = 'right';
    if (x + 18 + wSub > RIGHT - 8) mode = x - 18 - wSub > 8 ? 'left' : 'top';
    let tx = x, y1 = ly + 5, y2 = ly + 20;
    if (mode === 'top') {
      ctx.textAlign = 'center';
      tx = Math.max(wSub / 2 + 8, Math.min(W - wSub / 2 - 8, x));
      y1 = top - 18; y2 = top - 4;
    } else {
      const dir = mode === 'left' ? -1 : 1;
      tx = x + dir * 18;
      ctx.textAlign = mode === 'left' ? 'right' : 'left';
      ctx.strokeStyle = 'rgba(255,240,170,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + dir * 14, ly); ctx.stroke();
    }
    ctx.fillStyle = '#fff4b0';
    ctx.font = '700 15px "Chakra Petch", sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillText('MILANO', tx, y1);
    ctx.font = '500 10px "JetBrains Mono", monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    ctx.fillStyle = 'rgba(255,244,200,0.75)';
    ctx.fillText(sub, tx, y2);
    ctx.restore();
    return [x, y];
  }

  function drawStars(t) {
    const tt = reduceMotion ? 0 : t * 0.001;
    for (const s of twinklers) {
      const a = 0.45 + 0.55 * Math.abs(Math.sin(tt * s.sp + s.ph));
      ctx.fillStyle = `rgba(${s.hue},${a})`;
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    if (reduceMotion) return;
    if (!shooting && t > nextShoot) {
      const r = Math.random;
      shooting = { x: W * (0.2 + r() * 0.6), y: H * r() * 0.35, vx: -(0.5 + r() * 0.5), vy: 0.25 + r() * 0.2, t0: t, life: 700 + r() * 400 };
    }
    if (shooting) {
      const k = (t - shooting.t0) / shooting.life;
      if (k >= 1) { shooting = null; nextShoot = t + 12000 + Math.random() * 20000; return; }
      const d = (t - shooting.t0);
      const x = shooting.x + shooting.vx * d, y = shooting.y + shooting.vy * d;
      const g = ctx.createLinearGradient(x, y, x - shooting.vx * 140, y - shooting.vy * 140);
      g.addColorStop(0, `rgba(255,255,255,${0.8 * (1 - k)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - shooting.vx * 140, y - shooting.vy * 140); ctx.stroke();
    }
  }

  // --- Intro: from the galaxy down to Milan ---------------------------------
  const INTRO_MS = 6200;
  let introT0 = performance.now();
  let introDone = reduceMotion;
  let introClass = null;
  function skipIntro() { introDone = true; }
  function replayIntro() { introDone = false; introT0 = performance.now(); }

  let lastFrame = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (t - lastFrame < 30) return; // ~30 fps is plenty for a wallpaper
    lastFrame = t;
    const p = introDone ? 1 : Math.min(1, (t - introT0) / INTRO_MS);
    if (p >= 1) introDone = true;
    const inIntro = p < 0.88;
    if (inIntro !== introClass) { introClass = inIntro; document.body.classList.toggle('intro', inIntro); }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (p < 0.45) {
      ctx.fillStyle = `rgba(0,0,2,${(1 - p / 0.45) * 0.8})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (mobile) ctx.translate(0, -window.scrollY);

    drawStars(t);
    const rot = currentRotation(t);
    proj.rotate(rot);
    orbitPts = [];

    if (p < 0.4) drawGalaxyStage(p);

    // zoom of the solar system: k0 shows all 8 orbits, 1 is the final view
    const gF = systemGeom(rot, 1);
    const k0 = (0.42 * Math.min(W, H)) / (30 * gF.rx);
    const es = ease(clamp01((p - 0.3) / 0.55));
    const k = Math.pow(k0, 1 - es);
    const solA = clamp01((p - 0.22) / 0.12);
    const eg = ease(clamp01((p - 0.6) / 0.4));
    const Rg = R * Math.pow(0.01, 1 - eg);
    if (solA > 0) drawSolar(rot, k, solA, 1 - clamp01((p - 0.55) / 0.2), lerp(0.3, 0.06, es), Rg < 3);
    if (solA > 0 && p < 0.62) {
      const la = clamp01((p - 0.34) / 0.06) * clamp01((0.62 - p) / 0.05);
      ctx.save();
      ctx.globalAlpha = la;
      ctx.fillStyle = '#b9d6ff';
      ctx.font = '600 11px "Chakra Petch", sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.textAlign = 'left';
      ctx.fillText('EARTH · YOU ARE HERE', CX + 12, CY - 10);
      ctx.restore();
    }

    const uiA = clamp01((p - 0.86) / 0.14);
    if (uiA > 0) { ctx.save(); ctx.globalAlpha = uiA; drawMoon(t, rot, false); ctx.restore(); }
    if (Rg >= 3) {
      proj.scale(Rg);
      drawPlanet(t, rot, Rg);
      proj.scale(R);
    }
    if (uiA > 0) {
      ctx.save();
      ctx.globalAlpha = uiA;
      drawMoon(t, rot, true);
      const mp = drawMilan(t, rot);
      drawConstellation(t, mp);
      ctx.restore();
    }
    if (!introDone) drawCaption(p);
    if (hoverId) positionTooltip();
  }

  // --- Pointer interaction --------------------------------------------------
  let hoverId = null;
  let pointer = { x: -1, y: -1 };

  function hit(x, y) {
    let best = null, bd = Infinity;
    for (const p of orbitPts) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r && d < bd) {
        // a glyph behind the planet is hidden by it
        if (!p.front && Math.hypot(p.x - CX, p.y - CY) < R) continue;
        best = p; bd = d;
      }
    }
    return best;
  }

  function positionTooltip() {
    const p = orbitPts.find((o) => o.id === hoverId);
    const tip = $('tooltip');
    if (!p) { tip.hidden = true; return; }
    const sy = mobile ? p.y - window.scrollY : p.y;
    tip.style.left = `${Math.min(p.x, W - 280)}px`;
    tip.style.top = `${sy}px`;
  }

  function showTooltip(id) {
    const it = items.find((x) => x.id === id);
    const tip = $('tooltip');
    if (!it) { tip.hidden = true; return; }
    tip.textContent = '';
    const a = document.createElement('div'); a.className = 't-title'; a.textContent = it.title;
    const b = document.createElement('div'); b.className = 't-meta';
    b.textContent = `${CATS[it.category].label.toUpperCase()} · ${fmtDay(it.date)} · ${agoText(it.date)}`;
    b.style.color = CATS[it.category].color;
    tip.append(a, b);
    tip.hidden = false;
    positionTooltip();
  }

  const docY = (e) => e.clientY + (mobile ? window.scrollY : 0);

  canvas.addEventListener('pointerdown', (e) => {
    if (!introDone) { skipIntro(); return; }
    const x = e.clientX, y = docY(e);
    const h = hit(x, y);
    if (h) {
      openId = h.id; filter = 'all'; renderLog();
      const li = document.querySelector(`.entry[data-id="${CSS.escape(h.id)}"]`);
      if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    if (Math.hypot(x - CX, y - CY) < R * 1.05) {
      drag.on = true; drag.x = e.clientX; drag.y = e.clientY;
      drag.lon = offset.lon; drag.lat = offset.lat;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: docY(e) };
    if (!introDone) return;
    if (drag.on) {
      const k = 70 / R;
      offset.lon = drag.lon + (e.clientX - drag.x) * k;
      offset.lat = Math.max(-60, Math.min(60, drag.lat - (e.clientY - drag.y) * k));
      drag.lastMove = performance.now();
      return;
    }
    const h = hit(pointer.x, pointer.y);
    const id = h ? h.id : null;
    if (id !== hoverId) {
      hoverId = id;
      if (id) showTooltip(id); else $('tooltip').hidden = true;
      setLit(id);
    }
    canvas.style.cursor = h ? 'pointer' : (Math.hypot(pointer.x - CX, pointer.y - CY) < R ? 'grab' : 'default');
  });
  const endDrag = () => { if (drag.on) { drag.on = false; drag.lastMove = performance.now(); canvas.style.cursor = 'grab'; } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; $('tooltip').hidden = true; setLit(null); } });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { items = load(); layoutOrbits(); renderLog(); } });

  updateSun();
  setInterval(updateSun, 60000);
  tick();
  setInterval(tick, 1000);
  renderLog();
  save();
  layout();
  requestAnimationFrame(frame);
  connectCloud();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastFrame = 0; });
})();
