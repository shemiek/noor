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
  constructor({ index, tuning, onCount, onState }) {
    // tuning() → { pace: seconds per recitation (0 = short dhikr), gap: ms of silence that ends a recitation, ratio: share of the pace that must have passed }
    Object.assign(this, { index, tuning, onCount, onState });
    this.pace = () => this.tuning().pace || 0;
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
    this.learning = { first: 0, last: 0, segments: 0, list: [] };
    this.onState({ listening: true, mode: 'learn', segments: 0 });
  }

  /**
   * Returns { pace, gap } — seconds per recitation and the pause (ms) that separates recitations —
   * or null if not enough was heard.
   */
  finishLearn(reps) {
    const l = this.learning;
    this.stop();
    if (!l || l.list.length < 2 || reps < 1) return null;
    const segs = l.list;
    const gaps = segs.slice(1).map((s, i) => s[0] - segs[i][1]);
    // the (reps - 1) longest pauses are between recitations; the rest are breaths inside one
    const sorted = gaps.slice().sort((a, b) => b - a);
    const between = sorted.slice(0, reps - 1);
    const inside = sorted.slice(reps - 1);
    const span = segs[segs.length - 1][1] - segs[0][0];
    const pace = (span - between.reduce((a, b) => a + b, 0)) / reps / 1000;
    const minBetween = between.length ? Math.min(...between) : 900;
    const maxInside = inside.length ? Math.max(...inside) : 300;
    // end-of-recitation pause: halfway between a breath and the real pause (or a bit longer than a breath)
    // never longer than the real pause between recitations, and clearly longer than a breath
    let gap = Math.max(maxInside * 1.15, minBetween * 0.7);
    gap = Math.min(gap, minBetween * 0.85);
    gap = Math.round(Math.min(1500, Math.max(350, gap)));

    // where does the last line start? (the breath before it must never be taken as the end)
    const cut = new Set(gaps.map((g, i) => [g, i]).sort((a, b) => b[0] - a[0]).slice(0, reps - 1).map(x => x[1] + 1));
    const groups = [[]];
    segs.forEach((s, i) => { if (cut.has(i)) groups.push([]); groups[groups.length - 1].push(s); });
    let lastLine = 0;
    for (const g of groups) {
      if (g.length < 2) continue;
      const a = g[0][0], z = g[g.length - 1][1], breath = g[g.length - 2][1];   // breath before the last line
      lastLine = Math.max(lastLine, (breath - a) / (z - a));
    }
    // count only once we're past that breath — with ~8% to spare for reciting a little slower
    const late = Math.round(Math.min(0.95, Math.max(0.8, lastLine * 1.08 + 0.02)) * 100) / 100;
    // how many breath-separated parts one recitation has (the most common number)
    const sizes = groups.map(g => g.length).sort((a, b) => a - b);
    const parts = sizes[Math.floor(sizes.length / 2)] || 1;
    return { pace: Math.max(1.5, Math.round(pace * 10) / 10), gap, late, parts };
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
    let voiced = 0;            // ms of actual voice heard in the current repetition
    let parts = 0;             // breath-separated parts heard in the current repetition
    let speechLvl = 0;         // how loud your voice is (so a drop to others' murmur still counts as a pause)
    this.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.998 + rms * 0.002;   // background noise
      const on = Math.max(floor * 3, 0.01, speechLvl * 0.3), off = Math.max(on * 0.65, speechLvl * 0.22);
      const now = performance.now();
      const pace = this.pace() * 1000;
      if (speaking) { voiced += 30; speechLvl = speechLvl ? speechLvl * 0.97 + rms * 0.03 : rms; }
      else speechLvl *= 0.997;                                   // eases down in silence (half-life ~7 s)

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
            if (segLen > 150) { this.learning.last = quietSince; this.learning.segments++; this.learning.list.push([segStart, quietSince]); }
          } else if (!pace) {
            if (segLen > 220) this.onCount(1);              // short dhikr: every pause is one
            repStart = 0; voiced = 0;
          } else if (segLen > 150) parts++;
          // long dhikr: decided below, once the pause is long enough
        }
      } else quietSince = 0;

      if (pace && repStart && !this.learning) {
        const tu = this.tuning();
        const endGap = tu.gap || 700, ratio = tu.ratio || 0.8, late = tu.late || 0.9, want = tu.parts || 0;
        const quiet = !speaking && quietSince ? now - quietSince : 0;
        const span = quietSince ? quietSince - repStart : 0;
        const enoughVoice = voiced >= pace * 0.55;
        let end = false;
        if (want > 1) {
          // learned: all the parts heard and most of the time passed, then a pause — tolerant of speed changes
          end = (quiet >= Math.min(endGap, 450) && parts >= want && span >= pace * Math.max(0.7, late - 0.06) && enoughVoice)
             || (quiet >= endGap && parts >= want - 1 && span >= pace * ratio && enoughVoice)
             || (quiet >= Math.max(endGap, 1500) && span >= pace * ratio && enoughVoice);   // a long silence after most of it
        } else {
          end = (quiet >= Math.min(endGap, 450) && span >= pace * late && enoughVoice)
             || (quiet >= endGap && span >= pace * ratio && enoughVoice);
        }
        if (end) {
          this.onCount(span > pace * 1.75 ? Math.round(span / pace) : 1);
          // keep learning: follow gradual changes in your speed
          if (span > pace * 0.75 && span < pace * 1.3 && this.onPace) this.onPace(span / 1000);
          repStart = 0; voiced = 0; parts = 0;
        } else if (quiet && quiet > Math.max(3000, pace * 0.6)) {
          repStart = 0; voiced = 0; parts = 0;               // stopped part-way; start fresh next time
        } else if (now - repStart > pace * 1.35 && voiced >= pace * 0.9) {
          // no clear pause at all — count on the expected rhythm
          this.onCount(1);
          repStart = Math.max(repStart + pace, now - pace * 0.3);
          voiced = Math.max(0, now - repStart) * 0.8; parts = 0;
        }
      }

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
