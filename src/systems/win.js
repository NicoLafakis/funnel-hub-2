// THE LEVEL'S WIN RULE, IN ONE PLACE.
//
// Why this module exists (`.wiki/0004-false-level-failure/00-findings.md`):
// from L10 up, 91 of 100 levels require BOTH `mass >= target` AND the
// district landmark swallowed. That conjunction used to be written out twice
// in main.js — the timer-expiry branch and the per-frame branch — and NO
// user-facing surface rendered from either. The HUD showed a mass bar that
// clamped at 100% and sat there reading "won" for the rest of the run, and
// the fail screen printed "Time ran out at X / Y mass" unconditionally, so a
// landmark loss displayed a number OVER target and blamed the mass. The
// player met the only condition the game ever showed them and still lost.
//
// The class of bug is "a win condition exists in the rules that does not
// exist on any always-on surface". The structural guard is this file: ONE
// definition of winning, consumed by every surface that talks about it —
// the timer branch, the per-frame branch, the HUD capstone chip, the mass
// bar's gated state, and the fail copy. Add a third win condition tomorrow
// and it appears in the UI and in the loss explanation for free, because
// none of those surfaces knows the rule independently.
//
// PURITY CONTRACT: no THREE, no DOM, no imports beyond the gate constant.
// `evaluateWin` takes a plain snapshot object, not the live `state`/`avatar`,
// so the whole rule is Node-testable and the logic suite asserts its truth
// table directly. Everything here is a pure function of its arguments.

import { DEFAULT_SIZE_GATE } from './swallow.js';

/**
 * @typedef {{
 *   mass: number,
 *   capstoneEaten: boolean,
 *   capstoneEdible: boolean,
 *   shieldRemaining: number,
 *   peakCombo: number,
 *   portalComboNeeded: number,
 * }} RunSnapshot
 *
 * `capstoneEdible` MUST be written from the same comparison the per-frame
 * edibility pass runs (`obj.radius <= r * gate`) rather than recomputed here.
 * Recomputing it would let the chip and the actual swallow disagree at the
 * boundary — the player would read "EAT THE LANDMARK" on a frame where the
 * swallow still refuses, which is a smaller version of the same lie 0004 was.
 *
 * `portalComboNeeded` is 0 unless the L100 portal-protocol twist is active.
 */

/**
 * @param {RunSnapshot} runState
 * @param {{ target: number, capstoneGate: number, isCapstone: boolean }} level
 */
export function evaluateWin(runState, level) {
  const massMet = runState.mass >= level.target;
  const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE || !!level.isCapstone;
  const capstoneMet = !capstoneRequired || !!runState.capstoneEaten;

  // Why the capstone is not yet takeable, MOST SPECIFIC REASON FIRST. Order
  // is load-bearing: a shielded landmark on L61+ is also not edible by size,
  // and telling the player to "grow bigger" when the real blocker is a shield
  // that ten more eats would crack is the same category of misdirection this
  // module exists to prevent.
  let capstoneBlocker = null; // null | 'shield' | 'combo' | 'size'
  if (capstoneRequired && !runState.capstoneEaten) {
    if (runState.shieldRemaining > 0) capstoneBlocker = 'shield';
    else if (runState.portalComboNeeded > 0
      && runState.peakCombo < runState.portalComboNeeded) capstoneBlocker = 'combo';
    else if (!runState.capstoneEdible) capstoneBlocker = 'size';
  }

  return {
    won: massMet && capstoneMet,
    massMet,
    capstoneRequired,
    capstoneMet,
    capstoneBlocker,
    // What actually stopped this run — the fail copy renders FROM this rather
    // than from an authored sentence. A hard-coded explanation of a loss is a
    // lie waiting for the rules to change under it, which is exactly what
    // happened in 0004.
    blockingReason: massMet && capstoneMet
      ? null
      : (!massMet && !capstoneMet ? 'both' : (!massMet ? 'mass' : 'capstone')),
  };
}

/**
 * The capstone HUD chip, as a pure function of the same evaluation — five
 * states. Returned as data (`{ hidden, tone, text }`) rather than DOM so the
 * logic suite can assert the mapping without a browser.
 *
 * `tone` drives the CSS class: 'locked' | 'ready' | 'done'.
 *
 * @param {ReturnType<typeof evaluateWin>} win
 * @param {RunSnapshot} runState
 */
export function capstoneChipState(win, runState) {
  if (!win.capstoneRequired) return { hidden: true, tone: 'locked', text: '' };
  if (runState.capstoneEaten) {
    return { hidden: false, tone: 'done', text: '🏙️ landmark down' };
  }
  if (win.capstoneBlocker === 'shield') {
    const n = Math.max(0, Math.floor(runState.shieldRemaining));
    return { hidden: false, tone: 'locked', text: `🛡️ landmark shielded · ${n} more eats` };
  }
  if (win.capstoneBlocker === 'combo') {
    const best = Math.max(0, Math.floor(runState.peakCombo));
    const need = Math.max(0, Math.floor(runState.portalComboNeeded));
    return { hidden: false, tone: 'locked', text: `🌀 portal sealed · combo ${best}/${need}` };
  }
  if (win.capstoneBlocker === 'size') {
    return { hidden: false, tone: 'locked', text: '🏙️ landmark: grow bigger' };
  }
  // Not eaten, and nothing is blocking it — it is takeable RIGHT NOW.
  return { hidden: false, tone: 'ready', text: '🏙️ EAT THE LANDMARK' };
}

// The mass bar must never read "complete" on a level that is not won. While a
// capstone is outstanding the fill is held short of full and marked gated.
//
// INVARIANT THIS PRESERVES: a full, ungated bar means the level is won. That
// is the property 0004 broke — the bar clamped to 100% and sat there for
// minutes on a run that could not be won without the landmark.
export const GATED_BAR_MAX_PERCENT = 92;

/**
 * @returns {{ percent: number, gated: boolean }}
 */
export function massBarState(mass, target, win) {
  if (!(target > 0)) return { percent: 0, gated: false };
  const raw = (mass / target) * 100;
  const outstanding = !!(win && win.capstoneRequired && !win.capstoneMet);
  const percent = outstanding
    ? Math.max(0, Math.min(GATED_BAR_MAX_PERCENT, raw))
    : Math.max(0, Math.min(100, raw));
  return { percent, gated: outstanding };
}

/**
 * The landmark's effective size-gate radius, and the scale its mesh must take
 * to match it.
 *
 * The gate is ALWAYS the economy-derived radius (`capstoneGateRadius(level)`),
 * and a mesh larger than that is shrunk to it — the drawn thing is the
 * measured thing. The spawn used to take `max(geometry, economy)`, which let
 * mega-spire's 73.6u bounding radius win on L41-L50 and pushed the gate to
 * 101.6% of the target the HUD advertises: ten levels that could not be won at
 * their own stated goal (.wiki/0004 §4.3). Every other metro's landmark is
 * already under the economy radius and is returned unscaled.
 *
 * Lives here rather than inline in main.js so the logic suite can assert the
 * "advertised target is a sufficient goal" property against the REAL rule
 * instead of restating it.
 *
 * @param {number} boundingRadius the landmark mesh's own bounding radius
 * @param {number} gateRadius     capstoneGateRadius(level)
 * @returns {{ radius: number, meshScale: number }}
 */
export function capstoneEffectiveRadius(boundingRadius, gateRadius) {
  if (!(boundingRadius > 0) || !(gateRadius > 0)) {
    return { radius: gateRadius > 0 ? gateRadius : 0, meshScale: 1 };
  }
  return {
    radius: gateRadius,
    meshScale: boundingRadius > gateRadius ? gateRadius / boundingRadius : 1,
  };
}

/**
 * The fail-screen explanation, as a PURE function of the evaluation. Pulled
 * out of levelFail() so the logic suite can assert every quadrant — in
 * particular the 0004 acceptance test: when the mass target was MET and the
 * landmark was not, the copy must never blame the mass.
 *
 * Returns an HTML fragment (the fail screen renders with innerHTML and the
 * mass figures are bolded, as before).
 *
 * @param {ReturnType<typeof evaluateWin>} win
 * @param {{ mass:number, target:number, shieldRemaining:number,
 *           peakCombo:number, portalComboNeeded:number }} ctx
 */
export function failReasonText(win, ctx) {
  const massText = `<b>${Math.floor(ctx.mass).toLocaleString()}</b> / ${Number(ctx.target).toLocaleString()} mass`;

  if (win.blockingReason === 'capstone') {
    // THE 0004 CASE. Mass was met. Never blame the number the player hit.
    let tail;
    if (win.capstoneBlocker === 'shield') {
      tail = ` Its shield held: ${Math.max(0, Math.floor(ctx.shieldRemaining))} more eats would have cracked it.`;
    } else if (win.capstoneBlocker === 'combo') {
      tail = ` The Portal never opened: it needs a peak combo of ${Math.floor(ctx.portalComboNeeded)}`
        + ` (best this run: ${Math.floor(ctx.peakCombo)}).`;
    } else {
      tail = ' You needed to grow bigger before it could go down.';
    }
    return `You hit the mass target (${massText}), but the district landmark is still standing.${tail}`;
  }

  if (win.blockingReason === 'both') {
    return `Time ran out at ${massText}, with the district landmark still standing.`;
  }

  // 'mass' — and the defensive default. Today's sentence, which is correct
  // ONLY when the mass really is what fell short.
  return `Time ran out at ${massText}.`;
}
