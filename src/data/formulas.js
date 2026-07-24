// Core difficulty-curve and economy formulas for Flywheel V2.
// Pure functions, no browser/DOM APIs, safe to import in Node or in-browser.
//
// INVARIANTS (.wiki/game-design.md §5, lessons-from-v1.md B3/B6) — every
// formula below names the invariant it satisfies, and the logic suite
// (scripts/logic-test.js) asserts them across all 100 levels:
//   - target/itemValueMultiplier keep the n^2 skeleton: the RATIO of
//     available mass to target is constant at every level (invariant 1's
//     denominator).
//   - radiusFromMass is computed from BASE mass (mass / itemValueMultiplier),
//     so avatar size is level-invariant (B6: normalize every progression
//     axis by the economy's scaling factor).
//   - rivalEatBonus is a fixed fraction of the level target at EVERY level
//     (B3: never port a flat bonus into an n^2 economy — (150+50n)*n^2 hit
//     5.15x the level target at n=100).
//   - coinsForLevel is FLAT in n (content-and-meta.md §4: mass/10 explodes
//     with n^2), so a level is worth ~75-150 coins at any n.

export function target(n) {
  return 1000 * n * n;
}

export function chapterOf(n) {
  return Math.ceil(n / 10);
}

export function levelInChapterOf(n) {
  return n - 10 * (chapterOf(n) - 1);
}

export function timeSeconds(n) {
  return 60 + 6 * n;
}

export function worldSize(n) {
  return 2400 + 250 * (chapterOf(n) - 1) + 15 * levelInChapterOf(n);
}

export function tierOf(n) {
  if (n <= 5) return 'tutorial';
  if (n <= 10) return 'first-contest';
  if (n <= 20) return 'escalation';
  if (n <= 50) return 'expert';
  if (n <= 99) return 'master';
  return 'capital-siege';
}

// Rival count follows the V2 unlock cadence (content-and-meta.md §1):
// rivals L6, rival pairs L41, triple rivals L76. The named-archetype
// composition per level lives in rivalComposition() below.
export function rivalCount(n) {
  if (n <= 5) return 0;
  if (n <= 40) return 1;
  if (n <= 75) return 2;
  return 3;
}

// Named-rival archetypes (game-design.md §4): Grazer wanders, Duelist hunts
// the player when bigger, Bandit raids the player's clusters. Composition by
// cadence: Duelist joins L16, Bandit joins L51, Bandit+Duelist hunt together
// from L91 (with the third rival from L76 filled by a Grazer).
export const RIVAL_ARCHETYPES = ['grazer', 'duelist', 'bandit'];

export function rivalComposition(n) {
  const count = rivalCount(n);
  const comp = Array.from({ length: count }, () => 'grazer');
  if (n >= 16 && count >= 1) comp[count - 1] = 'duelist';
  if (n >= 51 && count >= 2) comp[count - 2] = 'bandit';
  return comp;
}

export function hazardDensity(n) {
  const t = tierOf(n);
  return { tutorial: 0, 'first-contest': 0, escalation: 0.05, expert: 0.10, master: 0.18, 'capital-siege': 0.25 }[t];
}

export function capstoneGate(n) {
  const t = tierOf(n);
  return { tutorial: 0.78, 'first-contest': 0.78, escalation: 0.80, expert: 0.85, master: 0.92, 'capital-siege': 0.95 }[t];
}

export function itemValueMultiplier(n) {
  return n * n;
}

export const LEVEL_COUNT = 100;

// --- V2 economy (content-and-meta.md §4) ------------------------------------

// Coin payout per completed level: coins = 50 + 25*stars + challengeBonus.
// Deliberately flat in n — V1's mass-scaled payout explodes under the n^2
// economy. A 1-3 star clear is worth 75-125 coins at ANY level; daily /
// challenge bonuses stack on top via challengeBonus.
export function coinsForLevel(stars, challengeBonus = 0) {
  const s = Math.max(0, Math.min(3, Math.floor(stars) || 0));
  return 50 + 25 * s + Math.max(0, Math.floor(challengeBonus) || 0);
}

// The worst-case (1-star) level-1 payout. Shop tier-0 prices must be <= this
// so the first upgrade is affordable after level 1 (content-and-meta.md §4:
// "the genre's most important juice timing"). src/meta/upgrades.js prices
// against this constant.
export const LEVEL_ONE_MIN_PAYOUT = coinsForLevel(1);

// Golden records: keep V1's 8x mass (mirrors swallow.js
// GOLDEN_BONUS_MULTIPLIER) and add +10 coins each — goldens are the money
// run's target, not just mass (content-and-meta.md §4).
export const GOLDEN_MASS_MULTIPLIER = 8;
export const GOLDEN_COIN_BONUS = 10;

// Rival-eat bonus — re-derived against the n^2 economy (lesson B3).
// Derivation: target(n) = 1000*n^2. We want the bonus to be MEANINGFUL (a
// visible chunk of the level, ~10% of target — worth a detour) but never a
// win button (<= ~10% of target at every level). Fixing the ratio r = 0.10
// gives bonus(n) = r * target(n) = 100*n^2, i.e. 100 * itemValueMultiplier
// at every level. V1's ported (150+50n)*n^2 was (0.15+0.05n)*target — 5.15x
// the entire target at n=100. This shape is level-invariant by construction.
export function rivalEatBonus(n) {
  return 100 * n * n;
}

// Avatar radius from BASE mass (B6: radius growth stays normalized —
// callers pass mass / itemValueMultiplier so avatar size is level-invariant).
// Exact shape ported from the original 2D game; mirrors
// src/engine/avatar.js radius(). Do not change the shape.
export function radiusFromMass(baseMass) {
  return 26 + Math.sqrt(Math.max(0, baseMass)) * 1.9;
}

// --- Reachable-mass model (game-design.md §5 invariant 1) --------------------
// Invariant: reachable mass in 60% of the timer >= 1.5x target at every
// level. "Reachable" is modeled, not vibed: the player sweeps a corridor of
// width REACH_SWEEP_WIDTH at PLAYER_BASE_SPEED for 60% of the timer, and can
// route through at most that share of the world's area. Levels carry ~4.3x
// target in total mass (see src/data/levels.js LEVEL_TEMPLATE), so the
// binding level is n=1 (smallest time/world ratio); the logic suite asserts
// the invariant at n in {1, 25, 50, 75, 100}.
export const PLAYER_BASE_SPEED = 340; // mirrors avatar.js BASE_SPEED
export const REACH_SWEEP_WIDTH = 200; // mid-level avatar diameter + margin

export function reachableMassFraction(n) {
  const pathLength = PLAYER_BASE_SPEED * 0.6 * timeSeconds(n);
  const world = worldSize(n);
  return Math.min(1, (pathLength * REACH_SWEEP_WIDTH) / (world * world));
}

// Base-mass terms (divide scaled mass back out by itemValueMultiplier):
// reachable BASE mass = fraction * totalBaseMass must be >= 1.5 * 1000.
export function reachableBaseMass(n, totalBaseMass) {
  return reachableMassFraction(n) * totalBaseMass;
}

// --- Capstone gating (the landmark is the level's boss eat) ------------------
// The landmark GEOMETRY's bounding radius (24-74u, src/content/landmarks.js)
// is smaller than a tier-6 building (84.7u) — gating the swallow check on the
// raw geometry makes the "boss eat" edible in the opening seconds and defeats
// capstoneGate(n) plus the "grow to eat THAT" arc (observed: the soak bot won
// L25 in 2.6s by beelining the landmark). The EFFECTIVE gate radius is
// therefore derived from the level economy: the avatar radius at
// CAPSTONE_EDIBLE_MASS_FRACTION of the level's target mass (base terms),
// times the level's capstoneGate — so the size gate opens at ~that fraction
// of target, late in the level. Because target(n) and itemValueMultiplier(n)
// share the n^2 skeleton, the fraction is level-invariant, and invariant 4
// (edible by 90% of the timer) holds wherever reachable-mass does.
export const CAPSTONE_EDIBLE_MASS_FRACTION = 0.7;

export function capstoneGateRadius(level) {
  const baseTarget = level.target / level.itemValueMultiplier;
  return radiusFromMass(baseTarget * CAPSTONE_EDIBLE_MASS_FRACTION) * level.capstoneGate;
}

// --- Elite goldens (L71+ unlock cadence, content-and-meta.md §1) -------------
// "Elite goldens: rarer, fatter, shinier." Derived against the regular golden
// economy (GOLDEN_MASS_MULTIPLIER 8 / GOLDEN_COIN_BONUS 10): 2x the mass and
// 2.5x the coins of a regular golden — flat in n like every V2 economy
// constant (lesson B3), so elites are a jackpot, never an economy break.
export const ELITE_GOLDEN_MASS_MULTIPLIER = 16;
export const ELITE_GOLDEN_COIN_BONUS = 25;
