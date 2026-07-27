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
 * The same value as a signed gain, for the "+N" mass float.
 * Awards are always positive in practice; the sign is explicit so the float
 * never renders a bare number that could be misread as a total.
 */
export function formatGain(n) {
  return `+${formatCompact(Math.max(0, n))}`;
}
