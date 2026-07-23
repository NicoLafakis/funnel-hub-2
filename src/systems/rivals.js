// Rival-flywheel AI — ported from the original 2D game's rival block
// (recovered from git history: `git show 97c9024:index.html`, lines
// ~467-471 for spawn/init and ~804-839 for the per-frame AI), adapted from
// (x,y) canvas movement to 3D (x,z) ground-plane movement. Height (y) is
// left untouched at whatever `startPosition.y` was.
//
// PROP OBJECT CONTRACT: identical to src/systems/swallow.js's — each entry
// of `propObjects` exposes `{ position:{x,y,z}, radius, mass, kind? }`.
// `kind` (e.g. 'trash'/'bike'/'car'/... from src/data/levels.js
// LEVEL_TEMPLATE) is optional and only consulted by the raid-AI clustering
// heuristic below; objects without a `kind` still participate normally.
//
// No browser-only API is touched anywhere in this file (THREE is passed in,
// never imported), so a bare `import` of this file never throws in Node.

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
//   - respawn bounds: `x=200+Math.random()*(world-400)` etc. (index.html:807)
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

// Not from the original (the 2D game never had a raid-AI mode — see
// docs/city-3d-redesign-plan.md's Master tier row: "3, raid-AI (actively
// contest stacks, not just wander)"). Radius (world units) used to count how
// "dense" a candidate object's neighborhood is for the cluster heuristic.
const CLUSTER_RADIUS = 150;

/**
 * @param {{x:number,y?:number,z:number}} startPosition
 * @param {typeof import('three')} THREE
 * @returns rival state object: a THREE.Group (`object3D`) plus plain mutable
 *   AI fields (`mass`, `targetX/Z`, `retargetTimer`, `deadTimer`) that
 *   `updateRival` reads and writes directly every frame.
 */
export function createRival(startPosition, THREE) {
  const sx = startPosition && typeof startPosition.x === 'number' ? startPosition.x : 0;
  const sy = startPosition && typeof startPosition.y === 'number' ? startPosition.y : 0;
  const sz = startPosition && typeof startPosition.z === 'number' ? startPosition.z : 0;

  const object3D = new THREE.Group();
  object3D.position.set(sx, sy, sz);

  return {
    object3D,
    get position() { return object3D.position; },
    mass: 0,
    targetX: sx,
    targetZ: sz,
    retargetTimer: 0,
    // Cooldown after being eaten by the player; >0 means dead/respawning,
    // exactly like the original's `v.dead` (index.html:805-808).
    deadTimer: 0,
    radius() {
      return RIVAL_RADIUS_BASE + Math.sqrt(this.mass) * RIVAL_RADIUS_GROWTH;
    },
  };
}

// Default (non-raid) targeting: the single nearest edible object — EXACT
// port of the original's `best/bd` nearest-neighbor scan (index.html:814-816).
function pickNearestTarget(rivalPos, propObjects, sizeGateRadius) {
  let best = null;
  let bestDistSq = Infinity;
  for (const obj of propObjects) {
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

// Raid-AI targeting (opts.raidAI): biases toward the densest nearby cluster
// of same-kind objects instead of just the closest one — a real difficulty
// escalation for the master/capital-siege tiers (per the redesign plan),
// not a cosmetic change. Heuristic: score each edible candidate by how many
// same-kind objects sit within CLUSTER_RADIUS of it, then pick the highest
// score, with straight-line distance to the rival only as a mild tiebreaker
// so it isn't purely global. Deliberately simple, per the task spec.
function pickClusterTarget(rivalPos, propObjects, sizeGateRadius) {
  const edible = propObjects.filter((obj) => obj.radius <= sizeGateRadius);
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

/**
 * Advances one rival for one frame: retarget/chase/eat AI, respawn cooldown,
 * and the player-eats-rival check — mirroring the original's per-rival
 * `rivals.forEach(v=>{...})` body (index.html:804-839).
 *
 * @param {ReturnType<typeof createRival>} rival
 * @param {Array<object>} propObjects - mutated in place: whatever the rival
 *   eats is removed, same contract as swallow.js.
 * @param {{radius: () => number, position: {x:number,y:number,z:number}}} avatar
 * @param {number} dt
 * @param {{
 *   raidAI?: boolean,           // true for master/capital-siege tier levels
 *   worldSize?: number,         // this level's world() size; used for the
 *                                // random-wander fallback + respawn bounds
 *   levelNumber?: number,       // this level's n (1-based); scales the
 *                                // player-eats-rival bonus
 *   itemValueMultiplier?: number, // this level's itemValueMultiplier(n);
 *                                // scales rival mass gain + bonus to match
 *                                // the player's own scaling (see rationale
 *                                // below). Defaults to 1 (no-op).
 * }} [opts]
 * @returns {{ateProps: Array<object>, playerAteRival: boolean, bonus: number, respawned: boolean}}
 */
export function updateRival(rival, propObjects, avatar, dt, opts = {}) {
  const raidAI = !!opts.raidAI;
  const worldSize = typeof opts.worldSize === 'number' ? opts.worldSize : 2400;
  const levelNumber = typeof opts.levelNumber === 'number' ? opts.levelNumber : 1;
  // The original 2D game had no item-value scaling at all (its 10 levels
  // were hand-tuned numbers). This 3D rewrite's player mass gain scales by
  // itemValueMultiplier(n) = n*n (src/data/formulas.js), so without applying
  // the SAME scalar here a rival's raw prop.mass gain — and the flat
  // "150 + level*50" swallow bonus below — would become gameplay-irrelevant
  // by the higher tiers. Defaults to 1 so callers that omit it get the
  // original's literal small-number behavior.
  const itemValueMultiplier = typeof opts.itemValueMultiplier === 'number' ? opts.itemValueMultiplier : 1;

  const events = { ateProps: [], playerAteRival: false, bonus: 0, respawned: false };

  if (rival.deadTimer > 0) {
    rival.deadTimer -= dt;
    if (rival.deadTimer <= 0) {
      rival.deadTimer = 0;
      rival.object3D.position.x = RESPAWN_MARGIN + Math.random() * (worldSize - RESPAWN_MARGIN * 2);
      rival.object3D.position.z = RESPAWN_MARGIN + Math.random() * (worldSize - RESPAWN_MARGIN * 2);
      rival.mass = 0;
      rival.retargetTimer = 0;
      events.respawned = true;
    }
    return events;
  }

  const vr = rival.radius();
  const sizeGateRadius = vr * RIVAL_SIZE_GATE;

  rival.retargetTimer -= dt;
  if (rival.retargetTimer <= 0) {
    rival.retargetTimer = RETARGET_INTERVAL;
    const target = raidAI
      ? pickClusterTarget(rival.object3D.position, propObjects, sizeGateRadius)
      : pickNearestTarget(rival.object3D.position, propObjects, sizeGateRadius);
    if (target) {
      rival.targetX = target.position.x;
      rival.targetZ = target.position.z;
    } else {
      rival.targetX = Math.random() * worldSize;
      rival.targetZ = Math.random() * worldSize;
    }
  }

  const dx = rival.targetX - rival.object3D.position.x;
  const dz = rival.targetZ - rival.object3D.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 4) {
    rival.object3D.position.x += (dx / d) * RIVAL_CHASE_SPEED * dt;
    rival.object3D.position.z += (dz / d) * RIVAL_CHASE_SPEED * dt;
  }

  const rivalReach = vr * RIVAL_EAT_REACH_FACTOR;
  const rivalReachSq = rivalReach * rivalReach;
  for (let i = propObjects.length - 1; i >= 0; i--) {
    const obj = propObjects[i];
    const ox = obj.position.x - rival.object3D.position.x;
    const oz = obj.position.z - rival.object3D.position.z;
    if (ox * ox + oz * oz < rivalReachSq && obj.radius <= sizeGateRadius) {
      propObjects.splice(i, 1);
      rival.mass += obj.mass * itemValueMultiplier;
      events.ateProps.push(obj);
    }
  }

  // Visual scale tracks mass, same convention as the avatar (src/engine/avatar.js).
  rival.object3D.scale.setScalar(vr);

  const playerRadius = avatar.radius();
  const playerReach = playerRadius * PLAYER_EAT_RIVAL_REACH_FACTOR;
  const pdx = rival.object3D.position.x - avatar.position.x;
  const pdz = rival.object3D.position.z - avatar.position.z;
  if (playerRadius >= vr * PLAYER_EAT_RIVAL_SIZE_RATIO && pdx * pdx + pdz * pdz < playerReach * playerReach) {
    rival.deadTimer = RESPAWN_COOLDOWN;
    // Bonus is a fixed share of the level's target. The original 2D game's
    // `bonus=150+S.level*50` (index.html:829) was ~20% of a level's target;
    // naively scaling that shape by itemValueMultiplier(n)=n*n gives
    // (150+50n)*n^2 vs target(n)=1000*n^2 — a ratio of 0.15+0.05n that hits
    // 5.15x the entire level target at n=100 (one rival eat = instant win).
    // 200*itemValueMultiplier keeps the original's 200/1000 = 20%-of-target
    // ratio constant across all 100 levels.
    events.bonus = 200 * itemValueMultiplier;
    events.playerAteRival = true;
  }

  return events;
}
