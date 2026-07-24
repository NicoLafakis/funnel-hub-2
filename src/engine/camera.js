// 3rd-person chase camera (game-design §2): higher default pitch (~40°),
// FOV 70, the avatar framed in the lower third, manual orbit with
// auto-recenter, size-adaptive lag, and a subtle look-ahead bias toward the
// nearest edible cluster.
//
// COORDINATE CONTRACT (lesson B7): the world is a square centered on the
// origin (0, 0) with extents ±worldSize/2; units are world units; the ground
// plane is y = 0 with +Y up. Yaw convention matches avatar.js: a yaw of
// avatar.object3D.rotation.y means "facing (sin(yaw), 0, cos(yaw))" — the
// camera sits BEHIND that direction by default, and `yaw` (exported for the
// input layer's camera-relative rotation) is the camera's view direction.
//
// Lesson B2: every distance/height below is derived from the framed object's
// radius (avatar.radius()), never from absolute constants — V1 shipped a
// camera inside the avatar because its offsets were ~12u against a ~35u
// ball.
//
// No browser-only API is touched at module top level — only inside
// createChaseCamera(), so a bare `import` of this file never throws in Node.

const DEG = Math.PI / 180;

// Framing (§2): pitch ~40° default puts the avatar in the lower third with
// most of the frame on the floor ahead — "the food is the game."
const PITCH_DEFAULT = 40 * DEG;
const PITCH_MIN = 15 * DEG;
const PITCH_MAX = 55 * DEG;
const FOV_DEFAULT = 70;

// Eye distance as a multiple of avatar radius (B2: radius-derived). At 40°
// pitch this yields ~3.1r horizontal standoff / ~2.6r height — close to the
// post-live-fix V1 proportions (2.6r/1.5r at ~30°) but pitched higher.
const DIST_RADIUS_MULT = 4.0;

// Orbit limits (game-design §1/§2): yaw ±120° from behind-avatar, pitch
// clamped to 15°–55° absolute. Q/E steps are 45°.
const ORBIT_YAW_MAX = 120 * DEG;
const ORBIT_STEP = 45 * DEG;
const RECENTER_DELAY = 2;   // seconds of movement w/o orbit input
const RECENTER_RATE = 2.5;  // damp rate while recentering

// Size-adaptive lag (§2): follow rate GROWS with radius so big avatars don't
// steer like a blimp (i.e. damping/lag decreases as r grows).
const FOLLOW_RATE_BASE = 6;
const FOLLOW_RATE_RADIUS_GAIN = 1 / 60; // +1/s of follow rate per 60u radius
const FOLLOW_RATE_MAX_BONUS = 8;

// Edge look-ahead (§2): bias the look target 15% toward the dominant nearby
// edible cluster. Smoothed separately and distance-capped so it never yanks.
const LOOKAHEAD_BIAS = 0.15;
const LOOKAHEAD_SMOOTH_RATE = 2.5;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {ReturnType<typeof import('./avatar.js').createAvatar>} avatar
 * @param {typeof import('three')} THREE
 * @param {{
 *   fov?: number,
 *   lookaheadProvider?: (x: number, z: number) => ({x: number, z: number} | null),
 * }} [opts]
 *   lookaheadProvider is fed the avatar's world position each frame and
 *   returns the world-space centroid of the dominant nearby edible cluster
 *   (e.g. spatialhash.queryClusters(...)[0]) or null. Default: no-op.
 */
export function createChaseCamera(camera, avatar, THREE, opts = {}) {
  const lookaheadProvider = typeof opts.lookaheadProvider === 'function'
    ? opts.lookaheadProvider
    : null;

  camera.fov = typeof opts.fov === 'number' ? opts.fov : FOV_DEFAULT;
  camera.updateProjectionMatrix();

  // Preallocated temporaries — zero allocation in the frame loop
  // (tech-architecture §1 called out V1's per-frame vector churn here).
  const desiredPos = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  const lookTarget = new THREE.Vector3(avatar.position.x, avatar.position.y, avatar.position.z);
  const lookaheadSmoothed = new THREE.Vector3(avatar.position.x, 0, avatar.position.z);
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  let obstacles = [];

  let orbitYaw = 0;
  let orbitPitchOffset = 0; // relative to PITCH_DEFAULT
  let sinceOrbitInput = Infinity;
  let lastX = avatar.position.x;
  let lastZ = avatar.position.z;

  // Manual orbit input (radians). Yaw is clamped to ±120° from behind the
  // avatar; pitch is stored as an offset from the 40° default and clamped so
  // the absolute pitch stays inside 15°–55°.
  function orbitBy(dYaw, dPitch) {
    if (typeof dYaw === 'number' && dYaw !== 0) {
      orbitYaw = clamp(orbitYaw + dYaw, -ORBIT_YAW_MAX, ORBIT_YAW_MAX);
    }
    if (typeof dPitch === 'number' && dPitch !== 0) {
      const next = orbitPitchOffset + dPitch;
      orbitPitchOffset = clamp(next, PITCH_MIN - PITCH_DEFAULT, PITCH_MAX - PITCH_DEFAULT);
    }
    sinceOrbitInput = 0;
  }

  // Q/E stepped yaw for keyboard-only players: 45° per step, same clamp.
  function stepOrbit(steps) {
    if (steps) orbitBy(steps * ORBIT_STEP, 0);
  }

  function update(dt) {
    const r = typeof avatar.radius === 'function' ? avatar.radius() : 30;
    const facing = avatar.object3D.rotation.y;
    const pitch = clamp(PITCH_DEFAULT + orbitPitchOffset, PITCH_MIN, PITCH_MAX);

    sinceOrbitInput += dt;

    // Avatar speed from position delta — drives auto-recenter (recenter only
    // while actually moving; standing still never steals the player's orbit).
    const px = avatar.position.x;
    const pz = avatar.position.z;
    const speed = dt > 0 ? Math.hypot(px - lastX, pz - lastZ) / dt : 0;
    lastX = px;
    lastZ = pz;

    // Auto-recenter (game-design §1): after 2s of movement with no orbit
    // input, ease the orbit offsets back to zero so the camera settles
    // behind the avatar on its own.
    if (sinceOrbitInput > RECENTER_DELAY && speed > 1 && (orbitYaw !== 0 || orbitPitchOffset !== 0)) {
      const k = Math.min(1, RECENTER_RATE * dt);
      orbitYaw -= orbitYaw * k;
      orbitPitchOffset -= orbitPitchOffset * k;
      if (Math.abs(orbitYaw) < 0.001) orbitYaw = 0;
      if (Math.abs(orbitPitchOffset) < 0.001) orbitPitchOffset = 0;
    }

    const effectiveYaw = facing + orbitYaw;
    const dirX = Math.sin(effectiveYaw);
    const dirZ = Math.cos(effectiveYaw);

    // Spherical framing from the avatar radius (B2).
    const dist = r * DIST_RADIUS_MULT;
    const horiz = dist * Math.cos(pitch);
    const height = dist * Math.sin(pitch);

    desiredPos.set(px - dirX * horiz, avatar.position.y + height, pz - dirZ * horiz);

    // Best-effort obstacle pull-in (kept from V1): if a stored obstacle
    // blocks the line to the desired position, pull in front of the hit.
    if (obstacles.length) {
      rayOrigin.set(px, avatar.position.y + height * 0.5, pz);
      rayDir.copy(desiredPos).sub(rayOrigin);
      const rayDist = rayDir.length();
      if (rayDist > 0.0001) {
        rayDir.divideScalar(rayDist);
        raycaster.set(rayOrigin, rayDir);
        raycaster.far = rayDist;
        // recursive=true: callers hand in THREE.Group instances whose only
        // raycastable parts are child meshes.
        const hits = raycaster.intersectObjects(obstacles, true);
        if (hits.length) {
          // An obstacle overlapping the avatar does not leave enough room for
          // a valid chase camera. Pulling to that near face collapses the view
          // inside the avatar/prop, so ignore hits inside the radius-derived
          // safety envelope and retain the normal framed position.
          const minimumSafeDistance = r * 1.5;
          if (hits[0].distance >= minimumSafeDistance) {
            const pull = Math.max(minimumSafeDistance, hits[0].distance - 0.5);
            desiredPos.copy(rayOrigin).addScaledVector(rayDir, pull);
          }
        }
      }
    }

    // Size-adaptive lag: bigger avatar -> higher follow rate -> LESS lag.
    const followRate = FOLLOW_RATE_BASE
      + Math.min(FOLLOW_RATE_MAX_BONUS, r * FOLLOW_RATE_RADIUS_GAIN);
    const damp = Math.min(1, dt * followRate);
    camera.position.lerp(desiredPos, damp);

    // Edge look-ahead: smooth the provider's cluster centroid (or fall back
    // to the avatar itself so the bias decays to nothing when no cluster is
    // near), then bias the look target 15% toward it, capped at 1.5r of
    // offset so a far cluster can't drag the view off the avatar.
    if (lookaheadProvider) {
      const cluster = lookaheadProvider(px, pz);
      const tx = cluster && typeof cluster.x === 'number' ? cluster.x : px;
      const tz = cluster && typeof cluster.z === 'number' ? cluster.z : pz;
      const lk = Math.min(1, LOOKAHEAD_SMOOTH_RATE * dt);
      lookaheadSmoothed.x += (tx - lookaheadSmoothed.x) * lk;
      lookaheadSmoothed.z += (tz - lookaheadSmoothed.z) * lk;
    } else {
      lookaheadSmoothed.set(px, 0, pz);
    }
    let biasX = (lookaheadSmoothed.x - px) * LOOKAHEAD_BIAS;
    let biasZ = (lookaheadSmoothed.z - pz) * LOOKAHEAD_BIAS;
    const biasLen = Math.hypot(biasX, biasZ);
    const biasMax = r * 1.5 * LOOKAHEAD_BIAS;
    if (biasLen > biasMax && biasLen > 0) {
      const s = biasMax / biasLen;
      biasX *= s;
      biasZ *= s;
    }

    lookGoal.set(px + biasX, avatar.position.y + r * 0.15, pz + biasZ);
    lookTarget.lerp(lookGoal, damp);
    camera.lookAt(lookTarget);
  }

  function setObstacles(meshList) {
    obstacles = Array.isArray(meshList) ? meshList : [];
  }

  return {
    update,
    setObstacles,
    orbitBy,
    stepOrbit,
    // The camera's view yaw (avatar facing + orbit offset) — the input layer
    // rotates its screen-space intent by exactly this (game-design §1).
    get yaw() { return avatar.object3D.rotation.y + orbitYaw; },
    get orbitYaw() { return orbitYaw; },
    get pitch() {
      return clamp(PITCH_DEFAULT + orbitPitchOffset, PITCH_MIN, PITCH_MAX);
    },
  };
}
