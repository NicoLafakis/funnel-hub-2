// Realistic city textures (art-direction.md §1: "Ground gets a texture, not a
// color" — extended from procedural tints to real surfaces). The PNGs in
// assets/textures/ are generated offline with scripts/leonardo.js (Leonardo
// AI, key from .leonardo-key) — realistic facades for the three building
// tiers and top-down surfaces for the ground zones. This module loads them at
// runtime with light canvas post-processing:
//
//   - Facades become THREE.CanvasTextures for propkit's instanced buildings.
//     A solid trim swatch is stamped into the top-left corner: propkit maps
//     every NON-facade part (window bands, setbacks, antennas) onto that
//     swatch via TRIM_UV, so one material serves the whole merged building.
//   - Ground surfaces are edge-cropped (the generator's watermark sits on the
//     left/bottom edges) and returned as canvases that groundtex.js turns
//     into repeating canvas patterns.
//
// Everything is optional: any image that fails to load simply drops out and
// the caller falls back to the procedural vertex-color/tint look, so the game
// boots identically with the files missing (and in headless Node, where this
// module returns null without touching the DOM at module top level).
//
// Shared-THREE pattern: THREE is passed in by the caller (main.js); this
// module never imports 'three' itself (content/ convention).
import { mulberry32 } from '../data/seeds.js';

// Master switch for the PHOTOGRAPHIC texture overlay. Stays OFF: the
// photorealistic set clashed with the flat Hole.io art direction
// (art-direction.md §1) and was moved to assets/textures/photoreal/. Keeping
// this false skips the fetches entirely, so missing files don't spam 404s into
// the console (and the e2e smoke).
export const CITY_TEXTURES_ENABLED = false;

// Master switch for the PROCEDURAL flat-cartoon facade set (bakeFacade below).
// This is the "flat-style set" the photoreal switch was waiting on, generated
// at runtime instead of shipped as art: no new binary assets, no dependency,
// and it is authored in the art direction rather than adapted to it.
export const PROCEDURAL_FACADES_ENABLED = true;

// Building kind -> facade image; ground zone -> surface image. Paths are
// relative to index.html (same convention as assets/hubs/<metro>.png).
// `crop` trims illustration margins (edge fractions l/t/r/b) so the facade
// fills the whole UV square edge to edge.
export const CITY_TEXTURE_MANIFEST = {
  facades: {
    'building-small': { src: 'assets/textures/facade-small.png', crop: { l: 0.20, t: 0.0, r: 0.11, b: 0.13 } },
    'building-medium': { src: 'assets/textures/facade-medium.png' },
    'building-large': { src: 'assets/textures/facade-large.png' },
  },
  ground: {
    asphalt: 'assets/textures/asphalt.png',
    curb: 'assets/textures/sidewalk.png',
    plaza: 'assets/textures/plaza.png',
    grass: 'assets/textures/grass.png',
  },
};

// UV point every non-facade building part samples (propkit.js). Must sit
// inside the swatch stamped by stampTrimSwatch below: canvas top-left 8%
// maps to uv u 0..0.08 / v 0.92..1 (CanvasTexture flipY).
export const TRIM_UV = [0.04, 0.96];
const TRIM_SWATCH_FRACTION = 0.08;
// PURE WHITE, not the old #c8c8c8. Every non-facade part (window bands,
// setbacks, antennas, doors, and every merged Blender-kit part) keeps its own
// vertex color and MULTIPLIES it by this swatch. A 0.784 grey therefore stole
// 22% of the brightness from every one of those parts the moment a facade map
// was attached — a whole-kit value shift disguised as a texture detail. White
// is the identity element for that multiply, so trim renders byte-identically
// textured or not, and the map only ever adds information.
const TRIM_SWATCH_COLOR = '#ffffff';

// Ground source images carry a faint generator watermark on the left/bottom
// edges — cropped off before the canvas becomes a repeating pattern.
const GROUND_CROP_LEFT = 0.06;
const GROUND_CROP_BOTTOM = 0.04;

// --- Procedural flat-cartoon facades -------------------------------------
//
// WHY THIS EXISTS. With CITY_TEXTURES_ENABLED false, buildings render as flat
// vertex-coloured boxes with three thin window BANDS of geometry — the only
// image texture anywhere in the running game was the ground. Buildings are the
// largest thing in frame after the ground (measured rendered sizes below), so
// "the textures are terrible" is, for the vertical half of the screen, a
// statement about surfaces that carry no texture at all.
//
// THE STRETCH TRAP, and why this is per-kind rather than one shared image.
// BoxGeometry gives every side face UV 0..1 regardless of that face's world
// size, and building faces are strongly non-square (measured h/w):
//
//   kind              rendered W x H (world u)   face aspect h/w
//   building-small     76.9 x 120.9              1.571
//   building-medium   111.0 x 242.2              2.182
//   building-large    149.7 x 419.2              2.800
//
// One square facade image stretched 0..1 across those faces would smear its
// windows 1.57x / 2.18x / 2.80x vertically. That is *literally* the stretched
// look, and it is what the old shared-image path would have shipped. The fix
// is not a UV change (the merge already hands each face a clean 0..1 square) —
// it is to author each kind's grid at ITS OWN aspect, so the window cell comes
// out square in WORLD units:
//
//   kind             cols x rows   cell W x H (world u)   error
//   building-small    4 x 5        19.23 x 18.86          1.9%
//   building-medium   6 x 10       18.50 x 18.89          2.1%
//   building-large    8 x 18       18.71 x 18.17          2.9%
//
// The shared ~19u floor module across all three tiers is the point: it is the
// same texel-density discipline the ground bake uses, applied to art. A window
// is one storey tall on a small shop and on a skyscraper alike, which is what
// makes the skyline read as one city rather than three unrelated box sizes.
//
// Texture sizes are picked for constant texel density, not convenience:
// 256px/76.9u = 3.33, 512/111.0 = 4.61, 512/149.7 = 3.42 texels per world
// unit. Medium runs 35% denser purely because 384 is not a power of two and
// the next POT step is 512 — noted rather than hidden. Total cost for the set
// is 256^2 + 512^2 + 512^2 RGBA = 2.4MB, against the ground map's ~17MB.
//
// VALUE, not hue. These are multiplied by white facade vertex colors and then
// by the per-instance pastel palette (instancing.js), so the canvas must be a
// near-white sheet carrying only DARKENING: paint a hue here and every pastel
// in the palette would be contaminated by it.
const FACADE_SPEC = {
  'building-small': { size: 256, cols: 4, rows: 5, seed: 0x5A17C0DE },
  'building-medium': { size: 512, cols: 6, rows: 10, seed: 0x6B28D1EF },
  'building-large': { size: 512, cols: 8, rows: 18, seed: 0x7C39E2F0 },
};

// Canvas y is flipped into v by CanvasTexture, so canvas TOP is the building's
// roofline and canvas BOTTOM is the street. The parapet band at the top is
// what makes the trim swatch invisible: the swatch occupies the top-left 8%,
// and the top 10% is a plain white parapet anyway, so the two coincide instead
// of the swatch punching a patch out of the window grid.
const FACADE_PARAPET = 0.10;   // roofline band, no windows
const FACADE_STREET = 0.12;    // ground-floor shopfront band
const FACADE_MULLION = '#e2e2e2';
const FACADE_PLINTH = '#d6d6d6';

/**
 * Bakes one kind's flat-cartoon facade. Deterministic: the per-window value
 * jitter is seeded, so two runs produce identical pixels (and identical
 * screenshots) rather than a texture that shimmers between sessions.
 * @returns {HTMLCanvasElement}
 */
function bakeFacade(spec, rand) {
  const { size, cols, rows } = spec;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // White sheet: the identity for the pastel instance-colour multiply.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const top = size * FACADE_PARAPET;
  const bottom = size * (1 - FACADE_STREET);
  const cellW = size / cols;
  const cellH = (bottom - top) / rows;

  // Cornice: one value step under the parapet so the roofline has an edge
  // instead of dissolving into the sky.
  ctx.fillStyle = FACADE_MULLION;
  ctx.fillRect(0, top - Math.max(1, size * 0.008), size, Math.max(1, size * 0.008));

  // Window grid. Inset is a fraction of the CELL, not of the canvas, so the
  // reveal around each window is the same world width on all three kinds.
  const insetX = cellW * 0.18;
  const insetY = cellH * 0.20;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // Storey-wide value drift plus a per-window step: real facades vary by
      // floor (blinds, lighting) far more than they vary window to window.
      const storey = 0.90 + rand() * 0.10;
      const lit = rand();
      // 0.34..0.62 grey. Never darker than 0.34: this multiplies a pastel that
      // is already mid-value, and glass reads as a value STEP, not as a hole.
      const g = Math.round(255 * storey * (lit < 0.18 ? 0.62 : 0.34 + lit * 0.16));
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(
        Math.round(c * cellW + insetX),
        Math.round(top + r * cellH + insetY),
        Math.round(cellW - insetX * 2),
        Math.round(cellH - insetY * 2),
      );
      // Sill: a light lip under each window, the detail that separates
      // "windows drawn on a wall" from "a wall with windows in it".
      ctx.fillStyle = FACADE_MULLION;
      ctx.fillRect(
        Math.round(c * cellW + insetX * 0.6),
        Math.round(top + (r + 1) * cellH - insetY),
        Math.round(cellW - insetX * 1.2),
        Math.max(1, Math.round(cellH * 0.05)),
      );
    }
  }

  // Street level: one tall glazed shopfront band and a plinth at the very
  // bottom. This is the band a player is closest to for most of a run.
  const shopTop = bottom + size * FACADE_STREET * 0.12;
  const shopH = size * FACADE_STREET * 0.62;
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(Math.round(cellW * 0.12), Math.round(shopTop), Math.round(size - cellW * 0.24), Math.round(shopH));
  // Mullions splitting the shopfront, one per column: keeps the ground floor
  // on the same rhythm as the grid above it.
  ctx.fillStyle = FACADE_MULLION;
  for (let c = 1; c < cols; c += 1) {
    ctx.fillRect(Math.round(c * cellW - size * 0.004), Math.round(shopTop), Math.max(1, Math.round(size * 0.008)), Math.round(shopH));
  }
  ctx.fillStyle = FACADE_PLINTH;
  ctx.fillRect(0, Math.round(shopTop + shopH), size, size - Math.round(shopTop + shopH));

  // Trim swatch LAST so nothing can draw over it — every non-facade part in
  // the merged geometry samples this corner.
  ctx.fillStyle = TRIM_SWATCH_COLOR;
  ctx.fillRect(0, 0, size * TRIM_SWATCH_FRACTION, size * TRIM_SWATCH_FRACTION);
  return canvas;
}

/** All three facades as THREE textures. Null when there is no DOM. */
function buildProceduralFacades(THREE) {
  if (typeof document === 'undefined') return null;
  const out = {};
  for (const [kind, spec] of Object.entries(FACADE_SPEC)) {
    const tex = new THREE.CanvasTexture(bakeFacade(spec, mulberry32(spec.seed >>> 0)));
    // ALBEDO -> sRGB. (The ground detail tile is NoColorSpace because it is a
    // multiplier; this one is colour a human picked, so it is sRGB-encoded.)
    tex.colorSpace = THREE.SRGBColorSpace;
    // Facades are near-vertical and the gameplay camera looks down at them, so
    // every one of them is sampled at a grazing angle in the upper half of the
    // frame — exactly the case anisotropy exists for. Not raised past 4 here
    // because this module has no renderer to ask for the device cap.
    tex.anisotropy = 4;
    // ClampToEdge (the default) is REQUIRED, not incidental: the trim swatch
    // lives at the corner, and any wrapping would tile it across the facade.
    out[kind] = tex;
  }
  return out;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function stampTrimSwatch(img, size, crop) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (crop) {
    ctx.drawImage(
      img,
      img.width * crop.l, img.height * crop.t,
      img.width * (1 - crop.l - crop.r), img.height * (1 - crop.t - crop.b),
      0, 0, size, size,
    );
  } else {
    ctx.drawImage(img, 0, 0, size, size);
  }
  ctx.fillStyle = TRIM_SWATCH_COLOR;
  ctx.fillRect(0, 0, size * TRIM_SWATCH_FRACTION, size * TRIM_SWATCH_FRACTION);
  return canvas;
}

function cropGroundSource(img, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const sx = img.width * GROUND_CROP_LEFT;
  const sw = img.width * (1 - GROUND_CROP_LEFT);
  const sh = img.height * (1 - GROUND_CROP_BOTTOM);
  ctx.drawImage(img, sx, 0, sw, sh, 0, 0, size, size);
  return canvas;
}

/**
 * Loads the realistic city texture set. Never throws.
 * @param {object} THREE - the shared three namespace (from main.js).
 * @param {{size?: number}} [opts] - size: working canvas pixels (square).
 * @returns {Promise<{facades: Object<string, object>, ground: Object<string, HTMLCanvasElement>}|null>}
 *   facades: building kind -> THREE.CanvasTexture (with trim swatch).
 *   ground: zone -> canvas pattern source for groundtex.js.
 *   null when there is no DOM or not a single image loaded.
 */
export async function loadCityTextures(THREE, opts = {}) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  if (!CITY_TEXTURES_ENABLED) {
    // Procedural path. `ground` is deliberately EMPTY: groundtex.js already
    // paints every ground class procedurally at constant world texel density,
    // and handing it surfaces here would replace that with something coarser.
    // Facades only.
    if (!PROCEDURAL_FACADES_ENABLED) return null;
    const facades = buildProceduralFacades(THREE);
    return facades ? { facades, ground: {} } : null;
  }
  const size = opts.size || 512;

  const facadeEntries = await Promise.all(
    Object.entries(CITY_TEXTURE_MANIFEST.facades).map(async ([kind, entry]) => {
      const img = await loadImage(entry.src);
      if (!img) return null;
      const tex = new THREE.CanvasTexture(stampTrimSwatch(img, size, entry.crop));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return [kind, tex];
    }),
  );
  const groundEntries = await Promise.all(
    Object.entries(CITY_TEXTURE_MANIFEST.ground).map(async ([zone, src]) => {
      const img = await loadImage(src);
      if (!img) return null;
      return [zone, cropGroundSource(img, size)];
    }),
  );

  const facades = Object.fromEntries(facadeEntries.filter(Boolean));
  const ground = Object.fromEntries(groundEntries.filter(Boolean));
  if (!Object.keys(facades).length && !Object.keys(ground).length) return null;
  return { facades, ground };
}
