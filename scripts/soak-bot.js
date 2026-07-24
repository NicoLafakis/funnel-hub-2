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
//   - no upgrades, builds, perks, mercy magnet or second wind (invariant 5)
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
} from '../src/data/formulas.js';
import { checkSwallow, DEFAULT_SIZE_GATE } from '../src/systems/swallow.js';
import { createComboTracker } from '../src/systems/combo.js';
import { createRival, updateRival, RIVAL_WARMUP_SECONDS } from '../src/systems/rivals.js';
import { createSpatialHash } from '../src/engine/spatialhash.js';

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

    const hash = createSpatialHash({ cellSize: 100 });
    for (const p of propObjects) hash.insert(p);

    // Bot state — mirrors avatar.js: radius from base mass, world-relative
    // cap, growth-dragged base speed.
    const pos = { x: 0, y: 0, z: 0 };
    let mass = 0;
    const radiusCap = level.world * 0.2;
    const botRadius = () => Math.min(radiusFromMass(mass / ivm), radiusCap);
    const avatarShim = { position: pos, radius: botRadius };

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
    const hoardCap = reachFraction * (layout.stats.totalBaseMass || 0) * ivm;
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
    let stuck = false;

    // Probes (recorded at the first sim time >= the probe time, so the value
    // is "mass gathered BY then" — never ahead of the clock).
    let massAt60s = null;
    let rivalHoardAt60s = null;
    let massAt60Pct = null;
    let capstoneEdibleTime = null;
    const probe60Pct = 0.6 * level.time;
    const capstoneEdibleNow = () => (
      capstone.capstoneGate > 0 && botRadius() >= capstone.radius / capstone.capstoneGate
    );

    let completed = false;
    let completionTime = null;
    let t = 0;
    while (t < level.time - 1e-9) {
      // --- probes + win check at sim time t (before this step's actions) ---
      if (massAt60s === null && t >= MINUTE_PROBE_SECONDS) {
        massAt60s = mass;
        rivalHoardAt60s = rivals.reduce((sum, r) => sum + r.mass, 0);
      }
      if (massAt60Pct === null && t >= probe60Pct) massAt60Pct = mass;
      if (capstoneEdibleTime === null && capstoneEdibleNow()) capstoneEdibleTime = t;
      // The win is recorded, NOT broken on: invariant 1 asks how much mass is
      // REACHABLE by 60% of the timer, so the bot keeps eating past the
      // finish line to fill the probes (rivals keep competing too).
      if (!completed && mass >= level.target && (!capstoneRequired || capstoneEaten)) {
        completed = true;
        completionTime = t;
      }

      // --- bot turn -------------------------------------------------------
      combo.update(dt);
      const r = botRadius();

      // Target: the capstone the moment it's edible (it's both the best meal
      // and, on gated levels, the finish line); else nearest edible prop.
      let target = null;
      if (!capstoneEaten && capstone.capstoneGate > 0 && capstone.radius <= r * capstone.capstoneGate) {
        target = capstone;
      } else {
        const gate = r * DEFAULT_SIZE_GATE;
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
      const speed = PLAYER_BASE_SPEED * (60 / Math.max(60, r));
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
      const res = checkSwallow(avatarShim, propObjects, comboShim, ivm, 1);
      if (res.eaten.length) {
        mass += res.massGained; // massGainMultiplier 1: no upgrades (inv. 5)
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
          itemValueMultiplier: ivm,
          spatialHash: hash,
          hoardCap: rival.hoardCap,
        });
        for (const obj of events.ateProps) hash.remove(obj);
        if (events.pinata) for (const c of events.pinata.crumbs) hash.insert(c);
        if (events.playerAteRival) mass += events.bonus; // ~10% of target
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
      time: level.time,
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
