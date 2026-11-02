// Shared UI helpers: icons, toast, bottom sheets, auto-scroll.

const svg = (d, extra = '') => `<svg class="icon" viewBox="0 0 24 24" ${extra}>${d}</svg>`;
export const ICON = {
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  pause: svg('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>'),
  next: svg('<path d="M5 5v14l9-7zM16 5h3v14h-3z" fill="currentColor"/>'),
  prev: svg('<path d="M19 5v14l-9-7zM5 5h3v14H5z" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: svg('<path d="M15 5 8 12l7 7"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  book: svg('<path d="M4 5c2.7-1.2 5.3-1.2 8 .6 2.7-1.8 5.3-1.8 8-.6v13c-2.7-1.2-5.3-1.2-8 .6-2.7-1.8-5.3-1.8-8-.6zM12 5.6v13"/>'),
  scroll: svg('<path d="M12 4v14M6 12l6 6 6-6"/>'),
  palette: svg('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.3" fill="currentColor"/>'),
  more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  mosque: svg('<path d="M12 3v2M7 11a5 5 0 0 1 10 0M5 11h14v9H5zM10 20v-3a2 2 0 0 1 4 0v3M3 20V9l1-2 1 2v11M19 20V9l1-2 1 2v11"/>'),
  music: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
};

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/** Bottom sheet. Returns a close function. */
export function sheet(title, html, onClick) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"><h3>${title}</h3>${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', e => {
    if (e.target === bg) return close();
    if (onClick) onClick(e, close);
  });
  document.body.appendChild(bg);
  return close;
}

export const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function fmtDur(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}

export const SPEEDS = [
  { label: 'Off', px: 0 }, { label: 'Slow', px: 14 }, { label: 'Medium', px: 24 }, { label: 'Fast', px: 38 },
];

/** Smooth auto-scroll for an element (or the page). Touching pauses it for 3 seconds. */
export class AutoScroller {
  constructor(el, { target = el, onEnd = null } = {}) {
    this.el = el; this.target = target; this.onEnd = onEnd;
    this.speed = 0; this.pausedUntil = 0; this.carry = 0; this.endAt = 0; this.last = 0;
    this.handlers = [
      ['touchstart', () => { this.pausedUntil = Infinity; }],
      ['touchend', () => { this.pausedUntil = Date.now() + 3000; }],
      ['touchcancel', () => { this.pausedUntil = Date.now() + 3000; }],
      ['wheel', () => { this.pausedUntil = Date.now() + 3000; }],
    ];
    this.handlers.forEach(([e, f]) => target.addEventListener(e, f, { passive: true }));
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }
  tick(ts) {
    const dt = this.last ? Math.min((ts - this.last) / 1000, 0.1) : 0;
    this.last = ts;
    if (this.speed > 0 && Date.now() > this.pausedUntil) {
      const max = this.el.scrollHeight - this.el.clientHeight;
      if (this.el.scrollTop < max - 1) {
        this.endAt = 0;
        this.carry += this.speed * dt;
        const px = Math.floor(this.carry);
        if (px > 0) { this.el.scrollTop += px; this.carry -= px; }
      } else if (this.onEnd) {
        if (!this.endAt) this.endAt = Date.now();
        else if (Date.now() - this.endAt > 3000) { this.endAt = 0; this.onEnd(); }
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.handlers.forEach(([e, f]) => this.target.removeEventListener(e, f));
  }
}

/** Short click / chime for the counter (iPhones don't allow vibration from web pages). */
let actx;
/** Call from a tap so iPhone allows the sound to play later. */
beep.prime = () => {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch { /* no audio */ }
};
export function beep(strong = false) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.value = strong ? 880 : 1400;
    g.gain.setValueAtTime(strong ? 0.25 : 0.08, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (strong ? 0.45 : 0.05));
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + (strong ? 0.5 : 0.06));
  } catch { /* audio not available */ }
  if (navigator.vibrate) navigator.vibrate(strong ? [40, 60, 40] : 12);
}
