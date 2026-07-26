// Skyline-opedia: the collection album tracking every city object/landmark
// ever swallowed, plus the flavor-text database — the direct descendant of
// the original shipped game's `QUIPS` dictionary (see index.html, pre-rewrite),
// reframed from CRM-record emoji to city nouns per docs/city-3d-redesign-plan.md
// ("the comedy voice ... move into the environment as billboards, ad panels,
// ... this is exactly the ask"). No browser-only APIs — pure data + functions.

// Object-kind keys match src/data/levels.js LEVEL_TEMPLATE's `kind` values
// exactly ('trash', 'bike', 'car', 'bus', 'building-small', 'building-medium',
// 'building-large'), plus 'billboard' for the environmental ad-panel flavor
// objects called out in the redesign plan, plus the level-1 authored-city
// kinds from src/content/citylayout.js ('tree', 'streetlight', 'bench',
// 'mailbox', 'hydrant', 'speed-bump', 'apartment', 'office'), plus one key
// per METROS[].landmarkType (src/data/metros.js) for the level-capstone
// landmark eats.
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
  // Level-1 authored-city kinds (src/content/citylayout.js).
  tree: [
    'Deforestation, one gulp at a time.',
    'That tree had roots. Had.',
    'Shade: discontinued.',
  ],
  streetlight: [
    'The city that never sleeps just got darker.',
    'Light pole? Light snack.',
    'Watt went that? Gone.',
  ],
  bench: [
    'Take a seat. On second thought, take the whole bench.',
    'Park bench: permanently reserved. By the void.',
    'No more sitting. Only swallowing.',
  ],
  mailbox: [
    'Return to sender: the flywheel.',
    "You've got mail. Had mail. It's inside a flywheel now.",
    'Last pickup: final.',
  ],
  hydrant: [
    'Water pressure: released. Briefly.',
    'The fire department has questions.',
    'Hydrant? More like hi-gone.',
  ],
  'speed-bump': [
    'Speed bump: consumed at full speed.',
    'Slow down? No. Swallow faster.',
    'The bump has been flattened. By eating it.',
  ],
  apartment: [
    'Eviction notice: served to an entire building.',
    'Rent-controlled. Now flywheel-controlled.',
    'Every tenant got the same moving notice: gone.',
  ],
  office: [
    'The whole company got acquired. By a flywheel.',
    'Corner office? Consumed first.',
    'Open floor plan, meet open flywheel.',
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
