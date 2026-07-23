// Procedural prop mesh kit: builds small/medium/large city clutter from
// primitive THREE geometries only (Box/Cylinder/Cone/Sphere), recolored per
// metro via an accent hex so each metro's props read as visually distinct.
//
// Shared-THREE pattern: THREE is always passed in explicitly by the caller
// (see src/engine/scene.js's header comment for the full rationale) — this
// module never does its own `import * as THREE from 'three'` and never
// touches document/window/localStorage at module top level, so a bare Node
// `import` of this file is always safe (no GPU/DOM required).
//
// Exact `kind` strings are a CONTRACT with src/data/levels.js's LEVEL_TEMPLATE
// — keep in sync: 'trash' | 'bike' | 'car' | 'bus' | 'building-small' |
// 'building-medium' | 'building-large'.

const DEFAULT_ACCENT = '#9aa3ad';

function resolveColor(THREE, hex) {
  const color = new THREE.Color();
  if (typeof hex === 'string' || typeof hex === 'number') {
    color.set(hex);
  } else {
    color.set(DEFAULT_ACCENT);
  }
  return color;
}

// A lighter/darker (and optionally more/less saturated) variant of a base
// color, by nudging it in HSL space — cheap way to get a believable palette
// (body/cabin/trim/glass) out of a single metro accent hex.
function shade(THREE, color, deltaL, deltaS = 0) {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const out = new THREE.Color();
  out.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s + deltaS)), Math.min(1, Math.max(0, hsl.l + deltaL)));
  return out;
}

function standardMat(THREE, color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

// Per-kind footprint/height in world units. Deliberately modest (props sit in
// the ~1-45 unit range) relative to the avatar's own radius() formula
// (26 + sqrt(mass)*1.9, see src/engine/avatar.js radius()) so a small/young
// avatar reads as dwarfed by a building-large while trash/bike read as
// plausibly swallowable early on. Every prop's local origin sits at its own
// base footprint center (y=0 is "on the ground"), not its geometric center,
// so placement code can drop it straight onto a ground plane.
const DIMENSIONS = {
  trash: { w: 1.1, h: 0.9, d: 1.1 },
  bike: { w: 0.55, h: 1.3, d: 1.8 },
  car: { w: 2.0, h: 1.5, d: 4.2 },
  bus: { w: 2.6, h: 3.0, d: 9.0 },
  'building-small': { w: 7, h: 11, d: 7 },
  'building-medium': { w: 11, h: 24, d: 11 },
  'building-large': { w: 15, h: 42, d: 15 },
};

function buildTrash(THREE, accent) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.trash;

  const bodyMat = standardMat(THREE, shade(THREE, accent, -0.1), { roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h, dim.d), bodyMat);
  body.position.set(0, dim.h / 2, 0);
  body.rotation.y = 0.35;
  group.add(body);

  // Squashed sphere "lid bulge" for a lumpy, non-perfectly-boxy silhouette.
  const lidMat = standardMat(THREE, shade(THREE, accent, 0.15), { roughness: 0.6 });
  const lid = new THREE.Mesh(new THREE.SphereGeometry(dim.w * 0.42, 8, 6), lidMat);
  lid.position.set(dim.w * 0.15, dim.h * 0.92, 0);
  lid.scale.set(1, 0.5, 1);
  group.add(lid);

  return group;
}

function buildBike(THREE, accent) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.bike;

  const frameMat = standardMat(THREE, accent, { metalness: 0.4, roughness: 0.5 });
  const wheelMat = standardMat(THREE, shade(THREE, accent, -0.35), { roughness: 0.8 });

  const wheelRadius = dim.h * 0.32;
  const wheelGeo = new THREE.TorusGeometry(wheelRadius, wheelRadius * 0.16, 6, 12);

  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rearWheel.position.set(0, wheelRadius, -dim.d * 0.32);
  rearWheel.rotation.y = Math.PI / 2;
  group.add(rearWheel);

  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.position.set(0, wheelRadius, dim.d * 0.32);
  frontWheel.rotation.y = Math.PI / 2;
  group.add(frontWheel);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h * 0.16, dim.d * 0.62), frameMat);
  frame.position.set(0, wheelRadius * 1.5, 0);
  group.add(frame);

  const seatPost = new THREE.Mesh(
    new THREE.CylinderGeometry(dim.w * 0.3, dim.w * 0.3, dim.h * 0.5, 6),
    frameMat
  );
  seatPost.position.set(0, wheelRadius * 2.1, -dim.d * 0.22);
  group.add(seatPost);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 1.8, dim.w * 0.3, dim.w * 0.3), frameMat);
  handle.position.set(0, wheelRadius * 2.3, dim.d * 0.3);
  group.add(handle);

  return group;
}

function buildWheel(THREE, radius, width, material) {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 10);
  const wheelMesh = new THREE.Mesh(geo, material);
  wheelMesh.rotation.z = Math.PI / 2;
  return wheelMesh;
}

function buildCar(THREE, accent) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.car;

  const bodyMat = standardMat(THREE, accent, { metalness: 0.35, roughness: 0.45 });
  const cabinMat = standardMat(THREE, shade(THREE, accent, 0.2), { metalness: 0.2, roughness: 0.3 });
  const wheelMat = standardMat(THREE, 0x141414, { roughness: 0.9 });

  const wheelRadius = dim.h * 0.26;
  const body = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h * 0.55, dim.d), bodyMat);
  body.position.set(0, wheelRadius + dim.h * 0.275, 0);
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.82, dim.h * 0.5, dim.d * 0.45), cabinMat);
  cabin.position.set(0, wheelRadius + dim.h * 0.55 + dim.h * 0.25, -dim.d * 0.05);
  group.add(cabin);

  const wheelPositions = [
    [dim.w / 2, wheelRadius, dim.d * 0.32],
    [-dim.w / 2, wheelRadius, dim.d * 0.32],
    [dim.w / 2, wheelRadius, -dim.d * 0.32],
    [-dim.w / 2, wheelRadius, -dim.d * 0.32],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = buildWheel(THREE, wheelRadius, dim.w * 0.18, wheelMat);
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  return group;
}

function buildBus(THREE, accent) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.bus;

  const bodyMat = standardMat(THREE, accent, { metalness: 0.25, roughness: 0.55 });
  const stripeMat = standardMat(THREE, shade(THREE, accent, 0.3), { roughness: 0.4 });
  const wheelMat = standardMat(THREE, 0x141414, { roughness: 0.9 });

  const wheelRadius = dim.h * 0.16;
  const body = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h - wheelRadius, dim.d), bodyMat);
  body.position.set(0, wheelRadius + (dim.h - wheelRadius) / 2, 0);
  group.add(body);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 1.01, dim.h * 0.18, dim.d * 1.01), stripeMat);
  stripe.position.set(0, wheelRadius + dim.h * 0.5, 0);
  group.add(stripe);

  const wheelZs = [dim.d * 0.34, dim.d * 0.02, -dim.d * 0.34];
  for (const z of wheelZs) {
    for (const x of [dim.w / 2, -dim.w / 2]) {
      const wheel = buildWheel(THREE, wheelRadius, dim.w * 0.16, wheelMat);
      wheel.position.set(x, wheelRadius, z);
      group.add(wheel);
    }
  }

  return group;
}

function buildBuilding(THREE, accent, dim, opts = {}) {
  const group = new THREE.Group();

  const wallMat = standardMat(THREE, accent, { roughness: 0.85, metalness: 0.05 });
  const windowColor = shade(THREE, accent, 0.35);
  const windowMat = standardMat(THREE, windowColor, {
    roughness: 0.3,
    metalness: 0.1,
    emissive: windowColor,
    emissiveIntensity: 0.15,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h, dim.d), wallMat);
  base.position.set(0, dim.h / 2, 0);
  group.add(base);

  // Window band(s): thin, slightly larger boxes tinted lighter/emissive so
  // the facade reads as glazed rather than a flat block.
  const bandCount = opts.tiers ? 3 : 1;
  for (let i = 0; i < bandCount; i += 1) {
    const t = (i + 1) / (bandCount + 1);
    const band = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 1.02, dim.h * 0.08, dim.d * 1.02), windowMat);
    band.position.set(0, dim.h * t, 0);
    group.add(band);
  }

  if (opts.tiers) {
    const setbackH = dim.h * 0.22;
    const setback = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.6, setbackH, dim.d * 0.6), wallMat);
    setback.position.set(0, dim.h + setbackH / 2, 0);
    group.add(setback);

    const antennaH = dim.h * 0.25;
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(dim.w * 0.03, dim.w * 0.03, antennaH, 6),
      standardMat(THREE, 0x8a8f96, { metalness: 0.6, roughness: 0.4 })
    );
    antenna.position.set(0, dim.h + setbackH + antennaH / 2, 0);
    group.add(antenna);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(dim.w * 0.05, 6, 6),
      standardMat(THREE, 0xff3b30, { emissive: 0xff3b30, emissiveIntensity: 1 })
    );
    beacon.position.set(0, dim.h + setbackH + antennaH, 0);
    group.add(beacon);
  }

  return group;
}

export function createPropMesh(kind, THREE, accentColorHex) {
  const accent = resolveColor(THREE, accentColorHex);
  switch (kind) {
    case 'trash':
      return buildTrash(THREE, accent);
    case 'bike':
      return buildBike(THREE, accent);
    case 'car':
      return buildCar(THREE, accent);
    case 'bus':
      return buildBus(THREE, accent);
    case 'building-small':
      return buildBuilding(THREE, accent, DIMENSIONS['building-small']);
    case 'building-medium':
      return buildBuilding(THREE, accent, DIMENSIONS['building-medium'], { tiers: true });
    case 'building-large':
      return buildBuilding(THREE, accent, DIMENSIONS['building-large'], { tiers: true });
    default: {
      // Defensive fallback for an unrecognized kind: a plain tinted box so
      // callers never get a throw for a typo'd/future kind string.
      const dim = { w: 2, h: 2, d: 2 };
      const fallbackMesh = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h, dim.d), standardMat(THREE, accent));
      fallbackMesh.position.set(0, dim.h / 2, 0);
      return fallbackMesh;
    }
  }
}

// Simplified single-geometry stand-ins used for instancing. Real-time crowds
// of hundreds of identical props (trash/bikes/cars especially — see
// LEVEL_TEMPLATE baseCount in src/data/levels.js, up to 42 per tier per
// level) need one draw call per kind, so the instanced variant trades
// createPropMesh's multi-part detail for a single representative box
// silhouette sized the same as the detailed prop's overall footprint.
function representativeGeometry(THREE, kind) {
  const dim = DIMENSIONS[kind] || { w: 2, h: 2, d: 2 };
  switch (kind) {
    case 'bike':
      return { geometry: new THREE.BoxGeometry(dim.w * 1.4, dim.h * 0.7, dim.d), dim };
    case 'car':
    case 'bus':
      return { geometry: new THREE.BoxGeometry(dim.w, dim.h * 0.75, dim.d), dim };
    default:
      return { geometry: new THREE.BoxGeometry(dim.w, dim.h, dim.d), dim };
  }
}

export function createInstancedPropField(kind, count, THREE, accentColorHex) {
  const accent = resolveColor(THREE, accentColorHex);
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const { geometry, dim } = representativeGeometry(THREE, kind);
  const material = standardMat(THREE, accent, { roughness: 0.7, metalness: 0.1 });

  const mesh = new THREE.InstancedMesh(geometry, material, safeCount);
  mesh.name = `prop-field:${kind}`;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(0, dim.h / 2, 0);
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const baseHsl = { h: 0, s: 0, l: 0 };
  accent.getHSL(baseHsl);
  const jitterColor = new THREE.Color();

  for (let i = 0; i < safeCount; i += 1) {
    // Identity-ish placement at the origin, resting on the ground plane. The
    // caller (level/scene assembly — out of this module's scope) is expected
    // to overwrite each instance's matrix via setMatrixAt() once it knows
    // where in the world this instance should spawn. Initializing every
    // instance to a valid, finite matrix (rather than leaving THREE's
    // default all-zero instance matrix) guarantees no NaN/undefined ever
    // reads out of this mesh, even before a caller places it.
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);

    // Slight deterministic per-instance lightness jitter (not random, so
    // results are reproducible) so a field of hundreds of identical props
    // doesn't read as visibly cloned.
    const l = Math.min(1, Math.max(0, baseHsl.l + 0.06 * Math.sin(i * 12.9898)));
    jitterColor.setHSL(baseHsl.h, baseHsl.s, l);
    mesh.setColorAt(i, jitterColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return mesh;
}
