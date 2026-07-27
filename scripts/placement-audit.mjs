// Placement audit: checks that generated districts put objects where a city
// puts them — vehicles pointing DOWN their road, buildings on blocks rather
// than in the roadway, street lamps on the kerb rather than in traffic.
//
// Pure data, no THREE and no DOM: it runs generateDistrict() straight and
// measures the descriptor, so it is fast, deterministic and CI-safe.
// See `.wiki/0003-hole-feel-and-visual-fidelity/00-findings.md` §2.
//
// Run: node scripts/placement-audit.mjs [levelCount]

import { generateLevel } from '../src/data/levels.js';
import { generateDistrict } from '../src/content/districts.js';

const LEVELS = Number(process.argv[2]) || 20;

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
function insideRect(px, pz, r) {
  const c = Math.cos(r.rotY);
  const s = Math.sin(r.rotY);
  const dx = px - r.x;
  const dz = pz - r.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= r.w / 2 && Math.abs(lz) <= r.d / 2;
}

const totals = {
  vehicles: 0, vehiclesAligned: 0, vehiclesPerpendicular: 0,
  buildings: 0, buildingsInRoad: 0,
  lamps: 0, lampsInRoad: 0,
};
const archetypes = {};

for (let n = 1; n <= LEVELS; n += 1) {
  const layout = generateDistrict(generateLevel(n));
  archetypes[layout.archetype] = (archetypes[layout.archetype] || 0) + 1;

  for (const p of layout.props) {
    const inRoad = layout.streets.some((st) => insideRect(p.x, p.z, st));

    if (p.kind.startsWith('building')) {
      totals.buildings += 1;
      if (inRoad) totals.buildingsInRoad += 1;
    }
    if (p.kind === 'streetlamp') {
      totals.lamps += 1;
      if (inRoad) totals.lampsInRoad += 1;
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
    }
  }
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : 'n/a');

console.log(`Placement audit over levels 1-${LEVELS}`);
console.log(`layout archetypes: ${Object.entries(archetypes).map(([k, v]) => `${k}=${v}`).join(' ')}\n`);

const checks = [
  ['vehicles pointing DOWN their road', totals.vehiclesAligned, totals.vehicles, 'should be ~100%'],
  ['vehicles lying ACROSS their road', totals.vehiclesPerpendicular, totals.vehicles, 'should be 0%'],
  ['buildings standing IN the roadway', totals.buildingsInRoad, totals.buildings, 'should be 0%'],
  ['street lamps standing IN the roadway', totals.lampsInRoad, totals.lamps, 'should be 0%'],
];
for (const [label, a, b, want] of checks) {
  console.log(`  ${label.padEnd(38)} ${String(a).padStart(5)}/${String(b).padEnd(5)} ${pct(a, b).padStart(7)}   (${want})`);
}

const failed = totals.vehiclesPerpendicular > 0
  || totals.buildingsInRoad > 0
  || totals.lampsInRoad > 0;
console.log(`\n${failed ? 'FAIL' : 'PASS'} — see .wiki/0003-hole-feel-and-visual-fidelity/00-findings.md §2`);
process.exitCode = failed ? 1 : 0;
