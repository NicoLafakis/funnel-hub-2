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
// sum(baseMass*baseCount) = 4279, i.e. ~4.3x target at every n from 1..100.
//
// Why ~4.3x and not the ~1.4x a top-down game wants: the 3D chase camera sees
// only a small cone of the world at any moment (vs the old 2D top-down view
// that showed a whole neighborhood), so routing efficiency is far lower —
// winning must require eating ~25% of the content, not ~70%.
//
// CORRECTION (2026-07-27, measured): an earlier version of this comment claimed
// `reachableBaseMass(n, 4281) >= 1.5x target at every level`. That is FALSE, and
// it conflates two unrelated quantities. Nothing in either suite calls
// reachableBaseMass, and the ratio it names is not the one being asserted:
// target(n) = 1000*n*n grows with the campaign while base mass does not, so
// reachableBaseMass(n, 4281) / target(n) is 2.25x at n=1 and 7.2e-5 at n=100.
// The real assertion lives in logic-test.js (~line 295) and is measured against
// the FIXED level-1 target of 1000, not against target(n):
//     district.stats.totalBaseMass * ORDINARY_MASS_FRACTION(0.78) >= 1.5 * 1000
// i.e. totalBaseMass must stay >= 1923. Measured on THIS tree, after the count
// change below (template tiers plus street props, which vary a little by metro
// density): n=1 4471, n=25 4471, n=50 4805, n=75 4620, n=100 4796. Available
// mass is therefore 3487-3748 against a 1500 floor — ~2.3x headroom, and NOT
// the binding constraint on content. The scale-invariance argument above is
// still sound —
// itemValueMultiplier(n) = n*n cancels against target(n) = 1000*n*n — it was
// just written up against the wrong ratio.
//
// THE ACTUAL BINDING CONSTRAINTS on prop counts, measured 2026-07-27 by sweeping
// ~26 count/mass configurations through the full invariant suite:
//
//   (a) PACING FLOOR. Invariant 6's mean completionFraction tracks total prop
//       COUNT almost monotonically when per-tier mass is held fixed:
//         c277 -> 56.4%   c289 -> 59.8%   c306 -> 60.5%   c319 -> 61.8%
//         c324 -> 62.9%   c349 -> 64.4%   c369 -> 66.9%
//       Fewer props means shorter routes and faster finishes, which drives the
//       mean DOWN through the 0.61 band floor. Below ~315 props invariant 6
//       fails outright.
//   (b) BUILD CEILING. Max-build runs must still use >=25% of the timer. This
//       breaks before invariant 6 does: every sampled config below ~340 props
//       failed it (n=1 and n=75, utility build, ~21% of timer).
//   (c) LOW-TIER MASS. Invariant 5 (completability) is driven by the mass edible
//       at SPAWN size — tiers 0-1 plus STREET_PROP_TIERS. Baseline is 1020.
//       Configurations that cut it to ~470-790 failed invariant 5 at 2-3 levels.
//
// Net: total prop count has roughly 30 props of slack below 369 and NONE above
// the pacing ceiling. A large count cut is not available at this economy.
//
// COMPOSITION (2026-07-27): the original "triple everything" pass left 59% of
// all props as bins and bicycles against 51 buildings — the inverse of a real
// city, and ~5x the loose-prop density of the Hole.io reference
// (assets/references/holeio). This pass corrects the mix as far as the gates
// above permit: trash 126 -> 94 (-25%), buildings 51 -> 63 (+24%), total count
// 369 -> 349, bins+bikes share 58.5% -> 52.7%.
//
// PER-TIER MASS IS PRESERVED EXACTLY. Each tier trades count against baseMass so
// its product is unchanged (trash 126*3 = 94*4 = 378 modulo rounding, bikes
// 90*5 = 450, small buildings 27*28 = 36*21 = 756, medium 15*48 = 18*40 = 720).
// Total moves 4281 -> 4279 (-0.05%). TIER_RADII and the 1.35x ladder are
// untouched, so the economy, the size gates and the award curve are as they
// were — only how many objects that mass is divided into changed.
//
// WARNING — invariant 5 has almost no margin and this is NOT a safe file to
// tune casually. At the pre-change baseline, level 61 completed with 0.3% of its
// timer to spare and three levels sat under 10% slack. Because the soak bot is
// greedy, its route is chaotically sensitive to prop POSITIONS (see the long
// note at COMPLETION_PACING_BAND in scripts/invariant-test.js), so ANY count
// change reshuffles routes and typically knocks 1-3 levels below target. Most of
// the 26 configurations swept for this pass scored 97-99/100 on invariant 5, not
// because they were worse economies but because they were differently shuffled.
// Do not assume a "safer-looking" edit will pass. Re-run the full suite, and do
// not "restore" the old counts without re-reading
// .wiki/0003-hole-feel-and-visual-fidelity/00-findings.md.
const LEVEL_TEMPLATE = [
  { tierIndex: 0, baseRadius: TIER_RADII[0], baseMass: 4, baseCount: 94, kind: 'trash' },
  { tierIndex: 1, baseRadius: TIER_RADII[1], baseMass: 5, baseCount: 90, kind: 'bike' },
  { tierIndex: 2, baseRadius: TIER_RADII[2], baseMass: 9, baseCount: 60, kind: 'car' },
  { tierIndex: 3, baseRadius: TIER_RADII[3], baseMass: 16, baseCount: 42, kind: 'bus' },
  { tierIndex: 4, baseRadius: TIER_RADII[4], baseMass: 21, baseCount: 36, kind: 'building-small' },
  { tierIndex: 5, baseRadius: TIER_RADII[5], baseMass: 40, baseCount: 18, kind: 'building-medium' },
  { tierIndex: 6, baseRadius: TIER_RADII[6], baseMass: 85, baseCount: 9, kind: 'building-large', isCapstoneCandidate: true },
];

// The Loop preserves the exact mass carried by every global tier while
// redistributing object count toward a downtown composition. This is a visual
// density contract, not an easier economy: traffic 102 -> 74, buildings
// 63 -> 114, loose props 184 -> 155, total objects 349 -> 343. Each row's
// baseMass * baseCount matches LEVEL_TEMPLATE exactly.
const CHICAGO_LOOP_TEMPLATE = [
  { tierIndex: 0, baseRadius: TIER_RADII[0], baseMass: 4.7, baseCount: 80, kind: 'trash' },
  { tierIndex: 1, baseRadius: TIER_RADII[1], baseMass: 6, baseCount: 75, kind: 'bike' },
  { tierIndex: 2, baseRadius: TIER_RADII[2], baseMass: 10.8, baseCount: 50, kind: 'car' },
  { tierIndex: 3, baseRadius: TIER_RADII[3], baseMass: 28, baseCount: 24, kind: 'bus' },
  { tierIndex: 4, baseRadius: TIER_RADII[4], baseMass: 9.45, baseCount: 80, kind: 'building-small' },
  { tierIndex: 5, baseRadius: TIER_RADII[5], baseMass: 30, baseCount: 24, kind: 'building-medium' },
  { tierIndex: 6, baseRadius: TIER_RADII[6], baseMass: 76.5, baseCount: 10, kind: 'building-large', isCapstoneCandidate: true },
];

// Sanity-computed sum(baseMass * baseCount), exported for tests/introspection.
export const LEVEL_TEMPLATE_MASS_SUM = LEVEL_TEMPLATE.reduce((sum, t) => sum + t.baseMass * t.baseCount, 0);

// ---------------------------------------------------------------------------
// STREET PROP TIERS (Hole.io staple street food: trees, pedestrians, lamps).
// These sit OUTSIDE the 7 template tiers on purpose: the 1.35x tier step and
// the template mass budget stay sacred, and the archetype catalogs (30 per
// metro) don't list them. They are sub-tier-0 snacks — every radius is edible
// at the level-1 spawn gate (avatar r=26, size gate 0.78 => radius <= 20.28).
// districts.js scatters them from its own seeded stream; per-metro density
// multipliers come from metros.js `streetProps[densityFlag]` (missing = 1).
// baseMass here is content tuning data (like LEVEL_TEMPLATE above), never a
// formula — awards still flow through formulas.progressionAwardReport.
export const STREET_PROP_TIERS = [
  { kind: 'tree', baseRadius: TIER_RADII[0], baseMass: 2, baseCount: 40, densityFlag: 'vegetation' },
  { kind: 'person', baseRadius: 8, baseMass: 1, baseCount: 56, densityFlag: 'pedestrians' },
  { kind: 'streetlamp', baseRadius: 12, baseMass: 2, baseCount: 28, densityFlag: 'lamps' },
];

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

function cloneChicagoLoopTemplate() {
  return CHICAGO_LOOP_TEMPLATE.map((t) => ({ ...t }));
}

export function generateLevel(n) {
  const chapter = chapterOf(n);
  const levelInChapter = levelInChapterOf(n);
  const metro = METROS[chapter - 1];
  const isCapstone = levelInChapter === 10;
  const unlock = MECHANIC_UNLOCKS.find((u) => u.level === n) || null;
  const template = n === 1 ? cloneChicagoLoopTemplate() : cloneTemplate();
  return {
    n,
    chapter,
    levelInChapter,
    metro,
    metroIndex: chapter - 1, // 0-based, for seeds.levelSeed / districts.js
    districtIndex: levelInChapter - 1, // 0-based, same
    districtName: n === 1 ? 'The Loop · Chicago' : metro.districts[levelInChapter - 1],
    cityName: n === 1 ? 'Chicago' : metro.name,
    authoredCity: n === 1 ? 'chicago-loop' : null,
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
