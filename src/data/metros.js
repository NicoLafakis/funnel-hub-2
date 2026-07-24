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
//
// V2 additions (all pure data, consumed by engine/systems/content):
//   - signature: the metro's ONE signature visual beyond palette
//     (art-direction.md §4) — { type, params }. Types: 'bridge-silhouette' |
//     'mansard-roofs' | 'fog-banks' | 'emissive-signs' | 'sand-drift' |
//     'travertine-tint' | 'confetti' | 'snow-dust' | 'water-plane' |
//     'god-ray-tower'.
//   - propVariant: the metro's named prop reskin (content-and-meta.md §2) —
//     { kind, name, tint?, accessory? }. `accessory` is a PROP_ACCESSORIES
//     key in src/content/propkit.js; pass the whole object as createPropMesh's
//     4th `variant` arg.
//   - capstoneTwist: the authored twist on this metro's 10th (landmark-gated)
//     district (content-and-meta.md §1) — { id, description, params }. Only
//     surfaced on levels where levelInChapter === 10.

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
    signature: {
      type: 'bridge-silhouette',
      params: { spans: 3, deckHeight: 60, horizonFraction: 0.9, color: '#2c3a48' },
    },
    propVariant: { kind: 'bike', accessory: 'rope-crate', name: 'Wharf Bike' },
    capstoneTwist: {
      id: 'rising-tide',
      description: 'The tide rises — the map edge floods as the clock runs down.',
      params: { shrinkFraction: 0.15 },
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
    signature: {
      type: 'mansard-roofs',
      params: { roofTint: '#5a4a3a', pitch: 0.6, density: 0.8 },
    },
    propVariant: { kind: 'bike', accessory: 'baguette-basket', name: 'Boulangerie Bike' },
    capstoneTwist: {
      id: 'cafe-rush',
      description: 'Café rush — the sidewalk crowds respawn once, mid-level.',
      params: { respawnFraction: 0.3 },
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
    signature: {
      type: 'fog-banks',
      // Local fog banks that part as the avatar grows: partAtRadiusFraction is
      // the avatar-radius/world-radius ratio at which a bank fully opens.
      params: { bankCount: 6, opacity: 0.55, partAtRadiusFraction: 0.3 },
    },
    propVariant: { kind: 'car', accessory: 'cab-sign', tint: '#1c1e22', name: 'Black Cab' },
    capstoneTwist: {
      id: 'fog-closes-in',
      description: 'The fog closes in as you grow.',
      params: { fogNearFactor: 0.6 },
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
    signature: {
      type: 'emissive-signs',
      params: { signsPerBuilding: 2, palette: ['#ff2e93', '#2ee6ff', '#faff00'] },
    },
    propVariant: { kind: 'car', accessory: 'tuktuk-canopy', tint: '#3a2a5c', name: 'Neon Tuk-Tuk' },
    capstoneTwist: {
      id: 'double-value-fast-rivals',
      description: "Everything's worth 2× — but the rivals are faster.",
      params: { valueMultiplier: 2, rivalSpeedMultiplier: 1.3 },
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
    signature: {
      type: 'sand-drift',
      params: { particleCount: 120, speed: 18, height: 2 },
    },
    propVariant: { kind: 'car', accessory: 'gold-trim', tint: '#e8e2d0', name: 'Gold-Trim Supercar' },
    capstoneTwist: {
      id: 'sandstorm',
      description: 'A sandstorm sweeps the plaza at half-time.',
      params: { atTimeFraction: 0.5 },
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
    signature: {
      type: 'travertine-tint',
      params: { tint: '#e8d5b0', strength: 0.35 },
    },
    propVariant: { kind: 'trash', accessory: 'urn-lid', tint: '#d9c6a0', name: 'Forum Urn' },
    capstoneTwist: {
      id: 'roaring-crowd',
      description: 'The crowd wants a show — combos pay double coins here.',
      params: { coinComboMultiplier: 2 },
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
    signature: {
      type: 'confetti',
      params: { burstOnTierUp: true, colors: ['#ffd54a', '#ff2e93', '#2ee6ff', '#2ecc71'] },
    },
    propVariant: { kind: 'bus', accessory: 'samba-fringe', tint: '#2ecc71', name: 'Samba Float Bus' },
    capstoneTwist: {
      id: 'street-parade',
      description: 'A parade crosses the district — one long moving feast.',
      params: { paradePropCount: 20 },
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
    signature: {
      type: 'snow-dust',
      params: { intensity: 0.5, breathFog: true },
    },
    propVariant: { kind: 'car', accessory: 'plow-blade', tint: '#8a9098', name: 'Snow Plow' },
    capstoneTwist: {
      id: 'deep-freeze',
      description: 'Deep freeze — you move slower, but everything is worth more.',
      params: { speedMultiplier: 0.9, valueMultiplier: 1.25 },
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
    signature: {
      type: 'water-plane',
      params: { edge: 'south', color: '#0a3a4d', reflectSky: true },
    },
    propVariant: { kind: 'bike', accessory: 'surf-rack', tint: '#f2f2f2', name: 'Surf Bike' },
    capstoneTwist: {
      id: 'high-tide',
      description: 'High tide — the water advances and cuts the map.',
      params: { floodEdge: 'south', floodFraction: 0.2 },
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
    signature: {
      type: 'god-ray-tower',
      // The Portal Tower is visible from EVERY district of Capital Prime.
      params: { alwaysVisible: true, rayColor: '#7a5cff', rayOpacity: 0.35 },
    },
    propVariant: { kind: 'car', accessory: 'breeze-light', tint: '#2a2f45', name: 'Breeze Courier' },
    capstoneTwist: {
      id: 'portal-protocol',
      description: 'The Portal only opens for a peak combo.',
      params: { requiresComboCount: 25 },
    },
  },
];
