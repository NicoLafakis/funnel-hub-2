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

// Master switch for the texture overlay. Currently OFF: the photorealistic
// set clashed with the flat Hole.io art direction (art-direction.md §1) and
// was moved to assets/textures/photoreal/ pending a flat-cartoon regen via
// scripts/leonardo.js. Keeping this false skips the fetches entirely, so
// missing files don't spam 404s into the console (and the e2e smoke).
// Flip to true once a flat-style set lands back in assets/textures/.
export const CITY_TEXTURES_ENABLED = false;

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
const TRIM_SWATCH_COLOR = '#c8c8c8'; // neutral light grey: part vertex colors tint it

// Ground source images carry a faint generator watermark on the left/bottom
// edges — cropped off before the canvas becomes a repeating pattern.
const GROUND_CROP_LEFT = 0.06;
const GROUND_CROP_BOTTOM = 0.04;

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
  if (!CITY_TEXTURES_ENABLED) return null;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
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
