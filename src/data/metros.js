// The 10 metros (chapters) of the 100-level city rewrite.
// Exact `id`/`name`/`landmarkType` values are a CONTRACT — src/content/landmarks.js
// (built in parallel) switches on `landmarkType` by exact string match. Do not rename.
//
// Other fields (accent/ground/sky colors, districts) are flavor/authoring choices:
//   - accent: metro's UI/HUD accent color (hex string)
//   - ground: base ground-plane color for this metro (hex string)
//   - sky:    skybox/ambient color for this metro (hex string)
//   - districts: exactly 10 short display names, one per level within the metro
//     (levelInChapterOf(n)-1 indexes into this array), ordered outskirts -> capstone core.
//   - atmosphere: the per-metro lighting/air/glow recipe (see ATMOSPHERE below).
//
// -----------------------------------------------------------------------------
// ATMOSPHERE
// -----------------------------------------------------------------------------
// Before this block existed every one of the 100 levels rendered under one
// hardcoded white ambient + white sun, so Tokyo-at-night and Rome-at-noon looked
// identical. Each metro now carries an `atmosphere` describing a place AND a
// time of day. src/engine/scene.js's engine.applyAtmosphere() consumes the
// RESOLVED form (see atmosphereFor() below) at level start.
//
// This file stays pure data — no THREE import, no browser API — so it remains
// import()-able headlessly by the test suite.
//
// Shape (every field optional; anything omitted falls back to DEFAULT_ATMOSPHERE,
// which reproduces the pre-atmosphere render exactly):
//
//   timeOfDay  string  short machine-ish key ('night', 'golden-hour', ...)
//   label      string  human-readable one-liner, for UI/debug
//   sky        hex     scene.background AND the renderer clear color. Defaults
//                      to the metro's own `sky` field.
//   fog: { color, near, far }
//              color   hex; defaults to `sky` — a fog color that disagrees with
//                      the sky is the classic "fake outdoors" tell, so the
//                      default keeps them locked together and the authored
//                      values below only ever nudge a few percent off it.
//              near/far  FRACTIONS of the level's world size (not absolute
//                      units), so haze density stays consistent as worldSize(n)
//                      grows across the 100 levels. Small near + small far =
//                      thick soup; large near + large far = crisp air.
//   ambient: { color, intensity }        THREE.AmbientLight
//   sun: { color, intensity, direction } THREE.DirectionalLight. `direction` is
//                      a {x,y,z} pointing FROM the world toward the light; the
//                      engine normalizes it, so only the ratio matters. Low y =
//                      raking late-day light, y near 1 = overhead high noon.
//   fill: { color, intensity, direction } a SECOND directional light for rim /
//                      bounce color (neon spill, sci-fi cyan rim). Defaults to
//                      intensity 0, i.e. off.
//   bloom: { strength, radius, threshold } drives the selective UnrealBloomPass.
//                      strength 0 disables the whole bloom chain for that metro.
// -----------------------------------------------------------------------------

export const METROS = [
  {
    id: 'harbor-metropolis',
    name: 'Harbor Metropolis',
    landmarkType: 'liberty-statue',
    accent: '#4a90d9',
    ground: '#3c4a58',
    sky: '#8fb8d9',
    districts: [
      'Suburbs', 'Row Houses', 'Midtown Sprawl', 'Downtown', 'Financial District',
      'Bridge Approach', 'Harbor Piers', 'Warehouse District', 'Liberty Promenade', 'Liberty Plaza',
    ],
    // Crisp cold daylight off the water, mild sea haze. High sun, slightly
    // blue-shifted shadows, air clear enough to read the far skyline.
    atmosphere: {
      timeOfDay: 'midday',
      label: 'Crisp cold daylight, mild harbor haze',
      sky: '#a9c8e4',
      fog: { color: '#b6cfe4', near: 0.22, far: 1.0 },
      ambient: { color: '#c4dcf2', intensity: 0.5 },
      sun: { color: '#fff6e8', intensity: 1.05, direction: { x: 0.45, y: 0.78, z: 0.44 } },
      bloom: { strength: 0.45, radius: 0.5, threshold: 0.5 },
    },
  },
  {
    id: 'vieux-continent',
    name: 'Le Vieux Continent',
    landmarkType: 'lattice-tower',
    accent: '#c9a66b',
    ground: '#5a5248',
    sky: '#cdd9e0',
    districts: [
      'Old Town', 'Cobblestone Quarter', 'Boulevards', 'Cafe Row', 'Left Bank',
      'Riverside Promenade', 'Grand Avenue', 'Arc Circle', 'Garden District', 'Lattice Plaza',
    ],
    // Late-afternoon golden hour: low raking sun (y 0.34), everything washed
    // warm, soft contrast from a generous warm ambient.
    atmosphere: {
      timeOfDay: 'golden-hour',
      label: 'Warm late-afternoon gold, soft and low',
      sky: '#e8c89a',
      fog: { color: '#e2bf94', near: 0.14, far: 0.9 },
      ambient: { color: '#e8d0b0', intensity: 0.6 },
      sun: { color: '#ffc474', intensity: 1.15, direction: { x: 0.8, y: 0.34, z: -0.5 } },
      bloom: { strength: 0.7, radius: 0.55, threshold: 0.5 },
    },
  },
  {
    id: 'old-fog-town',
    name: 'Old Fog Town',
    landmarkType: 'clock-tower',
    accent: '#8a9ba8',
    ground: '#454f57',
    sky: '#9aa8ad',
    districts: [
      'Suburbs', 'Terrace Row', 'City', 'Market Lanes', 'Riverside',
      'Fog Embankment', 'Parliament Row', 'Clocktower Square', 'Foggy Bridge', 'Big Bell Plaza',
    ],
    // Overcast: the sun is a rumor (intensity 0.18) and the sky IS the light
    // source, so ambient carries almost everything — flat, low-contrast, nearly
    // shadowless. Fog near 0.05/far 0.55 is by far the thickest air in the
    // game. Bloom is all but off; nothing glows in soup this grey.
    atmosphere: {
      timeOfDay: 'overcast',
      label: 'Overcast, heavy grey fog, no shadows',
      sky: '#9aa3a8',
      fog: { color: '#9ba4a9', near: 0.05, far: 0.55 },
      ambient: { color: '#b6bec4', intensity: 0.85 },
      sun: { color: '#c8cdd2', intensity: 0.18, direction: { x: 0.2, y: 0.92, z: 0.3 } },
      bloom: { strength: 0.12, radius: 0.7, threshold: 0.75 },
    },
  },
  {
    id: 'neon-district',
    name: 'Neon District',
    landmarkType: 'sky-tower',
    accent: '#ff2e93',
    ground: '#1a1830',
    sky: '#160a2e',
    districts: [
      'Backstreets', 'Alley Market', 'Shopping Ward', 'Arcade Row', 'Tech Quarter',
      'Circuit Blocks', 'Neon Core', 'Signboard Canyon', 'Skywalk Terrace', 'Tower Plaza',
    ],
    // NIGHT. Near-black sky, a weak cold moon for shape definition, and the
    // real color comes from below: deep magenta ambient plus a magenta fill
    // raking almost horizontally (y 0.15) that reads as signage spill bouncing
    // off wet asphalt. Bloom is cranked (strength 1.5, low 0.28 threshold) so
    // every neon tube and headlight burns.
    atmosphere: {
      timeOfDay: 'night',
      label: 'Neon night — magenta spill, cyan moon',
      sky: '#080411',
      fog: { color: '#0d0620', near: 0.1, far: 0.75 },
      ambient: { color: '#6e2280', intensity: 0.45 },
      sun: { color: '#9fd8ea', intensity: 0.25, direction: { x: -0.35, y: 0.84, z: -0.42 } },
      fill: { color: '#ff2e93', intensity: 0.35, direction: { x: 0.6, y: 0.15, z: 0.78 } },
      bloom: { strength: 1.5, radius: 0.85, threshold: 0.28 },
    },
  },
  {
    id: 'desert-spires',
    name: 'Desert Spires',
    landmarkType: 'mega-spire',
    accent: '#f0c419',
    ground: '#8a6d3b',
    sky: '#f5deb3',
    districts: [
      'Outskirts', 'Dune Row', 'Marina', 'Yacht Row', 'Financial Souk',
      'Gold Market', 'Spire District', 'Sky Bridge', 'Palm Promenade', 'Spire Plaza',
    ],
    // High noon in the desert: sun almost straight overhead (y 0.98) at the
    // game's highest intensity (1.6), pure white, so the sky reads blown out
    // and shadows collapse underfoot. Suspended sand keeps a warm haze. Bloom
    // threshold is deliberately HIGH (0.68) — this is the one metro where
    // ordinary sunlit surfaces get close to clipping, and we do not want white
    // buildings turning into blobs.
    atmosphere: {
      timeOfDay: 'high-noon',
      label: 'Blown-out high noon, sand haze',
      sky: '#f2e4c4',
      fog: { color: '#eadfc0', near: 0.16, far: 0.85 },
      ambient: { color: '#f0e2c0', intensity: 0.62 },
      sun: { color: '#ffffff', intensity: 1.6, direction: { x: 0.08, y: 0.98, z: 0.14 } },
      bloom: { strength: 0.55, radius: 0.45, threshold: 0.68 },
    },
  },
  {
    id: 'coliseum-city',
    name: 'Coliseum City',
    landmarkType: 'amphitheater',
    accent: '#c1440e',
    ground: '#a67c52',
    sky: '#f2d9a0',
    districts: [
      'Suburbs', 'Villa Row', 'Old Quarter', 'Piazza Lanes', 'Forum',
      'Senate Steps', 'Amphitheater District', 'Colonnade Row', 'Aqueduct Approach', 'Arena Plaza',
    ],
    // Mediterranean midday: high sun but warm rather than white, dry dusty air
    // (a pale warm haze rather than a blue one), stone bouncing warm ambient.
    atmosphere: {
      timeOfDay: 'midday',
      label: 'Warm dry Mediterranean midday',
      sky: '#d5d2bd',
      fog: { color: '#d0cbb2', near: 0.18, far: 0.92 },
      ambient: { color: '#e6dcc0', intensity: 0.58 },
      sun: { color: '#ffe9c2', intensity: 1.3, direction: { x: 0.32, y: 0.88, z: 0.35 } },
      bloom: { strength: 0.5, radius: 0.5, threshold: 0.6 },
    },
  },
  {
    id: 'carnival-coast',
    name: 'Carnival Coast',
    landmarkType: 'mountain-statue',
    accent: '#2ecc71',
    ground: '#3a7d44',
    sky: '#7fd9e8',
    districts: [
      'Favela Edge', 'Hillside Steps', 'Beachfront', 'Boardwalk', 'Downtown',
      'Samba Square', 'Mountain District', 'Cable Car Row', 'Jungle Trail', 'Statue Plaza',
    ],
    // Bright tropical: the most saturated sky in the game (a real turquoise,
    // not a pale one), warm sun, and a humid haze that stays bright rather
    // than going grey the way Old Fog Town's does.
    atmosphere: {
      timeOfDay: 'tropical-day',
      label: 'Bright saturated tropics, humid haze',
      sky: '#6fd0e6',
      fog: { color: '#8bdae8', near: 0.18, far: 0.92 },
      ambient: { color: '#bff0f4', intensity: 0.6 },
      sun: { color: '#fff2d0', intensity: 1.25, direction: { x: 0.5, y: 0.76, z: 0.42 } },
      bloom: { strength: 0.65, radius: 0.55, threshold: 0.55 },
    },
  },
  {
    id: 'red-square-heights',
    name: 'Red Square Heights',
    landmarkType: 'onion-palace',
    accent: '#c0392b',
    ground: '#4a4a4a',
    sky: '#d8dee2',
    districts: [
      'Outskirts', 'Panel Blocks', 'Boulevard Ring', 'Metro Row', 'Old Town',
      'Merchant Quarter', 'Palace Square', 'Onion Row', 'Kremlin Wall', 'Palace Plaza',
    ],
    // Cold overcast winter: same "sky is the light source" logic as Old Fog
    // Town, but blue-grey and desaturated rather than warm-grey, and the sun
    // survives just enough (0.35) to keep a weak low-angle direction.
    atmosphere: {
      timeOfDay: 'overcast',
      label: 'Cold desaturated winter overcast',
      sky: '#b4c0c8',
      fog: { color: '#b8c4cc', near: 0.08, far: 0.7 },
      ambient: { color: '#c4d2dc', intensity: 0.72 },
      sun: { color: '#dce8f2', intensity: 0.35, direction: { x: 0.25, y: 0.86, z: -0.44 } },
      bloom: { strength: 0.3, radius: 0.6, threshold: 0.65 },
    },
  },
  {
    id: 'harbor-opera-bay',
    name: 'Harbor Opera Bay',
    landmarkType: 'sail-opera',
    accent: '#00a4bd',
    ground: '#2e5266',
    sky: '#bfe6f0',
    districts: [
      'Suburbs', 'Ferry Row', 'Harbor Bridge District', 'Pylon Lookout', 'CBD',
      'Circular Quay', 'Opera Point', 'Sail Promenade', 'Botanic Fringe', 'Opera Plaza',
    ],
    // Clear bright coastal morning, high-key: the CLEAREST air in the game
    // (fog near 0.28 / far 1.0 — haze barely starts before the far plane), a
    // bright pale ambient that lifts the shadows, and a low sun coming from
    // the opposite side (-x) to every afternoon metro so the light reads as
    // early rather than late.
    atmosphere: {
      timeOfDay: 'morning',
      label: 'Clear high-key coastal morning',
      sky: '#bfe6f0',
      fog: { color: '#cbecf5', near: 0.28, far: 1.0 },
      ambient: { color: '#d8f0f8', intensity: 0.65 },
      sun: { color: '#fff8e4', intensity: 1.2, direction: { x: -0.55, y: 0.68, z: 0.48 } },
      bloom: { strength: 0.4, radius: 0.45, threshold: 0.6 },
    },
  },
  {
    id: 'capital-prime',
    name: 'Capital Prime',
    landmarkType: 'portal-tower',
    accent: '#7a5cff',
    ground: '#20263a',
    sky: '#0d1120',
    districts: [
      // Fictional finale metro. Districts nod to the current shipped game's
      // Breeze AI / "eat the whole platform" finale gag as environmental flavor
      // (a HubSpot Tower cameo building, Breeze AI billboards in the prop set).
      'Outer Ring', 'Toll Row', 'Mid-City', 'Data Sprawl', 'Government Quarter',
      'Breeze Campus', 'Corporate Core', 'HubSpot Tower Row', 'Portal Approach', 'Grand Portal Plaza',
    ],
    // Sci-fi dusk bleeding into night. Dark violet sky, a cyan key coming from
    // BEHIND and to the left (negative x AND z) so it lands as a rim on
    // silhouettes rather than as fill, a violet fill from the front, and the
    // densest haze after Old Fog Town (near 0.06 / far 0.62) so the heavy
    // bloom smears through it and reads volumetric. Second-hardest glow in the
    // game, just under Neon District.
    atmosphere: {
      timeOfDay: 'dusk',
      label: 'Sci-fi dusk — violet haze, cyan rim',
      sky: '#1a1030',
      fog: { color: '#241246', near: 0.06, far: 0.62 },
      ambient: { color: '#4a2f8a', intensity: 0.5 },
      sun: { color: '#00e5ff', intensity: 0.4, direction: { x: -0.6, y: 0.55, z: -0.58 } },
      fill: { color: '#7a5cff', intensity: 0.3, direction: { x: 0.5, y: 0.25, z: 0.7 } },
      bloom: { strength: 1.35, radius: 0.9, threshold: 0.3 },
    },
  },
];

// -----------------------------------------------------------------------------
// Atmosphere resolution
// -----------------------------------------------------------------------------

// The pre-atmosphere render, expressed as data. A metro with NO `atmosphere`
// block resolves to exactly this (with sky/fog color falling back to its own
// `sky` field), which is byte-for-byte the lighting src/engine/scene.js and
// src/main.js hardcoded before atmospheres existed:
//   AmbientLight(0xffffff, 0.55), DirectionalLight(0xffffff, 0.9) at
//   (120, 220, 80), Fog(metro.sky, world*0.18, world*0.95), no second light,
//   no bloom.
export const DEFAULT_ATMOSPHERE = {
  timeOfDay: 'day',
  label: 'Neutral daylight',
  sky: '#8fb8d9',
  fog: { color: null, near: 0.18, far: 0.95 },
  ambient: { color: '#ffffff', intensity: 0.55 },
  sun: { color: '#ffffff', intensity: 0.9, direction: { x: 120, y: 220, z: 80 } },
  fill: { color: '#ffffff', intensity: 0, direction: { x: -1, y: 0.5, z: -1 } },
  bloom: { strength: 0, radius: 0.4, threshold: 0.6 },
};

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function resolveDirection(dir, fallback) {
  const src = dir && typeof dir === 'object' ? dir : fallback;
  const out = {
    x: num(src.x, fallback.x),
    y: num(src.y, fallback.y),
    z: num(src.z, fallback.z),
  };
  // A zero vector would leave a DirectionalLight sitting on the origin with no
  // direction at all (three would light nothing). Fall back rather than emit
  // an unusable light.
  if (out.x === 0 && out.y === 0 && out.z === 0) return { ...fallback };
  return out;
}

function resolveLight(light, fallback) {
  const src = light && typeof light === 'object' ? light : {};
  return {
    color: str(src.color, fallback.color),
    intensity: Math.max(0, num(src.intensity, fallback.intensity)),
    direction: resolveDirection(src.direction, fallback.direction),
  };
}

// Merges a metro's (possibly partial, possibly absent) `atmosphere` over
// DEFAULT_ATMOSPHERE and returns a fully-populated, plain-data recipe with
// every field concrete — no nulls, no undefineds — so engine.applyAtmosphere()
// never has to branch on missing data.
//
// Pure and side-effect free: safe to call per level start, and callable
// headlessly from the test suite.
export function atmosphereFor(metro) {
  const m = metro && typeof metro === 'object' ? metro : {};
  const a = m.atmosphere && typeof m.atmosphere === 'object' ? m.atmosphere : {};
  const D = DEFAULT_ATMOSPHERE;

  // Sky priority: the atmosphere's own sky, else the metro's legacy `sky`
  // field (which is what every level used before atmospheres), else the
  // neutral default.
  const sky = str(a.sky, str(m.sky, D.sky));

  const fogSrc = a.fog && typeof a.fog === 'object' ? a.fog : {};
  // Fog defaults to the sky color. A fog color that disagrees with the sky is
  // the classic tell that a scene is faking outdoors, so the fallback keeps
  // them identical unless a metro deliberately says otherwise.
  const fog = {
    color: str(fogSrc.color, sky),
    near: Math.max(0, num(fogSrc.near, D.fog.near)),
    far: Math.max(0, num(fogSrc.far, D.fog.far)),
  };
  // Degenerate ranges (far <= near) make THREE.Fog produce either no fog at
  // all or a fully-fogged frame; clamp to a usable band instead.
  if (fog.far <= fog.near) fog.far = fog.near + 0.01;

  const ambientSrc = a.ambient && typeof a.ambient === 'object' ? a.ambient : {};
  const bloomSrc = a.bloom && typeof a.bloom === 'object' ? a.bloom : {};

  return {
    timeOfDay: str(a.timeOfDay, D.timeOfDay),
    label: str(a.label, D.label),
    sky,
    fog,
    ambient: {
      color: str(ambientSrc.color, D.ambient.color),
      intensity: Math.max(0, num(ambientSrc.intensity, D.ambient.intensity)),
    },
    sun: resolveLight(a.sun, D.sun),
    fill: resolveLight(a.fill, D.fill),
    bloom: {
      strength: Math.max(0, num(bloomSrc.strength, D.bloom.strength)),
      // UnrealBloomPass documents radius as [0,1]; threshold is a luminance
      // cutoff in the same 0..1 range.
      radius: Math.min(1, Math.max(0, num(bloomSrc.radius, D.bloom.radius))),
      threshold: Math.min(1, Math.max(0, num(bloomSrc.threshold, D.bloom.threshold))),
    },
  };
}
