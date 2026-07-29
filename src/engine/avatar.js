// The player avatar: a swirling dark-matter vortex orb — the existing Flywheel
// brand mascot (logo-mark.png / hero-vortex.png), given a 3D body a chase
// camera can frame. No browser-only API is touched at module top level — only
// inside createAvatar(), so a bare `import` of this file never throws in Node.
//
// SKINS (src/meta/skins.js). The avatar's LOOK is a swappable recipe; its
// gameplay contract is not. radius(), mass, radiusCap, massDivisor,
// speedMultiplier, setMoveInput, update, position and the growth-drag /
// facing-tilt math are all completely blind to which skin is applied — no code
// path below reads a skin field to compute a number that reaches gameplay. The
// one structural guarantee behind that: CORE_RADIUS is a constant, NOT a skin
// field, so no skin can make the avatar look bigger or smaller than the radius
// it actually swallows with. Tests pin both halves.
import { getSkin } from '../meta/skins.js';

// The core sphere is authored at radius 1 and the whole group is scaled by
// radius() each frame, so the rendered core radius IS the swallow radius. This
// is deliberately not skinnable — see the note above.
const CORE_RADIUS = 1;

/**
 * @param {THREE.Scene|{add:Function}} scene
 * @param {object} THREE - the single injected THREE namespace (see scene.js).
 * @param {object} [options]
 * @param {string|object} [options.skin] - skin id (or skin object) to build
 *   with. Anything unknown/missing resolves to the default skin, which is
 *   byte-identical to the pre-skins avatar: two meshes, two materials, two
 *   geometries, same values.
 */
export function createAvatar(scene, THREE, options = {}) {
  const object3D = new THREE.Group();

  let activeSkin = getSkin(options.skin);

  // Geometry identity keys. A skin swap only rebuilds a sphere when its
  // radius/segment counts actually differ, so equipping a skin that shares the
  // default's tessellation costs zero allocations.
  function sphereKey(radius, w, h) {
    return `${radius}|${w}|${h}`;
  }

  function makeSphere(radius, w, h) {
    return new THREE.SphereGeometry(radius, w, h);
  }

  // Core: the solid vortex body (default skin: dark, emissive-purple).
  let coreGeoKey = sphereKey(CORE_RADIUS, activeSkin.core.widthSegments, activeSkin.core.heightSegments);
  const coreMat = new THREE.MeshStandardMaterial();
  const core = new THREE.Mesh(
    makeSphere(CORE_RADIUS, activeSkin.core.widthSegments, activeSkin.core.heightSegments),
    coreMat
  );
  object3D.add(core);

  // Rim: a slightly larger shell that spins independently of movement — reads
  // as a swirling vortex without a full custom GLSL shader (spec calls that a
  // nice-to-have, not required). Default skin: additive-blended cyan wireframe.
  let rimGeoKey = sphereKey(activeSkin.rim.radius, activeSkin.rim.widthSegments, activeSkin.rim.heightSegments);
  const rimMat = new THREE.MeshBasicMaterial();
  const rim = new THREE.Mesh(
    makeSphere(activeSkin.rim.radius, activeSkin.rim.widthSegments, activeSkin.rim.heightSegments),
    rimMat
  );
  object3D.add(rim);

  // Corona: OPTIONAL third layer some skins declare (Supernova, Golden Surge,
  // Aurora Veil). Allocated lazily on first use and fully disposed when a skin
  // without one is equipped, so skins that don't declare a corona — including
  // the default — keep the original two-mesh allocation profile exactly.
  let corona = null;
  let coronaGeoKey = '';

  // Writes a shell recipe (rim/corona) onto an existing MeshBasicMaterial.
  // Always transparent + depthWrite:false: these are glow layers, not surfaces.
  function writeShellMaterial(mat, shell) {
    mat.color.set(shell.color);
    mat.wireframe = !!shell.wireframe;
    mat.transparent = true;
    mat.opacity = shell.opacity;
    mat.blending = shell.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.depthWrite = false;
    mat.needsUpdate = true;
  }

  function writeCoreMaterial(mat, coreDef) {
    mat.color.set(coreDef.color);
    mat.emissive.set(coreDef.emissive);
    mat.emissiveIntensity = coreDef.emissiveIntensity;
    mat.roughness = coreDef.roughness;
    mat.metalness = coreDef.metalness;
    mat.needsUpdate = true;
  }

  function disposeCorona() {
    if (!corona) return;
    object3D.remove(corona);
    corona.geometry.dispose();
    corona.material.dispose();
    corona = null;
    coronaGeoKey = '';
  }

  /**
   * Applies a skin to the live avatar — at creation and at runtime, without
   * rebuilding the avatar object.
   *
   * Leak discipline:
   *   - materials are MUTATED IN PLACE (never replaced), so the core/rim
   *     material instances live for the whole session;
   *   - a geometry is only replaced when its radius/segment key changes, and
   *     the outgoing geometry is disposed in the same statement;
   *   - the optional corona mesh is disposed (geometry + material) and removed
   *     from the group whenever the incoming skin has none.
   *
   * Bloom: every avatar mesh is reset to layer 0 only. scene.js's
   * markBloomEmissive() only ever ENABLES the bloom layer, so without this
   * reset a swap from a glowing skin to Void would keep glowing forever. The
   * caller re-runs markBloomEmissive(avatar.object3D, THREE) after equipping;
   * an avatar that is never re-marked simply doesn't bloom, which is the safe
   * direction to fail in.
   *
   * @param {string|object} skinOrId
   * @returns {object} the resolved skin definition actually applied.
   */
  function applySkin(skinOrId) {
    const skin = getSkin(skinOrId);
    activeSkin = skin;

    const nextCoreKey = sphereKey(CORE_RADIUS, skin.core.widthSegments, skin.core.heightSegments);
    if (nextCoreKey !== coreGeoKey) {
      core.geometry.dispose();
      core.geometry = makeSphere(CORE_RADIUS, skin.core.widthSegments, skin.core.heightSegments);
      coreGeoKey = nextCoreKey;
    }
    writeCoreMaterial(coreMat, skin.core);

    const nextRimKey = sphereKey(skin.rim.radius, skin.rim.widthSegments, skin.rim.heightSegments);
    if (nextRimKey !== rimGeoKey) {
      rim.geometry.dispose();
      rim.geometry = makeSphere(skin.rim.radius, skin.rim.widthSegments, skin.rim.heightSegments);
      rimGeoKey = nextRimKey;
    }
    writeShellMaterial(rimMat, skin.rim);

    if (skin.corona) {
      const nextCoronaKey = sphereKey(skin.corona.radius, skin.corona.widthSegments, skin.corona.heightSegments);
      if (!corona) {
        corona = new THREE.Mesh(
          makeSphere(skin.corona.radius, skin.corona.widthSegments, skin.corona.heightSegments),
          new THREE.MeshBasicMaterial()
        );
        coronaGeoKey = nextCoronaKey;
        object3D.add(corona);
      } else if (nextCoronaKey !== coronaGeoKey) {
        corona.geometry.dispose();
        corona.geometry = makeSphere(skin.corona.radius, skin.corona.widthSegments, skin.corona.heightSegments);
        coronaGeoKey = nextCoronaKey;
      }
      writeShellMaterial(corona.material, skin.corona);
    } else {
      disposeCorona();
    }

    // Reset any leftover bloom-layer membership from the outgoing skin (see
    // the note above). Layer 0 is three.js's default render layer.
    core.layers.set(0);
    rim.layers.set(0);
    if (corona) corona.layers.set(0);

    return skin;
  }

  applySkin(activeSkin);

  object3D.position.set(0, 0, 0);
  scene.add(object3D);

  let _mass = 20;
  let _radiusCap = Infinity;
  let _massDivisor = 1;
  let inputDx = 0;
  let inputDz = 0;
  let facingAngle = 0;
  // Move-speed multiplier, set by the integration layer from the "speed"
  // meta-upgrade track (src/meta/upgrades.js applyUpgrades().moveSpeedMultiplier).
  // Defaults to 1 (no-op) so existing callers/tests that never touch this see
  // byte-identical behavior to before this field existed.
  let _speedMultiplier = 1;

  // World units/sec — same magnitude as the old 2D game's flywheel move speed
  // (`pos.x += mx/l*340*dt`), reused because world sizes (2400-4000, see
  // src/data/formulas.js worldSize()) are unchanged from the old game's pixel
  // world sizes, so the same constant keeps the same relative pacing.
  const BASE_SPEED = 340;

  // EXACT formula ported from the original 2D game (its player-radius func).
  // Relied on elsewhere in the design — do not change its shape.
  // massDivisor: the 100-level curve scales item VALUES by itemValueMultiplier
  // (n^2), but world size only grows ~2x. If radius grew from scaled mass,
  // the avatar would hit map-covering sizes within seconds on mid/high levels
  // (observed live: a single 3s drive ate 133% of a level-15 target). The
  // integration layer sets massDivisor = itemValueMultiplier(n), normalizing
  // radius growth to level-invariant "base mass" — the original game's
  // pacing at every level. Base-budget math still lets the player eat every
  // landmark (max boundingRadius 74 needs r>=93 => ~1225 base, available
  // ~1427) and tier-6 props with combos. Default 1 = original behavior.
  // NOTE: no skin field appears anywhere in this function, by design.
  function radius() {
    return Math.min(26 + Math.sqrt(_mass / _massDivisor) * 1.9, _radiusCap);
  }

  function setMoveInput(dx, dz) {
    inputDx = dx;
    inputDz = dz;
  }

  function update(dt) {
    const len = Math.hypot(inputDx, inputDz);
    let speed = 0;

    if (len > 0.0001) {
      const nx = inputDx / len;
      const nz = inputDz / len;
      // Mild slowdown as mass grows (genre-typical), dampened so giant avatars
      // retain snappy movement speed (min 0.65 speed floor for speedrunning).
      const growthDrag = Math.max(0.65, Math.sqrt(60 / Math.max(60, radius())));
      speed = BASE_SPEED * _speedMultiplier * Math.min(1, len) * growthDrag;
      object3D.position.x += nx * speed * dt;
      object3D.position.z += nz * speed * dt;
      facingAngle = Math.atan2(nx, nz);
    }

    // Visual scale tracks mass via the exact radius() formula above.
    const r = radius();
    object3D.scale.setScalar(r);

    // Orientation: smoothly face the travel direction (damped like the old
    // game's camera lerp, `Math.min(1, dt*6)`), plus a forward tilt that
    // grows with speed so it reads as a rolling/accelerating mass rather than
    // a static pit-in-the-ground.
    const damp = Math.min(1, dt * 6);
    object3D.rotation.y += (facingAngle - object3D.rotation.y) * damp;
    const tiltTarget = Math.min(0.35, (speed / BASE_SPEED) * 0.35);
    core.rotation.x += (tiltTarget - core.rotation.x) * damp;

    // Constant swirl spin on the rim shell — the vortex identity, always
    // active regardless of movement. Rates come from the equipped skin
    // (the default skin's 1.1 / 0.6 are the original constants).
    rim.rotation.y += dt * activeSkin.rim.spinY;
    rim.rotation.x += dt * activeSkin.rim.spinX;
    if (corona) {
      corona.rotation.y += dt * activeSkin.corona.spinY;
      corona.rotation.x += dt * activeSkin.corona.spinX;
    }
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
    get skinId() { return activeSkin.id; },
    get skin() { return activeSkin; },
    applySkin,
    radius,
    setMoveInput,
    update,
    get position() { return object3D.position; },
  };
}
