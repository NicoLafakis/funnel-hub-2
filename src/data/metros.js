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
  },
];
