// Metro signatures (art-direction.md §4): ONE signature visual per metro,
// cheap and data-driven from metros.js `signature { type, params }`. Built
// per level by main.js; every mesh is added to the level root so the
// standard teardown (disposeObject3D) cleans it up.
//
// THREE is always passed in (content-module convention — no own import).
// DOM canvas use happens only inside factory functions and is guarded, so a
// bare `import` of this file never throws in Node. Particle streams honor
// prefers-reduced-motion (main passes the flag; those signatures then build
// nothing or no-op their bursts).
//
// Every factory returns { update(dt, frame), burst?(x, z), dispose() } —
// update() is called per frame during play with
//   frame = { avatarX, avatarZ, avatarRadius, targetRadius }
// (targetRadius = avatar radius at 100% of the level target, so growth-based
// effects get a 0..1-ish progress signal); burst() fires confetti on combo
// tier-ups where the signature has one.
import { mulberry32 } from '../data/seeds.js';

function noop() {}

export function createMetroSignature(metro, ctx) {
  const sig = metro && metro.signature;
  if (!sig || !sig.type) return null;
  const { THREE, root } = ctx;
  switch (sig.type) {
    case 'bridge-silhouette': return bridgeSilhouette(THREE, root, sig.params, ctx);
    case 'mansard-roofs': return mansardRoofs(THREE, root, sig.params, ctx);
    case 'fog-banks': return fogBanks(THREE, root, sig.params, ctx);
    case 'emissive-signs': return emissiveSigns(THREE, root, sig.params, ctx);
    case 'sand-drift': return ctx.reducedMotion ? null : sandDrift(THREE, root, sig.params, ctx);
    case 'travertine-tint': return travertineTint(sig.params, ctx);
    case 'confetti': return confetti(THREE, root, sig.params, ctx);
    case 'snow-dust': return ctx.reducedMotion ? { update: noop, dispose: noop } : snowDust(THREE, root, sig.params, ctx);
    case 'water-plane': return waterPlane(THREE, root, sig.params, ctx);
    case 'god-ray-tower': return godRayTower(THREE, root, sig.params, ctx);
    default: return null;
  }
}

// Soft radial-gradient disc texture for fog banks (DOM-guarded; null in Node,
// where these factories never run).
function softDiscTexture(THREE) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Harbor Metropolis: flat bridge silhouette on the north horizon — deck +
// towers as unlit boxes, softened by the distance fog.
function bridgeSilhouette(THREE, root, params, ctx) {
  const world = ctx.level.world;
  const mat = new THREE.MeshBasicMaterial({ color: params.color || '#2c3a48' });
  const group = new THREE.Group();
  const spans = params.spans || 3;
  const deckH = params.deckHeight || 60;
  const z = -world / 2 - world * 0.15;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(world * 1.6, Math.max(4, deckH * 0.12), 12), mat);
  deck.position.set(0, deckH, z);
  group.add(deck);
  for (let i = 0; i <= spans; i += 1) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(world * 0.03, deckH * 2.2, 12), mat);
    tower.position.set(-world * 0.8 + (world * 1.6 * i) / spans, deckH * 1.1, z);
    group.add(tower);
  }
  root.add(group);
  return { update: noop, dispose: noop };
}

// Le Vieux Continent: mansard roofs — one instanced squashed 4-sided cone per
// building (density-gated), tinted roofTint.
function mansardRoofs(THREE, root, params, ctx) {
  const buildings = ctx.buildings || [];
  if (!buildings.length) return { update: noop, dispose: noop };
  const rng = mulberry32((ctx.level.seed ^ 0xA454D) >>> 0);
  const density = typeof params.density === 'number' ? params.density : 0.8;
  const chosen = buildings.filter(() => rng() < density);
  if (!chosen.length) return { update: noop, dispose: noop };
  const geo = new THREE.ConeGeometry(1, 1, 4);
  const mat = new THREE.MeshStandardMaterial({ color: params.roofTint || '#5a4a3a', roughness: 0.85 });
  const mesh = new THREE.InstancedMesh(geo, mat, chosen.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  chosen.forEach((b, i) => {
    const foot = b.radius * 1.15;
    const roofH = Math.max(6, b.height * (params.pitch || 0.6) * 0.35);
    e.set(0, (b.rotY || 0) + Math.PI / 4, 0);
    q.setFromEuler(e);
    v.set(b.x, b.height + roofH / 2 - 0.5, b.z);
    s.set(foot, roofH, foot);
    m.compose(v, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  return { update: noop, dispose: noop };
}

// Old Fog Town: local fog banks lying on the district that part as the avatar
// grows — bank i fully opens at a staggered growth fraction, so the map
// literally clears around you.
function fogBanks(THREE, root, params, ctx) {
  const world = ctx.level.world;
  const count = params.bankCount || 6;
  const baseOpacity = typeof params.opacity === 'number' ? params.opacity : 0.55;
  const partAt = typeof params.partAtRadiusFraction === 'number' ? params.partAtRadiusFraction : 0.3;
  const rng = mulberry32((ctx.level.seed ^ 0xF06B4B) >>> 0);
  const tex = softDiscTexture(THREE);
  const banks = [];
  for (let i = 0; i < count; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe8eef2, transparent: true, opacity: baseOpacity,
      depthWrite: false, map: tex, fog: false,
    });
    const size = world * (0.25 + rng() * 0.2);
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.6), mat);
    bank.rotation.x = -Math.PI / 2;
    bank.position.set((rng() * 2 - 1) * world * 0.35, 6 + rng() * 10, (rng() * 2 - 1) * world * 0.35);
    root.add(bank);
    // Staggered open points across the growth arc (partAt .. ~1.05 of the
    // target radius fraction): the first bank parts early, the last only
    // once you're nearly done eating the district.
    const openAt = partAt + (1.05 - partAt) * (count > 1 ? i / (count - 1) : 0);
    banks.push({ mat, openAt });
  }
  return {
    update(dt, frame) {
      const frac = frame.targetRadius > 0 ? frame.avatarRadius / frame.targetRadius : 1;
      for (const b of banks) {
        const open = Math.min(1, frac / Math.max(1e-3, b.openAt));
        b.mat.opacity = baseOpacity * (1 - open);
      }
    },
    dispose: noop,
  };
}

// Neon District: unlit sign quads on building facades (MeshBasicMaterial =
// the emissive read, no bloom), palette-cycled per sign.
function emissiveSigns(THREE, root, params, ctx) {
  const buildings = ctx.buildings || [];
  if (!buildings.length) return { update: noop, dispose: noop };
  const per = params.signsPerBuilding || 2;
  const palette = params.palette && params.palette.length ? params.palette : ['#ff2e93'];
  const total = buildings.length * per;
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  const rng = mulberry32((ctx.level.seed ^ 0x51695) >>> 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  let idx = 0;
  for (const b of buildings) {
    const face = b.rotY || 0;
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    for (let k = 0; k < per; k += 1) {
      const w = b.radius * (0.7 + rng() * 0.5);
      const h = w * 0.35;
      e.set(0, face, 0);
      q.setFromEuler(e);
      v.set(
        b.x + fx * (b.radius * 0.75 + 0.6),
        b.height * (0.35 + rng() * 0.45),
        b.z + fz * (b.radius * 0.75 + 0.6)
      );
      s.set(w, h, 1);
      m.compose(v, q, s);
      mesh.setMatrixAt(idx, m);
      col.set(palette[idx % palette.length]);
      mesh.setColorAt(idx, col);
      idx += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  root.add(mesh);
  return { update: noop, dispose: noop };
}

// Desert Spires: sand-drift — one THREE.Points cloud sliding across the map
// at ground level (pooled positions, zero per-frame allocation).
function sandDrift(THREE, root, params, ctx) {
  const world = ctx.level.world;
  const count = params.particleCount || 120;
  const speed = params.speed || 18;
  const maxY = params.height || 2;
  const rng = mulberry32((ctx.level.seed ^ 0x5A4D5) >>> 0);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rng() * 2 - 1) * world * 0.5;
    positions[i * 3 + 1] = 0.5 + rng() * maxY;
    positions[i * 3 + 2] = (rng() * 2 - 1) * world * 0.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe8d5b0, size: 3, transparent: true, opacity: 0.55,
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  root.add(points);
  return {
    update(dt) {
      const arr = geo.attributes.position.array;
      const half = world * 0.5;
      for (let i = 0; i < count; i += 1) {
        arr[i * 3] += speed * dt;
        if (arr[i * 3] > half) arr[i * 3] = -half;
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose: noop,
  };
}

// Coliseum City: warm travertine tint shift across every prop group
// (instancing.js owns the actual material lerp).
function travertineTint(params, ctx) {
  if (ctx.world && typeof ctx.world.setGlobalTint === 'function') {
    ctx.world.setGlobalTint(params.tint || '#e8d5b0', typeof params.strength === 'number' ? params.strength : 0.35);
  }
  return { update: noop, dispose: noop };
}

// Carnival Coast: confetti burst on combo tier-ups — a pooled additive
// THREE.Points cloud (fixed capacity, ring-buffer reuse, zero allocation
// after construction). Colors fade to black = invisible under additive
// blending, so dead points never show.
function confetti(THREE, root, params, ctx) {
  const CAP = 72;
  const BURST = 24;
  const LIFE = 0.9;
  const positions = new Float32Array(CAP * 3);
  const colors = new Float32Array(CAP * 3);
  const baseColors = new Float32Array(CAP * 3);
  const vel = new Float32Array(CAP * 3);
  const life = new Float32Array(CAP);
  for (let i = 0; i < CAP; i += 1) positions[i * 3 + 1] = -500;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 5, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  root.add(points);
  const palette = (params.colors && params.colors.length ? params.colors : ['#ffd54a'])
    .map((c) => new THREE.Color(c));
  const rng = mulberry32((ctx.level.seed ^ 0xC0FE71) >>> 0);
  let cursor = 0;

  function burst(x, z) {
    if (ctx.reducedMotion) return;
    for (let k = 0; k < BURST; k += 1) {
      const i = cursor;
      cursor = (cursor + 1) % CAP;
      const a = rng() * Math.PI * 2;
      const sp = 60 + rng() * 120;
      positions[i * 3] = x;
      positions[i * 3 + 1] = 6;
      positions[i * 3 + 2] = z;
      vel[i * 3] = Math.cos(a) * sp;
      vel[i * 3 + 1] = 120 + rng() * 140;
      vel[i * 3 + 2] = Math.sin(a) * sp;
      const col = palette[(k + i) % palette.length];
      baseColors[i * 3] = col.r;
      baseColors[i * 3 + 1] = col.g;
      baseColors[i * 3 + 2] = col.b;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      life[i] = LIFE;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return {
    burst,
    update(dt) {
      let any = false;
      for (let i = 0; i < CAP; i += 1) {
        if (life[i] <= 0) continue;
        any = true;
        life[i] -= dt;
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -500;
          continue;
        }
        vel[i * 3 + 1] -= 300 * dt;
        positions[i * 3] += vel[i * 3] * dt;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const f = life[i] / LIFE;
        colors[i * 3] = baseColors[i * 3] * f;
        colors[i * 3 + 1] = baseColors[i * 3 + 1] * f;
        colors[i * 3 + 2] = baseColors[i * 3 + 2] * f;
      }
      if (any) {
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      }
    },
    dispose: noop,
  };
}

// Red Square Heights: falling snow-dust in a box that follows the avatar
// (wrap-around relative to the player, so it's always snowing around you).
// The matching lens-frost vignette is a CSS overlay owned by main.js (DOM).
function snowDust(THREE, root, params, ctx) {
  const count = 180;
  const RANGE = 500;
  const intensity = typeof params.intensity === 'number' ? params.intensity : 0.5;
  const rng = mulberry32((ctx.level.seed ^ 0x5107) >>> 0);
  const positions = new Float32Array(count * 3);
  const fall = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rng() * 2 - 1) * RANGE;
    positions[i * 3 + 1] = rng() * 160;
    positions[i * 3 + 2] = (rng() * 2 - 1) * RANGE;
    fall[i] = 35 + rng() * 45;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe8f0f8, size: 2.4, transparent: true, opacity: Math.min(0.85, intensity + 0.25),
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  root.add(points);
  return {
    update(dt, frame) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i += 1) {
        arr[i * 3 + 1] -= fall[i] * dt;
        arr[i * 3] += 8 * dt;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 160;
        // Keep the box wrapped around the avatar.
        if (arr[i * 3] - frame.avatarX > RANGE) arr[i * 3] -= RANGE * 2;
        else if (arr[i * 3] - frame.avatarX < -RANGE) arr[i * 3] += RANGE * 2;
        if (arr[i * 3 + 2] - frame.avatarZ > RANGE) arr[i * 3 + 2] -= RANGE * 2;
        else if (arr[i * 3 + 2] - frame.avatarZ < -RANGE) arr[i * 3 + 2] += RANGE * 2;
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose: noop,
  };
}

// Harbor Opera Bay: a water plane at the map edge — the "reflection" is faked
// with the metro sky color as emissive over a low-roughness standard material.
function waterPlane(THREE, root, params, ctx) {
  const world = ctx.level.world;
  const w = world * 1.8;
  const d = world * 0.45;
  const mat = new THREE.MeshStandardMaterial({
    color: params.color || '#0a3a4d',
    roughness: 0.05,
    metalness: 0.55,
    // The "reflection": raw metro sky as a strong emissive so the plane reads
    // as pale sky-lit water even at night (night lighting dims everything
    // else around it, which is exactly the contrast that sells the edge).
    emissive: new THREE.Color(ctx.level.metro.sky),
    emissiveIntensity: 0.55,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  const off = world / 2 + d / 2 - 30; // tuck slightly under the map edge
  const edge = params.edge || 'south';
  mesh.position.set(
    edge === 'east' ? off : edge === 'west' ? -off : 0,
    0.18,
    edge === 'north' ? -off : off
  );
  root.add(mesh);
  return { update: noop, dispose: noop };
}

// Capital Prime: the Portal Tower silhouette with a god-ray cone, fog-exempt
// and tall enough to read from every district of the metro.
function godRayTower(THREE, root, params, ctx) {
  const world = ctx.level.world;
  const group = new THREE.Group();
  const z = -world / 2 - world * 0.12;
  const H = world * 0.5;
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(world * 0.05, H, world * 0.05),
    new THREE.MeshBasicMaterial({ color: 0x0a0d18, fog: false })
  );
  tower.position.set(0, H / 2, z);
  group.add(tower);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(world * 0.09, H * 1.4, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: params.rayColor || '#7a5cff',
      transparent: true,
      opacity: typeof params.rayOpacity === 'number' ? params.rayOpacity : 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  cone.position.set(0, H * 0.9, z);
  group.add(cone);
  root.add(group);
  return { update: noop, dispose: noop };
}
