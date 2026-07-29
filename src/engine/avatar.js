// The player avatar: a ground-flush FLYWHEEL, not a ball and no longer a
// swirl-shaded funnel. The hero is a solid, genuinely EXTRUDED mechanical
// wheel lying flat on the ground plane — visible side faces, a fixed world
// thickness — with a real circular HOLE bored through its centre;
// that hole IS the eating aperture and its edge sits at exactly the gameplay
// radius. The wheel body extends OUTSIDE the aperture, so it never covers
// anything the player could eat, and it spins steadily about Y — the spin is
// its whole character.
//
// Removed in this pass (visual clutter): the swirl GLSL + paraboloid lathe,
// the debris-stream pool, the ground-wake decal pool, the dust-puff pool,
// and the ±3% rim pulse. Kept: the 2% / 80ms eat pop, which is readability,
// not shake. The V1 sphere's floating tilt/banking stays gone — a hole in
// the ground does not lean.
// `reducedMotion = true` (tech §6, prefers-reduced-motion) stops the
// flywheel's idle spin and freezes the growth ring's travel; movement, the
// eat-pop, and the rim impulse stay (all readability, none of them shake).
//
// EVENT FEEDBACK (added after the clutter purge, deliberately narrow — three
// beats, all discrete, none ambient):
//   onEat()  → 3.5%/110ms ease-out scale pop + a 130ms rim impulse on the
//              hub collar. Zero geometry, zero draw calls, zero allocation.
//   onGrow() → one growth shockwave from effects.js, fired when the player
//              crosses a Size tier. This was the indefensible gap: growth had
//              NO feedback of any kind, and crossing into a new tier of edible
//              object is the core beat of the genre.
// Everything is hero-local. No camera shake, no bloom, nothing over the
// world, nothing that can hide a prop or the aperture edge.
//
// Movement math is EXACTLY V1's (speed 340 u/s, radius 26+sqrt(mass)*1.9,
// growth drag 60/max(60,r)) — the logic suite asserts per-frame displacement
// against it and the difficulty invariants are tuned to it.
//
// No browser-only API is touched at module top level — only inside
// createAvatar(), so a bare `import` of this file never throws in Node.

import { createGrowthEffects } from './effects.js';

// Identity skins (art §2): same 5 ids as V1 (save data references them) and
// the SAME EXPORT SHAPE (save data references the field names too). The
// meaning of two fields moved with the flywheel rebuild:
//   colorA — the near-black aperture disc (the "empty hole")
//   colorB — the flywheel rim body (a dim shade of the rim hue)
//   ring   — the bright unlit hub collar at the aperture edge
//   swirl  — no longer a shader input; repurposed as SPOKE CONTRAST (how
//            dark the spokes read against the rim body)
//   ringOpacity — the hub collar's opacity (no longer pulsed)
export const SKINS = {
  // Default: the Hole.io cyan-blue rim over a blue-black throat.
  void: {
    colorA: 0x04060c, colorB: 0x1b6fa8, ring: 0x29b6f6,
    swirl: 1.0, ringOpacity: 0.95,
  },
  // Purple rim, violet-black throat.
  basalt: {
    colorA: 0x070510, colorB: 0x5a3aa8, ring: 0xa259ff,
    swirl: 0.8, ringOpacity: 0.95,
  },
  // Magenta rim, wine-black throat.
  chrome: {
    colorA: 0x0c0510, colorB: 0x983380, ring: 0xf044c8,
    swirl: 0.7, ringOpacity: 0.95,
  },
  // Orange rim, ember-black throat.
  ember: {
    colorA: 0x0d0703, colorB: 0xa85e18, ring: 0xff9f1c,
    swirl: 1.2, ringOpacity: 0.95,
  },
  // Acid-green rim, toxic-black throat.
  toxic: {
    colorA: 0x041008, colorB: 0x259c58, ring: 0x39ff88,
    swirl: 1.1, ringOpacity: 0.95,
  },
};
export const SKIN_NAMES = Object.keys(SKINS);

// Movement constants — EXACT V1 values, do not retune (see header comment).
const BASE_SPEED = 340;

// Eat pop. 2%/80ms linear was below the perception floor at the chase cam's
// ~12r standoff — the bite landed and nothing on screen said so. 3.5% over
// 110ms with an ease-OUT decay snaps on the frame of the eat and settles,
// which is what makes it read as an impact rather than a wobble. Still a
// scale bump on the hero only: no camera shake, nothing that moves the world.
const EAT_POP_SCALE = 0.035;
const EAT_POP_SECONDS = 0.11;

// Eat rim impulse. The hub collar — already the gameplay-legible aperture
// edge — flashes toward white on every bite and decays over 130ms. This is
// the Hole.io reference's rim response (assets/references/holeio/): the mouth
// itself acknowledges the bite. Colour only, never geometry: the collar's
// radius IS radius(), and moving it would lie about the size gate. Costs no
// triangles, no draw calls, and no allocation. Retriggering mid-flash is
// intentional — a sustained frenzy holds the rim lit, which is the reference's
// behaviour, and the decay means a lone eat still reads as a single beat.
const EAT_FLASH_SECONDS = 0.13;
const EAT_FLASH_STRENGTH = 0.55; // how far toward white at peak

// Flywheel radii, in LOCAL units — the parent group is scaled by the world
// radius r every frame, so local 1.0 IS the gameplay aperture. Everything
// the wheel draws lives OUTSIDE 1.0 except the aperture disc itself, so the
// wheel can never cover a prop the player could eat.
const APERTURE_R = 1.0;        // the eating aperture == radius()
const COLLAR_OUTER_R = 1.06;   // bright unlit hub collar at the aperture edge
const SPOKE_INNER_R = 1.0;     // spokes bridge collar → rim
const SPOKE_OUTER_R = 1.18;
const RIM_INNER_R = 1.18;      // solid annular wheel body
const RIM_OUTER_R = 1.35;
const SPOKE_COUNT = 8;
const SPOKE_HALF_WIDTH = 0.055; // local half-thickness of each radial bar
const WHEEL_SEGMENTS = 48;

// Ground-stack heights AND THICKNESSES, all in WORLD units: ground plane
// y=0, prop blob shadows 0.15 (instancing.js). The wheel is genuinely
// extruded — it has side faces that catch the sun — and its thickness is a
// FIXED WORLD height, not a fraction of the hole. The extruded geometries
// are built one unit tall and get scale.y = thickness/radius per frame, the
// same divide-by-radius discipline as the base heights, so neither the base
// lifts off the ground nor the top inflates as the player consumes.
//
// Thickness choice: 3.0 world units on the body. At the minimum radius
// (mass 0 → r=26) the wheel's world outer radius is 26 × 1.35 = 35.1, so
// 3.0 is ~8.6% of it — chunky enough at the camera's 40° default pitch for
// the outer wall to read as a machined edge rather than a stroke, and small
// enough that it never occludes the aperture from the chase cam. Spokes get
// 60% of that so the rim proud-stands above them, which is what makes it
// read as a wheel rather than a coin.
const HOLE_DISC_Y = 0.30;        // the near-black "empty" aperture floor
const WHEEL_BASE_Y = 0.35;       // underside of body + spokes
const BODY_THICKNESS = 3.0;      // body top lands at 3.35
const SPOKE_THICKNESS = 1.8;     // spoke top at 2.15, recessed below the rim
// The collar is extruded too, and is the BORE WALL of the hole: it runs from
// just under the aperture disc up past the body's top face, so the mouth
// edge is never occluded by the raised rim at grazing angles, and the hole
// reads as bored THROUGH a solid wheel instead of painted on it.
const COLLAR_BASE_Y = 0.20;
const COLLAR_THICKNESS = 3.35;   // collar top at 3.55, 0.2 above the body

// --- Depth priority at the mouth ---------------------------------------
// The aperture is a black disc floating 0.30 world units over an opaque
// ground plane, with the collar's bore wall overlapping its edge. Both of
// those separations are measured in WORLD units, and that is exactly the
// wrong currency: the chase camera stands off at dist = 12·radius, so as the
// hole grows the camera retreats and the depth buffer's resolving power at
// the mouth collapses quadratically. With the engine's near/far of 0.1/20000
// the smallest resolvable depth step at the aperture is 0.058 world units at
// r=26 but 21.5 at r=500 — so a 0.30-unit gap is ~5 quanta when the hole is
// small and ~0.01 quanta once it is big. Past roughly r=70 the ground and the
// disc quantise to the SAME depth value and which one survives is decided by
// per-pixel rounding: the intermittent grey bleeding through the black.
//
// Nudging the heights cannot fix this — at r=500 the disc would have to float
// ~21 units off the ground to win by one quantum, which is a hovering plate,
// not a hole. The fix has to be denominated in depth quanta rather than world
// units, which is precisely what polygonOffset is: the bias below is applied
// in units of the minimum resolvable depth difference AT THE FRAGMENT'S OWN
// DEPTH, so it is radius- and distance-independent by construction.
//
// The result is a strict, monotone depth priority at the mouth:
//     ground plane  <  aperture disc  <  hub collar
// The disc always wins over the ground (no bleed), and the collar always wins
// over the disc (the deliberate edge overlap that hides the mouth seam can
// never serrate through the rim). Values are small on purpose: they only need
// to exceed one quantum, and an oversized bias would start beating geometry
// that legitimately stands in front of the hole.
const DISC_DEPTH_BIAS = -2;   // quanta, toward the camera, vs the ground
const COLLAR_DEPTH_BIAS = -6; // strictly ahead of the disc

// How far the black fill tucks UNDER the collar. The mouth edge — the
// gameplay read — is the collar's inner wall at local 1.0 and is untouched;
// this is only how far the fill continues beneath the solid rim so no
// rasterisation hairline can ever open onto the ground. 1.005 was a knife
// edge that produced a visible T-junction against the bore wall at large
// radii (0.005 local = 2.5 world units of interpenetration at r=500 — the
// "weird clipping"). Tucking to the middle of the collar's 1.0→1.06 band
// puts the whole overlap inside the collar's solid volume instead.
const DISC_TUCK_R = 1.03;

// Idle spin. 0.6 rad/s against 8-fold spoke symmetry repeats every ~1.3s —
// slow enough that the spokes never strobe at 60fps or 30fps.
const SPIN_RATE = 0.6; // rad/s

const TAU = Math.PI * 2;

// Signed shortest angular distance from `from` to `to`, wrapped to (-PI, PI].
// Exported so the logic suite can assert the wrap directly.
export function shortestAngleTo(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

// --- Extruded wheel geometry -------------------------------------------
// Both builders emit a NON-INDEXED BufferGeometry ONE UNIT TALL (y = 0 → 1)
// so the caller can set scale.y = worldThickness / worldRadius each frame and
// get a fixed world thickness out of a uniformly-scaled parent. The walls are
// purely radial (normal.y === 0) and the top faces are purely +Y, so that
// non-uniform y-scale cannot skew a single normal — the lighting is identical
// at every hole size. No bottom faces: the underside sits on an opaque ground
// plane and is never visible, which is a third of the triangles saved.
// Each builder returns ONE geometry so the whole wheel stays at 4 draw calls
// however many spokes or segments it has — this factory instantiates once per
// rival as well as for the player, so the cost multiplies.
function quad(pos, nor, a, b, c, d, na, nb, nc, nd) {
  pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  nor.push(...na, ...nb, ...nc, ...na, ...nc, ...nd);
}

function finishGeometry(THREE, pos, nor) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  return geo;
}

// A solid annular ring: top face + outer wall + inner wall. Wall normals are
// per-vertex radial, so the side faces shade smoothly around the circle and
// catch the sun as a machined edge rather than a faceted band.
function buildRingSolidGeometry(THREE, rInner, rOuter, segments) {
  const pos = [];
  const nor = [];
  const UP = [0, 1, 0];
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    const c0 = Math.cos(a0); const s0 = Math.sin(a0);
    const c1 = Math.cos(a1); const s1 = Math.sin(a1);
    const n0 = [c0, 0, s0];
    const n1 = [c1, 0, s1];
    const n0i = [-c0, 0, -s0];
    const n1i = [-c1, 0, -s1];
    // Top face.
    quad(pos, nor,
      [c0 * rInner, 1, s0 * rInner], [c0 * rOuter, 1, s0 * rOuter],
      [c1 * rOuter, 1, s1 * rOuter], [c1 * rInner, 1, s1 * rInner],
      UP, UP, UP, UP);
    // Outer wall.
    quad(pos, nor,
      [c0 * rOuter, 0, s0 * rOuter], [c1 * rOuter, 0, s1 * rOuter],
      [c1 * rOuter, 1, s1 * rOuter], [c0 * rOuter, 1, s0 * rOuter],
      n0, n1, n1, n0);
    // Inner wall (the bore).
    quad(pos, nor,
      [c0 * rInner, 0, s0 * rInner], [c0 * rInner, 1, s0 * rInner],
      [c1 * rInner, 1, s1 * rInner], [c1 * rInner, 0, s1 * rInner],
      n0i, n0i, n1i, n1i);
  }
  return finishGeometry(THREE, pos, nor);
}

// Radial spoke bars, all `count` of them in one geometry: each is a box with
// a top face, two long side walls and two end caps (no bottom).
function buildSpokeSolidGeometry(THREE, count, rInner, rOuter, halfWidth) {
  const pos = [];
  const nor = [];
  const UP = [0, 1, 0];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = -sa * halfWidth; // in-plane perpendicular → the bar's width
    const pz = ca * halfWidth;
    const side = [-sa, 0, ca];
    const sideNeg = [sa, 0, -ca];
    const outward = [ca, 0, sa];
    const inward = [-ca, 0, -sa];
    const iL = [ca * rInner + px, sa * rInner + pz];
    const iR = [ca * rInner - px, sa * rInner - pz];
    const oR = [ca * rOuter - px, sa * rOuter - pz];
    const oL = [ca * rOuter + px, sa * rOuter + pz];
    const p = (xz, y) => [xz[0], y, xz[1]];
    // Top.
    quad(pos, nor, p(iL, 1), p(oL, 1), p(oR, 1), p(iR, 1), UP, UP, UP, UP);
    // Left long wall.
    quad(pos, nor, p(iL, 0), p(iL, 1), p(oL, 1), p(oL, 0), side, side, side, side);
    // Right long wall.
    quad(pos, nor, p(iR, 0), p(oR, 0), p(oR, 1), p(iR, 1), sideNeg, sideNeg, sideNeg, sideNeg);
    // Outer end cap.
    quad(pos, nor, p(oL, 0), p(oL, 1), p(oR, 1), p(oR, 0), outward, outward, outward, outward);
    // Inner end cap.
    quad(pos, nor, p(iL, 0), p(iR, 0), p(iR, 1), p(iL, 1), inward, inward, inward, inward);
  }
  return finishGeometry(THREE, pos, nor);
}

// The ground-flush FLYWHEEL shared by the player avatar and the rivals
// (main.js builds rivals with this too) — a genuinely EXTRUDED mechanical
// wheel lying flat, not a decal. Four pieces, all procedural, one draw call
// each:
//   1. aperture disc — near-black (colorA), unlit, the "empty" hole floor
//   2. wheel body    — solid ring 1.18→1.35, 3.0 world units thick, colorB,
//                      MeshStandardMaterial so its outer/inner walls catch
//                      the scene's sun and hemisphere fill
//   3. spokes        — 8 extruded radial bars 1.0→1.18 at 60% of the body
//                      thickness (so the rim proud-stands), same lit material
//                      family, darkened by the skin's `swirl`
//   4. hub collar    — the BORE WALL: a solid ring 1.0→1.06 running from
//                      under the aperture disc up past the body's top face,
//                      in the bright `ring` hue, UNLIT MeshBasic. Being the
//                      TALLEST piece is what keeps the mouth edge legible
//                      over the thickened body at grazing camera angles.
// The returned group is meant to live inside a parent scaled to the hole's
// world radius (both the avatar and rivals.js follow that convention), so the
// aperture sits at local radius 1.0 == radius(). update(dt, radius) keeps the
// wheel ground-flush AND fixed-thickness at that scale, and advances the spin.
//
// The spin lives on an INNER group: the outer group's parent damps
// rotation.y toward the steering facing angle (see createAvatar's update),
// and a spin written to that same channel would fight the steering.
export function createHoleVisual(THREE, {
  rim, colorA, colorB, swirl = 1, ringOpacity = 0.95,
}) {
  const group = new THREE.Group();
  const spinner = new THREE.Group();
  group.add(spinner);

  // 1. The hole itself. The ground plane is opaque at y=0, so "empty" is
  // painted: a flat near-black disc just above the ground, unlit so no light
  // ever lifts it off black. It runs out to DISC_TUCK_R, i.e. it continues
  // UNDER the collar's solid band rather than stopping at the bore wall, so
  // there is no hairline and no interpenetrating edge. It carries a depth
  // bias in quanta so the ground can never win against it at any hole size
  // (see the depth-priority note above), and an explicit renderOrder so it is
  // also deterministically drawn after the ground rather than relying on the
  // opaque pass's front-to-back sort.
  const holeGeo = new THREE.CircleGeometry(APERTURE_R * DISC_TUCK_R, WHEEL_SEGMENTS);
  const holeMat = new THREE.MeshBasicMaterial({
    color: colorA,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: DISC_DEPTH_BIAS,
    polygonOffsetUnits: DISC_DEPTH_BIAS,
  });
  const holeDisc = new THREE.Mesh(holeGeo, holeMat);
  holeDisc.rotation.x = -Math.PI / 2;
  holeDisc.renderOrder = 1;
  group.add(holeDisc); // not spun: a flat black disc has no spin to show

  // 2. Wheel body — the thick annulus. Built one unit tall; update() sets
  // scale.y to BODY_THICKNESS/radius so the world thickness never inflates.
  const bodyGeo = buildRingSolidGeometry(THREE, RIM_INNER_R, RIM_OUTER_R, WHEEL_SEGMENTS);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorB, roughness: 0.55, metalness: 0.35,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  spinner.add(body);

  // 3. Spokes. `swirl` (formerly the shader's band contrast) now sets how far
  // the spokes darken away from the body colour — same field, same range,
  // same per-skin character, no change to the SKINS export shape.
  const spokeGeo = buildSpokeSolidGeometry(THREE, SPOKE_COUNT, SPOKE_INNER_R, SPOKE_OUTER_R, SPOKE_HALF_WIDTH);
  const spokeMat = new THREE.MeshStandardMaterial({
    color: colorB, roughness: 0.6, metalness: 0.3,
  });
  const spokes = new THREE.Mesh(spokeGeo, spokeMat);
  spinner.add(spokes);
  function applySpokeShade(baseColor, contrast) {
    const k = Math.max(0.25, Math.min(0.85, 0.30 + 0.25 * contrast));
    spokeMat.color.set(baseColor).multiplyScalar(k);
  }
  applySpokeShade(colorB, swirl);
  let bodyColor = colorB;
  let spokeContrast = swirl;

  // 4. Hub collar / bore wall — the gameplay-legible aperture edge. Unlit, so
  // no lighting mood can wash it out, and the tallest piece in the stack, so
  // the thickened rim cannot occlude it from a low camera. Opaque rather than
  // depth-write-disabled now that it is a solid with real self-occlusion.
  const collarGeo = buildRingSolidGeometry(THREE, APERTURE_R, COLLAR_OUTER_R, WHEEL_SEGMENTS);
  // It sits at the TOP of the mouth's depth priority (see the note above), so
  // the black fill tucked beneath it can never punch through the rim however
  // far the camera has retreated.
  const collarMat = new THREE.MeshBasicMaterial({
    color: rim, transparent: true, opacity: ringOpacity, side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: COLLAR_DEPTH_BIAS,
    polygonOffsetUnits: COLLAR_DEPTH_BIAS,
  });
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.renderOrder = 2;
  group.add(collar); // not spun: a plain ring, and it must not shimmer

  // Eat rim impulse state. `collarBase` is the resting hue and `collarFlash`
  // the scratch colour the per-frame lerp writes into — both preallocated, so
  // the flash costs zero allocation per eat (tech-architecture §1).
  const collarBase = new THREE.Color(rim);
  const collarFlash = new THREE.Color();
  const WHITE = new THREE.Color(0xffffff);
  let baseOpacity = ringOpacity;
  let flashTimer = 0;

  let spinEnabled = true;

  function setColors(colors) {
    if (typeof colors.colorA === 'number') holeMat.color.set(colors.colorA);
    if (typeof colors.colorB === 'number') {
      bodyColor = colors.colorB;
      bodyMat.color.set(bodyColor);
      applySpokeShade(bodyColor, spokeContrast);
    }
    if (typeof colors.swirl === 'number') {
      spokeContrast = colors.swirl;
      applySpokeShade(bodyColor, spokeContrast);
    }
    if (typeof colors.rim === 'number') {
      collarBase.set(colors.rim);
      collarMat.color.copy(collarBase);
    }
    if (typeof colors.ringOpacity === 'number') {
      baseOpacity = colors.ringOpacity;
      collarMat.opacity = baseOpacity;
    }
    // A skin change mid-flash would otherwise leave the collar stuck at the
    // flashed colour once the timer runs out against the NEW base.
    flashTimer = 0;
  }

  // Idle spin on/off (reduced motion, tech §6). Additive to the factory's
  // { group, setColors, update } contract — existing callers ignore it.
  function setSpinEnabled(v) { spinEnabled = !!v; }

  // One bite landed: kick the rim impulse. Retriggering restarts the envelope.
  // Kept on the SHARED factory (not just the avatar) so rivals can use the
  // same acknowledgement later without a second implementation — nothing calls
  // it for them today.
  function flashRim() { flashTimer = EAT_FLASH_SECONDS; }

  // `radius` is the world radius the PARENT group is scaled to this frame.
  // Two corrections, both the same divide-by-radius discipline:
  //   position.y — keeps every piece's UNDERSIDE at its fixed world height,
  //                so the wheel neither lifts off the ground nor sinks
  //   scale.y    — the extruded geometries are one unit tall, so this pins
  //                each piece's world THICKNESS regardless of hole size
  // Together they mean the whole wheel occupies the same fixed world height
  // band (0.20 → 3.55) at r=26 and at r=500 alike.
  function update(dt, radius) {
    if (spinEnabled) {
      spinner.rotation.y = (spinner.rotation.y + SPIN_RATE * dt) % TAU;
    }
    const inv = 1 / Math.max(1, radius);
    holeDisc.position.y = HOLE_DISC_Y * inv;
    body.position.y = WHEEL_BASE_Y * inv;
    body.scale.y = BODY_THICKNESS * inv;
    spokes.position.y = WHEEL_BASE_Y * inv;
    spokes.scale.y = SPOKE_THICKNESS * inv;
    collar.position.y = COLLAR_BASE_Y * inv;
    collar.scale.y = COLLAR_THICKNESS * inv;

    // Rim impulse decay. Quadratic so the peak is on the eat frame and the
    // tail is short; when it expires the collar is written back to exactly its
    // resting values rather than left near them.
    if (flashTimer > 0) {
      flashTimer = Math.max(0, flashTimer - dt);
      const k = flashTimer / EAT_FLASH_SECONDS;
      const kk = k * k;
      collarFlash.copy(collarBase).lerp(WHITE, EAT_FLASH_STRENGTH * kk);
      collarMat.color.copy(collarFlash);
      collarMat.opacity = baseOpacity + (1 - baseOpacity) * kk;
      if (flashTimer === 0) {
        collarMat.color.copy(collarBase);
        collarMat.opacity = baseOpacity;
      }
    }
  }

  return {
    group, setColors, setSpinEnabled, flashRim, update,
  };
}

export function createAvatar(scene, THREE) {
  const object3D = new THREE.Group();

  // The whole visual is the shared flywheel factory (rivals use it too).
  // Nothing is layered on top any more — no debris, no wake, no dust.
  const hole = createHoleVisual(THREE, {
    rim: SKINS.void.ring,
    colorA: SKINS.void.colorA,
    colorB: SKINS.void.colorB,
    swirl: SKINS.void.swirl,
    ringOpacity: SKINS.void.ringOpacity,
  });
  object3D.add(hole.group);

  // Transient event effects (growth shockwave). Added to object3D, which is
  // scaled by radius() every frame, so the effect is radius-proportional
  // without any per-effect scaling maths. Rivals do NOT get one — growth marks
  // belong to the player's own progression beat.
  const growth = createGrowthEffects(THREE, { color: SKINS.void.ring });
  object3D.add(growth.group);

  object3D.position.set(0, 0, 0);
  scene.add(object3D);

  let _mass = 20;
  let _radiusCap = Infinity;
  let _massDivisor = 1;
  let _speedMultiplier = 1;
  let _reducedMotion = false;
  let inputDx = 0;
  let inputDz = 0;
  let facingAngle = 0;
  let popTimer = 0;

  // EXACT formula ported from the original 2D game (its player-radius func).
  // Relied on elsewhere in the design — do not change its shape. See V1's
  // header for the full massDivisor/radiusCap rationale (B6 normalization).
  function radius() {
    return Math.min(26 + Math.sqrt(_mass / _massDivisor) * 1.9, _radiusCap);
  }

  function setMoveInput(dx, dz) {
    inputDx = dx;
    inputDz = dz;
  }

  // Eat feedback entry point, called once per eaten prop by main.js: the scale
  // pop plus the rim impulse. Both are hero-local and bounded; nothing here
  // touches the camera, the world, or anything the player needs to read.
  function onEat() {
    popTimer = EAT_POP_SECONDS;
    hole.flashRim();
  }

  // GROWTH entry point: the player crossed a size tier and can now eat a class
  // of thing they could not eat a second ago. Before this existed the single
  // most important beat in the genre passed completely unmarked — radius()
  // just crept up and the avatar's scale followed it continuously, which the
  // eye cannot see. main.js calls this on each upward crossing of the Size N
  // readout (the tier ladder the HUD pill already displays), so the visual
  // beat and the number the player reads are the same event by construction.
  function onGrow() {
    growth.onTierUp();
  }

  function setSkin(name) {
    const skin = SKINS[name];
    if (!skin) return false;
    hole.setColors({
      rim: skin.ring,
      colorA: skin.colorA,
      colorB: skin.colorB,
      swirl: skin.swirl,
      ringOpacity: skin.ringOpacity,
    });
    // The growth mark wears the player's colour, so it tracks the skin.
    growth.setColor(skin.ring);
    return true;
  }

  function update(dt) {
    // --- Movement (EXACT V1 math) -----------------------------------------
    const len = Math.hypot(inputDx, inputDz);
    let speed = 0;

    if (len > 0.0001) {
      const nx = inputDx / len;
      const nz = inputDz / len;
      // Recovered playtest remediation: growth still adds readable weight, but
      // the square-root curve and 0.65 floor keep late-level holes steerable.
      // This changes movement only; radius/economy formulas remain untouched.
      const growthDrag = Math.max(0.65, Math.sqrt(60 / Math.max(60, radius())));
      speed = BASE_SPEED * _speedMultiplier * Math.min(1, len) * growthDrag;
      object3D.position.x += nx * speed * dt;
      object3D.position.z += nz * speed * dt;
      facingAngle = Math.atan2(nx, nz);
    }

    const r = radius();

    // Eat-pop: scale bump with an ease-OUT decay (art §2) — full amplitude on
    // the eat frame, quick settle. `k*k` rather than `k` is the whole
    // difference between "impact" and "wobble".
    let popScale = 1;
    if (popTimer > 0) {
      popTimer = Math.max(0, popTimer - dt);
      const k = popTimer / EAT_POP_SECONDS;
      popScale = 1 + EAT_POP_SCALE * k * k;
    }
    object3D.scale.setScalar(r * popScale);

    // Orientation: damped facing (V1's `Math.min(1, dt*6)`). No tilt, no
    // banking — a ground-flush hole does not lean into turns.
    //
    // The difference MUST be wrapped to (-PI, PI] first: facingAngle comes
    // from Math.atan2 and so lives in (-PI, PI], while rotation.y accumulates
    // unbounded. Damping toward the raw difference makes the avatar spin the
    // long way round every time atan2 wraps — measured as a +27deg snap
    // against the steer, then a 15 Hz limit cycle
    // (`.wiki/0003-hole-feel-and-visual-fidelity/00-findings.md` §1.3b).
    const damp = Math.min(1, dt * 6);
    object3D.rotation.y += shortestAngleTo(object3D.rotation.y, facingAngle) * damp;

    // The ground-flush heights and the idle spin live in the shared
    // flywheel visual now.
    hole.update(dt, r);
    // Transient effects run on the UNSCALED dt-of-the-frame like everything
    // else here; `r` is passed only for their ground-height correction.
    growth.update(dt, r);
  }

  return {
    object3D,
    get mass() { return _mass; },
    set mass(v) { _mass = Math.max(0, v); },
    get radiusCap() { return _radiusCap; },
    set radiusCap(v) { _radiusCap = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : Infinity; },
    get massDivisor() { return _massDivisor; },
    set massDivisor(v) { _massDivisor = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1; },
    get speedMultiplier() { return _speedMultiplier; },
    set speedMultiplier(v) { _speedMultiplier = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1; },
    get reducedMotion() { return _reducedMotion; },
    // Reduced motion (tech §6): the pools it used to gate are gone, so what
    // it now stops is the flywheel's idle spin — the only ambient motion
    // left. Movement and the eat-pop stay (readability, not shake).
    set reducedMotion(v) {
      _reducedMotion = !!v;
      hole.setSpinEnabled(!_reducedMotion);
      // The growth mark SURVIVES reduced motion — marking a size threshold is
      // readability, not spectacle — but it stops travelling (effects.js).
      growth.setReducedMotion(_reducedMotion);
    },
    radius,
    setMoveInput,
    onEat,
    onGrow,
    setSkin,
    update,
    get position() { return object3D.position; },
  };
}
