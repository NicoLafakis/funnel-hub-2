// Procedural ground texture (art-direction.md §1: "Ground gets a texture, not
// a color"). Bakes a districts.js layout descriptor into a single canvas that
// is mapped 1:1 over the world plane.
//
// TEXEL DENSITY (0003 §8 defect 4). The bake used to be a fixed 512px canvas
// stretched across a 2415-4800u world — 4.7 to 9.4 world units per texel, and
// a *different* density per level, so the same surface detail read at two
// different sizes on level 1 and level 100. Two changes fix that:
//
//   1. The canvas is sized from the world (GROUND_TEXELS_PER_UNIT), so texel
//      density is a constant of the art direction, not a function of level
//      size. It clamps at GROUND_TEX_MAX for texture memory (see below).
//   2. Everything is drawn through a single world-space transform
//      (`setTransform(k,0,0,k, size/2, size/2)`, k = size/world), in WORLD
//      UNITS. A paving slab is 16 units across on every level; the layout
//      grain tiles every 96 units on every level. Nothing is expressed as a
//      fraction of the canvas any more, so nothing can stretch with it.
//
// The old whole-canvas 64x64 value noise was the worst offender — one noise
// cell was 37u on level 1 and 75u on level 100. It is now a repeating pattern
// tile of fixed world size.
//
// THAT IS ONLY HALF THE DEFECT, and the first pass shipped with only this
// half done. Constant world density makes the ground SCALE-INVARIANT; it does
// not make it SHARP. At this map's texel density one texel still covers ~15
// device pixels at the gameplay camera, which reads as smeared no matter how
// consistent it is across levels. The defect title is "stretched, NOT TILED" —
// the tiling half is the detail tile further down (bakeGroundDetail), and the
// two are meant to be used together: layout map for low-frequency structure,
// tile for high-frequency surface.
//
// ZONES ARE VECTOR-PAINTED, not raster-filled (0003 §8 defect 1). The previous
// bake walked a 128x128 zone raster and filled one rect per cell, so every kerb
// was a 19-unit staircase and block interiors got a single flat tint. Blocks,
// kerb rings and streets are now filled as real (rotated) rectangles with
// clipped detail passes, which is both sharper and far cheaper.
//
// SURFACE IDENTITY (0003 §8 defect 1, "bare brown ground"). Block interiors
// used to be GROUND_ZONE_MIX.block — a 0.06 mix toward white, i.e. essentially
// raw metro ground colour, which is where the bare brown expanses came from.
// Every ground class now has a real surface: paving-slab grids at fixed world
// pitch, asphalt grain, grass mottle, park sand paths and sports courts, kerb
// joints, lane paint, kerbside parking bays, crosswalks at intersections and
// manhole covers. See assets/references/holeio/1000030503.jpg — the whole
// district is surfaced, there is no undressed ground anywhere in the frame.
//
// DOM discipline: document.createElement('canvas') happens ONLY inside
// bakeGroundTexture(), never at module top level. Headless callers (the logic
// suite, Node) get the pure descriptor back with `canvas: null` — everything
// except the pixels is computable without a DOM.
import { mulberry32 } from '../data/seeds.js';

// --- Texture budget -------------------------------------------------------
// Texels per world unit, and the ONE number that has to be identical on every
// level or the same surface reads at two different sizes across the ladder.
//
// 0.55 SHIPPED THE VERY BUG IT WAS MEANT TO FIX, on the top third of the
// ladder. GROUND_TEX_MAX is 2048 and the largest world is 4800 units (level
// 100, measured over all 100 levels), so 0.55 needs 2640px and the cap binds
// from world ~3724 upward. Measured density actually delivered:
//
//   L1  world 2415 -> 1328px -> 0.550 tx/u
//   L50 world 3550 -> 1953px -> 0.550 tx/u
//   L75 world 4225 -> 2048px -> 0.485 tx/u   <- cap binding
//   L100 world 4800 -> 2048px -> 0.427 tx/u  <- 22% coarser than L1
//
// That is exactly the original defect — the same paving reading at two sizes
// depending on level — merely pushed from a 2x spread to a 1.29x one and out
// past level 65. A density the cap can always honour is the only value that
// makes the constant actually constant: 2048/4800 = 0.4267, so 0.42 with a
// little headroom for future world growth.
//
// Paying 22% sharpness on levels 1-65 is the right trade now and would NOT
// have been before the detail tile existed. High-frequency surface grain moved
// to bakeGroundDetail at a flat 16 tx/u (38x this map at L100), and lane paint
// moved to geometry. What is left in this bake is low-frequency structure, and
// its finest feature is the 20-unit kerb ring — 8.5 texels at 0.42, with the
// 16-unit slab pitch at 6.7. Neither is close to aliasing.
//
// Cost (the ground texture is the ONLY large texture in the game; building
// facades are procedural and small, textures.js FACADE_SPEC ~2.4MB total):
//   world 2415 (L1)   -> 1014px -> 4.1MB + mips ~5.5MB   (was 1328px / 7.1MB)
//   world 3550 (L50)  -> 1491px -> 8.9MB + mips ~11.9MB  (was 1953px / 15.2MB)
//   world 4800 (L100) -> 2016px -> 16.3MB + mips ~21.7MB (cap no longer binds)
// L100 is unchanged because it was already at the cap; everything below it
// drops ~42%, which also retires most of the "ground texture hits 21MB" note
// for the levels players actually spend their time on.
// Pass `maxSize` to trade sharpness for memory on a constrained device.
export const GROUND_TEXELS_PER_UNIT = 0.42;
export const GROUND_TEX_MAX = 2048;
export const GROUND_TEX_MIN = 512;

// Zone palette. Each ground class is the metro's ground colour mixed toward a
// target; `t` is how far. Targets are read off the reference set
// (assets/references/holeio/): lavender-grey carriageways, cool cream
// pavements, vivid cartoon grass, warm sand.
//
// `t` is HIGH on purpose. The old table let the metro ground colour dominate
// (block sat at t=0.06, i.e. 94% raw metro ground), so warm-grounded metros
// rendered as brown mud and the whole value ladder collapsed. The metro is now
// a tint on a designed surface, not the surface itself. Grayscale ladder
// (relative luma) — the art bible's grayscale test:
//
//   asphalt 0.54 < grass 0.66 < pavement 0.71 < curb 0.83
//                < plaza 0.87 < promenade 0.88 < lane paint 1.00
//
// Monotonic in all ten metros (verified by probe), total span 32% luma. The
// three light paved classes sit within 5% of each other by design — they are
// all concrete, exactly as in the reference — so they carry a NON-COLOUR
// distinction as well: different slab pitches, and a second coarser course
// line on plaza and promenade.
//
// asphalt/grass separate by hue more than value, which is true of the
// reference too; the grass mottle and its darker rim carry the rest.
//
// `wash` applies when opts.textures supplies a photographic surface: the tint
// is overlaid at that alpha so the baked result stays as bright as the
// procedural path even when the source art is dark.
// EXPOSURE — a seam left deliberately at 1.0, with the investigation recorded
// so the next person does not repeat it.
//
// A rendered frame (tests/golden/spawn-l1.actual.png) measures the ground at
// mean luma 0.962-0.967 with SATURATION 0.002 and 98% of pixels above 0.90.
// Saturation zero at that luma is not "bright", it is fully clipped, and it
// reads on screen as a white void with a few grey scratches — which is a very
// good candidate for "the textures are all terrible".
//
// It is NOT, however, an albedo problem, and scaling this table is not the fix.
// Measured, in order:
//   * the bake itself is correct. Driving bakeGroundTexture against a recording
//     2D-context stub shows the dominant fill at rgb(104,97,108) and the whole
//     designed ladder present, so the canvas that reaches CanvasTexture has
//     real structure and real value separation in it.
//   * scaling every zone down by 4.4x changed the rendered frame by nothing at
//     all: still 0.962, still saturation 0.002. An albedo the renderer was
//     actually sampling could not be invisible to a 4.4x change.
//   * the rendered ground shows NO roads, no kerbs, no zone boundaries — the
//     largest, lowest-frequency features in the bake. Their total absence, not
//     their softness, is the tell.
//
// The conclusion the evidence supports is that the ground map is not on screen
// in the captured frame: groundMat.color is set to #ffffff the moment the bake
// reports a canvas, so a map that never lands leaves a pure white dielectric,
// which is exactly the neutral clipped white being measured. That is a wiring
// or timing defect upstream in main.js, not a value in this file, and it is
// handed to the lead rather than papered over here.
//
// Anything that scales this table before that is fixed is tuning against a
// surface nobody can see. Left at 1.0 (identity) on purpose: the plumbing is
// in place, so once the map is actually visible this is the one number to turn.
export const GROUND_ALBEDO_SCALE = 1.0;

export const GROUND_ZONE_MIX = {
  asphalt: { target: '#8477a8', t: 0.86, wash: 0.62 },
  curb: { target: '#e0d8ec', t: 0.84, wash: 0.30 },
  plaza: { target: '#e4ddee', t: 0.86, wash: 0.32 },
  // Avenue blocks read as a warm CREAM promenade against the cool lilac of
  // residential pavement — the two biggest block families have to separate by
  // hue as well as by value or the district goes back to one flat field.
  promenade: { target: '#f4e9d0', t: 0.84, wash: 0.30 },
  pavement: { target: '#bdb2d2', t: 0.84, wash: 0.30 },
  grass: { target: '#5ec945', t: 0.88, wash: 0.25 },
  sand: { target: '#e4d6a4', t: 0.80, wash: 0.25 },
  // Back-compat alias: `block` was the old name for open/residential ground.
  // describeGround no longer emits it; kept so external readers of this table
  // do not break.
  block: { target: '#bdb2d2', t: 0.84, wash: 0.30 },
};

// Sidewalk ring around each street. 9 was a 5-texel sliver that vanished at
// gameplay distance — the reference's pavements are broad enough to walk a
// row of pedestrians and lamps down, and the road/kerb/block transition is
// one of the strongest reads in the frame. Texture-only: nothing gameplay
// reads this.
const CURB_WIDTH = 20;

// Fixed world-space feature sizes. These are the whole point of the rewrite:
// none of them is a fraction of the canvas, so all of them are identical on
// level 1 and level 100.
// Slab pitches are sized against the BLUR, not against realism. A layout texel
// covers ~14.7 device px at the gameplay camera, so a joint line is ~15px wide
// no matter what. At a 9u slab (72 device px) that joint is 20% of the slab and
// reads as mush; at 16u (129px) it is 11% and reads as a joint. Bigger slabs
// are the only way structure survives a fixed blur.
const SLAB_PITCH = { pavement: 16, promenade: 18, plaza: 22, curb: 10 };
const GRAIN_TILE_WORLD = 96;   // one surface-grain tile spans 96 world units
const GRAIN_CELLS = 32;        // 3 world units per grain cell
const LANE_EDGE_WIDTH = 2.2;
const LANE_CENTRE_WIDTH = 3.0;
const PARKING_PITCH = 24;      // kerbside bay spacing
const CROSSWALK_BAND = 9;      // zebra band depth along the road
const MIN_STREET_FOR_MARKINGS = 26; // world units of carriageway width
const MIN_STREET_FOR_PARKING = 52;  // bays only on genuinely wide carriageways

// --- Detail tile ----------------------------------------------------------
// WHY THIS EXISTS, and why the world-space bake above is not enough on its own.
//
// The layout bake is ONE texture stretched 1:1 over the whole world plane, so
// its density is capped by texture memory: 0.55 texels per world unit. Measured
// at the actual gameplay camera (pitch 55, fov 40, dist 12r, mid-range phone
// portrait 824x1830 device px), the visible ground is ~102 world units across
// the screen width, i.e. ~8.06 device pixels per world unit. One layout texel
// therefore covers a 14.7 x 14.7 DEVICE PIXEL BLOCK. That is what "stretched
// and terrible" looks like, and no value of GROUND_TEXELS_PER_UNIT fixes it: a
// whole-world texture sharp enough for 1 texel per device pixel would be
// 19,459px square — 1.41 GB.
//
// So the layout map carries LOW-frequency information only (which zone, where
// the roads and paint are) and a small SEAMLESS TILE carries the high-frequency
// surface grain, repeated at a fixed world size. 512px over 32 world units is
// 16 texels per world unit — 29x the layout map, and ~2 texels per device pixel
// at the gameplay camera, which is correctly sampled rather than smeared.
// Cost is one 512px texture (1.0MB, +mips 1.4MB) regardless of level size.
//
// This is the half of 0003 §8 defect 4 that the first pass missed: the defect
// is titled "stretched, NOT TILED", and constant world density fixed only the
// "not stretched" half.
export const DETAIL_TILE_WORLD = 32;
export const DETAIL_TEX_SIZE = 512;
// Darkest the grain may multiply the ground by. Multiply-blended, so this is
// darkening-only, which is what surface grain physically is (dirt, wear,
// joints) — grain never adds light.
// Multiply blending cannot brighten, so the tile's MEAN is a flat darkening of
// the whole ground. At floor 0.80 the mean was x0.900 — a uniform 10% drop that
// would have pulled the carefully-set luma ladder down with it. The gamma
// pushes the distribution toward the top so the mean lands near x0.95 while the
// peak-to-trough contrast, which is what the eye reads as "surface", is kept.
const DETAIL_FLOOR = 0.78;
const DETAIL_GAMMA = 0.55;

// Tileable value noise: the lattice indices wrap modulo N, so the tile's right
// edge interpolates back into its left edge and there is no seam. Deliberately
// HIGH frequency only — a tile with strong low-frequency content shows its own
// repeat as a visible grid once it is tiled 75x across the world.
function latticeNoise(rng, n) {
  const a = new Float64Array(n * n);
  for (let i = 0; i < n * n; i += 1) a[i] = rng();
  return a;
}
function sampleLattice(a, n, u, v) {
  const x = u * n;
  const y = v * n;
  const i0 = Math.floor(x) % n;
  const j0 = Math.floor(y) % n;
  const i1 = (i0 + 1) % n;
  const j1 = (j0 + 1) % n;
  let fx = x - Math.floor(x);
  let fy = y - Math.floor(y);
  fx = fx * fx * (3 - 2 * fx); // smoothstep — bilinear alone shows lattice creases
  fy = fy * fy * (3 - 2 * fy);
  const s = a[j0 * n + i0] + (a[j0 * n + i1] - a[j0 * n + i0]) * fx;
  const t = a[j1 * n + i0] + (a[j1 * n + i1] - a[j1 * n + i0]) * fx;
  return s + (t - s) * fy;
}

/**
 * Pure (DOM-free) detail-tile pixels — one byte per texel, grayscale.
 * Exported separately from the canvas bake so it can be measured and rendered
 * headlessly; bakeGroundDetail() below is the thin DOM wrapper.
 * @returns {Uint8ClampedArray} size*size grayscale, tileable in both axes.
 */
export function groundDetailPixels(size = DETAIL_TEX_SIZE, seed = 1) {
  const rng = mulberry32((seed ^ 0x51ED2701) >>> 0);
  // BAND-LIMITED ON PURPOSE. The first version of this tile ran octaves at
  // lattice 64/128/256 plus a per-texel speckle, with the speckle justified in
  // a comment as "keeps energy at the Nyquist limit". That is precisely the
  // defect, not a feature: this tile is minified hard almost everywhere on
  // screen, and energy sitting at Nyquist in a minified texture aliases.
  //
  // It showed up as hard parallel STRIPES ruled across the entire ground —
  // moire between the tile's top octaves and the pixel grid, running along the
  // grazing axis where the anisotropic sampler runs out of taps. Confirmed by
  // A/B: rendering the same frame with the tile flattened to a constant made
  // every stripe vanish, so this tile was the source and nothing else was.
  // That striping is, quite literally, "stretched out and terrible", and it
  // was invisible until the exposure fix above stopped clipping the ground to
  // white and hiding it.
  //
  // The budget, measured: at the gameplay camera the ground runs about 0.124
  // world units per device pixel, so the finest feature that can be sampled
  // without aliasing is ~0.25 world units. At 16 texels/unit that is 4 texels,
  // i.e. a lattice of 512/4 = 128. Everything above that had to go:
  //
  //   lattice 256  -> 2 texels -> 0.125 u/cycle   ALIASES  (removed)
  //   per-texel speckle -> 0.125 u/cycle          ALIASES  (removed)
  //   lattice 128  -> 4 texels -> 0.250 u/cycle   at the limit, kept
  //   lattice  64  -> 8 texels -> 0.500 u/cycle   safe
  //   lattice  32  -> 16 texels -> 1.00 u/cycle   safe, carries the body
  //
  // Weights are re-balanced onto the surviving octaves so the tile's MEAN is
  // unchanged — GROUND_ALBEDO_SCALE above is calibrated against that mean, and
  // shifting it here would silently re-expose the whole ground.
  const oct = [
    { a: latticeNoise(rng, 32), n: 32, w: 0.50 },
    { a: latticeNoise(rng, 64), n: 64, w: 0.32 },
    { a: latticeNoise(rng, 128), n: 128, w: 0.18 },
  ];
  const out = new Uint8ClampedArray(size * size);
  for (let j = 0; j < size; j += 1) {
    const v = j / size;
    for (let i = 0; i < size; i += 1) {
      const u = i / size;
      let n = 0;
      for (const o of oct) n += sampleLattice(o.a, o.n, u, v) * o.w;
      const shaped = n <= 0 ? 0 : n ** DETAIL_GAMMA;
      out[j * size + i] = Math.round((DETAIL_FLOOR + (1 - DETAIL_FLOOR) * shaped) * 255);
    }
  }
  return out;
}

/**
 * Bakes the seamless grain tile to a canvas. Null when there is no DOM.
 * @returns {HTMLCanvasElement|null}
 */
export function bakeGroundDetail(opts = {}) {
  if (typeof document === 'undefined') return null;
  const size = opts.size || DETAIL_TEX_SIZE;
  const px = groundDetailPixels(size, opts.seed || 1);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const g = px[i];
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// --- Road markings as GEOMETRY -------------------------------------------
// Lane paint is the highest-contrast, most obviously-wrong thing on the
// ground: a hard white edge against dark asphalt is exactly the feature that
// magnification blur destroys most visibly, and at 0.55 texels/unit a 2.2-unit
// line is 1.2 texels smeared across ~18 device pixels. No achievable texture
// density fixes that — but geometry has no texel size, so a painted quad is
// pixel-sharp at any zoom.
//
// This returns a PURE, DOM-free and THREE-free quad list (content/ may not
// import three; main.js builds the BufferGeometry). Every quad is a flat
// world-space rectangle on the ground plane. Emitting them merged into one
// geometry keeps the whole marking set at ONE draw call.
//
// When these are used, bakeGroundTexture must be called with
// `roadMarkings: false` or the soft texture paint double-draws underneath.
const PAINT_BRIGHT = 0.98;
const PAINT_SOFT = 0.80;
const EDGE_SEGMENT = 40; // max world length of one edge-line quad

/**
 * @param {object} layout - a generateDistrict() descriptor.
 * @returns {Array<{x:number,z:number,w:number,d:number,rotY:number,tone:number}>}
 *   Rect centres/sizes in WORLD units; rotY follows districts.js's convention.
 */
export function roadMarkingQuads(layout) {
  const out = [];
  const streets = layout.streets || [];
  const rng = mulberry32((((layout.seed ?? 1) ^ 0x7F4A7C15) >>> 0));
  // Local rect (lx, lz, lw, ld) inside a street -> world quad.
  const push = (st, lx, lz, lw, ld, tone) => {
    const c = Math.cos(st.rotY || 0);
    const s = Math.sin(st.rotY || 0);
    out.push({
      x: st.x + c * lx + s * lz,
      z: st.z - s * lx + c * lz,
      w: lw, d: ld, rotY: st.rotY || 0, tone,
    });
  };
  for (const st of streets) {
    if (st.d < MIN_STREET_FOR_MARKINGS) continue;
    const halfLen = st.w / 2;
    const halfWide = st.d / 2;
    const end = halfLen - 6;
    if (end <= 0) continue;

    const crossings = [];
    for (const other of streets) {
      if (other === st) continue;
      const c = streetCrossing(st, other);
      if (c) crossings.push(c);
    }
    const nearJunction = (x, pad) => crossings.some(
      (c) => Math.abs(x - c.t) < c.halfSpan + pad,
    );

    // Solid edge lines, broken at junctions so paint never crosses a mouth.
    for (const side of [-1, 1]) {
      let runStart = -end;
      for (let x = -end; x <= end; x += 4) {
        const blocked = nearJunction(x, 4);
        if (blocked || x + 4 > end) {
          const runEnd = blocked ? x - 4 : end;
          // Split into <=EDGE_SEGMENT chunks. A street can be `world` long and
          // run diagonally, so a single full-length quad would both escape the
          // ground plane and defeat the bounds test below, which works on quad
          // centres.
          if (runEnd - runStart > 6) {
            const n = Math.max(1, Math.ceil((runEnd - runStart) / EDGE_SEGMENT));
            const seg = (runEnd - runStart) / n;
            for (let k = 0; k < n; k += 1) {
              push(st, runStart + seg * (k + 0.5), side * halfWide * 0.66,
                seg, LANE_EDGE_WIDTH, PAINT_BRIGHT);
            }
          }
          while (x <= end && nearJunction(x, 4)) x += 4;
          runStart = x;
        }
      }
    }

    // Dashed centre line, 14u dash / 12u gap.
    for (let x = -end; x <= end - 14; x += 26) {
      if (nearJunction(x + 7, 6)) continue;
      push(st, x + 7, 0, 14, LANE_CENTRE_WIDTH, PAINT_BRIGHT);
    }

    // Kerbside parking bays.
    if (st.d >= MIN_STREET_FOR_PARKING) {
      for (let x = -end; x <= end; x += PARKING_PITCH) {
        if (nearJunction(x, CROSSWALK_BAND + 6)) continue;
        for (const side of [-1, 1]) {
          push(st, x, side * halfWide * 0.845, 1.8, halfWide * 0.25, PAINT_SOFT);
        }
      }
    }

    // Crosswalk zebras on each junction approach.
    for (const c of crossings) {
      for (const dir of [-1, 1]) {
        const cx = c.t + dir * (c.halfSpan + 2 + CROSSWALK_BAND / 2);
        if (Math.abs(cx) > halfLen - CROSSWALK_BAND) continue;
        const stripes = 6;
        const sw = (halfWide * 1.8) / (stripes * 2 - 1);
        for (let s = 0; s < stripes; s += 1) {
          push(st, cx, -halfWide * 0.9 + s * sw * 2 + sw / 2,
            CROSSWALK_BAND, sw, PAINT_BRIGHT);
        }
      }
    }

    // Manhole covers — square-ish plates, dark rather than painted.
    for (let x = -end; x <= end; x += 90) {
      if (rng() > 0.45) continue;
      push(st, x + rng() * 30, (rng() - 0.5) * halfWide * 0.8, 5.2, 5.2, -1);
    }
  }
  // Clip to the ground plane. districts.js emits streets of length `world`,
  // and the organic/radial archetypes rotate them, so a diagonal street runs
  // to +-0.707*world and its paint would otherwise hang in the void past the
  // edge of the ground quad. The canvas bake got this clipping for free at the
  // canvas edge; geometry has to be told.
  const bound = layout.world / 2;
  return out.filter((q) => {
    const reach = Math.max(q.w, q.d) / 2;
    return Math.abs(q.x) + reach <= bound && Math.abs(q.z) + reach <= bound;
  });
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mixRgb(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
}

// Uniform albedo scale. Multiplies all three channels by the same factor, so
// hue and saturation are untouched and only the value moves — which is exactly
// what an exposure correction is, and why this cannot disturb the palette's
// hue separations (asphalt vs grass, lilac pavement vs cream promenade).
function scaleRgb(rgb, k) {
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
}

// Same colour, shifted in value — used for joints, mottle and rims so every
// surface's detail stays inside its own hue family.
function shadeRgb(rgb, k) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})`;
}

// World point -> rect-local coordinates (inverse of districts.js's
// rectPoint): inside the rect iff |lx| <= w/2 and |lz| <= d/2.
function pointInRect(px, pz, rect, grow = 0) {
  const dx = px - rect.x;
  const dz = pz - rect.z;
  const c = Math.cos(rect.rotY);
  const s = Math.sin(rect.rotY);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  return Math.abs(lx) <= rect.w / 2 + grow && Math.abs(lz) <= rect.d / 2 + grow;
}

// districts.js block zone -> ground surface class. `residential` and `avenue`
// used to both fall through to the raw-metro-ground `block` class; they now
// get real, value-separated surfaces (pavement / promenade).
function surfaceForBlockZone(zone) {
  if (zone === 'park') return 'grass';
  if (zone === 'plaza') return 'plaza';
  if (zone === 'avenue') return 'promenade';
  return 'pavement';
}

// Pure rasterization of the layout into a res x res grid of zone-class
// strings — the headless-consumable half of this module. Cell (i,j) maps to
// world x = (i+0.5)/res*world - world/2, z = (j+0.5)/res*world - world/2.
// The canvas bake no longer walks this grid (it paints vector rects), but the
// descriptor stays the pure, DOM-free contract for logic tests and probes.
export function describeGround(layout, opts = {}) {
  const res = opts.res || 128;
  const world = layout.world;
  const cells = new Array(res * res);
  const blocks = layout.blocks || [];
  const streets = layout.streets || [];
  for (let j = 0; j < res; j += 1) {
    for (let i = 0; i < res; i += 1) {
      const x = ((i + 0.5) / res) * world - world / 2;
      const z = ((j + 0.5) / res) * world - world / 2;
      let zone = 'pavement'; // open ground between blocks is paved, not bare
      for (const b of blocks) {
        if (pointInRect(x, z, b)) { zone = surfaceForBlockZone(b.zone); break; }
      }
      // Streets override blocks; the curb ring overrides block but not asphalt.
      let onStreet = false;
      let onCurb = false;
      for (const st of streets) {
        if (pointInRect(x, z, st)) { onStreet = true; break; }
        if (pointInRect(x, z, st, CURB_WIDTH)) onCurb = true;
      }
      if (onStreet) zone = 'asphalt';
      else if (onCurb) zone = 'curb';
      cells[j * res + i] = zone;
    }
  }
  return { res, world, cells, cellSize: world / res };
}

/** Canvas pixels for a world of this size, at the art direction's density. */
export function groundTextureSize(world, maxSize = GROUND_TEX_MAX) {
  const wanted = Math.round((world * GROUND_TEXELS_PER_UNIT) / 4) * 4;
  return Math.max(GROUND_TEX_MIN, Math.min(maxSize, wanted));
}

// Runs `fn` inside a rect's local frame. districts.js's convention: local +X
// maps to world (cos rotY, -sin rotY), and canvas y is world z, so the canvas
// rotation is -rotY. Inside `fn`, the rect spans +-(w/2+grow) x +-(d/2+grow).
function inRect(ctx, rect, grow, fn) {
  ctx.save();
  ctx.translate(rect.x, rect.z);
  ctx.rotate(-(rect.rotY || 0));
  fn(rect.w / 2 + grow, rect.d / 2 + grow);
  ctx.restore();
}

function clipRect(ctx, halfW, halfD) {
  ctx.beginPath();
  ctx.rect(-halfW, -halfD, halfW * 2, halfD * 2);
  ctx.clip();
}

// A grid of paving joints at a FIXED world pitch, drawn in the surface's own
// hue. This is the single detail that makes the reference's ground read as a
// built surface rather than a coloured plane, and it is why the pitch must be
// world-space: a joint grid that scales with the level is instantly readable
// as wrong.
function slabGrid(ctx, halfW, halfD, pitch, joint, hairline) {
  ctx.strokeStyle = joint;
  ctx.lineWidth = Math.max(0.8, hairline);
  ctx.beginPath();
  // Anchored to the surface's own local frame, so a rotated block's paving
  // runs with the block rather than with the world axes.
  for (let x = Math.ceil(-halfW / pitch) * pitch; x <= halfW; x += pitch) {
    ctx.moveTo(x, -halfD);
    ctx.lineTo(x, halfD);
  }
  for (let z = Math.ceil(-halfD / pitch) * pitch; z <= halfD; z += pitch) {
    ctx.moveTo(-halfW, z);
    ctx.lineTo(halfW, z);
  }
  ctx.stroke();
}

// Soft irregular blotches — grass clumping, asphalt patching. Seeded, so the
// same district always bakes the same pixels.
function mottle(ctx, halfW, halfD, rng, color, count, minR, maxR, alpha) {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i += 1) {
    const x = (rng() * 2 - 1) * halfW;
    const z = (rng() * 2 - 1) * halfD;
    const r = minR + rng() * (maxR - minR);
    ctx.beginPath();
    ctx.ellipse(x, z, r, r * (0.6 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Perpendicular centre-line intersection of two streets, in `a`'s local X.
// Returns null when the streets are near-parallel or do not actually cross.
function streetCrossing(a, b) {
  const d1x = Math.cos(a.rotY || 0);
  const d1z = -Math.sin(a.rotY || 0);
  const d2x = Math.cos(b.rotY || 0);
  const d2z = -Math.sin(b.rotY || 0);
  const cross = d1x * d2z - d1z * d2x;
  // Only NEAR-PERPENDICULAR junctions (>~45 degrees) get crosswalk geometry.
  // At shallower angles the two carriageways overlap over a long, lozenge-
  // shaped region and a rectangular zebra band painted across it lands half on
  // the junction and half on the kerb — the radial archetype's six-way star
  // was a puddle of white confetti before this threshold went up.
  if (Math.abs(cross) < 0.7) return null;
  const px = b.x - a.x;
  const pz = b.z - a.z;
  const t = (px * d2z - pz * d2x) / cross;
  const u = (px * d1z - pz * d1x) / cross;
  if (Math.abs(t) > a.w / 2 || Math.abs(u) > b.w / 2) return null;
  return { t, halfSpan: b.d / 2 };
}

/**
 * Bakes the layout into a canvas ground texture.
 * @param {object} layout - a generateDistrict() descriptor.
 * @param {{metro?: object, res?: number, size?: number, maxSize?: number,
 *   textures?: object, roadMarkings?: boolean}} [opts]
 *   metro: the level's metro (ground/sky palette). res: descriptor raster
 *   resolution. size: force an exact canvas size (otherwise derived from the
 *   world at GROUND_TEXELS_PER_UNIT). maxSize: cap for the derived size.
 * @returns {{canvas: HTMLCanvasElement|null, descriptor: object}}
 *   `canvas` is null when no DOM exists (logic tests) — use `descriptor`.
 */
export function bakeGroundTexture(layout, opts = {}) {
  const ground = (opts.metro && opts.metro.ground) || '#4a4a50';
  const descriptor = describeGround(layout, opts);
  if (typeof document === 'undefined') {
    return { canvas: null, descriptor };
  }

  const world = layout.world;
  const size = opts.size || groundTextureSize(world, opts.maxSize || GROUND_TEX_MAX);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const k = size / world;      // texels per world unit
  const W1 = 1 / k;            // one texel, in world units
  const rng = mulberry32((layout.seed ^ 0xB5297A4D) >>> 0);

  // Zone colour helpers. `rgb(zone)` is the flat fill; `tone(zone, d)` is the
  // same surface shifted in value for joints, rims and mottle.
  // Exposure-corrected versions of the bake's few absolute colours (sports
  // court paint), so nothing on the ground plane sits outside the budget.
  const scaledCss = (hex) => {
    const c = scaleRgb(hexToRgb(hex), GROUND_ALBEDO_SCALE);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const COURT_LINE = scaleRgb([255, 255, 255], GROUND_ALBEDO_SCALE).join(',');

  const rgbOf = {};
  const cssOf = {};
  for (const zone of Object.keys(GROUND_ZONE_MIX)) {
    const spec = GROUND_ZONE_MIX[zone];
    // The mix picks the hue and the ladder position; GROUND_ALBEDO_SCALE puts
    // the result inside the exposure budget. Applied here, once, so every
    // downstream use (flat fill, tone() joints and mottle, the photographic
    // wash) inherits it and nothing can drift out of the budget separately.
    rgbOf[zone] = scaleRgb(mixRgb(ground, spec.target, spec.t), GROUND_ALBEDO_SCALE);
    cssOf[zone] = `rgb(${rgbOf[zone][0]},${rgbOf[zone][1]},${rgbOf[zone][2]})`;
  }
  const tone = (zone, d) => shadeRgb(rgbOf[zone], d);

  // Optional photographic surfaces (textures.js). Kept working, but now the
  // pattern transform is expressed in WORLD units like everything else: one
  // source tile spans TILE_WORLD world units on every level.
  const TILE_WORLD = { asphalt: 72, curb: 54, plaza: 110, promenade: 96, pavement: 96, grass: 140 };
  const patterns = {};
  if (opts.textures) {
    for (const zone of Object.keys(TILE_WORLD)) {
      const src = opts.textures[zone];
      if (!src) continue;
      const pattern = ctx.createPattern(src, 'repeat');
      if (!pattern) continue;
      if (typeof pattern.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
        pattern.setTransform(new DOMMatrix().scale(TILE_WORLD[zone] / (src.width || size)));
      }
      patterns[zone] = pattern;
    }
  }

  // Fill a rect (already in its local frame) with the zone's surface, washing
  // a photographic pattern toward the zone tint when one is loaded.
  function fillZone(zone, halfW, halfD) {
    const spec = GROUND_ZONE_MIX[zone];
    if (patterns[zone]) {
      ctx.fillStyle = patterns[zone];
      ctx.fillRect(-halfW, -halfD, halfW * 2, halfD * 2);
      if (spec.wash > 0) {
        ctx.globalAlpha = spec.wash;
        ctx.fillStyle = cssOf[zone];
        ctx.fillRect(-halfW, -halfD, halfW * 2, halfD * 2);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.fillStyle = cssOf[zone];
      ctx.fillRect(-halfW, -halfD, halfW * 2, halfD * 2);
    }
  }

  // ---- world-space drawing frame ----------------------------------------
  // From here on every coordinate, radius and line width is in WORLD UNITS.
  ctx.setTransform(k, 0, 0, k, size / 2, size / 2);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  const blocks = layout.blocks || [];
  const streets = layout.streets || [];
  const half = world / 2;

  // 1. Open ground between blocks: paved, not bare metro colour. This alone is
  //    most of "bare brown ground" — the large expanses now have a surface.
  ctx.fillStyle = cssOf.pavement;
  ctx.fillRect(-half, -half, world, world);
  ctx.save();
  clipRect(ctx, half, half);
  slabGrid(ctx, half, half, SLAB_PITCH.pavement, tone('pavement', -0.17), 0.9);
  ctx.restore();

  // 2. Blocks, each with its own surface treatment.
  for (const b of blocks) {
    const zone = surfaceForBlockZone(b.zone);
    inRect(ctx, b, 0, (hw, hd) => {
      fillZone(zone, hw, hd);
      clipRect(ctx, hw, hd);
      if (zone === 'grass') {
        // Parks: clumped mottle, a warm sand path across the block, and (on
        // the larger ones) a marked sports court — all straight off
        // 1000030503.jpg, and all of it stops parks reading as flat green.
        mottle(ctx, hw, hd, rng, tone('grass', 0.16), 26, 4, 14, 0.55);
        mottle(ctx, hw, hd, rng, tone('grass', -0.16), 20, 3, 11, 0.45);
        const pathZ = (rng() * 2 - 1) * hd * 0.5;
        ctx.strokeStyle = cssOf.sand;
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.moveTo(-hw, pathZ - hd * 0.12);
        ctx.lineTo(hw, pathZ + hd * 0.12);
        ctx.stroke();
        if (Math.min(hw, hd) > 46 && rng() < 0.7) {
          const cw = Math.min(hw * 0.6, 54);
          const cd = Math.min(hd * 0.5, 30);
          const cx = (rng() * 2 - 1) * (hw - cw) * 0.7;
          const cz = (rng() * 2 - 1) * (hd - cd) * 0.7;
          // Court colours go through the same exposure scale as the zone
          // palette. Left absolute they would be the only surfaces on the
          // ground still authored at pre-correction brightness, and the white
          // court lines in particular would clip while everything around them
          // no longer does — a bright rectangle stamped on the one block that
          // is supposed to read as a park.
          ctx.fillStyle = scaledCss('#4fae3c');
          ctx.fillRect(cx - cw, cz - cd, cw * 2, cd * 2);
          ctx.strokeStyle = scaledCss('#e2733a');
          ctx.lineWidth = 3.5;
          ctx.strokeRect(cx - cw, cz - cd, cw * 2, cd * 2);
          ctx.strokeStyle = `rgba(${COURT_LINE},0.85)`;
          ctx.lineWidth = Math.max(1.2, W1);
          ctx.beginPath();
          ctx.moveTo(cx, cz - cd + 4); ctx.lineTo(cx, cz + cd - 4);
          ctx.rect(cx - cw + 4, cz - cd + 4, (cw - 4) * 2, (cd - 4) * 2);
          ctx.stroke();
        }
      } else {
        slabGrid(ctx, hw, hd, SLAB_PITCH[zone] || SLAB_PITCH.pavement, tone(zone, -0.17), 1.0);
        // Plazas and promenades get a second, coarser course line so the two
        // paved families separate by pattern as well as by value — the art
        // bible's "reads in grayscale" test needs a non-colour distinction.
        if (zone === 'plaza' || zone === 'promenade') {
          const coarse = (SLAB_PITCH[zone] || 11) * 4;
          slabGrid(ctx, hw, hd, coarse, tone(zone, -0.26), 1.6);
        }
      }
      // Every block reads as a raised lot: a darker rim inside its edge.
      ctx.strokeStyle = tone(zone, -0.22);
      ctx.lineWidth = Math.max(1.6, W1 * 1.5);
      ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
    });
  }

  // 3. Kerb rings (all of them), then their joints. Drawn before the
  //    carriageways so a later street always wins over an earlier kerb —
  //    the same precedence describeGround() encodes.
  for (const st of streets) {
    inRect(ctx, st, CURB_WIDTH, (hw, hd) => fillZone('curb', hw, hd));
  }
  for (const st of streets) {
    inRect(ctx, st, CURB_WIDTH, (hw, hd) => {
      clipRect(ctx, hw, hd);
      slabGrid(ctx, hw, hd, SLAB_PITCH.curb, tone('curb', -0.18), 0.9);
      // Kerb face: the bright lip the reference shows where pavement meets
      // road. Two-tone (light top, dark shadow) so it reads as a step.
      ctx.strokeStyle = tone('curb', 0.30);
      ctx.lineWidth = Math.max(1.8, W1 * 1.6);
      ctx.strokeRect(-hw + CURB_WIDTH * 0.15, -hd + CURB_WIDTH * 0.15,
        (hw - CURB_WIDTH * 0.15) * 2, (hd - CURB_WIDTH * 0.15) * 2);
    });
  }

  // 4. Carriageways.
  for (const st of streets) {
    inRect(ctx, st, 0, (hw, hd) => {
      fillZone('asphalt', hw, hd);
      clipRect(ctx, hw, hd);
      // Patch mottle: worn asphalt, repairs. Low contrast on purpose — the
      // lane paint has to stay the strongest value step on the road.
      mottle(ctx, hw, hd, rng, tone('asphalt', -0.13), 14, 5, 18, 0.35);
      mottle(ctx, hw, hd, rng, tone('asphalt', 0.10), 10, 4, 13, 0.28);
      // The gutter line where the carriageway meets the kerb.
      ctx.strokeStyle = tone('asphalt', -0.26);
      ctx.lineWidth = Math.max(1.4, W1);
      ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
    });
  }

  // 5. Road markings, in world units so lane paint is the same width on every
  //    level. Bright and near-opaque: in the reference the paint is one of the
  //    strongest value contrasts on screen.
  //
  //    NOT EXPOSURE-CORRECTED, and inert in the shipping path: main.js passes
  //    roadMarkings:false and draws the paint as geometry instead. The literal
  //    rgba(255,255,255,...) below is a pre-GROUND_ALBEDO_SCALE albedo and
  //    would clip hard under the 1.83x lighting gain. Anyone re-enabling this
  //    branch must route these through scaledCss / COURT_LINE first.
  if (opts.roadMarkings !== false) {
    for (const st of streets) {
      if (st.d < MIN_STREET_FOR_MARKINGS) continue;
      const crossings = [];
      for (const other of streets) {
        if (other === st) continue;
        const c = streetCrossing(st, other);
        if (c) crossings.push(c);
      }
      inRect(ctx, st, 0, (hw, hd) => {
        clipRect(ctx, hw, hd);
        const end = hw - 6;

        // Solid edge lines, inset from the kerb by roughly a lane margin.
        ctx.strokeStyle = 'rgba(255,255,255,0.78)';
        ctx.lineWidth = Math.max(LANE_EDGE_WIDTH, W1);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-end, side * hd * 0.66);
          ctx.lineTo(end, side * hd * 0.66);
          ctx.stroke();
        }

        // Dashed centre line — dash length in world units, so a dash is 14u
        // long whatever the level size. (This is the marking the old bake
        // stretched worst.)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(LANE_CENTRE_WIDTH, W1);
        ctx.setLineDash([14, 12]);
        ctx.beginPath();
        ctx.moveTo(-end, 0);
        ctx.lineTo(end, 0);
        ctx.stroke();
        ctx.setLineDash([]);

        // Kerbside parking bays: short perpendicular ticks at a fixed pitch,
        // skipped near junctions. 1000030511.jpg is almost nothing but these —
        // but only on wide carriageways, and faint. At full strength on every
        // street they stop reading as bays and turn each road into a ladder.
        if (st.d >= MIN_STREET_FOR_PARKING) {
          ctx.strokeStyle = 'rgba(255,255,255,0.42)';
          ctx.lineWidth = Math.max(1.8, W1);
          ctx.beginPath();
          for (let x = -end; x <= end; x += PARKING_PITCH) {
            let blocked = false;
            for (const c of crossings) {
              if (Math.abs(x - c.t) < c.halfSpan + CROSSWALK_BAND + 6) { blocked = true; break; }
            }
            if (blocked) continue;
            for (const side of [-1, 1]) {
              ctx.moveTo(x, side * hd * 0.72);
              ctx.lineTo(x, side * hd * 0.97);
            }
          }
          ctx.stroke();
        }

        // Crosswalks: a zebra band on each approach to every junction.
        ctx.fillStyle = 'rgba(255,255,255,0.86)';
        for (const c of crossings) {
          for (const dir of [-1, 1]) {
            const cx = c.t + dir * (c.halfSpan + 2);
            if (Math.abs(cx) > hw - CROSSWALK_BAND) continue;
            const x0 = dir > 0 ? cx : cx - CROSSWALK_BAND;
            const stripes = 6;
            const sw = (hd * 1.8) / (stripes * 2 - 1);
            for (let s = 0; s < stripes; s += 1) {
              ctx.fillRect(x0, -hd * 0.9 + s * sw * 2, CROSSWALK_BAND, sw);
            }
          }
        }

        // Manhole covers — small, dark, and exactly the kind of fixed-size
        // detail the stretched bake could never hold.
        ctx.fillStyle = tone('asphalt', -0.30);
        for (let x = -end; x <= end; x += 90) {
          if (rng() > 0.45) continue;
          ctx.beginPath();
          ctx.arc(x + rng() * 30, (rng() - 0.5) * hd * 0.8, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }

  // 6. Surface grain, as a repeating tile of FIXED world size. The old pass
  //    was a 64x64 grid stretched over the canvas — one cell was 37u on level
  //    1 and 75u on level 100, which is the stretching defect in its purest
  //    form. One tile is now 96 world units on every level.
  const grainPx = Math.max(GRAIN_CELLS, Math.round(GRAIN_TILE_WORLD * k));
  const grain = document.createElement('canvas');
  grain.width = grainPx;
  grain.height = grainPx;
  const gctx = grain.getContext('2d');
  const cell = grainPx / GRAIN_CELLS;
  const grng = mulberry32((layout.seed ^ 0x9E3779B9) >>> 0);
  for (let j = 0; j < GRAIN_CELLS; j += 1) {
    for (let i = 0; i < GRAIN_CELLS; i += 1) {
      const v = grng();
      gctx.fillStyle = v < 0.5
        ? `rgba(0,0,0,${(0.5 - v) * 0.13})`
        : `rgba(255,255,255,${(v - 0.5) * 0.09})`;
      gctx.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5);
    }
  }
  const grainPattern = ctx.createPattern(grain, 'repeat');
  if (grainPattern) {
    if (typeof grainPattern.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
      grainPattern.setTransform(new DOMMatrix().scale(GRAIN_TILE_WORLD / grainPx));
    }
    ctx.fillStyle = grainPattern;
    ctx.fillRect(-half, -half, world, world);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { canvas, descriptor };
}
