// Blender prop pack runtime loader (art-direction.md §1, "Blender prop pack").
// The .glb files in assets/models/ are authored offline by
// scripts/blender/build_props.py and converted to plain JS data modules by
// scripts/glb-to-js.js (NO glTF loader at runtime — B1). This module decodes
// those base64 payloads into THREE.BufferGeometry, ready to slot into
// propkit's merged-geometry instancing path.
//
// Base-pack (byKind) modules are all-or-nothing: any missing/failed one makes
// loadModelKit return null and propkit silently bakes the procedural props
// instead (same contract as textures.js). byVisualId-only modules degrade
// individually (see loadModelKit). No DOM/window at module top level; THREE
// is passed in.
//
// Vertex-color contract (matches propkit's merged bakes):
//   - `colors` are LINEAR floats; greyscale entries (r == g == b) are
//     TINTABLE — propkit multiplies them by the archetype tint (tree canopy,
//     person shirt, lamp pole) or leaves them white for palette-base kinds
//     (the car body, whose hue comes from instance colors).
//   - Non-greyscale entries are FIXED (trunk, skin, lamp head, car glass).

// Mapping table: which prop-kit visual gets which Blender model. Pure data —
// propkit reads this defensively. Visual-id entries win over kind entries so
// the three tree flavors can map to three different models while the five
// person tints share one (their identity comes from the tint substitution).
export const PROP_MODELS = Object.freeze({
  byVisualId: Object.freeze({
    street_tree_blob: 'tree_blob',
    street_tree_cone: 'tree_cone',
    street_tree_lollipop: 'tree_lollipop',
    // Chicago per-archetype building variety (Level 1 icons + the shared
    // urban roster). Each archetype id maps to the most thematically fitting
    // Blender archetype model; ids not listed here fall through to the
    // kind-level model in byKind (or the procedural bake when the kit is
    // absent). Cross-tier assignments are deliberate where the archetype's
    // real-world read beats its economy tier (e.g. the warehouse is a
    // building-medium prop wearing the small-tier warehouse model) —
    // bakeModelPart normalizes the model onto the gameplay envelope.
    // Chicago icons:
    cityobj_chicago_willis_tower: 'building_large_setback',
    cityobj_chicago_cna_center_big_red: 'building_large_slab',
    cityobj_chicago_marina_city_tower_pair: 'building_large_slab',
    cityobj_chicago_tribune_tower: 'building_large_cornice',
    cityobj_chicago_chicago_board_of_trade_building: 'building_medium_deco',
    cityobj_chicago_art_deco_office_mid_rise: 'building_medium_deco',
    cityobj_chicago_chicago_theatre: 'building_medium_deco',
    cityobj_chicago_wrigley_building: 'building_medium_deco',
    cityobj_chicago_rookery_building: 'building_medium_loft',
    cityobj_chicago_monadnock_building: 'building_medium_loft',
    cityobj_chicago_harold_washington_library_center: 'building_medium_loft',
    cityobj_chicago_merchandise_mart: 'building_medium_office',
    cityobj_chicago_chicago_parking_garage: 'building_medium_office',
    cityobj_chicago_palmer_house: 'building_medium_hotel',
    cityobj_chicago_historic_loop_corner_storefront_row: 'building_small_storefront',
    // Shared urban roster (Levels 2-10):
    cityobj_shared_corner_shop: 'building_small_storefront',
    cityobj_shared_row_retail_building: 'building_medium_loft',
    cityobj_shared_low_rise_apartment: 'building_medium_loft',
    cityobj_shared_mid_rise_apartment: 'building_medium_hotel',
    cityobj_shared_brick_office_block: 'building_medium_office',
    cityobj_shared_mixed_use_building: 'building_medium_office',
    cityobj_shared_hotel: 'building_medium_hotel',
    cityobj_shared_warehouse_service_building: 'building_small_warehouse',
    cityobj_shared_fire_station: 'building_small_warehouse',
    cityobj_shared_police_station: 'building_medium_office',
    cityobj_shared_hospital_clinic: 'building_medium_office',
    cityobj_shared_parking_garage: 'building_medium_office',
    cityobj_shared_modern_glass_office_tower: 'building_large_curtain',
    cityobj_shared_tall_purple_skyscraper: 'building_large_cornice',
    cityobj_shared_teal_skyscraper: 'building_large_curtain',
    cityobj_shared_townhouse_row: 'building_small_rowhouse',
  }),
  byKind: Object.freeze({
    person: 'person',
    streetlamp: 'streetlamp',
    car: 'car',
    // Authored building tiers (0003 §4.3): the procedural bake is a box with
    // thin window-band boxes and no street-level read at all, which is most of
    // why the skyline looked like grey slabs next to the reference. These carry
    // shopfronts, awnings, punched/ribbon windows, parapets and roof plant, and
    // each tier is given a deliberately different read — small = wide and
    // horizontal, medium = banded mid-rise, large = vertical curtain-wall
    // tower — so the size ladder still parses at a glance.
    'building-small': 'building_small',
    'building-medium': 'building_medium',
    'building-large': 'building_large',
  }),
});

// Every model file the kit can use. The byKind (base pack) files are
// all-or-nothing — a partial base kit would render mixed Blender/procedural
// versions of one kind. byVisualId-only files are optional extras: a missing
// one drops just that model's mapping (propkit falls back to the kind-level
// model or the procedural bake), so new archetype models can ship
// incrementally.
export const MODEL_FILE_NAMES = Object.freeze(Object.keys(PROP_MODELS.byVisualId).map(
  (id) => PROP_MODELS.byVisualId[id],
).concat(Object.values(PROP_MODELS.byKind)).filter((v, i, a) => a.indexOf(v) === i));

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeGeometry(THREE, data) {
  const positions = new Float32Array(base64ToBytes(data.positions).buffer);
  const normals = new Float32Array(base64ToBytes(data.normals).buffer);
  const colors = new Float32Array(base64ToBytes(data.colors).buffer);
  const indexBytes = base64ToBytes(data.indices);
  const indices = data.indexType === 32
    ? new Uint32Array(indexBytes.buffer)
    : new Uint16Array(indexBytes.buffer);
  if (!positions.length || positions.length !== normals.length || positions.length !== colors.length) {
    throw new Error('model attribute length mismatch');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * Loads the Blender prop pack. Never throws.
 * Base-pack (byKind) files are all-or-nothing: if any is missing/fails to
 * decode the whole kit returns null (procedural fallback everywhere).
 * byVisualId-only files degrade individually: a missing/failed one is simply
 * absent from the returned kit and propkit falls back for that visual id.
 * @param {object} THREE - the shared three namespace (from main.js).
 * @returns {Promise<Object<string, THREE.BufferGeometry>|null>} model name ->
 *   geometry, or null when any BASE model file is missing/fails to decode.
 */
export async function loadModelKit(THREE) {
  if (typeof atob === 'undefined') return null;
  const loadOne = async (name) => {
    let mod;
    try {
      mod = await import(`../../assets/models/${name}.js`);
    } catch (e) {
      return null; // file missing or unparsable
    }
    try {
      return decodeGeometry(THREE, mod.default);
    } catch (e) {
      return null;
    }
  };
  const kit = {};
  const baseNames = [...new Set(Object.values(PROP_MODELS.byKind))];
  for (const name of baseNames) {
    const geometry = await loadOne(name);
    if (!geometry) return null; // base pack stays all-or-nothing
    kit[name] = geometry;
  }
  const extraNames = [...new Set(Object.values(PROP_MODELS.byVisualId))]
    .filter((name) => !baseNames.includes(name));
  for (const name of extraNames) {
    const geometry = await loadOne(name);
    if (geometry) kit[name] = geometry; // else: this one mapping drops out
  }
  return kit;
}
