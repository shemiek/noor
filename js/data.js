// Quran text, adhkar, Ratib, travel dua, counter phrases and reciters.
import { SURAH_EN, SURAH_AR } from './surahs.js';
import { arabicDigits } from './prayer.js';

export const RATIB = 1001;   // special track number for the Ratib recording
export const surahEn = n => n === RATIB ? 'Ratib al-Haddad' : (SURAH_EN[n - 1] || `Surah ${n}`);
export const surahAr = n => n === RATIB ? 'راتب الحداد' : (SURAH_AR[n - 1] || '');

// Full-surah recitations from the Islamic Network CDN (alquran.cloud).
export const RECITERS = [
  ['ar.alafasy', 'Mishary Rashid Alafasy'],
  ['ar.abdurrahmaansudais', 'Abdurrahman As-Sudais'],
  ['ar.abdulsamad', 'Abdul Basit Abdul Samad'],
  ['ar.saoodshuraym', 'Saud Ash-Shuraym'],
  ['ar.mahermuaiqly', 'Maher Al-Muaiqly'],
  ['ar.husary', 'Mahmoud Khalil Al-Husary'],
  ['ar.husarymujawwad', 'Al-Husary (Mujawwad)'],
  ['ar.shaatree', 'Abu Bakr Ash-Shaatree'],
  ['ar.ahmedajamy', 'Ahmed Al-Ajamy'],
  ['ar.hudhaify', 'Ali Al-Hudhaify'],
  ['ar.hanirifai', 'Hani Ar-Rifai'],
  ['ar.muhammadayyoub', 'Muhammad Ayyoub'],
  ['ar.muhammadjibreel', 'Muhammad Jibreel'],
  ['ar.abdullahbasfar', 'Abdullah Basfar'],
  ['ar.ibrahimakhbar', 'Ibrahim Al-Akhdar'],
  ['ar.aymanswoaid', 'Ayman Sowaid'],
];
export const reciterName = id => (RECITERS.find(r => r[0] === id) || RECITERS[0])[1];
export const audioUrl = (id, n) => `https://cdn.islamic.network/quran/audio-surah/128/${id}/${n}.mp3`;

// ---------- Quran text with tajweed ----------

export const RULE_NAMES = [
  'Hamzat al-wasl', 'Lam shamsiyyah', 'Silent letter', 'Madd 2 (natural)', 'Madd 2/4/6 (permissible)',
  'Madd 4/5 (obligatory)', 'Madd 6 (necessary)', 'Qalqalah', 'Ghunnah', "Ikhfa'",
  "Ikhfa' shafawi", 'Idgham with ghunnah', 'Idgham without ghunnah', 'Idgham shafawi', 'Iqlab',
  'Idgham mutajanisayn', 'Idgham mutaqaribayn', 'Tafkhim', 'Tarqiq',
];
export const LEGEND = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0];
export const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Whole surah as HTML: coloured spans for tajweed rules, gold ayah markers. */
export async function surahHtml(n) {
  const res = await fetch(`data/quran/surah_${String(n).padStart(3, '0')}.json`);
  const data = await res.json();
  let html = `<div class="head">سورة ${surahAr(n)}</div>`;
  if (n !== 1 && n !== 9) html += `<div class="bism"><span class="ay" data-a="0">${BISMILLAH}</span></div>`;
  html += '<div class="body">';
  for (const a of data.ayahs) {
    html += `<span class="ay" data-a="${a.ayah}">`;
    for (const [text, rules] of a.s) {
      const r = rules.find(x => x <= 16);
      html += r === undefined ? esc(text) : `<span class="r${r}">${esc(text)}</span>`;
    }
    html += ` <span class="am">۝${arabicDigits(a.ayah)}</span></span> `;
  }
  html += '</div><div class="end">صَدَقَ ٱللَّهُ ٱلْعَظِيمُ</div>';
  return html;
}

// ---------- Adhkar ----------

// id → [repetitions, M morning / E evening / B both]. Counts as in Hisn al-Muslim.
const ME = {
  1: [1, 'B'], 2: [1, 'B'], 3: [1, 'E'], 4: [3, 'B'], 5: [3, 'B'], 6: [3, 'B'], 7: [1, 'M'], 8: [1, 'E'],
  9: [1, 'M'], 10: [1, 'E'], 11: [1, 'B'], 12: [4, 'M'], 13: [4, 'E'], 14: [1, 'M'], 15: [1, 'E'],
  16: [3, 'B'], 17: [7, 'B'], 18: [1, 'B'], 19: [1, 'B'], 20: [3, 'B'], 21: [3, 'B'], 22: [1, 'B'],
  23: [1, 'M'], 24: [1, 'E'], 25: [1, 'M'], 26: [1, 'E'], 27: [1, 'M'], 28: [10, 'B'], 29: [10, 'B'],
  30: [3, 'E'], 31: [3, 'M'], 32: [100, 'M'], 33: [100, 'B'], 34: [100, 'B'],
};
// Ratib al-Haddad repetitions (commonly printed order). Entry 1 (Wird al-Sakran opening) is skipped.
const RATIB_COUNTS = { 8: 3, 9: 3, 10: 3, 11: 3, 12: 3, 13: 3, 14: 3, 15: 3, 16: 3, 17: 3, 18: 3, 19: 7, 20: 3, 21: 3, 22: 3, 23: 4, 24: 4, 25: 50, 27: 3 };

export const TRAVEL_DUA =
  'اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، ' +
  'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ، ' +
  'اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَى، وَمِنَ الْعَمَلِ مَا تَرْضَى، ' +
  'اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ، ' +
  'اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ، وَالْخَلِيفَةُ فِي الْأَهْلِ، ' +
  'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ وَعْثَاءِ السَّفَرِ، وَكَآبَةِ الْمَنْظَرِ، وَسُوءِ الْمُنْقَلَبِ فِي الْمَالِ وَالْأَهْلِ';
const TRAVEL_EN = 'Allah is the Greatest (×3). Glory be to Him who has subjected this to us, and we could never have done it by ourselves, and to our Lord we shall return. O Allah, we ask You on this journey for righteousness and piety, and deeds that please You. O Allah, make this journey easy for us and shorten its distance. O Allah, You are the Companion on the journey and the Guardian of the family. O Allah, I seek refuge in You from the hardships of travel, from distressing sights, and from an ill return to wealth and family.';

export const KINDS = [
  { key: 'morning', title: 'Morning' },
  { key: 'evening', title: 'Evening' },
  { key: 'ratib', title: 'Ratib' },
  { key: 'travel', title: 'Travel' },
];

const cache = {};
const idNum = o => parseInt(String(o.id || '').split('_').pop(), 10) || 0;

export async function adhkar(kind) {
  if (cache[kind]) return cache[kind];
  let list = [];
  if (kind === 'morning' || kind === 'evening') {
    const data = (await (await fetch('data/adhkar/morning_evening.json')).json()).data;
    for (const o of data) {
      const n = idNum(o);
      const [count, when] = ME[n] || [1, 'B'];
      if (kind === 'morning' && when === 'E') continue;
      if (kind === 'evening' && when === 'M') continue;
      list.push({ ar: o.arabic || '', en: o.english || '', src: o.source || '', count });
    }
  } else if (kind === 'ratib') {
    const data = (await (await fetch('data/adhkar/ratib.json')).json()).data;
    for (const o of data) {
      const n = idNum(o);
      if (n < 3) continue;   // 1 = Wird al-Sakran opening, 2 = the title
      list.push({ ar: o.arabic || '', en: o.english || '', src: '', count: RATIB_COUNTS[n] || 1 });
    }
  } else {
    list = [{ ar: TRAVEL_DUA, en: TRAVEL_EN, src: 'Sahih Muslim 1342', count: 1 }];
  }
  return (cache[kind] = list);
}

export const TASBIH = [
  { ar: 'سُبْحَانَ اللَّهِ', en: 'SubhanAllah', target: 33 },
  { ar: 'الْحَمْدُ لِلَّهِ', en: 'Alhamdulillah', target: 33 },
  { ar: 'اللَّهُ أَكْبَرُ', en: 'Allahu Akbar', target: 34 },
  { ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ', en: 'La ilaha illallah', target: 100 },
  { ar: 'أَسْتَغْفِرُ اللَّهَ', en: 'Astaghfirullah', target: 100 },
  { ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', en: 'SubhanAllahi wa bihamdihi', target: 100 },
  { ar: 'اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ', en: 'Salawat', target: 100 },
  { ar: '', en: 'Free count', target: 0 },
  // Swalath Nariya (as-Salat an-Nariyah / at-Tafrijiyyah) — long: counted by learned pace
  { ar: 'اللَّهُمَّ صَلِّ صَلَاةً كَامِلَةً وَسَلِّمْ سَلَامًا تَامًّا عَلَى سَيِّدِنَا مُحَمَّدٍ الَّذِي تَنْحَلُّ بِهِ الْعُقَدُ، وَتَنْفَرِجُ بِهِ الْكُرَبُ، وَتُقْضَى بِهِ الْحَوَائِجُ، وَتُنَالُ بِهِ الرَّغَائِبُ وَحُسْنُ الْخَوَاتِيمِ، وَيُسْتَسْقَى الْغَمَامُ بِوَجْهِهِ الْكَرِيمِ، وَعَلَى آلِهِ وَصَحْبِهِ فِي كُلِّ لَمْحَةٍ وَنَفَسٍ بِعَدَدِ كُلِّ مَعْلُومٍ لَكَ',
    short: 'الصلاة النارية', en: 'Swalath Nariya', target: 4444, long: true, pace: 12 },
  // 9–19: added Nov 2026 (only append — indices are saved on the phone)
  { ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ', short: 'سبحان الله العظيم',
    en: 'SubhanAllahi wa bihamdihi, SubhanAllahil Azim', target: 100, long: true, pace: 4, src: 'Bukhari 6406' },
  { ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', en: 'La hawla wa la quwwata illa billah', target: 100, src: 'Bukhari 4205' },
  { ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ', short: 'لا إله إلا الله وحده',
    en: 'La ilaha illallahu wahdahu la sharika lah…', target: 100, long: true, pace: 8, src: 'Bukhari 3293' },
  { ar: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ', en: 'Astaghfirullaha wa atubu ilayh', target: 100, src: 'Bukhari 6307, Muslim 2702' },
  { ar: 'سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَٰهَ إِلَّا اللَّهُ، وَاللَّهُ أَكْبَرُ', short: 'الباقيات الصالحات',
    en: 'SubhanAllah, walhamdulillah, wa la ilaha illallah, wallahu akbar', target: 100, long: true, pace: 5, src: 'Muslim 2137' },
  { ar: 'لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ', short: 'دعاء يونس',
    en: 'Dua of Yunus (AS)', target: 100, src: 'Quran 21:87, Tirmidhi 3505' },
  { ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ', short: 'عدد خلقه',
    en: 'SubhanAllahi wa bihamdihi, adada khalqihi…', target: 3, long: true, pace: 8, src: 'Muslim 2726' },
  { ar: 'حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلْتُ، وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ', short: 'حسبي الله',
    en: 'Hasbiyallahu la ilaha illa huwa…', target: 7, long: true, pace: 6, src: 'Quran 9:129, Abu Dawud 5081' },
  { ar: 'رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ، إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ', short: 'رب اغفر لي وتب علي',
    en: 'Rabbighfir li wa tub alayya…', target: 100, long: true, pace: 5, src: 'Abu Dawud 1516' },
  { ar: 'يَا حَيُّ يَا قَيُّومُ، بِرَحْمَتِكَ أَسْتَغِيثُ', short: 'يا حي يا قيوم',
    en: 'Ya Hayyu ya Qayyum, bi rahmatika astaghith', target: 100, src: 'Tirmidhi 3524' },
  { ar: 'اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ، كَمَا صَلَّيْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ، ' +
      'اللَّهُمَّ بَارِكْ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ، كَمَا بَارَكْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ',
    short: 'الصلاة الإبراهيمية', en: 'Swalath Ibrahimiyya', target: 100, long: true, pace: 15, src: 'Bukhari 3370' },
];
// Display order in the picker (indices into TASBIH; new items are added at the end so saved choices stay valid)
export const TASBIH_ORDER = [0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 8, 7];
export const TARGET_CHOICES = [7, 11, 33, 41, 100, 313, 1000, 4444];
