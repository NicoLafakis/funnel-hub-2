// Discrete-event feedback effects for the eat→grow loop.
//
// Scope discipline (art-direction §5, "effects fire on events, baseline play
// stays clean"): NOTHING in this module is ambient. Every visual here is
// triggered by a named gameplay event, plays a bounded envelope, and returns
// the scene to silence. The previous vortex build's always-on debris/wake/dust
// stack was removed precisely because stacked continuous motion read as noise;
// this module exists so that lesson stays structural rather than remembered.
//
// It lives beside avatar.js rather than inside it because avatar.js owns the
// hero's PERSISTENT form (the flywheel, its ground-flush stack, movement) and
// this owns TRANSIENT one-shots.
//
// Two owners, deliberately unequal (see PLAYER_RING / RIVAL_RING):
//   - the PLAYER's growth mark is unconditional and loud
//   - a RIVAL's is quieter on three axes at once and must claim a slot from a
//     SHARED createRingBudget, which caps how many can ever be on screen and
//     refuses outright during the window after a player tier-up
// That asymmetry is the design, not a tuning accident: rival growth is useful
// threat information and is also the single largest noise risk on the effects
// menu, so the worst case is made a constant rather than left to chance.
//
// SEAM (recorded forward move, art §5): the highest-value unbuilt effect is a
// tier-up PROP RE-TINT SWEEP — on crossing a tier, props that just became
// edible flash their edibility tint for ~400ms. It belongs on this module's
// onTierUp path, but it drives the per-instance colour buffer in
// instancing.js/propkit.js rather than any geometry here, so it is a
// deliberate non-entry: do not grow this module toward it, call out from
// main.js's tier-up branch instead.
//
// LOCAL UNITS. The returned group is meant to be added to a parent already
// scaled by the hole's world radius (avatar.js's object3D), so local 1.0 IS
// radius(). Every effect is therefore radius-proportional BY CONSTRUCTION —
// the growth ring sweeps out to 2.4× the aperture at r=26 and at r=500 alike,
// and can never be invisible at one size or screen-filling at another. The
// only quantity that must NOT scale is the ground height, which gets the same
// divide-by-radius correction the flywheel pieces use.
//
// No browser-only API is touched at module top level or inside the factory
// (THREE is passed in, never imported), so a bare `import` never throws in
// Node.

import { createPool } from './pools.js';

// Growth shockwave — the tier-up mark. A thin bright annulus that starts just
// outside the aperture and sweeps outward, fading. It begins UNDER the
// flywheel body (see RING_Y) so it reads as a wave running out from beneath
// the hole rather than a decal pasted on top of it.
const RING_INNER = 0.90;      // local; a thin band, not a disc
const RING_OUTER = 1.0;
const RING_SEGMENTS = 48;     // 96 triangles per ring

// The PLAYER's growth mark — the loud one, and the reference point every
// rival mark is deliberately quieter than.
const PLAYER_RING = {
  startScale: 1.10, // just clear of the collar's outer edge (1.06)
  endScale: 2.40,   // outside the wheel body (1.35) with room to read
  seconds: 0.50,
  opacity: 0.55,
  // Reduced-motion variant: no travel at all. The ring holds one radius and
  // fades, so the growth beat is still MARKED (readability) without an
  // expanding sweep (tech-architecture §6).
  staticScale: 1.55,
  poolSize: 3,
};

// A RIVAL's growth mark. Subordinate on THREE independent axes at once, so a
// rival tier-up can never be mistaken for the player's even in peripheral
// vision or on a small screen:
//   1. opacity   0.26 vs 0.55  — roughly half as bright
//   2. reach     1.85 vs 2.40  — a visibly shorter sweep
//   3. duration  0.34 vs 0.50  — over before the player's would be
// Hue is a fourth axis for free: rivals already carry their archetype colour
// (RIVAL_COLORS in main.js), which is not any player skin's `ring` hue.
// Stacking the axes rather than picking one is the point — any single axis
// could collapse on a washed-out screen or for a colour-blind player.
export const RIVAL_RING = {
  startScale: 1.10,
  endScale: 1.85,
  seconds: 0.34,
  opacity: 0.26,
  staticScale: 1.40,
  poolSize: 2,
};

// Ground height in WORLD units. Above the prop blob shadows (0.15,
// instancing.js) and below every flywheel piece (aperture disc 0.30, wheel
// base 0.35, collar base 0.20 — none coplanar), divided by the live radius
// each frame exactly as avatar.js does, so the ring stays ground-flush at any
// hole size.
const RING_Y = 0.24;

// ...but a ground-flush height in WORLD units is not on its own enough to win
// the depth test, because the chase camera stands off at 12·radius and the
// depth buffer's resolving power at the mouth collapses quadratically with
// that distance: 0.24 units of clearance over the ground is ~4 depth quanta
// at r=26 but ~0.01 at r=500 (see the depth-priority note in avatar.js). Left
// unbiased, a big player's growth mark would z-fight the ground it is sweeping
// across. This bias is denominated in quanta, so it holds at every hole size.
// It is deliberately WEAKER than the aperture disc's (-2) and the collar's
// (-6): the ring is supposed to lose to them and emerge from beneath the
// hole, which is the read this effect was designed for. It only has to beat
// the ground.
const RING_DEPTH_BIAS = -1;

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

// ---------------------------------------------------------------------------
// Ring budget — the anti-noise guarantee for RIVAL growth marks
// ---------------------------------------------------------------------------
//
// Rival rings are a readability win (opponent threat state at a glance) and
// also the single highest noise risk on the effects menu: three rivals can
// cross a size tier within the same second, and one of them can do it on the
// exact frame the player does. Rather than hope that never happens, the budget
// makes the worst case a CONSTANT.
//
// Two rules, both hard:
//   1. maxConcurrent — at most N rival rings alive across ALL rivals at once.
//      Claim N+1 and it is simply dropped, not queued: a growth mark is a
//      "right now" signal, and a deferred one would fire against a world state
//      that has moved on.
//   2. playerLockout — for a short window after the PLAYER tiers up, every
//      rival claim is refused. The player's own beat is the one moment that
//      must never be crowded, and it is the moment most likely to coincide
//      with a rival's (both are driven by the same feeding-opportunity spike).
//
// The player's own ring never consults a budget — it is unconditional.
//
// Pure logic, no THREE, no DOM: headless-testable on its own.
export function createRingBudget({ maxConcurrent = 2, playerLockoutSeconds = 0.35 } = {}) {
  let live = 0;
  let lockout = 0;
  let droppedTotal = 0; // diagnostic only

  return {
    // Call when the PLAYER tiers up: starts the lockout window.
    notifyPlayerTierUp() { lockout = playerLockoutSeconds; },
    tryClaim() {
      if (lockout > 0 || live >= maxConcurrent) { droppedTotal += 1; return false; }
      live += 1;
      return true;
    },
    release() { if (live > 0) live -= 1; },
    update(dt) { if (lockout > 0) lockout = Math.max(0, lockout - dt); },
    reset() { live = 0; lockout = 0; },
    get liveCount() { return live; },
    get lockoutRemaining() { return lockout; },
    get droppedTotal() { return droppedTotal; },
  };
}

/**
 * @param {typeof import('three')} THREE
 * @param {{
 *   color?: number,   // the owner's `ring` hue — the mark wears its owner's
 *                     // colour rather than a generic white
 *   profile?: object, // PLAYER_RING (default) or RIVAL_RING
 *   budget?: ReturnType<typeof createRingBudget> | null,
 *                     // rivals pass a SHARED budget; the player passes none
 *                     // and is therefore unconditional
 * }} [opts]
 */
export function createGrowthEffects(THREE, opts = {}) {
  const group = new THREE.Group();
  const profile = opts.profile || PLAYER_RING;
  const budget = opts.budget || null;

  // One shared geometry for every ring; only the materials differ (each needs
  // its own opacity). RingGeometry is built in the XY plane, so the mesh is
  // laid flat once at construction and never rotated again.
  const ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, RING_SEGMENTS);

  const color = typeof opts.color === 'number' ? opts.color : 0x29b6f6;

  // Pooled rings. `visible = false` is the released state — three.js skips
  // invisible objects entirely, so an idle pool costs zero draw calls.
  const ringPool = createPool({
    create() {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false, // a fading overlay must not occlude the ground
        polygonOffset: true,
        polygonOffsetFactor: RING_DEPTH_BIAS,
        polygonOffsetUnits: RING_DEPTH_BIAS,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 1;
      group.add(mesh);
      return { mesh, mat, t: 0 };
    },
    reset(r) {
      r.t = 0;
      r.mesh.visible = false;
      r.mat.opacity = 0;
    },
    initialSize: profile.poolSize,
  });

  // Live rings, iterated per frame. A plain array used as a swap-remove stack:
  // no allocation on push (amortised), none on removal.
  const live = [];
  let reducedMotion = false;

  function setColor(hex) {
    if (typeof hex !== 'number') return;
    // The pool's free-list objects are reachable only through acquire(), so
    // recolour on acquire instead of walking the pool — group.children IS the
    // full set (pooled and live alike), which is the cheap way to reach both.
    for (const child of group.children) child.material.color.set(hex);
  }
  setColor(color);

  // Reduced motion (tech-architecture §6). The ring stays — marking a size
  // threshold is readability, and the brief keeps readability under reduced
  // motion — but it stops travelling.
  function setReducedMotion(v) { reducedMotion = !!v; }

  // THE tier-up event. Fires one shockwave. Safe to call at any rate: the
  // pool grows rather than throwing, and nothing here allocates on the hot
  // path once preallocated.
  //
  // Returns false when a SHARED BUDGET refused the claim (rivals only) — the
  // mark is dropped outright rather than queued, because a growth mark is a
  // "right now" signal and a deferred one would fire against a world that has
  // moved on. The player passes no budget and so always returns true.
  function onTierUp() {
    if (budget && !budget.tryClaim()) return false;
    const r = ringPool.acquire();
    r.t = 0;
    r.mesh.visible = true;
    r.mat.opacity = profile.opacity;
    const s = reducedMotion ? profile.staticScale : profile.startScale;
    r.mesh.scale.set(s, s, 1); // local Z is the ring's normal after the flat lay
    live.push(r);
    return true;
  }

  /**
   * @param {number} dt seconds
   * @param {number} radius the world radius the PARENT group is scaled to this
   *   frame — used only for the ground-height correction, exactly as
   *   avatar.js's flywheel update does.
   */
  function update(dt, radius) {
    if (live.length === 0) return;
    const y = RING_Y / Math.max(1, radius);
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const r = live[i];
      r.t += dt;
      const p = Math.min(1, r.t / profile.seconds);
      if (p >= 1) {
        ringPool.release(r);
        if (budget) budget.release();
        live[i] = live[live.length - 1];
        live.pop();
        continue;
      }
      const e = easeOutCubic(p);
      const s = reducedMotion
        ? profile.staticScale
        : profile.startScale + (profile.endScale - profile.startScale) * e;
      r.mesh.scale.set(s, s, 1);
      r.mesh.position.y = y;
      // Fade with the square of remaining time: the ring is brightest at the
      // instant of the tier-up and its tail is quiet, so a rapid double
      // crossing reads as two beats rather than one smear.
      const k = 1 - p;
      r.mat.opacity = profile.opacity * k * k;
    }
  }

  // Level teardown / owner disposal. Releases the shared budget too, so a
  // teardown mid-ring cannot leak a permanently-claimed slot and silently
  // starve every future rival mark.
  function reset() {
    for (const r of live) {
      ringPool.release(r);
      if (budget) budget.release();
    }
    live.length = 0;
  }

  return {
    group,
    setColor,
    setReducedMotion,
    onTierUp,
    update,
    reset,
    // Test/probe surface — the logic suite asserts the envelope headlessly.
    get activeCount() { return live.length; },
  };
}
