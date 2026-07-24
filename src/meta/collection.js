// Skyline-opedia: the collection album tracking every city object/landmark
// ever swallowed, plus the flavor-text database — the direct descendant of
// the original shipped game's `QUIPS` dictionary (see index.html, pre-rewrite),
// reframed from CRM-record emoji to city nouns per docs/city-3d-redesign-plan.md
// ("the comedy voice ... move into the environment as billboards, ad panels,
// ... this is exactly the ask"). No browser-only APIs — pure data + functions.

// Object-kind keys match src/data/levels.js LEVEL_TEMPLATE's `kind` values
// exactly ('trash', 'bike', 'car', 'bus', 'building-small', 'building-medium',
// 'building-large'), plus 'billboard' for the environmental ad-panel flavor
// objects called out in the redesign plan, plus one key per METROS[].landmarkType
// (src/data/metros.js) for the level-capstone landmark eats.
export const CITY_QUIPS = {
  trash: [
    'Cleanup job: complete.',
    'Curb service: DE-GONE.',
    'City hygiene: immaculate.',
  ],
  bike: [
    'Two wheels. Zero future.',
    'Bike lane? Bike GONE.',
    'Kickstand deployed. Then swallowed.',
  ],
  car: [
    'Parallel parked. Into the void.',
    'Check engine light: extinguished. Along with the engine.',
    'Trade-in value: negative infinity.',
  ],
  bus: [
    'Next stop: nowhere.',
    'Route canceled. Passengers transferred to the abyss.',
    'Bus fare: your entire vehicle.',
  ],
  billboard: [
    'CTA: Consume The All.',
    'Breeze AI billboard: fully absorbed. Ironic, given the AI never saw it coming.',
    'Impressions: one. Then it became one with the flywheel.',
  ],
  'building-small': [
    'Storefront acquired. By Flywheel, Inc.',
    'Kiosk relocated. To the void.',
    "Open sign flipped to 'gone'.",
  ],
  'building-medium': [
    'Mid-rise. Now no-rise.',
    'HQ relocated. Definitely not upward.',
    'Leasing office: fully leased to the abyss.',
  ],
  'building-large': [
    'Skyline swallowed. Rent stabilized.',
    'Portal instance: ported to the flywheel.',
    'The building filed for bankruptcy. Then filed itself into the flywheel.',
  ],
  // One flavor quip set per METROS[].landmarkType (src/data/metros.js) — the
  // level-capstone landmark eat for each of the 10 metros/chapters.
  'liberty-statue': [
    'Give me your tired, your poor, your huddled masses... yearning to be eaten.',
    "Lady Liberty's torch: extinguished. Politely.",
    'Land of the free. Home of the flywheel.',
  ],
  'lattice-tower': [
    'Iron lattice. Zero resistance.',
    'Ooh la la-GONE.',
    'Panoramic view: briefly. Then just dark.',
  ],
  'clock-tower': [
    'Big Bell, bigger flywheel.',
    "Time's up. Literally.",
    'God Save the Flywheel.',
  ],
  'sky-tower': [
    'Neon signage: unplugged mid-blink.',
    'Konnichi-WAS.',
    'Vending machine included. Somehow still vending. Into the void.',
  ],
  'mega-spire': [
    "World's tallest. World's gone-est.",
    'Sky bridge: bridge to nowhere.',
    'Gold-plated. Flywheel-plated now.',
  ],
  amphitheater: [
    'Thumbs down. Way down.',
    'Gladiators eaten. Spectators, too.',
    'The crowd went silent. Permanently.',
  ],
  'mountain-statue': [
    'Arms wide open. Not wide enough.',
    'Panoramic mountain view: absorbed with the mountain.',
    'Samba stopped. Mid-beat.',
  ],
  'onion-palace': [
    'Onion domes. Now just a flywheel where onions used to be.',
    'Red Square: now just Square. Also gone.',
    'Kremlin walls: consumed, brick by brick.',
  ],
  'sail-opera': [
    'Curtain call. Final call.',
    'Sails furled. Into the abyss.',
    'Standing ovation. For the flywheel.',
  ],
  'portal-tower': [
    'Breeze AI campus: fully synced. Into the void.',
    'HubSpot Tower: closed-won. By a flywheel.',
    'The whole platform. Eaten. As threatened.',
  ],
};

// Fallback quip used for an objectKey with no entry in CITY_QUIPS, so callers
// never have to null-check before displaying flavor text.
const FALLBACK_QUIPS = ['Logged. And gone.'];

// Returns a random flavor-text line for objectKey (or the fallback line if
// objectKey has no entry).
export function getFlavorText(objectKey) {
  const lines = CITY_QUIPS[objectKey] || FALLBACK_QUIPS;
  return lines[Math.floor(Math.random() * lines.length)];
}

// Distinct-entry threshold for the "Hoarder" achievement, per
// docs/redesign.md ("Hoarder (50 album entries)").
export const HOARDER_THRESHOLD = 50;

// Records a sighting of `objectKey` in `collectionState` (the save shape's
// `collection` object from save.js): increments its count, and marks
// first-seen with a timestamp the first time only.
//
// `collectionState` is mutated in place when it's already a valid plain
// object; if it wasn't (missing/corrupt), a fresh object is created instead.
// ALWAYS use the returned `.collection` to persist — do not assume the
// object you passed in was the one actually written to, since an invalid
// input is replaced rather than mutated.
//
// Returns { collection, isNew, count } where:
//   collection — the updated collection object (see above)
//   isNew      — true if this was objectKey's first-ever recorded sighting
//   count      — objectKey's total sighting count after this call
export function recordSighting(collectionState, objectKey) {
  const state = collectionState && typeof collectionState === 'object' && !Array.isArray(collectionState)
    ? collectionState
    : {};
  const existing = state[objectKey];
  const isNew = !existing || typeof existing !== 'object';
  const count = (isNew || typeof existing.count !== 'number' ? 0 : existing.count) + 1;
  const firstSeenAt = !isNew && typeof existing.firstSeenAt === 'number' ? existing.firstSeenAt : Date.now();

  state[objectKey] = { count, firstSeenAt };

  return { collection: state, isNew, count };
}

// True once collectionState has HOARDER_THRESHOLD (50) or more distinct
// entries — matches the achievements module's "Hoarder" check
// (docs/redesign.md: "Hoarder (50 album entries)").
export function checkHoarderMilestone(collectionState) {
  if (!collectionState || typeof collectionState !== 'object' || Array.isArray(collectionState)) return false;
  return Object.keys(collectionState).length >= HOARDER_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Skyline-opedia 2.0 (content-and-meta.md §3): entries unlock per metro prop
// VARIANT (each metro reskins 2-3 props — baguettes on bikes in Le Vieux,
// black cabs in Old Fog Town, neon tuk-tuks in Neon District). Completing a
// metro's page pays a coin bounty and awards a gallery card. The classic
// kind-based album above (and its joke entries) is untouched — variants are a
// parallel book, stored in the save's `collectionVariants` object.
// ---------------------------------------------------------------------------

export const METRO_PAGE_BOUNTY = 500;

// Storage key for a variant entry: 'metroId:variantKey' (e.g.
// 'old-fog-town:car:black-cab'). One string namespace, same {count,
// firstSeenAt} entry shape as the classic album.
export function variantEntryKey(metroId, variantKey) {
  return `${metroId}:${variantKey}`;
}

// Defensively resolves a metro's prop-variant list from the prop kit module.
// The variant data lands with a parallel workstream; we accept EITHER a
// `variants` or a `metroVariants` export, keyed by metro id (or, as a fallback,
// by metro array index), with each entry an array of variant keys/strings or
// {key, name} objects. Anything else -> [] (no variants, no crash).
export function resolveMetroVariants(propkitModule, metroIdOrIndex) {
  if (!propkitModule || typeof propkitModule !== 'object') return [];
  const table = propkitModule.variants || propkitModule.metroVariants;
  if (!table || typeof table !== 'object') return [];
  const raw = table[metroIdOrIndex];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => {
      if (typeof v === 'string') return { key: v, name: v };
      if (v && typeof v === 'object' && typeof v.key === 'string') {
        return { key: v.key, name: typeof v.name === 'string' ? v.name : v.key };
      }
      return null;
    })
    .filter(Boolean);
}

// Records a sighting of one metro prop variant in `variantsState` (the save's
// `collectionVariants` object). Same in-place-mutation contract as
// recordSighting: ALWAYS persist the returned `.collectionVariants` — an
// invalid input is replaced, not mutated. Returns
// { collectionVariants, isNew, count, entryKey }.
export function recordVariantSighting(variantsState, metroId, variantKey) {
  const state = variantsState && typeof variantsState === 'object' && !Array.isArray(variantsState)
    ? variantsState
    : {};
  const entryKey = variantEntryKey(metroId, variantKey);
  const existing = state[entryKey];
  const isNew = !existing || typeof existing !== 'object';
  const count = (isNew || typeof existing.count !== 'number' ? 0 : existing.count) + 1;
  const firstSeenAt = !isNew && typeof existing.firstSeenAt === 'number' ? existing.firstSeenAt : Date.now();

  state[entryKey] = { count, firstSeenAt };

  return { collectionVariants: state, isNew, count, entryKey };
}

// Progress on one metro's opedia page: how many of its expected variants have
// been sighted at least once. `expectedVariants` is the array from
// resolveMetroVariants (strings or {key} objects both tolerated).
export function metroPageProgress(variantsState, metroId, expectedVariants) {
  const state = variantsState && typeof variantsState === 'object' && !Array.isArray(variantsState) ? variantsState : {};
  const expected = Array.isArray(expectedVariants) ? expectedVariants : [];
  const keys = expected
    .map((v) => (typeof v === 'string' ? v : (v && typeof v.key === 'string' ? v.key : null)))
    .filter(Boolean);
  let unlocked = 0;
  for (const key of keys) {
    const entry = state[variantEntryKey(metroId, key)];
    if (entry && typeof entry === 'object' && typeof entry.count === 'number' && entry.count > 0) unlocked += 1;
  }
  return {
    metroId,
    unlocked,
    total: keys.length,
    complete: keys.length > 0 && unlocked >= keys.length,
  };
}

// Claims the completion reward for a metro's opedia page: coin bounty + a
// gallery card. Mutates saveData on success only (coins += bounty,
// galleryCards gains the metro id). Returns { ok, reason?, bounty?, card? }
// with reason 'incomplete-page' | 'already-claimed'.
export function claimMetroPageReward(saveData, metroId, expectedVariants) {
  if (!saveData || typeof saveData !== 'object') return { ok: false, reason: 'incomplete-page' };
  const progress = metroPageProgress(saveData.collectionVariants, metroId, expectedVariants);
  if (!progress.complete) return { ok: false, reason: 'incomplete-page' };
  if (!Array.isArray(saveData.galleryCards)) saveData.galleryCards = [];
  if (saveData.galleryCards.includes(metroId)) return { ok: false, reason: 'already-claimed' };
  saveData.galleryCards.push(metroId);
  saveData.coins = (typeof saveData.coins === 'number' ? saveData.coins : 0) + METRO_PAGE_BOUNTY;
  saveData.lifetimeCoins = (typeof saveData.lifetimeCoins === 'number' ? saveData.lifetimeCoins : 0) + METRO_PAGE_BOUNTY;
  return { ok: true, bounty: METRO_PAGE_BOUNTY, card: metroId };
}

// Plain view model for an opedia UI: per metro, its page progress plus the
// full variant list with unlocked flags. `metros` is the METROS array;
// `propkitModule` is probed defensively via resolveMetroVariants. Rendering is
// intentionally left to whoever owns the album screen.
export function collectionViewModel(saveData, metros, propkitModule) {
  const state = saveData && saveData.collectionVariants;
  const cards = saveData && Array.isArray(saveData.galleryCards) ? saveData.galleryCards : [];
  const list = Array.isArray(metros) ? metros : [];
  return list.map((metro, metroIndex) => {
    if (!metro || !metro.id) return null;
    const variants = resolveMetroVariants(propkitModule, metro.id)
      .concat(resolveMetroVariants(propkitModule, metroIndex))
      .filter((v, i, arr) => arr.findIndex((o) => o.key === v.key) === i); // dedupe id/index lookups
    const progress = metroPageProgress(state, metro.id, variants);
    return {
      metroId: metro.id,
      metroName: metro.name || metro.id,
      unlocked: progress.unlocked,
      total: progress.total,
      complete: progress.complete,
      cardClaimed: cards.includes(metro.id),
      variants: variants.map((v) => {
        const entry = state && typeof state === 'object' ? state[variantEntryKey(metro.id, v.key)] : null;
        return {
          key: v.key,
          name: v.name,
          unlocked: !!(entry && typeof entry === 'object' && entry.count > 0),
          count: entry && typeof entry.count === 'number' ? entry.count : 0,
        };
      }),
    };
  }).filter(Boolean);
}
