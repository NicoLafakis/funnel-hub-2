// Layout-insensitive completability model — the scoring behind invariants 5
// and 7. Read .wiki/0003-hole-feel-and-visual-fidelity/00-findings.md §15
// before changing anything in here.
//
// WHY THIS EXISTS
//
// Invariant 5 ("every level completable by the bot without upgrades") used to
// be scored by scripts/soak-bot.js, which walks a greedy route: each frame it
// steers at the NEAREST edible prop. That makes the finish time a function of
// prop COORDINATES, and §13 measured the consequence — perturbing only prop
// positions (a salt on levelSeed, economy byte-identical) failed invariant 5 in
// 8 of 8 trials at 94-98/100, while the aggregated invariant 6 passed all 8.
// Invariant 5 was not testing the economy; it was pinning one authored layout,
// and so it blocked every re-layout regardless of whether the new layout was
// better. This is the same defect §6 found in invariant 6, and the fix
// prescribed at COMPLETION_PACING_BAND in scripts/invariant-test.js was:
// "score against an ordered mass budget rather than a walked path".
//
// WHAT THIS DOES INSTEAD
//
// It consumes the REAL generated prop list, but reads only each prop's
// (radius, mass, golden, elite) — NEVER its x/z. Positions are replaced by a
// density model:
//
//   * The props still edible at the current size gate form a pool. Their
//     spatial DENSITY is count / worldArea — a number a salt cannot change.
//   * Expected travel to the next prop of a given kind is NEAREST_NEIGHBOUR_K
//     / sqrt(density) — the standard Poisson nearest-neighbour distance.
//   * While travelling that distance the avatar sweeps a corridor of width
//     2 * eatReach, so it incidentally swallows density * distance * 2 *
//     eatReach other edible props on the way. This is what reproduces the
//     late-game "big hole hoovers up everything" acceleration, and it is the
//     same sweep model already used for the rival hoard cap in soak-bot.js
//     (PLAYER_BASE_SPEED * 60 * REACH_SWEEP_WIDTH / world^2).
//   * Each step the model takes the pool with the best mass-per-second RATE,
//     not the nearest prop. That is the "ordered mass budget": completability
//     is measured against competent play, not against one arbitrary walk.
//
// Everything else is the real economy, shared with the game: radiusFromMass,
// the growth-drag speed curve, DEFAULT_SIZE_GATE, EAT_REACH_FACTOR,
// progressionAwardReport and capProgressionAward, the capstone size gate and
// the landmark shield. A change to any of those moves this model immediately.
//
// DELIBERATE SIMPLIFICATIONS (all make the model slightly OPTIMISTIC, and are
// absorbed into the NEAREST_NEIGHBOUR_K calibration below):
//   * Rivals do not compete for props here. Rival pressure is separately
//     gated by invariant 3 (hoard at minute 1 <= player reachable mass).
//   * Storm/hazard drops and mid-level spawns are not modelled; invariant 9
//     separately bounds spawned mass against the available-mass budget.
//   * Combo multipliers are not applied. Invariant 4 covers the combo path,
//     and leaving combo out keeps this a floor: a level that completes here
//     completes without needing a combo streak.

import {
  PLAYER_BASE_SPEED, radiusFromMass, capstoneGateRadius, progressionAwardReport,
} from '../src/data/formulas.js';
import { DEFAULT_SIZE_GATE, EAT_REACH_FACTOR } from '../src/systems/swallow.js';
import { generateLevel } from '../src/data/levels.js';
import { generateDistrict } from '../src/content/districts.js';

// Poisson nearest-neighbour constant. For an ideal Poisson field the expected
// distance to the nearest of N points in area A is 0.5 / sqrt(N/A). The value
// below is that 0.5 scaled by a calibration factor that absorbs the
// simplifications listed above (no rivals, no storms, no combo) plus the fact
// that a real route cannot turn instantly. It was fitted ONCE, against the
// authored layout, so that this model's completion fractions sit in the same
// range as the walked bot's rather than being systematically fast or slow.
//
// DO NOT tune this to make a failing level pass. It is a property of the
// geometry of random point fields, not a difficulty dial. If levels are failing
// and the economy is right, the bug is in the economy or in this model's
// structure, not in this constant. See §15 for the sensitivity measurements
// that this value was validated against.
export const NEAREST_NEIGHBOUR_K = 1.15;

// Guard against a degenerate pool (one prop left in a huge world) producing an
// absurd travel distance that stalls the model. Capped at the world diagonal.
function travelDistance(remaining, worldArea, world) {
  if (remaining <= 0) return Infinity;
  const density = remaining / worldArea;
  return Math.min(NEAREST_NEIGHBOUR_K / Math.sqrt(density), world * Math.SQRT2);
}

// Props are pooled by their ECONOMIC identity. Two props with the same radius,
// mass and golden/elite flags are interchangeable to this model — which is
// exactly the equivalence a position-only perturbation preserves.
function poolKey(p) {
  return `${p.radius.toFixed(4)}|${p.mass}|${p.golden ? 1 : 0}|${p.elite ? 1 : 0}`;
}

export function estimateCompletion(n, opts = {}) {
  const level = opts.level || generateLevel(n);
  const layout = opts.layout || generateDistrict(level);

  const ivm = level.itemValueMultiplier;
  const twist = level.isCapstone && level.capstoneTwist ? (level.capstoneTwist.params || {}) : {};
  const ivmEff = ivm * Math.max(1, Number(twist.valueMultiplier) || 1);
  const buildStats = opts.buildStats && typeof opts.buildStats === 'object' ? opts.buildStats : {};
  const totalTime = level.time + Math.max(0, Number(buildStats.extraSeconds) || 0);
  const speedMultiplier = Math.max(0.1, Number(buildStats.moveSpeedMultiplier) || 1)
    * Math.max(0.1, Number(twist.speedMultiplier) || 1);
  const reachMultiplier = Math.max(1, Number(buildStats.attractRadiusMultiplier) || 1);
  const eatRadiusMultiplier = Math.max(1, Number(buildStats.eatRadiusMultiplier) || 1);
  const massGainMultiplier = Math.max(1, Number(buildStats.massGainMultiplier) || 1);
  const awardFraction = typeof opts.ordinaryMassFraction === 'number'
    ? opts.ordinaryMassFraction
    : level.progression.ordinaryMassFraction;

  const world = level.world;
  const worldArea = world * world;

  // --- Build the position-free pools from the real generated content. -------
  const pools = new Map();
  for (const rec of layout.props) {
    const prop = {
      radius: rec.radius * (rec.scaleMult || 1),
      mass: rec.mass,
      golden: !!rec.golden,
      elite: !!rec.elite,
    };
    if (rec.hazard) continue; // hazards award nothing; invariant 9 covers them
    const key = poolKey(prop);
    const pool = pools.get(key);
    if (pool) pool.count += 1;
    else pools.set(key, { ...prop, count: 1 });
  }

  const capstoneTier = level.template[level.template.length - 1];
  let shieldRemaining = level.mechanics && level.mechanics.landmarkShield
    ? level.mechanics.landmarkShield : 0;
  const capstone = {
    radius: capstoneGateRadius(level),
    mass: capstoneTier.baseMass * 8,
    isCapstone: true,
    capstoneGate: shieldRemaining > 0 ? 0 : level.capstoneGate,
  };
  const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE || level.isCapstone;

  const awardOf = (prop) => {
    const report = progressionAwardReport(prop, ivmEff, awardFraction, level.target);
    return report.amount * massGainMultiplier;
  };

  // --- Run the ordered-budget consumption. ----------------------------------
  let mass = Math.max(0, Number(buildStats.startMass) || 0);
  let t = 0;
  let propsEaten = 0;
  let capstoneEaten = false;
  let completed = false;
  let completionTime = null;
  let awardedMassAtCompletion = null;
  let stuck = false;
  let capstoneEdibleTime = null;

  const radiusCap = world * 0.2;
  const botRadius = () => Math.min(radiusFromMass(mass / ivm), radiusCap);

  // Lowest mass at which the capstone's size gate opens, found by bisection so
  // this stays correct whatever curve radiusFromMass uses. Infinity if the gate
  // can never open (the radius cap is below the requirement) — invariant 4
  // separately asserts that does not happen.
  const capstoneGateMass = (() => {
    if (!(capstone.capstoneGate > 0) && !(level.capstoneGate > 0)) return Infinity;
    const gateFraction = capstone.capstoneGate > 0 ? capstone.capstoneGate : level.capstoneGate;
    const needRadius = capstone.radius / gateFraction;
    const edibleAt = (m) => Math.min(radiusFromMass(m / ivm), radiusCap)
      * eatRadiusMultiplier >= needRadius;
    let hi = level.target;
    let guardExp = 0;
    while (!edibleAt(hi) && guardExp < 64) { hi *= 2; guardExp += 1; }
    if (!edibleAt(hi)) return Infinity;
    let lo = 0;
    for (let i = 0; i < 64; i += 1) {
      const mid = (lo + hi) / 2;
      if (edibleAt(mid)) hi = mid; else lo = mid;
    }
    return hi;
  })();

  // Hard iteration bound: every step eats at least one prop, so the prop count
  // plus a margin for the capstone is a sound ceiling. Prevents any future
  // edit from turning a stall into a hang.
  let guard = 0;
  const guardLimit = layout.props.length + 16;

  while (t < totalTime - 1e-9 && guard < guardLimit) {
    guard += 1;
    if (!completed && mass >= level.target && (!capstoneRequired || capstoneEaten)) {
      completed = true;
      completionTime = t;
      awardedMassAtCompletion = mass;
      break;
    }

    const r = botRadius();
    const eatR = r * eatRadiusMultiplier;
    const gate = eatR * DEFAULT_SIZE_GATE;
    const reach = eatR * EAT_REACH_FACTOR * reachMultiplier;
    const speed = PLAYER_BASE_SPEED * speedMultiplier * (60 / Math.max(60, r));

    if (capstoneEdibleTime === null && capstone.capstoneGate > 0
      && eatR >= capstone.radius / capstone.capstoneGate) {
      capstoneEdibleTime = t;
    }

    // Total edible density drives the incidental sweep pickup.
    let edibleCount = 0;
    for (const pool of pools.values()) {
      if (pool.count > 0 && pool.radius <= gate) edibleCount += pool.count;
    }

    // Once mass is already at target and the only thing still standing between
    // the bot and the win is the capstone, extra mass is waste: the objective
    // flips from "grow fastest" to "spend as little as possible while opening
    // the landmark". This matters on shielded levels (L61+), where the shield
    // must be cracked by eating N further props — a player does that on cheap
    // props, not by gorging on buildings. Without this the model banks two or
    // three more maximum-value meals and finishes at 2-4x target, which is not
    // how the level is actually played.
    const hoardingIsWaste = capstoneRequired && !capstoneEaten && mass >= level.target;

    // Candidate moves, scored by mass per second — or by cheapness once
    // further mass is waste (above).
    let best = null;
    for (const pool of pools.values()) {
      if (pool.count <= 0 || pool.radius > gate) continue;
      const dist = travelDistance(pool.count, worldArea, world);
      const time = dist / speed;
      if (!(time > 0) || !Number.isFinite(time)) continue;
      // Props incidentally swallowed in the swept corridor on the way there.
      const sweptArea = dist * 2 * reach;
      const incidental = Math.min(
        Math.max(0, edibleCount - 1),
        (edibleCount / worldArea) * sweptArea,
      );
      const gain = awardOf(pool) * (1 + incidental);
      const rate = gain / time;
      const score = hoardingIsWaste ? -gain : rate;
      if (!best || score > best.score) best = { pool, time, gain, rate, incidental, score };
    }

    // The capstone is both the best meal and, on gated levels, the finish
    // line, so it is taken the MOMENT it is edible — mirroring the walked
    // bot, which unconditionally re-targets it on the same condition. Scoring
    // it on rate instead would be wrong: it is a single object, so its
    // nearest-neighbour distance is the whole world and its rate is always
    // poor, yet on a gated level no amount of other food can finish the level.
    if (!capstoneEaten && capstone.capstoneGate > 0
      && capstone.radius <= eatR * capstone.capstoneGate) {
      const dist = travelDistance(1, worldArea, world);
      best = {
        capstone: true,
        time: dist / speed,
        gain: awardOf(capstone),
        incidental: 0,
      };
    }

    if (!best) {
      // Nothing edible and the capstone is not open — the level is unfinishable
      // from here no matter how the props were arranged.
      stuck = !completed;
      break;
    }

    // A step here is one whole acquisition and can be worth >20% of target, so
    // it can leap the avatar from below the capstone's size gate to past the
    // target in a single move — skipping the window in which the capstone
    // becomes edible, and leaving the model eating far past target waiting for
    // a gate it already jumped over. Truncate the step at the gate instead, so
    // the next iteration sees the capstone open. The walked bot never needed
    // this because its dt of 0.2s is fine-grained enough to catch the
    // transition; a discrete model has to catch it explicitly.
    // The two thresholds a step must not skip while the capstone is still
    // outstanding are the gate mass (below which the landmark cannot be eaten)
    // and the target itself (above which any further mass is waste). Truncate
    // at whichever comes first.
    if (capstoneRequired && !capstoneEaten && !best.capstone) {
      let ceiling = Infinity;
      if (Number.isFinite(capstoneGateMass) && mass < capstoneGateMass) {
        ceiling = Math.min(ceiling, capstoneGateMass);
      }
      if (mass < level.target) ceiling = Math.min(ceiling, level.target);
      if (Number.isFinite(ceiling) && mass + best.gain > ceiling) {
        const fraction = best.gain > 0 ? (ceiling - mass) / best.gain : 1;
        t += best.time * fraction;
        mass = ceiling;
        continue;
      }
    }

    // If this step crosses the target and the capstone condition is already
    // satisfied, the level finished PART WAY through the step. Interpolate the
    // crossing rather than banking the whole lump: steps here are coarse (a
    // capstone alone is capped at 15% of target), and rounding a win up to the
    // next whole step would inflate both the completion time and the recorded
    // mass, which is what invariant 7 reads.
    const capstoneSatisfiedAfter = capstoneEaten || best.capstone || !capstoneRequired;
    if (capstoneSatisfiedAfter && mass < level.target && mass + best.gain >= level.target) {
      const fraction = best.gain > 0 ? (level.target - mass) / best.gain : 1;
      t += best.time * fraction;
      mass = level.target;
      if (best.capstone) capstoneEaten = true;
      completed = true;
      completionTime = t;
      awardedMassAtCompletion = mass;
      break;
    }

    t += best.time;
    mass += best.gain;
    if (best.capstone) {
      capstoneEaten = true;
      capstone.capstoneGate = level.capstoneGate;
    } else {
      best.pool.count -= 1;
      propsEaten += 1 + best.incidental;
      // Remove the incidentally swept props from the edible pools, in
      // proportion to their share of the edible population.
      if (best.incidental > 0 && edibleCount > 1) {
        let toRemove = best.incidental;
        for (const pool of pools.values()) {
          if (toRemove <= 0) break;
          if (pool.count <= 0 || pool.radius > gate) continue;
          const share = Math.min(pool.count, toRemove * (pool.count / edibleCount));
          pool.count -= share;
          toRemove -= share;
        }
      }
      // Landmark shield (L61+): the walked bot cracks it once per OBJECT
      // eaten, so a step that sweeps several props cracks it several times.
      // Decrementing once per step instead would leave the shield up long
      // enough for the timer to expire on every shielded level.
      if (shieldRemaining > 0) {
        shieldRemaining = Math.max(0, shieldRemaining - (1 + best.incidental));
        if (shieldRemaining === 0) capstone.capstoneGate = level.capstoneGate;
      }
    }
  }

  if (!completed && mass >= level.target && (!capstoneRequired || capstoneEaten)) {
    completed = true;
    completionTime = Math.min(t, totalTime);
    awardedMassAtCompletion = mass;
  }

  return {
    n: level.n,
    target: level.target,
    time: totalTime,
    completed,
    completionTime,
    finalMass: mass,
    capstoneRequired,
    capstoneEaten,
    capstoneEdibleTime,
    propsEaten,
    completionFraction: completionTime === null ? null : completionTime / totalTime,
    budgetConsumptionFraction: awardedMassAtCompletion === null
      ? null
      : awardedMassAtCompletion / level.progression.massBudget,
    stuck,
  };
}

// Standalone: `node scripts/reachability-model.js [n ...]`
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const ns = process.argv.slice(2).map(Number).filter((v) => Number.isInteger(v) && v >= 1 && v <= 100);
  for (const n of ns.length ? ns : [1]) {
    console.log(JSON.stringify(estimateCompletion(n), null, 2));
  }
}
