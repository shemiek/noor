// Small wrapper around localStorage (everything stays on the phone).
const P = 'noor.';

export function get(key, def) {
  try {
    const v = localStorage.getItem(P + key);
    return v === null ? def : JSON.parse(v);
  } catch { return def; }
}

export function set(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export const IQAMA_DEFAULTS = [20, 20, 20, 5, 20]; // Fajr, Dhuhr, Asr, Maghrib, Isha

export const settings = {
  get method() { return get('method', 0); },
  get hanafi() { return get('hanafi', false); },
  get friday() { return get('friday', true); },
  get hijriOffset() { return get('hijriOffset', 0); },
  get iqama() { return get('iqama', IQAMA_DEFAULTS.slice()); },
  get offsets() { return get('offsets', [0, 0, 0, 0, 0]); },
  get lat() { return get('lat', 25.2048); },      // Dubai until we know better
  get lon() { return get('lon', 55.2708); },
  get hasLocation() { return get('hasLocation', false); },
  get reciter() { return get('reciter', 'ar.alafasy'); },
};

// ----- favourites (kept in the order you choose) -----
export const favourites = {
  all() { return get('favourites', []).filter(n => n >= 1 && n <= 114); },
  save(list) { set('favourites', list); },
  has(n) { return this.all().includes(n); },
  toggle(n) {
    const l = this.all();
    const i = l.indexOf(n);
    if (i >= 0) l.splice(i, 1); else l.push(n);
    this.save(l);
    return i < 0;
  },
  move(n, delta) {
    const l = this.all();
    const i = l.indexOf(n), j = i + delta;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    this.save(l);
  },
  after(n) {
    const l = this.all();
    const i = l.indexOf(n);
    return i >= 0 && i + 1 < l.length ? l[i + 1] : null;
  },
};

// ----- files you add (Ratib recording) kept in IndexedDB -----
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('noor', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function putFile(key, blob) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('files', 'readwrite');
    tx.objectStore('files').put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(key) {
  const d = await db();
  return new Promise((resolve) => {
    const r = d.transaction('files').objectStore('files').get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => resolve(null);
  });
}
