// Offline prayer-time calculation (the astronomical method used by PrayTimes.org).
import { settings } from './store.js';

export const METHODS = [
  { name: 'UAE (Awqaf)', fajr: 18.2, isha: 18.2, ishaMin: 0 },
  { name: 'Umm al-Qura (Makkah)', fajr: 18.5, isha: 0, ishaMin: 90 },
  { name: 'Muslim World League', fajr: 18, isha: 17, ishaMin: 0 },
  { name: 'Karachi', fajr: 18, isha: 18, ishaMin: 0 },
  { name: 'ISNA (North America)', fajr: 15, isha: 15, ishaMin: 0 },
  { name: 'Egypt', fajr: 19.5, isha: 17.5, ishaMin: 0 },
];

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const dSin = d => Math.sin(rad(d)), dCos = d => Math.cos(rad(d)), dTan = d => Math.tan(rad(d));
const dAcos = x => deg(Math.acos(Math.min(1, Math.max(-1, x))));
const dAtan = x => deg(Math.atan(x));
const fixAngle = a => a - 360 * Math.floor(a / 360);
const fixHour = h => h - 24 * Math.floor(h / 24);

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100), b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

function sun(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * dSin(g) + 0.020 * dSin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = deg(Math.atan2(dCos(e) * dSin(L), dCos(L))) / 15;
  return { decl: deg(Math.asin(dSin(e) * dSin(L))), eqt: q / 15 - fixHour(RA) };
}

/** Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha as minutes after local midnight. */
export function calcTimes(date, lat, lng, method, hanafi, offsets) {
  const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
  const tz = -new Date(y, mo - 1, d, 12).getTimezoneOffset() / 60;
  const jd = julian(y, mo, d) - lng / (15 * 24);
  const midDay = t => fixHour(12 - sun(jd + t).eqt);
  const angleTime = (angle, t, before) => {
    const decl = sun(jd + t).decl;
    const x = dAcos((-dSin(angle) - dSin(decl) * dSin(lat)) / (dCos(decl) * dCos(lat))) / 15;
    return midDay(t) + (before ? -x : x);
  };
  const fajr = angleTime(method.fajr, 5 / 24, true);
  const sunrise = angleTime(0.833, 6 / 24, true);
  const dhuhr = midDay(12 / 24);
  const asrDecl = sun(jd + 13 / 24).decl;
  const asr = angleTime(-dAtan(1 / ((hanafi ? 2 : 1) + dTan(Math.abs(lat - asrDecl)))), 13 / 24, false);
  const maghrib = angleTime(0.833, 18 / 24, false);
  const isha = method.ishaMin ? maghrib + method.ishaMin / 60 : angleTime(method.isha, 18 / 24, false);
  const off = [offsets[0], 0, offsets[1], offsets[2], offsets[3], offsets[4]];
  return [fajr, sunrise, dhuhr, asr, maghrib, isha].map((h, i) => Math.round(fixHour(h + tz - lng / 15) * 60) + (off[i] || 0));
}

export const PRAYERS = [0, 2, 3, 4, 5];     // indices of the five prayers (1 = sunrise)
const SLOT = { 0: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

/** One day: adhan and iqama times as Date objects. */
export function prayerDay(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const s = settings;
  const method = METHODS[Math.min(Math.max(s.method, 0), METHODS.length - 1)];
  const mins = calcTimes(date, s.lat, s.lon, method, s.hanafi, s.offsets);
  const isFriday = date.getDay() === 5 && s.friday;
  if (isFriday) mins[2] = 12 * 60 + 45;            // UAE: Friday khutbah at 12:45 in all mosques
  const adhan = mins.map(m => new Date(start.getTime() + m * 60000));
  const iq = s.iqama;
  const iqama = adhan.map((t, i) => {
    if (!(i in SLOT)) return null;
    const gap = isFriday && i === 2 ? 20 : (iq[SLOT[i]] ?? 0);
    return new Date(t.getTime() + gap * 60000);
  });
  // Tahajjud: reminder time before Fajr, and where the last third of the night begins
  const fajr = adhan[0];
  const tahajjud = new Date(fajr.getTime() - s.tahajjud * 60000);
  const nightStart = new Date(adhan[4].getTime() - 86400000);           // yesterday's Maghrib (close enough)
  const lastThird = new Date(fajr.getTime() - (fajr - nightStart) / 3);
  return { start, adhan, iqama, isFriday, tahajjud, lastThird };
}

/** Calendar file with a Tahajjud event + alert for each of the next `days` nights. */
export function tahajjudIcs(days = 60) {
  const pad = n => String(n).padStart(2, '0');
  const f = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Noor//Tahajjud//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Tahajjud'];
  const base = new Date();
  for (let k = 0; k < days; k++) {
    const day = prayerDay(new Date(base.getFullYear(), base.getMonth(), base.getDate() + k, 12));
    if (day.tahajjud < base) continue;
    const end = new Date(day.adhan[0]);
    lines.push('BEGIN:VEVENT', `UID:tahajjud-${f(day.start).slice(0, 8)}@noor`, `DTSTAMP:${stamp}`,
      `DTSTART:${f(day.tahajjud)}`, `DTEND:${f(end)}`,
      'SUMMARY:Tahajjud', `DESCRIPTION:Tahajjud time. Fajr adhan at ${pad(end.getHours())}:${pad(end.getMinutes())}.`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Tahajjud', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function prayerName(day, i) {
  return ['Fajr', 'Sunrise', day.isFriday ? "Jumu'ah" : 'Dhuhr', 'Asr', 'Maghrib', 'Isha'][i];
}
export function prayerNameAr(day, i) {
  return ['الفجر', 'الشروق', day.isFriday ? 'الجمعة' : 'الظهر', 'العصر', 'المغرب', 'العشاء'][i];
}

/** Next adhan (may be tomorrow's Fajr). */
export function nextPrayer(now = new Date()) {
  const today = prayerDay(now);
  const i = PRAYERS.find(k => today.adhan[k] > now);
  if (i !== undefined) return { i, day: today };
  return { i: 0, day: prayerDay(new Date(now.getTime() + 86400000)) };
}

/** Prayer that has started and whose iqama passed less than 10 minutes ago. */
export function currentPrayer(now = new Date()) {
  const day = prayerDay(now);
  const started = PRAYERS.filter(k => day.adhan[k] <= now);
  if (!started.length) return null;
  const i = started[started.length - 1];
  return now < new Date(day.iqama[i].getTime() + 600000) ? { i, day } : null;
}

const H_MONTHS = ['Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani", 'Jumada al-Ula', 'Jumada al-Akhirah',
  'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qa'dah", 'Dhu al-Hijjah'];
const H_MONTHS_AR = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

export const arabicDigits = n => String(n).replace(/\d/g, c => '٠١٢٣٤٥٦٧٨٩'[c]);

/** Hijri date (Umm al-Qura calendar) in Arabic and English. */
export function hijri(date = new Date()) {
  const d = new Date(date.getTime() + settings.hijriOffset * 86400000);
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
    const val = t => parseInt((parts.find(p => p.type === t) || {}).value, 10);
    const day = val('day'), month = val('month'), year = val('year');
    if (!day || !month || !year) throw new Error('no hijri');
    return {
      ar: `${arabicDigits(day)} ${H_MONTHS_AR[month - 1]} ${arabicDigits(year)} هـ`,
      en: `${day} ${H_MONTHS[month - 1]} ${year} AH`,
    };
  } catch {
    return { ar: '', en: '' };
  }
}

/** Direction of the Kaaba (degrees from north) and distance in km. */
export function qibla(lat, lon) {
  const p1 = rad(lat), p2 = rad(21.4225), dl = rad(39.8262 - lon);
  const b = deg(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)));
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return { bearing: (b + 360) % 360, km: 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) };
}
