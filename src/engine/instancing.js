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
// fresnel — documented fallback), too-big props are desaturated 30%.
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

const FOG_CULL_MARGIN = 1.2;  // props beyond 1.2x fog distance skip updates
const SHADOW_COLOR = 0x000000;
const SHADOW_OPACITY = 0.32;

// Per-instance state for the edibility tint (Uint8 per prop).
const EDIBILITY_UNSET = 0;
const EDIBILITY_EDIBLE = 1;
const EDIBILITY_TOO_BIG = 2;

/**
 * @param {{
 *   scene: THREE.Scene,
 *   propkit: { createInstancedPropField: Function }, // src/content/propkit.js
 *   accent?: string,   // metro accent — geometry vertex-color tint AND the edible glow
 *   goldenTint?: string, // retained for API stability; the golden group's
 *     gold read now comes from propkit's opts.golden instance colors
 * }} opts
 */
export function createInstancedWorld({ scene, propkit, accent = '#9aa3ad', textures = null } = {}) {
  // groups: key `${kind}|${golden ? 1 : 0}` ->
  //   { kind, golden, mesh, slots: [propIndex per slot], baseColors: [Color] }
  const groups = new Map();
  let props = [];
  // propIndex -> {group, slot}; parallel arrays keep update() alloc-free.
  let propGroup = [];
  let propSlot = [];
  let edibilityState = new Uint8Array(0);

  // Blob shadows: one InstancedMesh covering every prop, slot === propIndex.
  let shadowMesh = null;
  const shadowGeo = new THREE.CircleGeometry(1, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: SHADOW_COLOR,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
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
      // Geometry is always baked from the METRO accent (per-part vertex
      // colors); the golden group's jackpot read comes from gold instance
      // colors inside propkit (opts.golden), not a second geometry tint.
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
      group.baseColors.push(base);
    }

    // Blob shadows, one slot per prop.
    if (props.length > 0) {
      shadowMesh = new THREE.InstancedMesh(shadowGeo, shadowMat, props.length);
      shadowMesh.name = 'prop-blob-shadows';
      shadowMesh.renderOrder = -1; // under everything else on the ground
      scene.add(shadowMesh);
    }

    // Write every prop's matrix NOW (level-build-time cost): update() culls
    // out-of-view props and keeps their last matrix, so without an initial
    // full write every culled prop would render at propkit's origin-init
    // matrix — a pile of props stacked on the spawn point.
    for (let i = 0; i < props.length; i += 1) writeInstanceMatrix(i);
    for (const group of groups.values()) {
      group.mesh.instanceMatrix.needsUpdate = true;
      group.matrixDirty = false;
    }
    if (shadowMesh) shadowMesh.instanceMatrix.needsUpdate = true;
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
      tmpPos.y = 0.15; // float just above the ground plane to avoid z-fighting
      tmpQuat.identity();
      const sr = Math.max(0.5, (p.radius || 2) * 0.9);
      tmpScale.set(sr, 1, sr);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      shadowMesh.setMatrixAt(i, tmpMatrix);
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
    const fogFar = scene.fog && typeof scene.fog.far === 'number' ? scene.fog.far : Infinity;
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
    if (shadowMesh) shadowMesh.instanceMatrix.needsUpdate = true;
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
      // Soft blend toward the accent + slight brighten — reads as a glow
      // rim against the dimmed too-big props without flattening the palette.
      tmpColor.lerp(accentColor, 0.30).multiplyScalar(1.10);
    } else {
      tmpColor.multiplyScalar(0.7); // dim 30%
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
    setVisible,
    dispose,
    get drawCalls() { return groups.size + (shadowMesh ? 1 : 0); },
    get groupCount() { return groups.size; },
    get groupKeys() { return [...groups.keys()].sort(); },
    get count() { return props.length; },
  };
}
