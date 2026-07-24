import {
  availableMassBudget, coinsForLevel, progressionAwardReport,
  REPLAY_REWARD_FRACTION,
} from '../data/formulas.js';

const OBJECTIVE_IDS = new Set([
  'fast-finish', 'capstone', 'rival', 'combo', 'goldens', 'no-second-wind',
]);

function objectiveMet(objective, metrics) {
  if (!objective || !OBJECTIVE_IDS.has(objective.id)) return false;
  switch (objective.id) {
    case 'fast-finish':
      return Number(metrics.completionFraction) <= Number(objective.maxCompletionFraction);
    case 'capstone':
      return metrics.capstoneEaten === true;
    case 'rival':
      return (Number(metrics.rivalsEaten) || 0) >= (Number(objective.count) || 1);
    case 'combo':
      return (Number(metrics.peakCombo) || 0) >= (Number(objective.count) || 10);
    case 'goldens':
      return (Number(metrics.goldensEaten) || 0) >= (Number(objective.count) || 1);
    case 'no-second-wind':
      return metrics.usedSecondWind !== true;
    default:
      return false;
  }
}

export function starResult(level, metrics = {}) {
  if (!metrics.completed) return { stars: 0, mastery: [] };
  const objectives = level && level.progression && Array.isArray(level.progression.objectives)
    ? level.progression.objectives.slice(0, 2)
    : [];
  const mastery = objectives.map((objective) => ({
    id: objective && objective.id,
    met: objectiveMet(objective, metrics),
  }));
  return {
    stars: 1 + mastery.filter((entry) => entry.met).length,
    mastery,
  };
}

function safeClaims(saveData) {
  if (!saveData.rewardClaims || typeof saveData.rewardClaims !== 'object') {
    saveData.rewardClaims = {};
  }
  if (!saveData.rewardClaims.firstClear || typeof saveData.rewardClaims.firstClear !== 'object') {
    saveData.rewardClaims.firstClear = {};
  }
  if (!saveData.rewardClaims.starMilestones || typeof saveData.rewardClaims.starMilestones !== 'object') {
    saveData.rewardClaims.starMilestones = {};
  }
  return saveData.rewardClaims;
}

export function levelReward(level, result, saveData) {
  const key = String(level.n);
  const stars = Math.max(1, Math.min(3, Math.floor(result.stars) || 1));
  const claims = safeClaims(saveData);
  const claimedStars = Math.max(0, Math.min(3, Math.floor(claims.starMilestones[key]) || 0));
  const firstClear = claims.firstClear[key] !== true;
  let kind = 'replay';
  let coins = Math.round(coinsForLevel(stars) * REPLAY_REWARD_FRACTION);

  if (firstClear) {
    kind = 'first-clear';
    coins = coinsForLevel(stars);
    claims.firstClear[key] = true;
    claims.starMilestones[key] = stars;
  } else if (stars > claimedStars) {
    kind = 'star-improvement';
    coins = coinsForLevel(stars) - coinsForLevel(claimedStars);
    claims.starMilestones[key] = stars;
  }

  return { kind, coins, stars, previousBestStars: claimedStars };
}

export function progressionAwardForProp(prop, level, itemValueMultiplier = level.itemValueMultiplier) {
  return progressionAwardReport(
    prop,
    itemValueMultiplier,
    level.progression.ordinaryMassFraction,
    level.target,
  ).amount;
}

export function createAvailableMassLedger(
  level,
  initialProps = [],
  initialItemValueMultiplier = level.itemValueMultiplier,
) {
  const limit = availableMassBudget(level.n);
  let initialAward = 0;
  let dynamicAward = 0;
  for (const prop of initialProps) {
    initialAward += progressionAwardForProp(prop, level, initialItemValueMultiplier);
  }
  if (initialAward > limit + 1e-9) {
    throw new Error(`Initial available mass exceeds budget for level ${level.n}`);
  }

  return {
    limit,
    initialAward,
    get dynamicAward() { return dynamicAward; },
    get totalAward() { return initialAward + dynamicAward; },
    get remaining() { return Math.max(0, limit - initialAward - dynamicAward); },
    admit(records, itemValueMultiplier = level.itemValueMultiplier) {
      const accepted = [];
      for (const prop of Array.isArray(records) ? records : []) {
        const award = progressionAwardForProp(prop, level, itemValueMultiplier);
        if (award <= this.remaining + 1e-9) {
          dynamicAward += award;
          accepted.push(prop);
          continue;
        }
        if (this.remaining <= 1e-9 || award <= 0 || prop.golden || prop.elite) continue;
        const denominator = Math.max(1e-9, itemValueMultiplier * level.progression.ordinaryMassFraction);
        prop.mass = this.remaining / denominator;
        dynamicAward += progressionAwardForProp(prop, level, itemValueMultiplier);
        accepted.push(prop);
      }
      return accepted;
    },
    summary() {
      return {
        limit,
        initialAward,
        dynamicAward,
        totalAward: initialAward + dynamicAward,
        fraction: (initialAward + dynamicAward) / limit,
      };
    },
  };
}
