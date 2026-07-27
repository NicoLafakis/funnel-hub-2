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
//      UNITS. A paving slab is 9 units across on every level; the surface
//      grain tiles every 96 units on every level. Nothing is expressed as a
//      fraction of the canvas any more, so nothing can stretch with it.
//
// The old whole-canvas 64x64 value noise was the worst offender — one noise
// cell was 37u on level 1 and 75u on level 100. It is now a repeating pattern
// tile of fixed world size.
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
// 0.55 texels per world unit: a 9-unit paving slab lands on ~5 texels with a
// 1-texel joint, and a 2.2-unit lane line lands on ~1.2 texels. Below ~0.45
// the lane paint starts aliasing away, which is exactly what the 512px bake
// was doing.
//
// Cost (the ground texture is the ONLY large texture in the game; building
// facades are off, textures.js CITY_TEXTURES_ENABLED === false):
//   world 2415 (L1)   -> 1328px -> 7.1MB + mips ~9.4MB   (was 512px / 1.4MB)
//   world 3550 (L50)  -> 1952px -> 15.2MB + mips ~20MB
//   world 4800 (L100) -> capped 2048px -> 16.8MB + mips ~22MB
// Above world ~3724 the cap binds and density falls off toward 0.427 tx/u —
// documented rather than hidden. Pass `maxSize` to trade sharpness for memory
// on a constrained device.
export const GROUND_TEXELS_PER_UNIT = 0.55;
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
const SLAB_PITCH = { pavement: 9, promenade: 11, plaza: 14, curb: 6 };
const GRAIN_TILE_WORLD = 96;   // one surface-grain tile spans 96 world units
const GRAIN_CELLS = 32;        // 3 world units per grain cell
const LANE_EDGE_WIDTH = 2.2;
const LANE_CENTRE_WIDTH = 3.0;
const PARKING_PITCH = 24;      // kerbside bay spacing
const CROSSWALK_BAND = 9;      // zebra band depth along the road
const MIN_STREET_FOR_MARKINGS = 26; // world units of carriageway width
const MIN_STREET_FOR_PARKING = 52;  // bays only on genuinely wide carriageways

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
  const rgbOf = {};
  const cssOf = {};
  for (const zone of Object.keys(GROUND_ZONE_MIX)) {
    const spec = GROUND_ZONE_MIX[zone];
    rgbOf[zone] = mixRgb(ground, spec.target, spec.t);
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
          ctx.fillStyle = '#4fae3c';
          ctx.fillRect(cx - cw, cz - cd, cw * 2, cd * 2);
          ctx.strokeStyle = '#e2733a';
          ctx.lineWidth = 3.5;
          ctx.strokeRect(cx - cw, cz - cd, cw * 2, cd * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
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
