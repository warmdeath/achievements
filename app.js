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
    $('storeNote').textContent = storageOK ? 'Saved in this browser' : 'Storage blocked — export to keep';
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
      if (it) Object.assign(it, { title, date, note, category });
      toast('DISCOVERY AMENDED');
    } else {
      const it = { id: uid(), title, date, category, note, loggedAt: Date.now() };
      items.push(it);
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
    const tag = (e.target.tagName || '').toLowerCase();
    if (dlg.open || tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openDialog(); }
    if (e.key === '/') { e.preventDefault(); document.querySelector('.scan input').focus(); }
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
        items.push(x); have.add(x.id); added++;
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
  // The sky
  // ---------------------------------------------------------------------------
  const canvas = $('sky');
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  let W = 0, H = 0, DPR = 1, CX = 0, CY = 0, R = 100, mobile = false;
  let planetInfo = '';
  let milanNight = false;
  let burst = null;

  const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(proj, ctx);
  const topo = window.WORLD_110M;
  const countries = topojson.feature(topo, topo.objects.countries);
  const land = topojson.merge(topo, topo.objects.countries.geometries);
  const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
  const italy = countries.features.find((f) => f.properties && f.properties.name === 'Italy');
  const graticule = d3.geoGraticule10();

  // Twinkling stars and shooting stars live on the animated layer.
  const rnd = mulberry32(20081);
  const twinklers = Array.from({ length: 110 }, () => ({
    x: rnd(), y: rnd(), r: 0.6 + rnd() * 1.4, ph: rnd() * Math.PI * 2, sp: 0.4 + rnd() * 1.6,
    hue: rnd() < 0.2 ? '255,200,240' : rnd() < 0.4 ? '200,250,255' : '255,255,255',
  }));
  let shooting = null;
  let nextShoot = performance.now() + 4000;

  function layout() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    mobile = W <= 860;
    if (mobile) {
      const sp = document.querySelector('.planet-space');
      const top = sp.offsetTop, hh = sp.offsetHeight;
      CX = W / 2; CY = top + hh / 2;
      R = Math.min(W * 0.27, hh * 0.3);
    } else {
      const panelW = document.querySelector('.log').offsetWidth + 56;
      const avail = W - panelW;
      CX = avail / 2 + 20;
      CY = H * 0.54;
      R = Math.max(90, Math.min(avail * 0.25, H * 0.29));
    }
    proj.translate([CX, CY]).scale(R);
    renderBackground();
    layoutOrbits();
  }

  function blob(b, x, y, r, rgb, a) {
    const g = b.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.45, `rgba(${rgb},${a * 0.45})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    b.fillStyle = g;
    b.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function renderBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const b = bg.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    const r = mulberry32(7);

    const base = b.createLinearGradient(0, 0, W * 0.35, H);
    base.addColorStop(0, '#0a0322');
    base.addColorStop(0.45, '#160640');
    base.addColorStop(0.75, '#1a0a33');
    base.addColorStop(1, '#04141f');
    b.fillStyle = base;
    b.fillRect(0, 0, W, H);

    // Nebulae
    b.globalCompositeOperation = 'lighter';
    const M = Math.max(W, H);
    blob(b, W * 0.78, H * 0.18, M * 0.55, '255,47,168', 0.16);
    blob(b, W * 0.25, H * 0.12, M * 0.45, '123,61,255', 0.2);
    blob(b, W * 0.1, H * 0.92, M * 0.5, '0,224,198', 0.13);
    blob(b, W * 0.58, H * 1.02, M * 0.42, '255,138,61', 0.12);
    blob(b, W * 0.5, H * 0.5, M * 0.35, '80,40,200', 0.1);
    for (let i = 0; i < 26; i++) {
      const cols = ['255,90,190', '120,90,255', '60,230,220', '255,150,90'];
      blob(b, r() * W, r() * H, M * (0.05 + r() * 0.14), cols[i % 4], 0.05 + r() * 0.05);
    }

    // Galactic dust band
    const ax = -0.1 * W, ay = H * 0.95, bx = W * 1.1, by = H * 0.05;
    const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny);
    for (let i = 0; i < 2600; i++) {
      const t = r();
      const g = (r() + r() + r() - 1.5) * H * 0.16;
      const x = ax + (bx - ax) * t + (nx / nl) * g;
      const y = ay + (by - ay) * t + (ny / nl) * g;
      b.fillStyle = `rgba(${r() < 0.5 ? '255,210,240' : '200,240,255'},${0.05 + r() * 0.18})`;
      const s = 0.4 + r() * 1.1;
      b.fillRect(x, y, s, s);
    }

    // Static stars
    b.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 520; i++) {
      const s = r() < 0.9 ? 0.5 + r() * 0.8 : 1.2 + r() * 0.8;
      b.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`;
      b.beginPath(); b.arc(r() * W, r() * H, s * 0.6, 0, Math.PI * 2); b.fill();
    }

    // A distant ringed giant
    if (mobile) gasGiant(b, W * 0.9, H * 0.08 + 60, Math.min(W, H) * 0.09);
    else gasGiant(b, W * 0.035, H * 0.64, Math.min(W, H) * 0.1);
  }

  function gasGiant(b, x, y, r) {
    b.save();
    b.translate(x, y);
    b.rotate(-0.42);
    const ring = (from, to) => {
      for (let k = 0; k < 7; k++) {
        const rx = r * (1.42 + k * 0.11);
        b.beginPath();
        b.ellipse(0, 0, rx, rx * 0.22, 0, from, to);
        b.strokeStyle = `rgba(${k % 2 ? '255,190,230' : '190,160,255'},${0.1 + (k % 3) * 0.06})`;
        b.lineWidth = r * 0.06;
        b.stroke();
      }
    };
    ring(Math.PI, Math.PI * 2);
    b.beginPath(); b.arc(0, 0, r, 0, Math.PI * 2);
    b.save(); b.clip();
    const g = b.createLinearGradient(0, -r, 0, r);
    const bands = ['#ffb3d6', '#c66ad8', '#ffbf94', '#8f45c0', '#ff9bc0', '#6c34a8', '#ffc9a8', '#4b2384'];
    bands.forEach((c, i) => g.addColorStop(i / (bands.length - 1), c));
    b.fillStyle = g;
    b.fillRect(-r, -r, r * 2, r * 2);
    const sh = b.createRadialGradient(-r * 0.45, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
    sh.addColorStop(0, 'rgba(255,255,255,0.12)');
    sh.addColorStop(0.55, 'rgba(20,0,40,0.25)');
    sh.addColorStop(1, 'rgba(8,0,24,0.92)');
    b.fillStyle = sh;
    b.fillRect(-r, -r, r * 2, r * 2);
    b.restore();
    ring(0, Math.PI);
    b.restore();
    b.globalAlpha = 1;
  }

  // --- Orbits ---------------------------------------------------------------
  let orbitMeta = [];   // [{id, ring, theta0}]
  let rings = [];       // [{rx, ry, speed}]
  let orbitPts = [];    // screen positions for hit-testing
  const TILT = -0.2;

  function layoutOrbits() {
    const arr = [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.loggedAt || 0) - (b.loggedAt || 0));
    const n = arr.length;
    const ringCount = Math.max(1, Math.min(3, Math.ceil(n / 16)));
    rings = Array.from({ length: ringCount }, (_, k) => {
      const rx = R * (1.5 + k * 0.2);
      return { rx, ry: rx * 0.24, speed: (reduceMotion ? 0.3 : 1) * 0.00003 * (1 - k * 0.22) * (k % 2 ? -1 : 1) };
    });
    const per = Array(ringCount).fill(0);
    arr.forEach((_, i) => per[i % ringCount]++);
    const seen = Array(ringCount).fill(0);
    orbitMeta = arr.map((it, i) => {
      const ring = i % ringCount;
      const idx = seen[ring]++;
      return { it, ring, theta0: (idx / per[ring]) * Math.PI * 2 + ring * 0.9 };
    });
  }

  function orbitPos(m, t) {
    const rg = rings[m.ring];
    const a = m.theta0 + t * rg.speed;
    const ex = rg.rx * Math.cos(a), ey = rg.ry * Math.sin(a);
    const c = Math.cos(TILT), s = Math.sin(TILT);
    return { x: CX + ex * c - ey * s, y: CY + ex * s + ey * c, front: Math.sin(a) > 0, depth: Math.sin(a) };
  }

  function drawRings(front) {
    ctx.save();
    for (let k = 0; k < rings.length; k++) {
      const rg = rings[k];
      ctx.beginPath();
      if (front) ctx.ellipse(CX, CY, rg.rx, rg.ry, TILT, 0, Math.PI);
      else ctx.ellipse(CX, CY, rg.rx, rg.ry, TILT, Math.PI, Math.PI * 2);
      ctx.strokeStyle = front ? 'rgba(130,240,255,0.32)' : 'rgba(130,240,255,0.14)';
      ctx.lineWidth = 1;
      ctx.setLineDash(k % 2 ? [2, 6] : []);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGlyph(cat, x, y, size, alpha, lit) {
    const c = CATS[cat];
    ctx.save();
    ctx.globalAlpha = alpha;
    // glow
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * (lit ? 2.4 : 1.6));
    g.addColorStop(0, c.color + (lit ? '88' : '55'));
    g.addColorStop(1, c.color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(x - size * 2.5, y - size * 2.5, size * 5, size * 5);
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = 'rgba(8,4,24,0.65)';
    ctx.fill(c.path, 'evenodd');
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.stroke(c.path);
    ctx.restore();
  }

  function drawDiscoveries(t, front) {
    for (const m of orbitMeta) {
      const p = orbitPos(m, t);
      if (p.front !== front) continue;
      const it = m.it;
      const inFilter = filter === 'all' || it.category === filter;
      const lit = litId === it.id || hoverId === it.id;
      let size = (front ? 16 : 13) * (0.9 + 0.15 * (p.depth + 1) / 2);
      let alpha = (front ? 1 : 0.55) * (inFilter ? 1 : 0.22);
      if (lit) { size *= 1.45; alpha = 1; }
      if (burst && burst.id === it.id) {
        const k = (t - burst.t0) / 1800;
        if (k < 1) {
          ctx.save();
          ctx.strokeStyle = CATS[it.category].color;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 8 + k * 60, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          size *= 1 + (1 - k) * 0.8;
        } else burst = null;
      }
      drawGlyph(it.category, p.x, p.y, size, alpha, lit);
      if (lit) {
        ctx.save();
        ctx.strokeStyle = CATS[it.category].color;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1;
        const rr = size * 1.05;
        for (let i = 0; i < 4; i++) {
          const a0 = i * Math.PI / 2 + t * 0.002;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, a0, a0 + 0.8); ctx.stroke();
        }
        ctx.restore();
      }
      orbitPts.push({ id: it.id, x: p.x, y: p.y, r: Math.max(12, size), front });
    }
  }

  // --- Planet ---------------------------------------------------------------
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

  function drawPlanet(t, rot) {
    const L = lightDir(rot);
    const lx = CX + L.x * R * 0.55, ly = CY + L.y * R * 0.55;

    // Atmosphere halo, brighter on the lit side
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(CX, CY, R * 0.94, CX, CY, R * 1.32);
    halo.addColorStop(0, 'rgba(120,240,255,0.55)');
    halo.addColorStop(0.18, 'rgba(150,170,255,0.25)');
    halo.addColorStop(0.45, 'rgba(255,110,210,0.1)');
    halo.addColorStop(1, 'rgba(255,110,210,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(CX, CY, R * 1.32, 0, Math.PI * 2); ctx.fill();
    const lit = ctx.createRadialGradient(CX + L.x * R, CY + L.y * R, 0, CX + L.x * R, CY + L.y * R, R * 1.1);
    lit.addColorStop(0, 'rgba(255,220,170,0.28)');
    lit.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = lit;
    ctx.beginPath(); ctx.arc(CX, CY, R * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip();

    // Ocean
    const oc = ctx.createRadialGradient(lx, ly, R * 0.05, CX, CY, R * 1.05);
    oc.addColorStop(0, '#3fe3cf');
    oc.addColorStop(0.35, '#1690a6');
    oc.addColorStop(0.7, '#0f3f7a');
    oc.addColorStop(1, '#0b1446');
    ctx.fillStyle = oc;
    ctx.fillRect(CX - R, CY - R, R * 2, R * 2);

    // Graticule
    ctx.beginPath(); path(graticule);
    ctx.strokeStyle = 'rgba(160,255,240,0.09)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Land
    const lg = ctx.createLinearGradient(CX - R, CY - R, CX + R, CY + R);
    lg.addColorStop(0, '#ffd27a');
    lg.addColorStop(0.4, '#ff9a5a');
    lg.addColorStop(0.75, '#e0567a');
    lg.addColorStop(1, '#9d3a8f');
    ctx.beginPath(); path(land);
    ctx.fillStyle = lg;
    ctx.fill();
    // land shading toward the sun
    const ls = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 1.4);
    ls.addColorStop(0, 'rgba(255,250,220,0.28)');
    ls.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = ls;
    ctx.fill();

    ctx.beginPath(); path(borders);
    ctx.strokeStyle = 'rgba(70,10,50,0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.beginPath(); path(land);
    ctx.strokeStyle = 'rgba(255,240,200,0.7)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // Italy, home sector
    if (italy) {
      ctx.beginPath(); path(italy);
      ctx.fillStyle = 'rgba(255,244,170,0.45)';
      ctx.fill();
      ctx.strokeStyle = '#fff4b0';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // Real night side, soft terminator
    for (const c of nightCircles) {
      ctx.beginPath(); path(c);
      ctx.fillStyle = 'rgba(14,4,44,0.16)';
      ctx.fill();
    }
    // On the night side the coastlines glow, like a scanner overlay
    if (nightCircles[2]) {
      ctx.save();
      ctx.beginPath(); path(nightCircles[2]); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); path(land);
      ctx.strokeStyle = 'rgba(110,240,255,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (italy) {
        ctx.beginPath(); path(italy);
        ctx.fillStyle = 'rgba(255,220,140,0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,236,170,0.9)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Limb darkening + inner rim light
    const limb = ctx.createRadialGradient(CX, CY, R * 0.6, CX, CY, R);
    limb.addColorStop(0, 'rgba(0,0,20,0)');
    limb.addColorStop(1, 'rgba(10,0,40,0.55)');
    ctx.fillStyle = limb;
    ctx.fillRect(CX - R, CY - R, R * 2, R * 2);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(CX, CY, R - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(140,250,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawHUD(t) {
    ctx.save();
    ctx.strokeStyle = 'rgba(140,255,240,0.38)';
    ctx.lineWidth = 1.2;
    const rr = R * 1.1;
    const spin = reduceMotion ? 0 : t * 0.00004;
    for (let i = 0; i < 4; i++) {
      const a0 = spin + i * Math.PI / 2 + 0.3;
      ctx.beginPath(); ctx.arc(CX, CY, rr, a0, a0 + 0.95); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(140,255,240,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = -spin * 0.6 + i * 5 * DEG;
      const len = i % 6 === 0 ? 7 : 3;
      const r0 = R * 1.15;
      ctx.moveTo(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0);
      ctx.lineTo(CX + Math.cos(a) * (r0 + len), CY + Math.sin(a) * (r0 + len));
    }
    ctx.stroke();

    // Planet designation under the world
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(234,252,255,0.92)';
    ctx.font = `600 ${Math.round(Math.max(12, R * 0.075))}px "Chakra Petch", sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    const ty = CY + R * 1.34;
    ctx.fillText('EARTH', CX, ty);
    ctx.font = '500 10px "JetBrains Mono", monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillStyle = 'rgba(196,232,244,0.6)';
    ctx.fillText(planetInfo, CX, ty + 18);
    ctx.restore();
  }

  function drawMilan(t, rot) {
    const center = [-rot[0], -rot[1]];
    const dist = d3.geoDistance([MILAN.lon, MILAN.lat], center);
    if (dist > Math.PI / 2 - 0.04) return;
    const fade = Math.min(1, (Math.PI / 2 - 0.04 - dist) / 0.25);

    ctx.save();
    ctx.globalAlpha = fade;
    // surface scan pulses
    for (const k of [0, 0.5]) {
      const ph = (((reduceMotion ? 0.3 : t / 3200) + k) % 1);
      ctx.beginPath();
      path(d3.geoCircle().center([MILAN.lon, MILAN.lat]).radius(0.5 + ph * 13).precision(4)());
      ctx.strokeStyle = `rgba(255,240,170,${(1 - ph) * 0.85})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    const [x, y] = proj([MILAN.lon, MILAN.lat]);
    if (milanNight) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
      g.addColorStop(0, 'rgba(255,220,140,0.9)');
      g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 18, y - 18, 36, 36);
    }

    // waypoint beam
    const top = y - Math.max(70, R * 0.62);
    const beam = ctx.createLinearGradient(0, y, 0, top);
    beam.addColorStop(0, 'rgba(255,240,170,0.95)');
    beam.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(x - 0.75, top, 1.5, y - top);
    ctx.globalAlpha = fade * 0.25;
    ctx.fillRect(x - 4, top + (y - top) * 0.3, 8, (y - top) * 0.7);
    ctx.globalAlpha = fade;

    // marker
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#fff4b0';
    ctx.shadowColor = '#ffd27a';
    ctx.shadowBlur = 12;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();

    // label
    const ly = top + 6;
    const sub = 'YOU ARE HERE · 45.46°N 9.19°E';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    const wSub = ctx.measureText(sub).width;
    // Label beside the beam where it fits, otherwise centred on top of it
    let mode = 'right';
    if (x + 18 + wSub > W - 8) mode = x - 18 - wSub > 8 ? 'left' : 'top';
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
  }

  function drawStars(t) {
    const tt = reduceMotion ? 0 : t * 0.001;
    for (const s of twinklers) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(tt * s.sp + s.ph));
      ctx.fillStyle = `rgba(${s.hue},${a})`;
      const x = s.x * W, y = s.y * H;
      ctx.beginPath(); ctx.arc(x, y, s.r * 0.7, 0, Math.PI * 2); ctx.fill();
      if (s.r > 1.6) {
        ctx.fillStyle = `rgba(${s.hue},${a * 0.35})`;
        ctx.fillRect(x - s.r * 3, y - 0.4, s.r * 6, 0.8);
        ctx.fillRect(x - 0.4, y - s.r * 3, 0.8, s.r * 6);
      }
    }
    if (reduceMotion) return;
    if (!shooting && t > nextShoot) {
      const r = Math.random;
      shooting = { x: W * (0.2 + r() * 0.6), y: H * r() * 0.35, vx: -(0.5 + r() * 0.5), vy: 0.25 + r() * 0.2, t0: t, life: 900 + r() * 500 };
    }
    if (shooting) {
      const k = (t - shooting.t0) / shooting.life;
      if (k >= 1) { shooting = null; nextShoot = t + 7000 + Math.random() * 12000; return; }
      const d = (t - shooting.t0);
      const x = shooting.x + shooting.vx * d, y = shooting.y + shooting.vy * d;
      const g = ctx.createLinearGradient(x, y, x - shooting.vx * 160, y - shooting.vy * 160);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - shooting.vx * 160, y - shooting.vy * 160); ctx.stroke();
    }
  }

  let lastFrame = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (t - lastFrame < 30) return; // ~30 fps is plenty for a wallpaper
    lastFrame = t;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (mobile) ctx.translate(0, -window.scrollY);

    drawStars(t);
    const rot = currentRotation(t);
    proj.rotate(rot);
    orbitPts = [];
    drawRings(false);
    drawDiscoveries(t, false);
    drawPlanet(t, rot);
    drawMilan(t, rot);
    drawHUD(t);
    drawRings(true);
    drawDiscoveries(t, true);
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
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastFrame = 0; });
})();
