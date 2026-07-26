// Authored city layout for level 1 ("Suburbs", Harbor Metropolis): a real
// street grid with blocks, roads, a park, a parking lot, and a landmark plaza
// — instead of the uniform-random scatter used by every other level.
//
// Pure data module: NO THREE import, no DOM, fully deterministic (seeded
// RNG), so the same level always produces the same city and the test suite
// can assert on the layout headlessly. src/main.js consumes the returned
// blocks/roads/props and does all mesh construction.
//
// Gameplay contract preserved: every swallowable prop from the level's
// LEVEL_TEMPLATE (src/data/levels.js) is still spawned with its exact
// template baseRadius/baseMass/baseCount — the layout only decides WHERE
// they stand and which mesh skin they wear ('apartment'/'office' stand in for
// the building-medium/building-large slots). On top of that it adds the new
// street-furniture kinds (tree/streetlight/bench/mailbox/hydrant/speed-bump)
// with their own modest radius/mass, tuned so all except trees fit under the
// starting avatar's size gate (26 * 0.78 = 20.3 — see src/engine/avatar.js
// radius() and src/systems/swallow.js DEFAULT_SIZE_GATE), preserving the
// tutorial's small-to-large food ladder.

// Deterministic PRNG (mulberry32) — layout must be reproducible run-to-run
// and test-to-test; Math.random() would make every check below untestable.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY_SEED = 20260725;
// Roads are wide enough for scaled traffic (a gameplay-radius-27 car renders
// ~46 units long — see propkit.js scaleForRadius) with room for two bus lanes.
export const ROAD_WIDTH = 90;
export const ROAD_SPACING = 420;

// Swallow stats for the street-furniture kinds (no template tier of their
// own). See the header comment for the size-gate tuning rationale.
export const STREET_PROPS = {
  tree: { radius: 24, mass: 8 },
  streetlight: { radius: 19, mass: 5 },
  bench: { radius: 18, mass: 4 },
  mailbox: { radius: 16, mass: 3 },
  hydrant: { radius: 15, mass: 3 },
  'speed-bump': { radius: 17, mass: 3 },
};

// Real-world car paint palette (level-1 cars get per-instance colors instead
// of the metro accent so the streets read as traffic, not clones).
const CAR_COLORS = ['#c0392b', '#2980b9', '#d5dbdb', '#f39c12', '#5d6d7e', '#1c2833', '#7d3c98', '#148f77'];
const BUS_COLORS = ['#e6b93d', '#d9a52e', '#c99727'];

export function generateCityLayout(level) {
  const world = level.world;
  const half = world / 2;
  const rng = mulberry32(CITY_SEED + level.n);

  // --- Street grid: centerlines every ROAD_SPACING units, one through the
  // origin (the avatar spawn sits on the central intersection). ------------
  const offsets = [];
  for (let a = 0; a <= half - 300; a += ROAD_SPACING) offsets.push(a);
  const roadAt = [];
  for (const a of offsets) {
    if (a === 0) roadAt.push(0);
    else roadAt.push(-a, a);
  }
  roadAt.sort((x, y) => x - y);

  const roads = [];
  for (const at of roadAt) {
    roads.push({ axis: 'x', at, width: ROAD_WIDTH });
    roads.push({ axis: 'z', at, width: ROAD_WIDTH });
  }

  // --- Blocks: the rectangles between road edges. --------------------------
  const cuts = [-half];
  for (const at of roadAt) cuts.push(at - ROAD_WIDTH / 2, at + ROAD_WIDTH / 2);
  cuts.push(half);
  const intervals = [];
  for (let i = 0; i + 1 < cuts.length; i += 2) intervals.push([cuts[i], cuts[i + 1]]);

  const blocks = [];
  for (const [x0, x1] of intervals) {
    for (const [z0, z1] of intervals) {
      blocks.push({
        x0, x1, z0, z1,
        x: (x0 + x1) / 2, z: (z0 + z1) / 2,
        w: x1 - x0, d: z1 - z0,
        type: 'mixed',
      });
    }
  }

  // --- Zoning: claim specific blocks by a point known to fall inside them.
  // The park and the parking lot flank the spawn intersection diagonally so
  // the opening camera frames both; downtown sits center-adjacent; the plaza
  // (landmark home) is a far-corner destination worth routing to. ----------
  const claimed = new Set();
  function claim(px, pz, type) {
    const b = blocks.find((blk) => !claimed.has(blk) && px >= blk.x0 && px <= blk.x1 && pz >= blk.z0 && pz <= blk.z1);
    if (b) {
      b.type = type;
      claimed.add(b);
    }
    return b;
  }

  const park = claim(ROAD_SPACING * 0.5, -ROAD_SPACING * 0.5, 'park');
  const lot = claim(-ROAD_SPACING * 0.5, ROAD_SPACING * 0.5, 'lot');
  const plaza = claim(ROAD_SPACING * 1.5, ROAD_SPACING * 1.5, 'plaza');
  // Downtown: 9 blocks ringing the center, ONE office tower each (an office's
  // scaled footprint ~153 units leaves no room for a second on a ~330 block).
  const downtownPoints = [
    [-0.5, -0.5], [0.5, 0.5], [-1.5, -0.5], [1.5, 0.5], [-0.5, 1.5],
    [0.5, -1.5], [-1.5, 1.5], [1.5, -1.5], [1.5, 1.5],
  ];
  for (const [fx, fz] of downtownPoints) claim(fx * ROAD_SPACING, fz * ROAD_SPACING, 'downtown');
  // Residential: 15 blocks, one apartment mid-rise each.
  const residentialPoints = [
    [-1.5, -1.5], [-2.5, -1.5], [-2.5, -0.5], [-2.5, 0.5], [-2.5, 1.5],
    [-1.5, 2.5], [-0.5, 2.5], [0.5, 2.5], [1.5, 2.5], [2.5, 1.5],
    [2.5, 0.5], [2.5, -0.5], [2.5, -1.5], [1.5, -2.5], [-1.5, -2.5],
  ];
  for (const [fx, fz] of residentialPoints) claim(fx * ROAD_SPACING, fz * ROAD_SPACING, 'residential');

  // --- Prop assembly --------------------------------------------------------
  const props = [];
  function put(kind, x, z, rotY, stat, color) {
    props.push({
      kind, x, z, rotY,
      radius: stat.baseRadius != null ? stat.baseRadius : stat.radius,
      mass: stat.baseMass != null ? stat.baseMass : stat.mass,
      ...(color ? { color } : {}),
    });
  }

  const tierByKind = {};
  level.template.forEach((t) => { tierByKind[t.kind] = t; });

  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const cardinal = () => Math.floor(rng() * 4) * (Math.PI / 2);

  // Buildings: offices downtown (building-large slot), apartments in the
  // residential blocks (building-medium slot), storefronts lining the mixed
  // blocks' street edges (building-small slot). One big building per block —
  // scaled footprints (see propkit.js scaleForRadius) fill most of a block.
  const officeSlots = [];
  const apartmentSlots = [];
  const storefrontSlots = [];
  for (const b of blocks) {
    if (b.type === 'downtown') {
      officeSlots.push({ x: b.x, z: b.z, rotY: cardinal() });
    } else if (b.type === 'residential') {
      apartmentSlots.push({ x: b.x, z: b.z, rotY: cardinal() });
    } else if (b.type === 'mixed') {
      for (const fx of [0.2, 0.5, 0.8]) {
        storefrontSlots.push({ x: b.x0 + b.w * fx, z: b.z0 + 22, rotY: 0 });
      }
    }
  }
  // Overflow safety: if zoning produced fewer slots than the template demands
  // (only possible on non-standard world sizes), pad with mixed-block centers.
  const mixedBlocks = blocks.filter((b) => b.type === 'mixed');
  let overflowIdx = 0;
  function ensureSlots(slots, needed) {
    while (slots.length < needed && mixedBlocks.length) {
      const b = mixedBlocks[overflowIdx % mixedBlocks.length];
      overflowIdx += 1;
      slots.push({ x: b.x, z: b.z, rotY: cardinal() });
    }
  }

  const officeTier = tierByKind['building-large'];
  const apartmentTier = tierByKind['building-medium'];
  const storefrontTier = tierByKind['building-small'];
  ensureSlots(officeSlots, officeTier.baseCount);
  ensureSlots(apartmentSlots, apartmentTier.baseCount);
  ensureSlots(storefrontSlots, storefrontTier.baseCount);
  officeSlots.slice(0, officeTier.baseCount).forEach((s) => put('office', s.x, s.z, s.rotY, officeTier));
  apartmentSlots.slice(0, apartmentTier.baseCount).forEach((s) => put('apartment', s.x, s.z, s.rotY, apartmentTier));
  storefrontSlots.slice(0, storefrontTier.baseCount).forEach((s) => put('building-small', s.x, s.z, s.rotY, storefrontTier));

  // Park: tree cluster + a bench-lined path. The park neighbors the spawn
  // intersection, so its benches/trees double as the level's opening view.
  if (park) {
    for (let i = 0; i < 14; i += 1) {
      put('tree', park.x0 + 45 + rng() * (park.w - 90), park.z0 + 45 + rng() * (park.d - 90), rng() * Math.PI * 2, STREET_PROPS.tree);
    }
    for (let i = 0; i < 6; i += 1) {
      put('bench', park.x0 + park.w * (0.15 + 0.14 * i), park.z + (i % 2 ? 12 : -12), i % 2 ? 0 : Math.PI, STREET_PROPS.bench);
    }
  }

  // Parking lot: 3 rows of 6 parked cars with speed bumps at the row ends.
  if (lot) {
    const carTier = tierByKind.car;
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        put('car', lot.x0 + lot.w * 0.18 + c * ((lot.w * 0.64) / 5), lot.z0 + lot.d * (0.25 + 0.25 * r), Math.PI / 2 + (rng() < 0.5 ? 0 : Math.PI), carTier, pick(CAR_COLORS));
      }
    }
    for (let i = 0; i < 3; i += 1) {
      const z = lot.z0 + lot.d * (0.25 + 0.25 * i);
      put('speed-bump', lot.x0 + lot.w * 0.08, z, Math.PI / 2, STREET_PROPS['speed-bump']);
      put('speed-bump', lot.x0 + lot.w * 0.92, z, Math.PI / 2, STREET_PROPS['speed-bump']);
    }
  }

  // Curbside parking: spots along every road, alternating sides, kept clear
  // of intersections. Fills the remainder of the template's car count.
  const curbSpots = [];
  for (const road of roads) {
    // Parked fully on the asphalt against the curb: a scaled car is ~22 units
    // wide, so its center sits ~11 units inside the road edge.
    const side = ROAD_WIDTH / 2 - 11;
    for (let p = -half + 90; p <= half - 90; p += 95) {
      if (roadAt.some((a) => Math.abs(p - a) < ROAD_WIDTH / 2 + 30)) continue;
      const s = curbSpots.length % 2 ? side : -side;
      if (road.axis === 'x') curbSpots.push({ x: p, z: road.at + s, rotY: Math.PI / 2 + (s > 0 ? Math.PI : 0) });
      else curbSpots.push({ x: road.at + s, z: p, rotY: s > 0 ? Math.PI : 0 });
    }
  }
  const carTier = tierByKind.car;
  const lotCarCount = lot ? 18 : 0;
  curbSpots.slice(0, carTier.baseCount - lotCarCount).forEach((s) => put('car', s.x, s.z, s.rotY, carTier, pick(CAR_COLORS)));

  // Buses: moving-traffic stand-ins, lane-offset along random roads.
  const busTier = tierByKind.bus;
  for (let i = 0; i < busTier.baseCount; i += 1) {
    const road = pick(roads);
    const p = -half + 70 + rng() * (world - 140);
    const lane = (rng() < 0.5 ? -1 : 1) * ROAD_WIDTH * 0.22;
    if (road.axis === 'x') put('bus', p, road.at + lane, lane > 0 ? Math.PI / 2 : -Math.PI / 2, busTier, pick(BUS_COLORS));
    else put('bus', road.at + lane, p, lane > 0 ? 0 : Math.PI, busTier, pick(BUS_COLORS));
  }

  // Streetlights: both sides of every road (alternating), arms over the
  // asphalt, skipped near intersections so they never stand in the roadway.
  for (const road of roads) {
    const off = ROAD_WIDTH / 2 + 3;
    let sideIdx = 0;
    for (let p = -half + 60; p <= half - 60; p += 240) {
      if (roadAt.some((a) => Math.abs(p - a) < ROAD_WIDTH / 2 + 10)) continue;
      const s = sideIdx % 2 ? off : -off;
      sideIdx += 1;
      if (road.axis === 'x') put('streetlight', p, road.at + s, s > 0 ? Math.PI : 0, STREET_PROPS.streetlight);
      else put('streetlight', road.at + s, p, s > 0 ? -Math.PI / 2 : Math.PI / 2, STREET_PROPS.streetlight);
    }
  }

  // Hydrants + mailboxes: street-corner furniture at ~70% of intersections.
  const corner = ROAD_WIDTH / 2 + 8;
  for (const ax of roadAt) {
    for (const az of roadAt) {
      if (rng() < 0.7) put('hydrant', ax + corner, az + corner, rng() * Math.PI * 2, STREET_PROPS.hydrant);
      if (rng() < 0.7) put('mailbox', ax - corner, az - corner, rng() * Math.PI * 2, STREET_PROPS.mailbox);
    }
  }

  // Street trees: sidewalk-edge greenery on built blocks (the park supplies
  // its own cluster; the lot and plaza stay clear).
  for (const b of blocks) {
    if (b.type !== 'mixed' && b.type !== 'residential' && b.type !== 'downtown') continue;
    const n = rng() < 0.6 ? 1 + Math.floor(rng() * 2) : 0;
    for (let i = 0; i < n; i += 1) {
      put('tree', b.x0 + 30 + rng() * (b.w - 60), b.z0 + 22, 0, STREET_PROPS.tree);
    }
  }

  // Plaza dressing: benches ringing the landmark's clearing.
  if (plaza) {
    for (let i = 0; i < 4; i += 1) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      put('bench', plaza.x + Math.cos(ang) * 120, plaza.z + Math.sin(ang) * 120, -ang, STREET_PROPS.bench);
    }
  }

  // Bikes: sidewalk scatter near block edges (any block type — bikes are
  // everywhere in a real city).
  const bikeTier = tierByKind.bike;
  for (let i = 0; i < bikeTier.baseCount; i += 1) {
    const b = pick(blocks);
    const edge = Math.floor(rng() * 4);
    let x;
    let z;
    if (edge === 0) { x = b.x0 + 16; z = b.z0 + rng() * b.d; }
    else if (edge === 1) { x = b.x1 - 16; z = b.z0 + rng() * b.d; }
    else if (edge === 2) { z = b.z0 + 16; x = b.x0 + rng() * b.w; }
    else { z = b.z1 - 16; x = b.x0 + rng() * b.w; }
    put('bike', x, z, rng() * Math.PI * 2, bikeTier);
  }

  // Trash: mostly pad scatter with a center bias (the densest litter sits in
  // the inner blocks around the spawn, reinforcing — not replacing — main.js's
  // guaranteed opening bite ring), but ~25% litters the ROADS themselves:
  // parked cars and buses own the asphalt and both are too big to eat at
  // spawn, so without street litter a player who just drives straight down a
  // road finds nothing edible for the first stretch.
  const trashTier = tierByKind.trash;
  const centralBlocks = blocks.filter((b) => Math.abs(b.x) < half * 0.5 && Math.abs(b.z) < half * 0.5);
  for (let i = 0; i < trashTier.baseCount; i += 1) {
    if (rng() < 0.25) {
      const road = pick(roads);
      const p = -half + 60 + rng() * (world - 120);
      const off = (rng() * 2 - 1) * (ROAD_WIDTH / 2 - 6);
      if (road.axis === 'x') put('trash', p, road.at + off, rng() * Math.PI * 2, trashTier);
      else put('trash', road.at + off, p, rng() * Math.PI * 2, trashTier);
    } else {
      const pool = rng() < 0.55 && centralBlocks.length ? centralBlocks : blocks;
      const b = pick(pool);
      put('trash', b.x0 + 22 + rng() * (b.w - 44), b.z0 + 22 + rng() * (b.d - 44), rng() * Math.PI * 2, trashTier);
    }
  }

  return {
    roads,
    blocks,
    props,
    plaza: plaza ? { x: plaza.x, z: plaza.z } : null,
    roadWidth: ROAD_WIDTH,
  };
}
