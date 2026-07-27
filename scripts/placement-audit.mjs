// Placement audit: checks that generated districts put objects where a city
// puts them — vehicles pointing DOWN their road, buildings on blocks rather
// than in the roadway, street furniture on the kerb rather than in traffic.
//
// Pure data, no THREE and no DOM: it runs generateDistrict() straight and
// measures the descriptor, so it is fast, deterministic and CI-safe.
// See `.wiki/0003-hole-feel-and-visual-fidelity/00-findings.md` §2 and §8.
//
// FOOTPRINT, NOT CENTRE (00-findings.md §8 defect 2). The original audit asked
// whether a prop's CENTRE POINT fell inside a street rect. That metric is
// close to meaningless for anything large: a building 120u wide whose centre
// clears the kerb by 10u still overhangs most of the carriageway, and the
// audit scored it clean. It reported 0.2% of buildings in the road while the
// build visibly had buildings standing in the street. Every position check
// below now tests the prop's true ROTATED FOOTPRINT RECTANGLE — sized by the
// ART render scale (propkit.kindRenderScale), which is what actually draws —
// against the street rect, by separating-axis test.
//
// Run: node scripts/placement-audit.mjs [levelCount]

import { generateLevel } from '../src/data/levels.js';
import { generateDistrict } from '../src/content/districts.js';
import { kindFootprint, kindRenderScale } from '../src/content/propkit.js';

// Default to the full campaign. The tightest ceiling here is 0.5%, and a
// 20-level sample only yields ~1000 buildings — about 5 buildings of
// resolution — so it reds and greens on sampling noise. 100 levels costs a few
// seconds and makes the percentages mean what they say. Pass a smaller count
// as argv[2] for a quick iteration loop, but gate on the default.
const LEVELS = Number(process.argv[2]) || 100;

// Prop long-axis convention (src/content/propkit.js DIMENSIONS): every prop
// mesh is built with its LENGTH along local +Z (car d=4.2 vs w=2.0, bus
// d=9.0 vs w=2.6). Streets carry their length along local +X (districts.js
// header: "Streets always carry their LENGTH in w (long axis = local X)").
// So a vehicle is aligned with its road only when its local +Z matches the
// street's local +X.
const HEADING_ALIGNED = 0.9;      // |dot| above this = pointing down the road
const HEADING_PERPENDICULAR = 0.1; // |dot| below this = lying across the road

// Rect convention (districts.js header): local +X -> world (cos rotY, -sin rotY),
// local +Z -> world (sin rotY, cos rotY).
function axes(rotY) {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return { ax: { x: c, z: -s }, az: { x: s, z: c } };
}

// Projected half-width of rect `r` (half-extents hw along its local X, hd
// along its local Z) onto a unit world axis.
function projectedHalf(r, axis) {
  const { ax, az } = axes(r.rotY);
  return Math.abs(ax.x * axis.x + ax.z * axis.z) * r.hw
       + Math.abs(az.x * axis.x + az.z * axis.z) * r.hd;
}

// Separating-axis test for two oriented rectangles in the XZ plane. Returns
// the smallest penetration depth over the four candidate axes, or 0 when a
// separating axis exists (= no overlap).
// Sub-unit overlap is not a placement defect, it is floating point: a prop
// pushed exactly onto the kerb line shares an edge with the carriageway. One
// world unit is ~9cm at WORLD_UNITS_PER_METRE, so a quarter of one is far
// below anything that can be seen.
const OVERLAP_EPSILON = 0.25;

function obbOverlapDepth(a, b) {
  let min = Infinity;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const candidates = [];
  for (const r of [a, b]) {
    const { ax, az } = axes(r.rotY);
    candidates.push(ax, az);
  }
  for (const axis of candidates) {
    const dist = Math.abs(dx * axis.x + dz * axis.z);
    const reach = projectedHalf(a, axis) + projectedHalf(b, axis);
    const depth = reach - dist;
    if (depth <= OVERLAP_EPSILON) return 0;
    if (depth < min) min = depth;
  }
  return min;
}

function streetRect(st) {
  return { x: st.x, z: st.z, hw: st.w / 2, hd: st.d / 2, rotY: st.rotY };
}

// The prop's footprint AS DRAWN: authored local w/d scaled by the art render
// scale, oriented by the prop's own yaw.
function propRect(p) {
  const dim = kindFootprint(p.kind);
  const s = kindRenderScale(p.kind, p.radius * (p.scaleMult || 1));
  return { x: p.x, z: p.z, hw: (dim.w / 2) * s, hd: (dim.d / 2) * s, rotY: p.rotY || 0 };
}

// Kinds that must keep their footprint out of the carriageway. Vehicles are
// excluded on purpose — the road is where they belong.
const OFF_ROAD_KINDS = new Set([
  'building-small', 'building-medium', 'building-large',
  'streetlamp', 'tree', 'person', 'trash', 'bike',
]);

// Nearest street to a point, and which side of it the point is on. Used for
// the two ORIENTATION checks: a lamp arm must lean over the carriageway, a
// building facade must face the street rather than the block interior.
// Returns EVERY street within maxDist, not just the closest. A corner
// building or a corner lamp has two carriageways to serve and facing either
// one is correct; scoring it against an arbitrary tie-break would invent
// failures that are not there.
function nearbyStreets(x, z, streets, maxDist) {
  const hits = [];
  for (const st of streets) {
    const c = Math.cos(st.rotY);
    const s = Math.sin(st.rotY);
    const lx = (x - st.x) * c - (z - st.z) * s;
    const lz = (x - st.x) * s + (z - st.z) * c;
    if (Math.abs(lx) > st.w / 2) continue;
    if (Math.abs(lz) - st.d / 2 <= maxDist) hits.push({ st, lz });
  }
  return hits;
}

// Does `dir` (a unit world vector) point at the carriageway of any hit?
function pointsAtAnyRoad(hits, dir) {
  for (const hit of hits) {
    const road = towardRoad(hit);
    if (dir.x * road.x + dir.z * road.z > 0.7) return true;
  }
  return false;
}

// Unit world direction from a point toward the carriageway of `hit`.
function towardRoad(hit) {
  const { ax, az } = axes(hit.st.rotY);
  const sign = hit.lz > 0 ? -1 : 1;
  return { x: az.x * sign, z: az.z * sign };
}

const totals = {
  vehicles: 0, vehiclesAligned: 0, vehiclesPerpendicular: 0,
  vehiclesInLane: 0,
  buildings: 0, buildingsInRoad: 0, buildingOverhang: 0,
  buildingsNearStreet: 0, buildingsFacingStreet: 0,
  lamps: 0, lampsInRoad: 0,
  lampsKerbside: 0, lampsArmOverRoad: 0,
  clutter: 0, clutterInRoad: 0,
  buildingPairs: 0, buildingsIntersecting: 0, worstIntersection: 0, worstIntersectionAt: '',
};
const archetypes = {};

for (let n = 1; n <= LEVELS; n += 1) {
  const layout = generateDistrict(generateLevel(n));
  archetypes[layout.archetype] = (archetypes[layout.archetype] || 0) + 1;
  const streets = layout.streets.map(streetRect);

  // Buildings are placed from several site pools and then MOVED by the
  // road-escape pass, and neither step consults the others' results. Nothing
  // measured the consequence until now — see findings section 18.
  const buildingRects = layout.props
    .filter((q) => q.kind.startsWith('building'))
    .map((q) => ({ r: propRect(q), kind: q.kind }));
  for (let i = 0; i < buildingRects.length; i += 1) {
    for (let j = i + 1; j < buildingRects.length; j += 1) {
      const ra = buildingRects[i];
      const rb = buildingRects[j];
      const reach = Math.hypot(ra.r.hw, ra.r.hd) + Math.hypot(rb.r.hw, rb.r.hd);
      if (Math.hypot(ra.r.x - rb.r.x, ra.r.z - rb.r.z) > reach) continue;
      totals.buildingPairs += 1;
      const depth = obbOverlapDepth(ra.r, rb.r);
      if (depth > 0) {
        totals.buildingsIntersecting += 1;
        if (depth > totals.worstIntersection) {
          totals.worstIntersection = depth;
          totals.worstIntersectionAt = `L${n} ${ra.kind}/${rb.kind}`;
        }
      }
    }
  }

  for (const p of layout.props) {
    if (OFF_ROAD_KINDS.has(p.kind)) {
      const rect = propRect(p);
      let depth = 0;
      for (const st of streets) {
        const d = obbOverlapDepth(rect, st);
        if (d > depth) depth = d;
      }
      const isBuilding = p.kind.startsWith('building');
      if (isBuilding) {
        totals.buildings += 1;
        if (depth > 0) { totals.buildingsInRoad += 1; totals.buildingOverhang += depth; }
        // Facade orientation: propkit puts the street face on local +Z, so
        // that axis must point at the nearest carriageway.
        const hits = nearbyStreets(p.x, p.z, layout.streets, 160);
        if (hits.length) {
          totals.buildingsNearStreet += 1;
          const face = { x: Math.sin(p.rotY), z: Math.cos(p.rotY) };
          if (pointsAtAnyRoad(hits, face)) totals.buildingsFacingStreet += 1;
        }
      } else if (p.kind === 'streetlamp') {
        totals.lamps += 1;
        if (depth > 0) totals.lampsInRoad += 1;
        // Arm orientation: the lamp's curved arm overhangs local +X and must
        // lean over the carriageway, not into a facade.
        const hits = nearbyStreets(p.x, p.z, layout.streets, 120);
        if (hits.length) {
          totals.lampsKerbside += 1;
          const arm = { x: Math.cos(p.rotY), z: -Math.sin(p.rotY) };
          if (pointsAtAnyRoad(hits, arm)) totals.lampsArmOverRoad += 1;
        }
      } else {
        totals.clutter += 1;
        if (depth > 0) totals.clutterInRoad += 1;
      }
    }

    if (p.onRoad && p.streetIndex !== undefined) {
      const st = layout.streets[p.streetIndex];
      // street long axis (local +X) and prop heading (local +Z) in world space
      const sx = Math.cos(st.rotY);
      const sz = -Math.sin(st.rotY);
      const hx = Math.sin(p.rotY);
      const hz = Math.cos(p.rotY);
      const dot = Math.abs(sx * hx + sz * hz);
      totals.vehicles += 1;
      if (dot > HEADING_ALIGNED) totals.vehiclesAligned += 1;
      else if (dot < HEADING_PERPENDICULAR) totals.vehiclesPerpendicular += 1;
      // A vehicle should also FIT the lane it was assigned: its whole
      // footprint inside the carriageway, on its own side of the centreline.
      const rect = propRect(p);
      const cross = axes(st.rotY).az; // street local +Z = across the road
      const off = (p.x - st.x) * cross.x + (p.z - st.z) * cross.z;
      const half = projectedHalf(rect, cross);
      const kerbOk = Math.abs(off) + half <= st.d / 2;
      const centrelineOk = Math.abs(off) - half >= 0;
      if (kerbOk && centrelineOk) totals.vehiclesInLane += 1;
    }
  }
}

const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmt = (a, b) => (b ? `${pct(a, b).toFixed(1)}%` : 'n/a');

// Headings are exact — a rotation is either right or it isn't. Positions carry
// a small tolerance: districts.js resolves road overlaps by pushing a prop to
// the nearest kerb, and at a radial archetype's hub, where up to eight spokes
// converge on one point, there is genuinely no clear ground within the block to
// push to. A handful of props per hundred levels stay wedged there.
const POSITION_TOLERANCE_PCT = 0.5;

console.log(`Placement audit over levels 1-${LEVELS}  (FOOTPRINT-based, see header)`);
console.log(`layout archetypes: ${Object.entries(archetypes).map(([k, v]) => `${k}=${v}`).join(' ')}\n`);

const checks = [
  ['vehicles pointing DOWN their road', totals.vehiclesAligned, totals.vehicles, 100, 'must be 100%'],
  ['vehicles lying ACROSS their road', totals.vehiclesPerpendicular, totals.vehicles, 0, 'must be 0%'],
  ['vehicles FITTING their lane', totals.vehiclesInLane, totals.vehicles, 100, 'must be 100%'],
  ['building FOOTPRINTS in the roadway', totals.buildingsInRoad, totals.buildings, POSITION_TOLERANCE_PCT, `<= ${POSITION_TOLERANCE_PCT}%`],
  ['street lamp FOOTPRINTS in the roadway', totals.lampsInRoad, totals.lamps, POSITION_TOLERANCE_PCT, `<= ${POSITION_TOLERANCE_PCT}%`],
  ['clutter FOOTPRINTS in the roadway', totals.clutterInRoad, totals.clutter, POSITION_TOLERANCE_PCT, `<= ${POSITION_TOLERANCE_PCT}%`],
  ['kerbside lamp ARMS over the road', totals.lampsArmOverRoad, totals.lampsKerbside, 95, '>= 95%'],
  ['building FACADES facing their street', totals.buildingsFacingStreet, totals.buildingsNearStreet, 90, '>= 90%'],
];
let failed = false;
for (const [label, a, b, limit, want] of checks) {
  // Orientation rows and the two vehicle-heading rows are FLOORS (a minimum
  // percentage that must be met); the position rows are CEILINGS.
  const value = pct(a, b);
  const ok = limit >= 90 ? value >= limit : value <= limit;
  if (!ok) failed = true;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(38)} ${String(a).padStart(5)}/${String(b).padEnd(5)} ${fmt(a, b).padStart(7)}   (${want})`);
}

if (totals.buildingsInRoad) {
  const mean = totals.buildingOverhang / totals.buildingsInRoad;
  console.log(`\n  mean carriageway overhang of an offending building: ${mean.toFixed(1)}u`);
}

// Building-on-building intersection: INFORMATIONAL, deliberately not gated.
// See findings §18. No pass threshold is given because any threshold today's
// number satisfies would be one invented to be satisfied, rather than one
// derived from what a city should look like. The number is printed so it stays
// visible and so a future change can be read against it.
console.log('\n  INFORMATIONAL (not gated, see findings §18):');
console.log(`    buildings intersecting another building: ${totals.buildingsIntersecting}`
  + ` of ${totals.buildingPairs} close pairs`
  + `  (${fmt(totals.buildingsIntersecting, totals.buildings)} of all buildings)`);
console.log(`    worst intersection depth: ${totals.worstIntersection.toFixed(1)}u  ${totals.worstIntersectionAt}`);

console.log(`\n${failed ? 'FAIL' : 'PASS'} — see .wiki/0003-hole-feel-and-visual-fidelity/00-findings.md §2, §8`);
process.exitCode = failed ? 1 : 0;
