// Pure adaptive-quality policy. Rendering applies these profiles; this module
// owns selection and bounded downgrade hysteresis so it is testable without a
// DOM or WebGL context.

export const QUALITY_PROFILES = Object.freeze({
  high: Object.freeze({ id: 'high', dprCap: 2, shadows: true, shadowMapSize: 2048, shadowDistanceMult: 1, effectsDensity: 1, detailDensity: 1 }),
  medium: Object.freeze({ id: 'medium', dprCap: 1.5, shadows: true, shadowMapSize: 1024, shadowDistanceMult: 0.85, effectsDensity: 0.7, detailDensity: 0.8 }),
  low: Object.freeze({ id: 'low', dprCap: 1, shadows: false, shadowMapSize: 512, shadowDistanceMult: 0.7, effectsDensity: 0.4, detailDensity: 0.6 }),
});

export const QUALITY_MODES = Object.freeze(['auto', 'high', 'medium', 'low']);
const ORDER = ['high', 'medium', 'low'];

export function normalizeQualityMode(value) {
  return QUALITY_MODES.includes(value) ? value : 'auto';
}

export function selectInitialQuality({ mode = 'auto', mobile = false, deviceMemory = null, hardwareConcurrency = null } = {}) {
  const normalized = normalizeQualityMode(mode);
  if (normalized !== 'auto') return normalized;
  if (!mobile) return 'high';
  if ((Number.isFinite(deviceMemory) && deviceMemory <= 4)
    || (Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 4)) return 'low';
  return 'medium';
}

export function createQualityController({
  initial = 'medium',
  badFrameMs = 33.3,
  sustainMs = 8000,
  cooldownMs = 30000,
} = {}) {
  let tier = QUALITY_PROFILES[initial] ? initial : 'medium';
  let pressureMs = 0;
  let elapsedMs = cooldownMs;
  let downgradedThisLevel = false;

  function sample(frameMs) {
    const dt = Math.max(0, Number(frameMs) || 0);
    elapsedMs += dt;
    pressureMs = dt > badFrameMs ? pressureMs + dt : 0;
    if (!downgradedThisLevel && elapsedMs >= cooldownMs && pressureMs >= sustainMs) {
      const index = ORDER.indexOf(tier);
      if (index >= 0 && index < ORDER.length - 1) {
        tier = ORDER[index + 1];
        downgradedThisLevel = true;
        elapsedMs = 0;
        pressureMs = 0;
        return tier;
      }
    }
    return null;
  }

  function beginLevel() {
    downgradedThisLevel = false;
    pressureMs = 0;
  }

  function setTier(next) {
    if (!QUALITY_PROFILES[next]) return false;
    tier = next;
    pressureMs = 0;
    return true;
  }

  return {
    sample,
    beginLevel,
    setTier,
    get tier() { return tier; },
    get snapshot() { return { tier, pressureMs, elapsedMs, downgradedThisLevel }; },
  };
}
