// InstancedMesh prop world (tech-architecture §1): one InstancedMesh per
// (prop-kind, tint) pair — 7 kinds x {normal, golden} = <=14 prop draw calls
// plus 1 blob-shadow draw call for ~400 props, down from ~400 individual
// meshes. Instance matrices are rewritten per frame from the plain prop
// objects so gameplay systems can express tumble, vacuum pull, and squash
// just by mutating prop.position / prop.rotationY / prop.tiltX / prop.tiltZ
// / prop.scale / prop.scaleY.
//
// Edibility signaling (art §3) runs through instance colors: edible props
// get a tint-shift toward the metro accent (instance colors can't do a true
// fresnel — documented fallback), too-big props are dimmed 30%. Instance
// colors also carry the Hole.io-style per-instance pastel palette picks
// (buildings/vehicles; seeded — see set()), with edibility modulated on top.
//
// Blob shadows (art §5 / tech §1): a single extra InstancedMesh of flat
// dark circles under the props instead of shadow maps.
//
// Culling (tech §1): per frame, instances beyond 1.2x fog distance OR
// outside the camera frustum skip their matrix update (their last matrix
// stays in the buffer — they were invisible when skipped, so a stale
// matrix is never seen).
//
// COORDINATE CONTRACT (B7): world centered on origin (0,0), extents
// ±worldSize/2, ground plane y = 0, prop.position is world-space.
//
// This module is an engine module, so it imports 'three' directly (project
// convention: engine may, systems/content/data/meta may NOT). propkit is
// injected so engine never imports from content/. No DOM access anywhere.
import * as THREE from 'three';
import { mulberry32, hashStr } from '../data/seeds.js';

const FOG_CULL_MARGIN = 1.2;  // props beyond 1.2x fog distance skip updates
// Contact decal value/hue. A shadow is a surface UNDER LESS LIGHT, not a
// surface with black painted on it. Two separate changes, both measured
// against the ground palette in groundtex.js:
//
// OPACITY 0.26 -> 0.18. This is the important one. The sun now casts real
// shadows (scene.js), so at 0.26 the decal was stacking a second, softer
// shadow on top of a real one under every single prop — the double-darkening
// half of §4.1's "grey puddle" complaint. Measured luma drop under a prop on
// Harbor pavement: -0.177 before, -0.099 now. Its remaining job is the
// grazing-angle case where the shadow map is unreliable.
//
// COLOUR 0x000000 -> 0x241d3a. Note what this does and does not do: lerping
// toward black scales all three channels evenly, so it preserves HSV
// saturation exactly (measured +0.000) — it does NOT "desaturate" the ground,
// and any comment claiming so is wrong. What it does drain is absolute CHROMA
// (max-min falls with the scale), which is what makes a dark patch read grey.
// The violet is justified physically instead: shadowed surfaces here are lit
// by the hemisphere fill, which is sky-blue, so shade should shift COOLER, not
// merely darker. Measured chroma effect: +0.013 to +0.017 saturation on the
// cool surfaces (asphalt, pavement — most of the map), -0.021 on the warm
// cream promenade, where violet opposes the base hue. That trade is accepted:
// a warm surface going cool in shade is the correct read.
//
// RE-DERIVED AGAIN (0005 atmosphere pass): OPACITY 0.18 -> 0.12, COLOUR KEPT.
// The 0.18 above was fitted to a light rig that no longer exists — scene.js
// moved ambient 0.55 -> 0.12 and the sun 0.9 -> 1.55, which roughly doubles how
// dark a real cast shadow lands. Leaving 0.18 in place would have re-created
// the exact double-darkening the 0.26 -> 0.18 change existed to remove, which
// is why this is a re-derivation and not a re-tune.
//
// Measured on the live deploy by toggling each contributor and reading back the
// framebuffer: mean luma delta (0..1) over the pixels that actually changed,
// and what fraction of the frame those were. The product of the two is the
// honest "how much light does this remove from the frame" figure, because the
// mean alone moves when a change only shifts how many pixels clear the
// detection threshold:
//
//                     mean delta   frame coverage   light removed
//   cast, old rig       -0.0961        5.47%           0.526
//   cast, new rig       -0.1739        8.34%           1.450   (x2.8)
//   blob @0.18, old     -0.0362        1.18%           0.043
//   blob @0.12, new     -0.0271        0.57%           0.015   (x0.36)
//
// The cast shadow map now removes 2.8x the light it used to, on its own. The
// decal is no longer needed for darkening at all. What it is still needed for
// is the job the comment above names and nothing more: the grazing-angle case
// where the shadow map's texel footprint is unreliable, and the contact edge
// right under a prop where normalBias pushes the cast shadow off the footprint.
// 0.12 is sized to that residual job. Contact darkening overall is still well
// up on the old look, which is the POINT of the key/fill pass — shadows should
// have weight — without the decal stacking a second shadow on a much stronger
// first one.
//
// The violet is kept, and the justification is stronger than before rather than
// merely surviving: shade is lit by ambient plus the hemisphere fill, and the
// rebalance moved that mix hard toward the hemisphere (ambient is now 12% of a
// light rig where it used to be 55%). Shadowed ground is therefore MORE sky-lit
// than it was, so a cool shadow is more correct now, not less.
const SHADOW_COLOR = 0x241d3a;
const SHADOW_OPACITY = 0.12;
// Fraction of a prop's footprint half-diagonal used for its contact decal.
// Below 1/sqrt(2) (~0.707) so the disc sits INSIDE a square footprint rather
// than ringing it. See writeInstanceMatrix for why this matters.
const SHADOW_FOOTPRINT_SCALE = 0.55;

// Edibility signalling (art §3, revised — see setEdibility for the full note).
// Value-only, never hue: a prop's authored colour must survive the tint, or
// the whole district collapses to the metro accent.
const EDIBLE_LIFT = 1.06;
const TOO_BIG_DIM = 0.62;

// Kinds that get Hole.io-style per-instance pastel hue variety (propkit's
// metroPalette). These kinds bake their instanced geometry with a neutral
// white accent (propkit.PALETTE_BASE_KINDS), so the instance color IS the
// body color — no accent-ratio math. Small clutter (trash, bikes) keeps the
// accent-derived vertex colors; golden groups keep propkit's gold.
const FALLBACK_PALETTE_KINDS = new Set([
  'building-small', 'building-medium', 'building-large', 'car', 'bus',
]);

// Per-instance state for the edibility tint (Uint8 per prop).
const EDIBILITY_UNSET = 0;
const EDIBILITY_EDIBLE = 1;
const EDIBILITY_TOO_BIG = 2;

/**
 * @param {{
 *   scene: THREE.Scene,
 *   propkit: { createInstancedPropField: Function }, // src/content/propkit.js
 *   accent?: string,   // metro accent — geometry vertex-color tint AND the edible glow
 *   seed?: number,     // level/layout seed — drives the per-instance pastel
 *     palette picks (buildings/vehicles). Deterministic: same seed ⇒ same
 *     colors; omitted ⇒ palette derived from the accent hash.
 *   goldenTint?: string, // retained for API stability; the golden group's
 *     gold read now comes from propkit's opts.golden instance colors
 * }} opts
 */
export function createInstancedWorld({ scene, propkit, accent = '#9aa3ad', textures = null, seed } = {}) {
  // groups: key `${kind}|${golden ? 1 : 0}` ->
  //   { kind, golden, mesh, slots: [propIndex per slot], baseColors: [Color] }
  const groups = new Map();
  let props = [];
  // propIndex -> {group, slot}; parallel arrays keep update() alloc-free.
  let propGroup = [];
  let propSlot = [];
  let edibilityState = new Uint8Array(0);
  let detailDensity = 1;

  // Blob shadows: one InstancedMesh covering every prop, slot === propIndex.
  let shadowMesh = null;
  // Dirty flag for the blob-shadow instance matrix buffer (0005 §4.3). Mirrors
  // group.matrixDirty on the prop meshes; see update() for what it fixes.
  let shadowMatrixDirty = false;
  const shadowGeo = new THREE.CircleGeometry(1, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: SHADOW_COLOR,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
    // GROUND-STACK DEPTH LADDER, rung 3 of 3 (0004 defect 3c). These decals sit
    // at y=0.15, above the lane paint at 0.08 and the grain plane at 0.05, and
    // a world-unit lead is the wrong currency for depth once the chase camera
    // retreats to 12*radius (see avatar.js DISC_DEPTH_BIAS, and the full ladder
    // at main.js detailMat). -3 keeps them ahead of the paint's -2 and still
    // strictly inside the -2 disc / -6 collar budget the mouth reserves: the
    // mouth disc leads these decals by 0.15 world units geometrically, which is
    // ~15 quanta at the largest radius the game actually reaches, so a
    // one-quantum bias difference cannot overturn it and the blobs can never
    // bleed onto the hole.
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  // Preallocated frame-loop temporaries (zero allocation in update()).
  const tmpMatrix = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler();
  const tmpScale = new THREE.Vector3();
  const tmpSphere = new THREE.Sphere();
  const tmpFrustum = new THREE.Frustum();
  const tmpProjScreen = new THREE.Matrix4();
  const tmpColor = new THREE.Color();
  const tmpTintColor = new THREE.Color();
  const accentColor = new THREE.Color(accent);
  const hiddenScale = new THREE.Vector3(0, 0, 0);

  // Per-metro pastel palette (propkit.metroPalette) + the seeded pick stream
  // that assigns one palette entry per building/vehicle instance in set().
  // Sequential over the prop roster (layout order is seeded and stable, and
  // add() rebuilds append-only), so picks are reproducible across rebuilds.
  const palette = typeof propkit.metroPalette === 'function'
    ? propkit.metroPalette(THREE, accent, seed)
    : null;
  const paletteKinds = propkit.PALETTE_BASE_KINDS instanceof Set
    ? propkit.PALETTE_BASE_KINDS
    : FALLBACK_PALETTE_KINDS;
  const paletteRng = mulberry32((
    (typeof seed === 'number' ? seed >>> 0 : hashStr(String(accent))) ^ 0xC0101A
  ) >>> 0);

  function identityFor(p) {
    const kind = p && typeof p.kind === 'string' ? p.kind : 'trash';
    const requestedVisualId = p && typeof p.visualId === 'string' ? p.visualId : null;
    const descriptor = typeof propkit.resolveVisualDescriptor === 'function'
      ? propkit.resolveVisualDescriptor(requestedVisualId, kind)
      : { id: requestedVisualId || `fallback_${kind.replace(/-/g, '_')}`, gameplayKind: kind };
    const visualId = descriptor.id;
    const materialVariant = p && typeof p.materialVariant === 'string' ? p.materialVariant : 'default';
    const golden = !!(p && p.golden);
    return {
      key: `${visualId}|${materialVariant}|${golden ? 1 : 0}`,
      visualId, materialVariant, golden, kind: descriptor.gameplayKind || kind,
    };
  }

  function disposeGroups() {
    for (const g of groups.values()) {
      scene.remove(g.mesh);
      g.mesh.geometry.dispose();
      g.mesh.material.dispose();
    }
    groups.clear();
    if (shadowMesh) {
      scene.remove(shadowMesh);
      shadowMesh.dispose();
      shadowMesh = null;
    }
  }

  /**
   * (Re)binds the prop set: rebuilds the (kind, tint) groups and the
   * propIndex -> instance-slot mapping. Call at level build time and
   * whenever the prop roster changes wholesale; per-eat removal should use
   * setVisible(i, false), not a full re-set. `list` entries:
   *   { kind, golden?, position:{x,y?,z}, radius, mass?, rotationY? }
   * The array is stored by reference — update() reads live positions from it.
   */
  function set(list) {
    disposeGroups();
    props = Array.isArray(list) ? list : [];
    propGroup = new Array(props.length);
    propSlot = new Array(props.length);
    edibilityState = new Uint8Array(props.length);

    // Count per group, then allocate exact capacities (level-build-time
    // allocation is fine; the frame loop must not allocate).
    const counts = new Map();
    for (let i = 0; i < props.length; i += 1) {
      const identity = identityFor(props[i]);
      const entry = counts.get(identity.key) || { ...identity, count: 0 };
      entry.count += 1;
      counts.set(identity.key, entry);
    }
    for (const [key, entry] of counts) {
      const {
        kind, visualId, materialVariant, golden, count,
      } = entry;
      // Geometry is baked from the METRO accent (per-part vertex colors) —
      // except palette-base kinds (buildings/vehicles), which propkit bakes
      // with a white accent so the seeded per-instance pastel picks below
      // carry the full body hue. The golden group's jackpot read comes from
      // gold instance colors inside propkit (opts.golden), not a geometry tint.
      // Building kinds additionally get their realistic facade texture
      // (textures.js) when the loader provided one for this kind.
      const facadeMap = textures && textures.facades ? textures.facades[kind] : null;
      const mesh = propkit.createInstancedPropField(kind, count, THREE, accent, {
        visualId, materialVariant, golden, map: facadeMap || undefined,
      });
      scene.add(mesh);
      // propkit's instanced geometries are CENTERED on their local origin
      // (its one-time placement matrix bakes the ground lift, but
      // writeInstanceMatrix below composes matrices from scratch) — so each
      // group carries the lift that puts the geometry's bottom on y=0.
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      groups.set(key, {
        kind,
        visualId,
        materialVariant,
        golden,
        mesh,
        yOffset: bb && Number.isFinite(bb.min.y) ? -bb.min.y : 0,
        slots: [],
        baseColors: [],
        nextSlot: 0,
        matrixDirty: false,
        colorDirty: false,
      });
    }
    for (let i = 0; i < props.length; i += 1) {
      const p = props[i];
      const group = groups.get(identityFor(p).key);
      const slot = group.nextSlot;
      group.nextSlot += 1;
      group.slots.push(i);
      propGroup[i] = group;
      propSlot[i] = slot;
      // Snapshot the per-instance jitter color propkit assigned — edibility
      // tints are always computed FROM this base, never compounded.
      const base = new THREE.Color(1, 1, 1);
      if (group.mesh.instanceColor) group.mesh.getColorAt(slot, base);
      // Hole.io-style pastel hue variety (buildings/vehicles, non-golden):
      // these kinds bake with white vertex colors, so the instance color IS
      // the body color — palette pick x propkit's brightness jitter. This
      // base is what setEdibility()/pulseInstance() modulate on top of.
      if (palette && !group.golden && paletteKinds.has(group.kind)) {
        const pick = palette[Math.floor(paletteRng() * palette.length)];
        const j = base.r; // propkit's neutral grey brightness jitter
        base.setRGB(pick.r * j, pick.g * j, pick.b * j);
        group.mesh.setColorAt(slot, base);
      }
      group.baseColors.push(base);
    }

    // Blob shadows, one slot per prop.
    if (props.length > 0) {
      shadowMesh = new THREE.InstancedMesh(shadowGeo, shadowMat, props.length);
      shadowMesh.name = 'prop-blob-shadows';
      shadowMesh.renderOrder = -1; // under everything else on the ground
      scene.add(shadowMesh);
    }
    // Props cast into the sun's shadow map (scene.js). Only the real geometry
    // casts — the blob decals are contact darkening under the footprint and
    // must never cast, or every prop would grow a second floating shadow.
    for (const group of groups.values()) {
      group.mesh.castShadow = true;
      group.mesh.receiveShadow = true;
    }

    // Write every prop's matrix NOW (level-build-time cost): update() culls
    // out-of-view props and keeps their last matrix, so without an initial
    // full write every culled prop would render at propkit's origin-init
    // matrix — a pile of props stacked on the spawn point.
    for (let i = 0; i < props.length; i += 1) writeInstanceMatrix(i);
    for (const group of groups.values()) {
      group.mesh.instanceMatrix.needsUpdate = true;
      if (group.mesh.instanceColor) group.mesh.instanceColor.needsUpdate = true;
      group.matrixDirty = false;
    }
    // The initial full write above went through writeInstanceMatrix(), which
    // raised shadowMatrixDirty; flush it here so the first frame lands and the
    // guard in update() starts from a clean slate.
    if (shadowMesh) shadowMesh.instanceMatrix.needsUpdate = true;
    shadowMatrixDirty = false;
  }

  /**
   * Appends mid-level spawns (piñata crumbs, storm drops, easter-egg props)
   * to the roster. InstancedMesh capacity is fixed at allocation time, so
   * this rebuilds the groups exactly like set() — existing props keep their
   * indices (append-only), and their hidden/edibility state is re-applied
   * after the rebuild. Returns the index of the first appended prop.
   */
  function add(list) {
    const extra = Array.isArray(list) ? list.filter(Boolean) : [];
    if (!extra.length) return props.length;
    const firstIndex = props.length;
    const hidden = [];
    const edibility = edibilityState.slice();
    for (let i = 0; i < props.length; i += 1) {
      if (!propGroup[i]) hidden.push(i);
    }
    set(props.concat(extra));
    for (const i of hidden) setVisible(i, false);
    for (let i = 0; i < edibility.length; i += 1) {
      if (edibility[i] === EDIBILITY_EDIBLE) setEdibility(i, true);
      else if (edibility[i] === EDIBILITY_TOO_BIG) setEdibility(i, false);
    }
    return firstIndex;
  }

  function writeInstanceMatrix(i) {
    const p = props[i];
    const group = propGroup[i];
    const s = typeof p.scale === 'number' ? p.scale : 1;
    const sy = typeof p.scaleY === 'number' ? p.scaleY : s;
    tmpPos.set(p.position.x, (p.position.y || 0) + group.yOffset * sy, p.position.z);
    tmpEuler.set(p.tiltX || 0, p.rotationY || 0, p.tiltZ || 0);
    tmpQuat.setFromEuler(tmpEuler);
    tmpScale.set(s, sy, s);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    group.mesh.setMatrixAt(propSlot[i], tmpMatrix);
    group.matrixDirty = true;

    if (shadowMesh) {
      // Contact darkening only, now that the sun casts real shadows: a tight
      // disc tucked under the footprint so props read as grounded even where
      // the shadow map is at a grazing angle. Sized off `p.footprintRadius` —
      // the RENDERED footprint half-diagonal — not `p.radius`, which is the
      // eat-gate radius and can now sit up to 25% away from it (see
      // propkit.kindRenderScale). A contact shadow must hug the mesh it is
      // grounding, not the gameplay circle. 0.55x sits inside the footprint;
      // the old 0.9x made a puddle ~27% wider than the prop itself.
      tmpPos.y = 0.15; // float just above the ground plane to avoid z-fighting
      tmpQuat.identity();
      const fr = p.footprintRadius || p.radius || 2;
      const sr = Math.max(0.5, fr * SHADOW_FOOTPRINT_SCALE);
      tmpScale.set(sr, 1, sr);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      shadowMesh.setMatrixAt(i, tmpMatrix);
      shadowMatrixDirty = true;
    }
  }

  /**
   * Per-frame: rewrite instance matrices for every visible prop within
   * culling range. Reads live prop fields (position / rotationY / tiltX /
   * tiltZ / scale / scaleY), so tumble, vacuum pull, and squash are just
   * prop mutations by gameplay systems.
   */
  function update(dt, camera) {
    if (!props.length) return;

    const camPos = camera.position;
    // Distance-cull horizon. scene.fog is FogExp2 now (main.js, 0005 atmosphere
    // pass) and has no `.far`, so read both shapes: for exponential-squared fog
    // the equivalent "everything past here is sky" distance is where the fog
    // factor saturates, 1 - exp(-(d*z)^2) > 0.9999 at d*z = 3.
    // Worth knowing before anyone tunes this: on every level the resulting cull
    // distance already exceeds the ground's own diagonal (1.414*world), so this
    // test has never rejected a prop and is not load-bearing. It is kept because
    // a future twist that collapses fog hard would make it bind again.
    const fog = scene.fog;
    let fogFar = Infinity;
    if (fog) {
      if (typeof fog.far === 'number') fogFar = fog.far;
      else if (typeof fog.density === 'number' && fog.density > 0) fogFar = 3 / fog.density;
    }
    const cullDist = fogFar * FOG_CULL_MARGIN;
    const cullDistSq = cullDist * cullDist;

    camera.updateMatrixWorld();
    tmpProjScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    tmpFrustum.setFromProjectionMatrix(tmpProjScreen);

    for (let i = 0; i < props.length; i += 1) {
      const group = propGroup[i];
      if (!group) continue; // hidden via setVisible(false)
      const p = props[i];
      const dx = p.position.x - camPos.x;
      const dz = p.position.z - camPos.z;
      if (dx * dx + dz * dz > cullDistSq) continue; // distance cull (fog * 1.2)
      tmpSphere.center.set(p.position.x, p.position.y || 0, p.position.z);
      tmpSphere.radius = Math.max(2, (p.radius || 2) * 1.6);
      if (!tmpFrustum.intersectsSphere(tmpSphere)) continue; // frustum cull
      writeInstanceMatrix(i);
    }

    for (const group of groups.values()) {
      if (group.matrixDirty) {
        group.mesh.instanceMatrix.needsUpdate = true;
        group.matrixDirty = false;
      }
      if (group.colorDirty && group.mesh.instanceColor) {
        group.mesh.instanceColor.needsUpdate = true;
        group.colorDirty = false;
      }
    }
    // BLOB-SHADOW UPLOAD GUARD (0005 §4.3). This line used to be an
    // unconditional `shadowMesh.instanceMatrix.needsUpdate = true`, two lines
    // below the correctly guarded prop meshes — a single omission, not a
    // pattern. It re-uploaded the whole N*64-byte matrix buffer on every frame
    // whether or not a prop had moved: ~30 KB/frame at level 1's 474 props,
    // scaling with the roster. writeInstanceMatrix() now sets the flag, exactly
    // like it sets group.matrixDirty, and set()/setVisible() set it directly for
    // the paths that write the buffer without going through it.
    if (shadowMesh && shadowMatrixDirty) {
      shadowMesh.instanceMatrix.needsUpdate = true;
      shadowMatrixDirty = false;
    }
  }

  /**
   * Edibility tint (art §3): edible props blend ~30% toward the metro accent
   * with a slight brighten (kept soft so the vertex-color palette — trash vs
   * bikes vs cars vs buildings — survives; a hard tint flattened the whole
   * scene to one hue); too-big props dim 30% (the base instance colors are
   * neutral grey multipliers now that vertex colors carry the real palette,
   * so HSL desaturation would be a no-op — darkening is the equivalent
   * read). Instance colors can't do a true fresnel edge — this is the
   * documented per-instance-color fallback the brief allows. State is tracked
   * per prop so repeated same-value calls are free; pass force=true to
   * re-apply the current state's color (e.g. restoring after a pulseInstance
   * highlight).
   */
  function setEdibility(propIndex, edible, force = false) {
    const next = edible ? EDIBILITY_EDIBLE : EDIBILITY_TOO_BIG;
    if (propIndex < 0 || propIndex >= props.length) return;
    if (!force && edibilityState[propIndex] === next) return;
    edibilityState[propIndex] = next;

    const group = propGroup[propIndex];
    if (!group || !group.mesh.instanceColor) return;
    const slot = propSlot[propIndex];
    tmpColor.copy(group.baseColors[slot]);
    if (edible) {
      // Edible props keep their OWN colour. The previous 30%-toward-accent
      // blend plus a 1.15x brighten turned the whole scene one hue: at spawn
      // nearly everything is edible, the metro accent is a single strong
      // colour (#3fa9f5 for metro 1), and the base colours are near-neutral
      // multipliers, so the blend dominated instead of tinting. Probed
      // instance colours came back IDENTICAL (0.79, 0.91, 1.09 — note the
      // clipped >1 channel) across trees, pedestrians, lamps and bikes.
      //
      // The reference signals edibility with no recolour at all: size against
      // the rim is the cue, backed by the "Too big" popup. We keep a hint of
      // that read with a faint lift only — enough to separate edible from
      // too-big without touching hue.
      tmpColor.multiplyScalar(EDIBLE_LIFT);
    } else {
      tmpColor.multiplyScalar(TOO_BIG_DIM);
    }
    group.mesh.setColorAt(slot, tmpColor);
    group.colorDirty = true;
  }

  /**
   * Per-frame brightness pulse on top of the prop's base color — used for
   * the level-1 "eat the highlighted props" beat (content §5) and for elite
   * goldens (L71+: a warmer, brighter pulse than regular gold). Does NOT
   * touch edibilityState — restore the edibility tint afterwards with
   * setEdibility(i, edible, true). `k` is the pulse phase 0..1; `tintHex`
   * overrides the blend target (default: the metro accent).
   */
  function pulseInstance(propIndex, k, tintHex) {
    if (propIndex < 0 || propIndex >= props.length) return;
    const group = propGroup[propIndex];
    if (!group || !group.mesh.instanceColor) return;
    tmpColor.copy(group.baseColors[propSlot[propIndex]]);
    if (typeof tintHex === 'string' || typeof tintHex === 'number') {
      tmpTintColor.set(tintHex);
      tmpColor.lerp(tmpTintColor, 0.5).multiplyScalar(1.2 + 0.5 * Math.max(0, Math.min(1, k)));
    } else {
      tmpColor.lerp(accentColor, 0.45).multiplyScalar(1.05 + 0.45 * Math.max(0, Math.min(1, k)));
    }
    group.mesh.setColorAt(propSlot[propIndex], tmpColor);
    group.colorDirty = true;
  }

  /**
   * Night variants (L66+, content-and-meta §1): emissive window-glow on the
   * building kinds. Cheap whole-material emissive (no bloom) — at night the
   * facade glow reads as lit windows from chase-camera distance.
   */
  function setBuildingGlow(hex, intensity) {
    for (const group of groups.values()) {
      if (!group.kind.startsWith('building')) continue;
      group.mesh.material.emissive.set(hex);
      group.mesh.material.emissiveIntensity = intensity;
    }
  }

  /**
   * Metro signature tint (art §4, e.g. Coliseum City's travertine): lerps
   * every group's base material color from white toward `hex` by `strength`,
   * warm-shifting all props without re-skinning them.
   */
  function setGlobalTint(hex, strength) {
    tmpTintColor.set(hex);
    for (const group of groups.values()) {
      group.mesh.material.color.set(0xffffff).lerp(tmpTintColor, strength);
    }
  }

  // Quality tiers may remove cheap decorative grounding, but never hide the
  // edible meshes themselves. This saves one instanced draw and its matrix
  // uploads on the low tier without changing gameplay information.
  function setQuality(profile = {}) {
    detailDensity = Number.isFinite(profile.detailDensity) ? profile.detailDensity : 1;
    if (shadowMesh) shadowMesh.visible = detailDensity >= 0.7;
  }

  /**
   * Hide/show a prop (eaten props collapse to zero scale but keep their
   * slot). Hidden props skip matrix updates entirely.
   */
  function setVisible(propIndex, visible) {
    if (propIndex < 0 || propIndex >= props.length) return;
    if (!visible) {
      const group = propGroup[propIndex];
      if (!group) return;
      tmpPos.set(0, 0, 0);
      tmpQuat.identity();
      tmpMatrix.compose(tmpPos, tmpQuat, hiddenScale);
      group.mesh.setMatrixAt(propSlot[propIndex], tmpMatrix);
      group.matrixDirty = true;
      if (shadowMesh) {
        shadowMesh.setMatrixAt(propIndex, tmpMatrix);
        shadowMesh.instanceMatrix.needsUpdate = true;
        shadowMatrixDirty = false; // just flushed
      }
      propGroup[propIndex] = null;
    } else if (!propGroup[propIndex]) {
      const p = props[propIndex];
      propGroup[propIndex] = groups.get(identityFor(p).key) || null;
      if (propGroup[propIndex]) writeInstanceMatrix(propIndex);
    }
  }

  function dispose() {
    disposeGroups();
    props = [];
    propGroup = [];
    propSlot = [];
    shadowGeo.dispose();
    shadowMat.dispose();
  }

  return {
    set,
    add,
    update,
    setEdibility,
    pulseInstance,
    setBuildingGlow,
    setGlobalTint,
    setQuality,
    setVisible,
    dispose,
    get drawCalls() { return groups.size + (shadowMesh ? 1 : 0); },
    get groupCount() { return groups.size; },
    get groupKeys() { return [...groups.keys()].sort(); },
    get count() { return props.length; },
  };
}
