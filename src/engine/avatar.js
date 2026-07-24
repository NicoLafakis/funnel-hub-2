// The player avatar: a dark-matter VORTEX, not a ball (art-direction §2,
// flaw D3 — the V1 "purple sphere + wireframe shell" read as "a ball" in
// live playtests). The sphere silhouette stays (it reads at any size), but
// the body is now: an emissive swirl shader on the core (rotating spiral UV,
// ~20 lines of GLSL), a rim energy ring lying flat on the ground like a
// suction disc, and a pooled debris stream of last-eaten props orbiting
// briefly before absorption.
//
// Motion juice (art §2/§5): 2% squash-pop on eat (80ms), banking into turns
// (roll ±10° from lateral velocity), and a ground wake (darkened trail
// decals + dust puffs at speed) so movement reads on the floor.
// `reducedMotion = true` (tech §6, prefers-reduced-motion) disables the
// debris stream, wake decals, and dust puffs; movement, banking, and the
// eat-pop stay (they are readability, not shake).
//
// Movement math is EXACTLY V1's (speed 340 u/s, radius 26+sqrt(mass)*1.9,
// growth drag 60/max(60,r)) — the logic suite asserts per-frame displacement
// against it and the difficulty invariants are tuned to it.
//
// No browser-only API is touched at module top level — only inside
// createAvatar(), so a bare `import` of this file never throws in Node.
import { createPool } from './pools.js';

// Identity skins (art §2): V1's 5 skins kept as a setSkin() API, but they
// now differ in MATERIAL character (matte / metallic / emissive), not just
// rim color. With the core's ShaderMaterial, "material" is expressed through
// the swirl uniforms: uGloss (rim/specular strength), uSwirl (band contrast)
// and the palette pair.
export const SKINS = {
  // Default: the classic near-black purple vortex, emissive-forward.
  void: {
    colorA: 0x0d0014, colorB: 0x7a2bd0, ring: 0x00a4bd,
    gloss: 0.35, swirl: 1.0, ringOpacity: 0.55,
  },
  // Matte: flat basalt, low rim — the understated one.
  basalt: {
    colorA: 0x1a1d22, colorB: 0x4d5866, ring: 0x8fb8d9,
    gloss: 0.08, swirl: 0.45, ringOpacity: 0.3,
  },
  // Metallic: chrome with a hard fresnel rim.
  chrome: {
    colorA: 0x2b3138, colorB: 0xb9c6d4, ring: 0xd7e6f2,
    gloss: 1.1, swirl: 0.6, ringOpacity: 0.45,
  },
  // Emissive: deep ember core, hot bands, strong glow.
  ember: {
    colorA: 0x1a0500, colorB: 0xff5a1f, ring: 0xffb347,
    gloss: 0.5, swirl: 1.3, ringOpacity: 0.7,
  },
  // Toxic: acid-green swirl, sickly bright ring.
  toxic: {
    colorA: 0x04140a, colorB: 0x39ff88, ring: 0xa4ff4f,
    gloss: 0.45, swirl: 1.15, ringOpacity: 0.65,
  },
};
export const SKIN_NAMES = Object.keys(SKINS);

const SWIRL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// Rotating spiral UV (art §2's "~20 lines of GLSL"): polar spiral bands in
// UV space rotating over time, plus a fresnel rim so the sphere edge glows
// like an event horizon. Bands fade toward the UV pole to hide the seam.
const SWIRL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uGloss;
  uniform float uSwirl;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec2 c = vUv - 0.5;
    float ang = atan(c.y, c.x);
    float rad = length(c) * 2.0;
    float spiral = sin(ang * 3.0 + rad * 9.0 - uTime * 2.2) * uSwirl;
    float bands = smoothstep(-0.2, 0.9, spiral) * (1.0 - smoothstep(0.75, 1.0, rad));
    vec3 col = mix(uColorA, uColorB, bands);
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    col += uColorB * fres * (0.4 + uGloss);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Movement constants — EXACT V1 values, do not retune (see header comment).
const BASE_SPEED = 340;

const EAT_POP_SCALE = 0.02;   // 2% squash-and-stretch pop
const EAT_POP_SECONDS = 0.08; // 80ms
const BANK_MAX = 10 * (Math.PI / 180); // ±10° roll from lateral velocity

const DEBRIS_POOL_SIZE = 14;
const DEBRIS_LIFE = 0.9;      // seconds orbiting before absorption
const WAKE_POOL_SIZE = 20;
const WAKE_LIFE = 1.1;
const WAKE_INTERVAL = 0.09;   // seconds between trail decals at speed
const DUST_POOL_SIZE = 12;
const DUST_LIFE = 0.5;

export function createAvatar(scene, THREE) {
  const object3D = new THREE.Group();
  // Inner group carries the visual-only transforms (forward tilt, banking
  // roll, eat-pop) so object3D.rotation.y stays a pure facing angle for
  // camera.js and gameplay code.
  const inner = new THREE.Group();
  object3D.add(inner);

  // Core: sphere with the swirl shader — the vortex body.
  const coreGeo = new THREE.SphereGeometry(1, 32, 24);
  const coreUniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(SKINS.void.colorA) },
    uColorB: { value: new THREE.Color(SKINS.void.colorB) },
    uGloss: { value: SKINS.void.gloss },
    uSwirl: { value: SKINS.void.swirl },
  };
  const coreMat = new THREE.ShaderMaterial({
    uniforms: coreUniforms,
    vertexShader: SWIRL_VERTEX,
    fragmentShader: SWIRL_FRAGMENT,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  inner.add(core);

  // Rim energy ring: a flat suction disc on the ground (art §2). Lives under
  // object3D so its radius scales with the avatar; its local y is corrected
  // every frame so it hugs the ground plane regardless of scale.
  const ringGeo = new THREE.RingGeometry(1.04, 1.22, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: SKINS.void.ring,
    transparent: true,
    opacity: SKINS.void.ringOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  object3D.add(ring);
  let ringSpin = 0;

  // Debris stream: pooled shards of last-eaten props orbiting just outside
  // the core, shrinking into it (pooled per tech §1 — zero alloc per eat).
  const debrisPool = createPool({
    initialSize: DEBRIS_POOL_SIZE,
    create: () => {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.09),
        new THREE.MeshBasicMaterial({ color: 0xb98ae0, transparent: true, opacity: 0.9 })
      );
      mesh.visible = false;
      inner.add(mesh);
      return { mesh, angle: 0, height: 0, speed: 0, t: 0 };
    },
    reset: (d) => { d.mesh.visible = false; d.t = 0; },
  });
  const debrisLive = [];

  // Ground wake: pooled dark decals dropped on the floor while moving fast
  // (world-space — added to the scene, not the avatar, so they stay behind).
  const wakePool = createPool({
    initialSize: WAKE_POOL_SIZE,
    create: () => {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, t: 0 };
    },
    reset: (w) => { w.mesh.visible = false; w.t = 0; },
  });
  const wakeLive = [];

  // Dust puffs: pooled additive rings that bloom and fade at speed.
  const dustPool = createPool({
    initialSize: DUST_POOL_SIZE,
    create: () => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.9, 16),
        new THREE.MeshBasicMaterial({
          color: 0x9fb4c4, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, t: 0, baseScale: 1 };
    },
    reset: (p) => { p.mesh.visible = false; p.t = 0; },
  });
  const dustLive = [];

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
  let bankAngle = 0;
  let popTimer = 0;
  let wakeTimer = 0;
  let dustTimer = 0;

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

  // Eat feedback entry point: 2% scale pop over 80ms plus one debris shard
  // (skipped under reduced-motion). main.js calls this once per eaten prop.
  function onEat() {
    popTimer = EAT_POP_SECONDS;
    if (_reducedMotion) return;
    const d = debrisPool.acquire();
    d.angle = Math.random() * Math.PI * 2;
    d.height = (Math.random() - 0.5) * 0.9;
    d.speed = 4 + Math.random() * 3;
    d.t = 0;
    d.mesh.visible = true;
    debrisLive.push(d);
  }

  function setSkin(name) {
    const skin = SKINS[name];
    if (!skin) return false;
    coreUniforms.uColorA.value.set(skin.colorA);
    coreUniforms.uColorB.value.set(skin.colorB);
    coreUniforms.uGloss.value = skin.gloss;
    coreUniforms.uSwirl.value = skin.swirl;
    ringMat.color.set(skin.ring);
    ringMat.opacity = skin.ringOpacity;
    return true;
  }

  function update(dt) {
    // --- Movement (EXACT V1 math) -----------------------------------------
    const len = Math.hypot(inputDx, inputDz);
    let speed = 0;
    let velX = 0;
    let velZ = 0;

    if (len > 0.0001) {
      const nx = inputDx / len;
      const nz = inputDz / len;
      // Mild slowdown as mass grows (genre-typical), capped so it never stalls.
      const growthDrag = 60 / Math.max(60, radius());
      speed = BASE_SPEED * _speedMultiplier * Math.min(1, len) * growthDrag;
      velX = nx * speed;
      velZ = nz * speed;
      object3D.position.x += velX * dt;
      object3D.position.z += velZ * dt;
      facingAngle = Math.atan2(nx, nz);
    }

    const r = radius();

    // Eat-pop: 2% scale bump decaying linearly over 80ms (art §2).
    let popScale = 1;
    if (popTimer > 0) {
      popTimer = Math.max(0, popTimer - dt);
      popScale = 1 + EAT_POP_SCALE * (popTimer / EAT_POP_SECONDS);
    }
    object3D.scale.setScalar(r * popScale);

    // Orientation: damped facing (V1's `Math.min(1, dt*6)`), forward tilt on
    // the inner group growing with speed.
    const damp = Math.min(1, dt * 6);
    object3D.rotation.y += (facingAngle - object3D.rotation.y) * damp;
    const tiltTarget = Math.min(0.35, (speed / BASE_SPEED) * 0.35);
    inner.rotation.x += (tiltTarget - inner.rotation.x) * damp;

    // Banking (art §2): roll ±10° from the velocity component perpendicular
    // to facing — the vortex leans into its turns.
    const fX = Math.sin(facingAngle);
    const fZ = Math.cos(facingAngle);
    const lateral = velX * -fZ + velZ * fX; // velocity along facing-right
    const bankTarget = speed > 0.0001
      ? Math.max(-BANK_MAX, Math.min(BANK_MAX, -(lateral / BASE_SPEED) * BANK_MAX))
      : 0;
    bankAngle += (bankTarget - bankAngle) * damp;
    inner.rotation.z = bankAngle;

    // Swirl time + ring spin — the always-on vortex identity.
    coreUniforms.uTime.value += dt;
    ringSpin += dt * 0.8;
    ring.rotation.z = ringSpin;
    // Keep the suction disc on the ground plane: object3D sits at y=0 and is
    // scaled by r, so a local y of 0.6/r lands the ring ~0.6 units up.
    ring.position.y = 0.6 / Math.max(1, r);

    // Debris stream: orbit just outside the core, shrink to nothing over
    // DEBRIS_LIFE seconds (absorption), then return to the pool.
    for (let i = debrisLive.length - 1; i >= 0; i--) {
      const d = debrisLive[i];
      d.t += dt;
      d.angle += d.speed * dt;
      const k = 1 - d.t / DEBRIS_LIFE;
      if (k <= 0) {
        debrisLive.splice(i, 1);
        debrisPool.release(d);
        continue;
      }
      const orbitR = 0.55 + 0.6 * k; // spirals inward as it dies
      d.mesh.position.set(Math.cos(d.angle) * orbitR, d.height * k, Math.sin(d.angle) * orbitR);
      d.mesh.scale.setScalar(Math.max(0.01, k));
      d.mesh.rotation.x += dt * 3;
      d.mesh.rotation.y += dt * 2;
    }

    // Ground wake + dust (reduced-motion: skipped entirely, tech §6).
    if (!_reducedMotion) {
      const speedFrac = speed / BASE_SPEED;
      if (speedFrac > 0.5) {
        wakeTimer -= dt;
        if (wakeTimer <= 0) {
          wakeTimer = WAKE_INTERVAL;
          const w = wakePool.acquire();
          w.t = 0;
          w.mesh.visible = true;
          w.mesh.position.set(object3D.position.x, 0.4, object3D.position.z);
          w.mesh.scale.setScalar(r * 0.8);
          wakeLive.push(w);
        }
        if (speedFrac > 0.8) {
          dustTimer -= dt;
          if (dustTimer <= 0) {
            dustTimer = 0.15;
            const p = dustPool.acquire();
            p.t = 0;
            p.baseScale = r * 0.5;
            p.mesh.visible = true;
            p.mesh.position.set(
              object3D.position.x - fX * r * 0.8,
              0.5,
              object3D.position.z - fZ * r * 0.8
            );
            dustLive.push(p);
          }
        }
      }
    }
    for (let i = wakeLive.length - 1; i >= 0; i--) {
      const w = wakeLive[i];
      w.t += dt;
      const k = 1 - w.t / WAKE_LIFE;
      if (k <= 0) {
        wakeLive.splice(i, 1);
        wakePool.release(w);
        continue;
      }
      w.mesh.material.opacity = 0.28 * k;
    }
    for (let i = dustLive.length - 1; i >= 0; i--) {
      const p = dustLive[i];
      p.t += dt;
      const k = 1 - p.t / DUST_LIFE;
      if (k <= 0) {
        dustLive.splice(i, 1);
        dustPool.release(p);
        continue;
      }
      p.mesh.material.opacity = 0.22 * k;
      p.mesh.scale.setScalar(p.baseScale * (1 + (1 - k) * 1.5));
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
    get reducedMotion() { return _reducedMotion; },
    set reducedMotion(v) { _reducedMotion = !!v; },
    radius,
    setMoveInput,
    onEat,
    setSkin,
    update,
    get position() { return object3D.position; },
  };
}
