// Noor — screens and navigation.
import { get, set, settings, favourites, putFile, getFile, IQAMA_DEFAULTS } from './store.js';
import { METHODS, prayerDay, prayerName, prayerNameAr, nextPrayer, currentPrayer, hijri, qibla, PRAYERS, tahajjudIcs, tahajjudShortcutData } from './prayer.js';
import { RATIB, RECITERS, reciterName, surahEn, surahAr, surahHtml, RULE_NAMES, LEGEND, KINDS, adhkar, TASBIH, TASBIH_ORDER, TARGET_CHOICES } from './data.js';
import { player, play, toggle, next, stop, resetRatib, playAyah, nextAyah, prevAyah, setSpeed } from './audio.js';
import { ICON, toast, sheet, fmtTime, fmtDur, SPEEDS, AutoScroller, beep } from './ui.js';
import { moonInfo, moonSvg, moonRiseSet, nextPhases, atSunset, PHASE_ICON } from './moon.js';
import { VoiceCounter, KEYWORDS, canRecognise, canListen } from './voice.js';

// ================= themes =================

const THEMES = [
  { id: 'gold', name: 'Black & Gold', bg: '#0c0b0a', dots: ['#c9a96e', '#f1ddb0'] },
  { id: 'emerald', name: 'Emerald', bg: '#0b1d15', dots: ['#d6b56d', '#24473a'] },
  { id: 'midnight', name: 'Midnight', bg: '#0e1528', dots: ['#a9c1f0', '#dbe6ff'] },
  { id: 'black', name: 'Pure Black', bg: '#000000', dots: ['#c9a96e', '#2a2620'] },
  { id: 'paper', name: 'Mushaf Paper', bg: '#f4ecdb', dots: ['#9a6f1f', '#2b2418'] },
];

function applyTheme(id) {
  const th = THEMES.find(x => x.id === id) || THEMES[0];
  document.documentElement.dataset.theme = th.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th.bg);
}
applyTheme(get('theme', 'gold'));

let view = document.getElementById('view');
let cleanups = [];
const onLeave = fn => cleanups.push(fn);

// ================= router =================

function route() {
  cleanups.forEach(f => { try { f(); } catch { /* ignore */ } });
  cleanups = [];
  // fresh container each time so tap handlers from the previous screen don't pile up
  const fresh = view.cloneNode(false);
  view.replaceWith(fresh);
  view = fresh;
  document.body.classList.remove('full');
  const parts = (location.hash || '#/today').slice(2).split('/');
  const page = parts[0] || 'today';
  const tab = { qibla: 'today', read: 'quran' }[page] || page;
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  const screens = { today, qibla: qiblaScreen, quran, read: reader, adhkar: adhkarScreen, counter, settings: settingsScreen };
  (screens[page] || today)(parts.slice(1));
  renderMini();
}
window.addEventListener('hashchange', route);
const go = h => { if (location.hash === h) route(); else location.hash = h; };

// ================= Today =================

let askedLocation = false;
function requestLocation(force = false) {
  if ((askedLocation && !force) || !navigator.geolocation) return;
  askedLocation = true;
  navigator.geolocation.getCurrentPosition(p => {
    const { latitude: lat, longitude: lon, accuracy } = p.coords;
    set('lat', lat); set('lon', lon); set('hasLocation', true);
    set('locTime', Date.now()); set('locAccuracy', Math.round(accuracy || 0));
    if (force) toast('Location updated');
    lookupAddress(lat, lon, force);
    if (/^#\/(today|settings)/.test(location.hash || '#/today')) route();
  }, () => { if (force) toast('Location is off — allow it in iPhone Settings → Privacy → Location Services → Safari Websites'); },
  { enableHighAccuracy: true, maximumAge: 5 * 60000, timeout: 20000 });
}

const metresBetween = (a1, o1, a2, o2) => {
  const r = Math.PI / 180, x = (o2 - o1) * r * Math.cos((a1 + a2) / 2 * r), y = (a2 - a1) * r;
  return Math.hypot(x, y) * 6371000;
};

/** Street, area, city and country for your position (OpenStreetMap, needs internet). */
async function lookupAddress(lat, lon, force = false) {
  const old = get('address', null);
  if (!force && old && metresBetween(old.lat, old.lon, lat, lon) < 100 && Date.now() - old.t < 7 * 86400000) return;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=18&addressdetails=1&accept-language=en`);
    if (!r.ok) return;
    const a = (await r.json()).address || {};
    set('address', {
      lat, lon, t: Date.now(),
      street: [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' '),
      area: a.neighbourhood || a.suburb || a.quarter || a.city_district || a.residential || '',
      city: a.city || a.town || a.village || a.municipality || a.hamlet || '',
      region: a.county || a.state_district || a.state || '',
      country: a.country || '',
    });
    if (/^#\/(today|settings)/.test(location.hash || '#/today')) route();
  } catch { /* offline — keep the last address */ }
}

/** Two lines: "Street, Area" and "City, Region, Country". */
function addressLines() {
  const a = get('address', null);
  if (!settings.hasLocation) return ['Dubai (default)', 'Tap to use your location'];
  if (!a) return ['Your location', `${settings.lat.toFixed(4)}, ${settings.lon.toFixed(4)}`];
  const uniq = arr => arr.filter((x, i) => x && arr.indexOf(x) === i);
  const l1 = uniq([a.street, a.area]).join(', ') || a.city || 'Your location';
  const l2 = uniq([a.city, a.region, a.country]).join(', ');
  return [l1, l2];
}

function today() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  view.innerHTML = `
    <div id="dyn"></div>
    <div class="grid2">
      <a class="tile" href="#/qibla">${ICON.compass.replace('class="icon"', '')}Qibla</a>
      <button class="tile" id="masjid">${ICON.mosque.replace('class="icon"', '')}Nearest Masjid</button>
    </div>
    ${settings.hasLocation ? '' : `<p class="note">Using Dubai for prayer times. <button class="gold" id="loc">Use my location</button></p>`}
    ${standalone ? '' : `<div class="card" style="margin-top:14px"><div class="label gold">Install</div>
      <p class="note" style="margin:6px 0 0">Tap <b>Share</b> <span class="gold">⬆︎</span> in Safari, then <b>Add to Home Screen</b>. Noor then opens like an app and works offline.</p></div>`}`;
  const draw = () => { const d = document.getElementById('dyn'); if (d) d.innerHTML = todayHtml(new Date()); };
  view.addEventListener('click', e => { if (e.target.closest('#thcal')) addTahajjudToCalendar(); if (e.target.closest('#moonbtn')) openMoonSheet(); });
  draw();
  const timer = setInterval(draw, 1000);
  onLeave(() => clearInterval(timer));
  document.getElementById('masjid').onclick = () => {
    const url = `https://maps.apple.com/?q=mosque&sll=${settings.lat.toFixed(5)},${settings.lon.toFixed(5)}&z=14`;
    window.open(url, '_blank');
  };
  const loc = document.getElementById('loc');
  if (loc) loc.onclick = () => requestLocation(true);
  view.addEventListener('click', e => { if (e.target.closest('[data-loc]')) requestLocation(true); });
  requestLocation();
}

/** iPhone web apps can't schedule notifications, so the reminder goes into the Calendar app. */
async function addTahajjudToCalendar() {
  const ics = tahajjudIcs(60);
  const file = new File([ics], 'tahajjud.ics', { type: 'text/calendar' });
  set('tahajjudCalAt', Date.now());
  // Safari opens a .ics file with "Add All" to Calendar
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = 'tahajjud.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('Tap “Add All” to put 60 nights of Tahajjud reminders in Calendar', 5000);
}

// Live clock on Today: hours:minutes large, seconds and AM/PM smaller (follows the phone's 12/24-hour setting)
function clockHtml(d) {
  const parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }).formatToParts(d);
  const v = t => parts.find(p => p.type === t)?.value || '';
  const ap = v('dayPeriod');
  return `${v('hour')}:${v('minute')}<span class="sec">:${v('second')}</span>${ap ? `<span class="ap">${ap}</span>` : ''}`;
}

// ----- Moon: card on Today, details in a sheet -----
let moonCache = { key: -1, v: null };
function moonNow(now) {                       // Today redraws every second; the Moon only needs a refresh each minute
  const key = Math.floor(now.getTime() / 60000);
  if (moonCache.key !== key) moonCache = { key, v: moonInfo(now) };
  return moonCache.v;
}
const fmtIn = ms => {
  const m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : `${h}h ${m % 60}m`;
};
const fmtDay = d => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + fmtTime(d);

function openMoonSheet() {
  const now = new Date(), { lat, lon } = settings;
  const mi = moonInfo(now), rs = moonRiseSet(now, lat, lon), next = nextPhases(now);
  const sunset = prayerDay(now).adhan[4], ss = atSunset(sunset, lat, lon);
  const row = (a, b) => `<div class="mrow"><span>${a}</span><b>${b}</b></div>`;
  const t = d => d ? fmtTime(d) : '—';
  const hm = h => `${Math.floor(h)} h ${Math.round((h % 1) * 60)} m`;
  let evening = '';
  const newMoon = next.find(p => p.name === 'New moon').date;
  if (ss.ageHours != null && ss.ageHours < 48) {
    const sets = ss.lagMin == null ? (ss.upAtSunset ? 'over 5 h after the Sun' : 'before the Sun')
      : ss.lagMin >= 0 ? `${ss.lagMin} min after the Sun` : `${-ss.lagMin} min before the Sun`;
    evening = `<div class="label gold" style="margin:16px 0 4px">At today's sunset</div>${row('Moon age at sunset', hm(ss.ageHours))}${row('Moon sets', sets)}`;
  } else if (newMoon - sunset > 0 && newMoon - sunset < 36 * 3600000) {
    evening = `<div class="label gold" style="margin:16px 0 4px">At today's sunset</div>${row('New moon (conjunction)', fmtDay(newMoon))}
      <p class="tiny muted" style="margin:6px 0 0">The new moon comes after sunset, so no new crescent is possible tonight.</p>`;
  }
  if (evening && !evening.includes('no new crescent')) evening += '<p class="tiny muted" style="margin:6px 0 0">Astronomy only. The start of a month follows your local moon-sighting announcement.</p>';
  sheet('Moon', `
    <div class="moon-big">${moonSvg(mi, { size: 132, lat, id: 'sheet' })}
      <div class="moon-bigname">${mi.name}</div><div class="dim small">${mi.pct}% illuminated</div></div>
    ${row('Age', `${Math.floor(mi.ageDays)} d ${Math.round((mi.ageDays % 1) * 24)} h`)}
    ${row('Moonrise', t(rs.rise))}${row('Moonset', t(rs.set))}
    ${row('Distance', `${mi.distKm.toLocaleString()} km`)}
    ${evening}
    <div class="label gold" style="margin:16px 0 4px">Next phases</div>
    ${next.map(p => row(`${PHASE_ICON[p.name]} ${p.name}`, `${fmtDay(p.date)}<div class="tiny muted" style="font-weight:400">in ${fmtIn(p.date - now)}</div>`)).join('')}
    <p class="tiny muted" style="margin:12px 0 0">Calculated on your phone for your location. Times are good to within a few minutes.</p>`);
}

// Tahajjud times for the iPhone Shortcut that sets a nightly timer alarm
async function copyShortcutTimes() {
  const data = tahajjudShortcutData(400);
  try {
    await navigator.clipboard.writeText(data);
    set('tahajjudShortcutAt', Date.now());
    toast('Copied 400 nights of Tahajjud times — paste into the Text action of your Shortcut', 5000);
  } catch {
    const close = sheet('Copy Tahajjud times', `<p class="small dim">Select all, copy, and paste into the Text action of your Shortcut.</p>
      <textarea readonly style="width:100%;height:160px;font-size:12px">${data}</textarea>
      <button class="pill" data-close style="margin-top:10px;width:100%">Done</button>`,
      (e, c) => { if (e.target.closest('[data-close]')) { set('tahajjudShortcutAt', Date.now()); c(); } });
    const ta = document.querySelector('.sheet textarea'); ta.focus(); ta.select();
  }
}

// While Noor is open, chime at Tahajjud time
let thAlerted = '';
setInterval(() => {
  if (!settings.tahajjudAlert) return;
  const now = new Date(), d = prayerDay(now), key = d.start.toDateString();
  if (thAlerted !== key && now >= d.tahajjud && now - d.tahajjud < 60000) {
    thAlerted = key; beep(true); setTimeout(() => beep(true), 700);
    toast(`Tahajjud — Fajr at ${fmtTime(d.adhan[0])}`, 10000);
  }
}, 15000);

function todayHtml(now) {
  const h = hijri(now);
  const day = prayerDay(now);
  const cur = currentPrayer(now);
  const nx = nextPrayer(now);
  const show = cur || nx;
  const i = show.i, d = show.day;
  let status;
  if (cur) {
    const left = Math.ceil((d.iqama[i] - now) / 60000);
    status = d.isFriday && i === 2 ? 'Khutbah at 12:45' : left > 0 ? `Iqama in ${left} min` : 'Iqama has started';
  } else {
    status = 'in ' + fmtDur((d.adhan[i] - now) / 1000);
  }
  const hl = cur ? cur.i : (nx.day.start.getTime() === day.start.getTime() ? nx.i : -1);
  const rows = [0, 1, 2, 3, 4, 5].map(k => `
    <div class="t ${k === hl ? 'hi' : ''} ${k === 1 ? 'sun' : ''}">
      <div><div class="n">${prayerName(day, k)}</div><div class="na ar" style="direction:rtl;text-align:left">${prayerNameAr(day, k)}</div></div>
      <div class="spacer"></div>
      <div><div class="v">${fmtTime(day.adhan[k])}</div>
      ${day.iqama[k] ? `<div class="iq">${day.isFriday && k === 2 ? 'Khutbah' : 'Iqama ' + fmtTime(day.iqama[k])}</div>` : ''}</div>
    </div>`).join('');
  const thHi = now >= day.lastThird && now < day.adhan[0];
  const thRow = `
    <div class="t th ${thHi ? 'hi' : ''}">
      <div><div class="n">Tahajjud</div><div class="na ar" style="direction:rtl;text-align:left">التهجد</div></div>
      <div class="spacer"></div>
      <div><div class="v">${fmtTime(day.tahajjud)}</div>
      <div class="iq">${settings.tahajjud} min before Fajr · last third ${fmtTime(day.lastThird)}</div></div>
    </div>`;
  const moon = moonNow(now);
  return `
    <div style="margin:6px 0 14px;display:flex;gap:12px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="clock">${clockHtml(now)}</div>
        <div class="gold">${h.en}</div>
        <div class="dim small">${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <button class="locline" data-loc="1">${ICON.pin}<span><span class="l1">${addressLines()[0]}</span><span class="l2">${addressLines()[1]}</span></span></button>
      </div>
      <button class="moon" id="moonbtn" aria-label="Moon details">
        ${moonSvg(moon, { size: 58, lat: settings.lat, id: 'card' })}
        <div class="moon-name">${moon.name}</div>
        <div class="moon-lit">${moon.pct}% lit</div>
        <div class="moon-more">Details ›</div>
      </button>
    </div>
    <div class="card hi">
      <div class="label gold">${cur ? 'Now' : 'Next prayer'}</div>
      <div class="row" style="align-items:baseline;margin-top:4px">
        <span class="next-name">${prayerName(d, i)}</span>
        <span class="ar goldl" style="font-size:24px">${prayerNameAr(d, i)}</span>
        <span class="spacer"></span>
        <span class="next-time">${fmtTime(d.adhan[i])}</span>
      </div>
      <div class="row" style="margin-top:6px">
        <span class="gold" style="font-weight:600">${status}</span><span class="spacer"></span>
        ${d.iqama[i] && !(d.isFriday && i === 2) ? `<span class="dim small">Iqama ${fmtTime(d.iqama[i])}</span>` : ''}
      </div>
    </div>
    <div class="card times">${thRow}${rows}</div>
    <button class="pill" id="thcal" style="margin:10px 0 12px;width:100%">🔔 Tahajjud reminder in Calendar</button>`;
}

// ================= Qibla =================

let qiblaMode = get('qiblaMode', 'compass');   // 'compass' or 'map'

function qiblaScreen() {
  const q = qibla(settings.lat, settings.lon);
  const ticks = Array.from({ length: 72 }, (_, k) => {
    const major = k % 18 === 0, mid = k % 6 === 0;
    return `<line x1="150" y1="${major ? 14 : 18}" x2="150" y2="${major ? 30 : mid ? 27 : 24}" style="stroke:var(${major ? '--silver' : '--stroke'})" stroke-width="${major ? 2 : 1.2}" transform="rotate(${k * 5} 150 150)"/>`;
  }).join('');
  const letters = ['N', 'E', 'S', 'W'].map((s, k) =>
    `<g transform="rotate(${k * 90} 150 150)"><text class="qletter" data-k="${k}" x="150" y="50" text-anchor="middle" font-size="15" font-weight="700" style="fill:var(${s === 'N' ? '--gold' : '--dim'})" transform="rotate(${-k * 90} 150 45)">${s}</text></g>`).join('');
  const kaabaIcon = (x, y, s) => `<g transform="translate(${x - s / 2} ${y - s / 2})"><rect width="${s}" height="${s}" rx="2" style="fill:#151515;stroke:var(--gold)" stroke-width="1.5"/><rect y="${s * 0.28}" width="${s}" height="${s * 0.16}" style="fill:var(--gold)"/></g>`;

  view.innerHTML = `
    <div class="row"><a class="iconbtn" href="#/today">${ICON.back}</a><h1 style="margin:0;flex:1">Qibla</h1>
      <span class="dim small">${Math.round(q.bearing)}° · ${Math.round(q.km).toLocaleString()} km</span></div>
    <div class="seg" style="margin-top:10px"><button data-qm="compass" class="${qiblaMode === 'compass' ? 'on' : ''}">Compass</button><button data-qm="map" class="${qiblaMode === 'map' ? 'on' : ''}">Map</button></div>

    <div class="qguide" id="qguide">
      <div class="qturn" id="qturn"></div>
      <div class="qtext"><div id="qmain">Tap Start, then hold your phone flat</div><div class="small dim" id="qsub">Point the top of your phone forward</div></div>
    </div>

    <div id="qcompass" ${qiblaMode === 'compass' ? '' : 'hidden'}>
      <div class="qdial" id="qdial">
        <svg viewBox="0 0 300 300">
          <circle cx="150" cy="150" r="146" class="qring"/>
          <path id="qarc" class="qarc" d=""/>
          <g id="qface" class="qrot">${ticks}${letters}
            <g transform="rotate(${q.bearing} 150 150)"><line x1="150" y1="40" x2="150" y2="96" class="qline"/>${kaabaIcon(150, 40, 20)}</g>
          </g>
          <path d="M150 2 L162 22 L138 22 Z" class="qpointer"/>
          <circle cx="150" cy="150" r="54" class="qhub"/>
        </svg>
        <div class="qcenter"><div class="qdeg" id="qdeg">${Math.round(q.bearing)}°</div><div class="qlab" id="qlab">from north</div></div>
      </div>
    </div>

    <div id="qmapbox" ${qiblaMode === 'map' ? '' : 'hidden'}>
      <div class="qmapwrap" id="qmapwrap"><div id="qmap"></div><div class="qaim"></div><div class="qme"></div></div>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="pill" id="zout">−</button><button class="pill" id="zin">+</button>
      </div>
      <p class="tiny muted" style="text-align:center">Line to the Kaaba · map © OpenStreetMap contributors · Esri</p>
    </div>

    <div style="text-align:center;margin-top:6px"><button class="pill" id="start">${ICON.compass} Start compass</button></div>
    <p class="note" style="text-align:center" id="qnote">Hold the phone flat, away from metal and magnets. If the direction jumps, move the phone in a figure-8 to calibrate.</p>`;

  const $ = id => document.getElementById(id);
  let heading = null, unwrapped = null, found = false, lastFound = false, map = null, line = null, zoom = 16;

  // ----- map (loaded only when opened) -----
  const geodesic = (lat1, lon1, lat2, lon2, n = 64) => {
    const r = Math.PI / 180, toV = (la, lo) => [Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)];
    const a = toV(lat1, lon1), b = toV(lat2, lon2);
    const w = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    return Array.from({ length: n + 1 }, (_, i) => {
      const f = i / n, s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
      const v = [s1 * a[0] + s2 * b[0], s1 * a[1] + s2 * b[1], s1 * a[2] + s2 * b[2]];
      return [Math.atan2(v[2], Math.hypot(v[0], v[1])) / r, Math.atan2(v[1], v[0]) / r];
    });
  };
  const loadLeaflet = () => new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js'; s.onload = () => resolve(window.L); s.onerror = reject;
    document.head.appendChild(s);
  });
  const showMap = async () => {
    if (map) { map.invalidateSize(); return; }
    try {
      const L = await loadLeaflet();
      if (!$('qmap')) return;
      const paper = document.documentElement.dataset.theme === 'paper';
      map = L.map('qmap', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
        doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, zoomSnap: 1 })
        .setView([settings.lat, settings.lon], zoom);
      // OpenStreetMap tiles (no key needed); darkened with a CSS filter for the dark themes
      const cls = paper ? '' : 'darktiles';
      const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: cls }).addTo(map);
      // backup source if OpenStreetMap refuses tiles
      let fails = 0, loaded = 0;
      osm.on('tileload', () => { loaded++; });
      osm.on('tileerror', () => {
        if (++fails === 3 && !loaded && map) {
          map.removeLayer(osm);
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, className: cls }).addTo(map).bringToBack();
        }
      });
      line = L.polyline(geodesic(settings.lat, settings.lon, 21.4225, 39.8262), { color: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#c9a96e', weight: 5, opacity: 0.95 }).addTo(map);
      L.circleMarker([21.4225, 39.8262], { radius: 7, color: '#000', weight: 2, fillColor: '#c9a96e', fillOpacity: 1 }).addTo(map);
      update();
    } catch { $('qmapwrap').innerHTML = '<p class="note" style="padding:40px;text-align:center">The map needs internet. The compass works offline.</p>'; }
  };
  $('zin').onclick = () => { zoom = Math.min(18, zoom + 1); map && map.setZoom(zoom); };
  $('zout').onclick = () => { zoom = Math.max(3, zoom - 1); map && map.setZoom(zoom); };

  view.querySelector('.seg').onclick = e => {
    const b = e.target.closest('[data-qm]'); if (!b) return;
    qiblaMode = b.dataset.qm; set('qiblaMode', qiblaMode);
    view.querySelectorAll('[data-qm]').forEach(x => x.classList.toggle('on', x === b));
    $('qcompass').hidden = qiblaMode !== 'compass';
    $('qmapbox').hidden = qiblaMode !== 'map';
    if (qiblaMode === 'map') showMap();
  };
  if (qiblaMode === 'map') showMap();

  // ----- guidance -----
  const arcPath = d => {     // arc on the ring from the top (where the phone points) to the Qibla
    if (Math.abs(d) < 0.5) return '';
    const r = 146, a0 = -90, a1 = -90 + d, rad = x => x * Math.PI / 180;
    const p = a => `${150 + r * Math.cos(rad(a))} ${150 + r * Math.sin(rad(a))}`;
    return `M ${p(a0)} A ${r} ${r} 0 ${Math.abs(d) > 180 ? 1 : 0} ${d > 0 ? 1 : 0} ${p(a1)}`;
  };

  function update() {
    const root = $('qguide'); if (!root) return;
    if (heading == null) {
      $('qturn').innerHTML = '';
      if (map) $('qmap').style.transform = 'translate(-50%,-50%)';
      return;
    }
    const d = ((q.bearing - heading + 540) % 360) - 180;   // + turn right, − turn left
    const ad = Math.abs(d);
    found = lastFound ? ad < 6 : ad < 3;                   // a little stickiness so it doesn't flicker
    const near = !found && ad < 20;
    const state = found ? 'ok' : near ? 'near' : 'far';
    document.body.dataset.qibla = state;

    $('qface').style.transform = `rotate(${-unwrapped}deg)`;
    view.querySelectorAll('.qletter').forEach(el => el.setAttribute('transform', `rotate(${unwrapped - el.dataset.k * 90} 150 45)`));   // keep N E S W upright
    $('qarc').setAttribute('d', found ? '' : arcPath(d));
    $('qdeg').textContent = found ? '✓' : `${Math.round(ad)}°`;
    $('qlab').textContent = found ? 'Qibla' : d > 0 ? 'turn right' : 'turn left';
    $('qturn').innerHTML = found ? '<span class="big">✓</span>' : `<span class="big">${d > 0 ? '↻' : '↺'}</span>`;
    $('qmain').textContent = found ? 'You are facing the Qibla' : near ? `Almost there — ${d > 0 ? 'a little right' : 'a little left'}` : `Turn ${d > 0 ? 'right' : 'left'} ${Math.round(ad)}°`;
    $('qsub').textContent = found ? 'Keep the phone steady' : near ? 'Turn slowly…' : `Kaaba is ${Math.round(q.bearing)}° from north`;
    if (map) {
      $('qmap').style.transform = `translate(-50%,-50%) rotate(${-unwrapped}deg)`;
      line && line.setStyle({ color: getComputedStyle(document.body).getPropertyValue(found ? '--ok' : '--gold').trim() });
    }
    if (found && !lastFound) { beep(true); if (navigator.vibrate) navigator.vibrate(80); }
    lastFound = found;
  }

  const onOrient = e => {
    let h = e.webkitCompassHeading;
    if (h == null && e.absolute && e.alpha != null) h = 360 - e.alpha;
    if (h == null || isNaN(h)) return;
    // smooth the jitter, and keep the angle continuous so the dial never spins the long way round
    if (unwrapped == null) unwrapped = h;
    else unwrapped += (((h - unwrapped) % 360 + 540) % 360 - 180) * 0.3;
    heading = ((unwrapped % 360) + 360) % 360;
    const acc = e.webkitCompassAccuracy;
    $('qnote').textContent = acc != null && (acc < 0 || acc > 25)
      ? '⚠︎ Compass needs calibrating — move the phone in a figure-8 a few times.'
      : 'Hold the phone flat, away from metal and magnets.';
    update();
  };

  $('start').onclick = async () => {
    beep.prime && beep.prime();
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { $('qmain').textContent = 'Compass permission was declined'; $('qsub').textContent = 'Close Noor and open it again to be asked again.'; return; }
      }
      window.addEventListener('deviceorientation', onOrient, true);
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      $('start').hidden = true;
      $('qmain').textContent = 'Hold your phone flat…';
      setTimeout(() => { if (heading == null && $('qmain')) { $('qmain').textContent = 'No compass found on this device'; $('qsub').textContent = `The gold Kaaba on the dial is ${Math.round(q.bearing)}° from north.`; } }, 3000);
    } catch { $('qmain').textContent = 'Compass not available on this device'; }
  };
  onLeave(() => {
    window.removeEventListener('deviceorientation', onOrient, true);
    window.removeEventListener('deviceorientationabsolute', onOrient, true);
    delete document.body.dataset.qibla;
    if (map) map.remove();
  });
}

// ================= Quran list =================

function quran(args) {
  const favMode = args[0] === 'favourites';
  const resume = get('reader', null);
  view.innerHTML = `
    <h1>Quran</h1>
    <div class="seg"><button data-tab="all" class="${favMode ? '' : 'on'}">All surahs</button><button data-tab="fav" class="${favMode ? 'on' : ''}">★ Favourites</button></div>
    <div class="card" style="padding:12px 14px">
      <div class="label">Reciter</div>
      <select id="reciter" style="width:100%;margin-top:6px;background:transparent;border:0;color:var(--silver);font-size:16px">
        ${RECITERS.map(([id, n]) => `<option value="${id}" ${id === settings.reciter ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <div class="tiny muted" style="margin-top:4px">Audio streams from the internet.</div>
    </div>
    ${resume && !favMode ? `<button class="pill" id="resume" style="margin-bottom:12px">${ICON.book} Continue: ${surahEn(resume.surah)}</button>` : ''}
    ${favMode ? '' : '<input class="search" id="q" placeholder="Search surah (name or number)" autocomplete="off">'}
    <div id="list"></div>`;

  view.querySelector('.seg').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    go(b.dataset.tab === 'fav' ? '#/quran/favourites' : '#/quran');
  };
  document.getElementById('reciter').onchange = e => { set('reciter', e.target.value); toast(`Reciter: ${reciterName(e.target.value)}`); };
  const r = document.getElementById('resume');
  if (r) r.onclick = () => go(`#/read/${resume.surah}`);

  const list = document.getElementById('list');
  const draw = (q = '') => { list.innerHTML = favMode ? favListHtml() : allListHtml(q); };
  draw();
  const qi = document.getElementById('q');
  if (qi) qi.oninput = () => draw(qi.value);

  list.onclick = e => {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('[data-n]');
    if (!row) {
      if (btn && btn.dataset.act === 'playall') {
        const f = favourites.all(); if (f.length) { play(f[0], { playlist: f }); toast('Playing your favourites in order'); }
      }
      if (btn && btn.dataset.act === 'readall') { const f = favourites.all(); if (f.length) go(`#/read/${f[0]}/f`); }
      return;
    }
    const n = +row.dataset.n;
    const act = btn ? btn.dataset.act : 'read';
    if (act === 'read') go(favMode ? `#/read/${n}/f` : `#/read/${n}`);
    else if (act === 'play') { play(n, { playlist: favMode ? favourites.all() : null }); toast(`Playing ${surahEn(n)}`); }
    else if (act === 'fav') { const on = favourites.toggle(n); toast(on ? 'Added to favourites ★' : 'Removed from favourites'); draw(qi ? qi.value : ''); }
    else if (act === 'up' || act === 'down') { favourites.move(n, act === 'up' ? -1 : 1); draw(); }
    else if (act === 'remove') { favourites.toggle(n); draw(); }
  };
}

function rowHtml(n, buttons) {
  const playing = player.current === n;
  return `<div class="srow" data-n="${n}">
    <div class="num"><span>${n}</span></div>
    <div style="flex:1;min-width:0"><div class="en ${playing ? 'goldl' : ''}">${surahEn(n)}</div>
      <div class="sub">${playing ? (player.playing ? '▶ Playing' : '❚❚ Paused') : ''}</div></div>
    <div class="arn ar">${surahAr(n)}</div>${buttons}</div>`;
}

function allListHtml(q) {
  q = q.trim().toLowerCase();
  const favs = favourites.all();
  const ns = Array.from({ length: 114 }, (_, k) => k + 1).filter(n => !q || String(n) === q || surahEn(n).toLowerCase().includes(q) || surahAr(n).includes(q));
  return ns.map(n => rowHtml(n, `
    <button class="iconbtn" data-act="play" aria-label="Listen">${ICON.play}</button>
    <button class="iconbtn ${favs.includes(n) ? 'filled' : ''}" data-act="fav" aria-label="Favourite">${ICON.star}</button>`)).join('')
    || '<p class="note">No surah found.</p>';
}

function favListHtml() {
  const favs = favourites.all();
  if (!favs.length) return '<p class="note">Tap ☆ next to any surah to add it here. Favourites read and play in the order you add them, and you can reorder them with ▲ ▼.</p>';
  return `<div class="row" style="margin-bottom:8px"><button class="pill" data-act="playall">${ICON.play} Listen to all</button>
    <button class="pill" data-act="readall">${ICON.book} Read all</button></div>` +
    favs.map((n, k) => rowHtml(n, `
      <button class="iconbtn" data-act="up" ${k === 0 ? 'style="opacity:.25"' : ''}>${ICON.up}</button>
      <button class="iconbtn" data-act="down" ${k === favs.length - 1 ? 'style="opacity:.25"' : ''}>${ICON.down}</button>
      <button class="iconbtn" data-act="remove">${ICON.close}</button>`)).join('');
}

// ================= Reader =================

let readerSpeed = 0;   // stays the same when moving to the next surah

async function reader(args) {
  const n = Math.min(114, Math.max(1, parseInt(args[0], 10) || 1));
  const favMode = args[1] === 'f';
  document.body.classList.add('full');
  let size = get('readerSize', 30), colours = get('readerColours', true);
  const saved = get('reader', null);
  const nextN = favMode ? favourites.after(n) : (n < 114 ? n + 1 : null);

  view.innerHTML = `<div id="reader">
    <div class="rbar">
      <button class="iconbtn" id="rback">${ICON.back}</button>
      <button class="rtitle" id="rtitle">${n} · ${surahEn(n)} <span class="chev">▼</span></button>
      <button class="iconbtn ${favourites.has(n) ? 'filled' : ''}" id="rfav">${ICON.star}</button>
    </div>
    <div id="scroller"><div class="mushaf ${colours ? '' : 'nocol'}" id="mushaf" style="font-size:${size}px;line-height:2.1"><p class="dim" style="text-align:center">Loading…</p></div></div>
    <div class="rctrl">
      <button class="pill" id="rnext" hidden></button>
      <div class="abar" id="abar" hidden>
        <button class="iconbtn" id="aprev" aria-label="Previous ayah">${ICON.prev}</button>
        <button class="iconbtn play" id="atoggle" aria-label="Play or pause">${ICON.pause}</button>
        <button class="iconbtn" id="anext" aria-label="Next ayah">${ICON.next}</button>
        <div class="ainfo" id="ainfo"></div>
        <button class="pill" id="aspeed">1×</button>
        <button class="iconbtn" id="astop" aria-label="Stop">${ICON.close}</button>
      </div>
      <div class="bar">
        <button class="pill" id="rscroll"></button>
        <button class="pill" id="rsmall">A−</button>
        <button class="pill" id="rbig">A+</button>
        <button class="pill ${colours ? 'on' : ''}" id="rcol">${ICON.palette} Colours</button>
        <button class="pill" id="rlisten">${ICON.play} Listen</button>
      </div>
    </div></div>`;

  const scroller = document.getElementById('scroller');
  const mushaf = document.getElementById('mushaf');
  const $ = id => document.getElementById(id);
  const goNext = () => { if (nextN) go(`#/read/${nextN}${favMode ? '/f' : ''}`); else { readerSpeed = 0; showSpeed(); } };

  const auto = new AutoScroller(scroller, { onEnd: goNext });
  onLeave(() => auto.destroy());
  const showSpeed = () => {
    auto.speed = SPEEDS[readerSpeed].px;
    $('rscroll').innerHTML = `${ICON.scroll} ${readerSpeed ? 'Scroll: ' + SPEEDS[readerSpeed].label : 'Auto-scroll'}`;
    $('rscroll').classList.toggle('on', readerSpeed > 0);
  };
  showSpeed();

  $('rback').onclick = () => go(favMode ? '#/quran/favourites' : '#/quran');
  $('rscroll').onclick = () => { readerSpeed = (readerSpeed + 1) % SPEEDS.length; showSpeed(); };
  const setSize = s => { size = Math.min(56, Math.max(20, s)); set('readerSize', size); mushaf.style.fontSize = size + 'px'; };
  $('rsmall').onclick = () => setSize(size - 3);
  $('rbig').onclick = () => setSize(size + 3);
  $('rfav').onclick = () => { const on = favourites.toggle(n); $('rfav').classList.toggle('filled', on); toast(on ? 'Added to favourites ★' : 'Removed from favourites'); };
  // ----- listening: verse highlight, pause, speed -----
  const SPEED_STEPS = [0.75, 1, 1.25, 1.5, 2];
  let fromAyah = 1, lastTouch = 0, lastHl = null, startedHere = false;
  scroller.addEventListener('touchstart', () => { lastTouch = Date.now(); }, { passive: true });
  $('rlisten').onclick = () => {
    startedHere = true;
    play(n, { playlist: favMode ? favourites.all() : null, ayah: fromAyah });
    toast(`${reciterName(settings.reciter)} · ${surahEn(n)}${fromAyah > 1 ? ' from ayah ' + fromAyah : ''}`);
  };
  $('atoggle').onclick = toggle;
  $('anext').onclick = nextAyah;
  $('aprev').onclick = prevAyah;
  $('astop').onclick = () => { stop(); startedHere = false; };
  $('aspeed').onclick = () => {
    const i = SPEED_STEPS.indexOf(player.speed);
    setSpeed(SPEED_STEPS[(i + 1) % SPEED_STEPS.length]);
  };
  // Tap an ayah: play from it (or choose where "Listen" starts)
  mushaf.addEventListener('click', e => {
    const ay = e.target.closest('.ay'); if (!ay) return;
    const a = Math.max(1, +ay.dataset.a);
    if (player.current === n) { playAyah(n, a); return; }
    fromAyah = a;
    mushaf.querySelectorAll('.ay.sel').forEach(x => x.classList.remove('sel'));
    ay.classList.add('sel');
    $('rlisten').innerHTML = `${ICON.play} Listen from ${a}`;
  });
  const syncAudio = () => {
    const mine = player.current === n;
    const bar = $('abar'); if (!bar) return;
    bar.hidden = !mine;
    $('rlisten').hidden = mine;
    if (!mine) {
      if (lastHl) { lastHl.classList.remove('playing'); lastHl = null; }
      // recitation moved on to the next surah: follow it
      if (startedHere && player.current >= 1 && player.current <= 114 && player.playing) {
        go(`#/read/${player.current}${favMode ? '/f' : ''}`);
      }
      return;
    }
    startedHere = true;
    $('atoggle').innerHTML = player.playing ? ICON.pause : ICON.play;
    $('aspeed').textContent = `${player.speed}×`;
    $('ainfo').innerHTML = player.error ? `<span style="color:var(--near)">${player.error}</span>`
      : `${player.ayah ? 'Ayah ' + player.ayah : 'Bismillah'} <span class="muted">/ ${player.count}</span>`;
    const el = mushaf.querySelector(`.ay[data-a="${player.ayah}"]`);
    if (el && el !== lastHl) {
      if (lastHl) lastHl.classList.remove('playing');
      el.classList.add('playing');
      lastHl = el;
      mushaf.querySelectorAll('.ay.sel').forEach(x => x.classList.remove('sel'));
      // follow the recitation unless you're scrolling yourself
      if (Date.now() - lastTouch > 4000 && !readerSpeed) {
        const r = el.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
        scroller.scrollTo({ top: scroller.scrollTop + r.top - sr.top - sr.height * 0.3, behavior: 'smooth' });
      }
    }
  };
  onLeave(player.onChange(syncAudio));
  $('rcol').onclick = () => {
    sheet('Tajweed colours', `
      <div class="row" style="margin-bottom:10px"><span class="spacer">Show colours</span>
        <label class="switch"><input type="checkbox" id="colsw" ${colours ? 'checked' : ''}><i></i></label></div>
      <div class="legend">${LEGEND.map(k => `<div class="row"><span class="dot r${k}" style="background:currentColor"></span>
        ${k === 0 ? 'Silent letters (hamzat al-wasl, lam shamsiyyah)' : RULE_NAMES[k]}</div>`).join('')}</div>`,
    e => {
      if (e.target.id === 'colsw') {
        colours = e.target.checked; set('readerColours', colours);
        mushaf.classList.toggle('nocol', !colours); $('rcol').classList.toggle('on', colours);
      }
    });
  };
  $('rtitle').onclick = () => {
    const favs = favourites.all();
    const item = (k, f) => `<div class="srow" data-pick="${k}" data-f="${f ? 1 : 0}"><div class="num"><span>${k}</span></div>
      <div style="flex:1">${surahEn(k)}</div><div class="arn ar">${surahAr(k)}</div></div>`;
    sheet('Choose surah',
      (favs.length ? `<div class="label gold">★ Favourites</div>${favs.map(k => item(k, true)).join('')}<div class="label" style="margin-top:14px">All surahs</div>` : '') +
      Array.from({ length: 114 }, (_, k) => item(k + 1, false)).join(''),
      (e, close) => {
        const r = e.target.closest('[data-pick]');
        if (r) { close(); go(`#/read/${r.dataset.pick}${r.dataset.f === '1' ? '/f' : ''}`); }
      });
  };

  // Save reading position; show "Next" near the end
  let lastSaved = 0;
  const onScroll = () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    const frac = max > 0 ? scroller.scrollTop / max : 0;
    if (Date.now() - lastSaved > 800) { lastSaved = Date.now(); set('reader', { surah: n, frac }); }
    const nb = $('rnext');
    if (nb) {
      nb.hidden = !(nextN && frac > 0.97);
      nb.innerHTML = nextN ? `${favMode ? 'Next favourite' : 'Next'}: ${surahEn(nextN)} ›` : '';
    }
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  $('rnext').onclick = goNext;

  try {
    mushaf.innerHTML = await surahHtml(n);
  } catch {
    mushaf.innerHTML = '<p class="dim" style="text-align:center">Could not open this surah. Open Noor once while online so it can save the Quran text.</p>';
    return;
  }
  if (player.current === n) {
    syncAudio();
  } else if (saved && saved.surah === n && saved.frac > 0.001) {
    requestAnimationFrame(() => { scroller.scrollTop = saved.frac * (scroller.scrollHeight - scroller.clientHeight); });
  } else {
    set('reader', { surah: n, frac: 0 });
  }
  syncAudio();
}

// ================= Adhkar =================

function defaultKind() {
  const d = prayerDay(), now = new Date();
  return now >= new Date(d.adhan[0].getTime() - 30 * 60000) && now < d.adhan[3] ? 'morning' : 'evening';
}
let adhkarKind = null, adhkarRead = false, adhkarSpeed = 0;

async function adhkarScreen() {
  const kind = adhkarKind || (adhkarKind = defaultKind());
  const size = get('adhkarSize', 24), english = get('adhkarEnglish', false);
  const title = { morning: 'Morning adhkar', evening: 'Evening adhkar', ratib: 'Ratib al-Haddad', travel: 'Dua for travel' }[kind];
  view.innerHTML = `
    <div class="row"><h1 style="flex:1">${title}</h1>
      ${kind === 'ratib' ? `<button class="iconbtn" id="ratibplay" aria-label="Play Ratib">${player.current === RATIB && player.playing ? ICON.pause : ICON.music}</button>` : ''}
      <button class="iconbtn" id="amore">${ICON.more}</button></div>
    <div class="seg">${KINDS.map(k => `<button data-k="${k.key}" class="${k.key === kind ? 'on' : ''}">${k.title}</button>`).join('')}</div>
    <div class="row" style="margin-bottom:12px">
      <button class="pill ${adhkarRead ? '' : 'on'}" data-mode="count">Count</button>
      <button class="pill ${adhkarRead ? 'on' : ''}" data-mode="read">Read</button>
      <span class="spacer"></span>
      ${adhkarRead ? `<button class="pill ${adhkarSpeed ? 'on' : ''}" id="ascroll">${ICON.scroll} ${adhkarSpeed ? SPEEDS[adhkarSpeed].label : 'Auto-scroll'}</button>` : '<span class="tiny muted">Tap a card to count</span>'}
    </div>
    <div id="alist" style="--asize:${size}px"><p class="dim">Loading…</p></div>`;

  view.querySelector('.seg').onclick = e => { const b = e.target.closest('button'); if (b) { adhkarKind = b.dataset.k; route(); } };
  view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { adhkarRead = b.dataset.mode === 'read'; route(); });
  document.getElementById('amore').onclick = () => {
    sheet('Options', `
      <button class="srow" style="width:100%" data-o="en">${english ? 'Hide' : 'Show'} English meaning</button>
      <button class="srow" style="width:100%" data-o="big">Larger text</button>
      <button class="srow" style="width:100%" data-o="small">Smaller text</button>
      <button class="srow" style="width:100%" data-o="reset">Start this list again</button>
      ${kind === 'ratib' ? '<button class="srow" style="width:100%" data-o="ratib">Choose Ratib audio file</button>' : ''}
      <p class="note">Sources: Hisn al-Muslim with hadith references (morning-evening-adhkar-data, CC BY 4.0). Ratib al-Haddad: wird-al-sakran-data (CC BY 4.0) — repetitions follow the commonly printed Ratib. Dua for travel: Sahih Muslim 1342.</p>`,
    (e, close) => {
      const o = e.target.closest('[data-o]'); if (!o) return;
      close();
      const a = o.dataset.o;
      if (a === 'en') set('adhkarEnglish', !english);
      if (a === 'big') set('adhkarSize', Math.min(44, size + 3));
      if (a === 'small') set('adhkarSize', Math.max(18, size - 3));
      if (a === 'reset') set(progressKey(kind), []);
      if (a === 'ratib') return pickRatib();
      route();
    });
  };
  const rp = document.getElementById('ratibplay');
  if (rp) rp.onclick = async () => {
    if (player.current === RATIB) { toggle(); setTimeout(route, 150); return; }
    if (await getFile('ratib')) { await play(RATIB); route(); } else pickRatib();
  };

  const items = await adhkar(kind);
  const list = document.getElementById('alist');
  if (!list) return;

  if (adhkarRead) {
    list.className = 'readtext';
    list.innerHTML = items.map(d => `<div class="item"><div class="ar">${d.ar}</div>
      ${d.count > 1 ? `<div class="x">×${d.count}</div>` : ''}
      ${english && d.en ? `<div class="dk"><div class="en">${d.en}</div></div>` : ''}</div>`).join('');
    const auto = new AutoScroller(document.scrollingElement, { target: window });
    auto.speed = SPEEDS[adhkarSpeed].px;
    onLeave(() => auto.destroy());
    document.getElementById('ascroll').onclick = e => {
      adhkarSpeed = (adhkarSpeed + 1) % SPEEDS.length;
      auto.speed = SPEEDS[adhkarSpeed].px;
      e.currentTarget.innerHTML = `${ICON.scroll} ${adhkarSpeed ? SPEEDS[adhkarSpeed].label : 'Auto-scroll'}`;
      e.currentTarget.classList.toggle('on', adhkarSpeed > 0);
    };
    return;
  }

  let progress = get(progressKey(kind), []);
  const p = k => progress[k] || 0;
  const currentIdx = () => items.findIndex((d, k) => p(k) < d.count);
  const draw = () => {
    const cur = currentIdx();
    list.innerHTML = items.map((d, k) => {
      const done = p(k) >= d.count;
      return `<div class="card dk ${done ? 'done' : ''} ${k === cur ? 'hi' : ''}" data-k="${k}">
        <div class="ar">${d.ar}</div>
        ${english && d.en ? `<div class="en">${d.en}</div>` : ''}
        <div class="row" style="margin-top:10px">
          <span class="src" style="flex:1">${english && d.src ? d.src : ''}</span>
          <span class="badge">${done ? '✓ ' + d.count : `${p(k)} / ${d.count}`}</span></div></div>`;
    }).join('') + (cur < 0 ? `<div style="text-align:center;padding:20px 0">
        <div class="ar goldl" style="font-size:30px">ما شاء الله</div><div class="dim">All done for today</div>
        <button class="pill" id="again" style="margin-top:12px">${ICON.reset} Start again</button></div>` : '');
    const again = document.getElementById('again');
    if (again) again.onclick = () => { progress = []; set(progressKey(kind), progress); draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  };
  draw();
  const first = currentIdx();
  if (first > 0) list.querySelector(`[data-k="${first}"]`)?.scrollIntoView({ block: 'start' });

  list.onclick = e => {
    const c = e.target.closest('[data-k]'); if (!c) return;
    const k = +c.dataset.k;
    if (p(k) >= items[k].count) return;
    progress[k] = p(k) + 1;
    set(progressKey(kind), progress);
    const finished = progress[k] >= items[k].count;
    draw();
    if (finished) {
      const nx = currentIdx();
      const el = nx >= 0 ? list.querySelector(`[data-k="${nx}"]`) : document.getElementById('again');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
}

function progressKey(kind) {
  const d = new Date();
  return `adhkar.${kind}.${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function pickRatib() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'audio/*';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      await putFile('ratib', f);
      resetRatib();
      toast('Ratib recording saved on this iPhone');
      await play(RATIB);
      route();
    } catch { toast('Could not save that file'); }
  };
  inp.click();
}

// ================= Counter =================

function counter() {
  const st = Object.assign({ index: -1, step: 0, count: 0, round: 1, total: 0, sound: false, targets: {}, paces: {} }, get('tasbih', {}));
  st.targets = st.targets || {}; st.paces = st.paces || {};
  const save = () => set('tasbih', st);
  const curIdx = () => st.index < 0 ? [0, 1, 2][Math.min(st.step, 2)] : st.index;
  const cur = () => TASBIH[curIdx()] || TASBIH[0];
  const target = () => st.index < 0 ? cur().target : (st.targets[st.index] ?? cur().target);
  // learned timing per dhikr: { pace: seconds per recitation, gap: ms pause that ends one, ratio: share of pace before counting }
  const tuneOf = idx => {
    const v = st.paces[idx];
    const base = typeof v === 'number' ? { pace: v } : (v || {});
    return { pace: base.pace || (TASBIH[idx]?.long ? TASBIH[idx].pace : 0), gap: base.gap || 800, ratio: base.ratio || 0.82, late: base.late || 0.88, learned: !!v };
  };
  const tuning = () => tuneOf(curIdx());
  const pace = () => tuning().pace;
  const nudge = dir => {           // dir −1 = it counted too early, +1 = too late
    const idx = curIdx(), tu = tuneOf(idx);
    const r2 = x => Math.round(x * 100) / 100;
    const next = {
      pace: tu.pace,
      late: r2(Math.min(1.0, Math.max(0.7, tu.late - dir * 0.03))),
      gap: Math.round(Math.min(2500, Math.max(300, tu.gap - dir * 150))),
    };
    st.paces[idx] = next; save();
    toast(`${dir < 0 ? 'Will wait longer' : 'Will count sooner'} — counts after ${Math.round(next.late * 100)}% of a recitation`);
  };

  view.innerHTML = `<div id="counter">
    <button id="cname" style="text-align:center;max-width:92vw"></button>
    <div class="ar longtext" id="ltext" hidden></div>
    <div class="ring"><svg viewBox="0 0 270 270"><circle cx="135" cy="135" r="125" fill="none" style="stroke:var(--stroke)" stroke-width="10"/>
      <circle id="arc" cx="135" cy="135" r="125" fill="none" style="stroke:var(--gold);transition:stroke-dashoffset .2s" stroke-width="10" stroke-linecap="round" stroke-dasharray="785.4" stroke-dashoffset="785.4"/></svg>
      <div class="big"><div class="cnt" id="cnt">0</div><button class="cap" id="cap"></button></div></div>
    <div class="row">
      <button class="pill" id="cminus">−1</button>
      <button class="pill" id="creset">${ICON.reset} Reset</button>
      <button class="pill" id="csound"></button>
    </div>
    <button class="pill listen" id="clisten">🎙 Listen &amp; count</button>
    <div class="vstate" id="vstate" hidden>
      <div class="vlevel"><i id="vlevel"></i></div>
      <div class="vrep" id="vrepbox" hidden><i id="vrep"></i></div>
      <div class="small" id="vtext"></div>
      <button class="tiny gold" id="vlogbtn" style="margin-top:8px">What it heard ▾</button>
      <pre class="vlog" id="vlog" hidden></pre>
      <div class="row" id="vtune" hidden style="justify-content:center;margin-top:8px">
        <button class="pill" id="vearly">Counted too early</button><button class="pill" id="vlate">Too late</button></div>
      <div class="row" id="vlearn" hidden style="justify-content:center;margin-top:8px">
        <button class="pill on" id="vdone">Done</button><button class="pill" id="vcancel">Cancel</button></div>
    </div>
    <div class="tiny muted" id="ctotal"></div></div>`;
  const $ = id => document.getElementById(id);

  const draw = () => {
    const t = cur(), tg = target();
    $('counter').classList.toggle('long', !!t.long);
    $('ltext').hidden = !t.long;
    if (t.long) { $('ltext').textContent = t.ar; $('ltext').classList.toggle('folded', !!get('foldLong', false)); }
    $('cname').innerHTML = t.long
      ? `<div class="ar goldl" style="font-size:30px;line-height:1.4">${t.short}</div><div class="dim small">${t.en} ⌄</div>`
      : t.ar ? `<div class="ar goldl" style="font-size:36px;line-height:1.5">${t.ar}</div><div class="dim small">${t.en} ⌄</div>`
      : `<div style="font-size:26px;font-weight:300" class="goldl">Free count</div><div class="dim small">tap to choose ⌄</div>`;
    $('cnt').textContent = st.count;
    $('cnt').style.color = tg && st.count >= tg ? 'var(--gold-light)' : 'var(--silver)';
    let cap = st.index < 0 ? `STEP ${st.step + 1} OF 3 · TARGET ${tg}` : tg ? `TARGET ${tg.toLocaleString()} ⌄` : 'NO TARGET ⌄';
    if (st.round > 1) cap += ` · ROUND ${st.round}`;
    $('cap').textContent = cap;
    $('arc').style.strokeDashoffset = tg ? 785.4 * (1 - Math.min(1, st.count / tg)) : 785.4;
    $('csound').textContent = st.sound ? '🔔 Sound on' : '🔕 Sound off';
    $('ctotal').textContent = `Tap anywhere to count · Total ${st.total.toLocaleString()}`;
  };
  draw();

  const add = () => {
    const tg = target();
    if (tg && st.count >= tg) {
      if (st.index < 0 && st.step < 2) st.step++; else { st.round++; if (st.index < 0) st.step = 0; }
      st.count = 0;
    }
    st.count++; st.total++;
    const hit = target() && st.count === target();
    if (voice.active) {                         // no sounds while listening (the mic would hear them)
      $('counter').classList.add(hit ? 'flash' : 'tick');
      setTimeout(() => $('counter')?.classList.remove('flash', 'tick'), hit ? 700 : 250);
      if (navigator.vibrate) navigator.vibrate(hit ? [60, 60, 60] : 15);
    } else if (st.sound || hit) beep(hit);
    save(); draw();
  };

  // ----- hands-free: listen and count -----
  const voice = new VoiceCounter({
    index: curIdx,
    tuning,
    onCount: k => { for (let i = 0; i < k; i++) add(); },
    onState: s => {
      if (!$('vstate')) return;
      $('vstate').hidden = !s.listening && !s.error;
      $('clisten').classList.toggle('on', !!s.listening);
      $('clisten').innerHTML = s.listening ? '■ Stop listening' : '🎙 Listen &amp; count';
      if (s.level != null) $('vlevel').style.width = Math.round(s.level * 100) + '%';
      $('vlevel').parentElement.hidden = s.mode === 'words';
      $('vrepbox').hidden = !(s.mode === 'pauses' && pace());
      if (s.rep != null) $('vrep').style.width = Math.round(s.rep * 100) + '%';
      $('vlearn').hidden = s.mode !== 'learn';
      $('vtune').hidden = !(s.listening && s.mode === 'pauses' && pace());
      if (s.log && !$('vlog').hidden) { const txt = s.log.slice().reverse().join('\n'); if ($('vlog').textContent !== txt) $('vlog').textContent = txt; }
      $('vtext').innerHTML = s.error ? `<span style="color:var(--near)">${s.error}</span>`
        : s.mode === 'learn' ? `Recite <b class="goldl">${cur().en || 'the dhikr'}</b> 3 times or more at your normal pace, then tap Done${s.segments ? ` · heard ${s.segments} part${s.segments > 1 ? 's' : ''}` : ''}`
        : s.mode === 'words' ? `Listening for <b class="goldl">${cur().en || 'the dhikr'}</b>${s.heard ? ` · <span class="ar dim">${s.heard}</span>` : ''}`
        : pace() ? (s.speaking ? 'Hearing you…' : `Listening · counts after each full recitation (~${pace()} s) and a pause`)
        : s.speaking ? 'Hearing you…' : 'Listening — pause briefly after each one';
    },
  });
  voice.gapMs = get('voiceGap', 300);
  // gently follow your speed as you go (only for a learned pace)
  voice.onPace = secs => {
    const idx = curIdx(), v = st.paces[idx];
    if (!v || typeof v !== 'object') return;
    v.pace = Math.round((v.pace * 0.8 + secs * 0.2) * 10) / 10; save();
  };
  onLeave(() => voice.stop());

  $('vdone').onclick = () => {
    const r = voice.finishLearn(3);
    if (!r) { toast('Didn\'t hear enough — try again a little closer to the phone'); return; }
    st.paces[curIdx()] = { pace: r.pace, gap: r.gap, late: r.late }; save();
    toast(`Heard ${r.reps} recitations — ${r.pace} s each, last breath at ~${Math.round(r.late * 100 - 3)}%. Counting…`, 5000);
    voice.start('pauses');
  };
  $('vearly').onclick = () => nudge(-1);
  $('vlogbtn').onclick = () => { $('vlog').hidden = !$('vlog').hidden; $('vlogbtn').textContent = $('vlog').hidden ? 'What it heard ▾' : 'What it heard ▴'; };
  $('vlate').onclick = () => nudge(1);
  $('vcancel').onclick = () => voice.stop();

  $('clisten').onclick = () => {
    if (voice.active) { voice.stop(); return; }
    if (!canListen && !canRecognise) { toast('This device can\'t listen from a web page'); return; }
    const t = cur(), idx = curIdx();
    const freeCount = t.ar === '';
    const canWords = canRecognise && !freeCount && KEYWORDS[idx];
    const mode = canWords ? get('voiceMode', 'words') : 'pauses';
    const tu = tuneOf(idx), learned = tu.learned;
    sheet('Listen & count', `
      <p class="note" style="margin-top:0">Say the dhikr out loud — Noor counts for you. Keep the phone near you.</p>
      ${canWords ? `<button class="srow vopt ${mode === 'words' ? 'on' : ''}" style="width:100%" data-vm="words">
        <span style="flex:1;text-align:left"><b>Recognise the words</b><br><span class="small dim">Hears "${t.en}" itself. Arabic, needs internet.</span></span></button>` : ''}
      <button class="srow vopt ${mode === 'pauses' ? 'on' : ''}" style="width:100%" data-vm="pauses">
        <span style="flex:1;text-align:left"><b>Count each ${t.long ? 'recitation' : 'pause'}</b><br><span class="small dim">${t.long
          ? 'Counts one after each full recitation, using your pace — breaths in the middle aren\'t counted. Works offline.'
          : 'Counts one each time you stop briefly. Works offline, any dhikr.'}</span></span></button>
      <div class="vopt" style="margin-top:4px">
        <div class="row"><span style="flex:1"><b>Your pace</b><br><span class="small dim">${learned ? `${tu.pace} s per recitation · counts at a pause after ${Math.round(tu.late * 100)}%` : t.long ? `Not learned yet — using ~${t.pace} s` : 'Not needed for short dhikr'}</span></span>
          <button class="pill" data-learn="1">${learned ? 'Re-learn' : 'Learn'}</button></div>
        ${learned ? '<button class="tiny muted" data-forget="1" style="margin-top:6px">Forget my pace</button>' : ''}
      </div>
      <div class="label" style="margin:14px 0 6px">Pause after each repetition</div>
      <div class="seg">${[[200, 'Short'], [300, 'Normal'], [500, 'Long']].map(([v, l]) => `<button data-gap="${v}" class="${voice.gapMs === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <p class="tiny muted">${t.long ? 'Tap Learn and recite it 3 times the way you normally do — with the group if you recite together, and with your usual pause after each. While listening, "Counted too early / Too late" fine-tune it. ' : 'Use "Short" if you recite quickly. '}Sounds are muted while listening.</p>`,
    (e, close) => {
      const g = e.target.closest('[data-gap]');
      if (g) {
        voice.gapMs = +g.dataset.gap; set('voiceGap', voice.gapMs);
        g.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === g));
        return;
      }
      if (e.target.closest('[data-learn]')) { close(); voice.learn(); return; }
      if (e.target.closest('[data-forget]')) { delete st.paces[idx]; save(); close(); toast('Pace forgotten'); return; }
      const m = e.target.closest('[data-vm]'); if (!m) return;
      if (m.dataset.vm === 'words') set('voiceMode', 'words'); else if (canWords) set('voiceMode', 'pauses');
      close();
      voice.start(m.dataset.vm);
    });
  };

  const box = $('counter');
  box.addEventListener('click', e => {
    if (e.target.closest('#ltext')) { set('foldLong', !get('foldLong', false)); draw(); return; }   // fold / unfold the long text
    if (!e.target.closest('button')) add();
  });
  $('cminus').onclick = () => { if (st.count > 0) { st.count--; st.total = Math.max(0, st.total - 1); } save(); draw(); };
  $('creset').onclick = () => { st.count = 0; st.step = 0; st.round = 1; save(); draw(); };
  $('csound').onclick = () => { st.sound = !st.sound; save(); draw(); };
  $('cap').onclick = () => {
    if (st.index < 0) { toast('The after-prayer tasbih is 33 · 33 · 34'); return; }
    const tg = target();
    sheet(`Target for ${cur().en || 'free count'}`,
      `<div class="themes">${TARGET_CHOICES.map(n => `<button class="theme ${n === tg ? 'on' : ''}" data-t="${n}" style="padding:14px 0;font-size:16px">${n.toLocaleString()}</button>`).join('')}
        <button class="theme ${!tg ? 'on' : ''}" data-t="0" style="padding:14px 0;font-size:14px">No target</button>
        <button class="theme" data-t="custom" style="padding:14px 0;font-size:14px">Other…</button></div>`,
      (e, close) => {
        const b = e.target.closest('[data-t]'); if (!b) return;
        let n = b.dataset.t === 'custom' ? parseInt(prompt('Target count', String(tg || 100)), 10) : +b.dataset.t;
        if (isNaN(n) || n < 0) return;
        st.targets[st.index] = n; save(); draw(); close();
      });
  };
  $('cname').onclick = () => sheet('Choose dhikr',
    `<button class="srow" style="width:100%" data-i="-1">After-prayer tasbih (33 · 33 · 34)</button>` +
    TASBIH_ORDER.map(k => { const t = TASBIH[k]; const tg = st.targets[k] ?? t.target;
      return `<button class="srow" style="width:100%" data-i="${k}"><span style="flex:1;text-align:left">${t.ar ? t.en : 'Free count (no target)'}</span>
      ${t.ar ? `<span class="ar goldl" style="font-size:20px">${t.short || t.ar}</span>` : ''}${tg ? `<span class="muted small">×${tg.toLocaleString()}</span>` : ''}</button>`; }).join(''),
    (e, close) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      voice.stop();
      Object.assign(st, { index: +b.dataset.i, step: 0, count: 0, round: 1 }); save(); draw(); close();
    });
}

// ================= Settings =================

function settingsScreen() {
  const s = settings;
  const names = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></label>`;
  const stepper = (id, label, val, unit) => `<div class="set"><span class="lbl">${label}</span>
    <div class="step"><button data-step="${id}" data-d="-1">−</button><span id="${id}">${val}</span><button data-step="${id}" data-d="1">+</button></div></div>`;
  const signed = (v, u) => v === 0 ? '—' : (v > 0 ? '+' : '') + v + ' ' + u;
  const iq = s.iqama, off = s.offsets;

  const theme = get('theme', 'gold');
  view.innerHTML = `
    <h1>Settings</h1>
    <div class="label" style="margin:0 4px 6px">Theme</div>
    <div class="card"><div class="themes">${THEMES.map(th => `
      <button class="theme ${th.id === theme ? 'on' : ''}" data-theme-id="${th.id}">
        <div class="sw" style="background:${th.bg}">${th.dots.map(c => `<i style="background:${c}"></i>`).join('')}</div>${th.name}</button>`).join('')}
    </div></div>
    <div class="label" style="margin:16px 4px 6px">Prayer times</div>
    <div class="card">
      <div class="set"><span class="lbl">Calculation</span><select id="method">${METHODS.map((m, k) => `<option value="${k}" ${k === s.method ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>
      <div class="set"><span class="lbl">Hanafi Asr (later)</span>${sw('hanafi', s.hanafi)}</div>
      <div class="set"><span class="lbl">Friday: UAE khutbah at 12:45</span>${sw('friday', s.friday)}</div>
      <div class="set"><span class="lbl">Location<div class="small">${addressLines()[0]}</div><div class="tiny muted">${addressLines()[1]}</div>
        <div class="tiny muted">${s.hasLocation ? `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)} · ±${get('locAccuracy', 0)} m` : ''}</div></span><button class="pill" id="loc">Update</button></div>
    </div>
    <div class="label" style="margin:16px 4px 6px">Tahajjud</div>
    <div class="card">${stepper('th', 'Reminder before Fajr', s.tahajjud + ' min')}
      <div class="set"><span class="lbl">Chime when Noor is open</span>${sw('thalert', s.tahajjudAlert)}</div>
      <div class="set"><span class="lbl">Calendar reminders<div class="tiny muted">${get('tahajjudCalAt', 0) ? 'Added ' + new Date(get('tahajjudCalAt', 0)).toLocaleDateString() + ' · add again after 2 months or if you move' : '60 nights, with an alert at Tahajjud time'}</div></span><button class="pill" id="thcal2">Add</button></div>
      <div class="set"><span class="lbl">iPhone alarm (Shortcuts)<div class="tiny muted">${get('tahajjudShortcutAt', 0) ? 'Copied ' + new Date(get('tahajjudShortcutAt', 0)).toLocaleDateString() + ' · copy again after a year, if you move, or change settings' : 'A real alarm sound every night — copy times into your Shortcut'}</div></span><button class="pill" id="thsc">Copy</button></div>
    </div>
    <div class="label" style="margin:16px 4px 6px">Iqama — minutes after adhan</div>
    <div class="card">${names.map((n, k) => stepper('iq' + k, n, iq[k] + ' min')).join('')}</div>
    <div class="label" style="margin:16px 4px 6px">Fine-tune</div>
    <div class="card">${names.map((n, k) => stepper('of' + k, n, signed(off[k], 'min'))).join('')}
      ${stepper('hj', 'Hijri date', signed(s.hijriOffset, 'day'))}</div>
    <p class="note">Set the iqama minutes to match your masjid. Fine-tune moves an adhan time by a minute or two if your local timetable differs.</p>
    <div class="label" style="margin:16px 4px 6px">About</div>
    <div class="card note" style="margin-top:0">
      Prayer times are calculated on your phone (PrayTimes method). Noor can't send adhan notifications — iPhone doesn't allow web apps to schedule alarms, so the Tahajjud reminder goes through Calendar, or an iPhone Shortcut that sets a timer alarm each night.<br><br>
      Quran text: Quran.com Uthmani tajweed text (react-native-quran-tajweed, MIT). Font: Scheherazade New (SIL OFL).
      Adhkar: Hisn al-Muslim (morning-evening-adhkar-data, CC BY 4.0). Ratib: wird-al-sakran-data (CC BY 4.0).
      Recitations: Islamic Network CDN (alquran.cloud). Addresses: © OpenStreetMap contributors (Nominatim).<br><br>Your settings, favourites and counts are stored only on this iPhone.
    </div>`;

  const $ = id => document.getElementById(id);
  $('method').onchange = e => set('method', +e.target.value);
  $('hanafi').onchange = e => set('hanafi', e.target.checked);
  $('friday').onchange = e => set('friday', e.target.checked);
  $('thalert').onchange = e => set('tahajjudAlert', e.target.checked);
  $('thcal2').onclick = addTahajjudToCalendar;
  $('thsc').onclick = copyShortcutTimes;
  $('loc').onclick = () => requestLocation(true);
  view.addEventListener('click', e => {
    const th = e.target.closest('[data-theme-id]');
    if (th) {
      set('theme', th.dataset.themeId);
      applyTheme(th.dataset.themeId);
      view.querySelectorAll('.theme').forEach(x => x.classList.toggle('on', x === th));
      return;
    }
    const b = e.target.closest('[data-step]'); if (!b) return;
    const id = b.dataset.step, d = +b.dataset.d;
    if (id.startsWith('iq')) {
      const k = +id[2], a = settings.iqama; a[k] = Math.min(60, Math.max(0, a[k] + d)); set('iqama', a); $(id).textContent = a[k] + ' min';
    } else if (id.startsWith('of')) {
      const k = +id[2], a = settings.offsets; a[k] = Math.min(15, Math.max(-15, a[k] + d)); set('offsets', a); $(id).textContent = signed(a[k], 'min');
    } else if (id === 'th') {
      const v = Math.min(120, Math.max(10, settings.tahajjud + d * 5)); set('tahajjud', v); $(id).textContent = v + ' min';
    } else if (id === 'hj') {
      const v = Math.min(2, Math.max(-2, settings.hijriOffset + d)); set('hijriOffset', v); $(id).textContent = signed(v, 'day');
    }
  });
}

// ================= mini player =================

const mini = document.getElementById('mini');
function renderMini() {
  if (!player.current) { mini.hidden = true; return; }
  mini.hidden = false;
  const pct = player.progress * 100;
  mini.innerHTML = `
    <div class="t"><div style="font-weight:500">${surahEn(player.current)}${player.current !== RATIB && player.ayah ? ` <span class="muted small">· ${player.ayah}/${player.count}</span>` : ''}${player.error ? ` <span class="small" style="color:var(--near)">· ${player.error}</span>` : ''}</div>
      <div class="ar gold" style="text-align:left;font-size:15px">${surahAr(player.current)}</div></div>
    <button class="iconbtn" data-m="toggle">${player.playing ? ICON.pause : ICON.play}</button>
    <button class="iconbtn" data-m="next">${ICON.next}</button>
    <button class="iconbtn" data-m="stop">${ICON.close}</button>
    <div class="prog" style="width:${pct}%"></div>`;
}
mini.addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  ({ toggle, next, stop })[b.dataset.m]();
});
let miniFrame = 0;
player.onChange(() => {
  if (miniFrame) return;
  miniFrame = requestAnimationFrame(() => { miniFrame = 0; renderMini(); });
});

// ================= start =================

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (!location.hash) location.replace('#/today');
route();
