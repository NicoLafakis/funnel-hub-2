// Destruction / swallow debris FX.
//
// Before this existed, devouring a 42-unit glass tower and devouring a paper
// cup were the same event on screen: the mesh was removed and that was it.
// This module turns a big-structure swallow into an actual demolition — a
// burst of chunks in the STRUCTURE'S OWN COLORS that flies outward and up,
// falls under gravity, tumbles, and shrinks away.
//
// -----------------------------------------------------------------------------
// DESIGN CONSTRAINTS (all four are load-bearing, do not "simplify" them away)
// -----------------------------------------------------------------------------
// 1. POOLED AND HARD-CAPPED. One InstancedMesh, one geometry, one material,
//    `capacity` particle records allocated up front and then reused forever.
//    A 25-eat combo chain through a downtown block must not allocate, must not
//    grow a buffer, and must not add draw calls. When every slot is live, the
//    OLDEST particle is recycled (FIFO via a ring cursor) — the burst you just
//    triggered always shows, it just eats the tail of an older one.
// 2. COLOR COMES FROM THE PROP. samplePropPalette() reads the swallowed
//    object's own materials, so brick shatters brown, glass shards come out
//    blue (and get a brightness gain because they were shiny), concrete grey.
//    One generic puff for everything is exactly what this replaces.
// 3. NO GPU, NO DOM. THREE is dependency-injected, nothing browser-only is
//    touched at module top level, and update()/burst() are pure state math on
//    plain numbers — so the whole thing is import()-able and unit-testable
//    headlessly in plain Node.
// 4. FULLY DISPOSABLE. dispose() releases the geometry and material and
//    detaches the mesh; clear() parks every live particle without releasing
//    anything. src/main.js creates ONE system at bootstrap (parented to the
//    engine scene, NOT to the per-level root, so level teardown can neither
//    dispose it nor leak it) and calls clear() at the start of every level
//    build so last level's rubble never hangs over the next one.

// Props at or above this template tier index get a debris burst. Tier 5 is
// 'building-medium' and tier 6 'building-large' (see LEVEL_TEMPLATE in
// src/data/levels.js) — i.e. "a building came down", not "a car vanished".
export const DEBRIS_TIER_MIN = 5;

// The concrete prop kinds that sit at tier 5+. The city layout re-skins those
// two template slots as 'apartment'/'office' (src/content/citylayout.js), and
// metro variants keep the kind string of the slot they fill, so this list
// stays correct as new metro skins are added.
export const DEBRIS_KINDS = ['building-medium', 'building-large', 'apartment', 'office'];

// Ceiling on live particles across the whole game. Sized so the worst
// realistic case — a combo chain demolishing a whole downtown block — stays
// inside one instanced draw call with room to spare.
export const DEFAULT_CAPACITY = 260;

// Ceiling on a SINGLE burst, so one enormous prop cannot flush the entire pool
// and erase every other burst on screen.
export const MAX_PARTICLES_PER_BURST = 26;

const DEFAULT_GRAVITY = 300;
const GROUND_RESTITUTION = 0.32;
const GROUND_FRICTION = 0.7;
const FALLBACK_COLOR = { r: 0.55, g: 0.55, b: 0.56, glint: false };

/**
 * Should swallowing this prop shake loose a debris burst?
 * Accepts the prop RECORD src/main.js keeps (kind/tierIndex/isCapstone), not a
 * mesh, so the decision never depends on scene-graph shape.
 */
export function isDebrisWorthy(prop) {
  if (!prop) return false;
  if (prop.isCapstone) return true;
  if (Number.isFinite(prop.tierIndex) && prop.tierIndex >= DEBRIS_TIER_MIN) return true;
  return DEBRIS_KINDS.indexOf(prop.kind) !== -1;
}

/**
 * Reads a prop's own materials into a small debris palette.
 *
 * Returns plain `{ r, g, b, glint }` records (0..1 linear channels, matching
 * THREE.Color) rather than THREE.Color instances — no THREE needed, nothing to
 * dispose, and the pool can hold them without allocating per particle.
 *
 * `glint` marks a shiny source (low roughness or metallic): those samples get
 * a brightness gain so a glass curtain wall throws bright shards instead of
 * dull blue cubes, while a rough brick wall keeps its flat brown.
 *
 * Materials are de-duplicated by uuid, because a building box shares one
 * material across four faces and we want the SET of colors on the object, not
 * the same wall color six times.
 */
export function samplePropPalette(object3D, maxSamples = 6) {
  const out = [];
  if (!object3D || typeof object3D.traverse !== 'function') return out;

  const seen = new Set();
  object3D.traverse((node) => {
    if (out.length >= maxSamples) return;
    if (!node || !node.isMesh) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of mats) {
      if (out.length >= maxSamples) break;
      if (!m || !m.color) continue;
      const key = m.uuid || `${m.color.r},${m.color.g},${m.color.b}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const roughness = typeof m.roughness === 'number' ? m.roughness : 1;
      const metalness = typeof m.metalness === 'number' ? m.metalness : 0;
      const glint = metalness >= 0.3 || roughness <= 0.3;
      const gain = glint ? 1.3 : 1;
      out.push({
        r: Math.min(1, m.color.r * gain),
        g: Math.min(1, m.color.g * gain),
        b: Math.min(1, m.color.b * gain),
        glint,
      });
    }
  });

  return out;
}

/**
 * Creates the pooled debris system.
 *
 * @param {object} THREE - injected THREE namespace (see src/engine/scene.js).
 * @param {object} [opts]
 * @param {object} [opts.parent]   - Object3D to attach the pool mesh to. Should
 *   be the persistent engine scene, never a per-level root.
 * @param {number} [opts.capacity] - hard ceiling on live particles.
 * @param {number} [opts.gravity]  - world units/s^2.
 */
export function createDebrisSystem(THREE, opts = {}) {
  const capacity = Math.max(1, Math.floor(opts.capacity || DEFAULT_CAPACITY));
  const gravity = Number.isFinite(opts.gravity) && opts.gravity > 0 ? opts.gravity : DEFAULT_GRAVITY;
  const random = typeof opts.random === 'function' ? opts.random : Math.random;

  // ONE geometry + ONE material + ONE InstancedMesh for the entire game. A unit
  // box is deliberate: per-particle non-uniform scale turns the same cube into
  // chunky rubble or thin glass slivers, so a second geometry buys nothing.
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.12 });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'debris-pool';
  // Particles fly well outside the pool's construction-time bounds, and the
  // bounding sphere is never recomputed, so culling would pop the whole burst.
  mesh.frustumCulled = false;
  mesh.count = 0;

  // Allocate the instanceColor buffer once, up front — setColorAt() is what
  // creates it, and doing it lazily mid-burst would allocate during gameplay.
  const initColor = new THREE.Color(1, 1, 1);
  for (let i = 0; i < capacity; i += 1) mesh.setColorAt(i, initColor);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  if (opts.parent && typeof opts.parent.add === 'function') opts.parent.add(mesh);

  // Fixed-size particle records. Never grown, never replaced, only reset.
  const particles = new Array(capacity);
  for (let i = 0; i < capacity; i += 1) {
    particles[i] = {
      active: false,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      rx: 0, ry: 0, rz: 0,
      sx: 1, sy: 1, sz: 1,
      spinX: 0, spinY: 0, spinZ: 0,
      life: 0, maxLife: 1,
      r: 1, g: 1, b: 1,
    };
  }

  let activeCount = 0;
  let cursor = 0; // FIFO ring cursor — allocation order == recycle order
  let disposed = false;

  const scratchMatrix = new THREE.Matrix4();
  const scratchPos = new THREE.Vector3();
  const scratchQuat = new THREE.Quaternion();
  const scratchEuler = new THREE.Euler();
  const scratchScale = new THREE.Vector3();
  const scratchColor = new THREE.Color();

  // Returns a slot to write into. Prefers a free slot; when the pool is full it
  // reclaims the one at the cursor, which — because the cursor only ever
  // advances on allocation — is the oldest live particle. This is the hard cap:
  // there is no path here that creates a particle record.
  function allocate() {
    for (let i = 0; i < capacity; i += 1) {
      const idx = (cursor + i) % capacity;
      if (!particles[idx].active) {
        cursor = (idx + 1) % capacity;
        activeCount += 1;
        return particles[idx];
      }
    }
    const recycled = particles[cursor];
    cursor = (cursor + 1) % capacity;
    return recycled; // already active — activeCount is unchanged, by definition
  }

  /**
   * Spawns one burst.
   *
   * @param {object} source
   * @param {{x:number,y:number,z:number}} source.position - burst origin.
   * @param {object} [source.object3D] - the prop's mesh, sampled for color.
   *   MUST be passed before the caller disposes it.
   * @param {Array}  [source.palette]  - pre-sampled palette, overrides object3D.
   * @param {number} [source.radius]   - the prop's swallow radius; drives chunk
   *   size, spread and speed so a tower throws more, bigger, faster debris than
   *   a mid-rise.
   * @param {number} [source.count]    - override particle count (still capped).
   * @returns {number} particles actually spawned.
   */
  function burst(source) {
    if (disposed || !source) return 0;

    const pos = source.position || { x: 0, y: 0, z: 0 };
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return 0;

    const radius = Number.isFinite(source.radius) && source.radius > 0
      ? Math.min(400, source.radius)
      : 40;

    let palette = Array.isArray(source.palette) && source.palette.length
      ? source.palette
      : samplePropPalette(source.object3D);
    if (!palette.length) palette = [FALLBACK_COLOR];

    const requested = Number.isFinite(source.count)
      ? Math.floor(source.count)
      : Math.round(9 + radius * 0.22);
    const count = Math.max(1, Math.min(MAX_PARTICLES_PER_BURST, requested));

    for (let i = 0; i < count; i += 1) {
      const p = allocate();
      const swatch = palette[Math.floor(random() * palette.length) % palette.length] || FALLBACK_COLOR;

      // Start scattered through the prop's own footprint and lower half, so
      // the burst reads as the STRUCTURE coming apart rather than a puff
      // emitted from a single point.
      const spawnAngle = random() * Math.PI * 2;
      const spawnDist = random() * radius * 0.45;
      p.x = pos.x + Math.cos(spawnAngle) * spawnDist;
      p.z = pos.z + Math.sin(spawnAngle) * spawnDist;
      p.y = (Number.isFinite(pos.y) ? pos.y : 0) + radius * (0.1 + random() * 0.7);

      // Outward in XZ + a strong upward kick; gravity does the rest.
      const outAngle = random() * Math.PI * 2;
      const outSpeed = radius * (1.2 + random() * 1.4);
      p.vx = Math.cos(outAngle) * outSpeed;
      p.vz = Math.sin(outAngle) * outSpeed;
      p.vy = radius * (2.2 + random() * 1.8);

      // Glass throws thin slivers, masonry throws chunks.
      const base = radius * (0.09 + random() * 0.12);
      p.sx = base * (swatch.glint ? 0.35 + random() * 0.4 : 0.7 + random() * 0.6);
      p.sy = base * (swatch.glint ? 1.1 + random() * 0.7 : 0.7 + random() * 0.6);
      p.sz = base * (swatch.glint ? 0.3 + random() * 0.35 : 0.7 + random() * 0.6);

      p.rx = random() * Math.PI * 2;
      p.ry = random() * Math.PI * 2;
      p.rz = random() * Math.PI * 2;
      p.spinX = (random() - 0.5) * 9;
      p.spinY = (random() - 0.5) * 9;
      p.spinZ = (random() - 0.5) * 9;

      p.maxLife = 0.85 + random() * 0.75;
      p.life = p.maxLife;
      p.r = swatch.r;
      p.g = swatch.g;
      p.b = swatch.b;
      p.active = true;
    }

    return count;
  }

  /**
   * Advances every live particle one frame and rewrites the instance buffers.
   *
   * Live particles are COMPACTED into the first `k` instance slots and
   * `mesh.count` is set to k, so the GPU only ever touches what is alive —
   * dead slots cost nothing, and the buffers themselves never change size.
   */
  function update(dt) {
    if (disposed) return 0;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(0.1, dt) : 0;

    let k = 0;
    for (let i = 0; i < capacity; i += 1) {
      const p = particles[i];
      if (!p.active) continue;

      if (step > 0) {
        p.life -= step;
        if (p.life <= 0) {
          p.active = false;
          activeCount -= 1;
          continue;
        }

        p.vy -= gravity * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.z += p.vz * step;

        // Ground contact: a damped bounce, then it skids and settles. Debris
        // that sinks through the road reads as a bug, so this is not optional.
        const rest = p.sy * 0.5;
        if (p.y < rest) {
          p.y = rest;
          if (p.vy < 0) p.vy = -p.vy * GROUND_RESTITUTION;
          p.vx *= GROUND_FRICTION;
          p.vz *= GROUND_FRICTION;
          p.spinX *= GROUND_FRICTION;
          p.spinZ *= GROUND_FRICTION;
        }

        p.rx += p.spinX * step;
        p.ry += p.spinY * step;
        p.rz += p.spinZ * step;
      }

      // Fade out by shrinking AND darkening: a single opaque material can't
      // fade per instance, but instanceColor can, and shrink-to-nothing sells
      // the rest.
      const t = Math.max(0, Math.min(1, p.life / p.maxLife));
      const fade = 0.35 + 0.65 * t;

      scratchPos.set(p.x, p.y, p.z);
      scratchEuler.set(p.rx, p.ry, p.rz);
      scratchQuat.setFromEuler(scratchEuler);
      scratchScale.set(p.sx * fade, p.sy * fade, p.sz * fade);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      mesh.setMatrixAt(k, scratchMatrix);

      scratchColor.setRGB(p.r * fade, p.g * fade, p.b * fade);
      mesh.setColorAt(k, scratchColor);
      k += 1;
    }

    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return k;
  }

  // Parks every particle without releasing a single GPU resource — the pool is
  // immediately reusable. This is what a level teardown calls.
  function clear() {
    for (let i = 0; i < capacity; i += 1) particles[i].active = false;
    activeCount = 0;
    cursor = 0;
    mesh.count = 0;
    return 0;
  }

  // Releases the pool's geometry + material and detaches the mesh. Idempotent;
  // every entry point above no-ops afterwards.
  function dispose() {
    if (disposed) return;
    clear();
    if (mesh.parent) mesh.parent.remove(mesh);
    if (geometry && typeof geometry.dispose === 'function') geometry.dispose();
    if (material && typeof material.dispose === 'function') material.dispose();
    disposed = true;
  }

  return {
    object3D: mesh,
    burst,
    update,
    clear,
    dispose,
    get capacity() { return capacity; },
    get activeCount() { return activeCount; },
    get disposed() { return disposed; },
    // Exposed for tests/debugging only — gameplay code must go through burst().
    get particles() { return particles; },
  };
}
