// The player avatar: a swirling dark-matter vortex orb — the existing HubHole
// brand mascot (logo-mark.png / hero-vortex.png), given a 3D body a chase
// camera can frame. No browser-only API is touched at module top level — only
// inside createAvatar(), so a bare `import` of this file never throws in Node.
export function createAvatar(scene, THREE) {
  const object3D = new THREE.Group();

  // Core: dark, emissive-purple sphere — the "hole" body.
  const coreGeo = new THREE.SphereGeometry(1, 32, 24);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x120018,
    emissive: 0x3a0a5c,
    emissiveIntensity: 0.85,
    roughness: 0.35,
    metalness: 0.15,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  object3D.add(core);

  // Rim-light: a slightly larger additive-blended wireframe shell that spins
  // independently of movement — reads as a swirling vortex without a full
  // custom GLSL shader (spec calls that a nice-to-have, not required).
  const rimGeo = new THREE.SphereGeometry(1.08, 16, 12);
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x00a4bd,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  object3D.add(rim);

  object3D.position.set(0, 0, 0);
  scene.add(object3D);

  let _mass = 20;
  let inputDx = 0;
  let inputDz = 0;
  let facingAngle = 0;
  // Move-speed multiplier, set by the integration layer from the "speed"
  // meta-upgrade track (src/meta/upgrades.js applyUpgrades().moveSpeedMultiplier).
  // Defaults to 1 (no-op) so existing callers/tests that never touch this see
  // byte-identical behavior to before this field existed.
  let _speedMultiplier = 1;

  // World units/sec — same magnitude as the old 2D game's hole move speed
  // (`hole.x += mx/l*340*dt`), reused because world sizes (2400-4000, see
  // src/data/formulas.js worldSize()) are unchanged from the old game's pixel
  // world sizes, so the same constant keeps the same relative pacing.
  const BASE_SPEED = 340;

  // EXACT formula ported from the current shipped game (index.html `holeR()`).
  // Relied on elsewhere in the design — do not change its shape.
  function radius() {
    return 26 + Math.sqrt(_mass) * 1.9;
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
      // Mild slowdown as mass grows (genre-typical), capped so it never stalls.
      const growthDrag = 60 / Math.max(60, radius());
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
    // a static hole-in-the-ground.
    const damp = Math.min(1, dt * 6);
    object3D.rotation.y += (facingAngle - object3D.rotation.y) * damp;
    const tiltTarget = Math.min(0.35, (speed / BASE_SPEED) * 0.35);
    core.rotation.x += (tiltTarget - core.rotation.x) * damp;

    // Constant swirl spin on the rim wireframe — the vortex identity, always
    // active regardless of movement.
    rim.rotation.y += dt * 1.1;
    rim.rotation.x += dt * 0.6;
  }

  return {
    object3D,
    get mass() { return _mass; },
    set mass(v) { _mass = Math.max(0, v); },
    get speedMultiplier() { return _speedMultiplier; },
    set speedMultiplier(v) { _speedMultiplier = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1; },
    radius,
    setMoveInput,
    update,
    get position() { return object3D.position; },
  };
}
