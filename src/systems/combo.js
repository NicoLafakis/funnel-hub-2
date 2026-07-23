// Combo tracker — ported 1:1 from the current shipped game's combo state and
// `comboMult()` (recovered from git history: `git show 97c9024:index.html`).
// Original state was a module-level `{count:0, t:0}` object mutated in-place
// by the game loop; this module wraps the same window/decay/multiplier logic
// in a factory so a level/game module can own one instance per playthrough.
//
// No browser-only API is touched anywhere in this file (pure logic), so a
// bare `import` never throws in Node.

// Combo tiers: [threshold, name], ordered HIGHEST-first on purpose — this is
// the exact order the original used both to pick a "you just hit this exact
// threshold" banner (`combo.count === n`) and, separately, to find the
// highest tier at-or-below the current count for an on-screen label
// (`combo.count >= n`, break on first match). Consumers should iterate this
// array in order and use whichever comparison (`===` or `>=`) fits their use.
export const COMBO_TIERS = [
  [30, 'THE SYNC-ENING'],
  [25, 'PORTAL APOCALYPSE'],
  [20, 'PIPELINE PLAGUE'],
  [15, 'RECORD RAMPAGE'],
  [10, 'DATA DEVOURER'],
  [5, 'SNACKING'],
];

// Seconds of grace between eats before the combo resets — EXACT value from
// the original (`combo.t = 2.2` on every eat).
const COMBO_WINDOW = 2.2;

// Max multiplier bonus beyond the base 1x — EXACT from the original
// (`1 + Math.min(4, Math.floor(combo.count/4))`), capping the total at 5x.
const MAX_MULT_BONUS = 4;
const MULT_STEP = 4;

export function createComboTracker() {
  let count = 0;
  let t = 0;

  // Decays the combo window; when it runs out, the combo resets to 0 — EXACT
  // from the original (`combo.t-=dt; if(combo.t<=0 && combo.count>0) combo.count=0;`).
  function update(dt) {
    t -= dt;
    if (t <= 0 && count > 0) count = 0;
  }

  // Registers one eat: increments the combo and refreshes the window — EXACT
  // from the original (`combo.count++; combo.t=2.2;`). Returns the new count
  // for convenience (e.g. checking against COMBO_TIERS/achievement thresholds).
  function onEat() {
    count += 1;
    t = COMBO_WINDOW;
    return count;
  }

  // Current score multiplier, up to 5x (1x base + up to +4x) — EXACT formula
  // from the original `comboMult()`.
  function mult() {
    return 1 + Math.min(MAX_MULT_BONUS, Math.floor(count / MULT_STEP));
  }

  return {
    get count() {
      return count;
    },
    set count(v) {
      count = v;
    },
    get t() {
      return t;
    },
    set t(v) {
      t = v;
    },
    update,
    onEat,
    mult,
  };
}
