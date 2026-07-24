// Seeded district layout generator (art-direction.md §1; fixes V1 flaw D1 —
// "props scattered on a flat colored plane"). Turns a level descriptor from
// src/data/levels.js into a pure-data district: streets, zoned blocks, and
// every prop placement. NO THREE, NO DOM, NO Math.random — same seed ⇒ the
// identical district in every browser (tech-architecture.md §3), which is
// what makes the daily challenge and deterministic soak tests possible.
//
// main.js contract: `const layout = generateDistrict(generateLevel(n))` —
// then turn layout.streets/blocks into ground geometry (or pass the whole
// descriptor to groundtex.js for the baked ground texture) and layout.props
// into propkit meshes. Everything here is plain JSON-able data.
//
// COORDINATE CONTRACT (lesson B7): the world is centered on (0,0) and spans
// ±world/2 on both x and z. Rects are { x, z, w, d, rotY }: center (x,z),
// size w along local X / d along local Z, rotated by rotY following THREE's
// rotation.y convention — local +X maps to world (cos rotY, -sin rotY),
// local +Z maps to world (sin rotY, cos rotY). Streets always carry their
// LENGTH in w (long axis = local X).
import { mulberry32 } from '../data/seeds.js';
import {
  districtCatalog, resolveVisualArchetype,
} from './archetypes.js';

export const ARCHETYPES = ['grid', 'radial', 'organic'];
export const ZONES = ['plaza', 'avenue', 'park', 'residential'];

// Guaranteed tier-0 ring right at spawn (D2 / game-design.md §2 acceptance:
// ≥5 edible props visible on level 1). Placed from within the tier-0 budget,
// not on top of it.
const SPAWN_FEAST_COUNT = 12;
const SPAWN_FEAST_RING = [50, 130];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Fisher-Yates with the seeded rng — the only shuffling in this module.
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Local-rect -> world transform, THREE rotation.y convention (see header).
function rectPoint(rect, lx, lz) {
  const c = Math.cos(rect.rotY);
  const s = Math.sin(rect.rotY);
  return { x: rect.x + lx * c + lz * s, z: rect.z - lx * s + lz * c };
}

function streetWidth(world) {
  return clamp(world * 0.032, 36, 80);
}

// --- Layout archetypes -------------------------------------------------------

// Rectangular street grid: `cells` blocks per side, full-length streets.
function buildGrid(world, rng) {
  const sw = streetWidth(world);
  const half = world / 2;
  const cells = 4 + Math.floor(rng() * 2); // 4-5 -> blocks ~world/4.5: 2-4 on screen at spawn
  const pitch = world / cells;
  const streets = [];
  const blocks = [];
  for (let i = 1; i < cells; i += 1) {
    streets.push({ x: -half + i * pitch, z: 0, w: world, d: sw, rotY: Math.PI / 2 });
    streets.push({ x: 0, z: -half + i * pitch, w: world, d: sw, rotY: 0 });
  }
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      blocks.push({
        x: -half + pitch * (i + 0.5),
        z: -half + pitch * (j + 0.5),
        w: pitch - sw,
        d: pitch - sw,
        rotY: 0,
        zone: 'residential',
      });
    }
  }
  return { streets, blocks };
}

// Radial: a rotated square ring system with spokes through the center.
// Ring streets are squares of growing half-side (4 strips each); blocks are
// rotated rects filling the sectors between rings and spokes. The center
// cell is its own block.
function buildRadial(world, rng) {
  const sw = streetWidth(world);
  const half = world / 2;
  const phi = rng() * Math.PI;
  const rings = 2 + Math.floor(rng() * 2); // 2-3 ring streets
  const spokes = 6 + Math.floor(rng() * 2) * 2; // 6 or 8
  const streets = [];
  const blocks = [];
  const maxHalf = half - sw;
  const ringHalfs = [];
  for (let k = 1; k <= rings; k += 1) ringHalfs.push((maxHalf * k) / (rings + 0.5));

  const centerHalf = Math.max(world * 0.09, ringHalfs[0] * 0.55);
  const origin = { x: 0, z: 0, rotY: phi };
  for (const s of ringHalfs) {
    // Four sides of the square of half-side s in the unrotated frame —
    // horizontal sides (center (0, ±s)) and vertical sides (center (±s, 0)) —
    // then the whole set is rotated by phi.
    const sides = [
      { cx: 0, cz: -s, rotY: 0 },
      { cx: 0, cz: s, rotY: 0 },
      { cx: -s, cz: 0, rotY: Math.PI / 2 },
      { cx: s, cz: 0, rotY: Math.PI / 2 },
    ];
    for (const side of sides) {
      const p = rectPoint(origin, side.cx, side.cz);
      streets.push({ x: p.x, z: p.z, w: 2 * s, d: sw, rotY: phi + side.rotY });
    }
  }
  const step = (Math.PI * 2) / spokes;
  for (let j = 0; j < spokes; j += 1) {
    streets.push({ x: 0, z: 0, w: world, d: sw, rotY: phi + j * step });
  }
  // Center block.
  blocks.push({ x: 0, z: 0, w: 2 * centerHalf - sw, d: 2 * centerHalf - sw, rotY: phi, zone: 'residential' });
  // Sector blocks between successive rings (and outside the outermost ring).
  const bounds = [centerHalf, ...ringHalfs, maxHalf * 0.96];
  for (let k = 0; k < bounds.length - 1; k += 1) {
    const inner = bounds[k] + sw * 0.5;
    const outer = bounds[k + 1] - sw * 0.5;
    if (outer - inner < 40) continue;
    const rm = (inner + outer) / 2;
    for (let j = 0; j < spokes; j += 1) {
      const a = phi + (j + 0.5) * step;
      const arc = Math.max(60, rm * step * 0.72);
      blocks.push({
        x: Math.cos(a) * rm,
        z: Math.sin(a) * rm,
        w: arc,
        d: outer - inner,
        rotY: a + Math.PI / 2, // local X tangential, local Z radial
        zone: 'residential',
      });
    }
  }
  return { streets, blocks };
}

// Organic: a jittered grid with occasional diagonal avenues — reads as a
// grown city rather than a planned one.
function buildOrganic(world, rng) {
  const sw = streetWidth(world);
  const half = world / 2;
  const cells = 4;
  const pitch = world / cells;
  const streets = [];
  const blocks = [];
  const xLines = [];
  const zLines = [];
  for (let i = 1; i < cells; i += 1) {
    xLines.push(-half + i * pitch + (rng() - 0.5) * pitch * 0.3);
    zLines.push(-half + i * pitch + (rng() - 0.5) * pitch * 0.3);
  }
  for (const x of xLines) streets.push({ x, z: 0, w: world, d: sw, rotY: Math.PI / 2 });
  for (const z of zLines) streets.push({ x: 0, z, w: world, d: sw, rotY: 0 });
  // 1-2 diagonal avenues.
  const diagonals = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < diagonals; i += 1) {
    streets.push({
      x: (rng() - 0.5) * world * 0.3,
      z: (rng() - 0.5) * world * 0.3,
      w: world * 1.2,
      d: sw * 1.2,
      rotY: rng() * Math.PI,
    });
  }
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      blocks.push({
        x: -half + pitch * (i + 0.5) + (rng() - 0.5) * pitch * 0.12,
        z: -half + pitch * (j + 0.5) + (rng() - 0.5) * pitch * 0.12,
        w: (pitch - sw) * (0.85 + rng() * 0.3),
        d: (pitch - sw) * (0.85 + rng() * 0.3),
        rotY: (rng() - 0.5) * 0.12,
        zone: 'residential',
      });
    }
  }
  return { streets, blocks };
}

// --- Zoning -------------------------------------------------------------------

// Assigns block zones in place. Guarantees: the spawn block is a park (the
// opening feast lives in a place that reads as a place), at least one plaza
// exists, and the LARGEST plaza is returned for the landmark
// (art-direction.md §1: "the landmark on the largest plaza"). Capstone
// districts force the largest block to be the landmark plaza.
function assignZones(blocks, rng, isCapstone) {
  let spawnBlock = blocks[0];
  let bestDist = Infinity;
  for (const b of blocks) {
    const d = Math.hypot(b.x, b.z);
    if (d < bestDist) { bestDist = d; spawnBlock = b; }
  }
  spawnBlock.zone = 'park';

  const candidates = shuffle(blocks.filter((b) => b !== spawnBlock), rng);
  const plazaCount = blocks.length >= 12 ? 2 : 1;
  for (let i = 0; i < Math.min(plazaCount, candidates.length); i += 1) {
    candidates[i].zone = 'plaza';
  }
  let extraParks = 0;
  for (const b of candidates.slice(plazaCount)) {
    const roll = rng();
    if (roll < 0.18 && extraParks < 2) { b.zone = 'park'; extraParks += 1; } else if (roll < 0.45) { b.zone = 'avenue'; } else { b.zone = 'residential'; }
  }

  if (isCapstone) {
    // The capstone's landmark deserves the map's biggest stage.
    let largest = blocks[0];
    for (const b of blocks) if (b.w * b.d > largest.w * largest.d) largest = b;
    largest.zone = 'plaza';
  }

  let landmarkPlaza = null;
  for (const b of blocks) {
    if (b.zone !== 'plaza') continue;
    if (!landmarkPlaza || b.w * b.d > landmarkPlaza.w * landmarkPlaza.d) landmarkPlaza = b;
  }
  return landmarkPlaza;
}

// --- Placement sites ------------------------------------------------------------

// Points just outside each block edge (the sidewalk between block and street
// center), walking the block's local frame so rotated blocks work.
function sidewalkSites(blocks, rng) {
  const sites = [];
  for (const b of blocks) {
    const out = 12; // sidewalk offset beyond the block edge
    const perLong = Math.max(2, Math.floor(b.w / 70));
    const perShort = Math.max(2, Math.floor(b.d / 70));
    for (let i = 0; i < perLong; i += 1) {
      const t = (i + 0.5) / perLong - 0.5;
      const jitter = (rng() - 0.5) * 20;
      sites.push({ ...rectPoint(b, t * b.w + jitter, b.d / 2 + out), rotY: b.rotY, block: b });
      sites.push({ ...rectPoint(b, t * b.w + jitter, -b.d / 2 - out), rotY: b.rotY, block: b });
    }
    for (let i = 0; i < perShort; i += 1) {
      const t = (i + 0.5) / perShort - 0.5;
      const jitter = (rng() - 0.5) * 20;
      sites.push({ ...rectPoint(b, b.w / 2 + out, t * b.d + jitter), rotY: b.rotY + Math.PI / 2, block: b });
      sites.push({ ...rectPoint(b, -b.w / 2 - out, t * b.d + jitter), rotY: b.rotY + Math.PI / 2, block: b });
    }
  }
  return sites;
}

// Dense interior grid inside park blocks — "the feast"
// (art-direction.md §1: parks = dense small-prop clusters).
function parkSites(blocks, rng) {
  const sites = [];
  for (const b of blocks) {
    if (b.zone !== 'park') continue;
    const nx = Math.max(3, Math.floor(b.w / 60));
    const nz = Math.max(3, Math.floor(b.d / 60));
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nz; j += 1) {
        const lx = ((i + 0.5) / nx - 0.5) * b.w * 0.85 + (rng() - 0.5) * 24;
        const lz = ((j + 0.5) / nz - 0.5) * b.d * 0.85 + (rng() - 0.5) * 24;
        sites.push({ ...rectPoint(b, lx, lz), rotY: rng() * Math.PI * 2, block: b });
      }
    }
  }
  return sites;
}

// Sparse points on plaza interiors, kept clear of the landmark's footprint.
function plazaSites(blocks, rng, landmarkPlaza) {
  const sites = [];
  for (const b of blocks) {
    if (b.zone !== 'plaza') continue;
    const count = Math.max(4, Math.floor((b.w * b.d) / 26000));
    for (let i = 0; i < count; i += 1) {
      const lx = (rng() - 0.5) * b.w * 0.8;
      const lz = (rng() - 0.5) * b.d * 0.8;
      if (b === landmarkPlaza && Math.hypot(lx, lz) < 60) continue; // landmark clear zone
      sites.push({ ...rectPoint(b, lx, lz), rotY: rng() * Math.PI * 2, block: b });
    }
  }
  return sites;
}

// Two driving lanes per street; cars/buses align their rotY with the street.
function roadSites(streets, rng) {
  const sites = [];
  streets.forEach((st, streetIndex) => {
    const lanes = [-1, 1];
    for (const lane of lanes) {
      const lz = lane * st.d * 0.22;
      const count = Math.max(2, Math.floor(st.w / 90));
      for (let i = 0; i < count; i += 1) {
        const lx = ((i + 0.5) / count - 0.5) * st.w * 0.94 + (rng() - 0.5) * 16;
        sites.push({
          ...rectPoint(st, lx, lz),
          rotY: st.rotY,
          streetIndex,
          lane,
        });
      }
    }
  });
  return sites;
}

// Block corners (buildings face the street) + edge-midpoint frontage.
function buildingSites(blocks, rng, world) {
  const corners = [];
  const largeCorners = [];
  const frontage = [];
  for (const b of blocks) {
    if (b.zone === 'park' || b.zone === 'plaza') continue;
    const inset = 26;
    const cornerLocal = [
      [b.w / 2 - inset, b.d / 2 - inset],
      [-b.w / 2 + inset, b.d / 2 - inset],
      [b.w / 2 - inset, -b.d / 2 + inset],
      [-b.w / 2 + inset, -b.d / 2 + inset],
    ];
    for (const [lx, lz] of cornerLocal) {
      const site = { ...rectPoint(b, lx, lz), rotY: b.rotY, block: b };
      corners.push(site);
      if (Math.min(b.w, b.d) >= world * 0.14) largeCorners.push(site);
    }
    const midLocal = [
      [0, b.d / 2 - inset], [0, -b.d / 2 + inset],
      [b.w / 2 - inset, 0], [-b.w / 2 + inset, 0],
    ];
    for (const [lx, lz] of midLocal) {
      frontage.push({ ...rectPoint(b, lx, lz), rotY: b.rotY, block: b });
    }
  }
  return { corners: shuffle(corners, rng), largeCorners: shuffle(largeCorners, rng), frontage: shuffle(frontage, rng) };
}

// --- The generator ---------------------------------------------------------------

// Draws `count` placements from weighted site pools. Pools are pre-shuffled
// and popped; spills fall through to any remaining pool, then (never in
// practice, given site densities) to a seeded point on the world square.
function fillFromPools(count, pools, rng, fallbackWorld) {
  const quotas = pools.map((p) => Math.round(count * p.share));
  // Fix rounding drift on the largest pool.
  const drift = count - quotas.reduce((a, b) => a + b, 0);
  if (quotas.length) quotas[0] += drift;
  const out = [];
  const leftovers = [];
  pools.forEach((p, i) => {
    let q = quotas[i];
    while (q > 0 && p.sites.length) { out.push(p.sites.pop()); q -= 1; }
    leftovers.push(...p.sites);
    while (q > 0 && leftovers.length) { out.push(leftovers.pop()); q -= 1; }
    while (q > 0) {
      // Defensive fallback: site pools are sized generously above budgets, so
      // this path should never run — but never drop budgeted props (D2).
      const half = fallbackWorld / 2 - 60;
      out.push({ x: (rng() * 2 - 1) * half, z: (rng() * 2 - 1) * half, rotY: rng() * Math.PI * 2 });
      q -= 1;
    }
  });
  return out;
}

/**
 * Generates a full district layout descriptor for a level.
 * @param {object} level - a generateLevel(n) result (uses world, seed,
 *   propBudget/template, mechanics, isCapstone).
 * @param {{seed?: number}} [opts] - seed override (daily challenges).
 * @returns {object} pure-data descriptor; see module header for the contract.
 */
export function generateDistrict(level, opts = {}) {
  const seed = (typeof opts.seed === 'number' ? opts.seed : level.seed) >>> 0;
  const world = level.world;
  const budget = level.propBudget || level.template;
  const mechanics = level.mechanics || {};
  const rngLayout = mulberry32(seed);
  const rngProps = mulberry32((seed ^ 0x9E3779B9) >>> 0);
  const rngVisual = mulberry32((seed ^ 0xA511E9B3) >>> 0);

  const archetype = ARCHETYPES[Math.floor(rngLayout() * ARCHETYPES.length)];
  const { streets, blocks } = (archetype === 'grid' ? buildGrid : archetype === 'radial' ? buildRadial : buildOrganic)(world, rngLayout);
  const landmarkPlaza = assignZones(blocks, rngLayout, !!level.isCapstone);
  const landmark = {
    x: landmarkPlaza.x,
    z: landmarkPlaza.z,
    rotY: rngLayout() * Math.PI * 2,
  };

  // Site pools (shuffled once, then consumed).
  const sidewalks = shuffle(sidewalkSites(blocks, rngProps), rngProps);
  const parks = shuffle(parkSites(blocks, rngProps), rngProps);
  const plazas = shuffle(plazaSites(blocks, rngProps, landmarkPlaza), rngProps);
  const roads = shuffle(roadSites(streets, rngProps), rngProps);
  const { corners, largeCorners, frontage } = buildingSites(blocks, rngProps, world);

  const props = [];
  const perTier = {};

  // Spawn feast first: a tier-0 ring at the origin so ANY first move eats
  // within a second (V1's "0 mass after 10s" fix, now deterministic).
  const tier0 = budget[0];
  const feastCount = Math.min(SPAWN_FEAST_COUNT, tier0.baseCount);
  for (let i = 0; i < feastCount; i += 1) {
    const a = rngProps() * Math.PI * 2;
    const r = SPAWN_FEAST_RING[0] + rngProps() * (SPAWN_FEAST_RING[1] - SPAWN_FEAST_RING[0]);
    props.push({
      kind: tier0.kind, tierIndex: 0,
      x: Math.cos(a) * r, z: Math.sin(a) * r,
      rotY: rngProps() * Math.PI * 2,
      radius: tier0.baseRadius, mass: tier0.baseMass,
      golden: false, elite: false, variant: null, zone: 'park',
      onRoad: false, moving: null, mega: false, scaleMult: 1, spawnFeast: true,
    });
  }

  // Per-tier zoned placement. Fractions route each tier to its reading zone:
  // trash/bikes along sidewalks and park feasts, cars/buses on roads,
  // buildings on block corners facing streets (art-direction.md §1).
  const PLACEMENT = {
    trash: [{ sites: parks, share: 0.45, zone: 'park' }, { sites: sidewalks, share: 0.45, zone: 'sidewalk' }, { sites: plazas, share: 0.10, zone: 'plaza' }],
    bike: [{ sites: parks, share: 0.35, zone: 'park' }, { sites: sidewalks, share: 0.55, zone: 'sidewalk' }, { sites: plazas, share: 0.10, zone: 'plaza' }],
    car: [{ sites: roads, share: 0.75, zone: 'road' }, { sites: sidewalks, share: 0.25, zone: 'sidewalk' }],
    bus: [{ sites: roads, share: 1.0, zone: 'road' }],
    'building-small': [{ sites: corners, share: 0.5, zone: 'corner' }, { sites: frontage, share: 0.5, zone: 'frontage' }],
    'building-medium': [{ sites: corners, share: 0.7, zone: 'corner' }, { sites: frontage, share: 0.3, zone: 'frontage' }],
    'building-large': [{ sites: largeCorners.length ? largeCorners : corners, share: 1.0, zone: 'corner' }],
  };

  for (const tier of budget) {
    const plan = PLACEMENT[tier.kind];
    const count = tier.baseCount - (tier.tierIndex === 0 ? feastCount : 0);
    const sites = fillFromPools(count, plan.map((p) => ({ sites: p.sites, share: p.share })), rngProps, world);
    // Zone label per site isn't tracked through the pool pop; assign the
    // plan's first zone as a coarse tag (placement position is what matters).
    const onRoad = tier.kind === 'car' || tier.kind === 'bus';
    for (const site of sites) {
      props.push({
        kind: tier.kind,
        tierIndex: tier.tierIndex,
        x: site.x,
        z: site.z,
        rotY: tier.tierIndex <= 1 ? rngProps() * Math.PI * 2 : site.rotY,
        radius: tier.baseRadius,
        mass: tier.baseMass,
        golden: false,
        elite: false,
        variant: null,
        zone: plan[0].zone,
        onRoad: onRoad && typeof site.streetIndex === 'number',
        moving: null,
        mega: false,
        scaleMult: 1,
        spawnFeast: false,
        streetIndex: typeof site.streetIndex === 'number' ? site.streetIndex : undefined,
        lane: typeof site.lane === 'number' ? site.lane : undefined,
      });
    }
    perTier[tier.kind] = (perTier[tier.kind] || 0) + count + (tier.tierIndex === 0 ? feastCount : 0);
  }

  // Preserve the pre-remediation gameplay RNG stream: the former metro
  // variant selector shuffled this candidate list before traffic/mega/golden
  // selection. Visual selection itself has a separate seed stream below.
  const legacyVariant = level.metro && level.metro.propVariant;
  if (legacyVariant) {
    shuffle(props.filter((p) => p.kind === legacyVariant.kind && !p.spawnFeast), rngProps);
  }

  // Visual identity is independent from gameplay kind. District 1 establishes
  // one baseline per tier; later districts reserve >=25% of all initial
  // placements for IDs absent from their direct predecessor.
  const metroId = level.metro && level.metro.id;
  const districtN = level.levelInChapter || ((level.districtIndex || 0) + 1);
  const catalog = districtCatalog(metroId, districtN);
  if (!catalog) throw new Error(`Missing district visual catalog: ${metroId || 'unknown'}:${districtN}`);
  for (const p of props) {
    const fallback = catalog.mixes[p.kind] && catalog.mixes[p.kind][0];
    const descriptor = resolveVisualArchetype(fallback, p.kind);
    p.visualId = descriptor.id;
    p.collectionKey = descriptor.collectionKey;
  }
  const noveltyTarget = districtN > 1 ? Math.ceil(props.length * 0.25) : props.length;
  if (districtN > 1) {
    const introductionsByKind = new Map();
    for (const id of catalog.introduces) {
      const descriptor = resolveVisualArchetype(id);
      const list = introductionsByKind.get(descriptor.gameplayKind) || [];
      list.push(id);
      introductionsByKind.set(descriptor.gameplayKind, list);
    }
    const candidates = shuffle(props.filter((p) => introductionsByKind.has(p.kind)), rngVisual);
    if (candidates.length < noveltyTarget) {
      throw new Error(`${metroId}:${districtN} cannot meet visual novelty target (${candidates.length}/${noveltyTarget})`);
    }
    const perKindCursor = new Map();
    for (let i = 0; i < noveltyTarget; i += 1) {
      const p = candidates[i];
      const ids = introductionsByKind.get(p.kind);
      const cursor = perKindCursor.get(p.kind) || 0;
      const descriptor = resolveVisualArchetype(ids[cursor % ids.length], p.kind);
      perKindCursor.set(p.kind, cursor + 1);
      p.visualId = descriptor.id;
      p.collectionKey = descriptor.collectionKey;
    }
  }
  const currentVisualIds = new Set(props.map((p) => p.visualId));
  const predecessor = districtN > 1 ? districtCatalog(metroId, districtN - 1) : null;
  const predecessorIds = new Set(predecessor
    ? Object.values(predecessor.mixes).flat()
    : []);
  const novelCount = districtN === 1
    ? props.length
    : props.filter((p) => !predecessorIds.has(p.visualId)).length;
  const novelty = {
    novelCount,
    total: props.length,
    ratio: props.length ? novelCount / props.length : 0,
    visualIds: [...currentVisualIds].sort(),
  };

  // Moving traffic (L21+; rush at L81+): a share of road props drive their
  // street's lane. Systems animate; this only marks who moves and how.
  if (mechanics.traffic) {
    const share = mechanics.trafficRush ? 0.7 : 0.4;
    for (const p of props) {
      if (!p.onRoad || p.streetIndex === undefined) continue;
      if (rngProps() < share) {
        p.moving = {
          streetIndex: p.streetIndex,
          direction: p.lane >= 0 ? 1 : -1,
          speed: (mechanics.trafficRush ? 90 : 60) + rngProps() * 40,
        };
      }
    }
  }

  // Mega-props (L26+): a handful of oversized, triple-mass props.
  if (mechanics.megaProps) {
    const candidates = shuffle(props.filter((p) => p.tierIndex >= 4), rngProps);
    for (let i = 0; i < Math.min(4, candidates.length); i += 1) {
      candidates[i].mega = true;
      candidates[i].scaleMult = 1.6;
      candidates[i].mass *= 3;
    }
  }

  // Goldens (L1+; double at L46+; elite marks from L71+): seeded picks from
  // the mid tiers, mass stays base — the 8x (+10 coins) applies at eat-time.
  const goldenCount = Math.max(1, mechanics.goldenCount || 1);
  const midTierProps = shuffle(props.filter((p) => p.tierIndex >= 1 && p.tierIndex <= 5 && !p.spawnFeast), rngProps);
  for (let i = 0; i < Math.min(goldenCount, midTierProps.length); i += 1) {
    midTierProps[i].golden = true;
    if (mechanics.eliteGoldens) midTierProps[i].elite = true;
  }

  const totalBaseMass = props.reduce((sum, p) => sum + p.mass, 0);

  // Keep every placement inside the playable square (lesson B7's coordinate
  // contract): radial sector blocks near the diagonal corners can extend a
  // few units past ±world/2, and a prop outside the world is a prop the
  // player can never eat.
  const bound = world / 2 - 30;
  for (const p of props) {
    p.x = clamp(p.x, -bound, bound);
    p.z = clamp(p.z, -bound, bound);
    // The initial chase camera sits behind spawn along -Z. Keep building
    // tiers out of that sightline so a seeded corner/frontage site cannot
    // put the camera inside an instanced facade on frame one. Relocation is
    // deterministic and changes no count, mass, radius, flags, or RNG stream.
    if (p.tierIndex >= 4) {
      const clearHalfWidth = 90 + p.radius;
      if (Math.abs(p.x) < clearHalfWidth && p.z > -200 && p.z < 35) {
        p.x = clamp((p.x < 0 ? -1 : 1) * (clearHalfWidth + 45), -bound, bound);
      }
    }
    // Big Bell Plaza's immutable seed places several double-deckers directly
    // through the avatar. Correct only that authored invalid cluster; a global
    // bus relocation changes route pacing in otherwise valid districts.
    if (level.n === 30 && p.tierIndex === 3 && Math.hypot(p.x, p.z) < 90) {
      const clearRadius = 90 + p.radius;
      const angle = Math.atan2(p.z, p.x);
      p.x = clamp(Math.cos(angle) * clearRadius, -bound, bound);
      p.z = clamp(Math.sin(angle) * clearRadius, -bound, bound);
    }
  }
  landmark.x = clamp(landmark.x, -bound, bound);
  landmark.z = clamp(landmark.z, -bound, bound);
  // Landmark meshes are much wider than their anchor point (Big Bell Plaza
  // is the worst case), so reserve clearance for the complete silhouette.
  const landmarkClearHalfWidth = 720;
  if (Math.abs(landmark.x) < landmarkClearHalfWidth && landmark.z > -240 && landmark.z < 50) {
    landmark.x = clamp((landmark.x < 0 ? -1 : 1) * landmarkClearHalfWidth, -bound, bound);
  }

  return {
    seed,
    archetype,
    world,
    spawn: { x: 0, z: 0 },
    streets,
    blocks,
    landmarkPlaza,
    landmark,
    props,
    stats: {
      propCount: props.length,
      totalBaseMass,
      perTier,
      novelty,
    },
  };
}
