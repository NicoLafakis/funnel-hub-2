// Art-manifest resolution: pure lookup/fallback logic for the generated
// per-metro art contract (assets/art-manifest.json, produced by
// scripts/build-art-manifest.js). The manifest only ever lists VERIFIED
// on-disk PNGs — that invariant is what makes the fallback rule here safe:
// any metro/slot/icon absent from the manifest resolves to the generic
// texture path (or null for icons), reproducing pre-manifest behavior
// exactly.
//
// This module is deliberately pure data-plumbing — no THREE, no fetch, no
// browser API anywhere — so the headless test suite can pin the resolution
// and fallback rules directly (scripts/logic-test.js). main.js owns actually
// FETCHING the manifest and turning the returned paths into cached THREE
// textures.

// The manifest's per-metro texture slot names — a contract with
// scripts/build-art-manifest.js, pinned by a test.
export const TEXTURE_SLOTS = [
  'street',
  'sidewalk',
  'facade-apartment',
  'facade-office',
  'facade-storefront',
];

// Icon categories the manifest may carry — ids inside each category match
// (respectively) UPGRADE_TRACKS keys, ACH keys, and CITY_QUIPS keys.
export const ICON_CATEGORIES = ['upgrades', 'achievements', 'collection'];

// Raw slot lookup: the metro's manifest path for `slot`, or null when the
// manifest/metro/slot is absent or malformed. Never throws on any input.
export function metroArtPath(manifest, metroId, slot) {
  if (!manifest || typeof manifest !== 'object') return null;
  const metros = manifest.metros;
  if (!metros || typeof metros !== 'object') return null;
  const entry = metros[metroId];
  if (!entry || typeof entry !== 'object') return null;
  const p = entry[slot];
  return typeof p === 'string' && p.length > 0 ? p : null;
}

// Maps the manifest's texture slots onto the game's texture ROLES, with
// per-slot fallback to the caller's generic paths:
//
//   street            -> groundPlane (the world ground / asphalt role)
//   sidewalk          -> sidewalk    (level-1 block pads)
//   facade-apartment  -> apartment   (propkit facade registry)
//   facade-office     -> office
//   facade-storefront -> storefront
//   (no slot)         -> concrete    (always the generic file — the manifest
//                                     has no per-metro concrete slot)
//
// Every role resolves to { path, metro } where `metro` says whether the path
// came from the manifest (true) or is the generic fallback (false) — the
// caller uses that flag to apply metro-art-specific mapping rules (facades
// are designed cornice-to-cornice panels and want ONE vertical repeat per
// building face, which the generic tileables do not).
export function resolveMetroTextureSet(manifest, metroId, generics) {
  const g = generics || {};
  const pick = (slot, fallbackPath) => {
    const p = metroArtPath(manifest, metroId, slot);
    return p
      ? { path: p, metro: true }
      : { path: fallbackPath || null, metro: false };
  };
  return {
    apartment: pick('facade-apartment', g.apartment),
    office: pick('facade-office', g.office),
    storefront: pick('facade-storefront', g.storefront),
    concrete: { path: g.concrete || null, metro: false },
    groundPlane: pick('street', g.groundPlane),
    sidewalk: pick('sidewalk', g.sidewalk),
  };
}

// Icon path for `id` in `category` ('upgrades' | 'achievements' |
// 'collection'), or null when absent — callers render exactly their current
// non-icon UI on null, so a missing icon can never produce a broken-image
// glyph.
export function iconPath(manifest, category, id) {
  if (!manifest || typeof manifest !== 'object') return null;
  const icons = manifest.icons;
  if (!icons || typeof icons !== 'object') return null;
  const cat = icons[category];
  if (!cat || typeof cat !== 'object') return null;
  const p = cat[id];
  return typeof p === 'string' && p.length > 0 ? p : null;
}
