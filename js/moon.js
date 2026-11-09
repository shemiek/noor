// Moon: phase, rise/set, next phases and the drawing. Works offline.
// Uses a low-precision series for the Moon and Sun (P. Schlyter). Times are good to a few minutes.

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const rev = x => ((x % 360) + 360) % 360;
const sind = x => Math.sin(x * RAD), cosd = x => Math.cos(x * RAD);
const toJD = ms => ms / 86400000 + 2440587.5;
const fromJD = jd => new Date((jd - 2440587.5) * 86400000);
const sdiff = a => ((a + 540) % 360) - 180;          // angle → [-180, 180)

function sunLon(d) {
  const M = rev(356.0470 + 0.9856002585 * d), w = 282.9404 + 4.70935e-5 * d;
  return rev(M + w + 1.915 * sind(M) + 0.020 * sind(2 * M));
}

/** Moon position for a Julian day: ecliptic longitude, distance (Earth radii), RA/Dec, plus the Sun's longitude. */
function moonPos(jd) {
  const d = jd - 2451543.5;
  const N = rev(125.1228 - 0.0529538083 * d), i = 5.1454, w = rev(318.0634 + 0.1643573223 * d);
  const a = 60.2666, e = 0.0549, M = rev(115.3654 + 13.0649929509 * d);
  let E = M + e * DEG * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 5; k++) E -= (E - e * DEG * sind(E) - M) / (1 - e * cosd(E));
  const xv = a * (cosd(E) - e), yv = a * Math.sqrt(1 - e * e) * sind(E);
  let r = Math.hypot(xv, yv);
  const v = rev(Math.atan2(yv, xv) * DEG);
  const xh = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i));
  const yh = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i));
  const zh = r * sind(v + w) * sind(i);
  let lon = Math.atan2(yh, xh) * DEG, lat = Math.atan2(zh, Math.hypot(xh, yh)) * DEG;
  const Ms = rev(356.0470 + 0.9856002585 * d), ws = 282.9404 + 4.70935e-5 * d;
  const D = (N + w + M) - (Ms + ws), F = (N + w + M) - N;
  lon += -1.274 * sind(M - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms) - 0.059 * sind(2 * M - 2 * D)
    - 0.057 * sind(M - 2 * D + Ms) + 0.053 * sind(M + 2 * D) + 0.046 * sind(2 * D - Ms) + 0.041 * sind(M - Ms)
    - 0.035 * sind(D) - 0.031 * sind(M + Ms) - 0.015 * sind(2 * F - 2 * D) + 0.011 * sind(M - 4 * D);
  lat += -0.173 * sind(F - 2 * D) - 0.055 * sind(M - F - 2 * D) - 0.046 * sind(M + F - 2 * D)
    + 0.033 * sind(F + 2 * D) + 0.017 * sind(2 * M + F);
  r += -0.58 * cosd(M - 2 * D) - 0.46 * cosd(2 * D);
  lon = rev(lon);
  const ecl = 23.4393 - 3.563e-7 * d;
  const xg = r * cosd(lon) * cosd(lat), yg = r * sind(lon) * cosd(lat), zg = r * sind(lat);
  const ye = yg * cosd(ecl) - zg * sind(ecl), ze = yg * sind(ecl) + zg * cosd(ecl);
  return { lon, r, ra: rev(Math.atan2(ye, xg) * DEG), dec: Math.atan2(ze, Math.hypot(xg, ye)) * DEG, sun: sunLon(d) };
}

const elong = jd => { const m = moonPos(jd); return rev(m.lon - m.sun); };   // 0 new, 90 first quarter, 180 full, 270 last quarter

/** Julian day when the Moon–Sun elongation reaches `target`, searching forward (dir=1) or back (dir=-1). */
function crossing(jd0, target, dir) {
  const f = jd => sdiff(elong(jd) - target);
  let a = jd0, fa = f(a);
  for (let n = 0; n < 160; n++) {
    const b = a + dir * 0.25, fb = f(b);
    const [lo, hi, flo, fhi] = dir > 0 ? [a, b, fa, fb] : [b, a, fb, fa];
    if (flo < 0 && fhi >= 0) {
      let x = lo, y = hi;
      for (let k = 0; k < 32; k++) { const m = (x + y) / 2; if (f(m) < 0) x = m; else y = m; }
      return (x + y) / 2;
    }
    a = b; fa = fb;
  }
  return null;
}

const NAMES = [[12, 'New moon'], [78, 'Waxing crescent'], [102, 'First quarter'], [168, 'Waxing gibbous'],
  [192, 'Full moon'], [258, 'Waning gibbous'], [282, 'Last quarter'], [348, 'Waning crescent'], [361, 'New moon']];
export const PHASE_ICON = { 'New moon': '🌑', 'First quarter': '🌓', 'Full moon': '🌕', 'Last quarter': '🌗' };

/** Phase now: lit fraction k (0–1), percent, waxing?, name, age since the last new moon, distance. */
export function moonInfo(date = new Date()) {
  const jd = toJD(date.getTime());
  const m = moonPos(jd), el = rev(m.lon - m.sun);
  const k = (1 - cosd(el)) / 2;
  const lastNew = crossing(jd, 0, -1);
  return {
    k, pct: Math.round(k * 100), waxing: el < 180, el,
    name: NAMES.find(([end]) => el < end)[1],
    ageDays: lastNew ? jd - lastNew : el / 12.19,
    distKm: Math.round(m.r * 6378.14 / 100) * 100,
  };
}

/** Next four principal phases after `date`, soonest first: [{ name, date }]. */
export function nextPhases(date = new Date()) {
  const jd = toJD(date.getTime());
  return [[0, 'New moon'], [90, 'First quarter'], [180, 'Full moon'], [270, 'Last quarter']]
    .map(([t, name]) => ({ name, date: fromJD(crossing(jd, t, 1)) }))
    .sort((a, b) => a.date - b.date);
}

/** Time since the last new moon (conjunction) at `date`, in hours. */
export function ageHours(date) {
  const jd = toJD(date.getTime());
  const c = crossing(jd, 0, -1);
  return c == null ? null : (jd - c) * 24;
}

function altitude(jd, lat, lon) {
  const m = moonPos(jd);
  const gmst = rev(280.46061837 + 360.98564736629 * (jd - 2451545.0));
  const H = rev(gmst + lon - m.ra);
  const alt = Math.asin(sind(lat) * sind(m.dec) + cosd(lat) * cosd(m.dec) * cosd(H)) * DEG;
  return alt - Math.asin(1 / m.r) * DEG * cosd(alt);              // topocentric
}
const H0 = -0.8;                                                   // refraction + the Moon's radius

/** Scan [from, to] for the Moon rising (up) or setting (down). */
function scan(from, to, lat, lon, up) {
  const f = ms => altitude(toJD(ms), lat, lon) - H0;
  const step = 5 * 60000;
  let a = from, fa = f(a);
  while (a < to) {
    const b = Math.min(a + step, to), fb = f(b);
    if (up ? (fa < 0 && fb >= 0) : (fa >= 0 && fb < 0)) {
      let x = a, y = b;
      for (let k = 0; k < 22; k++) { const m = (x + y) / 2; if ((f(m) >= 0) === up) y = m; else x = m; }
      return new Date((x + y) / 2);
    }
    a = b; fa = fb;
  }
  return null;
}

/** Moonrise and moonset during the local calendar day of `date` (null if none that day). */
export function moonRiseSet(date, lat, lon) {
  const s = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return { rise: scan(s, s + 86400000, lat, lon, true), set: scan(s, s + 86400000, lat, lon, false) };
}

/** Evening view for the start of a Hijri month: Moon's age at sunset and when it sets compared with the Sun. */
export function atSunset(sunset, lat, lon) {
  const age = ageHours(sunset);
  const set = scan(sunset.getTime() - 4 * 3600000, sunset.getTime() + 5 * 3600000, lat, lon, false);
  const upAtSunset = altitude(toJD(sunset.getTime()), lat, lon) - H0 >= 0;
  return { ageHours: age, lagMin: set ? Math.round((set - sunset) / 60000) : null, upAtSunset };
}

/** Upcoming crescent nights: the first sunset after each new moon. `sunsetOf(day)` must return that day's sunset (Date). */
export function crescentNights(from, count, lat, lon, sunsetOf) {
  const out = [];
  let jd = toJD(from.getTime()) - 1.5;                         // also catches a new moon just before `from`
  for (let guard = 0; guard < count + 3 && out.length < count; guard++) {
    const c = crossing(jd, 0, 1);
    if (c == null) break;
    const conj = fromJD(c);
    let day = new Date(conj.getFullYear(), conj.getMonth(), conj.getDate()), sunset = sunsetOf(day);
    if (sunset <= conj) { day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1); sunset = sunsetOf(day); }
    jd = c + 20;
    if (sunset.getTime() + 3 * 3600000 < from.getTime()) continue;   // already over
    const set = scan(sunset.getTime() - 4 * 3600000, sunset.getTime() + 5 * 3600000, lat, lon, false);
    out.push({ conj, sunset, ageHours: (sunset - conj) / 3600000, lagMin: set ? Math.round((set - sunset) / 60000) : null });
  }
  return out;
}

/** SVG of the Moon with the lit part drawn from the real phase. Waxing is lit on the right in the north, on the left in the south. */
export function moonSvg({ k, waxing }, { size = 56, lat = 25, id = 'm' } = {}) {
  const r = 46, c = 50;
  let lit = '';
  if (k > 0.012) {
    if (k > 0.988) lit = `M${c} ${c - r}A${r} ${r} 0 1 1 ${c} ${c + r}A${r} ${r} 0 1 1 ${c} ${c - r}Z`;
    else {
      const b = Math.abs(2 * k - 1) * r;
      lit = `M${c} ${c - r}A${r} ${r} 0 0 1 ${c} ${c + r}` +
        (b < 0.5 ? `L${c} ${c - r}` : `A${b.toFixed(2)} ${r} 0 0 ${k > 0.5 ? 1 : 0} ${c} ${c - r}`) + 'Z';
    }
  }
  const litRight = waxing !== (lat < 0);
  const maria = [[37, 38, 9, 7], [58, 31, 6, 5], [63, 52, 10, 8], [40, 63, 8, 9], [53, 74, 6, 5], [29, 52, 5, 4], [72, 36, 4, 3]]
    .map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join('');
  return `<svg class="moon-svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <defs>
      <radialGradient id="mg-${id}" cx="36%" cy="32%" r="80%"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#cdc5ad"/></radialGradient>
      <radialGradient id="me-${id}" cx="45%" cy="42%" r="70%"><stop offset="0" stop-color="#2b3550"/><stop offset="1" stop-color="#111827"/></radialGradient>
      <clipPath id="mc-${id}"><path d="${lit || 'M0 0'}"/></clipPath>
    </defs>
    <g${litRight ? '' : ' transform="translate(100 0) scale(-1 1)"'}>
      <circle cx="${c}" cy="${c}" r="${r}" fill="url(#me-${id})" stroke="rgba(255,255,255,.16)" stroke-width="1"/>
      <g fill="#6b7186" opacity=".22">${maria}</g>
      ${lit ? `<path d="${lit}" fill="url(#mg-${id})"/><g clip-path="url(#mc-${id})" fill="#8c8672" opacity=".38">${maria}</g>` : ''}
    </g></svg>`;
}
