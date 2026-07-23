// Per-level content generator for the 100-level rewrite. Combines the pure
// formulas in ./formulas.js with the metro roster in ./metros.js into a single
// plain-object level descriptor consumed by gameplay/content code.
import {
  chapterOf, levelInChapterOf, target, timeSeconds, worldSize, tierOf,
  rivalCount, hazardDensity, capstoneGate, itemValueMultiplier, LEVEL_COUNT,
} from './formulas.js';
import { METROS } from './metros.js';

// ---------------------------------------------------------------------------
// TEMPLATE: the base (level-1-equivalent) object taxonomy, BEFORE the level's
// itemValueMultiplier(n) is applied. 7 tiers, escalating baseRadius/baseMass,
// shrinking baseCount. `kind` is the CONTRACT src/content/propkit.js (a parallel
// module) reads to pick which prop mesh to spawn for that tier — keep these
// 7 strings stable:
//   'trash'            — tier 0, smallest, most numerous street litter
//   'bike'              — tier 1, bicycles/scooters
//   'car'               — tier 2, parked/street cars
//   'bus'               — tier 3, buses/vans
//   'building-small'    — tier 4, kiosks/small storefronts
//   'building-medium'   — tier 5, mid-rise buildings
//   'building-large'    — tier 6, the largest tier; also the designated
//                          capstone-candidate tier (isCapstoneCandidate: true).
//                          Gameplay code substitutes the level's actual landmark
//                          model as the real capstone object (gated by
//                          capstoneGate(n) against avatar size), worth a large
//                          bonus — this tier entry exists so the same taxonomy
//                          slot/tuning numbers apply to it before that swap.
//
// Invariant (verified below, see LEVEL_TEMPLATE_MASS_SUM): the total base mass
// available per level — sum(baseMass * baseCount) across all 7 tiers — must
// stay comfortably above target(1) = 1000 once scaled by itemValueMultiplier(n),
// mirroring how the current shipped game always spawns somewhat more total mass
// than a level's target requires. Because itemValueMultiplier(n) = n*n and
// target(n) = 1000*n*n, that ratio is constant across every level: with the
// concrete numbers below, sum(baseMass*baseCount) = 1427, i.e. ~42.7% of
// headroom above target(1)/itemValueMultiplier(1) = 1000 at every n from 1..100.
const LEVEL_TEMPLATE = [
  { tierIndex: 0, baseRadius: 16, baseMass: 3, baseCount: 42, kind: 'trash' },
  { tierIndex: 1, baseRadius: 20, baseMass: 5, baseCount: 30, kind: 'bike' },
  { tierIndex: 2, baseRadius: 27, baseMass: 9, baseCount: 20, kind: 'car' },
  { tierIndex: 3, baseRadius: 36, baseMass: 16, baseCount: 14, kind: 'bus' },
  { tierIndex: 4, baseRadius: 48, baseMass: 28, baseCount: 9, kind: 'building-small' },
  { tierIndex: 5, baseRadius: 66, baseMass: 48, baseCount: 5, kind: 'building-medium' },
  { tierIndex: 6, baseRadius: 90, baseMass: 85, baseCount: 3, kind: 'building-large', isCapstoneCandidate: true },
];

// Sanity-computed sum(baseMass * baseCount), exported for tests/introspection.
export const LEVEL_TEMPLATE_MASS_SUM = LEVEL_TEMPLATE.reduce((sum, t) => sum + t.baseMass * t.baseCount, 0);

function cloneTemplate() {
  return LEVEL_TEMPLATE.map((t) => ({ ...t }));
}

export function generateLevel(n) {
  const chapter = chapterOf(n);
  const levelInChapter = levelInChapterOf(n);
  const metro = METROS[chapter - 1];
  return {
    n,
    chapter,
    levelInChapter,
    metro,
    districtName: metro.districts[levelInChapter - 1],
    target: target(n),
    time: timeSeconds(n),
    world: worldSize(n),
    tier: tierOf(n),
    rivalCount: rivalCount(n),
    hazardDensity: hazardDensity(n),
    capstoneGate: capstoneGate(n),
    itemValueMultiplier: itemValueMultiplier(n),
    template: cloneTemplate(),
  };
}

export function generateAllLevels() {
  return Array.from({ length: LEVEL_COUNT }, (_, i) => generateLevel(i + 1));
}

export { LEVEL_COUNT };
