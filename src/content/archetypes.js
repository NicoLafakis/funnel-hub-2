import { CITY_OBJECTS } from './city-object-catalog.js';

// Pure district visual catalog. Gameplay remains keyed by the seven LEVEL_TEMPLATE
// kinds; these immutable visual IDs only select geometry and collection identity.
// No THREE, DOM, browser globals, or unseeded randomness belong in this module.

export const GAMEPLAY_KINDS = [
  'trash', 'bike', 'car', 'bus',
  'building-small', 'building-medium', 'building-large',
];

// Street-prop kinds (trees / pedestrians / street lamps): the Hole.io staple
// tier-0 food chain. Deliberately OUTSIDE GAMEPLAY_KINDS — they are not
// template tiers (the sacred 7-tier 1.35x economy is untouched) and not part
// of the 30-per-metro collectible catalogs; every metro shares the same set.
export const STREET_PROP_KINDS = ['tree', 'person', 'streetlamp'];

// The shared street-prop roster. `tint` is the variant's identity color
// (canopy / shirt / pole) — propkit bakes it into vertex colors in place of
// the metro accent; `flavor` selects the tree canopy silhouette. People come
// in the bright shirt hues of the Hole.io references; trees in vivid greens.
const STREET_PROP_CATALOG = [
  { id: 'street_tree_blob', gameplayKind: 'tree', tint: '#3fae4a', flavor: 'blob', footprint: 1.4, height: 3.2, silhouette: 'blob-canopy park tree' },
  { id: 'street_tree_cone', gameplayKind: 'tree', tint: '#57c256', flavor: 'cone', footprint: 1.4, height: 3.1, silhouette: 'cone-canopy pine' },
  { id: 'street_tree_lollipop', gameplayKind: 'tree', tint: '#2f9e44', flavor: 'lollipop', footprint: 1.2, height: 3.2, silhouette: 'lollipop street tree' },
  { id: 'street_person_red', gameplayKind: 'person', tint: '#e0483a', footprint: 0.3, height: 0.7, silhouette: 'pedestrian in red' },
  { id: 'street_person_yellow', gameplayKind: 'person', tint: '#f2c230', footprint: 0.3, height: 0.7, silhouette: 'pedestrian in yellow' },
  { id: 'street_person_blue', gameplayKind: 'person', tint: '#3fa9f5', footprint: 0.3, height: 0.7, silhouette: 'pedestrian in blue' },
  { id: 'street_person_pink', gameplayKind: 'person', tint: '#ff6fb3', footprint: 0.3, height: 0.7, silhouette: 'pedestrian in pink' },
  { id: 'street_person_teal', gameplayKind: 'person', tint: '#2ec8b8', footprint: 0.3, height: 0.7, silhouette: 'pedestrian in teal' },
  { id: 'street_lamp_classic', gameplayKind: 'streetlamp', tint: '#3a4a5a', footprint: 0.8, height: 2.9, silhouette: 'curved-arm street lamp' },
];

// Frozen id list (test suites read this to size the registry expectations).
export const STREET_PROP_ARCHETYPE_IDS = Object.freeze(STREET_PROP_CATALOG.map((a) => a.id));

// Registered variant ids for one street-prop kind (placement picks per prop).
export function streetPropArchetypeIds(kind) {
  return STREET_PROP_CATALOG.filter((a) => a.gameplayKind === kind).map((a) => a.id);
}

const KIND_COUNTS = [6, 4, 5, 3, 5, 4, 3]; // 30 archetypes per metro.

const METRO_FAMILIES = {
  'harbor-metropolis': [
    'bin', 'mailbox', 'planter', 'hydrant', 'bollard', 'rope_coil',
    'scooter', 'delivery_bike', 'wharf_bike', 'promenade_bike',
    'hatchback', 'taxi', 'sedan', 'executive_car', 'security_vehicle',
    'city_bus', 'maintenance_truck', 'tour_bus',
    'row_house', 'brownstone', 'kiosk', 'warehouse', 'civic_facade',
    'office_block', 'glass_midrise', 'loading_shed', 'plaza_office',
    'glass_tower', 'bridge_pylon', 'plaza_ensemble',
  ],
  'vieux-continent': [
    'basket', 'lamp_post', 'cafe_chair', 'planter', 'bread_crate', 'fountain',
    'city_bike', 'bakery_bike', 'courier_bike', 'promenade_bike',
    'compact_car', 'taxi', 'delivery_van', 'executive_car', 'gendarme_car',
    'boulevard_bus', 'tour_coach', 'service_bus',
    'townhouse', 'bakery', 'cafe', 'bookshop', 'garden_pavilion',
    'mansard_block', 'riverside_block', 'arcade_block', 'museum_block',
    'grand_hotel', 'lattice_office', 'plaza_ensemble',
  ],
  'old-fog-town': [
    'rubbish_bin', 'post_box', 'market_crate', 'lamp_post', 'bollard', 'news_stand',
    'commuter_bike', 'market_bike', 'courier_bike', 'park_bike',
    'saloon', 'black_cab', 'estate_car', 'delivery_van', 'police_car',
    'double_decker', 'rail_replacement_bus', 'tour_coach',
    'brick_terrace', 'corner_shop', 'market_stall', 'station_house', 'pub',
    'terrace_block', 'warehouse_block', 'parliament_office', 'clock_block',
    'fog_tower', 'rail_hotel', 'bell_plaza_ensemble',
  ],
  'neon-district': [
    'vending_unit', 'arcade_stool', 'delivery_box', 'lantern', 'data_kiosk', 'sign_stack',
    'street_scooter', 'delivery_bot', 'courier_bike', 'neon_bike',
    'micro_car', 'tuk_tuk', 'taxi', 'delivery_van', 'patrol_car',
    'night_bus', 'arcade_shuttle', 'skywalk_bus',
    'noodle_shop', 'arcade', 'capsule_shop', 'robot_garage', 'karaoke_box',
    'shopping_block', 'circuit_block', 'signboard_block', 'skywalk_block',
    'neon_tower', 'broadcast_tower', 'portal_plaza_ensemble',
  ],
  'desert-spires': [
    'luggage', 'market_crate', 'palm_planter', 'gold_bollard', 'water_cask', 'souvenir_stand',
    'golf_cart', 'marina_bike', 'courier_scooter', 'promenade_scooter',
    'sand_buggy', 'supercar', 'taxi', 'yacht_tender', 'security_car',
    'hotel_shuttle', 'market_bus', 'marina_coach',
    'market_stall', 'marina_shop', 'courtyard_house', 'yacht_club', 'palm_pavilion',
    'souk_block', 'hotel_block', 'skybridge_block', 'marina_block',
    'gold_spire', 'glass_spire', 'spire_plaza_ensemble',
  ],
  'coliseum-city': [
    'amphora', 'market_crate', 'fountain_bowl', 'stone_bollard', 'fruit_stall', 'lamp_standard',
    'scooter', 'delivery_scooter', 'market_bike', 'piazza_bike',
    'compact_car', 'taxi', 'market_van', 'senate_car', 'patrol_car',
    'city_bus', 'tour_coach', 'arena_shuttle',
    'villa', 'trattoria', 'market_stall', 'forum_shop', 'colonnade_pavilion',
    'stone_block', 'senate_block', 'aqueduct_block', 'arena_office',
    'forum_tower', 'colonnade_tower', 'arena_plaza_ensemble',
  ],
  'carnival-coast': [
    'beach_ball', 'fruit_crate', 'drum', 'deck_chair', 'food_cart', 'confetti_bin',
    'beach_bike', 'delivery_bike', 'samba_bike', 'jungle_bike',
    'compact_car', 'taxi', 'beach_buggy', 'parade_car', 'service_van',
    'city_bus', 'samba_float', 'cable_car',
    'hillside_house', 'juice_stand', 'beach_kiosk', 'music_club', 'jungle_pavilion',
    'favela_block', 'downtown_block', 'boardwalk_hotel', 'cable_station',
    'coast_tower', 'mountain_hotel', 'statue_plaza_ensemble',
  ],
  'red-square-heights': [
    'snow_bin', 'market_crate', 'lamp_post', 'ice_bollard', 'kiosk_cart', 'palace_flag',
    'winter_bike', 'courier_bike', 'metro_bike', 'merchant_bike',
    'compact_car', 'snow_plow', 'taxi', 'state_car', 'patrol_car',
    'city_bus', 'tram_unit', 'palace_coach',
    'panel_house', 'market_kiosk', 'metro_entrance', 'merchant_shop', 'wall_pavilion',
    'panel_block', 'boulevard_block', 'kremlin_office', 'onion_block',
    'state_tower', 'palace_tower', 'palace_plaza_ensemble',
  ],
  'harbor-opera-bay': [
    'ferry_rope', 'surf_rack', 'harbor_bin', 'quay_bollard', 'picnic_table', 'sail_marker',
    'city_bike', 'surf_bike', 'courier_bike', 'botanic_bike',
    'compact_car', 'taxi', 'harbor_ute', 'service_car', 'security_car',
    'city_bus', 'ferry_shuttle', 'tour_coach',
    'harbor_house', 'ferry_kiosk', 'surf_shop', 'quay_pavilion', 'botanic_house',
    'cbd_block', 'pylon_block', 'opera_office', 'sail_hotel',
    'glass_tower', 'harbor_tower', 'opera_plaza_ensemble',
  ],
  'capital-prime': [
    'data_bin', 'courier_drone', 'toll_bollard', 'server_crate', 'holo_kiosk', 'portal_beacon',
    'campus_scooter', 'delivery_bot', 'courier_bike', 'portal_bike',
    'compact_ev', 'breeze_courier', 'campus_shuttle', 'security_ev', 'executive_ev',
    'ring_bus', 'data_shuttle', 'portal_coach',
    'toll_house', 'data_kiosk', 'campus_pod', 'security_station', 'portal_gate',
    'data_block', 'campus_block', 'corporate_block', 'hubspot_block',
    'breeze_tower', 'portal_tower', 'grand_portal_ensemble',
  ],
};

const DISTRICT_INTRO_COUNTS = [0, 3, 3, 3, 3, 3, 2, 2, 2, 2];
const RECIPE_ACCENTS = ['box', 'cap', 'bar', 'mast', 'canopy', 'spire'];
const KIND_DIMENSIONS = {
  trash: [0.8, 1.2, 250],
  bike: [1.0, 1.8, 250],
  car: [2.3, 1.8, 600],
  bus: [4.8, 3.4, 600],
  'building-small': [5.0, 12, 900],
  'building-medium': [8.0, 26, 1500],
  'building-large': [11.0, 46, 1500],
};

function slug(value) {
  return value.replace(/-/g, '_');
}

function buildMetro(metroId, names) {
  const archetypes = {};
  const byKind = {};
  let cursor = 0;
  for (let k = 0; k < GAMEPLAY_KINDS.length; k += 1) {
    const kind = GAMEPLAY_KINDS[k];
    byKind[kind] = [];
    for (let i = 0; i < KIND_COUNTS[k]; i += 1) {
      const name = names[cursor];
      const id = `${slug(metroId)}_${name}`;
      const dimensions = KIND_DIMENSIONS[kind];
      const descriptor = {
        id,
        gameplayKind: kind,
        family: name,
        recipe: RECIPE_ACCENTS[(cursor + k) % RECIPE_ACCENTS.length],
        recipeIndex: cursor,
        materialRole: `${slug(metroId)}_${kind.replace(/-/g, '_')}`,
        collectionKey: id,
        silhouette: name.replace(/_/g, ' '),
        environmentalFunction: `${name.replace(/_/g, ' ')} district landmark`,
        silhouetteShapes: ['stable base', RECIPE_ACCENTS[(cursor + k) % RECIPE_ACCENTS.length], 'directional accent'],
        baseMaterial: k >= 4 ? 'masonry and glass' : 'painted metal and rubber',
        roughness: k >= 4 ? 0.85 : 0.62,
        metalness: k >= 4 ? 0.05 : 0.18,
        groundContrast: 'silhouette and value contrast',
        footprint: dimensions[0],
        height: dimensions[1],
        triangleBudget: dimensions[2],
        nonColorDistinction: `${name.replace(/_/g, ' ')} profile cue`,
        introducedAt: null,
        returnDistricts: [],
      };
      archetypes[id] = descriptor;
      byKind[kind].push(id);
      cursor += 1;
    }
  }

  const baselines = Object.fromEntries(GAMEPLAY_KINDS.map((kind) => [kind, byKind[kind][0]]));
  // Interleave tiers so every district can reserve its novelty quota from a
  // useful spread of plentiful and sparse gameplay kinds.
  const remaining = [];
  const maxVariants = Math.max(...GAMEPLAY_KINDS.map((kind) => byKind[kind].length - 1));
  for (let variantIndex = 1; variantIndex <= maxVariants; variantIndex += 1) {
    for (const kind of GAMEPLAY_KINDS) {
      if (byKind[kind][variantIndex]) remaining.push(byKind[kind][variantIndex]);
    }
  }
  const districts = {};
  const abundantKinds = new Set(['trash', 'bike']);
  const plentiful = remaining.filter((id) => abundantKinds.has(archetypes[id].gameplayKind));
  const sparse = remaining.filter((id) => !abundantKinds.has(archetypes[id].gameplayKind));
  const introductionSchedule = {};
  for (let district = 2; district <= 9; district += 1) {
    const count = DISTRICT_INTRO_COUNTS[district - 1];
    const introduces = [plentiful.shift()];
    while (introduces.length < count && sparse.length) introduces.push(sparse.shift());
    introductionSchedule[district] = introduces;
  }
  // All 30 archetypes ship in active catalogs. District 10 repeats one early
  // abundant ID after a long gap so its >=25% quota remains achievable.
  introductionSchedule[10] = [...sparse, remaining.find((id) => archetypes[id].gameplayKind === 'trash')];
  for (let district = 1; district <= 10; district += 1) {
    const introduces = introductionSchedule[district] || [];
    const mixes = {};
    for (const kind of GAMEPLAY_KINDS) {
      const newForKind = introduces.filter((id) => archetypes[id].gameplayKind === kind);
      mixes[kind] = [baselines[kind], ...newForKind];
    }
    districts[district] = Object.freeze({ mixes: Object.freeze(mixes), introduces: Object.freeze(introduces) });
  }
  for (const catalog of Object.values(districts)) {
    for (const ids of Object.values(catalog.mixes)) {
      for (const id of ids) {
        const descriptor = archetypes[id];
        const district = Number(Object.keys(districts).find((key) => districts[key] === catalog));
        if (descriptor.introducedAt === null || district < descriptor.introducedAt) descriptor.introducedAt = district;
        if (!descriptor.returnDistricts.includes(district)) descriptor.returnDistricts.push(district);
      }
    }
  }
  for (const descriptor of Object.values(archetypes)) {
    descriptor.returnDistricts = Object.freeze(descriptor.returnDistricts);
    Object.freeze(descriptor);
  }
  return { archetypes, districts };
}

const allArchetypes = {};
const allCatalogs = {};
for (const [metroId, names] of Object.entries(METRO_FAMILIES)) {
  const built = buildMetro(metroId, names);
  Object.assign(allArchetypes, built.archetypes);
  allCatalogs[metroId] = Object.freeze(built.districts);
}

// Shared street props: full descriptors with the same field contract as the
// metro archetypes (validateArchetypeCatalogs checks every registry entry),
// but introducedAt fixed at 1 and no district catalog membership — they are
// placed by districts.js's street-prop scatter, not the novelty mixes.
for (const entry of STREET_PROP_CATALOG) {
  allArchetypes[entry.id] = Object.freeze({
    id: entry.id,
    gameplayKind: entry.gameplayKind,
    family: entry.gameplayKind === 'streetlamp' ? 'street_lamp' : `street_${entry.gameplayKind}`,
    recipe: 'base',
    recipeIndex: 0,
    materialRole: entry.id,
    collectionKey: entry.id,
    silhouette: entry.silhouette,
    environmentalFunction: `${entry.silhouette} street clutter`,
    silhouetteShapes: ['stable base', 'vertical accent'],
    baseMaterial: entry.gameplayKind === 'tree' ? 'foliage and wood' : 'painted metal and cloth',
    roughness: entry.gameplayKind === 'streetlamp' ? 0.55 : 0.75,
    metalness: entry.gameplayKind === 'streetlamp' ? 0.4 : 0.05,
    groundContrast: 'silhouette and value contrast',
    footprint: entry.footprint,
    height: entry.height,
    triangleBudget: 250,
    nonColorDistinction: `${entry.silhouette} profile cue`,
    tint: entry.tint,
    flavor: entry.flavor,
    introducedAt: 1,
    returnDistricts: Object.freeze([]),
  });
}

// Reference-led city assets are stable visual identities layered onto the
// existing economy tiers. Their physical metre dimensions are intentionally
// separate from the gameplay radius; propkit owns that render/economy seam.
const sharedCityEntries = CITY_OBJECTS.filter((entry) => entry.scope === 'shared');
for (const entry of CITY_OBJECTS) {
  const cityDistrict = entry.cityId === 'chicago'
    ? 1
    : 10 - (sharedCityEntries.indexOf(entry) % 9);
  allArchetypes[entry.id] = Object.freeze({
    id: entry.id,
    gameplayKind: entry.gameplayKind,
    family: entry.name.replace(/[^a-z0-9]+/g, '_'),
    recipe: 'city-object',
    recipeIndex: entry.referenceIndex,
    materialRole: `${entry.scope}_${entry.sheet}`,
    collectionKey: entry.id,
    silhouette: entry.name,
    environmentalFunction: `${entry.name} ${entry.sheet} asset`,
    silhouetteShapes: [entry.profile, 'metric city object', entry.scope],
    baseMaterial: entry.profile === 'person' ? 'cloth and skin' : 'painted urban materials',
    roughness: entry.profile === 'vehicle' || entry.profile === 'largeVehicle' ? 0.48 : 0.72,
    metalness: ['vehicle', 'largeVehicle', 'rail', 'pole'].includes(entry.profile) ? 0.24 : 0.06,
    groundContrast: 'physical silhouette and city placement',
    footprint: Math.max(entry.widthM, entry.depthM),
    height: entry.heightM,
    triangleBudget: ['tower', 'landmark', 'midrise'].includes(entry.profile) ? 1500 : 700,
    nonColorDistinction: `${entry.name} metric profile`,
    cityObject: entry,
    introducedAt: cityDistrict,
    returnDistricts: Object.freeze([cityDistrict]),
  });
}

export const VISUAL_ARCHETYPES = Object.freeze(allArchetypes);
export const DISTRICT_CATALOGS = Object.freeze(allCatalogs);

// Area 1 is the Chicago pilot. Both `chicago-loop-*` reference sheets belong
// exclusively to Level 1, so their 48 objects appear there together. The 186
// shared urban objects are divided across Levels 2-10 (21 max per level).
// Other areas retain their existing catalogs until researched city rosters
// are authored.
const chicagoSpecific = CITY_OBJECTS.filter((entry) => entry.cityId === 'chicago');
const sharedUrban = CITY_OBJECTS.filter((entry) => entry.scope === 'shared');
const CHICAGO_AREA_CATALOGS = Object.freeze(Object.fromEntries(Array.from({ length: 10 }, (_, offset) => {
  const district = offset + 1;
  const slice = district === 1
    ? chicagoSpecific
    // Round-robin the shared sheets so every neighborhood gets a balanced
    // mix of buildings, vehicles, civic modules, people, and street detail;
    // sequential slicing would make the final level almost entirely shops.
    : sharedUrban.filter((entry, index) => index % 9 === 10 - district);
  const base = allCatalogs['harbor-metropolis'][district];
  const mixes = Object.freeze(Object.fromEntries(GAMEPLAY_KINDS.map((kind) => [
    kind,
    Object.freeze([...base.mixes[kind].slice(0, 1), ...slice.filter((entry) => entry.gameplayKind === kind).map((entry) => entry.id)]),
  ])));
  return [district, Object.freeze({ mixes, introduces: Object.freeze(district === 1 ? [] : slice.map((entry) => entry.id)) })];
})));

export function fallbackVisualId(kind) {
  return GAMEPLAY_KINDS.includes(kind) ? `fallback_${kind.replace(/-/g, '_')}` : 'fallback_unknown';
}

export function resolveVisualArchetype(visualId, kind) {
  const found = typeof visualId === 'string' ? VISUAL_ARCHETYPES[visualId] : null;
  if (found && (!kind || found.gameplayKind === kind)) return found;
  // Street-prop kinds fall back to their kind's baseline shared archetype
  // (always a registered id), never to a synthetic fallback_* id.
  if (STREET_PROP_KINDS.includes(kind)) {
    const baseline = STREET_PROP_CATALOG.find((a) => a.gameplayKind === kind);
    if (baseline) return VISUAL_ARCHETYPES[baseline.id];
  }
  const safeKind = GAMEPLAY_KINDS.includes(kind) ? kind : 'trash';
  return Object.freeze({
    id: fallbackVisualId(safeKind),
    gameplayKind: safeKind,
    family: 'legacy_fallback',
    recipe: 'base',
    recipeIndex: 0,
    materialRole: 'fallback',
    collectionKey: fallbackVisualId(safeKind),
    silhouette: `fallback ${safeKind}`,
  });
}

export function districtCatalog(metroId, district) {
  if (metroId === 'harbor-metropolis' && CHICAGO_AREA_CATALOGS[Number(district)]) {
    return CHICAGO_AREA_CATALOGS[Number(district)];
  }
  const metro = DISTRICT_CATALOGS[metroId];
  return metro && metro[district] ? metro[district] : null;
}

export function validateArchetypeCatalogs() {
  const errors = [];
  const idPattern = /^[a-z0-9_]+$/;
  for (const [id, descriptor] of Object.entries(VISUAL_ARCHETYPES)) {
    if (!idPattern.test(id) || descriptor.id !== id) errors.push(`invalid visual id: ${id}`);
    if (!GAMEPLAY_KINDS.includes(descriptor.gameplayKind) && !STREET_PROP_KINDS.includes(descriptor.gameplayKind)) {
      errors.push(`invalid gameplay kind: ${id}`);
    }
    if (descriptor.collectionKey !== id) errors.push(`unstable collection key: ${id}`);
    if (!(descriptor.footprint > 0) || !(descriptor.height > 0)) errors.push(`invalid dimensions: ${id}`);
    if (!(descriptor.introducedAt >= 1 && descriptor.introducedAt <= 10)) errors.push(`invalid introduction: ${id}`);
  }
  for (const [metroId, districts] of Object.entries(DISTRICT_CATALOGS)) {
    const metroIds = Object.keys(VISUAL_ARCHETYPES).filter((id) => id.startsWith(`${slug(metroId)}_`));
    if (metroIds.length !== 30) errors.push(`${metroId}: expected 30 archetypes, got ${metroIds.length}`);
    for (let district = 1; district <= 10; district += 1) {
      const catalog = districts[district];
      if (!catalog) {
        errors.push(`${metroId}:${district}: missing catalog`);
        continue;
      }
      for (const kind of GAMEPLAY_KINDS) {
        const mix = catalog.mixes[kind];
        if (!Array.isArray(mix) || mix.length === 0) errors.push(`${metroId}:${district}:${kind}: empty mix`);
        for (const id of mix || []) {
          if (!VISUAL_ARCHETYPES[id] || VISUAL_ARCHETYPES[id].gameplayKind !== kind) {
            errors.push(`${metroId}:${district}:${kind}: invalid ${id}`);
          }
        }
      }
    }
  }
  return errors;
}
