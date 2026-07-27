// The player avatar: a ground-flush VORTEX DISC, not a ball (art-direction
// §2 — Hole.io reference: the hero is a hole in the ground, not a floating
// sphere). The body is: a shallow concave funnel (paraboloid lathe) whose
// interior is a near-black radial gradient with the rotating spiral-swirl
// GLSL adapted to disc/polar UVs (lathe u = angle, v = throat→rim), plus a
// THICK unlit rim ring at ground level in a vivid cyan-blue that reads as
// glowing, plus a pooled debris stream of last-eaten props skimming the
// disc before absorption.
//
// Motion juice (art §2/§5): 2% squash-pop on eat (80ms), a gentle rim pulse
// (±3% scale/opacity), and a ground wake (darkened trail decals + dust
// puffs at speed) so movement reads on the floor. The V1 sphere's floating
// tilt/banking is gone — a hole in the ground does not lean.
// `reducedMotion = true` (tech §6, prefers-reduced-motion) disables the
// debris stream, wake decals, and dust puffs; movement and the eat-pop
// stay (they are readability, not shake).
//
// Movement math is EXACTLY V1's (speed 340 u/s, radius 26+sqrt(mass)*1.9,
// growth drag 60/max(60,r)) — the logic suite asserts per-frame displacement
// against it and the difficulty invariants are tuned to it.
//
// No browser-only API is touched at module top level — only inside
// createAvatar(), so a bare `import` of this file never throws in Node.
import { createPool } from './pools.js';

// Identity skins (art §2): same 5 ids as V1 (save data references them),
// but every skin is now a BRIGHT rim hue over a near-black interior — the
// swirl bands are a dim shade of the rim hue (colorB), the throat fades to
// near-black (colorA). `swirl` sets band contrast, `ringOpacity` the rim's
// base opacity (pulsed ±3% per frame).
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

const SWIRL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Rotating spiral on disc/polar UVs (art §2's "~20 lines of GLSL", adapted
// from the V1 sphere version): lathe UVs give u = angle around the disc and
// v = 0 at the throat → 1 at the rim, which IS polar space. Spiral bands
// rotate over time; a radial falloff sinks the throat to near-black so the
// shallow dish reads as a deep funnel (the concavity is painted, not
// geometric — the mesh stays essentially flush with the ground).
const SWIRL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uSwirl;
  varying vec2 vUv;
  void main() {
    float ang = vUv.x * 6.28318;
    float rad = vUv.y;
    float spiral = sin(ang * 3.0 + rad * 10.0 - uTime * 2.4) * uSwirl;
    float bands = smoothstep(-0.2, 0.9, spiral) * smoothstep(0.12, 0.9, rad);
    vec3 col = mix(uColorA, uColorB, bands);
    col *= 0.22 + 0.78 * smoothstep(0.0, 0.75, rad);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Movement constants — EXACT V1 values, do not retune (see header comment).
const BASE_SPEED = 340;

const EAT_POP_SCALE = 0.02;   // 2% squash-and-stretch pop
const EAT_POP_SECONDS = 0.08; // 80ms

// Ground-stack heights (world units): ground plane y=0, prop blob shadows
// 0.15 (instancing.js), wake decals 0.25, funnel throat 0.12 → rim 0.5.
// The rim sits above the shadows/wake but below falling props, and nothing
// is coplanar, so no z-fighting and no renderOrder tricks are needed.
const RIM_Y = 0.5;
const THROAT_Y = 0.12;
const FUNNEL_DEPTH = RIM_Y - THROAT_Y; // lathe geometry is 1.0 deep; scaled to this
const WAKE_Y = 0.25;
const RIM_PULSE = 0.03;       // ±3% scale/opacity
const RIM_PULSE_SPEED = 3.0;  // rad/s

const DEBRIS_POOL_SIZE = 14;
const DEBRIS_LIFE = 0.9;      // seconds skimming the disc before absorption
// Ground wake. Sized and faded WAY down from the original r*0.8 discs at 0.28
// opacity: at the reference camera framing those read as a chain of big grey
// puddles dragging behind the hole, not motion. The reference has no wake at
// all; this keeps a faint scuff so speed still registers on the floor.
const WAKE_POOL_SIZE = 20;
const WAKE_LIFE = 0.55;
const WAKE_INTERVAL = 0.09;   // seconds between trail decals at speed
const WAKE_SCALE = 0.34;      // fraction of avatar radius
const WAKE_OPACITY = 0.10;
// Dust puffs, likewise pulled back: at r*0.5 growing 2.5x with 0.22 additive
// opacity these bloomed into a pale disc wider than the hole itself, reading
// as a grey smudge parked under the player rather than as speed.
const DUST_POOL_SIZE = 12;
const DUST_LIFE = 0.5;
const DUST_SCALE = 0.22;    // fraction of avatar radius
const DUST_OPACITY = 0.14;

const TAU = Math.PI * 2;

// Signed shortest angular distance from `from` to `to`, wrapped to (-PI, PI].
// Exported so the logic suite can assert the wrap directly.
export function shortestAngleTo(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

// The ground-flush HOLE VISUAL shared by the player avatar and the rival
// flywheels (main.js builds rivals with this too): a swirl-shaded paraboloid
// funnel plus the thick unlit rim ring. The returned group is meant to live
// inside a parent scaled to the hole's world radius (both the avatar and
// rivals.js follow that convention); update(dt, radius) keeps the disc
// flush with the ground and animates the swirl + rim pulse.
export function createHoleVisual(THREE, {
  rim, colorA, colorB, swirl = 1, ringOpacity = 0.95,
}) {
  const group = new THREE.Group();

  // Interior: shallow paraboloid funnel (lathe), rim radius 1.0, depth 1.0
  // (scaled down to FUNNEL_DEPTH world units per frame — see update()). The
  // swirl shader paints it from a near-black throat to the rim-hue bands.
  const funnelPoints = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const x = Math.max(0.001, t);
    funnelPoints.push(new THREE.Vector2(x, -(1 - x * x))); // paraboloid, y: -1 → 0
  }
  const funnelGeo = new THREE.LatheGeometry(funnelPoints, 48);
  const coreUniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(colorA) },
    uColorB: { value: new THREE.Color(colorB) },
    uSwirl: { value: swirl },
  };
  const coreMat = new THREE.ShaderMaterial({
    uniforms: coreUniforms,
    vertexShader: SWIRL_VERTEX,
    fragmentShader: SWIRL_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const funnel = new THREE.Mesh(funnelGeo, coreMat);
  group.add(funnel);

  // Rim: a THICK flat ring at ground level in the bright rim hue —
  // MeshBasicMaterial (unlit, reads as glowing) at ~0.95 opacity with a
  // gentle ±3% pulse. Inner edge tucks under the funnel's rim (0.92 < 1.0)
  // so the seam stays hidden through the pulse.
  const ringGeo = new THREE.RingGeometry(0.92, 1.14, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: rim,
    transparent: true,
    opacity: ringOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  let baseRingOpacity = ringOpacity;

  function setColors(colors) {
    if (typeof colors.colorA === 'number') coreUniforms.uColorA.value.set(colors.colorA);
    if (typeof colors.colorB === 'number') coreUniforms.uColorB.value.set(colors.colorB);
    if (typeof colors.swirl === 'number') coreUniforms.uSwirl.value = colors.swirl;
    if (typeof colors.rim === 'number') ringMat.color.set(colors.rim);
    if (typeof colors.ringOpacity === 'number') {
      baseRingOpacity = colors.ringOpacity;
      ringMat.opacity = baseRingOpacity;
    }
  }

  // `radius` is the world radius the PARENT group is scaled to this frame —
  // the heights below are divided back out so the disc stays ground-flush
  // regardless of that scale (funnel depth is a fixed world height, not a
  // fraction of r — a deeper dish would sink below the opaque ground plane
  // and get clipped flat anyway).
  function update(dt, radius) {
    // Swirl time — the always-on vortex identity — plus the rim pulse.
    coreUniforms.uTime.value += dt;
    const pulseWave = Math.sin(coreUniforms.uTime.value * RIM_PULSE_SPEED);
    ring.scale.set(1 + RIM_PULSE * pulseWave, 1 + RIM_PULSE * pulseWave, 1);
    ringMat.opacity = baseRingOpacity * (1 - RIM_PULSE * pulseWave);

    const inv = 1 / Math.max(1, radius);
    ring.position.y = RIM_Y * inv;
    funnel.position.y = RIM_Y * inv;
    funnel.scale.y = FUNNEL_DEPTH * inv;
  }

  return { group, setColors, update };
}

export function createAvatar(scene, THREE) {
  const object3D = new THREE.Group();

  // Funnel + rim come from the shared hole-visual factory (rivals use it
  // too); the avatar adds debris stream, wake, and dust on top.
  const hole = createHoleVisual(THREE, {
    rim: SKINS.void.ring,
    colorA: SKINS.void.colorA,
    colorB: SKINS.void.colorB,
    swirl: SKINS.void.swirl,
    ringOpacity: SKINS.void.ringOpacity,
  });
  object3D.add(hole.group);

  // Debris stream: pooled shards of last-eaten props skimming just above
  // the disc, spiraling into the throat (pooled per tech §1 — zero alloc
  // per eat).
  const debrisPool = createPool({
    initialSize: DEBRIS_POOL_SIZE,
    create: () => {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.09),
        new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.9 })
      );
      mesh.visible = false;
      object3D.add(mesh);
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
          color: 0x86d4f5, transparent: true, opacity: 0,
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
    d.height = Math.random(); // 0..1 skim height above the disc
    d.speed = 4 + Math.random() * 3;
    d.t = 0;
    d.mesh.visible = true;
    debrisLive.push(d);
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
    return true;
  }

  function update(dt) {
    // --- Movement (EXACT V1 math) -----------------------------------------
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

    const r = radius();

    // Eat-pop: 2% scale bump decaying linearly over 80ms (art §2).
    let popScale = 1;
    if (popTimer > 0) {
      popTimer = Math.max(0, popTimer - dt);
      popScale = 1 + EAT_POP_SCALE * (popTimer / EAT_POP_SECONDS);
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

    // Swirl time, rim pulse, and the ground-flush heights all live in the
    // shared hole visual now.
    hole.update(dt, r);

    // object3D is scaled by r, so world-space debris heights become local /r.
    const inv = 1 / Math.max(1, r);

    // Debris stream: spiral from just outside the rim into the throat over
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
      const orbitR = 0.15 + 1.0 * k; // 1.15r → 0.15r as it dies
      d.mesh.position.set(
        Math.cos(d.angle) * orbitR,
        (0.8 + 2.2 * d.height * k) * inv, // skims 0.8–3.0 world units up
        Math.sin(d.angle) * orbitR
      );
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
          w.mesh.position.set(object3D.position.x, WAKE_Y, object3D.position.z);
          w.mesh.scale.setScalar(r * WAKE_SCALE);
          wakeLive.push(w);
        }
        if (speedFrac > 0.8) {
          dustTimer -= dt;
          if (dustTimer <= 0) {
            dustTimer = 0.15;
            const p = dustPool.acquire();
            p.t = 0;
            p.baseScale = r * DUST_SCALE;
            p.mesh.visible = true;
            p.mesh.position.set(
              object3D.position.x - Math.sin(facingAngle) * r * 0.8,
              0.5,
              object3D.position.z - Math.cos(facingAngle) * r * 0.8
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
      w.mesh.material.opacity = WAKE_OPACITY * k;
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
      p.mesh.material.opacity = DUST_OPACITY * k;
      p.mesh.scale.setScalar(p.baseScale * (1 + (1 - k) * 0.8));
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
