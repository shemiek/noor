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
    this.log = [];
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
    this.stop(true);
    this.active = true;
    this.mode = 'pauses';
    this.learning = { list: [] };           // set BEFORE the mic starts, so nothing is missed
    this.log = [];
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch { /* ignore */ }
    await this.startPauses();
  }

  /**
   * Works out how you recite from what was heard. Returns
   * { pace: s per recitation, gap: ms pause between recitations, late: share of a recitation where the
   *   last breath can still happen, reps: how many recitations were heard } — or null.
   */
  finishLearn(said = 3) {
    const l = this.learning;
    this.stop();
    if (!l || l.list.length < 2) return null;
    const segs = l.list;
    const gaps = segs.slice(1).map((s, i) => s[0] - segs[i][1]);
    // How many recitations? Try each possibility: the right one has a clear jump between
    // "pause between recitations" and "breath", AND gives recitations of similar length.
    const sorted = gaps.slice().sort((a, b) => b - a);
    const split = r => {
      const cut = new Set(gaps.map((g, i) => [g, i]).sort((a, b) => b[0] - a[0]).slice(0, r - 1).map(x => x[1] + 1));
      const gs = [[]];
      segs.forEach((s, i) => { if (cut.has(i)) gs.push([]); gs[gs.length - 1].push(s); });
      return gs;
    };
    let reps = Math.min(said, gaps.length + 1), bestScore = -1;
    for (let r = 2; r <= Math.min(10, gaps.length + 1); r++) {
      const gs = split(r);
      const ls = gs.map(g => g[g.length - 1][1] - g[0][0]);
      const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
      const cv = Math.sqrt(ls.reduce((a, b) => a + (b - mean) ** 2, 0) / ls.length) / mean;   // how uneven
      const jump = sorted[r - 2] / Math.max(sorted[r - 1] || 1, 1);
      const score = jump * Math.max(0.05, 1 - cv * 1.5) * (r === said ? 1.25 : 1);
      if (score > bestScore) { bestScore = score; reps = r; }
    }
    const groups = split(reps);
    const lens = groups.map(g => g[g.length - 1][1] - g[0][0]);
    const pace = lens.reduce((a, b) => a + b, 0) / lens.length / 1000;
    const between = sorted.slice(0, reps - 1);
    const inside = sorted.slice(reps - 1);
    const minBetween = between.length ? Math.min(...between) : 1000;
    const maxInside = inside.length ? Math.max(...inside) : 300;
    const gap = Math.round(Math.min(1500, Math.max(400, Math.min(minBetween * 0.85, Math.max(maxInside * 1.2, minBetween * 0.6)))));
    // the last breath inside a recitation: counting must wait until after it
    let lastBreath = 0;
    groups.forEach((g, k) => { if (g.length > 1) lastBreath = Math.max(lastBreath, (g[g.length - 2][1] - g[0][0]) / lens[k]); });
    const late = Math.round(Math.min(0.95, Math.max(0.78, (lastBreath || 0.82) * 1.06 + 0.03)) * 100) / 100;
    return { pace: Math.max(1.5, Math.round(pace * 10) / 10), gap, late, reps };
  }

  /** Short log of what was heard and decided (shown under "What it heard"). */
  note(msg) {
    const t0 = this.t0 || (this.t0 = performance.now());
    this.log = this.log || [];
    this.log.push(`${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${msg}`);
    if (this.log.length > 40) this.log.shift();
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
    let repStart = 0;          // when the current recitation began
    let voiced = 0;            // ms of actual voice in the current recitation
    let speechLvl = 0;         // your voice level (a drop to others' murmur still counts as a pause)
    let lastNoted = 0;
    this.t0 = performance.now();
    this.log = this.log || [];
    this.note(this.learning ? 'learning started' : `listening · pace ${this.pace() || '—'} s`);
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
      else speechLvl *= 0.997;

      // ---- voice / pause detection ----
      if (!speaking) {
        if (rms > on) {
          if (!loudSince) loudSince = now;
          if (now - loudSince > 90) {
            speaking = true; segStart = loudSince;
            if (quietSince && now - quietSince > 200 && (pace || this.learning)) this.note(`pause ${((loudSince - quietSince) / 1000).toFixed(2)}s`);
            quietSince = 0;
            if (!repStart) repStart = segStart;
          }
        } else loudSince = 0;
      } else if (rms < off) {
        if (!quietSince) quietSince = now;
        const minPause = pace || this.learning ? 200 : this.gapMs;   // long dhikr: notice even short breaths
        if (now - quietSince > minPause) {
          speaking = false; loudSince = 0;
          const segLen = quietSince - segStart;
          if (this.learning) {
            if (segLen > 150) { this.learning.list.push([segStart, quietSince]); this.note(`voice ${(segLen / 1000).toFixed(1)}s`); }
          } else if (!pace) {
            if (segLen > 220) { this.onCount(1); }                  // short dhikr: every pause is one
            repStart = 0; voiced = 0;
          }
        }
      } else quietSince = 0;

      // ---- long dhikr: is this the end of a recitation? ----
      if (pace && repStart && !this.learning) {
        const tu = this.tuning();
        const late = tu.late || 0.88, endGap = tu.gap || 800;
        const quiet = !speaking && quietSince ? now - quietSince : 0;
        const span = quietSince ? quietSince - repStart : now - repStart;
        let why = '';
        if (quiet >= 300 && span >= pace * late && voiced >= pace * 0.5) why = `after the last line (${(span / 1000).toFixed(1)}s)`;
        else if (quiet >= Math.max(endGap * 1.5, 1200) && span >= pace * 0.6 && voiced >= pace * 0.4) why = `long pause (${(span / 1000).toFixed(1)}s)`;
        if (why) {
          this.onCount(span > pace * 1.75 ? Math.round(span / pace) : 1);
          this.note(`COUNT · ${why}`);
          if (span > pace * 0.8 && span < pace * 1.25 && this.onPace) this.onPace(span / 1000);   // follow your speed
          repStart = 0; voiced = 0;
        } else if (quiet >= 300 && quiet < 330 && span < pace * late && now - lastNoted > 500) {
          this.note(`breath at ${Math.round(span / pace * 100)}% — not the end yet`);
          lastNoted = now;
        } else if (quiet > Math.max(5000, pace * 0.6)) {
          this.note(`stopped at ${Math.round(span / pace * 100)}% — starting fresh`);
          repStart = 0; voiced = 0;
        } else if (now - repStart > pace * 1.3 && voiced >= pace * 0.8) {
          this.onCount(1);                                          // no clear pause (group): keep the rhythm
          this.note('COUNT · by rhythm (no clear pause)');
          repStart = Math.max(repStart + pace, now - pace * 0.3);
          voiced = Math.max(0, now - repStart) * 0.8;
        }
      }

      this.onState({
        listening: true, mode: this.learning ? 'learn' : 'pauses',
        level: Math.min(1, rms / (on * 2.5)), speaking,
        rep: pace && repStart ? Math.min(1, (now - repStart) / pace) : 0,
        segments: this.learning ? this.learning.list.length : undefined,
        log: this.log,
      });
    }, 30);
    this.onState({ listening: true, mode: this.learning ? 'learn' : 'pauses', level: 0 });
  }
}
