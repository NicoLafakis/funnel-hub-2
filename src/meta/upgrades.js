// Meta-progression upgrade economy: 5 tracks, tiers 0-5, a cost curve, and the
// stat-modification function a later integration stage wires into
// level-start/gameplay code. No browser-only APIs — pure data + functions.

export const MAX_TIER = 5;

// Each track's `perTier` is the magnitude added per tier of that stat's
// effect (see applyUpgrades below for exactly how each is combined).
export const UPGRADE_TRACKS = {
  size: {
    key: 'size',
    label: 'Size',
    description: 'Extra starting mass carried into every level.',
    maxTier: MAX_TIER,
    perTier: 40, // +40 starting mass per tier
  },
  speed: {
    key: 'speed',
    label: 'Speed',
    description: 'Move-speed multiplier.',
    maxTier: MAX_TIER,
    perTier: 0.06, // +6% move speed per tier
  },
  magnet: {
    key: 'magnet',
    label: 'Magnet',
    description: 'Attract-radius multiplier.',
    maxTier: MAX_TIER,
    perTier: 0.15, // +15% attract radius per tier
  },
  time: {
    key: 'time',
    label: 'Time',
    description: 'Extra seconds added to the level clock.',
    maxTier: MAX_TIER,
    perTier: 5, // +5 seconds per tier
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    description: 'Mass-gain multiplier (starting-mass carryover growth).',
    maxTier: MAX_TIER,
    perTier: 0.05, // +5% mass gained from eaten objects per tier
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADE_TRACKS);

// Cost curve: cost(trackKey, currentTier) = 100 * (currentTier + 1)^2.
// currentTier is the tier the player is upgrading FROM (0-4); the result is
// the coin cost to reach currentTier + 1. Monotonically increasing:
//   0->1: 100   1->2: 400   2->3: 900   3->4: 1600   4->5: 2500
// Same curve applies uniformly across all 5 tracks.
export function cost(trackKey, currentTier) {
  if (!UPGRADE_TRACKS[trackKey]) {
    throw new Error(`Unknown upgrade track: ${trackKey}`);
  }
  const tier = Math.max(0, Math.floor(Number(currentTier) || 0));
  return 100 * (tier + 1) * (tier + 1);
}

function clampTier(value) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(MAX_TIER, Math.floor(n)));
}

// Returns true if the given tier is already at the track's max (no further
// purchase possible).
export function isMaxTier(trackKey, currentTier) {
  if (!UPGRADE_TRACKS[trackKey]) {
    throw new Error(`Unknown upgrade track: ${trackKey}`);
  }
  return clampTier(currentTier) >= UPGRADE_TRACKS[trackKey].maxTier;
}

// Combines a level's base gameplay stats with the player's persisted upgrade
// tiers into the modifiedStats a level-start/gameplay stage should actually
// use. `upgradeState` is the `upgrades` object from save.js's save shape
// (size/speed/magnet/time/growth tiers).
//
// Returned modifiedStats shape — a shallow copy of baseStats plus:
//   extraStartMass          number  — additive mass from the `size` track
//   moveSpeedMultiplier     number  — multiplicative, from the `speed` track
//   attractRadiusMultiplier number  — multiplicative, from the `magnet` track
//   extraSeconds            number  — additive seconds from the `time` track
//   massGainMultiplier      number  — multiplicative, from the `growth` track
//   startMass               number  — baseStats.startMass (default 0) + extraStartMass
//   timeSeconds             number  — baseStats.timeSeconds (default 0) + extraSeconds
//
// The combined `startMass`/`timeSeconds` fields are provided as a
// convenience when baseStats already carries those keys; the five raw
// extra*/*Multiplier fields are always present regardless, so a consumer can
// use whichever shape fits its own baseStats field names.
export function applyUpgrades(baseStats, upgradeState) {
  const base = baseStats && typeof baseStats === 'object' ? baseStats : {};
  const state = upgradeState && typeof upgradeState === 'object' ? upgradeState : {};

  const sizeTier = clampTier(state.size);
  const speedTier = clampTier(state.speed);
  const magnetTier = clampTier(state.magnet);
  const timeTier = clampTier(state.time);
  const growthTier = clampTier(state.growth);

  const extraStartMass = sizeTier * UPGRADE_TRACKS.size.perTier;
  const moveSpeedMultiplier = 1 + speedTier * UPGRADE_TRACKS.speed.perTier;
  const attractRadiusMultiplier = 1 + magnetTier * UPGRADE_TRACKS.magnet.perTier;
  const extraSeconds = timeTier * UPGRADE_TRACKS.time.perTier;
  const massGainMultiplier = 1 + growthTier * UPGRADE_TRACKS.growth.perTier;

  const baseStartMass = typeof base.startMass === 'number' ? base.startMass : 0;
  const baseTimeSeconds = typeof base.timeSeconds === 'number' ? base.timeSeconds : 0;

  return {
    ...base,
    extraStartMass,
    moveSpeedMultiplier,
    attractRadiusMultiplier,
    extraSeconds,
    massGainMultiplier,
    startMass: baseStartMass + extraStartMass,
    timeSeconds: baseTimeSeconds + extraSeconds,
  };
}
