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
import { STREET_PROP_TIERS } from '../data/levels.js';
import {
  districtCatalog, resolveVisualArchetype, streetPropArchetypeIds,
} from './archetypes.js';
import { CHICAGO_CITY_OBJECTS } from './city-object-catalog.js';
// Placement has to know how big a prop actually DRAWS, not how big it eats.
// propkit is deliberately THREE-free and DOM-free at module scope (see its
// header), so importing it here keeps this module a pure-data generator.
import { kindFootprint, kindRenderScale } from './propkit.js';
import { physicalBoundsFor } from './physical-bounds.js';
import { landmarkBoundsFor } from './physical-bounds.js';
import { capstoneGateRadius } from '../data/formulas.js';

export const ARCHETYPES = ['grid', 'radial', 'organic'];
export const ZONES = ['plaza', 'avenue', 'park', 'residential'];

// Guaranteed tier-0 ring right at spawn (D2 / game-design.md §2 acceptance:
// ≥5 edible props visible on level 1). Placed from within the tier-0 budget,
// not on top of it.
const SPAWN_FEAST_COUNT = 12;
const SPAWN_FEAST_RING = [50, 130];

// Relative likelihood a golden lands on each prop tier (index = tierIndex).
// Tiers 0 and 6 are out of the draw entirely (0 = too trivial to feel like a
// prize, 6 = the capstone). Tier 5 is rare but POSSIBLE — see the draw below
// and findings §17.
//
// 0.6 is deliberately the MOST GENEROUS value that holds, not the tightest.
// Measured over 8 position salts x 5 golden RNG streams (40 runs): the only
// tier-5-attributable failure disappears between 0.75 and 0.6, and every value
// from 0.6 down to 0 (hard exclusion) scores identically. Since the response is
// flat below the edge, the weight was chosen on product grounds — keep the
// jackpot-on-a-skyscraper possible — rather than by tuning for margin. Lowering
// it buys NO test headroom and only makes the game duller.
const GOLDEN_TIER_WEIGHTS = [0, 1, 1, 1, 1, 0.6, 0];

// Road clearance is measured against the prop's RENDERED FOOTPRINT, not a
// constant and not its centre. The previous constants below were the defect:
// a building whose centre cleared the kerb by 10u still overhung the
// carriageway by most of its 66-120u width, which is why a centre-based audit
// read 0.2% while the street was visibly full of buildings.
//
// `propFootprintRect()` returns the prop's true ORIENTED footprint rectangle.
// Deliberately not the half-diagonal: a 150u-wide building standing square to
// a square street only reaches 75u toward the carriageway, and clearing it by
// its 106u half-diagonal over-insets it by 41% — enough to pull whole
// frontages off the kerb and into the middle of the block, which is both the
// wrong picture and a materially longer route for the soak bot. Projecting the
// real rectangle onto the street's own axes is what the placement audit
// measures, so generator and audit now agree exactly.
//   * Vehicles are exempt — they BELONG in the carriageway.
//   * Buildings additionally reserve a pavement strip, so the facade lands ON
//     the kerb line the way the reference does with a footway in front of it.
//   * Tier-0 clutter (trash, bikes, people, trees) draws from the same
//     sidewalk pool as the lamps and used to get no clearance pass at all, so
//     every one of them stood in traffic.
// Position-only and RNG-free, exactly like the pass it replaces.
//
// PAVEMENT_WIDTH is the footway reserved between the kerb and a building
// facade, and also the band the sidewalk site pool is placed in
// (see sidewalkSites): 24u is
// ~2.2m at propkit's WORLD_UNITS_PER_METRE, a real pavement, and wide enough
// to seat a street lamp's ~9u footprint without it overhanging the kerb.
const PAVEMENT_WIDTH = 24;
const ROADSIDE_KINDS = new Set(['trash', 'bike', 'tree', 'person', 'streetlamp']);

function propFootprintRect(p) {
  const kind = p.kind;
  if (kind === 'car' || kind === 'bus') return null;
  if (!kind.startsWith('building') && !ROADSIDE_KINDS.has(kind)) return null;
  const dim = kindFootprint(kind);
  const s = kindRenderScale(kind, p.radius * (p.scaleMult || 1));
  // Street furniture sits ON the pavement and only has to clear the
  // carriageway by its own footprint — a lamp arm overhanging the kerb is
  // what a real street looks like, and the arm is not part of the footprint.
  const pad = kind.startsWith('building') ? PAVEMENT_WIDTH : 0;
  return { hw: (dim.w / 2) * s + pad, hd: (dim.d / 2) * s + pad, rotY: p.rotY || 0 };
}

// Half-width of an oriented rect projected onto a unit world axis.
function projectedHalf(rect, ax, az) {
  const c = Math.cos(rect.rotY);
  const s = Math.sin(rect.rotY);
  // local +X -> (c, -s), local +Z -> (s, c)  [module header contract]
  return Math.abs(c * ax - s * az) * rect.hw + Math.abs(s * ax + c * az) * rect.hd;
}

// Spawn-camera sightline kept clear of building tiers (see the relocation pass
// at the end of generateDistrict). The -Z bound must stay BEHIND the camera's
// spawn standoff: at spawn r=26 with camera.js DIST_RADIUS_MULT=12 and
// PITCH_DEFAULT=55° the eye sits at z ~= -179, and the orbit pitch floor (35°)
// pushes it to ~= -256. The half-width is widened by each prop's own radius.
const CAMERA_CORRIDOR_HALF_WIDTH = 90;
const CAMERA_CORRIDOR_Z_MIN = -280;
const CAMERA_CORRIDOR_Z_MAX = 35;

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

// Same rotation, applied to a DIRECTION (no translation) — used to turn a
// block-local outward normal into a world heading.
function rectDir(rect, lx, lz) {
  const c = Math.cos(rect.rotY);
  const s = Math.sin(rect.rotY);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

// --- Prop heading helpers ----------------------------------------------------
// Props are authored in propkit.js with a consistent local frame, and getting
// these wrong is invisible in the data but glaring on screen (every vehicle in
// the game used to sit broadside across its lane). Two conventions matter:
//
//   * BODIES run LONG on local +Z  (car d=4.2 > w=2.0; bus d=9.0 > w=2.6;
//     buildings put their street door on the +Z face). yawAlong() points that
//     axis at a world direction.
//   * The STREET LAMP arm overhangs local +X (propkit buildStreetlamp arcs the
//     torus out to +X). yawArmToward() points that axis at a world direction,
//     so the lamp head hangs over the road rather than into a facade.
//
// Streets themselves run LONG on local +X (see the header contract), which is
// exactly the 90° mismatch that produced the sideways traffic.
function yawAlong(dx, dz) {
  return Math.atan2(dx, dz);   // local +Z -> (sin y, cos y)
}
function yawArmToward(dx, dz) {
  return Math.atan2(-dz, dx);  // local +X -> (cos y, -sin y)
}

// Yaw for a street lamp so its arm leans over the NEAREST carriageway. Falls
// back to the caller's random draw when the lamp is nowhere near a street (a
// plaza lamp), which keeps plaza lighting from all pointing the same way.
function lampArmYaw(site, streets, fallbackYaw) {
  let best = null;
  let bestDist = Infinity;
  for (const st of streets) {
    const c = Math.cos(st.rotY);
    const s = Math.sin(st.rotY);
    const lx = (site.x - st.x) * c - (site.z - st.z) * s;
    const lz = (site.x - st.x) * s + (site.z - st.z) * c;
    // Only consider streets the lamp is actually alongside, not ones whose
    // infinite line it happens to be near.
    if (Math.abs(lx) > st.w / 2) continue;
    const dist = Math.abs(lz) - st.d / 2;
    if (dist < bestDist) {
      bestDist = dist;
      // Point at the carriageway: the inward direction along the street's
      // local Z, from the lamp's side toward the centreline.
      const toward = rectDir(st, 0, lz > 0 ? -1 : 1);
      best = yawArmToward(toward.x, toward.z);
    }
  }
  // A lamp more than a block from any road is plaza furniture, not kerbside.
  return best !== null && bestDist < 120 ? best : fallbackYaw;
}

// (Removed: clearOfStreets(). It was dead code — defined, documented and
// never called — and its comment asserted that a prop's gameplay `radius` IS
// its rendered footprint half-diagonal. That stopped being true when render
// scale was split from the gameplay radius; see propkit.kindRenderScale. The
// live footprint test is propFootprintRect()/depthAt() further down.)

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

// Level 1 authored-city pilot: a compressed, gameplay-scaled reading of
// Chicago's Loop. The playable square keeps the repo's centered coordinate
// contract, while the composition preserves the real district's strongest
// high-angle cues: orthogonal blocks, a denser inner business grid, a green
// eastern edge, the elevated rail rectangle, and river/context beyond the
// north and west boundaries. Nothing here is latitude/longitude data; it is
// a deterministic city grammar expressed in world units.
function buildChicagoLoop(world) {
  const sw = streetWidth(world);
  const half = world / 2;
  const lines = [-0.34, -0.13, 0.08, 0.29].map((n) => n * world);
  const edges = [-half, ...lines, half];
  const streets = [];
  for (const x of lines) streets.push({ x, z: 0, w: world, d: sw, rotY: Math.PI / 2 });
  for (const z of lines) streets.push({ x: 0, z, w: world, d: sw, rotY: 0 });

  const blocks = [];
  for (let ix = 0; ix < edges.length - 1; ix += 1) {
    for (let iz = 0; iz < edges.length - 1; iz += 1) {
      const left = edges[ix] + sw / 2;
      const right = edges[ix + 1] - sw / 2;
      const bottom = edges[iz] + sw / 2;
      const top = edges[iz + 1] - sw / 2;
      // Michigan Avenue/Grant Park read: the eastmost column is an ordered
      // green civic edge rather than a random vacant block. The center block
      // remains the opening feast park for immediate-playability.
      let zone = ix === edges.length - 2 ? 'park' : 'residential';
      if (ix === 2 && iz === 2) zone = 'park';
      // Surface parking lots, straight off the target frame: two mid-grid
      // blocks stay unbuilt (buildingSites skips them) and get stall-lined
      // asphalt from groundtex.
      if ((ix === 1 && iz === 1) || (ix === 3 && iz === 3)) zone = 'parking';
      blocks.push({
        x: (left + right) / 2,
        z: (bottom + top) / 2,
        w: right - left,
        d: top - bottom,
        rotY: 0,
        zone,
        chicago: { column: ix, row: iz },
      });
    }
  }
  // A real Loop plaza is a court within a developed block, not an entire
  // city block of empty paving. Keep the host block residential so frontage
  // builds around it, while the compact descriptor preserves the landmark's
  // central clear court and placement contract.
  const civicHost = blocks.find((b) => b.chicago.column === 1 && b.chicago.row === 3);
  const landmarkPlaza = {
    ...civicHost,
    w: civicHost.w * 0.38,
    d: civicHost.d * 0.38,
    zone: 'plaza',
    synthetic: true,
  };

  // Faux surrounding city: a dense deterministic grid outside the playable
  // square. Distance, fog and simplified silhouettes carry most of the
  // separation; this comment used to say they carried ALL of it because "a
  // post-process DOF pass" would cost too much on mobile, which stopped being
  // true when the far-field-only pass landed (src/engine/dof.js). That pass
  // exists precisely for this band — it is sharp out to the playable edge and
  // ramps up only across these context buildings — and it costs one full-screen
  // pass on medium/high with no second geometry pass at all. Chicago remains
  // geographically legible: city north/west/south, Lake Michigan to the east.
  const contextBuildings = [];
  const contextTrees = [];
  const contextRoads = [];
  const step = world * 0.105;
  const extent = 15;
  // Keep the faux skyline genuinely behind the playable city. The first
  // version began only a fraction of one context block past the boundary, so
  // a player reaching the edge put 400u-tall render-only boxes directly in
  // the foreground. A two-block breathing band leaves the ground/road field
  // continuous while the simplified masses remain distant scenery.
  const contextInnerEdge = half + step * 2.1;
  for (let i = -extent; i <= extent; i += 1) {
    const p = i * step;
    contextRoads.push({ x: p, z: 0, w: step * 0.16, d: step * (extent * 2 + 1) });
    contextRoads.push({ x: 0, z: p, w: step * (extent * 2 + 1), d: step * 0.16 });
  }
  for (let gx = -extent; gx < extent; gx += 1) {
    for (let gz = -extent; gz < extent; gz += 1) {
      const x = (gx + 0.5) * step;
      const z = (gz + 0.5) * step;
      const outsidePlayable = Math.abs(x) > half + step * 0.25 || Math.abs(z) > half + step * 0.25;
      const distantSkyline = Math.abs(x) > contextInnerEdge || Math.abs(z) > contextInnerEdge;
      const eastLake = x > half + step * 0.2;
      if (!outsidePlayable || eastLake) continue;

      const code = Math.abs(gx * 92821 + gz * 68917 + 137);
      // Regular empty blocks keep the low-detail field from reading as one
      // unbroken wall and become suburban green pockets in the far distance.
      if (code % 11 === 0) {
        for (let t = 0; t < 5; t += 1) {
          contextTrees.push({
            x: x + (((code + t * 31) % 17) / 16 - 0.5) * step * 0.62,
            z: z + (((code + t * 47) % 19) / 18 - 0.5) * step * 0.62,
            s: world * (0.010 + ((code + t) % 4) * 0.002),
          });
        }
        continue;
      }

      const distance = Math.hypot(x, z) / world;
      const near = distance < 0.95;
      const pulse = (code % 97) / 96;
      const footprint = step * (0.58 + (code % 4) * 0.045);
      const heightBase = !distantSkyline ? world * 0.012 : near ? world * 0.035 : world * 0.022;
      const heightRange = !distantSkyline ? world * 0.02 : near ? world * 0.08 : world * 0.045;
      const h = heightBase + pulse * heightRange;
      contextBuildings.push({
        x,
        z,
        w: footprint,
        d: footprint * (0.82 + (code % 5) * 0.055),
        h,
        tone: code % 4,
        distanceBand: distantSkyline && near ? 0 : 1,
      });
      for (let t = 0; t < 2; t += 1) {
        contextTrees.push({
          x: x + (t ? 1 : -1) * step * 0.39,
          z: z + (((code + t * 13) % 9) / 8 - 0.5) * step * 0.58,
          s: world * (0.009 + ((code + t) % 3) * 0.002),
        });
      }
    }
  }

  return {
    streets,
    blocks,
    landmarkPlaza,
    context: {
      id: 'chicago-loop',
      assetIds: CHICAGO_CITY_OBJECTS.filter((entry) => entry.sheet === 'rail').map((entry) => entry.id),
      water: [
        { x: 0, z: half + world * 0.035, w: world * 1.55, d: world * 0.09 },
        { x: -half - world * 0.035, z: 0, w: world * 1.32, d: world * 0.075, rotY: Math.PI / 2 },
        { x: half + world * 1.15, z: 0, w: world * 2.2, d: world * 4.2, lake: true },
      ],
      ground: { x: 0, z: 0, w: step * (extent * 2 + 1), d: step * (extent * 2 + 1) },
      roads: contextRoads,
      trees: contextTrees,
      // The elevated tracks use the same four-street rectangle that gives the
      // district its name. Render-only: no collision or progression mass.
      rail: [
        { x: (lines[0] + lines[2]) / 2, z: lines[1], w: (lines[2] - lines[0]), rotY: 0 },
        { x: (lines[0] + lines[2]) / 2, z: lines[2], w: (lines[2] - lines[0]), rotY: 0 },
        { x: lines[0], z: (lines[1] + lines[2]) / 2, w: lines[2] - lines[1], rotY: Math.PI / 2 },
        { x: lines[2], z: (lines[1] + lines[2]) / 2, w: lines[2] - lines[1], rotY: Math.PI / 2 },
      ],
      buildings: contextBuildings,
    },
  };
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
    // Sit on the block side of the kerb, in the middle of the footway. The
    // old value was +12 — twelve units BEYOND the block edge — and in the grid
    // archetype a block edge IS the kerb (blocks are pitch-sw wide, centred in
    // pitch), so this pool put every lamp, bin, bike, tree and pedestrian
    // drawing from it squarely in the carriageway. That, not the clearance
    // pass, is why 41.5% of tier-0 clutter measured as standing in traffic:
    // the sites were never on a pavement to begin with.
    const out = -PAVEMENT_WIDTH / 2;
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

// 0011 task 12: park-feature sites for Chicago's civic parks. Instead of the
// jittered scatter grid, furniture binds to the features groundtex paints:
// hedge/fence runs on the block perimeter, benches on the promenade edges,
// planters around the plaza disc. The role tag rides the site so the visual
// pass can bind the right object to each feature.
function parkFurnitureSites(blocks, rng) {
  const sites = [];
  for (const b of blocks) {
    if (b.zone !== 'park') continue;
    const hw = b.w / 2;
    const hd = b.d / 2;
    // Perimeter runs, inset ~10-14u from the block edge at a ~30u pitch.
    for (const [alongX, sign] of [[true, -1], [true, 1], [false, -1], [false, 1]]) {
      const len = alongX ? b.w : b.d;
      const n = Math.max(2, Math.floor(len / 30));
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n - 0.5;
        const inset = 10 + rng() * 4;
        const lx = alongX ? t * len : sign * (hw - inset);
        const lz = alongX ? sign * (hd - inset) : t * len;
        sites.push({ ...rectPoint(b, lx, lz), rotY: alongX ? 0 : Math.PI / 2, block: b, parkRole: 'perimeter' });
      }
    }
    // Promenade-edge points: the main cross paths (block centrelines, painted
    // 20u wide), benches offset just past the painted edge, ~44u pitch.
    for (const axisX of [true, false]) {
      const len = axisX ? b.w : b.d;
      const n = Math.max(2, Math.floor(len / 44));
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n - 0.5;
        for (const side of [-1, 1]) {
          if (rng() < 0.4) continue;
          const off = 14 + rng() * 3;
          const lx = axisX ? t * len * 0.9 : side * off;
          const lz = axisX ? side * off : t * len * 0.9;
          sites.push({ ...rectPoint(b, lx, lz), rotY: axisX ? 0 : Math.PI / 2, block: b, parkRole: 'path' });
        }
      }
    }
    // Junction ring: planters around the plaza disc (radius matches the
    // groundtex grass branch's disc at min(hw,hd)*0.20).
    const ring = Math.min(hw, hd) * 0.2 + 8;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + rng() * 0.3;
      sites.push({ ...rectPoint(b, Math.cos(a) * ring, Math.sin(a) * ring), rotY: a + Math.PI / 2, block: b, parkRole: 'junction' });
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
      // Lane CENTRE. A two-lane street of width st.d puts its lane centres at
      // exactly a quarter width either side of the centreline; the old 0.22
      // pulled both lanes 12% of a half-width toward the centreline, so every
      // vehicle straddled the middle of the road with a wide empty gutter
      // outboard of it. Position-only, draws no RNG.
      const lz = lane * st.d * 0.25;
      const count = Math.max(2, Math.floor(st.w / 90));
      for (let i = 0; i < count; i += 1) {
        const lx = ((i + 0.5) / count - 0.5) * st.w * 0.94 + (rng() - 0.5) * 16;
        const along = rectDir(st, lane >= 0 ? 1 : -1, 0);
        sites.push({
          ...rectPoint(st, lx, lz),
          rotY: yawAlong(along.x, along.z),
          streetIndex,
          lane,
        });
      }
    }
  });
  return sites;
}

// Block corners (buildings face the street) + BUILT-OUT frontage runs.
//
// Frontage used to be four edge MIDPOINTS per block, so a block could hold at
// most 8 buildings and every one of them stood alone with a wide gap either
// side. A city does not look like that: buildings on a block share party walls
// and form a continuous street WALL, and the gaps are the exception (a yard, a
// side alley) rather than the rule.
//
// Each edge now carries a RUN of slots at a fixed pitch, so buildings drawn
// onto consecutive slots stand shoulder to shoulder. Contiguity is produced by
// the POP ORDER, not by extra bookkeeping: the pool is shuffled at the RUN
// level and then flattened, and `fillFromPools` pops off the end, so
// successive draws land on adjacent slots of the same edge and grow a wall
// outward from one end. Shuffling individual sites — which is what the old
// code did, correctly, for isolated midpoints — would scatter the same
// buildings back into single teeth and undo the whole effect. Do not
// "simplify" the flatten below back into a flat shuffle.
//
// `pitch` is the slot spacing and MUST come from the level's largest building
// footprint (see buildingPitch), or a big building lands on its neighbour.
function buildingSites(blocks, rng, world, pitch) {
  const corners = [];
  const largeCorners = [];
  const frontage = [];
  for (const b of blocks) {
    if (b.zone === 'park' || b.zone === 'plaza' || b.zone === 'parking') continue;
    const inset = 26;
    const cornerLocal = [
      [b.w / 2 - inset, b.d / 2 - inset],
      [-b.w / 2 + inset, b.d / 2 - inset],
      [b.w / 2 - inset, -b.d / 2 + inset],
      [-b.w / 2 + inset, -b.d / 2 + inset],
    ];
    // Face the STREET, not the block's local +Z. Every site used to take
    // `rotY: b.rotY` wholesale, so on a grid block — where b.rotY is 0 — all
    // four edges' buildings pointed at world +Z and the entire -Z frontage
    // stood with its door and shopfront facing into the middle of the block.
    // propkit builds a building with its street face on local +Z (see the
    // heading-helper comments above), so aiming that axis down the edge's
    // OUTWARD normal is what puts a facade on the street. Rotation-only: draws
    // no RNG, moves no prop, changes no count.
    const faceOut = (nx, nz) => {
      const dir = rectDir(b, nx, nz);
      return yawAlong(dir.x, dir.z);
    };
    // Corners belong to two edges; take the one further from the block centre
    // in local terms, i.e. the longer reach, so a corner shop fronts the
    // avenue rather than the side street.
    const faceAlongZ = b.w >= b.d; // long edges run along local X -> normal is Z
    for (const [lx, lz] of cornerLocal) {
      const nx = faceAlongZ ? 0 : Math.sign(lx);
      const nz = faceAlongZ ? Math.sign(lz) : 0;
      const site = { ...rectPoint(b, lx, lz), rotY: faceOut(nx, nz), block: b };
      corners.push(site);
      if (Math.min(b.w, b.d) >= world * 0.14) largeCorners.push(site);
    }
    // One run per edge. `along` is the edge's local axis, `off` its outward
    // offset; the span excludes a pitch at each end so a frontage building
    // never lands on top of the corner building already sited above.
    const edges = [
      { span: b.w, offLocal: b.d / 2 - inset, axis: 'x', nx: 0, nz: 1 },
      { span: b.w, offLocal: -b.d / 2 + inset, axis: 'x', nx: 0, nz: -1 },
      { span: b.d, offLocal: b.w / 2 - inset, axis: 'z', nx: 1, nz: 0 },
      { span: b.d, offLocal: -b.w / 2 + inset, axis: 'z', nx: -1, nz: 0 },
    ];
    for (const e of edges) {
      const usable = e.span - 2 * inset - 2 * pitch;
      const n = Math.floor(usable / pitch);
      if (n < 1) {
        // Edge too short for a wall — keep the historic single midpoint so
        // small blocks still take frontage buildings at all.
        frontage.push([{
          ...rectPoint(b, e.axis === 'x' ? 0 : e.offLocal, e.axis === 'x' ? e.offLocal : 0),
          rotY: faceOut(e.nx, e.nz), block: b,
        }]);
        continue;
      }
      const run = [];
      for (let i = 0; i < n; i += 1) {
        const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
        const a = t * (n - 1) * pitch;
        const lx = e.axis === 'x' ? a : e.offLocal;
        const lz = e.axis === 'x' ? e.offLocal : a;
        run.push({ ...rectPoint(b, lx, lz), rotY: faceOut(e.nx, e.nz), block: b });
      }
      frontage.push(run);
    }
  }
  // Shuffle RUNS, then flatten — see the header. Popping walks each run.
  const runs = shuffle(frontage, rng);
  const flat = [];
  for (const run of runs) for (const site of run) flat.push(site);
  // Adjacent blocks can generate a corner at the SAME coordinates (most often
  // on the radial archetype, where sector blocks meet at a shared vertex).
  // Two buildings on one point is the most visible placement defect there is,
  // so collapse coincident sites before anything draws from the pool. The
  // claim flag in takeSite() cannot catch these — they are distinct objects
  // that merely happen to share a position.
  const deduped = dedupeSites([...corners, ...flat]);
  const keep = new Set(deduped);
  return {
    corners: shuffle(corners.filter((s) => keep.has(s)), rng),
    largeCorners: shuffle(largeCorners.filter((s) => keep.has(s)), rng),
    frontage: flat.filter((s) => keep.has(s)),
  };
}

// Drops sites closer than COINCIDENT_EPS to one already kept. Order-stable, so
// the earlier site (a corner, given the concatenation order above) wins.
const COINCIDENT_EPS = 4;
function dedupeSites(sites) {
  const kept = [];
  const grid = new Map();
  const cell = (v) => Math.floor(v / COINCIDENT_EPS);
  for (const s of sites) {
    const cx = cell(s.x);
    const cz = cell(s.z);
    let clash = false;
    for (let dx = -1; dx <= 1 && !clash; dx += 1) {
      for (let dz = -1; dz <= 1 && !clash; dz += 1) {
        const bucket = grid.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (const o of bucket) {
          if (Math.hypot(o.x - s.x, o.z - s.z) < COINCIDENT_EPS) { clash = true; break; }
        }
      }
    }
    if (clash) continue;
    kept.push(s);
    const key = `${cx},${cz}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(s);
  }
  return kept;
}

// Slot pitch for built-out frontage: the widest building this level can
// produce, plus a party-wall gap. Sized off the RENDERED footprint (what the
// prop occupies on the ground), not `radius` (what it eats at), and it allows
// for the MEGA multiplier because mega is applied AFTER placement — a mega
// building that grew into its neighbour would be a placement defect created
// by a later pass. See findings §18.
const PARTY_WALL_GAP = 6;
const MEGA_SCALE_MULT = 1.6;
function buildingPitch(budget) {
  let widest = 0;
  for (const tier of budget) {
    if (!tier.kind.startsWith('building')) continue;
    const radius = tier.baseRadius * MEGA_SCALE_MULT;
    const fp = kindFootprint(tier.kind);
    const scale = kindRenderScale(tier.kind, radius);
    widest = Math.max(widest, Math.max(fp.w, fp.d) * scale);
  }
  return widest + PARTY_WALL_GAP;
}

// --- The generator ---------------------------------------------------------------

// Draws `count` placements from weighted site pools. Pools are pre-shuffled
// and popped; spills fall through to any remaining pool, then (never in
// practice, given site densities) to a seeded point on the world square.
//
// Sites are CLAIMED as they are taken, and an already-claimed site is skipped.
// This matters because pools are not always disjoint: `largeCorners` holds the
// same site OBJECTS as `corners` (it is a filtered view of them, not a copy),
// and the two are drawn independently, so before the claim flag a
// building-large could land on the exact coordinates of a building-medium
// already placed. Measured at 2 exactly-coincident buildings on level 90 —
// see findings §18. Any future pool that is a view over another one inherits
// the fix for free; one that is a genuine copy is unaffected.
// `accept` is the OCCUPANCY test (findings §19). It is optional so the street
// -prop pass and any future caller can opt out. A rejected site is NOT
// discarded — it goes back to the pool, because site pools are budgeted and
// throwing candidates away would starve later kinds. Retries are bounded:
// after MAX_SITE_TRIES rejections the FIRST rejected site is taken anyway and
// the caller counts it, per the tie-break — D2 forbids dropping a budgeted
// prop, so placing it overlapping and REPORTING that is the only honest
// outcome. Silently leaving it is not.
const MAX_SITE_TRIES = 12;
function takeSite(pool, accept) {
  const rejected = [];
  let chosen = null;
  let overlapped = false;
  while (pool.length) {
    const site = pool.pop();
    if (site.claimed) continue;
    if (!accept || accept(site)) { chosen = site; break; }
    rejected.push(site);
    if (rejected.length >= MAX_SITE_TRIES) break;
  }
  if (!chosen && rejected.length) {
    chosen = rejected.shift();
    overlapped = true;
  }
  // Return the untried rejects, preserving pop order for determinism.
  for (let i = rejected.length - 1; i >= 0; i -= 1) pool.push(rejected[i]);
  if (chosen) chosen.claimed = true;
  return chosen ? { site: chosen, overlapped } : null;
}

// Spatial occupancy grid over placed prop FOOTPRINTS. The root cause of the
// overlap defect (§19) is that every site pool was generated independently and
// each avoided only the ROAD, never other props — so a sidewalk bike site knew
// nothing about the 90u building footprint sitting over it. This is the shared
// memory those pools never had.
const OCCUPANCY_CELL = 96;
const OCCUPANCY_EPSILON = 0.25;
function createOccupancy() {
  const grid = new Map();
  const cells = (r) => {
    const reach = Math.hypot(r.hw, r.hd);
    const out = [];
    for (let cx = Math.floor((r.x - reach) / OCCUPANCY_CELL); cx <= Math.floor((r.x + reach) / OCCUPANCY_CELL); cx += 1) {
      for (let cz = Math.floor((r.z - reach) / OCCUPANCY_CELL); cz <= Math.floor((r.z + reach) / OCCUPANCY_CELL); cz += 1) {
        out.push(`${cx},${cz}`);
      }
    }
    return out;
  };
  return {
    add(r) {
      for (const k of cells(r)) {
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(r);
      }
      return r;
    },
    // Tombstone rather than splice: a prop being MOVED must not block its own
    // destination, and rebuilding the grid per move would be quadratic.
    remove(r) {
      if (r) r.dead = true;
    },
    // True when `r` would intersect anything already placed. `self` is skipped
    // so a prop can be tested against everything except itself.
    blocked(r, self) {
      for (const k of cells(r)) {
        const bucket = grid.get(k);
        if (!bucket) continue;
        for (const o of bucket) {
          if (o.dead || o === self) continue;
          if (rectOverlapDepth(r, o) > OCCUPANCY_EPSILON) return true;
        }
      }
      return false;
    },
  };
}

// The rect the occupancy grid reasons about: the TRUE rendered footprint, with
// no pavement pad (that pad belongs to road clearance, not to whether two props
// occupy the same ground) and including vehicles, which propFootprintRect
// deliberately excludes because the road is where they belong — they still must
// not be parked inside each other.
//
// `unrotated` is for tier 0-1 props, whose final yaw is drawn AFTER the site is
// chosen. Testing them at yaw 0 and then spinning them would let a prop rotate
// into its neighbour, so they are tested as the rotation-invariant square that
// bounds them at every yaw. Slightly conservative, and correct at every yaw.
function occupancyRect(kind, radius, x, z, rotY, unrotated, visualId = null) {
  const physical = physicalBoundsFor(visualId, kind);
  const dim = visualId ? { w: physical.width, d: physical.depth } : kindFootprint(kind);
  const s = kindRenderScale(kind, radius);
  const hw = (dim.w / 2) * s;
  const hd = (dim.d / 2) * s;
  if (unrotated) {
    const r = Math.hypot(hw, hd);
    return { x, z, hw: r, hd: r, rotY: 0 };
  }
  return { x, z, hw, hd, rotY: rotY || 0 };
}

// Separating-axis penetration depth for two oriented rects, 0 when clear.
// Mirrors scripts/placement-audit.mjs so the generator and the audit agree.
function rectOverlapDepth(a, b) {
  let min = Infinity;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const r of [a, b]) {
    const c = Math.cos(r.rotY);
    const s = Math.sin(r.rotY);
    for (const axis of [{ x: c, z: -s }, { x: s, z: c }]) {
      const dist = Math.abs(dx * axis.x + dz * axis.z);
      const depth = projectedHalf(a, axis.x, axis.z) + projectedHalf(b, axis.x, axis.z) - dist;
      if (depth <= 0) return 0;
      if (depth < min) min = depth;
    }
  }
  return min;
}

// Stall-centre sites on Chicago's surface lots: a share of the car budget
// parks IN the stalls instead of every vehicle clogging the carriageway.
// Counts and mass are untouched — only positions change.
function buildParkingStallSites(blocks) {
  const sites = [];
  for (const b of blocks) {
    if (b.zone !== 'parking') continue;
    const hd = b.d / 2;
    const stallW = 10;
    const stallD = Math.min(24, hd * 0.4);
    const count = Math.floor(b.w / stallW);
    for (let s = 0; s < count; s += 1) {
      const sx = b.x - b.w / 2 + (s + 0.5) * stallW;
      sites.push({ x: sx, z: b.z - hd + stallD / 2, rotY: 0 });
      sites.push({ x: sx, z: b.z + hd - stallD / 2, rotY: Math.PI });
    }
  }
  return sites;
}

// Random 'loose' fallback site, resampled a few times when it lands inside
// an `avoid` rect (Chicago's unbuilt parking-lot blocks stay clear).
function looseSite(rng, half, avoid) {
  let site = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const x = (rng() * 2 - 1) * half;
    const z = (rng() * 2 - 1) * half;
    site = { x, z, rotY: rng() * Math.PI * 2 };
    if (!avoid || !avoid.some((r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2)) break;
  }
  return site;
}

function fillFromPools(count, pools, rng, fallbackWorld, accept, avoid) {
  const quotas = pools.map((p) => Math.round(count * p.share));
  // Fix rounding drift on the largest pool.
  const drift = count - quotas.reduce((a, b) => a + b, 0);
  if (quotas.length) quotas[0] += drift;
  const out = [];
  const leftovers = [];
  pools.forEach((p, i) => {
    let q = quotas[i];
    while (q > 0 && p.sites.length) {
      const taken = takeSite(p.sites, accept);
      if (!taken) break;
      out.push({ site: taken.site, zone: p.zone, overlapped: taken.overlapped }); q -= 1;
    }
    leftovers.push(...p.sites);
    while (q > 0 && leftovers.length) {
      const taken = takeSite(leftovers, accept);
      if (!taken) break;
      const site = taken.site;
      // A spill lands in a pool other than the one budgeted for it, so tag it
      // 'spill' rather than lying about which zone it came from.
      out.push({ site, zone: 'spill', overlapped: taken.overlapped }); q -= 1;
    }
    while (q > 0) {
      // Defensive fallback: site pools are sized generously above budgets, so
      // this path should never run — but never drop budgeted props (D2).
      const half = fallbackWorld / 2 - 60;
      out.push({
        site: looseSite(rng, half, avoid),
        zone: 'loose',
      });
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

  const chicagoPilot = level.authoredCity === 'chicago-loop';
  const archetype = chicagoPilot ? 'chicago-loop' : ARCHETYPES[Math.floor(rngLayout() * ARCHETYPES.length)];
  const authored = chicagoPilot ? buildChicagoLoop(world) : null;
  const { streets, blocks } = authored
    || (archetype === 'grid' ? buildGrid : archetype === 'radial' ? buildRadial : buildOrganic)(world, rngLayout);
  const landmarkPlaza = authored ? authored.landmarkPlaza : assignZones(blocks, rngLayout, !!level.isCapstone);
  const landmark = {
    x: landmarkPlaza.x,
    z: landmarkPlaza.z,
    rotY: rngLayout() * Math.PI * 2,
  };

  // Site pools (shuffled once, then consumed).
  const sidewalks = shuffle(sidewalkSites(blocks, rngProps), rngProps);
  const parks = shuffle(parkSites(blocks, rngProps), rngProps);
  const parkFurniture = chicagoPilot ? shuffle(parkFurnitureSites(blocks, rngProps), rngProps) : [];
  const plazas = shuffle(plazaSites(blocks, rngProps, landmarkPlaza), rngProps);
  const roads = shuffle(roadSites(streets, rngProps), rngProps);
  const parkingStalls = chicagoPilot ? shuffle(buildParkingStallSites(blocks), rngProps) : [];
  // The generic generator sizes every frontage slot from the widest possible
  // tier so any building can occupy any slot. Chicago instead builds its street
  // wall from the shop module: large/medium tiers still place first and the
  // shared occupancy grid clears the wider parcel they need, while remaining
  // smalls can finally sit at a true party-wall cadence rather than tower pitch.
  const frontageBudget = chicagoPilot
    ? budget.filter((tier) => tier.kind === 'building-small')
    : budget;
  const { corners, largeCorners, frontage } = buildingSites(blocks, rngProps, world, buildingPitch(frontageBudget));
  // Chicago's parking-lot blocks stay clear of buildings entirely: sites
  // inside the lot OR within one building-length of its edge are removed
  // from the pools outright — merely rejecting them in accept() lets
  // takeSite's overlapped-fallback KEEP them and plant towers on the stalls.
  if (chicagoPilot) {
    const lotMargin = 100;
    const clearOfLots = (site) => !blocks.some((b) => b.zone === 'parking'
      && Math.abs(site.x - b.x) < b.w / 2 + lotMargin
      && Math.abs(site.z - b.z) < b.d / 2 + lotMargin);
    for (let i = corners.length - 1; i >= 0; i -= 1) if (!clearOfLots(corners[i])) corners.splice(i, 1);
    for (let i = largeCorners.length - 1; i >= 0; i -= 1) if (!clearOfLots(largeCorners[i])) largeCorners.splice(i, 1);
    for (let i = frontage.length - 1; i >= 0; i -= 1) if (!clearOfLots(frontage[i])) frontage.splice(i, 1);
  }
  // Chicago's civic park is framed by low-rise street walls, with the taller
  // commercial skyline stepping up behind them. Site arrays are consumed from
  // the end, so far-first sorts ascending and near-first sorts descending.
  // JavaScript's stable sort preserves each frontage run's adjacency within a
  // block; this changes hierarchy without scattering the party-wall sequence.
  const chicagoBuildingSites = (sites, farFirst) => {
    if (!chicagoPilot) return sites;
    return [...sites].sort((a, b) => {
      const da = Math.hypot(a.block ? a.block.x : a.x, a.block ? a.block.z : a.z);
      const db = Math.hypot(b.block ? b.block.x : b.x, b.block ? b.block.z : b.z);
      return farFirst ? da - db : db - da;
    });
  };

  const props = [];
  const perTier = {};
  // Shared occupancy across EVERY pool — the memory the independently
  // generated site pools never had (findings §19).
  const occupancy = createOccupancy();
  const keptOverlapping = {};

  // Spawn feast first: a tier-0 ring at the origin so ANY first move eats
  // within a second (V1's "0 mass after 10s" fix, now deterministic).
  //
  // It is placed before everything and is never displaced — it is a gameplay
  // guarantee, not decoration — but it IS registered in the occupancy grid, so
  // every later prop avoids it instead of being dropped on top of it. Its own
  // ring angles are seeded and unchecked against each other; feast-vs-feast
  // overlap is therefore still possible and is noted in §19 rather than fixed
  // here, because moving a feast prop changes a gameplay guarantee.
  const tier0 = budget[0];
  const feastCount = Math.min(SPAWN_FEAST_COUNT, tier0.baseCount);
  for (let i = 0; i < feastCount; i += 1) {
    const a = rngProps() * Math.PI * 2;
    const r = SPAWN_FEAST_RING[0] + rngProps() * (SPAWN_FEAST_RING[1] - SPAWN_FEAST_RING[0]);
    const fx = Math.cos(a) * r;
    const fz = Math.sin(a) * r;
    props.push({
      kind: tier0.kind, tierIndex: 0,
      x: fx, z: fz,
      rotY: rngProps() * Math.PI * 2,
      radius: tier0.baseRadius, mass: tier0.baseMass,
      golden: false, elite: false, variant: null, zone: 'park',
      onRoad: false, moving: null, mega: false, scaleMult: 1, spawnFeast: true,
    });
    occupancy.add(occupancyRect(tier0.kind, tier0.baseRadius, fx, fz, 0, true));
  }

  // Per-tier zoned placement. Fractions route each tier to its reading zone:
  // trash/bikes along sidewalks and park feasts, cars/buses on roads,
  // buildings on block corners facing streets (art-direction.md §1).
  const PLACEMENT = {
    trash: [{ sites: parks, share: 0.45, zone: 'park' }, { sites: sidewalks, share: 0.45, zone: 'sidewalk' }, { sites: plazas, share: 0.10, zone: 'plaza' }],
    bike: chicagoPilot
      ? [{ sites: parkFurniture, share: 0.35, zone: 'park' }, { sites: sidewalks, share: 0.55, zone: 'sidewalk' }, { sites: plazas, share: 0.10, zone: 'plaza' }]
      : [{ sites: parks, share: 0.35, zone: 'park' }, { sites: sidewalks, share: 0.55, zone: 'sidewalk' }, { sites: plazas, share: 0.10, zone: 'plaza' }],
    car: chicagoPilot
      ? [{ sites: roads, share: 0.55, zone: 'road' }, { sites: parkingStalls, share: 0.30, zone: 'parking' }, { sites: sidewalks, share: 0.15, zone: 'sidewalk' }]
      : [{ sites: roads, share: 0.75, zone: 'road' }, { sites: sidewalks, share: 0.25, zone: 'sidewalk' }],
    bus: [{ sites: roads, share: 1.0, zone: 'road' }],
    // Shares moved toward FRONTAGE with the built-out blocks change (§18).
    // Corner-heavy shares were correct when frontage meant one lonely midpoint,
    // but they are what kept blocks reading as four detached towers with empty
    // edges between them. Smalls now overwhelmingly build out the street wall;
    // mediums split; larges still anchor corners, because a landmark wants the
    // open sightline a corner gives it.
    'building-small': [{ sites: chicagoBuildingSites(corners, false), share: 0.25, zone: 'corner' }, { sites: chicagoBuildingSites(frontage, false), share: 0.75, zone: 'frontage' }],
    'building-medium': [{ sites: chicagoBuildingSites(corners, true), share: 0.45, zone: 'corner' }, { sites: chicagoBuildingSites(frontage, true), share: 0.55, zone: 'frontage' }],
    'building-large': [{ sites: chicagoBuildingSites(chicagoPilot ? corners : (largeCorners.length ? largeCorners : corners), true), share: 1.0, zone: 'corner' }],
  };

  // LARGEST FIRST. Placement used to run tier 0 upward, so bins and bikes
  // claimed ground before the buildings that would later be dropped on top of
  // them. With a shared occupancy grid the order decides who wins a contested
  // spot, and the big immovable thing should win: a building has few viable
  // sites and covers the most ground, while a bin has thousands and can go
  // anywhere. This is also the deterministic tie-break — first placed keeps the
  // spot, and the order is fixed by size, not by luck.
  const placementOrder = [...budget].sort((a, b) => b.baseRadius - a.baseRadius);
  for (const tier of placementOrder) {
    const plan = PLACEMENT[tier.kind];
    const count = tier.baseCount - (tier.tierIndex === 0 ? feastCount : 0);
    const unrotated = tier.tierIndex <= 1;
    const accept = (site) => !occupancy.blocked(
      occupancyRect(tier.kind, tier.baseRadius, site.x, site.z, site.rotY, unrotated),
    );
    const picks = fillFromPools(count, plan, rngProps, world, accept,
      chicagoPilot ? blocks.filter((b) => b.zone === 'parking') : null);
    // The zone tag is the pool the site actually came from, tracked through the
    // pop. It used to be hardcoded to `plan[0].zone`, which tagged every
    // building 'corner' including the ones on frontage — harmless for placement
    // (position is what matters) but actively misleading for anything that
    // reads zone to decide surface treatment or taxonomy. See findings §18.
    const onRoad = tier.kind === 'car' || tier.kind === 'bus';
    for (const { site, zone, overlapped } of picks) {
      if (overlapped) keptOverlapping[tier.kind] = (keptOverlapping[tier.kind] || 0) + 1;
      occupancy.add(occupancyRect(tier.kind, tier.baseRadius, site.x, site.z, site.rotY, unrotated));
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
        zone,
        onRoad: onRoad && typeof site.streetIndex === 'number',
        moving: null,
        mega: false,
        scaleMult: 1,
        spawnFeast: false,
        parkRole: site.parkRole || null,
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
  // 0011 task 12: bind Chicago park furniture to the feature role its site
  // carried — picnic sets on promenade edges ('park bench' itself classifies
  // building-small via the module rule, so the bike-kind bench slot goes to
  // the picnic table set), hedge/fence runs on the block perimeter, planters
  // around the plaza disc. These props skip the generic authored-id spread
  // below.
  if (chicagoPilot) {
    for (const p of props) {
      if (!p.parkRole) continue;
      const id = p.parkRole === 'perimeter'
        ? (rngVisual() < 0.5 ? 'cityobj_shared_hedge_module' : 'cityobj_shared_fence_module')
        : p.parkRole === 'junction'
          ? 'cityobj_shared_planter_box'
          : 'cityobj_shared_picnic_table_set';
      const descriptor = resolveVisualArchetype(id, p.kind);
      p.visualId = descriptor.id;
      p.collectionKey = descriptor.collectionKey;
    }
  }
  // A city-authored first district may declare several reference-led IDs per
  // tier. Spread them deterministically across that tier instead of collapsing
  // the entire level to the legacy baseline. Later districts still use the
  // novelty reservation below, preserving the campaign contract.
  if (districtN === 1) {
    for (const kind of Object.keys(catalog.mixes)) {
      const ids = catalog.mixes[kind];
      if (!ids.length) continue;
      const candidates = shuffle(props.filter((p) => p.kind === kind && !p.parkRole), rngVisual);
      const authoredIds = ids.filter((id) => resolveVisualArchetype(id, kind).cityObject);
      const genericIds = ids.filter((id) => !resolveVisualArchetype(id, kind).cityObject);
      const architecturalIds = authoredIds.filter((id) => {
        const profile = resolveVisualArchetype(id, kind).cityObject.profile;
        return profile === 'tower' || profile === 'midrise' || profile === 'shop';
      });
      // Every Chicago identity appears once. Repetition then favors real
      // architecture; plazas, bridges, fountains, and sculptures stay civic
      // one-offs instead of tiling ordinary block frontage.
      const fillerIds = kind.startsWith('building')
        ? [...genericIds, ...architecturalIds]
        : genericIds.length ? genericIds : authoredIds;
      for (let i = 0; i < candidates.length; i += 1) {
        const id = i < authoredIds.length
          ? authoredIds[i]
          : fillerIds[(i - authoredIds.length) % fillerIds.length];
        const descriptor = resolveVisualArchetype(id, kind);
        candidates[i].visualId = descriptor.id;
        candidates[i].collectionKey = descriptor.collectionKey;
      }
    }
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
    // Guarantee every authored introduction that has a legal tier appears at
    // least once, then fill the rest of the 25% novelty quota. A pure global
    // shuffle could starve sparse building tiers and leave catalogued city
    // landmarks technically implemented but absent from their level.
    const selected = [];
    const used = new Set();
    for (const [kind, ids] of introductionsByKind) {
      const kindCandidates = candidates.filter((p) => p.kind === kind);
      for (let i = 0; i < Math.min(ids.length, kindCandidates.length); i += 1) {
        const p = kindCandidates[i];
        p._authoredVisualId = ids[i];
        selected.push(p);
        used.add(p);
      }
    }
    for (const p of candidates) {
      if (selected.length >= noveltyTarget) break;
      if (!used.has(p)) selected.push(p);
    }
    const perKindCursor = new Map();
    for (let i = 0; i < noveltyTarget; i += 1) {
      const p = selected[i];
      const ids = introductionsByKind.get(p.kind);
      const cursor = perKindCursor.get(p.kind) || 0;
      const descriptor = resolveVisualArchetype(p._authoredVisualId || ids[cursor % ids.length], p.kind);
      perKindCursor.set(p.kind, cursor + 1);
      p.visualId = descriptor.id;
      p.collectionKey = descriptor.collectionKey;
      delete p._authoredVisualId;
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
  //
  // The draw is TIER-WEIGHTED, not uniform. See findings §17. A golden is worth
  // 8x its prop's mass, so where it lands decides whether that value compounds:
  // on a bike it is edible in the opening seconds and fuels the whole growth
  // ramp; on a building-medium (tier 5, r63) it is not edible until late, when
  // it no longer compounds. Under a uniform draw, levels 82 and 94 completed or
  // failed purely on which tier won the lottery — measured, not theorised.
  //
  // Tier 5 is DOWN-WEIGHTED rather than excluded on purpose: a golden on a big
  // building is a spectacular prize and part of what makes the mechanic feel
  // alive, so it stays possible, just rarer. Do not "simplify" this back to a
  // uniform shuffle or to a hard tier<=4 exclusion without re-reading §17.
  const goldenCount = Math.max(1, mechanics.goldenCount || 1);
  const midTierProps = shuffle(props.filter((p) => p.tierIndex >= 1 && p.tierIndex <= 5 && !p.spawnFeast), rngProps);
  // Weighted sample without replacement (Efraimidis-Spirakis): key = u^(1/w),
  // take the largest keys. It runs on its OWN seeded stream so that the
  // rngProps draw above is unchanged and nothing downstream of here shifts —
  // the layout stays byte-identical to a uniform draw, only WHICH props are
  // marked golden changes.
  const rngGolden = mulberry32((seed ^ 0x601DEA5) >>> 0);
  const goldenPicks = midTierProps
    .map((p) => ({
      p,
      key: Math.pow(rngGolden(), 1 / (GOLDEN_TIER_WEIGHTS[p.tierIndex] || 1e-9)),
    }))
    .sort((a, b) => b.key - a.key);
  for (let i = 0; i < Math.min(goldenCount, goldenPicks.length); i += 1) {
    goldenPicks[i].p.golden = true;
    // Elites are NOT a separate draw — they mark the same picks, so they
    // inherit this weighting rather than needing their own (§17).
    if (mechanics.eliteGoldens) goldenPicks[i].p.elite = true;
  }

  // --- Street props (trees / pedestrians / lamps) ---------------------------
  // The Hole.io staple tier-0 food chain: a generous seeded scatter over the
  // sidewalk/park/plaza site pools (whatever the template tiers left behind).
  // Trees favor parks (grass) and plaza edges, people stroll the sidewalks
  // and plazas, lamps line the road edges (sidewalk sites sit between block
  // and street). Placed AFTER every rngProps consumer above and drawn from a
  // dedicated stream, so the template-tier layout stays byte-identical to
  // before street props existed; they never join traffic/mega/golden picks.
  // Counts come from STREET_PROP_TIERS (levels.js) scaled by the metro's
  // streetProps density flags (metros.js) — read defensively: missing or
  // invalid flag = 1 (default on), 0 = off, negatives clamp to 0.
  const streetFlags = (level.metro && typeof level.metro.streetProps === 'object' && level.metro.streetProps) || {};
  const streetDensity = (flag) => {
    const v = Number(streetFlags[flag]);
    if (!Number.isFinite(v)) return 1;
    // The Loop target is defined by formal, tree-heavy civic parks. Keep the
    // extra canopy specific to the authored first level; later Area 1 levels
    // retain the metro baseline until their own city sections are authored.
    const authoredMultiplier = chicagoPilot && flag === 'vegetation' ? 3.75 : 1;
    return Math.max(0, v) * authoredMultiplier;
  };
  const rngStreet = mulberry32((seed ^ 0x57EE7C0D) >>> 0);
  const STREET_PROP_POOLS = {
    // Trees: mostly grass (parks) and plaza edges, some sidewalk rows.
    tree: chicagoPilot
      ? [{ sites: parks, share: 0.35, zone: 'park' }, { sites: sidewalks, share: 0.65, zone: 'sidewalk' }]
      : [{ sites: parks, share: 0.5, zone: 'park' }, { sites: plazas, share: 0.2, zone: 'plaza' }, { sites: sidewalks, share: 0.3, zone: 'sidewalk' }],
    // People: strolling sidewalks and plazas, a few in the parks.
    person: [{ sites: sidewalks, share: 0.6, zone: 'sidewalk' }, { sites: plazas, share: 0.3, zone: 'plaza' }, { sites: parks, share: 0.1, zone: 'park' }],
    // Lamps: along road edges (sidewalk sites), a few lighting the plazas.
    streetlamp: [{ sites: sidewalks, share: 0.8, zone: 'sidewalk' }, { sites: plazas, share: 0.2, zone: 'plaza' }],
  };
  const streetPropCounts = {};
  for (const tier of STREET_PROP_TIERS) {
    const count = Math.round(tier.baseCount * streetDensity(tier.densityFlag));
    const variants = streetPropArchetypeIds(tier.kind);
    const plan = STREET_PROP_POOLS[tier.kind];
    if (count <= 0 || !variants.length || !plan) {
      streetPropCounts[tier.kind] = 0;
      continue;
    }
    // Street furniture is the smallest thing on the map and is placed LAST, so
    // it fills the ground the buildings and vehicles have already claimed
    // rather than being buried by them. Lamps and trees take a fixed yaw or a
    // random one drawn below, so they are tested rotation-invariantly.
    const acceptStreet = (site) => !occupancy.blocked(
      occupancyRect(tier.kind, tier.baseRadius, site.x, site.z, 0, true),
    );
    const picks = fillFromPools(count, plan, rngStreet, world, acceptStreet);
    for (const { site, zone, overlapped } of picks) {
      if (overlapped) keptOverlapping[tier.kind] = (keptOverlapping[tier.kind] || 0) + 1;
      occupancy.add(occupancyRect(tier.kind, tier.baseRadius, site.x, site.z, 0, true));
      const descriptor = resolveVisualArchetype(
        variants[Math.floor(rngStreet() * variants.length)], tier.kind,
      );
      // Draw the random yaw UNCONDITIONALLY even where it is discarded below:
      // rngStreet is a shared stream and skipping a draw for one kind would
      // reshuffle every placement after it.
      const randomYaw = rngStreet() * Math.PI * 2;
      props.push({
        kind: tier.kind,
        tierIndex: 0,
        x: site.x,
        z: site.z,
        // A street lamp has a CURVED ARM overhanging its local +X (propkit
        // buildStreetlamp), so a random yaw points roughly half of them into a
        // building facade instead of over the carriageway. yawArmToward() has
        // been sitting here fully written and documented since the §2.3
        // diagnosis but was never actually called — the placement audit only
        // ever measured lamp POSITION, so nothing caught it. Trees, bins and
        // pedestrians keep the random yaw: they have no directional accent.
        rotY: tier.kind === 'streetlamp' ? lampArmYaw(site, streets, randomYaw) : randomYaw,
        radius: tier.baseRadius,
        mass: tier.baseMass,
        golden: false,
        elite: false,
        variant: null,
        zone,
        onRoad: false,
        moving: null,
        mega: false,
        scaleMult: 1,
        spawnFeast: false,
        visualId: descriptor.id,
        collectionKey: descriptor.collectionKey,
      });
    }
    streetPropCounts[tier.kind] = picks.length;
  }

  const totalBaseMass = props.reduce((sum, p) => sum + p.mass, 0);

  // Keep every placement inside the playable square (lesson B7's coordinate
  // contract): radial sector blocks near the diagonal corners can extend a
  // few units past ±world/2, and a prop outside the world is a prop the
  // player can never eat.
  const bound = world / 2 - 30;
  // LIVE occupancy for the repair passes below. The placement-time grid above
  // reflects where props were PUT; this one tracks where they ARE, because the
  // road-escape pass moves about a quarter of them and, before this, moved
  // them with no knowledge of each other — which is why placement-time
  // occupancy alone only got part of the way (findings §19). Mega scaling is
  // already applied at this point, so scaleMult is included here and not above.
  const live = createOccupancy();
  const liveRect = new Map();
  for (const p of props) {
    const r = occupancyRect(p.kind, p.radius * (p.scaleMult || 1), p.x, p.z, p.rotY, p.tierIndex <= 1);
    liveRect.set(p, live.add(r));
  }
  // True when moving `p` to (x, z) would land it inside another prop.
  const collides = (p, x, z) => {
    const own = liveRect.get(p);
    const probe = occupancyRect(p.kind, p.radius * (p.scaleMult || 1), x, z, p.rotY, p.tierIndex <= 1);
    return live.blocked(probe, own);
  };
  const commit = (p) => {
    const own = liveRect.get(p);
    live.remove(own);
    const r = occupancyRect(p.kind, p.radius * (p.scaleMult || 1), p.x, p.z, p.rotY, p.tierIndex <= 1);
    liveRect.set(p, live.add(r));
  };
  for (const p of props) {
    p.x = clamp(p.x, -bound, bound);
    p.z = clamp(p.z, -bound, bound);
    // That clamp is PER-AXIS, which is fine for a prop standing on a block but
    // wrong for one standing in a lane: on a rotated street (every organic
    // diagonal avenue, every radial spoke and ring) clamping x or z alone
    // slides the vehicle sideways OFF its carriageway. 18 of 1740 vehicles
    // ended up straddling the centreline or parked past the kerb that way.
    // Re-seat them: hold the exact lane centre on the street's cross axis and
    // give up distance ALONG the street instead, which costs nothing visually
    // because a lane is uniform along its length. Position-only, no RNG.
    if (p.onRoad && typeof p.streetIndex === 'number' && streets[p.streetIndex]) {
      const st = streets[p.streetIndex];
      const c = Math.cos(st.rotY);
      const s = Math.sin(st.rotY);
      const laneZ = (p.lane >= 0 ? 1 : -1) * st.d * 0.25;
      let lx = (p.x - st.x) * c - (p.z - st.z) * s;
      lx = clamp(lx, -st.w / 2, st.w / 2);
      // Walk in along the street until the lane point is inside the square.
      for (let i = 0; i < 64; i += 1) {
        const q = rectPoint(st, lx, laneZ);
        if (Math.abs(q.x) <= bound && Math.abs(q.z) <= bound) { p.x = q.x; p.z = q.z; break; }
        if (Math.abs(lx) < 1) { p.x = q.x; p.z = q.z; break; }
        lx *= 0.9;
      }
    }
    // The initial camera sits behind spawn along -Z at BASE_YAW = 0. Keep
    // building tiers out of that first-frame sightline so a
    // seeded corner/frontage site cannot put the camera inside an instanced
    // facade on frame one. Relocation is deterministic and changes no count,
    // mass, radius, flags, or RNG stream.
    //
    // The -Z bound must stay BEHIND the camera's spawn standoff: at spawn
    // r=26 with camera.js DIST_RADIUS_MULT=12 and PITCH_DEFAULT=55°, the eye
    // sits at z ≈ -179, and the orbit pitch floor (35°) pushes it to ≈ -256.
    if (p.tierIndex >= 4) {
      const clearHalfWidth = CAMERA_CORRIDOR_HALF_WIDTH + p.radius;
      if (Math.abs(p.x) < clearHalfWidth
        && p.z > CAMERA_CORRIDOR_Z_MIN && p.z < CAMERA_CORRIDOR_Z_MAX) {
        p.x = clamp((p.x < 0 ? -1 : 1) * (clearHalfWidth + 45), -bound, bound);
      }
    }
    // Big Bell Plaza's immutable seed places several double-deckers directly
    // through the avatar. Correct only that authored invalid cluster; a global
    // bus relocation changes route pacing in otherwise valid districts.
    if (level.n === 30 && p.tierIndex === 3 && Math.hypot(p.x, p.z) < 90) {
      const clearRadius = 90 + p.radius;
      const st = (p.onRoad && typeof p.streetIndex === 'number') ? streets[p.streetIndex] : null;
      if (st) {
        // Slide the bus ALONG its lane rather than radially outward. A radial
        // shove takes it off the carriageway, which the lane re-seat above
        // would then have to undo — the two corrections used to fight, and
        // the buses lost. Driving further down the same road clears the
        // avatar just as well and keeps the vehicle in traffic.
        const c = Math.cos(st.rotY);
        const s = Math.sin(st.rotY);
        const laneZ = (p.lane >= 0 ? 1 : -1) * st.d * 0.25;
        let lx = (p.x - st.x) * c - (p.z - st.z) * s;
        const dir = lx < 0 ? -1 : 1;
        for (let i = 0; i < 64; i += 1) {
          const q = rectPoint(st, lx, laneZ);
          if (Math.hypot(q.x, q.z) >= clearRadius
            && Math.abs(q.x) <= bound && Math.abs(q.z) <= bound) { p.x = q.x; p.z = q.z; break; }
          lx += dir * 20;
          if (Math.abs(lx) > st.w / 2) break;
        }
      } else {
        const angle = Math.atan2(p.z, p.x);
        p.x = clamp(Math.cos(angle) * clearRadius, -bound, bound);
        p.z = clamp(Math.sin(angle) * clearRadius, -bound, bound);
      }
    }
    // Road clearance: nothing but a vehicle may stand in the carriageway.
    // The clearance is now the prop's own RENDERED FOOTPRINT (roadClearance
    // above), not the old fixed 10u/4u margins. Measured on levels 1-20 with
    // a footprint metric, those constants left 67.6% of buildings, 51.8% of
    // lamps and 41.5% of tier-0 clutter overhanging a carriageway — the old
    // centre-point audit scored the same layouts at 0.2% and 0.3% and so
    // never saw it (00-findings.md §8 defect 2).
    //
    // This is a POSITION-ONLY repair, deliberately: it draws no RNG and
    // changes no count, mass, radius or flag, so the seeded layout stream is
    // untouched (D2: never drop a budgeted prop). Push the prop out along the
    // offending street's local cross-axis, re-checking up to MAX_PUSHES times
    // so props sitting on an intersection get cleared of both streets.
    // Bounded, because pushing once per street compounds the displacement and
    // walks props out to the world edge wherever diagonals overlap.
    const footprint = propFootprintRect(p);
    if (footprint) {
      // Per-street reach of THIS prop's rectangle, projected onto that
      // street's own axes. Constant per street because the prop's yaw never
      // changes here — only its position moves.
      const reach = streets.map((st) => {
        const c = Math.cos(st.rotY);
        const s = Math.sin(st.rotY);
        return {
          cross: projectedHalf(footprint, s, c),   // street local +Z
          along: projectedHalf(footprint, c, -s),  // street local +X
        };
      });
      // Deepest carriageway penetration at a candidate point, 0 when clear.
      // Shared by the kerb push and the outward escape below so both rank
      // candidates on the same measure.
      const depthAt = (x, z) => {
        let worstDepth = 0;
        for (let si = 0; si < streets.length; si += 1) {
          const st = streets[si];
          const c = Math.cos(st.rotY);
          const s = Math.sin(st.rotY);
          const lx = (x - st.x) * c - (z - st.z) * s;
          const lz = (x - st.x) * s + (z - st.z) * c;
          const limit = st.d / 2 + reach[si].cross;
          if (Math.abs(lx) > st.w / 2 + reach[si].along || Math.abs(lz) > limit) continue;
          const d = limit - Math.abs(lz);
          if (d > worstDepth) worstDepth = d;
        }
        return worstDepth;
      };
      const acceptable = (q) => Math.abs(q.x) <= bound && Math.abs(q.z) <= bound
        && !(p.tierIndex >= 4 && Math.abs(q.x) < CAMERA_CORRIDOR_HALF_WIDTH + p.radius
          && q.z > CAMERA_CORRIDOR_Z_MIN && q.z < CAMERA_CORRIDOR_Z_MAX)
        // ...and kerb pushes / outward escapes must not park a building on
        // Chicago's unbuilt parking-lot blocks.
        && !(p.tierIndex >= 4 && blocks.some((b) => b.zone === 'parking'
          && Math.abs(q.x - b.x) < b.w / 2 && Math.abs(q.z - b.z) < b.d / 2));

      const MAX_PUSHES = 8;
      for (let attempt = 0; attempt < MAX_PUSHES; attempt += 1) {
        // Resolve the DEEPEST overlap each pass, not the first one found.
        // Escaping an arbitrary street lets a prop on an intersection bounce
        // between two carriageways without ever leaving either.
        let worst = null;
        let worstDepth = 0;
        for (let si = 0; si < streets.length; si += 1) {
          const st = streets[si];
          const c = Math.cos(st.rotY);
          const s = Math.sin(st.rotY);
          const lx = (p.x - st.x) * c - (p.z - st.z) * s;
          const lz = (p.x - st.x) * s + (p.z - st.z) * c;
          const limit = st.d / 2 + reach[si].cross;
          if (Math.abs(lx) > st.w / 2 + reach[si].along || Math.abs(lz) > limit) continue;
          const depth = limit - Math.abs(lz);
          if (depth > worstDepth) {
            worstDepth = depth;
            worst = { st, lx, lz, limit };
          }
        }
        if (!worst) break;
        // Prefer the nearer kerb, but take the far one when the nearer push
        // would leave the playable square or drop the prop back into the
        // spawn-camera corridor cleared above — the world clamp would drag it
        // straight back into the road, and re-entering the corridor would put
        // a facade over the lens on frame one. Camera safety outranks the kerb
        // preference; if neither kerb is acceptable the prop keeps its spot.
        // KERB_EPSILON: land just PAST the kerb line, not exactly on it. An
        // exact landing leaves the footprint and the carriageway sharing an
        // edge, and floating-point noise then reads as a hair of overlap —
        // 246 props scored as "in the road" over 1e-12 units of it.
        const KERB_EPSILON = 0.5;
        const sign = worst.lz < 0 ? -1 : 1;
        const limit = worst.limit + KERB_EPSILON;
        const near = rectPoint(worst.st, worst.lx, sign * limit);
        const far = rectPoint(worst.st, worst.lx, -sign * limit);
        // Road clearance still outranks occupancy — the audit gates the road
        // and nothing gates occupancy — so the kerb candidates are filtered by
        // `acceptable` FIRST and occupancy only breaks the tie between them.
        // Landing on another prop is better than standing in traffic, but
        // where both kerbs clear the road, take the empty one.
        let pushed = null;
        const nearOk = acceptable(near);
        const farOk = acceptable(far);
        if (nearOk && !collides(p, near.x, near.z)) pushed = near;
        else if (farOk && !collides(p, far.x, far.z)) pushed = far;
        else if (nearOk) pushed = near;
        else if (farOk) pushed = far;
        if (!pushed) break;
        p.x = pushed.x;
        p.z = pushed.z;
        commit(p);
      }

      // Outward escape — the last 1-2% the kerb push cannot reach. Two site
      // shapes defeat it: a RADIAL archetype's hub, where up to eight 77u
      // carriageways cross a single point and there is no clear ground within
      // a few hundred units; and an ORGANIC diagonal avenue that pins a prop
      // against the world edge so neither kerb is a legal target. Both open up
      // as you move away from the world centre (the gap between spokes widens
      // with radius), so walk outward along the ray from the origin and keep
      // the first clear step, or the shallowest step if none is clear.
      // Deterministic and RNG-free like everything above it.
      if (depthAt(p.x, p.z) > 0) {
        const len = Math.hypot(p.x, p.z);
        const dx = len > 1e-6 ? p.x / len : 1;
        const dz = len > 1e-6 ? p.z / len : 0;
        // Capped deliberately. Unbounded (40 steps), this walk relocated 41
        // props by more than 400u — worst case a building-small moved 1026u
        // across level 82. Clear of the road, but somewhere it has no business
        // being. 18 steps (432u) is the measured knee: it holds buildings-in-
        // road at 0.4% while cutting the >400u tail from 41 props to 21 out of
        // 49,750. Tightening further (12 steps) pushes buildings back to 0.51%
        // and trips the audit ceiling — a prop wedged at a radial hub is
        // better left marginally overlapping than teleported across the
        // district, which is the residue the audit tolerance exists for.
        const STEP = 24;
        const MAX_STEPS = 18;
        let best = null;
        let bestDepth = depthAt(p.x, p.z);
        // Two-tier preference, same rule as the kerb push: clearing the ROAD
        // is the objective, and occupancy only chooses between steps that
        // already clear it. `clear` is the first road-clear step that is also
        // empty ground; `best` is the first road-clear step of any kind. Taking
        // `clear` when it exists stops the walk parking one prop on another
        // while both sit legally off the carriageway.
        // Three candidates, strictly ranked. `clear` clears the road AND is
        // empty ground; `firstClear` clears the road at any cost; `best` is the
        // shallowest road penetration when nothing clears it. Road clearance is
        // the objective and occupancy only chooses among steps that already
        // satisfy it, so the fallback behaviour is exactly what it was before
        // occupancy existed — that ordering is what keeps the audit's
        // buildings-in-roadway ceiling met.
        let clear = null;
        let firstClear = null;
        for (let i = 1; i <= MAX_STEPS; i += 1) {
          const q = { x: p.x + dx * STEP * i, z: p.z + dz * STEP * i };
          if (!acceptable(q)) break;
          const d = depthAt(q.x, q.z);
          if (d <= 0) {
            if (!firstClear) firstClear = q;
            if (!collides(p, q.x, q.z)) { clear = q; break; }
            continue;
          }
          if (d < bestDepth) { bestDepth = d; best = q; }
        }
        const landing = clear || firstClear || best;
        if (landing) { p.x = landing.x; p.z = landing.z; commit(p); }
      }
    }

    // Re-face buildings LAST. buildingSites picks a yaw from the block edge
    // the site sits on, but everything above is free to move the prop — the
    // kerb push routinely walks a building to a different frontage, and the
    // outward escape can move it a long way. Orientation chosen before the
    // move is orientation against the wrong street: measured, only 45% of
    // facades still faced a carriageway by the time the pass finished.
    // Rotation-only and RNG-free.
    if (p.kind.startsWith('building')) {
      let best = null;
      let bestDist = Infinity;
      for (const st of streets) {
        const c = Math.cos(st.rotY);
        const s = Math.sin(st.rotY);
        const lx = (p.x - st.x) * c - (p.z - st.z) * s;
        const lz = (p.x - st.x) * s + (p.z - st.z) * c;
        if (Math.abs(lx) > st.w / 2) continue;
        const dist = Math.abs(lz) - st.d / 2;
        if (dist < bestDist) {
          bestDist = dist;
          const toward = rectDir(st, 0, lz > 0 ? -1 : 1);
          best = yawAlong(toward.x, toward.z);
        }
      }
      // Beyond a block's depth from any road there is no street to face, so
      // the site's own block-edge yaw is the better answer.
      if (best !== null && bestDist < 200) p.rotY = best;
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

  // Final legal-slot allocation. Earlier passes establish authored zoning and
  // road relationships; this pass is the release contract over the transforms
  // the renderer actually receives. Largest footprints reserve first, and any
  // conflicting prop walks a deterministic candidate sequence until its final
  // oriented footprint is legal. No RNG is consumed and no budget is dropped.
  const finalOccupancy = createOccupancy();
  const landmarkPhysical = landmarkBoundsFor(chicagoPilot ? 'mega-spire' : level.metro.landmarkType);
  if (landmarkPhysical) {
    const landmarkScale = Math.min(1, capstoneGateRadius(level) / landmarkPhysical.boundingRadius);
    finalOccupancy.add({
      x: landmark.x,
      z: landmark.z,
      hw: landmarkPhysical.width * landmarkScale / 2,
      hd: landmarkPhysical.depth * landmarkScale / 2,
      rotY: landmark.rotY || 0,
      landmark: true,
    });
  }
  const ordered = [...props].sort((a, b) => {
    const ar = occupancyRect(a.kind, a.radius * (a.scaleMult || 1), a.x, a.z, a.rotY, a.tierIndex <= 1, a.visualId);
    const br = occupancyRect(b.kind, b.radius * (b.scaleMult || 1), b.x, b.z, b.rotY, b.tierIndex <= 1, b.visualId);
    return (br.hw * br.hd) - (ar.hw * ar.hd) || props.indexOf(a) - props.indexOf(b);
  });
  const offRoadKind = (p) => !p.onRoad;
  const roadClear = (p, rect) => {
    if (!offRoadKind(p)) return true;
    for (const st of streets) {
      if (rectOverlapDepth(rect, { x: st.x, z: st.z, hw: st.w / 2, hd: st.d / 2, rotY: st.rotY }) > OCCUPANCY_EPSILON) return false;
    }
    return true;
  };
  const legalFinal = (p, x, z) => {
    const rect = occupancyRect(p.kind, p.radius * (p.scaleMult || 1), x, z, p.rotY, p.tierIndex <= 1, p.visualId);
    const reach = Math.hypot(rect.hw, rect.hd);
    if (Math.abs(x) + reach > world / 2 || Math.abs(z) + reach > world / 2) return null;
    if (p.tierIndex >= 4 && Math.abs(x) < CAMERA_CORRIDOR_HALF_WIDTH + p.radius
      && z > CAMERA_CORRIDOR_Z_MIN && z < CAMERA_CORRIDOR_Z_MAX) return null;
    // Chicago's parking-lot blocks stay unbuilt through the final contract:
    // no building footprint may overlap a lot, whatever earlier passes did.
    if (p.tierIndex >= 4 && blocks.some((b) => b.zone === 'parking'
      && rectOverlapDepth(rect, { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, rotY: 0 }) > OCCUPANCY_EPSILON)) return null;
    if (!roadClear(p, rect) || finalOccupancy.blocked(rect)) return null;
    return rect;
  };
  for (const p of ordered) {
    let accepted = legalFinal(p, p.x, p.z);
    if (!accepted && p.onRoad && typeof p.streetIndex === 'number' && streets[p.streetIndex]) {
      const st = streets[p.streetIndex];
      const c = Math.cos(st.rotY);
      const s = Math.sin(st.rotY);
      const laneZ = (p.lane >= 0 ? 1 : -1) * st.d * 0.25;
      const startX = (p.x - st.x) * c - (p.z - st.z) * s;
      for (let i = 1; i <= 160 && !accepted; i += 1) {
        const offset = Math.ceil(i / 2) * 18 * (i % 2 ? 1 : -1);
        const lx = startX + offset;
        if (Math.abs(lx) > st.w / 2) continue;
        const q = rectPoint(st, lx, laneZ);
        accepted = legalFinal(p, q.x, q.z);
        if (accepted) { p.x = q.x; p.z = q.z; }
      }
    }
    if (!accepted) {
      const startX = p.x;
      const startZ = p.z;
      const step = Math.max(18, Math.min(72, p.radius * 0.5));
      for (let ring = 1; ring <= 80 && !accepted; ring += 1) {
        for (let side = -ring; side <= ring && !accepted; side += 1) {
          const candidates = [
            [side, -ring], [ring, side], [side, ring], [-ring, side],
          ];
          for (const [gx, gz] of candidates) {
            accepted = legalFinal(p, startX + gx * step, startZ + gz * step);
            if (accepted) { p.x = accepted.x; p.z = accepted.z; break; }
          }
        }
      }
    }
    if (!accepted) {
      throw new Error(`No legal placement: level=${level.n} kind=${p.kind} visualId=${p.visualId || 'fallback'} x=${p.x} z=${p.z}`);
    }
    finalOccupancy.add(accepted);
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
    context: authored ? authored.context : null,
    props,
    stats: {
      propCount: props.length,
      totalBaseMass,
      perTier,
      streetProps: streetPropCounts,
      novelty,
      // Props that exhausted MAX_SITE_TRIES and kept a site overlapping
      // something already placed, per kind. D2 forbids dropping a budgeted
      // prop, so this is the honest residue of the occupancy pass rather than
      // a hidden failure — the placement audit reports it (findings §19).
      keptOverlapping,
    },
  };
}
