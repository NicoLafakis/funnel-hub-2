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

// Master switch for the PHOTOGRAPHIC texture set in
// assets/textures/photoreal/ (generated offline, see
// .wiki/texture-map-manifest.md). This set is the approved look for the
// Level 1 Chicago Loop: it loads alongside the procedural set and main.js
// hands it to the renderer only for authoredCity === 'chicago-loop'. Any
// image that fails to load drops out per-entry, so the game boots
// identically with the files missing.
export const PHOTOREAL_TEXTURES_ENABLED = true;

// Master switch for the PROCEDURAL flat-cartoon facade set (bakeFacade below).
// Generated at runtime instead of shipped as art: no new binary assets, no
// dependency, and it is authored for the pastel palette multiply, which is
// why it stays the default for the 99 generic levels.
export const PROCEDURAL_FACADES_ENABLED = true;

// Photoreal set: building kind -> facade image; ground zone -> surface image.
// Paths are relative to index.html (same convention as assets/hubs/<metro>.png).
// Facades are composed onto a canvas whose aspect matches the tier's real
// face aspect (PHOTOREAL_FACE_ASPECT below) so windows stay square in world
// units instead of smearing 1.6x-2.8x vertically:
//   fit: 'cover' — single-frame art (the storefront) scaled to fill, sides
//     cropped; seamless grid art instead tiles `copies` times down the canvas
//     height so window scale matches across tiers.
// Ground zones without a dedicated tile alias the sidewalk for now
// (pavement/promenade get their own tiles per the manifest doc).
export const PHOTOREAL_TEXTURE_MANIFEST = {
  facades: {
    'building-small': { src: 'assets/textures/photoreal/facade-small.png', fit: 'cover' },
    'building-medium': { src: 'assets/textures/photoreal/facade-medium.png', copies: 2 },
    'building-large': { src: 'assets/textures/photoreal/facade-large.png', copies: 3 },
  },
  // Roof tile per tier, drawn into a square strip appended beside the facade
  // art (bakePhotorealFacade). The chase camera looks DOWN, so roofs are
  // ~30% of frame; without these every roof samples the flat trim swatch.
  roofs: {
    'building-small': 'assets/textures/photoreal/roof-gravel.png',
    'building-medium': 'assets/textures/photoreal/roof-concrete.png',
    'building-large': 'assets/textures/photoreal/roof-dark.png',
  },
  // Variant arts per tier, loaded alongside the base facade into an ARRAY
  // (instancing.js picks one per instanced group by stable key hash, so
  // variety costs zero extra draw calls — the 60-group ceiling stands).
  // Entries are src strings, or { src, roof } to override the tier's roof
  // strip — e.g. the sage-painted eco storefront carries the sedum roof.
  facadeVariants: {
    'building-small': [
      'assets/textures/photoreal/facade-small-brick-brown.png',
      'assets/textures/photoreal/facade-small-limestone.png',
      { src: 'assets/textures/photoreal/facade-small-painted.png', roof: 'assets/textures/photoreal/roof-green.png' },
      'assets/textures/photoreal/facade-small-ironspot.png',
    ],
    'building-medium': [
      'assets/textures/photoreal/facade-medium-brick-loft.png',
      'assets/textures/photoreal/facade-medium-limestone.png',
      'assets/textures/photoreal/facade-medium-brick-bay.png',
    ],
    'building-large': [
      'assets/textures/photoreal/facade-large-glass-dark.png',
      'assets/textures/photoreal/facade-large-concrete-glass.png',
      'assets/textures/photoreal/facade-large-violet.png',
    ],
  },
  ground: {
    asphalt: 'assets/textures/photoreal/asphalt.png',
    curb: 'assets/textures/photoreal/sidewalk.png',
    pavement: 'assets/textures/photoreal/ground-pavement.png',
    promenade: 'assets/textures/photoreal/ground-promenade.png',
    plaza: 'assets/textures/photoreal/plaza.png',
    grass: 'assets/textures/photoreal/grass.png',
    // Not groundtex zones — consumed by city-context.js for the Loop's
    // render-only river/lake planes.
    waterRiver: 'assets/textures/photoreal/water-river.png',
    waterLake: 'assets/textures/photoreal/water-lake.png',
    // Park path network (groundtex strokes it through grass blocks).
    parkPath: 'assets/textures/photoreal/ground-park-path.png',
  },
};

// Recovered 2026-07-29 metro art. These files were accidentally authored in
// the read-only V1 checkout; V2 owns their runtime contract here. Chicago's
// authored Level 1 continues to use PHOTOREAL_TEXTURE_MANIFEST above. The ten
// later metro chapters receive their own facade/street palette without ever
// changing Level 1's `chicago-loop` identity or its approved photographic set.
export const RECOVERED_METRO_TEXTURE_IDS = [
  'harbor-metropolis',
  'vieux-continent',
  'old-fog-town',
  'neon-district',
  'desert-spires',
  'coliseum-city',
  'carnival-coast',
  'red-square-heights',
  'harbor-opera-bay',
  'capital-prime',
];

// Real rendered face aspect (h/w) per tier, measured in the header below.
// The photoreal canvas is baked at this aspect so the face's 0..1 UV maps it
// distortion-free.
const PHOTOREAL_FACE_ASPECT = {
  'building-small': 1.571,
  'building-medium': 2.182,
  'building-large': 2.800,
};

// Roof strip: appended to the RIGHT of the facade art, one square tile of
// ROOF_STRIP_PX at the canvas top. propkit maps roof faces into it by world
// position so the tile repeats every ROOF_TILE_WORLD world units regardless
// of footprint, and remaps side faces into the remaining u range
// (texture.userData.facadeRegion carries the split to the merge).
const ROOF_STRIP_PX = 256;
const ROOF_TILE_WORLD = 32;

// UV point every non-facade building part samples (propkit.js). Must sit
// inside the swatch stamped into every facade canvas (bakeFacade and
// bakePhotorealFacade below): canvas top-left 8% maps to
// uv u 0..0.08 / v 0.92..1 (CanvasTexture flipY).
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
// WHY THIS EXISTS. Before this set, buildings rendered as flat
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

// Generator elevations arrive as a building floating on a white background.
// Tiling or covering that directly bakes white bands into the facade, so find
// the non-white bounding box and crop to it (with a small inset against
// anti-aliased halo pixels). Returns the img unchanged when no margin found.
function autoTrimFacade(img) {
  const probe = document.createElement('canvas');
  probe.width = img.width;
  probe.height = img.height;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(img, 0, 0);
  const data = pctx.getImageData(0, 0, probe.width, probe.height).data;
  const isInk = (x, y) => {
    const i = (y * probe.width + x) * 4;
    return data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235;
  };
  let top = 0;
  let bottom = probe.height - 1;
  let left = 0;
  let right = probe.width - 1;
  const colHasInk = (x) => { for (let y = 0; y < probe.height; y += 4) if (isInk(x, y)) return true; return false; };
  const rowHasInk = (y) => { for (let x = 0; x < probe.width; x += 4) if (isInk(x, y)) return true; return false; };
  while (top < bottom && !rowHasInk(top)) top += 1;
  while (bottom > top && !rowHasInk(bottom)) bottom -= 1;
  while (left < right && !colHasInk(left)) left += 1;
  while (right > left && !colHasInk(right)) right -= 1;
  const inset = 2;
  left += inset; top += inset; right -= inset; bottom -= inset;
  if (left >= right || top >= bottom) return img;
  if (left <= inset && top <= inset && right >= probe.width - 1 - inset && bottom >= probe.height - 1 - inset) return img;
  const out = document.createElement('canvas');
  out.width = right - left;
  out.height = bottom - top;
  out.getContext('2d').drawImage(probe, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// 0011 task 22: ground-floor shopfront strip, painted into the dead area of
// the appended roof strip (below the roof square) that no other UV samples.
// Bottom 60% glazing with mullions and a centred entrance, top 40%
// alternating striped awning segments — so the DOOR_GLASS band can sample
// real storefront art (propkit maps it here when region.shop exists) instead
// of the flat trim swatch.
function paintShopfrontStrip(ctx, x0, y0, px) {
  const glazH = px * 0.6;
  const awnH = px - glazH;
  // Awnings first (they sit at the top of the strip): four segments, each
  // striped against white the way the reference storefronts read.
  const awnings = ['#2e8b8b', '#b94a3c', '#3f7f4f', '#3a6f9f'];
  const segW = px / awnings.length;
  awnings.forEach((c, i) => {
    const ax = x0 + i * segW;
    ctx.fillStyle = c;
    ctx.fillRect(ax, y0, segW, awnH);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let s = 0; s < 4; s += 1) ctx.fillRect(ax + s * segW / 4 + segW / 8, y0, segW / 8, awnH);
  });
  // Glazing: pale glass, vertical mullions, transom bar, centred entrance.
  ctx.fillStyle = '#aec6d2';
  ctx.fillRect(x0, y0 + awnH, px, glazH);
  ctx.fillStyle = '#8fb0c0';
  for (let m = 0; m <= 8; m += 1) ctx.fillRect(x0 + m * px / 8 - 1, y0 + awnH, 3, glazH);
  ctx.fillRect(x0, y0 + awnH, px, 4);
  ctx.fillStyle = '#4a5c66';
  ctx.fillRect(x0 + px * 0.42, y0 + awnH + glazH * 0.45, px * 0.16, glazH * 0.55);
}

/**
 * Composes one photoreal facade at its tier's real face aspect. The merged
 * building geometry hands every side face a 0..1 UV square (propkit.js), so a
 * square source stretched over a 1.6x-2.8x tall face would smear its windows
 * vertically; baking the canvas at the face aspect makes that mapping
 * distortion-free. 'cover' art (the single-frame storefront) is scaled to
 * fill and cropped at the sides; seamless grid art tiles `copies` times down
 * the height so window scale matches across tiers.
 *
 * When roofImg is loaded, a ROOF_STRIP_PX square of roof tile is appended to
 * the right of the facade art and the return carries the UV split
 * (`region`) for propkit's merge: side faces sample u < region.u, roof faces
 * sample the strip by world position. The trim swatch goes on last, same
 * contract as the procedural bake.
 * @returns {{canvas: HTMLCanvasElement, region: {u: number, vSpan: number, tileWorld: number}|null}}
 */
function bakePhotorealFacade(img, kind, entry, size, roofImg) {
  const aspect = PHOTOREAL_FACE_ASPECT[kind] || 1;
  const facadeH = Math.round(size * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = roofImg ? size + ROOF_STRIP_PX : size;
  canvas.height = facadeH;
  const ctx = canvas.getContext('2d');
  if (entry.fit === 'cover') {
    // Uniform scale that fills the facade area, centered: the sides crop away.
    const scale = Math.max(size / img.width, facadeH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (facadeH - h) / 2, w, h);
  } else {
    const copies = Math.max(1, entry.copies || 1);
    const copyH = facadeH / copies;
    for (let i = 0; i < copies; i += 1) {
      ctx.drawImage(img, 0, Math.round(i * copyH), size, Math.ceil(copyH));
    }
  }
  let region = null;
  if (roofImg) {
    // Roof strip: top ROOF_STRIP_PX square of the appended width. The rest of
    // the strip is dead texels no UV ever samples — except the shopfront
    // band, which claims the square directly beneath the roof square (0011
    // task 22) and is exposed as region.shop for propkit's door-glass remap.
    ctx.drawImage(roofImg, size, 0, ROOF_STRIP_PX, ROOF_STRIP_PX);
    paintShopfrontStrip(ctx, size, ROOF_STRIP_PX, ROOF_STRIP_PX);
    region = {
      u: size / canvas.width,
      vSpan: ROOF_STRIP_PX / facadeH,
      tileWorld: ROOF_TILE_WORLD,
      shop: {
        u0: size / canvas.width,
        u1: 1,
        v0: 1 - (ROOF_STRIP_PX * 2) / facadeH,
        v1: 1 - ROOF_STRIP_PX / facadeH,
      },
    };
  }
  ctx.fillStyle = TRIM_SWATCH_COLOR;
  ctx.fillRect(0, 0, size * TRIM_SWATCH_FRACTION, size * TRIM_SWATCH_FRACTION);
  return { canvas, region };
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

// --- Prop detail atlases (0011 task 17) -----------------------------------
// One near-white detail map per merged street/vehicle kind — bark + foliage,
// vehicle panel + glass, clothing weave. Near-white because every vertex
// colour multiplies the map: the atlas adds surface detail while the palette
// pick and the edibility value multiplies stay arithmetically untouched.
// TRIM_UV still lands on a pure-white swatch, so untagged parts render
// byte-identically to the untextured build. propkit's builders tag their
// parts with these UV rects ([u0, v0, u1, v1]).
export const PROP_ATLAS_REGIONS = Object.freeze({
  tree: { foliage: [0.125, 0, 1, 1], bark: [0, 0, 0.125, 0.875] },
  car: { body: [0.125, 0, 1, 1], glass: [0, 0, 0.125, 0.875] },
  bus: { body: [0.125, 0, 1, 1], glass: [0, 0, 0.125, 0.875] },
  person: { cloth: [0.125, 0, 1, 1] },
});

function bakePropDetailAtlas(THREE, kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(0xA71A5 + kind.length);
  // Near-white base everywhere — the identity multiplier.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  const mottle = (x0, y0, w, h, color, count, rMin, rMax, alpha) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i += 1) {
      ctx.globalAlpha = alpha * (0.6 + rng() * 0.4);
      ctx.beginPath();
      ctx.arc(x0 + rng() * w, y0 + rng() * h, rMin + rng() * (rMax - rMin), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  if (kind === 'tree') {
    mottle(16, 0, 112, 128, '#cfe6c8', 260, 2, 7, 0.5);
    mottle(16, 0, 112, 128, '#9cc49a', 200, 1.5, 5, 0.4);
    for (let i = 0; i < 26; i += 1) {
      ctx.fillStyle = i % 2 ? '#c9b6a2' : '#b39a83';
      ctx.globalAlpha = 0.5 + rng() * 0.3;
      ctx.fillRect(rng() * 15, 16 + rng() * 40, 1.5, 60 + rng() * 60);
    }
    ctx.globalAlpha = 1;
  } else if (kind === 'car' || kind === 'bus') {
    ctx.fillStyle = '#e9e9e9';
    ctx.fillRect(16, 0, 112, 128);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(16, 12, 112, 30);
    ctx.strokeStyle = '#c7c7c7';
    ctx.lineWidth = 1;
    for (const y of [34, 66, 98]) { ctx.beginPath(); ctx.moveTo(16, y); ctx.lineTo(128, y); ctx.stroke(); }
    for (const x of [44, 82]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
    ctx.fillStyle = '#dcebf4';
    ctx.fillRect(0, 16, 16, 112);
    ctx.fillStyle = '#b9d2e2';
    for (let i = 0; i < 12; i += 1) ctx.fillRect(rng() * 15, 16 + rng() * 90, 2, 30 + rng() * 40);
  } else if (kind === 'person') {
    mottle(16, 0, 112, 128, '#e4e4e4', 220, 1, 3, 0.35);
    mottle(16, 0, 112, 128, '#ffffff', 160, 1, 3, 0.3);
  }
  // The TRIM_UV swatch (top-left 8%) must be pure white.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 16, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The photographic set: per-tier facades composed at their real face aspect
 * plus ground zone pattern sources for groundtex.js. Null when not a single
 * image loads.
 */
async function loadPhotorealSet(THREE, opts = {}) {
  const size = opts.size || 512;
  const roofSrcs = PHOTOREAL_TEXTURE_MANIFEST.roofs || {};
  const facadeEntries = await Promise.all(
    Object.entries(PHOTOREAL_TEXTURE_MANIFEST.facades).map(async ([kind, entry]) => {
      const [rawImg, roofImg] = await Promise.all([
        loadImage(entry.src),
        roofSrcs[kind] ? loadImage(roofSrcs[kind]) : null,
      ]);
      if (!rawImg) return null;
      const img = autoTrimFacade(rawImg);
      const { canvas, region } = bakePhotorealFacade(img, kind, entry, size, roofImg);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      // propkit's merge reads this split to aim side faces at the facade art
      // and roof faces at the appended strip (null when no roof tile loaded).
      tex.userData.facadeRegion = region;
      // Variant arts share the tier's fit/tiling and roof strip; the array is
      // only returned when at least one variant loaded.
      const variantSrcs = (PHOTOREAL_TEXTURE_MANIFEST.facadeVariants || {})[kind] || [];
      const variants = await Promise.all(variantSrcs.map(async (variant) => {
        const vsrc = typeof variant === 'string' ? variant : variant.src;
        const vroof = typeof variant === 'object' && variant.roof ? variant.roof : roofSrcs[kind];
        const [vraw, vroofImg] = await Promise.all([
          loadImage(vsrc),
          vroof ? loadImage(vroof) : null,
        ]);
        if (!vraw) return null;
        const vimg = autoTrimFacade(vraw);
        const v = bakePhotorealFacade(vimg, kind, entry, size, vroofImg);
        const vtex = new THREE.CanvasTexture(v.canvas);
        vtex.colorSpace = THREE.SRGBColorSpace;
        vtex.anisotropy = 4;
        vtex.userData.facadeRegion = v.region;
        return vtex;
      }));
      const set = [tex, ...variants.filter(Boolean)];
      return [kind, set.length > 1 ? set : tex];
    }),
  );
  const groundEntries = await Promise.all(
    Object.entries(PHOTOREAL_TEXTURE_MANIFEST.ground).map(async ([zone, src]) => {
      const img = await loadImage(src);
      if (!img) return null;
      return [zone, cropGroundSource(img, size)];
    }),
  );

  const facades = Object.fromEntries(facadeEntries.filter(Boolean));
  const ground = Object.fromEntries(groundEntries.filter(Boolean));
  if (!Object.keys(facades).length && !Object.keys(ground).length) return null;
  // 0011 task 17: procedural near-white detail maps for the merged
  // tree/car/bus/person kinds (Level 1 only — this set is Chicago-gated).
  const propAtlases = {};
  if (typeof document !== 'undefined') {
    for (const kind of ['tree', 'car', 'bus', 'person']) {
      propAtlases[kind] = bakePropDetailAtlas(THREE, kind);
    }
  }
  return { facades, ground, propAtlases };
}

async function loadRecoveredMetroSet(THREE, metroId, opts = {}) {
  const size = opts.size || 256;
  const root = `assets/textures/metro/${metroId}`;
  const facadeSources = {
    'building-small': `${root}/facade-storefront.png`,
    'building-medium': `${root}/facade-apartment.png`,
    'building-large': `${root}/facade-office.png`,
  };
  const facadeEntries = await Promise.all(
    Object.entries(facadeSources).map(async ([kind, src]) => {
      const raw = await loadImage(src);
      if (!raw) return null;
      const img = autoTrimFacade(raw);
      const baked = bakePhotorealFacade(img, kind, { fit: 'cover' }, size, null);
      const tex = new THREE.CanvasTexture(baked.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.userData.facadeRegion = baked.region;
      return [kind, tex];
    }),
  );
  const [street, sidewalk] = await Promise.all([
    loadImage(`${root}/street.png`),
    loadImage(`${root}/sidewalk.png`),
  ]);
  const ground = {};
  if (street) ground.asphalt = cropGroundSource(street, size);
  if (sidewalk) {
    const surface = cropGroundSource(sidewalk, size);
    ground.curb = surface;
    ground.pavement = surface;
    ground.promenade = surface;
    ground.plaza = surface;
  }
  const facades = Object.fromEntries(facadeEntries.filter(Boolean));
  if (!Object.keys(facades).length && !Object.keys(ground).length) return null;
  return { facades, ground };
}

/**
 * Loads every city texture set. Never throws.
 * @param {object} THREE - the shared three namespace (from main.js).
 * @returns {Promise<{facades: Object<string, object>|null, ground: Object, photoreal: {facades: Object, ground: Object}|null}|null>}
 *   facades: procedural building kind -> THREE.CanvasTexture, the default
 *     for the generic levels (null when disabled).
 *   ground: procedural path ships no ground surfaces (groundtex.js paints
 *     every zone procedurally for the generic levels) — always {}.
 *   photoreal: the photographic Level 1 set, or null when it failed to load.
 *   null when there is no DOM or nothing loaded at all.
 */
export async function loadCityTextures(THREE) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const facades = PROCEDURAL_FACADES_ENABLED ? buildProceduralFacades(THREE) : null;
  const [photoreal, metroEntries] = await Promise.all([
    PHOTOREAL_TEXTURES_ENABLED ? loadPhotorealSet(THREE) : null,
    Promise.all(RECOVERED_METRO_TEXTURE_IDS.map(async (metroId) => (
      [metroId, await loadRecoveredMetroSet(THREE, metroId)]
    ))),
  ]);
  const metros = Object.fromEntries(metroEntries.filter(([, set]) => !!set));
  if (!facades && !photoreal && !Object.keys(metros).length) return null;
  return { facades, ground: {}, photoreal, metros };
}
