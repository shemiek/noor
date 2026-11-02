// Noor — screens and navigation.
import { get, set, settings, favourites, putFile, getFile, IQAMA_DEFAULTS } from './store.js';
import { METHODS, prayerDay, prayerName, prayerNameAr, nextPrayer, currentPrayer, hijri, qibla, PRAYERS } from './prayer.js';
import { RATIB, RECITERS, reciterName, surahEn, surahAr, surahHtml, RULE_NAMES, LEGEND, KINDS, adhkar, TASBIH } from './data.js';
import { player, play, toggle, next, stop, resetRatib } from './audio.js';
import { ICON, toast, sheet, fmtTime, fmtDur, SPEEDS, AutoScroller, beep } from './ui.js';

const view = document.getElementById('view');
let cleanups = [];
const onLeave = fn => cleanups.push(fn);

// ================= router =================

function route() {
  cleanups.forEach(f => { try { f(); } catch { /* ignore */ } });
  cleanups = [];
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
    set('lat', p.coords.latitude); set('lon', p.coords.longitude); set('hasLocation', true);
    set('locTime', Date.now());
    if (force) toast('Location updated');
    if ((location.hash || '#/today').startsWith('#/today')) route();
  }, () => { if (force) toast('Location is off — allow it in Settings → Safari → Location'); },
  { enableHighAccuracy: false, maximumAge: 30 * 60000, timeout: 15000 });
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
  draw();
  const timer = setInterval(draw, 1000);
  onLeave(() => clearInterval(timer));
  document.getElementById('masjid').onclick = () => {
    const url = `https://maps.apple.com/?q=mosque&sll=${settings.lat.toFixed(5)},${settings.lon.toFixed(5)}&z=14`;
    window.open(url, '_blank');
  };
  const loc = document.getElementById('loc');
  if (loc) loc.onclick = () => requestLocation(true);
  requestLocation();
}

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
  return `
    <div style="margin:6px 0 14px">
      <div class="hijri-ar ar" style="text-align:left">${h.ar}</div>
      <div class="gold">${h.en}</div>
      <div class="dim small">${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        · ${settings.hasLocation ? 'Your location' : 'Dubai'}</div>
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
    <div class="card times">${rows}</div>`;
}

// ================= Qibla =================

function qiblaScreen() {
  const q = qibla(settings.lat, settings.lon);
  const ticks = Array.from({ length: 72 }, (_, k) => {
    const major = k % 18 === 0;
    return `<line x1="140" y1="${major ? 10 : 14}" x2="140" y2="${major ? 26 : 22}" stroke="${major ? '#edeae4' : '#4a453d'}" stroke-width="${major ? 2 : 1}" transform="rotate(${k * 5} 140 140)"/>`;
  }).join('');
  const letters = ['N', 'E', 'S', 'W'].map((s, k) =>
    `<text x="140" y="48" text-anchor="middle" font-size="15" font-weight="600" fill="${s === 'N' ? '#c9a96e' : '#9c968c'}" transform="rotate(${k * 90} 140 140)">${s}</text>`).join('');
  view.innerHTML = `
    <div class="row"><a class="iconbtn" href="#/today">${ICON.back}</a><h1 style="margin:0">Qibla</h1></div>
    <div style="text-align:center;margin-top:8px">
      <div class="ar goldl" style="font-size:34px;direction:rtl">القبلة</div>
      <div class="dim small">${Math.round(q.bearing)}° from north · ${Math.round(q.km).toLocaleString()} km to Makkah</div>
    </div>
    <div class="dial" id="dial">
      <svg class="face" id="face" viewBox="0 0 280 280"><circle cx="140" cy="140" r="138" fill="none" stroke="#3a3226" stroke-width="1.5"/>${ticks}${letters}</svg>
      <svg class="arrow" id="arrow" viewBox="0 0 280 280" style="transform:rotate(${q.bearing}deg)">
        <path d="M140 30 L158 78 L140 68 L122 78 Z" fill="#c9a96e"/><line x1="140" y1="68" x2="140" y2="118" stroke="#c9a96e" stroke-width="3"/></svg>
      <div class="kaaba"></div>
    </div>
    <p id="qmsg" style="text-align:center">Tap the button, then hold your phone flat.</p>
    <div style="text-align:center"><button class="pill" id="start">${ICON.compass} Start compass</button></div>
    <p class="note" style="text-align:center">If it looks wrong, move the phone in a figure-8 to calibrate. Without the compass, the gold arrow shows the direction relative to north.</p>`;

  const face = document.getElementById('face'), arrow = document.getElementById('arrow');
  const dial = document.getElementById('dial'), msg = document.getElementById('qmsg');
  let wasOk = false;
  const onOrient = e => {
    let heading = e.webkitCompassHeading;
    if (heading == null && e.absolute && e.alpha != null) heading = 360 - e.alpha;
    if (heading == null) return;
    face.style.transform = `rotate(${-heading}deg)`;
    const rot = q.bearing - heading;
    arrow.style.transform = `rotate(${rot}deg)`;
    const diff = Math.abs(((rot % 360) + 540) % 360 - 180);
    const ok = diff < 4;
    dial.classList.toggle('ok', ok);
    msg.innerHTML = ok ? '<b class="goldl">You are facing the Qibla</b>' : 'Turn until the gold arrow points straight up';
    if (ok && !wasOk) beep(true);
    wasOk = ok;
  };
  document.getElementById('start').onclick = async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { msg.textContent = 'Compass permission was declined.'; return; }
      }
      window.addEventListener('deviceorientation', onOrient, true);
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      document.getElementById('start').hidden = true;
      msg.textContent = 'Hold your phone flat…';
    } catch { msg.textContent = 'Compass not available on this device.'; }
  };
  onLeave(() => {
    window.removeEventListener('deviceorientation', onOrient, true);
    window.removeEventListener('deviceorientationabsolute', onOrient, true);
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
  $('rlisten').onclick = () => { play(n, { playlist: favMode ? favourites.all() : null }); toast(`Playing ${surahEn(n)} — ${reciterName(settings.reciter)}`); };
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
  if (saved && saved.surah === n && saved.frac > 0.001) {
    requestAnimationFrame(() => { scroller.scrollTop = saved.frac * (scroller.scrollHeight - scroller.clientHeight); });
  } else {
    set('reader', { surah: n, frac: 0 });
  }
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
  const st = Object.assign({ index: -1, step: 0, count: 0, round: 1, total: 0, sound: false }, get('tasbih', {}));
  const save = () => set('tasbih', st);
  const cur = () => st.index < 0 ? TASBIH[[0, 1, 2][Math.min(st.step, 2)]] : TASBIH[st.index];

  view.innerHTML = `<div id="counter">
    <button id="cname" style="text-align:center"></button>
    <div class="ring"><svg viewBox="0 0 270 270"><circle cx="135" cy="135" r="125" fill="none" stroke="#3a3226" stroke-width="10"/>
      <circle id="arc" cx="135" cy="135" r="125" fill="none" stroke="#c9a96e" stroke-width="10" stroke-linecap="round" stroke-dasharray="785.4" stroke-dashoffset="785.4" style="transition:stroke-dashoffset .2s"/></svg>
      <div class="big"><div class="cnt" id="cnt">0</div><div class="cap" id="cap"></div></div></div>
    <div class="row">
      <button class="pill" id="cminus">−1</button>
      <button class="pill" id="creset">${ICON.reset} Reset</button>
      <button class="pill" id="csound"></button>
    </div>
    <div class="tiny muted" id="ctotal"></div></div>`;
  const $ = id => document.getElementById(id);

  const draw = () => {
    const t = cur();
    $('cname').innerHTML = t.ar ? `<div class="ar goldl" style="font-size:36px;line-height:1.5">${t.ar}</div><div class="dim small">${t.en} ⌄</div>`
      : `<div style="font-size:26px;font-weight:300" class="goldl">Free count</div><div class="dim small">tap to choose ⌄</div>`;
    $('cnt').textContent = st.count;
    $('cnt').style.color = t.target && st.count >= t.target ? 'var(--gold-light)' : 'var(--silver)';
    let cap = st.index < 0 ? `STEP ${st.step + 1} OF 3 · TARGET ${t.target}` : t.target ? `TARGET ${t.target}` : 'NO TARGET';
    if (st.round > 1) cap += ` · ROUND ${st.round}`;
    $('cap').textContent = cap;
    $('arc').style.strokeDashoffset = t.target ? 785.4 * (1 - Math.min(1, st.count / t.target)) : 785.4;
    $('csound').textContent = st.sound ? '🔔 Sound on' : '🔕 Sound off';
    $('ctotal').textContent = `Tap anywhere to count · Total ${st.total}`;
  };
  draw();

  const add = () => {
    const t = cur();
    if (t.target && st.count >= t.target) {
      if (st.index < 0 && st.step < 2) st.step++; else { st.round++; if (st.index < 0) st.step = 0; }
      st.count = 0;
    }
    st.count++; st.total++;
    const hit = cur().target && st.count === cur().target;
    if (st.sound || hit) beep(hit);
    save(); draw();
  };
  const box = $('counter');
  box.addEventListener('click', e => { if (!e.target.closest('button')) add(); });
  $('cminus').onclick = () => { if (st.count > 0) st.count--; save(); draw(); };
  $('creset').onclick = () => { st.count = 0; st.step = 0; st.round = 1; save(); draw(); };
  $('csound').onclick = () => { st.sound = !st.sound; save(); draw(); };
  $('cname').onclick = () => sheet('Choose dhikr',
    `<button class="srow" style="width:100%" data-i="-1">After-prayer tasbih (33 · 33 · 34)</button>` +
    TASBIH.map((t, k) => `<button class="srow" style="width:100%" data-i="${k}"><span style="flex:1;text-align:left">${t.ar ? t.en : 'Free count (no target)'}</span>
      ${t.ar ? `<span class="ar goldl" style="font-size:20px">${t.ar}</span>` : ''}${t.target ? `<span class="muted small">×${t.target}</span>` : ''}</button>`).join(''),
    (e, close) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
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

  view.innerHTML = `
    <h1>Settings</h1>
    <div class="label" style="margin:0 4px 6px">Prayer times</div>
    <div class="card">
      <div class="set"><span class="lbl">Calculation</span><select id="method">${METHODS.map((m, k) => `<option value="${k}" ${k === s.method ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>
      <div class="set"><span class="lbl">Hanafi Asr (later)</span>${sw('hanafi', s.hanafi)}</div>
      <div class="set"><span class="lbl">Friday: UAE khutbah at 12:45</span>${sw('friday', s.friday)}</div>
      <div class="set"><span class="lbl">Location<div class="tiny muted">${s.hasLocation ? `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}` : 'Dubai (default)'}</div></span><button class="pill" id="loc">Update</button></div>
    </div>
    <div class="label" style="margin:16px 4px 6px">Iqama — minutes after adhan</div>
    <div class="card">${names.map((n, k) => stepper('iq' + k, n, iq[k] + ' min')).join('')}</div>
    <div class="label" style="margin:16px 4px 6px">Fine-tune</div>
    <div class="card">${names.map((n, k) => stepper('of' + k, n, signed(off[k], 'min'))).join('')}
      ${stepper('hj', 'Hijri date', signed(s.hijriOffset, 'day'))}</div>
    <p class="note">Set the iqama minutes to match your masjid. Fine-tune moves an adhan time by a minute or two if your local timetable differs.</p>
    <div class="label" style="margin:16px 4px 6px">About</div>
    <div class="card note" style="margin-top:0">
      Prayer times are calculated on your phone (PrayTimes method). Noor can't send adhan notifications — iPhone doesn't allow web apps to schedule alarms.<br><br>
      Quran text: Quran.com Uthmani tajweed text (react-native-quran-tajweed, MIT). Font: Scheherazade New (SIL OFL).
      Adhkar: Hisn al-Muslim (morning-evening-adhkar-data, CC BY 4.0). Ratib: wird-al-sakran-data (CC BY 4.0).
      Recitations: Islamic Network CDN (alquran.cloud).<br><br>Your settings, favourites and counts are stored only on this iPhone.
    </div>`;

  const $ = id => document.getElementById(id);
  $('method').onchange = e => set('method', +e.target.value);
  $('hanafi').onchange = e => set('hanafi', e.target.checked);
  $('friday').onchange = e => set('friday', e.target.checked);
  $('loc').onclick = () => requestLocation(true);
  view.addEventListener('click', e => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    const id = b.dataset.step, d = +b.dataset.d;
    if (id.startsWith('iq')) {
      const k = +id[2], a = settings.iqama; a[k] = Math.min(60, Math.max(0, a[k] + d)); set('iqama', a); $(id).textContent = a[k] + ' min';
    } else if (id.startsWith('of')) {
      const k = +id[2], a = settings.offsets; a[k] = Math.min(15, Math.max(-15, a[k] + d)); set('offsets', a); $(id).textContent = signed(a[k], 'min');
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
  const pct = player.duration ? (player.position / player.duration) * 100 : 0;
  mini.innerHTML = `
    <div class="t"><div style="font-weight:500">${surahEn(player.current)}</div>
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
