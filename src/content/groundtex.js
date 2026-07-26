// Procedural ground texture (art-direction.md §1: "Ground gets a texture, not
// a color"). Bakes a districts.js layout descriptor — streets as dark asphalt
// strips with curbs, blocks tinted per zone (plaza / grass / built) — into a
// single canvas texture, so the V1 debug grid overlay can die: real streets
// do its motion-readability job. When opts.textures supplies the Leonardo-
// generated surfaces (textures.js: asphalt/curb/plaza/grass), zones are
// filled with the realistic repeating patterns washed toward the zone tints
// (GROUND_ZONE_MIX.wash) so dark texture art keeps the Hole.io-bright look,
// and every street gets a dashed center-line marking; otherwise the 64x64
// value noise + tints carry the look alone.
//
// DOM discipline: document.createElement('canvas') happens ONLY inside
// bakeGroundTexture(), never at module top level. Headless callers (the logic
// suite, Node) get the pure descriptor back with `canvas: null` — everything
// except the pixels is computable without a DOM.
import { mulberry32 } from '../data/seeds.js';

// Zone palette: each ground class is the metro's ground color mixed toward a
// target, so districts stay on-palette per metro while reading as asphalt /
// curb / plaza / lawn at a glance. Hole.io-style targets: warm LIGHT grey
// asphalt, beige sidewalk/plaza, saturated cartoon grass — the near-black
// V1 asphalt made every metro read as night. `wash` applies when a Leonardo
// texture fills the zone: the tint is overlaid at that alpha so the baked
// result stays as bright as the procedural path even when the source texture
// art is dark (asphalt.png is near-black).
export const GROUND_ZONE_MIX = {
  asphalt: { target: '#8a8f98', t: 0.7, wash: 0.6 },
  curb: { target: '#d9cfae', t: 0.35, wash: 0.25 },
  plaza: { target: '#e8e0cc', t: 0.5, wash: 0.3 },
  grass: { target: '#63c74d', t: 0.65, wash: 0.25 },
  block: { target: '#ffffff', t: 0.06, wash: 0 },
};

const CURB_WIDTH = 9; // world units of curb ring around each street

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
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

// Pure rasterization of the layout into a res x res grid of zone-class
// strings — the headless-consumable half of this module. Cell (i,j) maps to
// world x = (i+0.5)/res*world - world/2, z = (j+0.5)/res*world - world/2.
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
      let zone = 'block'; // bare metro ground between blocks
      for (const b of blocks) {
        if (pointInRect(x, z, b)) {
          zone = b.zone === 'park' ? 'grass' : b.zone === 'plaza' ? 'plaza' : 'block';
          break;
        }
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

/**
 * Bakes the layout into a canvas ground texture.
 * @param {object} layout - a generateDistrict() descriptor.
 * @param {{metro?: object, res?: number, size?: number}} [opts]
 *   metro: the level's metro (ground/sky palette). res: raster resolution
 *   (cells). size: output canvas pixels (square).
 * @returns {{canvas: HTMLCanvasElement|null, descriptor: object}}
 *   `canvas` is null when no DOM exists (logic tests) — use `descriptor`.
 */
export function bakeGroundTexture(layout, opts = {}) {
  const ground = (opts.metro && opts.metro.ground) || '#4a4a50';
  const descriptor = describeGround(layout, opts);
  if (typeof document === 'undefined') {
    return { canvas: null, descriptor };
  }

  const size = opts.size || 512;
  const { res, world } = descriptor;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const px = size / res;

  // Realistic zone surfaces (textures.js, Leonardo-generated): repeating
  // canvas patterns scaled so one tile spans a believable real-world size.
  // Any zone without a loaded image falls back to the procedural tint.
  const TILE_WORLD = { asphalt: 72, curb: 54, plaza: 110, grass: 140 };
  const patterns = {};
  if (opts.textures) {
    for (const zone of Object.keys(TILE_WORLD)) {
      const src = opts.textures[zone];
      if (!src) continue;
      const pattern = ctx.createPattern(src, 'repeat');
      if (!pattern) continue;
      if (typeof pattern.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
        const tilePx = (TILE_WORLD[zone] / world) * size;
        pattern.setTransform(new DOMMatrix().scale(tilePx / (src.width || size)));
      }
      patterns[zone] = pattern;
    }
  }

  // Per-cell zone tint (or realistic surface pattern when available — washed
  // toward the zone tint per GROUND_ZONE_MIX.wash so dark texture art stays
  // as bright as the procedural path).
  for (let j = 0; j < res; j += 1) {
    for (let i = 0; i < res; i += 1) {
      const zone = descriptor.cells[j * res + i];
      const mixSpec = GROUND_ZONE_MIX[zone];
      const tint = mixHex(ground, mixSpec.target, mixSpec.t);
      if (patterns[zone]) {
        ctx.fillStyle = patterns[zone];
        ctx.fillRect(i * px, j * px, px + 0.5, px + 0.5);
        if (mixSpec.wash > 0) {
          ctx.globalAlpha = mixSpec.wash;
          ctx.fillStyle = tint;
          ctx.fillRect(i * px, j * px, px + 0.5, px + 0.5);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = tint;
        ctx.fillRect(i * px, j * px, px + 0.5, px + 0.5);
      }
    }
  }

  // Road markings: a dashed center line down every street, drawn in the same
  // canvas space describeGround() rasterizes (canvas x = world x, canvas y =
  // world z; local +X maps to world (cos rotY, -sin rotY), so the canvas
  // rotation is -rotY). Cheap realism the procedural tint could never read.
  if (opts.roadMarkings !== false) {
    const k = size / world;
    ctx.strokeStyle = 'rgba(235,228,190,0.5)';
    ctx.lineWidth = Math.max(1.2, 2.4 * k);
    ctx.setLineDash([12 * k, 10 * k]);
    for (const st of layout.streets || []) {
      if (st.w * k < 30) continue;
      ctx.save();
      ctx.translate((st.x + world / 2) * k, (st.z + world / 2) * k);
      ctx.rotate(-(st.rotY || 0));
      ctx.beginPath();
      ctx.moveTo(-st.w * k / 2 + 6 * k, 0);
      ctx.lineTo(st.w * k / 2 - 6 * k, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);
  }

  // 64x64 deterministic value noise over everything (art §1's cheap
  // texture-no-image trick) — seeded from the layout so the same district
  // bakes the identical texture.
  const noiseRes = 64;
  const npx = size / noiseRes;
  const rng = mulberry32((layout.seed ^ 0xB5297A4D) >>> 0);
  for (let j = 0; j < noiseRes; j += 1) {
    for (let i = 0; i < noiseRes; i += 1) {
      const v = rng();
      ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${(0.5 - v) * 0.16})` : `rgba(255,255,255,${(v - 0.5) * 0.1})`;
      ctx.fillRect(i * npx, j * npx, npx + 0.5, npx + 0.5);
    }
  }

  return { canvas, descriptor };
}
