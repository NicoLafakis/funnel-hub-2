// Shared display formatting for HUD numbers.
//
// WHY THIS MODULE EXISTS: mass runs from ~20 at spawn to 10,000,000 at level
// 100. A raw six-figure readout is a readability problem, not a style
// preference — `Mass 1234500 / 10000000` cannot be parsed at a glance while
// steering. Abbreviation fixes that, but ONLY if every surface showing the
// same quantity abbreviates the same way: an aggregated "+124k" float rising
// off a bite while the HUD next to it reads `Mass 1234500` is worse than
// either choice made consistently.
//
// So this is deliberately a SHARED module rather than a helper inside the
// float path. Current consumers: the HUD score readout (overlays.js
// updateHUD) and the "+N" mass float (overlays.js spawnMassFloat, fed from
// main.js's eat aggregation). Future HUD numbers — and the recorded-but-
// unbuilt tier-up prop re-tint work — should use it rather than re-deriving.
//
// It lives in ui/ rather than data/ on purpose: this is PRESENTATION of a
// quantity, not a game formula. Nothing here may ever be used to compute
// gameplay — formulas.js owns the numbers, this owns how they read. Keeping
// it out of data/ also keeps it out of the difficulty invariant suite's
// import graph, where a display concern has no business.
//
// Pure: no DOM, no THREE, no module-level browser API. Safe to import in Node.

const UNITS = [
  { limit: 1e9, suffix: 'B' },
  { limit: 1e6, suffix: 'M' },
  { limit: 1e3, suffix: 'k' },
];

/**
 * Compact number for display.
 *
 *   < 1000        integer, as-is          250      -> "250"
 *   >= 1000       3 significant figures   1250     -> "1.25k"
 *   with a suffix                         12400    -> "12.4k"
 *                                         124000   -> "124k"
 *                                         1250000  -> "1.25M"
 *
 * No thousands separators anywhere — the suffix replaces them.
 *
 * TRUNCATES rather than rounds, at every precision. This is not fussiness: the
 * same formatter renders a PROGRESS readout, and a value that rounds UP would
 * display a milestone the player has not actually reached (999,900 showing as
 * "1.00M" against a 1M target reads as a win one frame before it fires).
 * Truncating can only ever under-report, which is the safe direction.
 *
 * @param {number} n
 * @returns {string}
 */
export function formatCompact(n) {
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0;
  const v = Math.abs(n);
  const sign = neg ? '-' : '';

  if (v < 1000) return `${sign}${Math.floor(v)}`;

  for (const { limit, suffix } of UNITS) {
    if (v < limit) continue;
    const scaled = v / limit; // 1 .. 999.999…
    // 3 significant figures: the decimal count shrinks as the integer part
    // grows, so the string stays the same width band regardless of magnitude.
    const decimals = scaled < 10 ? 2 : (scaled < 100 ? 1 : 0);
    const factor = 10 ** decimals;
    const truncated = Math.floor(scaled * factor) / factor;
    // Truncation cannot push a value UP into the next band, so no re-check is
    // needed here — 999,999 truncates to "999k", never "1000k". (Rounding
    // would have needed that guard, which is a second reason to truncate.)
    return `${sign}${truncated.toFixed(decimals)}${suffix}`;
  }

  return `${sign}${Math.floor(v)}`;
}

/**
 * Compact, but NEVER renders identically to `reference` while short of it.
 *
 * Why this is a separate function and not a change to formatCompact: several
 * callers share formatCompact (the "+N" float, the target side of the score
 * readout) and none of them has a reference value to compare against.
 * Widening formatCompact's precision globally would make every number longer
 * to fix a problem only the progress readout has.
 *
 * The problem (`.wiki/0004-false-level-failure` §4.4): 3 significant figures
 * means a mass just short of target can truncate onto the target's own
 * string. Worst case measured is L75, where 5,620,000 renders "5.62M" — the
 * same as the 5,625,000 target — so the HUD reads "5.62M / 5.62M" on a run
 * that has not reached target. Bounded at 0.09%, but it is a readout
 * asserting a goal is met when it is not, which is the same family of defect
 * as 0004 itself.
 *
 * The fix: inside the top 1% of the reference, add a significant figure —
 * enough to separate 0.09% — and if that STILL collides (possible only when
 * the value is genuinely within a hair of the reference), fall back to a
 * "99.9%" style readout, which cannot collide because it is a different
 * shape entirely.
 *
 * TRUNCATION DIRECTION IS PRESERVED at every branch: this may under-report,
 * it may never over-report. A progress readout that rounds up shows a goal
 * reached one frame before it is.
 *
 * @param {number} n
 * @param {number} reference the target this value is progress toward
 */
export function formatProgress(n, reference) {
  const base = formatCompact(n);
  if (!Number.isFinite(reference) || reference <= 0) return base;
  if (!Number.isFinite(n) || n >= reference) return base;

  // Below 99% there is no collision risk: 3 sig figs separates values that
  // far apart at every magnitude, and the common case stays short.
  if (n / reference <= 0.99) return base;

  if (base !== formatCompact(reference)) return base;

  // Collision. Add one significant figure, still truncating.
  const extended = formatExtended(n);
  if (extended !== formatExtended(reference)) return extended;

  // Still equal — the value is within a hair of the reference. A percentage
  // is a different SHAPE, so it cannot be mistaken for the target's figure.
  // Truncated, and held below 100 so it never claims completion.
  const pct = Math.min(99.9, Math.floor((n / reference) * 1000) / 10);
  return `${pct.toFixed(1)}%`;
}

// formatCompact with one extra significant figure. Same truncation rule, same
// suffixes; used only by formatProgress's collision path.
function formatExtended(n) {
  if (!Number.isFinite(n)) return '0';
  const v = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (v < 1000) return `${sign}${Math.floor(v)}`;
  for (const { limit, suffix } of UNITS) {
    if (v < limit) continue;
    const scaled = v / limit;
    const decimals = scaled < 10 ? 3 : (scaled < 100 ? 2 : 1);
    const factor = 10 ** decimals;
    return `${sign}${(Math.floor(scaled * factor) / factor).toFixed(decimals)}${suffix}`;
  }
  return `${sign}${Math.floor(v)}`;
}

/**
 * The same value as a signed gain, for the "+N" mass float.
 * Awards are always positive in practice; the sign is explicit so the float
 * never renders a bare number that could be misread as a total.
 */
export function formatGain(n) {
  return `+${formatCompact(Math.max(0, n))}`;
}
