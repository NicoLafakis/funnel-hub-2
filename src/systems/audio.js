// Web Audio synth sound effects — ported 1:1 from the current shipped game's
// `AudioSys` singleton (recovered from git history: `git show 97c9024:index.html`,
// lines ~372-411). Pure Web Audio API, no audio files, framework-agnostic: no
// dependency on THREE or the DOM beyond the standard (Audio)Context API.
//
// Every method after init() guards on `this.ac` (only ever set by a successful
// init()), plus the same `muted`/`freq<=0` guard clauses the original had, so
// calling ANY method before init(), or in a Node test environment with no
// AudioContext at all, is always a safe no-op — never throws. No browser-only
// API is touched at module top level — only inside init() itself, and even
// there every lookup is a `typeof` check (never a bare `window.X`), so a bare
// `import` of this file never throws in Node.

function resolveAudioContextCtor() {
  // `typeof X` on an undeclared identifier never throws (unlike `window.X`
  // when `window` itself doesn't exist in Node), so this is safe everywhere —
  // real browsers, Node, workers — without needing a `typeof window` guard.
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof webkitAudioContext !== 'undefined') return webkitAudioContext;
  return null;
}

// Singleton, matching the original `AudioSys` — one shared AudioContext for
// the whole app. `ac` and `muted` stay plain mutable properties (not getters)
// because the original game read/toggled them directly from outside
// (`AudioSys.muted = !AudioSys.muted`, `if (AudioSys.ac && !AudioSys.muted)`),
// and a later UI/input module will do the same (mute toggle, music-loop gate).
export const Audio = {
  ac: null,
  muted: false,

  init() {
    if (!this.ac) {
      try {
        const Ctor = resolveAudioContextCtor();
        if (Ctor) this.ac = new Ctor();
      } catch (e) {
        // No AudioContext available at all — stay muted-safe, never throw.
      }
    }
    if (this.ac && this.ac.state === 'suspended') {
      try {
        this.ac.resume();
      } catch (e) {
        // Resume can reject/throw in some autoplay-policy states — ignore.
      }
    }
  },

  // EXACT synth ported from the original AudioSys.beep(): a single oscillator
  // with an exponential gain decay and optional frequency slide.
  beep(freq, dur = 0.1, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ac || this.muted || freq <= 0) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo && slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  // EXACT synth ported from the original AudioSys.noise(): a filtered white
  // noise burst (buffer of random samples, ramped envelope, lowpass filter).
  noise(dur = 0.15, vol = 0.15, delay = 0, freq = 800) {
    if (!this.ac || this.muted) return;
    const t = this.ac.currentTime + delay;
    const n = Math.max(1, Math.floor(this.ac.sampleRate * dur));
    const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ac.createBufferSource();
    s.buffer = buf;
    const f = this.ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.ac.destination);
    s.start(t);
  },

  // gulp(size, comboCount): V2 (game-design.md §3) — pitch rises a semitone
  // per eat within the current combo, capped at one octave, so clearing a
  // cluster is audibly a climb. comboCount defaults to 0, which reproduces
  // the exact V1 sound for existing callers.
  gulp(size, comboCount = 0) {
    if (!this.ac || this.muted) return;
    const steps = Math.max(0, Math.min(12, Math.floor(comboCount) || 0));
    const f = Math.max(120, 520 - size * 4) * Math.pow(2, steps / 12);
    this.beep(f, 0.12, 'triangle', 0.22, f * 0.4);
    this.noise(0.07, 0.07, 0, 1200);
  },
  comboUp(n) {
    this.beep(380 + n * 40, 0.08, 'square', 0.1, 760 + n * 40);
  },
  // V2 chain ping (game-design.md §3): one tick per combo tier-up, rising a
  // semitone per tier index (combo.js's COMBO_TIERS_ASC index), capped at an
  // octave. The 2D game's pitch ladder, finally ported.
  chainPing(tierIndex = 0) {
    if (!this.ac || this.muted) return;
    const steps = Math.max(0, Math.min(12, Math.floor(tierIndex) || 0));
    const f = 440 * Math.pow(2, steps / 12);
    this.beep(f, 0.09, 'square', 0.13, f * Math.pow(2, 2 / 12));
  },
  // V2 vacuum snap (game-design.md §3): short slurp whoosh as a prop starts
  // its pull into the maw.
  vacuumWhoosh() {
    if (!this.ac || this.muted) return;
    this.noise(0.16, 0.1, 0, 2400);
    this.beep(320, 0.14, 'sine', 0.06, 880);
  },
  // V2 piñata burst (game-design.md §4): the rival-hoard scatter — a pop of
  // noise plus a quick celebratory sprinkle.
  pinataBurst() {
    if (!this.ac || this.muted) return;
    this.noise(0.3, 0.25, 0, 900);
    [660, 880, 1108, 1318, 1760].forEach((f, i) => this.beep(f, 0.1, 'triangle', 0.14, null, i * 0.04));
  },
  // V2 wedge wobble (game-design.md §3): dull thunk when the player pushes a
  // too-big prop — reads as "locked", not "broken".
  wedgeThunk() {
    if (!this.ac || this.muted) return;
    this.beep(95, 0.12, 'sine', 0.25, 55);
    this.noise(0.06, 0.12, 0, 320);
  },
  golden() {
    [880, 1108, 1318, 1760].forEach((f, i) => this.beep(f, 0.13, 'sine', 0.16, null, i * 0.06));
  },
  rivalEat() {
    this.noise(0.45, 0.3, 0, 350);
    this.beep(220, 0.45, 'sawtooth', 0.22, 45);
  },
  storm() {
    this.noise(0.5, 0.18, 0, 2600);
    this.beep(1100, 0.3, 'sawtooth', 0.08, 260);
  },
  // grow(): the SIZE TIER-UP. Until 2026-07-27 this existed and was called
  // from nowhere — the core beat of the genre had no sound at all. Now that it
  // carries that beat it needs weight to match, and it must not be confusable
  // with chainPing(), which fires far more often and sits in the same register.
  //
  // How it differs from chainPing on purpose:
  //   chainPing — ONE square-wave tick, 90ms, a bright chirp. Combo texture.
  //   grow      — a rising 3-note TRIANGLE arpeggio (a major triad: root,
  //               major third, fifth — a resolved, arrival-shaped figure
  //               rather than a tick) over ~280ms, laid on a low sine
  //               "thump" that gives it body no other cue in the game has.
  // Different waveform, different note count, different envelope length, and
  // a bass component nothing else uses: four axes of separation, so it reads
  // as its own event even under a dense combo.
  grow() {
    if (!this.ac || this.muted) return;
    // C5-E5-G5, each sliding up a whole tone so the figure feels like it is
    // still climbing when it lands rather than stopping flat.
    [523.25, 659.25, 783.99].forEach((f, i) => {
      this.beep(f, 0.16, 'triangle', 0.19, f * 1.06, i * 0.055);
    });
    // The body: a short low sine drop under the arpeggio. This is the part
    // that makes a tier-up feel like it has mass behind it.
    this.beep(160, 0.26, 'sine', 0.16, 90);
  },
  fail() {
    [392, 370, 349, 311].forEach((f, i) => this.beep(f, 0.26, 'sawtooth', 0.14, f * 0.96, i * 0.24));
  },
  done() {
    [523, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.18, 'triangle', 0.2, null, i * 0.1));
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => this.beep(f, 0.22, 'triangle', 0.2, null, i * 0.13));
  },
  tick() {
    this.beep(920, 0.05, 'square', 0.07);
  },
  god() {
    [220, 330, 440, 550, 660, 880, 1100].forEach((f, i) => this.beep(f, 0.1, 'sawtooth', 0.14, null, i * 0.05));
  },
};
