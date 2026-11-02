// Quran / Ratib player with lock-screen controls (Media Session).
import { get, set, settings, getFile } from './store.js';
import { RATIB, audioUrl, surahEn, surahAr, reciterName } from './data.js';

const audio = new Audio();
audio.preload = 'auto';
let ratibUrl = null;
const listeners = new Set();

export const player = {
  current: 0,          // surah number, RATIB, or 0
  playlist: null,      // favourites order when playing them
  get playing() { return !audio.paused && !audio.ended; },
  get position() { return audio.currentTime || 0; },
  get duration() { return isFinite(audio.duration) ? audio.duration : 0; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

const emit = () => listeners.forEach(f => f());

export async function play(track, { playlist = undefined, from = 0 } = {}) {
  if (playlist !== undefined) player.playlist = playlist;
  else if (!player.playlist || !player.playlist.includes(track)) player.playlist = null;

  let src;
  if (track === RATIB) {
    if (!ratibUrl) {
      const blob = await getFile('ratib');
      if (!blob) return false;
      ratibUrl = URL.createObjectURL(blob);
    }
    src = ratibUrl;
  } else {
    src = audioUrl(settings.reciter, track);
  }
  player.current = track;
  audio.src = src;
  if (from) audio.currentTime = from;
  try { await audio.play(); } catch { /* needs a tap first, or no internet */ }
  updateSession();
  emit();
  return true;
}

export function resetRatib() { if (ratibUrl) URL.revokeObjectURL(ratibUrl); ratibUrl = null; }

export function toggle() {
  if (!player.current) {
    const last = get('lastTrack', 0);
    if (last) play(last, { from: get('lastPos', 0) });
    return;
  }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

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
  if (audio.currentTime > 5 || t === RATIB) { audio.currentTime = 0; return; }
  let n = null;
  if (player.playlist) {
    const i = player.playlist.indexOf(t);
    n = i > 0 ? player.playlist[i - 1] : null;
  } else if (t > 1) n = t - 1;
  if (n) play(n); else audio.currentTime = 0;
}

export function seek(sec) { audio.currentTime = sec; }

export function stop() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  player.current = 0;
  player.playlist = null;
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  emit();
}

function updateSession() {
  if (!('mediaSession' in navigator) || !player.current) return;
  const t = player.current;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${surahEn(t)}  ${surahAr(t)}`,
    artist: t === RATIB ? 'Ratib al-Haddad' : reciterName(settings.reciter),
    album: 'Noor',
    artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const h = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* not supported */ } };
  h('play', () => audio.play());
  h('pause', () => audio.pause());
  h('nexttrack', next);
  h('previoustrack', previous);
  h('seekto', e => { if (e.seekTime != null) audio.currentTime = e.seekTime; });
}

let lastSave = 0;
audio.addEventListener('timeupdate', () => {
  if (Date.now() - lastSave > 5000 && player.current) {
    lastSave = Date.now();
    set('lastTrack', player.current);
    set('lastPos', audio.currentTime);
  }
  emit();
});
audio.addEventListener('play', emit);
audio.addEventListener('pause', emit);
audio.addEventListener('ended', next);
audio.addEventListener('error', () => { if (player.current) emit(); });
export const audioError = () => audio.error;
