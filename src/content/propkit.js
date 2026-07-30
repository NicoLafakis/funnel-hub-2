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
// 'building-medium' | 'building-large'. Three more kinds live outside the
// template tiers: 'tree' | 'person' | 'streetlamp' — the shared street-prop
// food chain (src/data/levels.js STREET_PROP_TIERS, src/content/archetypes.js
// STREET_PROP_KINDS). Their per-variant identity colors arrive via the
// descriptor's `tint`/`flavor` fields (see createVisualPropMesh), not via the
// metro accent.

import {
  DISTRICT_CATALOGS, VISUAL_ARCHETYPES, resolveVisualArchetype,
} from './archetypes.js';
import { TRIM_UV } from './textures.js';
import { PROP_MODELS } from './modelkit.js';
import { mulberry32, hashStr } from '../data/seeds.js';

const DEFAULT_ACCENT = '#9aa3ad';

// Blender prop pack (modelkit.js): decoded BufferGeometries injected once at
// boot by main.js via setModelKit(). Null = procedural bakes everywhere (the
// silent fallback when assets/models/ is missing, e.g. tests/headless).
let blenderModelKit = null;
export function setModelKit(kit) {
  blenderModelKit = kit || null;
}

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

// --- Per-metro pastel palette (Hole.io-style per-prop hue variety) -----------
// Derives `count` companion hues from the metro accent: seeded hue rotations
// around the accent (entry 0 keeps the accent hue so the metro's identity
// survives), pushed to candy-pastel lightness (~0.6-0.75) with mid-high
// saturation. Seeded via mulberry32 — same (accent, seed) ⇒ identical palette
// in every browser; instancing.js picks per-instance colors from this.
const PALETTE_HUE_SPREAD = [0, 0.09, -0.09, 0.18, -0.18, 0.5];

// Kinds whose instanced geometry bakes with a neutral white accent so
// per-instance palette picks (instancing.js) carry the full body hue.
// Small clutter (trash, bikes) keeps accent-derived vertex colors.
// Kinds that bake WHITE vertex colors so the per-instance pastel palette pick
// becomes their body colour (instancing.js `set()`).
//
// trash and bike were left out, so they baked the metro ACCENT into their
// vertex colours instead — and since they are the two most numerous kinds
// (126 + 90 on level 1), every scene came out dominated by one hue: metro 1's
// accent is #3fa9f5, and the spawn ring is nothing but blue crates and blue
// bikes. The reference has no such uniformity; its street clutter is as varied
// as its buildings. Trees, pedestrians and lamps stay out of this set on
// purpose — they carry their own identity tints from archetypes.js, which is
// why a tree must stay green in every metro.
export const PALETTE_BASE_KINDS = new Set([
  'building-small', 'building-medium', 'building-large', 'car', 'bus',
  'trash', 'bike',
]);

// Fixed DETAIL colors for palette-base (white) bakes: glass/trim must stay
// non-white or a pastel instance hue x white detail renders as a flat slab
// with zero window contrast. Chosen so (any pastel pick) x (fixed tint)
// still reads as cool glass / dark trim against the body hue.
const PALETTE_GLASS_TINT = '#7190a1'; // readable blue-grey window glass
const PALETTE_TRIM_TINT = '#72777a'; // neutral rooftop / facade trim

// 0011 task 7 (Route A): the Blender-authored paint bands whose albedo
// renders near-black (R1b), as the exact linear triples shipped in
// assets/models/*.js, and their lift targets — the linear forms of
// PALETTE_GLASS_TINT / PALETTE_TRIM_TINT above.
const AUTHORED_BAND_LIFT = [
  { from: [0.0396, 0.0666, 0.1119], to: [0.164, 0.278, 0.356], band: 'doorGlass' }, // DOOR_GLASS #38495e
  { from: [0.114, 0.147, 0.195], to: [0.168, 0.185, 0.194], band: 'trim' }, // TRIM #5f6b7a
];
function liftAuthoredBand(r, g, b) {
  for (const band of AUTHORED_BAND_LIFT) {
    if (Math.abs(r - band.from[0]) < 0.004 && Math.abs(g - band.from[1]) < 0.004
      && Math.abs(b - band.from[2]) < 0.004) return band;
  }
  return null;
}

const CHICAGO_BUILDING_PALETTE = Object.freeze([
  '#b97860', // sunlit red Chicago brick
  '#c9906b', // warm masonry
  '#d0ad7e', // buff limestone
  '#d0cbc0', // pale stone/concrete
  '#b9ad96', // weathered limestone
  '#7096a0', // blue-green curtain wall
  '#87989d', // steel-grey glass
]);
const CHICAGO_VEHICLE_PALETTE = Object.freeze([
  '#d9d9d3', '#d2a229', '#b94337', '#3f7398', '#4f765c', '#756585',
]);

// City identity may replace the generic accent-derived candy palette without
// changing geometry, draw grouping, or deterministic instance assignment.
const CHICAGO_IDENTITY_COLORS = Object.freeze({
  cityobj_chicago_willis_tower: '#56616a',
  cityobj_chicago_cna_center_big_red: '#b9473c',
  cityobj_chicago_marina_city_tower_pair: '#918b75',
  cityobj_chicago_wrigley_building: '#d6cdb9',
  cityobj_chicago_tribune_tower: '#bbb19b',
  cityobj_chicago_chicago_theatre: '#b87861',
});

export function chicagoIdentityColor(THREE, visualId) {
  const hex = CHICAGO_IDENTITY_COLORS[visualId];
  return hex ? new THREE.Color(hex) : null;
}

export function cityPalette(THREE, cityId, kind, fallback = null, visualId = null) {
  if (cityId !== 'chicago-loop') return fallback;
  if (CHICAGO_IDENTITY_COLORS[visualId]) {
    return [new THREE.Color(CHICAGO_IDENTITY_COLORS[visualId])];
  }
  const source = kind && kind.startsWith('building')
    ? CHICAGO_BUILDING_PALETTE
    : kind === 'car' || kind === 'bus'
      ? CHICAGO_VEHICLE_PALETTE
      : null;
  return source ? source.map((hex) => new THREE.Color(hex)) : fallback;
}

export function metroPalette(THREE, accentColorHex, seed, count = 6) {
  const base = resolveColor(THREE, accentColorHex);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const rng = mulberry32(
    (typeof seed === 'number' ? seed >>> 0 : hashStr(String(accentColorHex))) >>> 0,
  );
  const palette = [];
  for (let i = 0; i < count; i += 1) {
    const h = (hsl.h + PALETTE_HUE_SPREAD[i % PALETTE_HUE_SPREAD.length]
      + (rng() - 0.5) * 0.05 + 1) % 1;
    const s = Math.min(0.8, Math.max(0.45, hsl.s + (rng() - 0.5) * 0.15));
    const l = 0.6 + rng() * 0.15;
    palette.push(new THREE.Color().setHSL(h, s, l));
  }
  return palette;
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
// Heights are authored so that `h * kindRenderScale()` lands on the kind's
// TRUE metric height at WORLD_UNITS_PER_METRE (see the table below the
// dimensions). Height never feeds kindFootprintRadius, so tuning it is free:
// it moves no gameplay quantity at all.
const DIMENSIONS = {
  trash: { w: 1.1, h: 0.77, d: 1.1 },
  bike: { w: 0.55, h: 0.84, d: 1.8 },
  car: { w: 2.0, h: 1.5, d: 4.2 },
  bus: { w: 2.6, h: 3.83, d: 9.0 },
  'building-small': { w: 7, h: 11, d: 7 },
  'building-medium': { w: 11, h: 24, d: 11 },
  'building-large': { w: 15, h: 42, d: 15 },
  // Street-prop food chain (tier-0 snacks, spawn-edible — Hole.io staples).
  tree: { w: 2.4, h: 5.33, d: 2.4 },
  person: { w: 0.5, h: 0.98, d: 0.35 },
  streetlamp: { w: 1.4, h: 4.65, d: 0.6 },
};

// --- ART SCALE vs GAMEPLAY SCALE ---------------------------------------------
// `kindFootprintRadius` normalises a prop's mesh to its GAMEPLAY radius, and
// the gameplay radius is a DIFFICULTY quantity: TIER_RADII steps a sacred
// 1.35x per tier (art-direction.md §3). The authored DIMENSIONS do NOT step
// 1.35x, so that single normalisation silently forces a DIFFERENT
// units-per-metre onto every kind. Measured before this split: 7.34 u/m for a
// bus against 26.22 u/m for a pedestrian — a 3.6x spread, with these visible
// consequences:
//
//   * the tier-3 BUS rendered NARROWER than the tier-2 car (19.1u vs 21.9u);
//   * a street TREE only 1.43x a pedestrian's height (a shrub, not a tree);
//   * no relationship whatsoever between a vehicle's width and its lane.
//
// The fix is a seam, not a rescale. `kindRenderScale()` is the ART quantity
// and is the ONLY thing that drives mesh scale; `radius` stays the gameplay
// quantity and still drives the eat gate, the mass ledger and the 1.35x
// ladder. Nothing below changes what is edible when.
//
// WORLD_UNITS_PER_METRE is set from the road, which is the one dimension the
// whole city has to agree with: streets are clamp(world*0.032, 36, 80) units
// wide across every level (measured 77.3-80.0u), carrying two lanes, so one
// 3.5m lane is ~38.6u and 1m ~= 11.0u.
export const WORLD_UNITS_PER_METRE = 11.0;

// Per-kind correction from the gameplay-normalised scale toward metric truth.
// CLAMPED to +-25%: a prop rendered far from its gameplay radius stops
// reading its own edibility tier, and edibility legibility outranks metric
// purity. Every value below is the clamped metric-true correction
// (WORLD_UNITS_PER_METRE / gameplay-normalised u/m), so each is either exact
// or sitting on a clamp rail — see 00-findings.md §8 defect 3 for the
// residual conflict this clamp encodes.
export const RENDER_SCALE_CLAMP = 0.25;
const RENDER_SCALE_CORRECTION = {
  trash: 0.75,            // metric wants 0.61 — clamped
  bike: 0.75,             // metric wants 0.55 — clamped
  car: 1.00,              // exact: the anchor kind
  bus: 1.25,              // metric wants 1.50 — clamped
  'building-small': 1.17, // exact
  'building-medium': 1.25, // metric wants 1.36 — clamped
  'building-large': 1.25, // metric wants 1.38 — clamped
  tree: 1.25,             // metric wants 1.33 — clamped
  person: 0.75,           // metric wants 0.42 — clamped
  streetlamp: 0.75,       // metric wants 0.70 — clamped
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

function buildCar(THREE, accent, opts = {}) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.car;

  const bodyMat = standardMat(THREE, accent, { metalness: 0.35, roughness: 0.45 });
  const cabinMat = standardMat(THREE, opts.paletteBase
    ? resolveColor(THREE, PALETTE_GLASS_TINT)
    : shade(THREE, accent, 0.2), { metalness: 0.2, roughness: 0.3 });
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

function buildBus(THREE, accent, opts = {}) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.bus;

  const bodyMat = standardMat(THREE, accent, { metalness: 0.25, roughness: 0.55 });
  const stripeMat = standardMat(THREE, opts.paletteBase
    ? resolveColor(THREE, PALETTE_GLASS_TINT)
    : shade(THREE, accent, 0.3), { roughness: 0.4 });
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
  const windowColor = opts.paletteBase
    ? resolveColor(THREE, PALETTE_GLASS_TINT)
    : shade(THREE, accent, 0.35);
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

  // Street-level door: a proud darker box on the front (+z) face — the third
  // value step (wall / glass / trim) that keeps small tier-less buildings
  // readable under any palette hue, Hole.io-style.
  const doorColor = opts.paletteBase
    ? resolveColor(THREE, PALETTE_TRIM_TINT)
    : shade(THREE, accent, -0.2);
  const doorH = dim.h * 0.3;
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(dim.w * 0.22, doorH, 0.12),
    standardMat(THREE, doorColor, { roughness: 0.6, metalness: 0.05 }),
  );
  door.position.set(0, doorH / 2, dim.d / 2 + 0.03);
  group.add(door);

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

// --- Street-prop builders (tree / person / streetlamp) -----------------------
// Unlike the template tiers, these ignore the metro accent for identity: the
// shared street archetypes carry their own `tint` (canopy / shirt / pole
// color — see archetypes.js STREET_PROP_CATALOG), which arrives here as the
// resolved `accent`. Trunk/skin/bulb colors are fixed so the food chain reads
// the same in every metro, exactly like the Hole.io references.

// `flavor` picks the canopy silhouette: 'blob' (round park tree), 'cone'
// (stacked-cone pine), 'lollipop' (tall trunk + ball). Missing/unknown
// flavors fall back to 'blob'.
function buildTree(THREE, accent, flavor) {
  const group = new THREE.Group();
  const trunkMat = standardMat(THREE, 0x8a5a3b, { roughness: 0.9, metalness: 0 });
  const canopyMat = standardMat(THREE, accent, { roughness: 0.85, metalness: 0 });
  // A slightly lighter secondary cluster keeps the canopy from reading as a
  // single flat balloon — cheap per-part variation (baked into vertex colors).
  const canopyLightMat = standardMat(THREE, shade(THREE, accent, 0.07), { roughness: 0.85, metalness: 0 });

  if (flavor === 'cone') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.9, 7), trunkMat);
    trunk.position.set(0, 0.45, 0);
    group.add(trunk);

    const lower = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.5, 8), canopyMat);
    lower.position.set(0, 1.5, 0);
    group.add(lower);

    const upper = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.2, 8), canopyLightMat);
    upper.position.set(0, 2.4, 0);
    group.add(upper);
  } else if (flavor === 'lollipop') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 7), trunkMat);
    trunk.position.set(0, 0.8, 0);
    group.add(trunk);

    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 6), canopyMat);
    crown.position.set(0, 2.3, 0);
    group.add(crown);

    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.55, 7, 5), canopyLightMat);
    tuft.position.set(0.45, 2.75, 0.2);
    group.add(tuft);
  } else {
    // 'blob' (default): classic Hole.io round park tree.
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.0, 7), trunkMat);
    trunk.position.set(0, 0.5, 0);
    group.add(trunk);

    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.15, 8, 6), canopyMat);
    crown.position.set(0, 1.9, 0);
    crown.scale.set(1, 0.85, 1);
    group.add(crown);

    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.7, 7, 5), canopyLightMat);
    tuft.position.set(0.55, 2.35, 0.3);
    group.add(tuft);
  }

  return group;
}

// Chibi pedestrian: darker legs, bright shirt (accent = the archetype's shirt
// tint), skin-toned head. ~0.7 raw units tall (see DIMENSIONS note above).
function buildPerson(THREE, accent) {
  const group = new THREE.Group();
  const legsMat = standardMat(THREE, shade(THREE, accent, -0.4, -0.1), { roughness: 0.8, metalness: 0 });
  const shirtMat = standardMat(THREE, accent, { roughness: 0.75, metalness: 0 });
  const headMat = standardMat(THREE, 0xf2c89b, { roughness: 0.7, metalness: 0 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.2), legsMat);
  legs.position.set(0, 0.14, 0);
  group.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.26), shirtMat);
  torso.position.set(0, 0.43, 0);
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), headMat);
  head.position.set(0, 0.66, 0);
  group.add(head);

  return group;
}

// Curved-arm street lamp: dark grey-blue pole (accent = the archetype's pole
// tint), a quarter-torus arm overhanging the road, and a pale warm head.
// Vertex colors only — the merged instanced material carries no per-part
// emissive, so the head reads via its pale color, not a glow.
function buildStreetlamp(THREE, accent) {
  const group = new THREE.Group();
  const poleMat = standardMat(THREE, accent, { roughness: 0.55, metalness: 0.4 });
  const baseMat = standardMat(THREE, shade(THREE, accent, -0.12), { roughness: 0.6, metalness: 0.35 });
  const headMat = standardMat(THREE, 0xfff3c4, { roughness: 0.4, metalness: 0 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 8), baseMat);
  base.position.set(0, 0.125, 0);
  group.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.4, 8), poleMat);
  pole.position.set(0, 1.2, 0);
  group.add(pole);

  // Curved arm: a quarter torus arcing from the pole top (tangent +Y) out to
  // horizontal (tangent +X), so the lamp overhangs the road edge.
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 10, Math.PI / 2), poleMat);
  arm.position.set(0.45, 2.4, 0);
  arm.rotation.z = Math.PI / 2;
  group.add(arm);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.24, 8), headMat);
  head.position.set(0.9, 2.75, 0);
  head.rotation.x = Math.PI; // opening faces the street below
  group.add(head);

  return group;
}


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
// Street-prop kinds (tree/person/streetlamp) additionally read `flavor` (the
// tree canopy silhouette; see archetypes.js STREET_PROP_CATALOG). Callers
// passing no variant get byte-identical V1 behavior.
// `opts.paletteBase` (optional): the caller is baking this geometry for the
// per-instance pastel palette (white body) — detail parts (glass/trim) use
// the fixed PALETTE_GLASS_TINT / PALETTE_TRIM_TINT colors instead of accent
// shades so windows stay visible under any instance hue.
export function createPropMesh(kind, THREE, accentColorHex, variant, opts = {}) {
  const accent = resolveColor(THREE, variant && variant.tint ? variant.tint : accentColorHex);
  const detail = { paletteBase: !!opts.paletteBase };
  let mesh;
  switch (kind) {
    case 'trash':
      mesh = buildTrash(THREE, accent);
      break;
    case 'bike':
      mesh = buildBike(THREE, accent);
      break;
    case 'car':
      mesh = buildCar(THREE, accent, detail);
      break;
    case 'bus':
      mesh = buildBus(THREE, accent, detail);
      break;
    case 'building-small':
      mesh = buildBuilding(THREE, accent, DIMENSIONS['building-small'], detail);
      break;
    case 'building-medium':
      mesh = buildBuilding(THREE, accent, DIMENSIONS['building-medium'], { tiers: true, ...detail });
      break;
    case 'building-large':
      mesh = buildBuilding(THREE, accent, DIMENSIONS['building-large'], { tiers: true, ...detail });
      break;
    case 'tree':
      mesh = buildTree(THREE, accent, variant && variant.flavor);
      break;
    case 'person':
      mesh = buildPerson(THREE, accent);
      break;
    case 'streetlamp':
      mesh = buildStreetlamp(THREE, accent);
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

// --- Rooftop deck anchors for the three building tiers ----------------------
// The recipe cue below is a BUILDING's only per-archetype geometry (five
// building-small archetypes per metro share ONE mesh; the cue is what tells
// `row_house` from `warehouse`), so it has to land on the roof — that is what
// art-direction.md §3 means by "a baked cap, bar, mast, canopy, box, or spire
// profile cue".
//
// It did not. The cue was positioned off `DIMENSIONS[kind].h`, which is the
// height of the procedural build's BASE BOX and NOT the height of the prop:
// the tiered kinds carry a setback + antenna above that box, and the Blender
// models (scripts/blender/build_props.py) are normalised onto the full
// procedural bounding box including them. Measured on the shipped bake:
//   building-small  model 11.00 tall / +-3.57 wide -> canopy cue FLOATING at
//                   y 11.44-12.32, overhanging to +-4.48 (25% proud, rotated
//                   30 deg off-axis)
//   building-medium model 35.83 tall / +-5.61 wide -> canopy cue at y 24.96-
//                   26.88, i.e. 72% up the SHAFT, jutting to +-6.77
//   building-large  model 62.49 tall            -> 30-unit mast buried in the
//                   curtain wall from y 27.7 and emerging past the parapet
// In PALETTE_TRIM_TINT over a pastel instance colour those read as a big dark
// slab hovering off the side of every mid-rise — the "flat dark roofs" in
// every gameplay screenshot — while hiding the parapets, water tanks, AC
// units and stair housings the Blender pack already authors.
//
// ONE table serves both bake paths. build_props.py's BUILDING_BOXES are, by
// construction, the procedural build's own bounding box, so the authored roof
// deck and the procedural setback top land within ~0.5 units of each other on
// every tier; these values are the AUTHORED deck (the surface the model's own
// roof plant stands on) because that is the path that ships. On the procedural
// fallback the cue sits a fraction of a unit lower, inside the setback.
//   y    — top of the roof deck, in DIMENSIONS space
//   half — half-extent INSIDE the parapet ring, so a cue never breaks the rim
const BUILDING_ROOF = {
  'building-small': { y: 10.16, half: 3.05 },  // deck 9.96+-0.20, parapet 6.90 outer / 0.40 thick
  'building-medium': { y: 28.88, half: 3.49 }, // deck 28.70+-0.18, parapet 7.70 outer / 0.36 thick
  'building-large': { y: 50.82, half: 4.05 },  // deck 50.62+-0.20, parapet 8.90 outer / 0.40 thick
};

// The (+x, -z) roof quadrant is empty on all three authored models (their
// plant sits at (+x,+z), (-x,-z) and (-x,+z)), so compact cues claim it and
// cannot bury an authored water tank.
const ROOF_CUE_CORNER = [0.55, -0.52];

// Rooftop cue for a building tier — real roof plant on the real roof deck,
// sized off the deck rather than the building, so it reads as a mast/vent/
// housing at every tier instead of as an overhang. Returns [geometry, position].
function buildingRoofCue(THREE, recipe, kind, phase, visualId = '') {
  const deck = BUILDING_ROOF[kind];
  const half = deck.half;
  const h = DIMENSIONS[kind].h; // vertical scale reference — cue height only
  // 0011 task 16: the authored deck furniture subtends almost nothing at
  // skyline distance. Medium/large cues grow (crownTier), and each group's
  // crown height varies off the seeded visualId hash so adjacent towers
  // cannot terminate in the same horizontal. Primitives unchanged —
  // triangle-neutral, the way 094d25e kept its roof-cue change neutral.
  const crownVar = kind === 'building-small' ? 1
    : 0.85 + ((hashStr(String(visualId)) >>> 0) % 1000) / 1000 * 0.5;
  const crownTier = kind === 'building-small' ? 1 : 1.55;
  const cx = half * ROOF_CUE_CORNER[0];
  const cz = half * ROOF_CUE_CORNER[1];
  switch (recipe) {
    case 'cap': {
      const capH = h * (0.075 + phase * 0.03) * crownTier * crownVar;
      return [new THREE.ConeGeometry(half * (0.30 + phase * 0.06), capH, 6),
        [cx, deck.y + capH / 2, cz]];
    }
    case 'bar': {
      const barH = Math.max(0.2, h * 0.030 * crownTier);
      // Sign gantry across the deck: raised clear of it, never past the rim.
      return [new THREE.BoxGeometry(half * 1.50, barH, half * 0.20),
        [0, deck.y + h * 0.055 + barH / 2, -half * 0.42]];
    }
    case 'mast': {
      // 0011 task 16: deliberately grown past the authored crown antenna
      // (62.49) on some groups — the skyline wants the silhouette variety.
      const mastH = h * (0.22 + phase * 0.05) * crownTier * crownVar;
      return [new THREE.CylinderGeometry(half * 0.055, half * 0.085, mastH, 6),
        [cx, deck.y + mastH / 2, cz]];
    }
    case 'canopy': {
      const slabH = Math.max(0.16, h * 0.022 * crownTier);
      return [new THREE.BoxGeometry(half * 1.30, slabH, half * 0.82),
        [0, deck.y + h * 0.055 + slabH / 2, -half * 0.42]];
    }
    case 'spire': {
      const spireH = h * (0.26 + phase * 0.10) * crownTier * crownVar;
      return [new THREE.ConeGeometry(half * 0.26, spireH, 7),
        [cx, deck.y + spireH / 2, cz]];
    }
    case 'box':
    default: {
      const boxH = h * (0.055 + phase * 0.025) * crownTier * crownVar;
      return [new THREE.BoxGeometry(half * (0.55 + phase * 0.14), boxH, half * 0.52),
        [cx, deck.y + boxH / 2, cz]];
    }
  }
}

// Adds one strong, low-poly silhouette cue to the sacred gameplay-tier base.
// The cue is baked into merged geometry, so it remains visible when instanced.
function applyVisualRecipe(group, THREE, descriptor, accent, opts = {}) {
  if (!descriptor || descriptor.recipe === 'base' || descriptor.family === 'legacy_fallback') return;
  const kind = descriptor.gameplayKind;
  const dim = DIMENSIONS[kind] || DIMENSIONS.trash;
  const index = descriptor.recipeIndex || 0;
  const phase = (index % 5) / 5;
  const material = standardMat(THREE, opts.paletteBase
    ? resolveColor(THREE, PALETTE_TRIM_TINT)
    : shade(THREE, accent, 0.18 - phase * 0.12), {
    roughness: 0.62,
    metalness: descriptor.recipe === 'mast' ? 0.35 : 0.08,
  });
  let geometry;
  let position;
  if (BUILDING_ROOF[kind]) {
    [geometry, position] = buildingRoofCue(THREE, descriptor.recipe, kind, phase, descriptor.id);
  } else {
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
  }
  const cue = new THREE.Mesh(geometry, material);
  cue.position.set(position[0], position[1], position[2]);
  cue.rotation.y = (index % 4) * Math.PI / 12;
  group.add(cue);
}

// Reference-sheet city objects share a compact set of low-poly construction
// profiles. Every descriptor gets deterministic proportion/detail variation
// from its sheet index, while its gameplay kind continues to own economy.
// Geometry stays inside the established kind envelope so placement and eating
// remain truthful until the generated physical-bounds pass measures it.
function buildCityObject(THREE, descriptor, accent, opts = {}) {
  const object = descriptor.cityObject;
  const index = object.referenceIndex || 1;
  const phase = ((index * 37) % 11) / 10;
  const dim = DIMENSIONS[descriptor.gameplayKind] || DIMENSIONS.trash;
  const main = standardMat(THREE, accent, { roughness: descriptor.roughness, metalness: descriptor.metalness });
  const trim = standardMat(THREE, opts.paletteBase ? resolveColor(THREE, PALETTE_TRIM_TINT) : shade(THREE, accent, -0.2), { roughness: 0.58, metalness: 0.18 });
  const glass = standardMat(THREE, opts.paletteBase ? resolveColor(THREE, PALETTE_GLASS_TINT) : shade(THREE, accent, 0.24), { roughness: 0.3, metalness: 0.16 });
  const group = new THREE.Group();
  const facadeTextured = !!opts.facadeTextured;
  const addBox = (w, h, d, x, y, z, mat = main, ry = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.rotation.y = ry; group.add(mesh); return mesh;
  };
  const addColumn = (r, h, x, y, z, mat = trim, sides = 8) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, h, sides), mat);
    mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };

  // Preserve the established placement envelope for each economy tier. The
  // reference models may be narrower inside that parcel (a tower setback, a
  // slim sign, a person), but changing the occupied envelope would reshuffle
  // the calibrated route after visual selection. This 1cm-equivalent ground
  // pad is also a useful curb/plinth/floor pan under the stylized asset.
  const envelopes = {
    trash: [1.41, 1.41], bike: [0.99, 1.78], car: [2.36, 4.2], bus: [3.24, 9.09],
    'building-small': [7.14, 7.16], 'building-medium': [11.22, 11.22], 'building-large': [15.3, 15.3],
  };
  const envelope = envelopes[descriptor.gameplayKind];
  if (envelope) addBox(envelope[0], 0.01, envelope[1], 0, 0.005, 0, trim);

  switch (object.profile) {
    case 'person':
      group.add(buildPerson(THREE, accent));
      break;
    case 'vehicle':
      group.add(buildCar(THREE, accent, { paletteBase: !!opts.paletteBase }));
      break;
    case 'largeVehicle':
      group.add(buildBus(THREE, accent, { paletteBase: !!opts.paletteBase }));
      break;
    case 'tower':
    case 'midrise':
    case 'shop': {
      const identity = object.id || '';
      const isWillis = identity === 'cityobj_chicago_willis_tower';
      const isMarina = identity === 'cityobj_chicago_marina_city_tower_pair';
      const isCna = identity === 'cityobj_chicago_cna_center_big_red';
      const isTribune = identity === 'cityobj_chicago_tribune_tower';
      const isTheatre = identity === 'cityobj_chicago_chicago_theatre';
      const inset = object.profile === 'tower' ? 0.62 : object.profile === 'shop' ? 0.92 : 0.78;
      const bodyW = dim.w * inset;
      const bodyD = dim.d * inset;
      const bodyH = dim.h * (object.profile === 'shop' ? 0.68 : 0.78 + phase * 0.08);
      const bodyY = dim.h * 0.08 + bodyH / 2;
      addBox(bodyW * 1.08, dim.h * 0.1, bodyD * 1.08, 0, dim.h * 0.05, 0, trim);
      if (isWillis) {
        // Bundled-tube massing: nine shafts rise to three distinct heights,
        // giving the tower its unmistakable stepped Chicago silhouette.
        const shaft = bodyW * 0.31;
        const heights = [0.72, 0.9, 0.72, 0.9, 1, 0.9, 0.58, 0.72, 0.58];
        let shaftIndex = 0;
        for (const z of [-shaft, 0, shaft]) for (const x of [-shaft, 0, shaft]) {
          const h = bodyH * heights[shaftIndex];
          const shaftMesh = addBox(shaft * 0.94, h, shaft * 0.94, x, dim.h * 0.08 + h / 2, z);
          shaftMesh.userData.facade = true;
          shaftIndex += 1;
        }
        addColumn(dim.w * 0.018, dim.h * 0.3, -shaft * 0.48, dim.h * 1.09, 0, trim, 6);
        addColumn(dim.w * 0.018, dim.h * 0.3, shaft * 0.48, dim.h * 1.09, 0, trim, 6);
      } else if (isMarina) {
        // Twin cylindrical corncob towers with repeated balcony drums.
        for (const x of [-bodyW * 0.27, bodyW * 0.27]) {
          const tower = addColumn(bodyW * 0.24, bodyH * 0.92, x, dim.h * 0.08 + bodyH * 0.46, 0, main, 12);
          tower.userData.facade = true;
          for (let floor = 1; floor <= 7; floor += 1) {
            addColumn(bodyW * 0.285, dim.h * 0.022, x, dim.h * 0.1 + floor * bodyH * 0.105, 0, trim, 12);
          }
        }
      } else {
        const body = addBox(bodyW, bodyH, bodyD, 0, bodyY, 0);
        body.userData.facade = true;
      }

      // Tower setbacks create the stepped Chicago skyline instead of one
      // enormous unarticulated prism.
      if (object.profile === 'tower' && !isWillis && !isMarina) {
        const crownH = dim.h * (0.24 + phase * 0.08);
        const crown = addBox(bodyW * 0.72, crownH, bodyD * 0.72, 0, dim.h * 0.08 + bodyH + crownH / 2, 0, main);
        crown.userData.facade = true;
        addBox(bodyW * 0.78, dim.h * 0.035, bodyD * 0.78, 0, dim.h * 0.08 + bodyH, 0, trim);
        if (!isCna) addColumn(dim.w * 0.028, dim.h * (isTribune ? 0.36 : 0.25), 0, dim.h * 1.1, 0, trim, isTribune ? 8 : 6);
      }

      // Actual window bays on all four facades. They are shallow boxes with
      // vertex colors, so they survive merged instancing without a texture
      // atlas or extra draw call.
      const rows = object.profile === 'shop' ? 2 : 4 + (index % 3);
      const cols = object.profile === 'shop' ? 3 : 3 + (index % 2);
      const winW = bodyW / (cols * 1.75);
      const winH = bodyH / (rows * 2.4);
      if (!facadeTextured && !isWillis && !isMarina) {
        for (let row = 0; row < rows; row += 1) {
          const y = dim.h * 0.13 + (row + 0.55) * (bodyH * 0.8 / rows);
          for (let col = 0; col < cols; col += 1) {
            const xPos = -bodyW * 0.36 + col * (bodyW * 0.72 / Math.max(1, cols - 1));
            const zPos = -bodyD * 0.36 + col * (bodyD * 0.72 / Math.max(1, cols - 1));
            addBox(winW, winH, dim.d * 0.018, xPos, y, bodyD / 2 + dim.d * 0.01, glass);
            addBox(winW, winH, dim.d * 0.018, xPos, y, -bodyD / 2 - dim.d * 0.01, glass);
            addBox(dim.w * 0.018, winH, winW, bodyW / 2 + dim.w * 0.01, y, zPos, glass);
            addBox(dim.w * 0.018, winH, winW, -bodyW / 2 - dim.w * 0.01, y, zPos, glass);
          }
        }
      }

      // Storefront awning/entrance and rooftop plant make the base and roof
      // read at gameplay distance.
      if (object.profile === 'shop') {
        addBox(bodyW * 0.72, dim.h * 0.055, bodyD * 0.16, 0, dim.h * 0.3, bodyD * 0.56, trim);
        addBox(bodyW * 0.2, dim.h * 0.27, dim.d * 0.025, 0, dim.h * 0.18, bodyD * 0.515, glass);
        if (isTheatre) {
          addBox(bodyW * 0.52, dim.h * 0.3, dim.d * 0.08, 0, dim.h * 0.48, bodyD * 0.58, trim);
          addBox(bodyW * 0.68, dim.h * 0.08, bodyD * 0.22, 0, dim.h * 0.34, bodyD * 0.61, glass);
        }
      } else if (!isWillis && !isMarina) {
        // A darker ground-floor band, entrance canopy, and roof parapet keep
        // the building readable as architecture from the high chase view.
        addBox(bodyW * 0.94, dim.h * 0.12, dim.d * 0.035, 0, dim.h * 0.16, bodyD * 0.515, glass);
        addBox(bodyW * 0.3, dim.h * 0.035, bodyD * 0.16, 0, dim.h * 0.25, bodyD * 0.56, trim);
        const roofY = dim.h * 0.08 + bodyH + dim.h * 0.025;
        addBox(bodyW, dim.h * 0.05, dim.d * 0.035, 0, roofY, bodyD * 0.48, trim);
        addBox(bodyW, dim.h * 0.05, dim.d * 0.035, 0, roofY, -bodyD * 0.48, trim);
        addBox(dim.w * 0.035, dim.h * 0.05, bodyD, bodyW * 0.48, roofY, 0, trim);
        addBox(dim.w * 0.035, dim.h * 0.05, bodyD, -bodyW * 0.48, roofY, 0, trim);
        addBox(bodyW * 0.22, dim.h * 0.055, bodyD * 0.18, bodyW * 0.22, dim.h * 0.1 + bodyH, -bodyD * 0.18, trim);
        addBox(bodyW * 0.14, dim.h * 0.045, bodyD * 0.14, -bodyW * 0.22, dim.h * 0.095 + bodyH, bodyD * 0.18, trim);
        if (index % 2 === 0) addColumn(dim.w * 0.055, dim.h * 0.12, -bodyW * 0.25, dim.h * 0.14 + bodyH, bodyD * 0.24, trim, 8);
      }
      break;
    }
    case 'rail': {
      addBox(dim.w * 0.92, dim.h * 0.12, dim.d * 0.82, 0, dim.h * 0.72, 0, trim);
      addBox(dim.w * 0.9, dim.h * 0.05, dim.d * 0.12, 0, dim.h * 0.83, dim.d * 0.26, main);
      addBox(dim.w * 0.9, dim.h * 0.05, dim.d * 0.12, 0, dim.h * 0.83, -dim.d * 0.26, main);
      for (const x of [-dim.w * 0.36, dim.w * 0.36]) for (const z of [-dim.d * 0.3, dim.d * 0.3]) addColumn(dim.w * 0.035, dim.h * 0.7, x, dim.h * 0.35, z);
      break;
    }
    case 'module': {
      addBox(dim.w * 0.94, dim.h * 0.1, dim.d * 0.94, 0, dim.h * 0.05, 0);
      const orientation = index % 2 ? 0 : Math.PI / 2;
      addBox(dim.w * 0.72, dim.h * (0.06 + phase * 0.04), dim.d * 0.12, 0, dim.h * 0.13, 0, trim, orientation);
      if (index % 3 === 0) addColumn(dim.w * 0.035, dim.h * 0.55, dim.w * 0.28, dim.h * 0.33, dim.d * 0.24);
      break;
    }
    case 'landmark': {
      addBox(dim.w * 0.72, dim.h * 0.12, dim.d * 0.72, 0, dim.h * 0.06, 0, trim);
      if (index % 3 === 0) {
        const sculpture = new THREE.Mesh(new THREE.TorusGeometry(dim.w * 0.22, dim.w * 0.07, 7, 12), main);
        sculpture.position.y = dim.h * 0.55; sculpture.rotation.x = Math.PI / 2; group.add(sculpture);
      } else {
        addColumn(dim.w * (0.1 + phase * 0.04), dim.h * 0.72, 0, dim.h * 0.48, 0, main, 6 + index % 4);
      }
      break;
    }
    case 'pole':
      addBox(dim.w * 0.48, dim.h * 0.08, dim.d * 0.48, 0, dim.h * 0.04, 0, trim);
      addColumn(dim.w * 0.09, dim.h * 0.82, 0, dim.h * 0.45, 0);
      addBox(dim.w * (0.32 + phase * 0.18), dim.h * 0.22, dim.d * 0.3, dim.w * 0.12, dim.h * 0.86, 0, main);
      break;
    case 'furniture':
      addBox(dim.w * 0.88, dim.h * 0.28, dim.d * 0.7, 0, dim.h * 0.2, 0);
      addBox(dim.w * 0.78, dim.h * 0.08, dim.d * 0.74, 0, dim.h * 0.42, 0, trim);
      break;
    case 'clutter':
    default:
      addBox(dim.w * (0.62 + phase * 0.2), dim.h * 0.64, dim.d * (0.62 + (1 - phase) * 0.2), 0, dim.h * 0.32, 0);
      addBox(dim.w * 0.68, dim.h * 0.1, dim.d * 0.68, 0, dim.h * 0.69, 0, trim, (index % 4) * Math.PI / 8);
      break;
  }
  return group;
}

export function createVisualPropMesh(visualId, kind, THREE, accentColorHex, opts = {}) {
  const descriptor = resolveVisualArchetype(visualId, kind);
  const accent = resolveColor(THREE, accentColorHex);
  // Street-prop archetypes (trees/people/lamps) carry their identity color on
  // the descriptor (`tint`) instead of the metro accent, plus an optional
  // `flavor` (tree canopy silhouette). The merge cache key includes the
  // descriptor id, so each tint/flavor bakes its own geometry.
  const variant = descriptor.tint !== undefined || descriptor.flavor !== undefined
    ? { tint: descriptor.tint, flavor: descriptor.flavor }
    : undefined;
  const group = descriptor.cityObject
    ? buildCityObject(THREE, descriptor, accent, opts)
    : createPropMesh(descriptor.gameplayKind, THREE, accentColorHex, variant, opts);
  if (!descriptor.cityObject) applyVisualRecipe(group, THREE, descriptor, accent, opts);
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
const mergedGeometryCache = new Map(); // `${visualId}|${accent}|tex|plain|palette|kit|proc` -> BufferGeometry

// World-space bounding box of a built prop group (matrices must be updated).
function groupBounds(group, THREE) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  group.traverse((node) => {
    if (!node.isMesh || !node.geometry || !node.geometry.attributes.position) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    tmp.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
    box.union(tmp);
  });
  return box;
}

// Adapts a Blender model geometry (modelkit.js) into merged-part arrays that
// drop into the same instancing contract as the procedural bake:
//   - NORMALIZED to the procedural build's exact bounding box (per-axis), so
//     render scale, footprint radius, blob shadows, and the edibility math —
//     all derived from the gameplay radius — are byte-identical either way.
//   - GREYSCALE vertex colors are multiplied by the effective tint (the
//     archetype's `tint` for street props, the bake accent — white for
//     palette-base kinds like the car — otherwise), keeping the
//     vertexColors x instanceColor contract intact.
// Normals are inverse-transpose scaled (diagonal scale => divide + normalize).
function bakeModelPart(THREE, modelGeo, targetBox, tintHex, facade = null) {
  const pos = modelGeo.attributes.position.array;
  const nrm = modelGeo.attributes.normal ? modelGeo.attributes.normal.array : null;
  const col = modelGeo.attributes.color ? modelGeo.attributes.color.array : null;
  const src = modelGeo.boundingBox;
  const sx = (targetBox.max.x - targetBox.min.x) / Math.max(1e-6, src.max.x - src.min.x);
  const sy = (targetBox.max.y - targetBox.min.y) / Math.max(1e-6, src.max.y - src.min.y);
  const sz = (targetBox.max.z - targetBox.min.z) / Math.max(1e-6, src.max.z - src.min.z);
  const tint = resolveColor(THREE, tintHex);
  const spanZ = Math.max(1e-6, targetBox.max.z - targetBox.min.z);
  const spanX = Math.max(1e-6, targetBox.max.x - targetBox.min.x);
  const spanY = Math.max(1e-6, targetBox.max.y - targetBox.min.y);
  const frac1 = (t) => ((t % 1) + 1) % 1;

  const count = pos.length / 3;
  const positions = new Array(pos.length);
  const normals = new Array(pos.length);
  const colors = new Array(pos.length);
  const uvs = new Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = targetBox.min.x + (pos[i * 3] - src.min.x) * sx;
    positions[i * 3 + 1] = targetBox.min.y + (pos[i * 3 + 1] - src.min.y) * sy;
    positions[i * 3 + 2] = targetBox.min.z + (pos[i * 3 + 2] - src.min.z) * sz;
    let nx = 0;
    let ny = 1;
    let nz = 0;
    if (nrm) {
      nx = nrm[i * 3] / sx;
      ny = nrm[i * 3 + 1] / sy;
      nz = nrm[i * 3 + 2] / sz;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
    }
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
    let greyscale = true;
    let liftedBand = null;
    if (col) {
      const r = col[i * 3];
      const g = col[i * 3 + 1];
      const b = col[i * 3 + 2];
      greyscale = Math.abs(r - g) < 0.02 && Math.abs(g - b) < 0.02;
      if (greyscale) {
        colors[i * 3] = r * tint.r;
        colors[i * 3 + 1] = r * tint.g;
        colors[i * 3 + 2] = r * tint.b;
      } else {
        // 0011 task 7 (Route A, delete when build_props.py is fixed at
        // source and regenerated on a machine with Blender): bounded albedo
        // lift for the two authored paint bands that render near-black —
        // DOOR_GLASS ground-floor glazing and TRIM roof/balcony trim —
        // keyed on their exact shipped linear triples so nothing else can
        // match. Targets are the linear forms of PALETTE_GLASS_TINT /
        // PALETTE_TRIM_TINT, the range the procedural fallback already
        // paints for the same job.
        const liftMatch = liftAuthoredBand(r, g, b);
        liftedBand = liftMatch ? liftMatch.band : null;
        const lifted = liftMatch ? liftMatch.to : [r, g, b];
        colors[i * 3] = lifted[0];
        colors[i * 3 + 1] = lifted[1];
        colors[i * 3 + 2] = lifted[2];
      }
    } else {
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    // Facade-textured bake (photoreal set, textures.js). SEAM / Blender
    // contract: only GREYSCALE (tintable) vertices take the facade art —
    // side faces get a box-projected UV into the facade region, upward
    // faces tile the roof strip by world position — and go vertex-white so
    // the texture shows true colors. FIXED non-greyscale vertices (roof
    // furniture, trim, signage) keep their authored color and land on
    // TRIM_UV, so detail parts never smear facade windows across
    // themselves. The procedural merge's facade remap assumes box-like
    // massing; this box projection is the defensive equivalent for authored
    // geometry whose UVs sit wherever the Blender export left them.
    let uv = TRIM_UV;
    // 0011 task 22: the DOOR_GLASS band samples the shopfront strip (painted
    // into the roof strip's dead area, textures.js) instead of the flat
    // swatch — glazing low, awnings above — and goes vertex-white so the art
    // shows true. Photoreal set only (region.shop), so generic levels keep
    // the task-7 lifted colour on the swatch.
    if (facade && facade.shop && liftedBand === 'doorGlass' && Math.abs(ny) < 0.7) {
      const across = Math.abs(nx) >= Math.abs(nz)
        ? (positions[i * 3 + 2] - targetBox.min.z) / spanZ
        : (positions[i * 3] - targetBox.min.x) / spanX;
      const bandT = Math.min(1, (positions[i * 3 + 1] - targetBox.min.y) / spanY / 0.25);
      uv = [
        facade.shop.u0 + (facade.shop.u1 - facade.shop.u0) * across,
        facade.shop.v0 + (facade.shop.v1 - facade.shop.v0) * bandT,
      ];
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    } else if (facade && greyscale) {
      if (facade.tileWorld && ny > 0.7) {
        uv = [
          facade.u + (1 - facade.u) * frac1(positions[i * 3] / facade.tileWorld),
          1 - frac1(positions[i * 3 + 2] / facade.tileWorld) * facade.vSpan,
        ];
      } else if (Math.abs(ny) < 0.7) {
        const across = Math.abs(nx) >= Math.abs(nz)
          ? (positions[i * 3 + 2] - targetBox.min.z) / spanZ
          : (positions[i * 3] - targetBox.min.x) / spanX;
        uv = [across * facade.u, (positions[i * 3 + 1] - targetBox.min.y) / spanY];
      }
      if (uv !== TRIM_UV) {
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
      }
    }
    uvs[i * 2] = uv[0];
    uvs[i * 2 + 1] = uv[1];
  }
  const indices = modelGeo.index ? Array.from(modelGeo.index.array) : null;
  return { count, positions, normals, colors, uvs, indices };
}

function mergedKindGeometry(THREE, kind, accentColorHex, visualId, opts = {}) {
  const descriptor = resolveVisualArchetype(visualId, kind);
  // Blender prop pack: prefer the authored model when this descriptor maps to
  // one AND the kit loaded (main.js setModelKit); otherwise the procedural
  // bake — silent fallback, identical gameplay. Per-visualId models (the
  // Chicago archetype set, modelkit.js byVisualId) win over the kind-level
  // model; a byVisualId model that failed to load simply falls through to
  // the kind-level one, and city-authored objects are eligible too (their
  // procedural bake supplies the normalization envelope below).
  const visualModelName = PROP_MODELS.byVisualId[descriptor.id] || null;
  const kindModelName = PROP_MODELS.byKind[descriptor.gameplayKind] || null;
  const modelName = blenderModelKit
    ? (blenderModelKit[visualModelName] ? visualModelName
      : blenderModelKit[kindModelName] ? kindModelName : null)
    : null;
  const modelGeo = modelName ? blenderModelKit[modelName] : null;
  const key = `${descriptor.id}|${accentColorHex}|${opts.facadeTextured ? 'tex' : 'plain'}|${opts.paletteBase ? 'palette' : 'accent'}|${modelName || 'proc'}`;
  const cached = mergedGeometryCache.get(key);
  if (cached) return cached;

  let group;
  let modelPart = null;
  if (modelGeo) {
    // Measure the procedural BASE build (no recipe cue) to get the exact
    // footprint/height the gameplay math was tuned against, then normalize
    // the model onto it. For street-prop archetypes the recipe cue (car
    // cap/bar/mast...) is still merged on top from an otherwise-empty group,
    // so metro variant silhouettes survive the model swap; city-authored
    // objects instead let the model replace their whole procedural bake
    // (buildCityObject only supplies the normalization envelope).
    const tintHex = descriptor.tint !== undefined ? descriptor.tint : accentColorHex;
    let targetBox;
    if (descriptor.cityObject) {
      const procBase = buildCityObject(THREE, descriptor, resolveColor(THREE, accentColorHex), {
        paletteBase: !!opts.paletteBase,
      });
      procBase.updateMatrixWorld(true);
      targetBox = groupBounds(procBase, THREE);
      group = new THREE.Group();
    } else {
      const variant = descriptor.tint !== undefined || descriptor.flavor !== undefined
        ? { tint: descriptor.tint, flavor: descriptor.flavor }
        : undefined;
      const procBase = createPropMesh(descriptor.gameplayKind, THREE, accentColorHex, variant, {
        paletteBase: !!opts.paletteBase,
      });
      procBase.updateMatrixWorld(true);
      targetBox = groupBounds(procBase, THREE);
      group = new THREE.Group();
      applyVisualRecipe(group, THREE, descriptor, resolveColor(THREE, accentColorHex), {
        paletteBase: !!opts.paletteBase,
      });
    }
    // Photoreal facades survive the model swap: tintable model vertices are
    // remapped into the facade/roof regions (see bakeModelPart); with no
    // roof strip the facade region spans the whole texture (`{ u: 1 }`).
    const facade = opts.facadeTextured ? (opts.facadeRegion || { u: 1 }) : null;
    modelPart = bakeModelPart(THREE, modelGeo, targetBox, tintHex, facade);
  } else {
    group = createVisualPropMesh(descriptor.id, kind, THREE, accentColorHex, {
      paletteBase: !!opts.paletteBase,
      facadeTextured: !!opts.facadeTextured,
    });
  }
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
  // Facade-region split (textures.js photoreal set): side faces sample
  // u < region.u, roof faces tile the appended strip by world position.
  const region = opts.facadeRegion || null;
  const frac1 = (t) => ((t % 1) + 1) % 1;

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
    // With a roof strip (region), EVERY upward face in the group — garage
    // decks, warehouse roofs, skylight tops — tiles the roof art by world
    // position and goes vertex-white for the same true-colour reason.
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
      if (isFacade || (region && n.y > 0.7)) colors.push(1, 1, 1);
      else colors.push(color.r, color.g, color.b);
      if (isFacade && uvAttr && Math.abs(n.y) < 0.7) {
        const fu = region ? uvAttr.getX(i) * region.u : uvAttr.getX(i);
        uvs.push(fu, uvAttr.getY(i));
      } else if (region && n.y > 0.7) {
        uvs.push(
          region.u + (1 - region.u) * frac1(v.x / region.tileWorld),
          1 - frac1(v.z / region.tileWorld) * region.vSpan,
        );
      } else uvs.push(TRIM_UV[0], TRIM_UV[1]);
      // (trim fallback handled by the final else above)
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i += 1) indices.push(geo.index.getX(i) + vertexOffset);
    } else {
      for (let i = 0; i < posAttr.count; i += 1) indices.push(i + vertexOffset);
    }
    vertexOffset += posAttr.count;
  });

  if (modelPart) {
    for (let i = 0; i < modelPart.positions.length; i += 1) {
      positions.push(modelPart.positions[i]);
      normals.push(modelPart.normals[i]);
      colors.push(modelPart.colors[i]);
    }
    for (let i = 0; i < modelPart.count; i += 1) uvs.push(modelPart.uvs[i * 2], modelPart.uvs[i * 2 + 1]);
    if (modelPart.indices) {
      for (let i = 0; i < modelPart.indices.length; i += 1) indices.push(modelPart.indices[i] + vertexOffset);
    } else {
      for (let i = 0; i < modelPart.count; i += 1) indices.push(i + vertexOffset);
    }
    vertexOffset += modelPart.count;
  }

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

// Raw authored footprint (local X/Z, before render scale) — the placement
// audit needs the true RECTANGLE, not the half-diagonal, to test a rotated
// building against a street rect.
export function kindFootprint(kind) {
  const dim = DIMENSIONS[kind] || { w: 2, h: 2, d: 2 };
  return { w: dim.w, d: dim.d };
}

/**
 * ART render scale for a prop — the ONLY scale a mesh should be built at.
 * Gameplay-normalised scale times the kind's metric correction (see
 * RENDER_SCALE_CORRECTION). Deliberately NOT a difficulty quantity: callers
 * must keep using `prop.radius` for the eat gate, mass and collision.
 * @param {string} kind
 * @param {number} radius - the prop's GAMEPLAY radius (TIER_RADII * scaleMult)
 * @returns {number} uniform mesh scale
 */
export function kindRenderScale(kind, radius) {
  const correction = RENDER_SCALE_CORRECTION[kind];
  const c = Number.isFinite(correction)
    ? Math.min(1 + RENDER_SCALE_CLAMP, Math.max(1 - RENDER_SCALE_CLAMP, correction))
    : 1;
  return (radius / kindFootprintRadius(kind)) * c;
}

// Rendered footprint half-diagonal — what the prop actually OCCUPIES on the
// ground, as opposed to `radius`, which is what it EATS at. Placement,
// clearance and contact shadows want this one.
export function kindRenderFootprintRadius(kind, radius) {
  return kindRenderScale(kind, radius) * kindFootprintRadius(kind);
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
  // Palette-base kinds (buildings/vehicles) bake their geometry with a WHITE
  // accent: the Hole.io-style per-instance pastel palette (instancing.js)
  // then supplies the full body color through instance colors, instead of a
  // clamped accent-ratio that collapsed every pick back to the accent hue.
  // Detail parts keep FIXED non-white colors (paletteBase bakes windows/glass
  // as PALETTE_GLASS_TINT, rooftop cues as PALETTE_TRIM_TINT, wheels stay
  // dark) so a pastel instance hue still shows window/trim contrast.
  const paletteBase = PALETTE_BASE_KINDS.has(kind);
  const bakeAccent = paletteBase ? '#ffffff' : accentColorHex;
  const geometry = mergedKindGeometry(THREE, kind, bakeAccent, descriptor.id, {
    facadeTextured: !!opts.map,
    facadeRegion: (opts.map && opts.map.userData && opts.map.userData.facadeRegion) || null,
    paletteBase,
  });
  // White base material: the real per-part colors live in the vertex colors;
  // instance colors multiply on top (jitter / edibility / golden).
  // Roughness 0.72 / metalness 0.0. Metalness is 0 and stays 0: every surface
  // in this kit is a dielectric (painted metal, plastic, masonry, foliage,
  // fabric), and painted metal is paint, not metal. The per-part standardMat()
  // calls above carry metalness up to 0.6, but mergedKindGeometry bakes only
  // their COLOR into the vertex attribute — the roughness/metalness on those
  // part materials is discarded, so this one material is what the whole prop
  // kit actually renders with. It has to be right on its own.
  //
  // 0.85 was flat enough that the sun contributed almost no specular, which
  // wasted the flat shading below: faceted low-poly reads through the value
  // STEP between adjacent faces, and at 0.85 that step is nearly pure diffuse
  // lambert. 0.72 is still unmistakably matte (no reference surface is glossy)
  // but gives the facets a visible terminator.
  const material = standardMat(THREE, 0xffffff, { roughness: 0.72, metalness: 0.0 });
  material.vertexColors = true;
  // Flat shading: the reference art is unmistakably faceted low-poly — hard
  // value steps between faces are what give the props their chunky, readable
  // silhouettes. Smooth-shading a 6-face box (which is most of this kit) just
  // washes the form out. Costs nothing: the shader derives face normals from
  // derivatives, no extra geometry.
  material.flatShading = true;
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
