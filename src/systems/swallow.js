// Swallow mechanic — ported from the current shipped 2D game's per-frame
// swallow loop (recovered from git history: `git show 97c9024:index.html`,
// lines ~764-800: the `for(let i=objs.length-1;i>=0;i--)` block inside
// `update(dt)`), projected from the (x,y) canvas plane onto the 3D (x,z)
// ground plane. Height (y) is not part of either gate below, exactly like
// the original (a 2D game has no height axis at all) — see
// docs/city-3d-redesign-plan.md line ~104, which calls this "same
// distance-check logic ... projected onto the XZ plane."
//
// PROP OBJECT CONTRACT (assumed; propObjects are produced/owned by a later
// content/propkit.js stage, not this file): each entry is expected to expose
//   {
//     position: { x, y, z },   // world position (THREE.Vector3 or plain)
//     radius: number,          // matches the object's visual footprint
//     mass: number,            // BASE (level-1-equivalent) mass — i.e. the
//                              // src/data/levels.js LEVEL_TEMPLATE baseMass,
//                              // NOT yet scaled by the level's
//                              // itemValueMultiplier(n) (see below)
//     golden?: boolean,        // flags an 8x-value jackpot spawn
//     isCapstone?: boolean,    // flags the level's landmark object
//     capstoneGate?: number,   // only meaningful when isCapstone is true —
//                              // the level's capstoneGate(n) fraction
//                              // (src/data/formulas.js), attached by the
//                              // spawner at construction time
//   }
//
// Why itemValueMultiplier is a parameter here instead of pre-baked into
// obj.mass: src/data/levels.js generates each level's `template` from the
// SAME base (level-1-equivalent) taxonomy for every level, and exposes
// `itemValueMultiplier` as a separate sibling field — the scaling is meant
// to be applied once, at the point mass is actually awarded, which is here.
//
// No browser-only API is touched anywhere in this file (pure logic), so a
// bare `import` of this file never throws in Node.

// EXACT thresholds ported from the original:
//   - proximity/"reach" gate: `dx*dx+dy*dy < (r*0.82)*(r*0.82)` (index.html:774)
//   - size gate: `o.r <= r*0.78` (index.html:774) — this is the fixed default
//     every non-capstone object uses; capstone objects use the level's
//     capstoneGate(n) fraction instead (0.78/0.80/0.85/0.92/0.95 by tier,
//     see src/data/formulas.js capstoneGate()), per the redesign plan's
//     difficulty curve, NOT the original 2D game (which had no capstones).
//   - golden bonus: golden records in the original spawn with `pts`
//     pre-multiplied by 8 (`spawnObj("🌟", base[1], base[2]*8, world, true)`,
//     index.html:463), so eating one is worth 8x an equivalent non-golden
//     object of the same base value. Applied explicitly here instead, since
//     `golden` is just a flag on the prop object in this pipeline rather
//     than a pre-inflated `pts` field baked in at spawn time.
export const EAT_REACH_FACTOR = 0.82;
export const DEFAULT_SIZE_GATE = 0.78;
export const GOLDEN_BONUS_MULTIPLIER = 8;

/**
 * Checks the avatar against every candidate prop object for one frame's
 * worth of eating, removing whatever qualifies from `propObjects` in place
 * (splice, matching the original's `objs.splice(i,1)`) and tallying the
 * mass gained.
 *
 * @param {{radius: () => number, position: {x:number,y:number,z:number}}} avatar
 * @param {Array<object>} propObjects - mutated in place: eaten entries are removed.
 * @param {{mult: () => number, onEat: () => number}} comboTracker - see
 *   src/systems/combo.js `createComboTracker()`.
 * @param {number} itemValueMultiplier - this level's itemValueMultiplier(n)
 *   (src/data/formulas.js / src/data/levels.js), applied to every prop's
 *   BASE mass at the moment it's eaten.
 * @param {number} [reachMultiplier=1] - additive-range bonus from the "magnet"
 *   meta-upgrade track (src/meta/upgrades.js applyUpgrades().attractRadiusMultiplier).
 *   Applied ONLY to the proximity/"reach" gate, never to the size gate below
 *   — magnet extends pickup RANGE, it must never make a bigger object
 *   swallowable that wouldn't otherwise fit under the size gate. Defaults to
 *   1 (no-op) so existing callers/tests seed byte-identical behavior to
 *   before this parameter existed.
 * @returns {{eaten: Array<object>, massGained: number}}
 */
export function checkSwallow(avatar, propObjects, comboTracker, itemValueMultiplier, reachMultiplier = 1) {
  const r = avatar.radius();
  const safeReachMultiplier = typeof reachMultiplier === 'number' && Number.isFinite(reachMultiplier) && reachMultiplier > 0
    ? reachMultiplier
    : 1;
  const reach = r * EAT_REACH_FACTOR * safeReachMultiplier;
  const reachSq = reach * reach;

  // EXACT ordering from the original: the combo multiplier is read ONCE per
  // frame, before iterating eaten objects (`const mult=comboMult();` runs
  // before the swallow loop starts, index.html:765) — so every object eaten
  // within the same frame uses the multiplier as it stood at the START of
  // that frame, even though combo.count (and therefore next frame's mult)
  // climbs with each eat inside the loop.
  const mult = comboTracker.mult();

  const eaten = [];
  let massGained = 0;

  for (let i = propObjects.length - 1; i >= 0; i--) {
    const obj = propObjects[i];
    const dx = obj.position.x - avatar.position.x;
    const dz = obj.position.z - avatar.position.z;
    if (dx * dx + dz * dz >= reachSq) continue;

    const gateFraction = obj.isCapstone && typeof obj.capstoneGate === 'number'
      ? obj.capstoneGate
      : DEFAULT_SIZE_GATE;
    if (obj.radius > r * gateFraction) continue;

    propObjects.splice(i, 1);

    let gained = obj.mass * itemValueMultiplier * mult;
    if (obj.golden) gained *= GOLDEN_BONUS_MULTIPLIER;

    massGained += gained;
    eaten.push(obj);
    comboTracker.onEat();
  }

  return { eaten, massGained };
}
