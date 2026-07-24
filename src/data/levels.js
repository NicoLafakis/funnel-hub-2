// Per-level content generator for the 100-level V2 curve. Combines the pure
// formulas in ./formulas.js with the metro roster in ./metros.js into a single
// plain-object level descriptor consumed by gameplay/content code.
//
// V2 (content-and-meta.md §1): the unlock CADENCE is authored data
// (MECHANIC_UNLOCKS below) — something mechanical arrives every 3-5 levels —
// and each level exposes its ACTIVE mechanics as a flat `mechanics` object
// plus a one-line `introLine` on the level that introduces a mechanic (the
// district card shows exactly that one line, never a modal — §5).
import {
  chapterOf, levelInChapterOf, target, timeSeconds, worldSize, tierOf,
  rivalCount, rivalComposition, hazardDensity, capstoneGate, itemValueMultiplier,
  ordinaryMassFraction, progressionMassBudget, LEVEL_COUNT,
} from './formulas.js';
import { METROS } from './metros.js';
import { levelSeed } from './seeds.js';
import { TIER_RADII } from '../content/propkit.js';

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
// baseRadius values come from propkit.js's TIER_RADII — an exact 1.35x step
// per tier (art-direction.md §3, "keep it sacred"), asserted by the suite.
//
// Invariant (verified below, see LEVEL_TEMPLATE_MASS_SUM): the total base mass
// available per level — sum(baseMass * baseCount) across all 7 tiers — must
// stay comfortably above target(1) = 1000 once scaled by itemValueMultiplier(n).
// Because itemValueMultiplier(n) = n*n and target(n) = 1000*n*n, that ratio is
// constant across every level: with the concrete numbers below,
// sum(baseMass*baseCount) = 4281, i.e. ~4.3x target at every n from 1..100.
//
// Why 4.3x and not the ~1.4x a top-down game wants: the 3D chase camera sees
// only a small cone of the world at any moment (vs the old 2D top-down view
// that showed a whole neighborhood), so routing efficiency is far lower —
// winning must require eating ~25% of the content, not ~70%. The tripled
// counts also make the city actually read as a city instead of a parking lot.
// It also satisfies game-design.md §5 invariant 1: reachableBaseMass(n, 4281)
// >= 1.5x target at every level (see formulas.js's corridor model; the logic
// suite asserts this at n in {1, 25, 50, 75, 100}).
const LEVEL_TEMPLATE = [
  { tierIndex: 0, baseRadius: TIER_RADII[0], baseMass: 3, baseCount: 126, kind: 'trash' },
  { tierIndex: 1, baseRadius: TIER_RADII[1], baseMass: 5, baseCount: 90, kind: 'bike' },
  { tierIndex: 2, baseRadius: TIER_RADII[2], baseMass: 9, baseCount: 60, kind: 'car' },
  { tierIndex: 3, baseRadius: TIER_RADII[3], baseMass: 16, baseCount: 42, kind: 'bus' },
  { tierIndex: 4, baseRadius: TIER_RADII[4], baseMass: 28, baseCount: 27, kind: 'building-small' },
  { tierIndex: 5, baseRadius: TIER_RADII[5], baseMass: 48, baseCount: 15, kind: 'building-medium' },
  { tierIndex: 6, baseRadius: TIER_RADII[6], baseMass: 85, baseCount: 9, kind: 'building-large', isCapstoneCandidate: true },
];

// Sanity-computed sum(baseMass * baseCount), exported for tests/introspection.
export const LEVEL_TEMPLATE_MASS_SUM = LEVEL_TEMPLATE.reduce((sum, t) => sum + t.baseMass * t.baseCount, 0);

// ---------------------------------------------------------------------------
// The V2 unlock cadence (content-and-meta.md §1) as authored data. Each entry
// introduces exactly one mechanic at its level and carries the ONE intro line
// the district card may show for it (§5: one line, never a modal). The
// `mechanics` object on each generated level is derived from these ids.
export const MECHANIC_UNLOCKS = [
  { level: 1, id: 'goldens', line: 'Gold records glint. Eat one for 8× mass.' },
  { level: 6, id: 'rivals', line: 'It eats too. Out-grow it.' },
  { level: 11, id: 'storms', line: 'Storm incoming — cargo falls from the sky.' },
  { level: 16, id: 'duelist', line: 'The Duelist hunts bigger prey: you.' },
  { level: 21, id: 'traffic', line: 'Rush hour. The cars drive themselves now.' },
  { level: 26, id: 'mega-props', line: 'Oversized cargo has been sighted downtown.' },
  { level: 31, id: 'daily', line: 'Daily challenge unlocked — one city, one seed, every day.' },
  { level: 36, id: 'hazard-drops', line: 'Hazard cargo now drops mid-storm. Mind the crates.' },
  { level: 41, id: 'rival-pairs', line: 'They travel in pairs now.' },
  { level: 46, id: 'double-goldens', line: 'Double goldens sighted. Twice the jackpot.' },
  { level: 51, id: 'bandit', line: 'The Bandit raids your clusters. Guard your meals.' },
  { level: 56, id: 'storm-surges', line: 'Storm surges: bigger drops, shorter warnings.' },
  { level: 61, id: 'landmark-shields', line: 'The landmark is shielded. Eat to break the shield.' },
  { level: 66, id: 'night', line: 'Night falls. The neon earns its keep.' },
  { level: 71, id: 'elite-goldens', line: 'Elite goldens: rarer, fatter, shinier.' },
  { level: 76, id: 'triple-rivals', line: 'A full rival pack stalks this district.' },
  { level: 81, id: 'traffic-rush', line: 'Traffic rush: the roads are jammed with meals.' },
  { level: 86, id: 'shielded-clusters', line: 'Shielded clusters: crack the shield, keep the feast.' },
  { level: 91, id: 'bandit-duelist', line: 'Bandit and Duelist, hunting together.' },
  { level: 96, id: 'crescendo', line: 'Everything, everywhere, all at once.' },
];

// The flat per-level mechanics descriptor, derived from the cadence — the
// single object systems/main read to decide what's active this level.
// All fields are plain data; nothing here spawns anything by itself.
function mechanicsFor(n) {
  const arcPosition = (levelInChapterOf(n) - 1) % 5;
  const available = {
    rivals: n >= 6,
    storms: n >= 11,
    traffic: n >= 21,
    megaProps: n >= 26,
    landmarkShield: n >= 61,
    night: n >= 66,
    shieldedClusters: n >= 86,
  };
  const active = (key) => available[key] && (
    arcPosition === 0 || arcPosition >= 2 || key === 'rivals'
  );
  return {
    goldens: true, // from L1
    goldenCount: n >= 46 ? 2 : 1, // double goldens L46
    eliteGoldens: n >= 71, // elite goldens L71 (marked on the golden props)
    rivals: active('rivals') ? rivalComposition(n) : [],
    storms: active('storms'),
    hazardDrops: active('storms') && n >= 36,
    stormSurges: active('storms') && n >= 56,
    traffic: active('traffic'),
    trafficRush: active('traffic') && n >= 81,
    megaProps: active('megaProps'),
    dailyUnlocked: n >= 31, // daily challenge unlock L31 (meta flag)
    landmarkShield: active('landmarkShield') ? 10 : 0,
    night: active('night'),
    shieldedClusters: active('shieldedClusters'),
    crescendo: n >= 96, // everything-at-once L96-100
  };
}

const PROGRESSION_PHASES = ['teach', 'reinforce', 'pressure', 'combine', 'test'];

function progressionFor(n, isCapstone) {
  const phase = PROGRESSION_PHASES[(levelInChapterOf(n) - 1) % 5];
  const objectives = [];
  if (isCapstone) objectives.push({ id: 'capstone' });
  else if (n >= 6 && phase !== 'teach') objectives.push({ id: 'rival', count: 1 });
  else objectives.push({ id: 'goldens', count: 1 });

  if (phase === 'pressure' || phase === 'test') {
    objectives.push({ id: 'fast-finish', maxCompletionFraction: 0.70 });
  } else if (phase === 'combine') {
    objectives.push({ id: 'combo', count: 10 });
  } else {
    objectives.push({ id: 'no-second-wind' });
  }
  return {
    phase,
    objectives,
    targetCompletionRange: [0.55, 0.80],
    targetBudgetConsumptionRange: [0.45, 0.70],
    massBudget: progressionMassBudget(n),
    ordinaryMassFraction: ordinaryMassFraction(n),
  };
}

function cloneTemplate() {
  return LEVEL_TEMPLATE.map((t) => ({ ...t }));
}

export function generateLevel(n) {
  const chapter = chapterOf(n);
  const levelInChapter = levelInChapterOf(n);
  const metro = METROS[chapter - 1];
  const isCapstone = levelInChapter === 10;
  const unlock = MECHANIC_UNLOCKS.find((u) => u.level === n) || null;
  const template = cloneTemplate();
  return {
    n,
    chapter,
    levelInChapter,
    metro,
    metroIndex: chapter - 1, // 0-based, for seeds.levelSeed / districts.js
    districtIndex: levelInChapter - 1, // 0-based, same
    districtName: metro.districts[levelInChapter - 1],
    target: target(n),
    time: timeSeconds(n),
    world: worldSize(n),
    tier: tierOf(n),
    rivalCount: rivalCount(n),
    hazardDensity: hazardDensity(n),
    capstoneGate: capstoneGate(n),
    itemValueMultiplier: itemValueMultiplier(n),
    template,
    // The districts.js-facing name for the same per-tier budget data: counts
    // here are the content budget (D2) the layout generator must honor.
    propBudget: template,
    // Deterministic world-gen seed (tech-architecture.md §3): same level ⇒
    // same layout/props/goldens, in every browser.
    seed: levelSeed(chapter - 1, levelInChapter - 1),
    mechanics: mechanicsFor(n),
    progression: progressionFor(n, isCapstone),
    // Exactly one intro line on the level that introduces a mechanic
    // (content-and-meta.md §5); '' otherwise.
    introLine: unlock ? unlock.line : '',
    unlockId: unlock ? unlock.id : null,
    // The metro's 10th district is the landmark-gated capstone with a small
    // authored twist (content-and-meta.md §1); null on other levels.
    isCapstone,
    capstoneTwist: isCapstone ? metro.capstoneTwist : null,
  };
}

export function generateAllLevels() {
  return Array.from({ length: LEVEL_COUNT }, (_, i) => generateLevel(i + 1));
}

export { LEVEL_COUNT };
