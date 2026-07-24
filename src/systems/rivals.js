// Rival-flywheel AI — V2 "from tax to gameplay" (game-design.md §4). The V1
// port (nearest-prop chase, player-eats-rival, warmup/respawn fixes B5/B6) is
// kept as the Grazer baseline; on top of it sit three named archetypes:
//   - Grazer  (wanders, easy prey) — V1 behavior
//   - Bandit  (raid-AI: targets the player's nearest cluster)
//   - Duelist (hunts the player when bigger, flees when smaller — cat and
//     mouse both ways, with an off-screen approach telegraph for the UI)
// One archetype per level comes from the level def (read defensively by
// main.js); the legacy opts.raidAI flag maps onto 'bandit' so V1 callers keep
// working.
//
// Eating a rival is now a piñata (game-design.md §4): 0.4s slow-mo, a
// shockwave event, and the rival's ENTIRE HOARD scatters as edible crumbs
// BEFORE the flat bonus applies.
//
// Starvation safety (game-design.md §5 invariant 3): opts.hoardCap bounds the
// total mass one rival may consume in a level, so rivals can never make a
// level mathematically unwinnable. main.js derives the cap from the level;
// default Infinity preserves V1 behavior for callers that don't pass it.
//
// PROP OBJECT CONTRACT: identical to src/systems/swallow.js's — each entry
// of `propObjects` exposes `{ position:{x,y,z}, radius, mass, kind? }`.
// Piñata crumbs are pushed INTO `propObjects` (same contract; `crumb: true`,
// `kind: 'rival-crumb'`) so the integration layer can attach meshes and the
// player can eat them through the normal swallow path.
//
// No browser-only API is touched anywhere in this file (THREE is passed in,
// never imported), so a bare `import` of this file never throws in Node.

import * as formulas from '../data/formulas.js';

// EXACT numbers ported from the original rival AI block:
//   - radius growth: `vr = 26 + Math.sqrt(v.mass) * 1.55` (index.html:810) —
//     deliberately a SLOWER growth curve than the avatar's own radius()
//     (26 + sqrt(mass)*1.9, see src/engine/avatar.js) so the player can
//     out-grow a rival over time even at equal mass.
//   - chase speed: `v.x += dx/d*250*dt` (index.html:819)
//   - retarget cadence: `v.retarget = .6` seconds (index.html:813)
//   - rival's own size gate on what IT can eat: `o.r <= vr*0.78`
//     (index.html:815, 822) — same 0.78 fraction as the player's default gate
//   - rival's own proximity/"reach" gate: `(vr*.8)*(vr*.8)`
//     (index.html:822) — NOTE this is 0.8, not the player's 0.82; ported
//     exactly as a distinct constant, not unified.
//   - player-eats-rival size requirement: `r >= v.r*1.25` (index.html:827)
//   - player-eats-rival proximity gate: `(r*0.6)*(r*0.6)` (index.html:827) —
//     based on the PLAYER's radius, not the rival's
//   - respawn cooldown: `v.dead = 8` seconds (index.html:828)
const RIVAL_RADIUS_BASE = 26;
const RIVAL_RADIUS_GROWTH = 1.55;
const RIVAL_CHASE_SPEED = 250;
const RETARGET_INTERVAL = 0.6;
const RIVAL_SIZE_GATE = 0.78;
const RIVAL_EAT_REACH_FACTOR = 0.8;
const PLAYER_EAT_RIVAL_SIZE_RATIO = 1.25;
const PLAYER_EAT_RIVAL_REACH_FACTOR = 0.6;
const RESPAWN_COOLDOWN = 8;
const RESPAWN_MARGIN = 200; // 200 + Math.random()*(world-400)

// Not from the original: a short grace period at level start during which a
// rival wanders but does not eat. The 3D levels concentrate early food in a
// ring near the player's spawn; without a warmup, rivals (250 u/s) beeline
// to the ring, strip it before the player can grow, and camp it at
// un-eatable sizes — the player starves at 0 mass (observed live on levels
// 21+). 6s gives the player the uncontested opening feast the level design
// intends; afterwards rivalry proceeds normally. (B5 fix — keep.)
export const RIVAL_WARMUP_SECONDS = 6;

// Radius (world units) used to count how "dense" a candidate object's
// neighborhood is for the cluster heuristic (Bandit raid-AI).
const CLUSTER_RADIUS = 150;

// How far around itself a rival scans for targets/eats when a spatial hash
// is available (tech-architecture.md §2: proximity queries come from the
// hash, not full-array scans). Without a hash the V1 full scan is kept.
const TARGET_SCAN_RADIUS = 700;

// Bandit: how far around the PLAYER the raid-AI looks for the cluster to
// hit ("targets your nearest cluster", game-design.md §4).
const BANDIT_RAID_RADIUS = 600;

// Duelist: size comparison hysteresis (5%) so equal-size rivals graze
// instead of flickering between hunt and flee; flee engagement radius; and
// the minimum player distance at which an approach telegraph fires (a proxy
// for "off-screen" — the UI gets the direction either way and can refine).
const DUELIST_SIZE_HYSTERESIS = 1.05;
const DUELIST_FLEE_RADIUS = 500;
const DUELIST_TELEGRAPH_MIN_FACTOR = 3; // × player radius

// Piñata (game-design.md §4): slow-mo length, crumb count/size, scatter ring.
export const PINATA_SLOWMO_SECONDS = 0.4;
export const PINATA_CRUMB_COUNT = 12;
export const PINATA_CRUMB_RADIUS = 12;

export const RIVAL_ARCHETYPES = ['grazer', 'bandit', 'duelist'];

// V2 economy (lesson B3: never hardcode economy literals — the canonical
// formula lives in src/data/formulas.js). Fallback below encodes the V2 spec
// until that module lands: game-design.md §5 / the V2 economy contract cap
// the eat bonus at ~10% of the level target. target(n)=1000·n² and
// itemValueMultiplier(n)=n², so 100·ivm ≈ 10% of target at every n. (V1 used
// 200·ivm = 20%; re-derived down per the V2 invariant, NOT rescaled — B3.)
function rivalEatBonus(levelNumber, itemValueMultiplier) {
  if (typeof formulas.rivalEatBonus === 'function') {
    return formulas.rivalEatBonus(levelNumber, itemValueMultiplier);
  }
  return 100 * itemValueMultiplier;
}

/**
 * @param {{x:number,y?:number,z:number}} startPosition
 * @param {typeof import('three')} THREE
 * @param {'grazer'|'bandit'|'duelist'} [archetype='grazer'] - V2 personality
 *   (game-design.md §4). Defaults to the V1 behavior so existing callers are
 *   unaffected; main.js passes the level def's archetype.
 * @returns rival state object: a THREE.Group (`object3D`) plus plain mutable
 *   AI fields (`mass`, `targetX/Z`, `retargetTimer`, `deadTimer`) that
 *   `updateRival` reads and writes directly every frame.
 */
export function createRival(startPosition, THREE, archetype = 'grazer') {
  const sx = startPosition && typeof startPosition.x === 'number' ? startPosition.x : 0;
  const sy = startPosition && typeof startPosition.y === 'number' ? startPosition.y : 0;
  const sz = startPosition && typeof startPosition.z === 'number' ? startPosition.z : 0;

  const object3D = new THREE.Group();
  object3D.position.set(sx, sy, sz);

  return {
    object3D,
    get position() { return object3D.position; },
    archetype: RIVAL_ARCHETYPES.includes(archetype) ? archetype : 'grazer',
    mass: 0,
    targetX: sx,
    targetZ: sz,
    retargetTimer: 0,
    // Grace period (seconds) at level start: wander but don't eat. Set by
    // the integration layer from RIVAL_WARMUP_SECONDS; 0 = fully active.
    warmupTimer: 0,
    // Optional world-relative radius ceiling (see avatar.js radiusCap) —
    // keeps a fed rival from growing to map-covering sizes on high-ivm
    // levels. Default Infinity = original uncapped behavior.
    radiusCap: Infinity,
    // Same itemValueMultiplier normalization as the avatar (see avatar.js
    // radius()): rivals gain scaled mass, so without dividing it back out
    // their radius snowballs on high levels. Default 1 = original behavior.
    massDivisor: 1,
    // Cooldown after being eaten by the player; >0 means dead/respawning,
    // exactly like the original's `v.dead` (index.html:805-808).
    deadTimer: 0,
    // Previous frame's distance to the player, for the Duelist telegraph's
    // closing-in test. null until the first active frame.
    prevPlayerDist: null,
    radius() {
      return Math.min(
        RIVAL_RADIUS_BASE + Math.sqrt(this.mass / this.massDivisor) * RIVAL_RADIUS_GROWTH,
        this.radiusCap,
      );
    },
  };
}

// Proximity query helper: spatial hash when provided (tech-architecture.md
// §2), else the V1 full-array scan. `fallback` is the prop array itself.
function nearbyProps(spatialHash, x, z, radius, fallback) {
  if (spatialHash && typeof spatialHash.query === 'function') {
    const hits = spatialHash.query(x, z, radius);
    if (Array.isArray(hits)) return hits;
  }
  return fallback;
}

// Default (Grazer) targeting: the single nearest edible object — EXACT
// port of the original's `best/bd` nearest-neighbor scan (index.html:814-816),
// run over the hash's candidate set when one is available.
function pickNearestTarget(rivalPos, candidates, sizeGateRadius) {
  let best = null;
  let bestDistSq = Infinity;
  for (const obj of candidates) {
    if (!obj || !obj.position) continue;
    if (obj.radius > sizeGateRadius) continue;
    const dx = obj.position.x - rivalPos.x;
    const dz = obj.position.z - rivalPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = obj;
    }
  }
  return best;
}

// Raid targeting (Bandit): biases toward the densest nearby cluster of
// same-kind objects instead of just the closest one. Heuristic: score each
// edible candidate by how many same-kind objects sit within CLUSTER_RADIUS
// of it, then pick the highest score, with straight-line distance to the
// rival only as a mild tiebreaker so it isn't purely global.
function pickClusterTarget(rivalPos, candidates, sizeGateRadius) {
  const edible = [];
  for (const obj of candidates) {
    if (obj && obj.position && obj.radius <= sizeGateRadius) edible.push(obj);
  }
  if (edible.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const obj of edible) {
    let clusterCount = 0;
    for (const other of edible) {
      if (other === obj) continue;
      if (obj.kind !== undefined && other.kind !== obj.kind) continue;
      const dx = other.position.x - obj.position.x;
      const dz = other.position.z - obj.position.z;
      if (dx * dx + dz * dz <= CLUSTER_RADIUS * CLUSTER_RADIUS) clusterCount++;
    }
    const dx = obj.position.x - rivalPos.x;
    const dz = obj.position.z - rivalPos.z;
    const distSq = dx * dx + dz * dz;
    const score = clusterCount - distSq / (CLUSTER_RADIUS * CLUSTER_RADIUS * 40);
    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  }
  return best;
}

// Bandit retarget: hit the densest edible cluster near the PLAYER (the raid),
// falling back to ordinary grazing when the player's neighborhood is picked
// clean. Candidate sets come from the spatial hash when available.
function pickBanditTarget(rival, propObjects, avatar, sizeGateRadius, spatialHash) {
  const nearPlayer = nearbyProps(spatialHash, avatar.position.x, avatar.position.z, BANDIT_RAID_RADIUS, propObjects)
    .filter((obj) => {
      if (!obj || !obj.position) return false;
      const dx = obj.position.x - avatar.position.x;
      const dz = obj.position.z - avatar.position.z;
      return dx * dx + dz * dz <= BANDIT_RAID_RADIUS * BANDIT_RAID_RADIUS;
    });
  const raid = pickClusterTarget(rival.object3D.position, nearPlayer, sizeGateRadius);
  if (raid) return raid;
  const nearSelf = nearbyProps(spatialHash, rival.object3D.position.x, rival.object3D.position.z, TARGET_SCAN_RADIUS, propObjects);
  return pickNearestTarget(rival.object3D.position, nearSelf, sizeGateRadius);
}

// Duelist retarget (game-design.md §4): bigger than the player → hunt the
// player; smaller → run; roughly equal → graze like nothing happened.
function pickDuelistTarget(rival, propObjects, avatar, vr, playerRadius, worldSize, sizeGateRadius, spatialHash) {
  const pos = rival.object3D.position;
  const dx = pos.x - avatar.position.x;
  const dz = pos.z - avatar.position.z;
  const dist = Math.hypot(dx, dz);

  if (vr >= playerRadius * DUELIST_SIZE_HYSTERESIS) {
    // Hunt: bee-line the player.
    return { x: avatar.position.x, z: avatar.position.z };
  }
  if (playerRadius >= vr * DUELIST_SIZE_HYSTERESIS && dist < DUELIST_FLEE_RADIUS) {
    // Flee: straight away from the player, clamped inside the world.
    const half = worldSize / 2 - 40;
    const ux = dist > 1e-4 ? dx / dist : 1;
    const uz = dist > 1e-4 ? dz / dist : 0;
    return {
      x: Math.max(-half, Math.min(half, pos.x + ux * TARGET_SCAN_RADIUS)),
      z: Math.max(-half, Math.min(half, pos.z + uz * TARGET_SCAN_RADIUS)),
    };
  }
  // Equal-ish, or fled far enough: graze.
  const nearSelf = nearbyProps(spatialHash, pos.x, pos.z, TARGET_SCAN_RADIUS, propObjects);
  const graze = pickNearestTarget(pos, nearSelf, sizeGateRadius);
  return graze ? { x: graze.position.x, z: graze.position.z } : null;
}

// Piñata (game-design.md §4): the eaten rival's ENTIRE HOARD scatters as
// edible crumbs around the eat site, BEFORE the flat bonus applies. Crumbs
// are pushed into `propObjects` so they flow through the normal swallow path
// (vacuum snap included). Crumb base masses are normalized back by
// itemValueMultiplier so the swarm is worth ≈ the hoard when re-eaten.
function scatterHoard(propObjects, x, z, hoardMass, itemValueMultiplier) {
  const crumbs = [];
  const ivm = Math.max(1, itemValueMultiplier);
  // A never-fed rival still pops a few token crumbs so the moment stays juicy.
  const effectiveHoard = hoardMass > 0 ? hoardMass : PINATA_CRUMB_COUNT * 2 * ivm;
  const baseEach = effectiveHoard / PINATA_CRUMB_COUNT / ivm;
  for (let k = 0; k < PINATA_CRUMB_COUNT; k += 1) {
    const ang = (k / PINATA_CRUMB_COUNT) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 50 + Math.random() * 90;
    const crumb = {
      position: { x: x + Math.cos(ang) * dist, y: 0, z: z + Math.sin(ang) * dist },
      radius: PINATA_CRUMB_RADIUS,
      mass: baseEach,
      kind: 'rival-crumb',
      golden: false,
      crumb: true,
    };
    propObjects.push(crumb);
    crumbs.push(crumb);
  }
  return crumbs;
}

/**
 * Advances one rival for one frame: retarget/chase/eat AI (archetype-driven),
 * respawn cooldown, the Duelist telegraph, and the player-eats-rival piñata —
 * mirroring the original's per-rival `rivals.forEach(v=>{...})` body
 * (index.html:804-839) where V1 behavior is kept.
 *
 * @param {ReturnType<typeof createRival>} rival
 * @param {Array<object>} propObjects - mutated in place: whatever the rival
 *   eats is removed, piñata crumbs are added; same contract as swallow.js.
 * @param {{radius: () => number, position: {x:number,y:number,z:number}}} avatar
 * @param {number} dt
 * @param {{
 *   archetype?: 'grazer'|'bandit'|'duelist', // overrides rival.archetype
 *   raidAI?: boolean,           // legacy V1 flag; maps to 'bandit'
 *   worldSize?: number,         // this level's world() size; used for the
 *                                // random-wander fallback + respawn bounds
 *   levelNumber?: number,       // this level's n (1-based); scales the
 *                                // player-eats-rival bonus
 *   itemValueMultiplier?: number, // this level's itemValueMultiplier(n);
 *                                // scales rival mass gain + bonus to match
 *                                // the player's own scaling. Defaults to 1.
 *   spatialHash?: { query?: Function },   // tech-architecture.md §2
 *   hoardCap?: number,          // max scaled mass this rival may consume
 *                                // (game-design.md §5 invariant 3). Default
 *                                // Infinity = V1 behavior.
 *   telegraphMinDist?: number,  // Duelist telegraph floor; default 3× player r
 * }} [opts]
 * @returns {{
 *   ateProps: Array<object>, playerAteRival: boolean, bonus: number, respawned: boolean,
 *   telegraph: null | { dx:number, dz:number, dist:number },  // Duelist approach warning (world-space direction)
 *   pinata: null | { x:number, z:number, hoardMass:number, crumbs:Array<object>, slowMoSeconds:number },
 *   shockwave: null | { x:number, z:number, radius:number },
 * }}
 */
export function updateRival(rival, propObjects, avatar, dt, opts = {}) {
  const worldSize = typeof opts.worldSize === 'number' ? opts.worldSize : 2400;
  const levelNumber = typeof opts.levelNumber === 'number' ? opts.levelNumber : 1;
  // The original 2D game had no item-value scaling at all (its 10 levels
  // were hand-tuned numbers). This 3D rewrite's player mass gain scales by
  // itemValueMultiplier(n) = n*n (src/data/formulas.js), so without applying
  // the SAME scalar here a rival's raw prop.mass gain would become
  // gameplay-irrelevant by the higher tiers. Defaults to 1 so callers that
  // omit it get the original's literal small-number behavior.
  const itemValueMultiplier = typeof opts.itemValueMultiplier === 'number' ? opts.itemValueMultiplier : 1;
  const spatialHash = opts.spatialHash || null;
  const hoardCap = typeof opts.hoardCap === 'number' ? opts.hoardCap : Infinity;
  // Capstone-twist knob (Neon District: "the rivals are faster") — multiplies
  // every movement speed this frame. Default 1 = V1 behavior; the soak bot
  // never passes it, so invariant runs are unaffected.
  const speedMultiplier = typeof opts.speedMultiplier === 'number' && opts.speedMultiplier > 0
    ? opts.speedMultiplier
    : 1;
  // Archetype precedence: per-frame override > legacy raidAI flag > the
  // rival's own archetype (set at creation from the level def) > 'grazer'.
  const archetype = typeof opts.archetype === 'string'
    ? opts.archetype
    : (opts.raidAI ? 'bandit' : (rival.archetype || 'grazer'));

  const events = {
    ateProps: [],
    playerAteRival: false,
    bonus: 0,
    respawned: false,
    telegraph: null,
    pinata: null,
    shockwave: null,
  };

  if (rival.deadTimer > 0) {
    rival.deadTimer -= dt;
    if (rival.deadTimer <= 0) {
      rival.deadTimer = 0;
      // Respawn inside the playable world. The original 2D formula
      // (`200 + Math.random()*(world-400)`) produced 0..world coordinates,
      // correct for its 0..world arena — but this world's playable ground is
      // centered on (0,0) and spans ±world/2, so the literal port dumped
      // respawned rivals into the +/+ quadrant, often off the map entirely.
      const half = worldSize / 2 - RESPAWN_MARGIN;
      rival.object3D.position.x = -half + Math.random() * half * 2;
      rival.object3D.position.z = -half + Math.random() * half * 2;
      rival.mass = 0;
      rival.retargetTimer = 0;
      rival.prevPlayerDist = null;
      events.respawned = true;
    }
    return events;
  }

  // Warmup: wander without eating (the player-eats-rival check is skipped
  // during warmup too, so a rival can't be cheap-shotted while harmless).
  if (rival.warmupTimer > 0) {
    rival.warmupTimer -= dt;
    const wdx = rival.targetX - rival.object3D.position.x;
    const wdz = rival.targetZ - rival.object3D.position.z;
    const wd = Math.hypot(wdx, wdz);
    if (wd < 40) {
      rival.targetX = Math.random() * worldSize - worldSize / 2;
      rival.targetZ = Math.random() * worldSize - worldSize / 2;
    } else {
      rival.object3D.position.x += (wdx / wd) * RIVAL_CHASE_SPEED * speedMultiplier * dt;
      rival.object3D.position.z += (wdz / wd) * RIVAL_CHASE_SPEED * speedMultiplier * dt;
    }
    rival.object3D.scale.setScalar(rival.radius());
    return events;
  }

  const vr = rival.radius();
  const playerRadius = avatar.radius();
  const sizeGateRadius = vr * RIVAL_SIZE_GATE;

  rival.retargetTimer -= dt;
  if (rival.retargetTimer <= 0) {
    rival.retargetTimer = RETARGET_INTERVAL;
    let target = null;
    if (archetype === 'duelist') {
      target = pickDuelistTarget(rival, propObjects, avatar, vr, playerRadius, worldSize, sizeGateRadius, spatialHash);
    } else if (archetype === 'bandit') {
      target = pickBanditTarget(rival, propObjects, avatar, sizeGateRadius, spatialHash);
      if (target) target = { x: target.position.x, z: target.position.z };
    } else {
      const nearSelf = nearbyProps(spatialHash, rival.object3D.position.x, rival.object3D.position.z, TARGET_SCAN_RADIUS, propObjects);
      const graze = pickNearestTarget(rival.object3D.position, nearSelf, sizeGateRadius);
      if (graze) target = { x: graze.position.x, z: graze.position.z };
    }
    if (target) {
      rival.targetX = target.x;
      rival.targetZ = target.z;
    } else {
      rival.targetX = Math.random() * worldSize - worldSize / 2;
      rival.targetZ = Math.random() * worldSize - worldSize / 2;
    }
  }

  const dx = rival.targetX - rival.object3D.position.x;
  const dz = rival.targetZ - rival.object3D.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 4) {
    rival.object3D.position.x += (dx / d) * RIVAL_CHASE_SPEED * speedMultiplier * dt;
    rival.object3D.position.z += (dz / d) * RIVAL_CHASE_SPEED * speedMultiplier * dt;
  }

  // Rival eating — gated by the starvation-safety hoard cap (game-design.md
  // §5 invariant 3): a rival at its cap still moves and hunts but consumes
  // nothing more, so it can never strip a level past winnability.
  if (rival.mass < hoardCap) {
    const rivalReach = vr * RIVAL_EAT_REACH_FACTOR;
    const rivalReachSq = rivalReach * rivalReach;
    const eatCandidates = spatialHash && typeof spatialHash.query === 'function'
      ? nearbyProps(spatialHash, rival.object3D.position.x, rival.object3D.position.z, rivalReach + 100, propObjects)
      : propObjects;
    // Walk a snapshot; hash candidates may be a copy, and splice-removal is
    // done by index on the source array either way.
    for (let k = eatCandidates.length - 1; k >= 0; k--) {
      const obj = eatCandidates[k];
      if (!obj || !obj.position) continue;
      const idx = propObjects.indexOf(obj);
      if (idx === -1) continue; // already gone this frame
      const ox = obj.position.x - rival.object3D.position.x;
      const oz = obj.position.z - rival.object3D.position.z;
      if (ox * ox + oz * oz < rivalReachSq && obj.radius <= sizeGateRadius) {
        propObjects.splice(idx, 1);
        rival.mass = Math.min(hoardCap, rival.mass + obj.mass * itemValueMultiplier);
        events.ateProps.push(obj);
        if (rival.mass >= hoardCap) break; // cap reached mid-bite
      }
    }
  }

  // Visual scale tracks mass, same convention as the avatar (src/engine/avatar.js).
  rival.object3D.scale.setScalar(vr);

  // Duelist telegraph (game-design.md §4): a BIGGER duelist that is closing
  // in from far away warns the UI (edge indicator) with a world-space
  // direction. "Off-screen" is approximated by distance; the UI knows the
  // camera and can refine.
  const pdx = rival.object3D.position.x - avatar.position.x;
  const pdz = rival.object3D.position.z - avatar.position.z;
  const playerDist = Math.hypot(pdx, pdz);
  if (archetype === 'duelist' && vr >= playerRadius * DUELIST_SIZE_HYSTERESIS) {
    const minDist = typeof opts.telegraphMinDist === 'number'
      ? opts.telegraphMinDist
      : playerRadius * DUELIST_TELEGRAPH_MIN_FACTOR;
    const closing = rival.prevPlayerDist === null || playerDist < rival.prevPlayerDist - 0.5;
    if (playerDist > minDist && closing) {
      events.telegraph = { dx: pdx, dz: pdz, dist: playerDist };
    }
  }
  rival.prevPlayerDist = playerDist;

  if (playerRadius >= vr * PLAYER_EAT_RIVAL_SIZE_RATIO && playerDist * playerDist < (playerRadius * PLAYER_EAT_RIVAL_REACH_FACTOR) * (playerRadius * PLAYER_EAT_RIVAL_REACH_FACTOR)) {
    rival.deadTimer = RESPAWN_COOLDOWN;
    // Piñata: the entire hoard scatters as crumbs BEFORE the bonus applies.
    const hoardMass = rival.mass;
    rival.mass = 0;
    const crumbs = scatterHoard(propObjects, rival.object3D.position.x, rival.object3D.position.z, hoardMass, itemValueMultiplier);
    events.pinata = {
      x: rival.object3D.position.x,
      z: rival.object3D.position.z,
      hoardMass,
      crumbs,
      slowMoSeconds: PINATA_SLOWMO_SECONDS,
    };
    events.shockwave = { x: rival.object3D.position.x, z: rival.object3D.position.z, radius: vr * 2 };
    // Bonus: V2 economy, ~10% of level target (was 200·ivm = 20% in V1 —
    // re-derived per game-design.md §5 and the B3 lesson, via
    // src/data/formulas.js once the V2 formulas module lands).
    events.bonus = rivalEatBonus(levelNumber, itemValueMultiplier);
    events.playerAteRival = true;
  }

  return events;
}
