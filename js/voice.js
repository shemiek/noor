// Hands-free tasbih: listens through the microphone and counts each time you say the dhikr.
//  • "words"  — speech recognition (Arabic) recognises the phrase. Needs internet.
//  • "pauses" — counts each repetition by the pause after it. Works offline, any dhikr.
//    For long dhikr (e.g. Swalath Nariya) it uses your learned pace, so breaths in the
//    middle of a repetition are not counted.

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

/** What to listen for, per dhikr (index in TASBIH). Several anchors → the best match counts once. */
export const KEYWORDS = {
  0: [/سبحان/g],
  1: [/حمد/g],
  2: [/اكبر/g],
  3: [/اله ?الا/g],
  4: [/استغفر/g],
  5: [/سبحان/g],
  6: [/محمد/g],
  8: [/معلوم/g, /تنحل|العقد/g, /الغمام/g],   // Swalath Nariya: one count per repetition
};

export class VoiceCounter {
  /**
   * @param {object} o
   * @param {() => number} o.index        current dhikr (index in TASBIH)
   * @param {() => number} o.pace         seconds per repetition (0 = short dhikr, count every pause)
   * @param {(n:number) => void} o.onCount
   * @param {(s:object) => void} o.onState
   */
  constructor({ index, pace, onCount, onState }) {
    Object.assign(this, { index, pace, onCount, onState });
    this.active = false;
    this.mode = null;
    this.gapMs = 300;
    this.learning = null;
  }

  async start(mode) {
    this.stop(true);
    this.active = true;
    this.mode = mode;
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch { /* keep-awake not available */ }
    if (mode === 'words') this.startWords();
    else await this.startPauses();
  }

  stop(silent = false) {
    this.active = false;
    this.learning = null;
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
    if (!silent) this.onState({ listening: false, mode: this.mode });
  }

  // ----- learn your pace: recite a few times, then finish -----
  async learn() {
    await this.start('pauses');
    this.learning = { first: 0, last: 0, segments: 0 };
    this.onState({ listening: true, mode: 'learn', segments: 0 });
  }

  /** Returns seconds per repetition, or 0 if not enough was heard. */
  finishLearn(reps) {
    const l = this.learning;
    this.stop();
    if (!l || !l.first || !l.last || reps < 1) return 0;
    const span = (l.last - l.first) / 1000;
    // span covers `reps` recitations and the (reps - 1) pauses between them
    return Math.max(1.5, Math.round(span / reps * 0.95 * 10) / 10);
  }

  // ----- recognise the words -----
  startWords() {
    const rec = new SR();
    this.rec = rec;
    rec.lang = 'ar-SA';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let perResult = [];
    let lastCountAt = 0;
    rec.onresult = e => {
      const anchors = KEYWORDS[this.index()];
      if (!anchors) return;
      const pace = this.pace();
      let added = 0, last = '';
      for (let i = 0; i < e.results.length; i++) {
        const text = normalise(e.results[i][0].transcript);
        last = text;
        const n = Math.max(...anchors.map(a => (text.match(a) || []).length));
        const before = perResult[i] || 0;
        if (n > before) { added += n - before; perResult[i] = n; }
      }
      if (added && pace > 0) {
        // long dhikr: never more than one count per half a repetition
        const now = performance.now();
        if (now - lastCountAt < pace * 500) added = 0; else { added = 1; lastCountAt = now; }
      }
      if (added) this.onCount(added);
      this.onState({ listening: true, mode: 'words', heard: last.slice(-40) });
    };
    rec.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.onState({ listening: false, mode: 'words', error: 'Word recognition is blocked here — switched to pause counting.' });
        this.start('pauses');
        return;
      }
      this.onState({ listening: true, mode: 'words', error: e.error === 'network' ? 'Word recognition needs internet.' : '' });
    };
    rec.onend = () => {                      // iPhone stops listening after a while — start again
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
    // keep only the voice band — ignores engine hum, AC rumble and clicks
    const src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(hp).connect(lp).connect(an);
    const buf = new Float32Array(an.fftSize);

    let floor = 0.01, speaking = false, loudSince = 0, quietSince = 0, segStart = 0;
    let repStart = 0;          // when the current repetition began (first speech after the last count)
    this.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.998 + rms * 0.002;   // background noise
      const on = Math.max(floor * 3, 0.01), off = on * 0.65;
      const now = performance.now();
      const pace = this.pace() * 1000;

      if (!speaking) {
        if (rms > on) {
          if (!loudSince) loudSince = now;
          if (now - loudSince > 90) {
            speaking = true; segStart = loudSince; quietSince = 0;
            if (!repStart) repStart = segStart;
            if (this.learning && !this.learning.first) this.learning.first = segStart;
          }
        } else loudSince = 0;
      } else if (rms < off) {
        if (!quietSince) quietSince = now;
        if (now - quietSince > this.gapMs) {
          speaking = false; loudSince = 0;
          const segLen = quietSince - segStart;
          if (this.learning) {
            if (segLen > 150) { this.learning.last = quietSince; this.learning.segments++; }
          } else if (!pace) {
            if (segLen > 220) this.onCount(1);              // short dhikr: every pause is one
            repStart = 0;
          } else {
            const span = quietSince - repStart;              // long dhikr: wait for most of a repetition
            if (span >= pace * 0.7) {
              this.onCount(span > pace * 1.7 ? Math.round(span / pace) : 1);
              repStart = 0;
            }
          }
        }
      } else quietSince = 0;

      // a long silence means the next sound starts a new repetition
      if (!speaking && repStart && pace && now - (quietSince || now) > Math.max(2500, pace * 0.5)) repStart = 0;

      this.onState({
        listening: true, mode: this.learning ? 'learn' : 'pauses',
        level: Math.min(1, rms / (on * 2.5)), speaking,
        rep: pace && repStart ? Math.min(1, (now - repStart) / pace) : 0,
        segments: this.learning ? this.learning.segments : undefined,
      });
    }, 30);
    this.onState({ listening: true, mode: this.learning ? 'learn' : 'pauses', level: 0 });
  }
}
