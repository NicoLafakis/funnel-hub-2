// Blender prop pack runtime loader (art-direction.md §1, "Blender prop pack").
// The .glb files in assets/models/ are authored offline by
// scripts/blender/build_props.py and converted to plain JS data modules by
// scripts/glb-to-js.js (NO glTF loader at runtime — B1). This module decodes
// those base64 payloads into THREE.BufferGeometry, ready to slot into
// propkit's merged-geometry instancing path.
//
// Everything is optional: any missing/failed module makes loadModelKit return
// null and propkit silently bakes the procedural props instead (same contract
// as textures.js). No DOM/window at module top level; THREE is passed in.
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
  }),
  byKind: Object.freeze({
    person: 'person',
    streetlamp: 'streetlamp',
    car: 'car',
  }),
});

// Every model file the kit needs. If ANY is missing the whole kit drops out —
// a partial kit would render mixed Blender/procedural versions of one kind.
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
 * @param {object} THREE - the shared three namespace (from main.js).
 * @returns {Promise<Object<string, THREE.BufferGeometry>|null>} model name ->
 *   geometry, or null when any model file is missing/fails to decode.
 */
export async function loadModelKit(THREE) {
  if (typeof atob === 'undefined') return null;
  const kit = {};
  for (const name of MODEL_FILE_NAMES) {
    let mod;
    try {
      mod = await import(`../../assets/models/${name}.js`);
    } catch (e) {
      return null; // file missing or unparsable — procedural fallback
    }
    try {
      kit[name] = decodeGeometry(THREE, mod.default);
    } catch (e) {
      return null;
    }
  }
  return kit;
}
