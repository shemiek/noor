// Hands-free tasbih: listens through the microphone and counts each time you say the dhikr.
//  • "words"  — speech recognition (Arabic) recognises the phrase itself. Needs internet.
//  • "pauses" — counts each spoken repetition by the short silence after it. Works offline, any dhikr.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognise = !!SR;
export const canListen = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/** Remove harakat and unify letter forms so recognised text matches reliably. */
export function normalise(s) {
  return (s || '')
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim();
}

/** What to listen for, per dhikr (index in TASBIH). */
export const KEYWORDS = [
  /سبحان/g,          // SubhanAllah
  /حمد/g,            // Alhamdulillah
  /اكبر/g,           // Allahu Akbar
  /اله ?الا/g,       // La ilaha illallah
  /استغفر/g,         // Astaghfirullah
  /سبحان/g,          // SubhanAllahi wa bihamdihi
  /محمد/g,           // Salawat
  null,              // free count → pauses mode only
];

export class VoiceCounter {
  /**
   * @param {object} o
   * @param {() => RegExp|null} o.keyword  current phrase to listen for
   * @param {(n:number) => void} o.onCount called with how many new repetitions were heard
   * @param {(s:object) => void} o.onState  { listening, mode, level, heard, error }
   */
  constructor({ keyword, onCount, onState }) {
    Object.assign(this, { keyword, onCount, onState });
    this.active = false;
    this.mode = null;
    this.gapMs = 300;
  }

  async start(mode) {
    this.stop();
    this.active = true;
    this.mode = mode;
    try {
      this.wake = await navigator.wakeLock?.request('screen');
    } catch { /* keep-awake not available */ }
    if (mode === 'words') this.startWords();
    else await this.startPauses();
  }

  stop() {
    this.active = false;
    try { this.rec && this.rec.abort(); } catch { /* ignore */ }
    this.rec = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    try { this.wake && this.wake.release(); } catch { /* ignore */ }
    this.wake = null;
    this.onState({ listening: false, mode: this.mode });
  }

  // ----- recognise the words -----
  startWords() {
    const rec = new SR();
    this.rec = rec;
    rec.lang = 'ar-SA';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let perResult = [];         // highest number of matches seen in each result (interim text keeps changing)
    rec.onresult = e => {
      const kw = this.keyword();
      if (!kw) return;
      let added = 0, last = '';
      for (let i = 0; i < e.results.length; i++) {
        const text = normalise(e.results[i][0].transcript);
        last = text;
        const n = (text.match(kw) || []).length;
        const before = perResult[i] || 0;
        if (n > before) { added += n - before; perResult[i] = n; }
      }
      if (added) this.onCount(added);
      this.onState({ listening: true, mode: 'words', heard: last.slice(-40) });
    };
    rec.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.onState({ listening: false, mode: 'words', error: 'Speech recognition is blocked — switching to pause counting.' });
        this.start('pauses');
        return;
      }
      this.onState({ listening: true, mode: 'words', error: e.error === 'network' ? 'Word recognition needs internet.' : '' });
    };
    // iPhone stops listening after a while — start again straight away
    rec.onend = () => {
      if (!this.active || this.mode !== 'words') return;
      perResult = [];
      try { rec.start(); } catch { setTimeout(() => this.active && this.mode === 'words' && this.startWords(), 300); }
    };
    try { rec.start(); } catch { /* already started */ }
    this.onState({ listening: true, mode: 'words', heard: '' });
  }

  // ----- count each repetition by the pause after it -----
  async startPauses() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.active = false;
      this.onState({ listening: false, mode: 'pauses', error: 'Microphone access was declined. Allow it in iPhone Settings → Safari → Microphone.' });
      return;
    }
    if (!this.active) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);

    let floor = 0.01, speaking = false, startAt = 0, quietSince = 0, loudSince = 0;
    const step = 30;
    this.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // background noise level follows quiet moments slowly
      floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.998 + rms * 0.002;
      const on = Math.max(floor * 3, 0.012), off = on * 0.65;
      const now = performance.now();
      if (!speaking) {
        if (rms > on) { if (!loudSince) loudSince = now; if (now - loudSince > 90) { speaking = true; startAt = loudSince; quietSince = 0; } }
        else loudSince = 0;
      } else if (rms < off) {
        if (!quietSince) quietSince = now;
        if (now - quietSince > this.gapMs) {
          speaking = false; loudSince = 0;
          if (quietSince - startAt > 220) this.onCount(1);   // ignore clicks and very short sounds
        }
      } else quietSince = 0;
      this.onState({ listening: true, mode: 'pauses', level: Math.min(1, rms / (on * 2.5)), speaking });
    }, step);
    this.onState({ listening: true, mode: 'pauses', level: 0 });
  }
}
