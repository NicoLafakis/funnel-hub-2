// Procedural ground texture (art-direction.md §1: "Ground gets a texture, not
// a color"). Bakes a districts.js layout descriptor — streets as dark asphalt
// strips with curbs, blocks tinted per zone (plaza / grass / built) — into a
// single canvas texture, so the V1 debug grid overlay can die: real streets
// do its motion-readability job. No image assets; 64x64 value noise + tints.
//
// DOM discipline: document.createElement('canvas') happens ONLY inside
// bakeGroundTexture(), never at module top level. Headless callers (the logic
// suite, Node) get the pure descriptor back with `canvas: null` — everything
// except the pixels is computable without a DOM.
import { mulberry32 } from '../data/seeds.js';

// Zone palette: each ground class is the metro's ground color mixed toward a
// target, so districts stay on-palette per metro while reading as asphalt /
// curb / plaza / lawn at a glance.
export const GROUND_ZONE_MIX = {
  asphalt: { target: '#14161a', t: 0.7 },
  curb: { target: '#c9cdd2', t: 0.35 },
  plaza: { target: '#9a948a', t: 0.5 },
  grass: { target: '#3f7a3a', t: 0.65 },
  block: { target: '#ffffff', t: 0.06 },
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
  const { res } = descriptor;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const px = size / res;

  // Per-cell zone tint.
  for (let j = 0; j < res; j += 1) {
    for (let i = 0; i < res; i += 1) {
      const mixSpec = GROUND_ZONE_MIX[descriptor.cells[j * res + i]];
      ctx.fillStyle = mixHex(ground, mixSpec.target, mixSpec.t);
      ctx.fillRect(i * px, j * px, px + 0.5, px + 0.5);
    }
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
