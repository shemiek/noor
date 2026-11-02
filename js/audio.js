// Quran player: plays verse by verse (so the reader can highlight the ayah being recited),
// plus the Ratib recording. Lock-screen controls via Media Session.
import { get, set, settings, getFile } from './store.js';
import { RATIB, surahEn, surahAr, reciterName } from './data.js';
import { AYAH_COUNTS } from './surahs.js';

const audio = new Audio();
audio.preload = 'auto';
let ratibUrl = null;
const listeners = new Set();
const BITRATES = [128, 64, 192, 48, 40, 32];   // not every reciter has every quality; try in order
let bitrateIdx = 0;

export const player = {
  current: 0,          // surah number, RATIB, or 0
  ayah: 0,             // ayah being recited (0 = the Bismillah before ayah 1)
  playlist: null,      // favourites order when playing them
  speed: get('speed', 1),
  error: null,
  get playing() { return !audio.paused && !audio.ended; },
  get count() { return player.current >= 1 && player.current <= 114 ? AYAH_COUNTS[player.current - 1] : 0; },
  /** Progress 0…1 through the surah (or the Ratib file). */
  get progress() {
    if (player.current === RATIB) return audio.duration ? audio.currentTime / audio.duration : 0;
    if (!player.count) return 0;
    const within = audio.duration ? audio.currentTime / audio.duration : 0;
    return Math.min(1, (Math.max(0, player.ayah - 1) + within) / player.count);
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

const emit = () => listeners.forEach(f => { try { f(); } catch { /* ignore */ } });

const globalAyah = (s, a) => AYAH_COUNTS.slice(0, s - 1).reduce((x, y) => x + y, 0) + a;
const hasBismillah = s => s !== 1 && s !== 9;
const ayahUrl = (s, a, br) => `https://cdn.islamic.network/quran/audio/${br}/${settings.reciter}/${a === 0 ? 1 : globalAyah(s, a)}.mp3`;

function applySpeed() {
  audio.defaultPlaybackRate = player.speed;
  audio.playbackRate = player.speed;
  audio.preservesPitch = true;
}

async function startAyah(s, a) {
  player.current = s;
  player.ayah = a;
  player.error = null;
  audio.src = ayahUrl(s, a, BITRATES[bitrateIdx]);
  applySpeed();
  try { await audio.play(); } catch { /* needs a tap first */ }
  applySpeed();
  set('lastTrack', s); set('lastAyah', a);
  updateSession();
  emit();
  // warm the cache for the next ayah so there is no gap
  const n = a < AYAH_COUNTS[s - 1] ? a + 1 : null;
  if (n) fetch(ayahUrl(s, n, BITRATES[bitrateIdx]), { mode: 'no-cors' }).catch(() => {});
}

/** Play a surah (from an ayah) or the Ratib recording. */
export async function play(track, { playlist = undefined, ayah = 1 } = {}) {
  if (playlist !== undefined) player.playlist = playlist;
  else if (!player.playlist || !player.playlist.includes(track)) player.playlist = null;

  if (track === RATIB) {
    if (!ratibUrl) {
      const blob = await getFile('ratib');
      if (!blob) return false;
      ratibUrl = URL.createObjectURL(blob);
    }
    player.current = RATIB; player.ayah = 0; player.error = null;
    audio.src = ratibUrl;
    applySpeed();
    try { await audio.play(); } catch { /* needs a tap first */ }
    applySpeed();
    updateSession(); emit();
    return true;
  }
  bitrateIdx = 0;
  await startAyah(track, ayah === 1 && hasBismillah(track) ? 0 : ayah);
  return true;
}

export function resetRatib() { if (ratibUrl) URL.revokeObjectURL(ratibUrl); ratibUrl = null; }

export function toggle() {
  if (!player.current) {
    const last = get('lastTrack', 0);
    if (last && last !== RATIB) play(last, { ayah: Math.max(1, get('lastAyah', 1)) });
    else if (last === RATIB) play(RATIB);
    return;
  }
  if (audio.paused) { applySpeed(); audio.play().catch(() => {}); } else audio.pause();
}

export function setSpeed(r) {
  player.speed = r;
  set('speed', r);
  applySpeed();
  emit();
}

/** Jump to an ayah of the surah being played (or start that surah there). */
export function playAyah(s, a) {
  if (player.current !== s) return play(s, { ayah: a });
  bitrateIdx = 0;
  startAyah(s, a);
}

export function nextAyah() {
  const s = player.current;
  if (s >= 1 && s <= 114 && player.ayah < AYAH_COUNTS[s - 1]) startAyah(s, player.ayah + 1);
  else next();
}

export function prevAyah() {
  const s = player.current;
  if (s === RATIB) { audio.currentTime = 0; return; }
  if (audio.currentTime > 3 || player.ayah <= 1) { audio.currentTime = 0; return; }
  startAyah(s, player.ayah - 1);
}

/** Next surah (following your favourites order when playing them). */
export function next() {
  const t = player.current;
  let n = null;
  if (player.playlist) {
    const i = player.playlist.indexOf(t);
    n = i >= 0 && i + 1 < player.playlist.length ? player.playlist[i + 1] : null;
  } else if (t >= 1 && t < 114) n = t + 1;
  if (n) play(n); else stop();
}

export function previous() {
  const t = player.current;
  if (t === RATIB || player.ayah > 1) { if (t === RATIB) audio.currentTime = 0; else play(t); return; }
  let n = null;
  if (player.playlist) {
    const i = player.playlist.indexOf(t);
    n = i > 0 ? player.playlist[i - 1] : null;
  } else if (t > 1) n = t - 1;
  if (n) play(n); else play(t);
}

export function stop() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  player.current = 0; player.ayah = 0; player.playlist = null;
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  emit();
}

function updateSession() {
  if (!('mediaSession' in navigator) || !player.current) return;
  const t = player.current;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t === RATIB ? 'Ratib al-Haddad' : `${surahEn(t)} · ${player.ayah || 'Bismillah'}`,
    artist: t === RATIB ? 'Ratib al-Haddad' : `${surahAr(t)} — ${reciterName(settings.reciter)}`,
    album: 'Noor',
    artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const h = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* not supported */ } };
  h('play', () => { applySpeed(); audio.play(); });
  h('pause', () => audio.pause());
  h('nexttrack', () => (player.current === RATIB ? next() : nextAyah()));
  h('previoustrack', () => (player.current === RATIB ? previous() : prevAyah()));
}

audio.addEventListener('timeupdate', emit);
audio.addEventListener('play', emit);
audio.addEventListener('pause', emit);
audio.addEventListener('ended', () => {
  if (player.current === RATIB) return stop();
  nextAyah();
});
audio.addEventListener('error', () => {
  if (!player.current || player.current === RATIB) return;
  // this reciter may not have this quality — try the next one before giving up
  if (bitrateIdx < BITRATES.length - 1) { bitrateIdx++; startAyah(player.current, player.ayah); return; }
  player.error = 'Audio needs internet';
  audio.pause();
  emit();
});
