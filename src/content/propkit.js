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

import {
  DISTRICT_CATALOGS, VISUAL_ARCHETYPES, resolveVisualArchetype,
} from './archetypes.js';
import { TRIM_UV } from './textures.js';

const DEFAULT_ACCENT = '#9aa3ad';

export function resolveVisualDescriptor(visualId, kind) {
  return resolveVisualArchetype(visualId, kind);
}

export const metroVariants = Object.freeze(Object.fromEntries(
  Object.entries(DISTRICT_CATALOGS).map(([metroId, districts]) => {
    const ids = [...new Set(Object.values(districts).flatMap((catalog) => Object.values(catalog.mixes).flat()))];
    return [metroId, Object.freeze(ids.map((id) => Object.freeze({
      key: id,
      name: VISUAL_ARCHETYPES[id].family.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    })))];
  }),
));

// --- Tier size step (art-direction.md §3, "keep it sacred") -----------------
// The 7 tiers MUST read as escalating silhouettes at a glance: each tier's
// nominal eat-gate radius is exactly 1.35x the previous tier's. This constant
// is the single source of truth — src/data/levels.js derives LEVEL_TEMPLATE's
// baseRadius values from TIER_RADII, and the logic suite asserts the step.
// Tier 0 starts at 14 so tiers 0 AND 1 are both edible at the level-1 spawn
// radius (avatar r=26, size gate 0.78 -> edible radius <= 20.28).
export const TIER_SIZE_STEP = 1.35;
export const TIER_BASE_RADIUS = 14;
export const TIER_COUNT = 7;
export const TIER_RADII = Array.from(
  { length: TIER_COUNT },
  (_, k) => Math.round(TIER_BASE_RADIUS * (TIER_SIZE_STEP ** k) * 10) / 10,
);

// Golden jackpot props: the exact tint main.js / districts.js mark them with.
// Mass stays base; the 8x bonus applies at eat-time (swallow.js
// GOLDEN_BONUS_MULTIPLIER) and V2 adds +10 coins each (formulas.js
// GOLDEN_COIN_BONUS, content-and-meta.md §4).
export const GOLDEN_TINT = '#ffd54a';

// --- Per-metro prop variants (content-and-meta.md §2) ------------------------
// One accessory variant per metro: a named reskin of an existing kind (tint
// and/or a small accessory mesh) so each metro gets 2-3 collectible prop
// reskins cheaply. Pure DATA — metros.js references these by key in its
// `propVariant` field; buildAccessory() below turns a part list into meshes.
// `size` semantics per shape: box [w,h,d]; cylinder [rTop,rBottom,h];
// cone [r,h]; sphere [r]. Positions are tuned to the host kind's DIMENSIONS.
export const PROP_ACCESSORIES = {
  // Harbor Metropolis — wharf bike with a rope crate on the rear rack.
  'rope-crate': {
    parts: [
      { shape: 'box', size: [0.6, 0.45, 0.6], position: [0, 1.35, -0.75], color: '#8a6d3b' },
    ],
  },
  // Le Vieux Continent — baguettes in a rear bike basket.
  'baguette-basket': {
    parts: [
      { shape: 'box', size: [0.5, 0.25, 0.9], position: [0, 1.15, -0.72], color: '#7a5c36' },
      { shape: 'cylinder', size: [0.09, 0.09, 0.85], position: [0.1, 1.35, -0.72], rotation: [1.15, 0, 0.15], color: '#e0b36a' },
      { shape: 'cylinder', size: [0.09, 0.09, 0.85], position: [-0.12, 1.35, -0.7], rotation: [1.2, 0, -0.1], color: '#d9a85c' },
    ],
  },
  // Old Fog Town — black cab (host prop gets tinted near-black) + roof sign.
  'cab-sign': {
    parts: [
      { shape: 'box', size: [0.55, 0.22, 0.32], position: [0, 1.72, -0.2], color: '#ffd54a' },
    ],
  },
  // Neon District — neon tuk-tuk canopy over a car silhouette.
  'tuktuk-canopy': {
    parts: [
      { shape: 'box', size: [2.1, 0.16, 2.4], position: [0, 1.78, -0.4], color: '#ff2e93' },
      { shape: 'cylinder', size: [0.06, 0.06, 0.9], position: [0.95, 1.35, -1.5], color: '#2ee6ff' },
      { shape: 'cylinder', size: [0.06, 0.06, 0.9], position: [-0.95, 1.35, -1.5], color: '#2ee6ff' },
    ],
  },
  // Desert Spires — gold-trimmed supercar stripe.
  'gold-trim': {
    parts: [
      { shape: 'box', size: [2.06, 0.14, 1.1], position: [0, 1.12, 0.9], color: '#f0c419' },
    ],
  },
  // Coliseum City — forum urn (lidded trash tier), travertine-tinted host.
  'urn-lid': {
    parts: [
      { shape: 'cone', size: [0.62, 0.55], position: [0, 1.15, 0], color: '#e8d5b0' },
    ],
  },
  // Carnival Coast — samba-float fringe on a bus.
  'samba-fringe': {
    parts: [
      { shape: 'box', size: [2.7, 0.35, 9.1], position: [0, 3.05, 0], color: '#ffd54a' },
      { shape: 'sphere', size: [0.5], position: [0, 3.45, 3.8], color: '#ff2e93' },
      { shape: 'sphere', size: [0.5], position: [0, 3.45, -3.8], color: '#2ee6ff' },
    ],
  },
  // Red Square Heights — snow-plow blade on a car.
  'plow-blade': {
    parts: [
      { shape: 'box', size: [2.3, 0.7, 0.18], position: [0, 0.45, 2.25], rotation: [-0.35, 0, 0], color: '#c0392b' },
    ],
  },
  // Harbor Opera Bay — surf rack on a bike.
  'surf-rack': {
    parts: [
      { shape: 'box', size: [0.16, 0.08, 2.4], position: [0.45, 1.5, 0], rotation: [0, 0, 0.1], color: '#00a4bd' },
    ],
  },
  // Capital Prime — Breeze courier drone light bar on a car.
  'breeze-light': {
    parts: [
      { shape: 'box', size: [1.2, 0.14, 0.3], position: [0, 1.72, 0.4], color: '#7a5cff' },
    ],
  },
};

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

  // Tagged so the instancing merge (mergedKindGeometry) knows THIS box carries
  // the realistic facade texture: its side faces keep their 0..1 box UVs while
  // every other part (window bands, setback, antenna) is mapped onto the
  // texture's trim swatch at TRIM_UV (see textures.js).
  base.userData.facade = true;
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

// Builds one accessory part (see PROP_ACCESSORIES) as a primitive mesh.
function buildAccessoryPart(THREE, part) {
  const material = standardMat(THREE, resolveColor(THREE, part.color), { roughness: 0.6, metalness: 0.15 });
  let geometry;
  switch (part.shape) {
    case 'box':
      geometry = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
      break;
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(part.size[0], part.size[1], part.size[2], 8);
      break;
    case 'cone':
      geometry = new THREE.ConeGeometry(part.size[0], part.size[1], 8);
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(part.size[0], 8, 6);
      break;
    default:
      geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(part.position[0], part.position[1], part.position[2]);
  if (part.rotation) mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
  return mesh;
}

// Attaches a named accessory (PROP_ACCESSORIES key) onto a built prop group.
function applyAccessory(group, THREE, accessoryKey) {
  const accessory = PROP_ACCESSORIES[accessoryKey];
  if (!accessory) return;
  for (const part of accessory.parts) {
    group.add(buildAccessoryPart(THREE, part));
  }
}

// `variant` (optional, V2 — content-and-meta.md §2): a metro prop reskin
// `{ tint?, accessory? }` from metros.js's `propVariant`. tint overrides the
// metro accent for this prop; accessory attaches a PROP_ACCESSORIES mesh set.
// Callers passing no variant get byte-identical V1 behavior.
export function createPropMesh(kind, THREE, accentColorHex, variant) {
  const accent = resolveColor(THREE, variant && variant.tint ? variant.tint : accentColorHex);
  let mesh;
  switch (kind) {
    case 'trash':
      mesh = buildTrash(THREE, accent);
      break;
    case 'bike':
      mesh = buildBike(THREE, accent);
      break;
    case 'car':
      mesh = buildCar(THREE, accent);
      break;
    case 'bus':
      mesh = buildBus(THREE, accent);
      break;
    case 'building-small':
      mesh = buildBuilding(THREE, accent, DIMENSIONS['building-small']);
      break;
    case 'building-medium':
      mesh = buildBuilding(THREE, accent, DIMENSIONS['building-medium'], { tiers: true });
      break;
    case 'building-large':
      mesh = buildBuilding(THREE, accent, DIMENSIONS['building-large'], { tiers: true });
      break;
    default: {
      // Defensive fallback for an unrecognized kind: a plain tinted box so
      // callers never get a throw for a typo'd/future kind string.
      const dim = { w: 2, h: 2, d: 2 };
      mesh = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h, dim.d), standardMat(THREE, accent));
      mesh.position.set(0, dim.h / 2, 0);
    }
  }
  if (variant && variant.accessory) applyAccessory(mesh, THREE, variant.accessory);
  return mesh;
}

// Adds one strong, low-poly silhouette cue to the sacred gameplay-tier base.
// The cue is baked into merged geometry, so it remains visible when instanced.
function applyVisualRecipe(group, THREE, descriptor, accent) {
  if (!descriptor || descriptor.recipe === 'base' || descriptor.family === 'legacy_fallback') return;
  const dim = DIMENSIONS[descriptor.gameplayKind] || DIMENSIONS.trash;
  const index = descriptor.recipeIndex || 0;
  const phase = (index % 5) / 5;
  const material = standardMat(THREE, shade(THREE, accent, 0.18 - phase * 0.12), {
    roughness: 0.62,
    metalness: descriptor.recipe === 'mast' ? 0.35 : 0.08,
  });
  let geometry;
  let position;
  switch (descriptor.recipe) {
    case 'cap':
      geometry = new THREE.ConeGeometry(dim.w * (0.24 + phase * 0.08), dim.h * 0.24, 6);
      position = [dim.w * 0.2, dim.h * 1.04, -dim.d * 0.12];
      break;
    case 'bar':
      geometry = new THREE.BoxGeometry(dim.w * 1.08, Math.max(0.12, dim.h * 0.09), dim.d * 0.2);
      position = [0, dim.h * 0.82, dim.d * 0.28];
      break;
    case 'mast':
      geometry = new THREE.CylinderGeometry(dim.w * 0.055, dim.w * 0.08, dim.h * 0.72, 6);
      position = [dim.w * 0.3, dim.h * 1.02, -dim.d * 0.22];
      break;
    case 'canopy':
      geometry = new THREE.BoxGeometry(dim.w * 1.12, Math.max(0.12, dim.h * 0.08), dim.d * 0.62);
      position = [0, dim.h * 1.08, -dim.d * 0.08];
      break;
    case 'spire':
      geometry = new THREE.ConeGeometry(dim.w * 0.2, dim.h * (0.3 + phase * 0.12), 7);
      position = [-dim.w * 0.18, dim.h * 1.12, dim.d * 0.08];
      break;
    case 'box':
    default:
      geometry = new THREE.BoxGeometry(
        dim.w * (0.24 + phase * 0.1),
        dim.h * (0.18 + phase * 0.08),
        dim.d * 0.28,
      );
      position = [dim.w * 0.24, dim.h * 0.88, -dim.d * 0.22];
      break;
  }
  const cue = new THREE.Mesh(geometry, material);
  cue.position.set(position[0], position[1], position[2]);
  cue.rotation.y = (index % 4) * Math.PI / 12;
  group.add(cue);
}

export function createVisualPropMesh(visualId, kind, THREE, accentColorHex) {
  const descriptor = resolveVisualArchetype(visualId, kind);
  const accent = resolveColor(THREE, accentColorHex);
  const group = createPropMesh(descriptor.gameplayKind, THREE, accentColorHex);
  applyVisualRecipe(group, THREE, descriptor, accent);
  group.userData.visualId = descriptor.id;
  group.userData.gameplayKind = descriptor.gameplayKind;
  return group;
}

// Real multi-part geometry for instancing (art-direction §3: "tier
// silhouettes ... keep it sacred" — the earlier single-box stand-in rendered
// every kind as an identical blue cube). Each kind's detailed builder (the
// createPropMesh switch above: boxes/cylinders/cones/spheres with per-part
// colors and transforms) is baked into ONE merged indexed BufferGeometry:
// part world matrices baked into positions/normals, part material colors into
// a per-vertex `color` attribute. The instanced material uses vertexColors,
// and THREE multiplies instanceColor ON TOP of the vertex colors, so the
// per-instance paths (brightness jitter, edibility tint, golden) keep working
// unchanged. Small local merge — no three/examples BufferGeometryUtils (B1:
// only the vendored core files exist).
const mergedGeometryCache = new Map(); // `${visualId}|${accent}|tex|plain` -> BufferGeometry

function mergedKindGeometry(THREE, kind, accentColorHex, visualId, opts = {}) {
  const descriptor = resolveVisualArchetype(visualId, kind);
  const key = `${descriptor.id}|${accentColorHex}|${opts.facadeTextured ? 'tex' : 'plain'}`;
  const cached = mergedGeometryCache.get(key);
  if (cached) return cached;

  const group = createVisualPropMesh(descriptor.id, kind, THREE, accentColorHex);
  group.updateMatrixWorld(true);

  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const white = new THREE.Color(1, 1, 1);

  group.traverse((node) => {
    if (!node.isMesh || !node.geometry || !node.geometry.attributes.position) return;
    const geo = node.geometry;
    const posAttr = geo.attributes.position;
    const normAttr = geo.attributes.normal;
    const color = (node.material && node.material.color) || white;
    // Facade-textured builds (textures.js): the tagged base box keeps its box
    // UVs on the SIDE faces (roof/ground faces and every other part sample
    // the texture's trim swatch) and its vertex color stays white so the
    // facade art shows true colors instead of being multiplied by the accent.
    const isFacade = opts.facadeTextured === true && node.userData.facade === true;
    const uvAttr = geo.attributes.uv || null;
    normalMatrix.getNormalMatrix(node.matrixWorld);
    for (let i = 0; i < posAttr.count; i += 1) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(node.matrixWorld);
      positions.push(v.x, v.y, v.z);
      if (normAttr) {
        n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize();
        normals.push(n.x, n.y, n.z);
      } else {
        normals.push(0, 1, 0);
      }
      if (isFacade) colors.push(1, 1, 1);
      else colors.push(color.r, color.g, color.b);
      if (isFacade && uvAttr && Math.abs(n.y) < 0.7) uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      else uvs.push(TRIM_UV[0], TRIM_UV[1]);
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i += 1) indices.push(geo.index.getX(i) + vertexOffset);
    } else {
      for (let i = 0; i < posAttr.count; i += 1) indices.push(i + vertexOffset);
    }
    vertexOffset += posAttr.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  // Note: instancing.js dispose() may dispose() this geometry at level
  // teardown — that only releases GPU buffers; the cached CPU-side data is
  // re-uploaded on next use, so the cache stays valid across levels.
  mergedGeometryCache.set(key, merged);
  return merged;
}

// Half-diagonal footprint radius of a kind's visual (from DIMENSIONS), so the
// integration layer can normalize a prop's render scale to its GAMEPLAY
// radius (TIER_RADII) — the eat gate and blob shadows are radius-derived, and
// the raw DIMENSIONS (1-45u) read as dust motes next to a 26u-radius avatar.
export function kindFootprintRadius(kind) {
  const dim = DIMENSIONS[kind] || { w: 2, h: 2, d: 2 };
  return Math.sqrt(dim.w * dim.w + dim.d * dim.d) / 2;
}

// Raw visual height of a kind (from DIMENSIONS) — metro signatures place
// rooflines/signage relative to it (multiplied by the prop's render scale).
export function kindHeight(kind) {
  const dim = DIMENSIONS[kind] || { w: 2, h: 2, d: 2 };
  return dim.h;
}

export function createInstancedPropField(kind, count, THREE, accentColorHex, opts = {}) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const descriptor = resolveVisualArchetype(opts.visualId, kind);
  const geometry = mergedKindGeometry(THREE, kind, accentColorHex, descriptor.id, {
    facadeTextured: !!opts.map,
  });
  // White base material: the real per-part colors live in the vertex colors;
  // instance colors multiply on top (jitter / edibility / golden).
  const material = standardMat(THREE, 0xffffff, { roughness: 0.7, metalness: 0.1 });
  material.vertexColors = true;
  // Realistic facade texture (textures.js, building kinds only): the merged
  // geometry's uv attribute maps the facade box's side faces onto the image
  // and everything else onto its trim swatch. Instance colors (jitter /
  // edibility / golden) still multiply on top, unchanged.
  if (opts.map) material.map = opts.map;

  const mesh = new THREE.InstancedMesh(geometry, material, safeCount);
  mesh.name = `props-${descriptor.id}${opts.golden ? '-golden' : ''}`;
  mesh.userData.visualId = descriptor.id;
  mesh.userData.gameplayKind = descriptor.gameplayKind;
  mesh.name = `prop-field:${kind}`;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(0, 0, 0);
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const jitterColor = new THREE.Color();
  const golden = opts.golden === true;

  for (let i = 0; i < safeCount; i += 1) {
    // Identity-ish placement at the origin. The caller (instancing.js) is
    // expected to overwrite each instance's matrix via setMatrixAt() once it
    // knows where in the world this instance should spawn. Initializing
    // every instance to a valid, finite matrix (rather than leaving THREE's
    // default all-zero instance matrix) guarantees no NaN/undefined ever
    // reads out of this mesh, even before a caller places it.
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);

    // Deterministic per-instance brightness jitter (not random, so results
    // are reproducible) so a field of identical props doesn't read as cloned.
    // Neutral grey for normal props (vertex colors carry the real palette);
    // gold for the golden group (the jackpot read).
    const j = 0.9 + 0.12 * (0.5 + 0.5 * Math.sin(i * 12.9898));
    if (golden) {
      jitterColor.set(GOLDEN_TINT).multiplyScalar(j + 0.15);
    } else {
      jitterColor.setRGB(j, j, j);
    }
    mesh.setColorAt(i, jitterColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return mesh;
}

export function visualGeometryFingerprint(visualId, kind, THREE, accentColorHex = DEFAULT_ACCENT) {
  const geometry = mergedKindGeometry(THREE, kind, accentColorHex, visualId);
  const position = geometry.getAttribute('position');
  const box = geometry.boundingBox || (geometry.computeBoundingBox(), geometry.boundingBox);
  let checksum = 0;
  for (let i = 0; i < position.count; i += 1) {
    checksum += position.getX(i) * 3 + position.getY(i) * 5 + position.getZ(i) * 7;
  }
  return {
    vertices: position.count,
    triangles: geometry.index ? geometry.index.count / 3 : position.count / 3,
    bounds: box ? [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z] : [],
    checksum: Math.round(checksum * 1e6) / 1e6,
  };
}
