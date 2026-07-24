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

import * as formulas from '../data/formulas.js';

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

// V2 economy knobs (game-design.md §3, content-and-meta.md §4). The canonical
// values live in src/data/formulas.js per the V2 module map (lesson B3: never
// hardcode economy literals) — these readers tolerate the V2 formulas module
// not having landed yet by falling back to the wiki-specified values.
function goldenCoinBonus() {
  if (typeof formulas.goldenCoinBonus === 'function') return formulas.goldenCoinBonus();
  if (typeof formulas.GOLDEN_COIN_BONUS === 'number') return formulas.GOLDEN_COIN_BONUS;
  return 10; // content-and-meta.md §4: "goldens also drop +10 coins each"
}

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
 * @returns {{eaten: Array<object>, massGained: number, coinsGained: number}}
 *   `coinsGained` (V2, content-and-meta.md §4) is the golden-pickup coin
 *   payout for this frame (+10 per golden, via src/data/formulas.js when the
 *   V2 economy lands there); callers that don't care can ignore it.
 */
export function checkSwallow(
  avatar,
  propObjects,
  comboTracker,
  itemValueMultiplier,
  reachMultiplier = 1,
  levelTarget = 0,
  ordinaryMassFraction = formulas.ORDINARY_MASS_FRACTION,
) {
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
  const eaten = [];
  const awardReports = [];
  let massGained = 0;
  let coinsGained = 0;

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

    const awardFraction = Number.isFinite(ordinaryMassFraction) && ordinaryMassFraction > 0
      ? ordinaryMassFraction
      : formulas.ORDINARY_MASS_FRACTION;
    const report = formulas.progressionAwardReport(
      obj, itemValueMultiplier, awardFraction, levelTarget,
    );
    let gained = report.amount;
    if (obj.golden) {
      coinsGained += goldenCoinBonus();
    }

    massGained += gained;
    eaten.push(obj);
    awardReports.push(report);
    comboTracker.onEat();
  }

  return { eaten, massGained, coinsGained, awardReports };
}

// ---------------------------------------------------------------------------
// V2 eat-loop texture (game-design.md §3): vacuum snap, wedge wobble,
// near-miss crumbs — plus the §6 mercy-rule tracker. All pure logic; the
// renderer reads per-prop animation state out of the controller and main.js
// wires the event callbacks.
// ---------------------------------------------------------------------------

// Vacuum snap: an edible prop whose center comes within this multiple of the
// avatar's radius gets accelerated into the maw over VACUUM_DURATION seconds,
// leaning in as it goes (game-design.md §3: "within 1.6r ... over ~150ms").
export const VACUUM_RANGE_FACTOR = 1.6;
export const VACUUM_DURATION = 0.15;
// Peak lean-in tilt (radians) at mid-pull, for whoever renders the prop.
export const VACUUM_MAX_LEAN = 0.35;

// Wedge wobble (game-design.md §3): a too-big prop the player pushes against
// rocks in place, and re-arms its "locked" badge at most once per this many
// seconds — readable "not yet" without a HUD word, and never spammy.
export const WEDGE_WOBBLE_DURATION = 0.6;
export const WEDGE_BADGE_COOLDOWN = 3;

// Near-miss crumbs (game-design.md §3): once the player has eaten this
// fraction of a cluster, the remaining edible stragglers are auto-vacuumed
// from wherever they are. Clusters smaller than NEAR_MISS_MIN_CLUSTER props
// don't qualify (two trash cans are not a "cluster").
export const NEAR_MISS_FRACTION = 0.9;
export const NEAR_MISS_MIN_CLUSTER = 4;
// Grid cell edge used to define clusters when no spatial hash cluster helper
// is available. ~the old raid-AI CLUSTER_RADIUS scale: one neighborhood.
export const NEAR_MISS_CELL_SIZE = 200;

// Mercy rules (game-design.md §6): first fail on a level offers one free
// +15s "second wind"; at PITY_FAIL_THRESHOLD fails the attempt gets a pity
// magnet tier and the minimap heatmap unlocks.
export const SECOND_WIND_SECONDS = 15;
export const PITY_FAIL_THRESHOLD = 3;
export const PITY_MAGNET_MULTIPLIER = 1.5;

function gateFractionFor(obj) {
  return obj.isCapstone && typeof obj.capstoneGate === 'number'
    ? obj.capstoneGate
    : DEFAULT_SIZE_GATE;
}

/**
 * Stateful per-level eat-loop controller. Wraps checkSwallow (which stays the
 * single place mass/combo/coins are tallied) and adds the V2 texture around
 * it: vacuum pulls, wedge wobbles, near-miss cluster cleanup.
 *
 * main.js drives it exactly where it used to call checkSwallow:
 *
 *   const swallower = createSwallowController({ spatialHash, onWedgeWobble, onVacuumStart });
 *   // per frame, in place of checkSwallow(...):
 *   const res = swallower.update(dt, avatar, propObjects, comboTracker, ivm, reachMult);
 *
 * @param {{
 *   spatialHash?: { query?: (x:number,z:number,r:number)=>Array<object>,
 *                   clusters?: () => Array<Array<object>|{members:Array<object>}> },
 *   onVacuumStart?: (obj:object) => void,   // e.g. Audio.vacuumWhoosh()
 *   onWedgeWobble?: (obj:object) => void,   // e.g. UI lock badge + Audio.wedgeThunk()
 *   nearMiss?: boolean,                     // default true
 * }} [opts]
 */
export function createSwallowController(opts = {}) {
  const spatialHash = opts.spatialHash || null;
  const onVacuumStart = typeof opts.onVacuumStart === 'function' ? opts.onVacuumStart : null;
  const onWedgeWobble = typeof opts.onWedgeWobble === 'function' ? opts.onWedgeWobble : null;
  const nearMissEnabled = opts.nearMiss !== false;

  // Internal clock (seconds), advanced by update() — deterministic, no Date.
  let clock = 0;

  // prop -> { t, dirX, dirZ, progress } while being vacuumed. Short-lived
  // (≤ VACUUM_DURATION + slack), so entries self-expire even if a prop
  // disappears mid-pull (eaten by a rival); see release() for explicit clears.
  const vacuums = new Map();
  // prop -> { t } while rocking; badgeAt throttles the lock-badge event.
  const wobbles = new Map();
  const badgeAt = new Map();

  // --- Near-miss cluster bookkeeping -------------------------------------
  // Groups are built lazily on the first update() (or explicitly via prime())
  // from the spatial hash's cluster helper when it exists, else from a coarse
  // grid over the prop array. Player-eaten props are counted per group; at
  // ≥ NEAR_MISS_FRACTION the group's edible survivors get force-vacuumed.
  let primed = false;
  let propGroup = new Map();
  let gridGroups = new Map(); // cellKey -> group (grid mode, for late-joining props)
  const eatenSet = new Set();

  function makeGroup(members) {
    const group = { members, eaten: 0, fired: false };
    for (const m of members) propGroup.set(m, group);
    return group;
  }

  function cellKey(x, z) {
    return `${Math.floor(x / NEAR_MISS_CELL_SIZE)},${Math.floor(z / NEAR_MISS_CELL_SIZE)}`;
  }

  function prime(propObjects) {
    primed = true;
    propGroup = new Map();
    gridGroups = new Map();

    let clusters = null;
    if (spatialHash && typeof spatialHash.clusters === 'function') {
      try {
        clusters = spatialHash.clusters();
      } catch (e) {
        clusters = null; // helper contract not finalized — fall through to grid
      }
    }
    if (Array.isArray(clusters) && clusters.length > 0) {
      for (const c of clusters) {
        const members = Array.isArray(c) ? c : (c && Array.isArray(c.members) ? c.members : null);
        if (!members || members.length < NEAR_MISS_MIN_CLUSTER) continue;
        makeGroup(members.slice());
      }
      return;
    }
    for (const obj of propObjects) {
      const key = cellKey(obj.position.x, obj.position.z);
      let group = gridGroups.get(key);
      if (!group) {
        group = makeGroup([]);
        gridGroups.set(key, group);
      }
      group.members.push(obj);
      propGroup.set(obj, group);
    }
  }

  // Registers a prop spawned after level start (storm drops, piñata crumbs)
  // so it can take part in near-miss cleanup too. No-op in hash-cluster mode
  // (the hash owns grouping there) or before priming.
  function registerProp(obj) {
    if (!primed || gridGroups.size === 0 || propGroup.has(obj)) return;
    const key = cellKey(obj.position.x, obj.position.z);
    let group = gridGroups.get(key);
    if (!group) {
      group = makeGroup([]);
      gridGroups.set(key, group);
    }
    group.members.push(obj);
    propGroup.set(obj, group);
  }

  // Drops all animation/tracking state for a prop (e.g. when the renderer
  // disposes a rival-eaten prop). checkSwallow-eaten props are cleared
  // automatically inside update().
  function release(obj) {
    vacuums.delete(obj);
    wobbles.delete(obj);
    badgeAt.delete(obj);
    eatenSet.add(obj);
  }

  function startVacuum(obj, avatar, out) {
    if (vacuums.has(obj)) return;
    const dx = avatar.position.x - obj.position.x;
    const dz = avatar.position.z - obj.position.z;
    const d = Math.hypot(dx, dz) || 1;
    vacuums.set(obj, { t: 0, dirX: dx / d, dirZ: dz / d, progress: 0 });
    out.push(obj);
    if (onVacuumStart) onVacuumStart(obj);
  }

  // Per-frame read of a prop's vacuum animation state, for the renderer:
  // { progress: 0..1, dirX, dirZ (unit pull direction), lean: radians } —
  // lean peaks mid-pull and eases back out (a tilt toward the avatar).
  function getVacuumState(obj) {
    const st = vacuums.get(obj);
    if (!st) return null;
    return {
      progress: st.progress,
      dirX: st.dirX,
      dirZ: st.dirZ,
      lean: Math.sin(st.progress * Math.PI) * VACUUM_MAX_LEAN,
    };
  }

  // Per-frame read of a prop's wobble animation state: { progress, angle } —
  // angle is a damped 1.5-cycle rock in radians.
  function getWobbleState(obj) {
    const st = wobbles.get(obj);
    if (!st) return null;
    const p = Math.min(1, st.t / WEDGE_WOBBLE_DURATION);
    return {
      progress: p,
      angle: Math.sin(p * Math.PI * 3) * (1 - p) * 0.3,
    };
  }

  /**
   * One frame of the eat loop. Same parameter contract as checkSwallow plus
   * dt; returns checkSwallow's result extended with:
   *   vacuumStarted: props that began a vacuum pull this frame
   *   wedgeBadges:   too-big props whose lock badge (re-)fired this frame
   *   nearMissed:    stragglers force-vacuumed by the near-miss rule
   */
  function update(
    dt,
    avatar,
    propObjects,
    comboTracker,
    itemValueMultiplier,
    reachMultiplier = 1,
    levelTarget = 0,
    ordinaryMassFraction = formulas.ORDINARY_MASS_FRACTION,
  ) {
    clock += dt;
    if (nearMissEnabled && !primed) prime(propObjects);

    // 1. Contact eating stays exactly V1 (this also collects vacuumed props
    //    the moment they arrive inside the eat reach).
    const result = checkSwallow(
      avatar, propObjects, comboTracker, itemValueMultiplier, reachMultiplier, levelTarget,
      ordinaryMassFraction,
    );
    for (const obj of result.eaten) {
      vacuums.delete(obj);
      wobbles.delete(obj);
      badgeAt.delete(obj);
      eatenSet.add(obj);
    }

    const r = avatar.radius();
    const safeReachMultiplier = typeof reachMultiplier === 'number' && Number.isFinite(reachMultiplier) && reachMultiplier > 0
      ? reachMultiplier
      : 1;
    const eatReach = r * EAT_REACH_FACTOR * safeReachMultiplier;

    // 2. Advance active pulls: cover the remaining distance in the remaining
    //    time, so the prop accelerates as it closes and lands on schedule.
    for (const [obj, st] of vacuums) {
      st.t += dt;
      if (st.t >= VACUUM_DURATION * 1.5) { // overdue (prop likely gone) — expire
        vacuums.delete(obj);
        continue;
      }
      st.progress = Math.min(1, st.t / VACUUM_DURATION);
      const dx = avatar.position.x - obj.position.x;
      const dz = avatar.position.z - obj.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        const remaining = Math.max(1e-4, VACUUM_DURATION - st.t);
        const step = Math.min(d, (d / remaining) * dt);
        obj.position.x += (dx / d) * step;
        obj.position.z += (dz / d) * step;
        st.dirX = dx / d;
        st.dirZ = dz / d;
      }
    }

    // 3. Scan the avatar's neighborhood (spatial hash when available, else
    //    the V1 full-array scan) for new vacuums and wedge wobbles. The query
    //    radius includes slack for large props' own radii so "pushing against
    //    a building" counts as contact.
    const scanRadius = r * VACUUM_RANGE_FACTOR + 140;
    let candidates;
    if (spatialHash && typeof spatialHash.query === 'function') {
      candidates = spatialHash.query(avatar.position.x, avatar.position.z, scanRadius);
      if (!Array.isArray(candidates)) candidates = propObjects;
    } else {
      candidates = propObjects;
    }

    const vacuumStarted = [];
    const wedgeBadges = [];
    const vacuumRangeSq = (r * VACUUM_RANGE_FACTOR) * (r * VACUUM_RANGE_FACTOR);
    for (const obj of candidates) {
      if (!obj || !obj.position || eatenSet.has(obj)) continue;
      const dx = obj.position.x - avatar.position.x;
      const dz = obj.position.z - avatar.position.z;
      const distSq = dx * dx + dz * dz;
      const gate = gateFractionFor(obj);
      if (obj.radius <= r * gate) {
        // Edible: snap it in (skip hazards — cargo drops are not food).
        if (!obj.hazard && distSq < vacuumRangeSq && distSq >= eatReach * eatReach) {
          startVacuum(obj, avatar, vacuumStarted);
        }
      } else {
        // Too big: rocking + throttled lock badge while the player pushes it.
        const contact = eatReach + obj.radius;
        if (distSq < contact * contact) {
          if (!wobbles.has(obj)) wobbles.set(obj, { t: 0 });
          const last = badgeAt.get(obj);
          if (last === undefined || clock - last >= WEDGE_BADGE_COOLDOWN) {
            badgeAt.set(obj, clock);
            wedgeBadges.push(obj);
            if (onWedgeWobble) onWedgeWobble(obj);
          }
        }
      }
    }

    // 4. Advance wobbles; they decay on their own once the player backs off.
    for (const [obj, st] of wobbles) {
      st.t += dt;
      if (st.t >= WEDGE_WOBBLE_DURATION) wobbles.delete(obj);
    }

    // 5. Near-miss crumbs: groups that crossed the eaten-fraction threshold
    //    this frame vacuum their edible survivors from wherever they sit.
    const nearMissed = [];
    if (nearMissEnabled) {
      for (const obj of result.eaten) {
        const group = propGroup.get(obj);
        if (!group || group.fired) continue;
        group.eaten += 1;
        if (group.members.length < NEAR_MISS_MIN_CLUSTER) continue;
        if (group.eaten / group.members.length < NEAR_MISS_FRACTION) continue;
        group.fired = true;
        for (const member of group.members) {
          if (eatenSet.has(member) || member.hazard) continue;
          if (propObjects.indexOf(member) === -1) continue; // gone (rival/edge case)
          if (member.radius > r * gateFractionFor(member)) continue; // still too big
          startVacuum(member, avatar, nearMissed);
        }
      }
    }

    return {
      eaten: result.eaten,
      massGained: result.massGained,
      coinsGained: result.coinsGained,
      vacuumStarted,
      wedgeBadges,
      nearMissed,
    };
  }

  return {
    update,
    prime: (propObjects) => prime(propObjects),
    registerProp,
    release,
    getVacuumState,
    getWobbleState,
  };
}

/**
 * Mercy-rule state for one level (game-design.md §6). main.js owns the fail
 * flow; this just answers "what is the player owed right now" so the UI can
 * offer the second wind and the next attempt can apply the pity magnet +
 * heatmap. "For that attempt" state (magnet/heatmap) resets via resetFails()
 * when the player moves on; fails accumulate per level until then.
 */
export function createMercyTracker() {
  let fails = 0;
  let secondWindUsed = false;

  return {
    get fails() {
      return fails;
    },
    // First fail on the level → one free +15s offer, usable once.
    get secondWindAvailable() {
      return fails >= 1 && !secondWindUsed;
    },
    // 3+ fails → pity magnet tier + minimap heatmap for the next attempt.
    get pityMagnetActive() {
      return fails >= PITY_FAIL_THRESHOLD;
    },
    get heatmapUnlocked() {
      return fails >= PITY_FAIL_THRESHOLD;
    },
    // Multiplier to fold into the swallow reach (stacked with the magnet
    // upgrade track) on pity attempts; 1 when pity is inactive.
    get magnetMultiplier() {
      return fails >= PITY_FAIL_THRESHOLD ? PITY_MAGNET_MULTIPLIER : 1;
    },
    recordFail() {
      fails += 1;
      return fails;
    },
    // Consumes the offer: returns the seconds to add to the clock (0 if the
    // offer isn't available). Idempotent-safe — a second call returns 0.
    consumeSecondWind() {
      if (fails < 1 || secondWindUsed) return 0;
      secondWindUsed = true;
      return SECOND_WIND_SECONDS;
    },
    // Level beaten or abandoned: fail streak and the used offer reset.
    resetFails() {
      fails = 0;
      secondWindUsed = false;
    },
  };
}
