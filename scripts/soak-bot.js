// Soak bot — a headless greedy bot that PLAYS a seeded level to completion in
// pure Node: no THREE, no DOM, no canvas. It generates the exact district the
// game would (src/content/districts.js + src/data/levels.js + src/data/seeds.js)
// and then simulates the real systems against the real rules:
//   - movement at the player's base speed with V1 growth drag (avatar.js)
//   - contact eating through the REAL checkSwallow (src/systems/swallow.js) —
//     same reach gate (0.82r), same size gates (0.78 / capstoneGate), same
//     golden 8x, same itemValueMultiplier scaling
//   - combo through the REAL createComboTracker (src/systems/combo.js) —
//     2.2s window, mult = 1 + min(4, floor(count/4))
//   - rivals through the REAL createRival/updateRival (src/systems/rivals.js)
//     with the same warmup, radiusCap, massDivisor and hoardCap main.js uses
//   - the landmark-shield rule from main.js (L61+: 10 non-capstone eats to
//     de-shield, gate 0 until then)
//   - the win rule from main.js: mass >= target AND (capstone eaten when the
//     level's capstoneGate > DEFAULT_SIZE_GATE or the level is a capstone)
//
// Deliberate simplifications (all CONSERVATIVE — the bot underestimates a
// human, never overestimates):
//   - greedy nearest-edible routing, no cluster planning, no golden detours
//   - no vacuum-snap assist (pure contact eating only)
//   - storm drops (L11+) are ignored: free extra mass the bot never collects
//   - moving traffic (L21+) is treated as parked (positions stay as seeded)
//   - no perks, mercy magnet or second wind; optional buildStats are used only
//     by the separate maximum-build ceiling probe
//   - capstone value/speed twists are included; visual-only twists are ignored
//
// DETERMINISM: the only nondeterministic API the real systems touch is
// Math.random (rival respawns/wander in rivals.js). The bot swaps in a
// mulberry32 stream derived from the level seed for the whole simulation and
// restores it afterwards, so same level => byte-identical result.
//
// Consumed by scripts/invariant-test.js (the game-design.md §5 "immune
// system"); also usable standalone:
//   node scripts/soak-bot.js 50        -> prints the level-50 run summary

import { generateLevel } from '../src/data/levels.js';
import { generateDistrict } from '../src/content/districts.js';
import { mulberry32 } from '../src/data/seeds.js';
import {
  PLAYER_BASE_SPEED, REACH_SWEEP_WIDTH, radiusFromMass, rivalComposition, capstoneGateRadius,
  capProgressionAward, GOLDEN_MASS_MULTIPLIER,
  RIVAL_HOARD_SAFETY,
} from '../src/data/formulas.js';
import { checkSwallow, DEFAULT_SIZE_GATE } from '../src/systems/swallow.js';
import { createComboTracker } from '../src/systems/combo.js';
import { createRival, updateRival, RIVAL_WARMUP_SECONDS } from '../src/systems/rivals.js';
import { createSpatialHash } from '../src/engine/spatialhash.js';
import { createAvailableMassLedger } from '../src/meta/progression.js';

// Minimal stand-in for the `THREE` parameter of createRival: rivals only use
// Group(), position.set() and scale.setScalar(). Keeps the bot THREE-free
// while exercising the real rival AI code path.
const FAKE_THREE = {
  Group: class FakeGroup {
    constructor() {
      const pos = {
        x: 0, y: 0, z: 0,
        set(x, y, z) { pos.x = x; pos.y = y; pos.z = z; },
      };
      this.position = pos;
      this.scale = { setScalar() {} };
    }
    add() {}
  },
};

const MINUTE_PROBE_SECONDS = 60; // invariant 3 probes rival hoard at minute 1

/**
 * Simulates one full level attempt by the greedy bot, no upgrades.
 *
 * @param {number} n - level number, 1..100
 * @param {{
 *   landmarkRadius: number,       // boundingRadius of the level's landmark
 *                                 // (src/content/landmarks.js — computed by
 *                                 // the caller, which may use THREE)
 *   dt?: number,                  // sim step, seconds (default 0.2)
 *   maxComboMult?: number,        // clamp the combo multiplier (invariant 4
 *                                 // uses 2); default Infinity = real combos
 *   ordinaryMassFraction?: number,// calibration override for tuning only
 *   buildStats?: object,          // applyBuilds() output for ceiling probes
 * }} opts
 * @returns {{
 *   n: number, target: number, time: number, world: number,
 *   completed: boolean, completionTime: number|null, finalMass: number,
 *   massAt60PctTimer: number, massAt60s: number, rivalHoardAt60s: number,
 *   capstoneRequired: boolean, capstoneEdibleTime: number|null,
 *   capstoneEaten: boolean, propsEaten: number, propsRemaining: number,
 *   stuck: boolean,
 * }}
 */
export function simulateLevel(n, opts = {}) {
  const dt = typeof opts.dt === 'number' && opts.dt > 0 ? opts.dt : 0.2;
  const maxComboMult = typeof opts.maxComboMult === 'number' ? opts.maxComboMult : Infinity;
  const landmarkRadius = typeof opts.landmarkRadius === 'number' && opts.landmarkRadius > 0
    ? opts.landmarkRadius
    : 100; // caller should always pass the real one; fallback stays playable

  const level = generateLevel(n);
  const layout = generateDistrict(level);
  const ivm = level.itemValueMultiplier;
  const twistParams = level.isCapstone && level.capstoneTwist
    ? (level.capstoneTwist.params || {})
    : {};
  const valueMultiplier = Math.max(1, Number(twistParams.valueMultiplier) || 1);
  const ivmEff = ivm * valueMultiplier;
  const buildStats = opts.buildStats && typeof opts.buildStats === 'object' ? opts.buildStats : {};
  const totalTime = level.time + Math.max(0, Number(buildStats.extraSeconds) || 0);
  const speedMultiplier = Math.max(0.1, Number(buildStats.moveSpeedMultiplier) || 1)
    * Math.max(0.1, Number(twistParams.speedMultiplier) || 1);
  const reachMultiplier = Math.max(1, Number(buildStats.attractRadiusMultiplier) || 1);
  const eatRadiusMultiplier = Math.max(1, Number(buildStats.eatRadiusMultiplier) || 1);
  const massGainMultiplier = Math.max(1, Number(buildStats.massGainMultiplier) || 1);
  const goldenMassMultiplier = Math.max(1, Number(buildStats.goldenMassMultiplier) || 1);

  // Seeded RNG replaces Math.random for the whole run (see header).
  const rng = mulberry32((level.seed ^ 0xB07B007) >>> 0);
  const originalRandom = Math.random;
  Math.random = rng;

  try {
    // Runtime prop objects, same contract main.js builds (plain positions).
    const propObjects = layout.props.map((rec) => ({
      position: { x: rec.x, y: 0, z: rec.z },
      radius: rec.radius * (rec.scaleMult || 1),
      mass: rec.mass,
      kind: rec.kind,
      golden: !!rec.golden,
      elite: !!rec.elite,
    }));

    // Capstone landmark, mirroring main.js buildLevelWorld: mass = largest
    // tier base * 8, gated by capstoneGate(n) — gate 0 while shielded (L61+).
    // The size-gate radius is max(geometry, the economy-derived gate) via
    // the SAME shared helper main.js uses (formulas.capstoneGateRadius).
    const capstoneTier = level.template[level.template.length - 1];
    let shieldRemaining = level.mechanics && level.mechanics.landmarkShield ? level.mechanics.landmarkShield : 0;
    const capstone = {
      position: { x: layout.landmark.x, y: 0, z: layout.landmark.z },
      radius: Math.max(landmarkRadius, capstoneGateRadius(level)),
      mass: capstoneTier.baseMass * 8,
      kind: level.metro.landmarkType,
      golden: false,
      isCapstone: true,
      capstoneGate: shieldRemaining > 0 ? 0 : level.capstoneGate,
    };
    propObjects.push(capstone);
    const massLedger = createAvailableMassLedger(level, propObjects, ivmEff);

    const hash = createSpatialHash({ cellSize: 100 });
    for (const p of propObjects) hash.insert(p);

    // Bot state — mirrors avatar.js: radius from base mass, world-relative
    // cap, growth-dragged base speed.
    const pos = { x: 0, y: 0, z: 0 };
    let mass = Math.max(0, Number(buildStats.startMass) || 0);
    const radiusCap = level.world * 0.2;
    const botRadius = () => Math.min(radiusFromMass(mass / ivm), radiusCap);
    const avatarShim = { position: pos, radius: botRadius };
    const swallowAvatarShim = {
      position: pos,
      radius: () => botRadius() * eatRadiusMultiplier,
    };

    // Combo: real tracker, with an optional clamp on the multiplier read
    // (invariant 4: "with <= combo x2").
    const combo = createComboTracker();
    const comboShim = {
      mult: () => Math.min(maxComboMult, combo.mult()),
      onEat: () => combo.onEat(),
    };

    // Rivals — same composition, spawn spread, warmup, caps and hoardCap as
    // main.js (the hoardCap corridor model at t=60s, game-design §5 inv. 3).
    const comp = (level.mechanics && Array.isArray(level.mechanics.rivals) && level.mechanics.rivals.length)
      ? level.mechanics.rivals
      : rivalComposition(level.n);
    const reachFraction = Math.min(1, (PLAYER_BASE_SPEED * 60 * REACH_SWEEP_WIDTH) / (level.world * level.world));
    const hoardCap = RIVAL_HOARD_SAFETY * reachFraction * (layout.stats.totalBaseMass || 0)
      * ivm * level.progression.ordinaryMassFraction / Math.max(1, comp.length);
    const rivals = comp.map((archetype) => {
      const angle = rng() * Math.PI * 2;
      const dist = level.world * (0.3 + rng() * 0.15);
      const half = level.world / 2 - 200;
      const rival = createRival({
        x: Math.max(-half, Math.min(half, Math.cos(angle) * dist)),
        y: 0,
        z: Math.max(-half, Math.min(half, Math.sin(angle) * dist)),
      }, FAKE_THREE, archetype);
      rival.warmupTimer = RIVAL_WARMUP_SECONDS;
      rival.radiusCap = level.world * 0.15;
      rival.massDivisor = ivm;
      rival.hoardCap = hoardCap;
      return rival;
    });

    const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE || level.isCapstone;
    const worldBound = level.world / 2 - 30;
    let capstoneEaten = false;
    let propsEaten = 0;
    let propsEatenAtCompletion = null;
    let awardedMassAtCompletion = null;
    let maxSingleAward = 0;
    let stuck = false;

    // Probes (recorded at the first sim time >= the probe time, so the value
    // is "mass gathered BY then" — never ahead of the clock).
    let massAt60s = null;
    let rivalHoardAt60s = null;
    let massAt60Pct = null;
    let capstoneEdibleTime = null;
    const probe60Pct = 0.6 * totalTime;
    const capstoneEdibleNow = () => (
      capstone.capstoneGate > 0
      && botRadius() * eatRadiusMultiplier >= capstone.radius / capstone.capstoneGate
    );

    let completed = false;
    let completionTime = null;
    let t = 0;
    while (t < totalTime - 1e-9) {
      // --- probes + win check at sim time t (before this step's actions) ---
      if (massAt60s === null && t >= MINUTE_PROBE_SECONDS) {
        massAt60s = mass;
        rivalHoardAt60s = rivals.reduce((sum, r) => sum + r.mass, 0);
      }
      if (massAt60Pct === null && t >= probe60Pct) massAt60Pct = mass;
      if (capstoneEdibleTime === null && capstoneEdibleNow()) capstoneEdibleTime = t;
      // The win is recorded, not broken on, so later rival/starvation probes
      // and available-mass accounting use a complete deterministic run.
      if (!completed && mass >= level.target && (!capstoneRequired || capstoneEaten)) {
        completed = true;
        completionTime = t;
        propsEatenAtCompletion = propsEaten;
        awardedMassAtCompletion = mass;
      }

      // --- bot turn -------------------------------------------------------
      combo.update(dt);
      const r = botRadius();

      // Target: the capstone the moment it's edible (it's both the best meal
      // and, on gated levels, the finish line); else nearest edible prop.
      let target = null;
      if (
        !capstoneEaten
        && capstone.capstoneGate > 0
        && capstone.radius <= r * eatRadiusMultiplier * capstone.capstoneGate
      ) {
        target = capstone;
      } else {
        const gate = r * eatRadiusMultiplier * DEFAULT_SIZE_GATE;
        let bestDistSq = Infinity;
        for (const obj of propObjects) {
          if (obj.isCapstone || obj.hazard) continue;
          if (obj.radius > gate) continue;
          const dx = obj.position.x - pos.x;
          const dz = obj.position.z - pos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < bestDistSq) { bestDistSq = distSq; target = obj; }
        }
      }
      if (!target) {
        // Nothing edible anywhere and the capstone isn't either. If the level
        // is picked clean (or already won), that's the end of the run — not
        // a failure state; `stuck` only means the bot could NOT finish.
        if (!capstoneEaten && propObjects.includes(capstone)) {
          target = capstone; // camp the landmark; size gate may still open
          if (propObjects.length === 1) { stuck = !completed; break; }
        } else {
          stuck = !completed;
          break;
        }
      }

      // Move toward the target (avatar.js movement math, camera-free).
      const speed = PLAYER_BASE_SPEED * speedMultiplier * (60 / Math.max(60, r));
      const dx = target.position.x - pos.x;
      const dz = target.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      const stepLen = speed * dt;
      if (d <= stepLen || d < 1e-6) {
        pos.x = Math.max(-worldBound, Math.min(worldBound, target.position.x));
        pos.z = Math.max(-worldBound, Math.min(worldBound, target.position.z));
      } else {
        pos.x = Math.max(-worldBound, Math.min(worldBound, pos.x + (dx / d) * stepLen));
        pos.z = Math.max(-worldBound, Math.min(worldBound, pos.z + (dz / d) * stepLen));
      }

      // Contact eating — the REAL swallow gate set (no vacuum assist).
      const awardFraction = typeof opts.ordinaryMassFraction === 'number'
        ? opts.ordinaryMassFraction
        : level.progression.ordinaryMassFraction;
      const res = checkSwallow(
        swallowAvatarShim, propObjects, comboShim, ivmEff, reachMultiplier,
        level.target, awardFraction,
      );
      if (res.eaten.length) {
        let exceptionalTopUp = 0;
        for (const obj of res.eaten) {
          if (!obj.golden) continue;
          exceptionalTopUp += obj.mass * ivmEff * GOLDEN_MASS_MULTIPLIER
            * (goldenMassMultiplier - 1);
        }
        const frameAward = capProgressionAward(
          res.massGained * massGainMultiplier + exceptionalTopUp,
          level.target,
        );
        mass += frameAward; // mirrors main.js's per-frame progression cap
        maxSingleAward = Math.max(maxSingleAward, frameAward);
        propsEaten += res.eaten.length;
        for (const obj of res.eaten) {
          hash.remove(obj);
          if (obj.isCapstone) {
            capstoneEaten = true;
          } else if (shieldRemaining > 0) {
            // Landmark shield (L61+): every non-capstone eat cracks it.
            shieldRemaining -= 1;
            if (shieldRemaining === 0) capstone.capstoneGate = level.capstoneGate;
          }
        }
      }

      // Rivals — the REAL AI, hoard-capped like main.js.
      for (const rival of rivals) {
        const events = updateRival(rival, propObjects, avatarShim, dt, {
          archetype: rival.archetype,
          worldSize: level.world,
          levelNumber: level.n,
          itemValueMultiplier: ivmEff,
          spatialHash: hash,
          hoardCap: rival.hoardCap,
        });
        for (const obj of events.ateProps) hash.remove(obj);
        if (events.pinata) {
          const rawCrumbs = events.pinata.crumbs;
          const crumbs = massLedger.admit(rawCrumbs, ivmEff);
          if (crumbs.length !== rawCrumbs.length) {
            const admitted = new Set(crumbs);
            for (let i = propObjects.length - 1; i >= 0; i -= 1) {
              const prop = propObjects[i];
              if (prop.crumb && rawCrumbs.includes(prop) && !admitted.has(prop)) {
                propObjects.splice(i, 1);
              }
            }
          }
          for (const c of crumbs) hash.insert(c);
        }
        if (events.playerAteRival) {
          mass += events.bonus; // ~10% of target
          maxSingleAward = Math.max(maxSingleAward, events.bonus);
        }
      }

      t += dt;
    }

    // Final probes if the timer ended before they fired (tiny levels only).
    if (massAt60s === null) { massAt60s = mass; rivalHoardAt60s = rivals.reduce((s, r) => s + r.mass, 0); }
    if (massAt60Pct === null) massAt60Pct = mass;
    if (capstoneEdibleTime === null && capstoneEdibleNow()) capstoneEdibleTime = t;

    return {
      n: level.n,
      target: level.target,
      time: totalTime,
      world: level.world,
      completed,
      completionTime,
      finalMass: mass,
      massAt60PctTimer: massAt60Pct,
      massAt60s,
      rivalHoardAt60s,
      capstoneRequired,
      capstoneEdibleTime,
      capstoneEaten,
      propsEaten,
      propsEatenAtCompletion,
      awardedMassAtCompletion,
      completionFraction: completionTime === null ? null : completionTime / totalTime,
      budgetConsumptionFraction: awardedMassAtCompletion === null
        ? null
        : awardedMassAtCompletion / level.progression.massBudget,
      maxSingleAward,
      maxSingleAwardFraction: maxSingleAward / level.target,
      availableMass: massLedger.summary(),
      propsRemaining: propObjects.length,
      stuck,
    };
  } finally {
    Math.random = originalRandom;
  }
}

// Standalone: `node scripts/soak-bot.js [n] [n2 ...]` prints run summaries.
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const ns = process.argv.slice(2).map(Number).filter((v) => Number.isInteger(v) && v >= 1 && v <= 100);
  for (const n of ns.length ? ns : [1]) {
    const run = simulateLevel(n, { landmarkRadius: 100 });
    console.log(JSON.stringify(run, null, 2));
  }
}
