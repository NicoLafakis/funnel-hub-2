// Meta-progression persistence layer.
//
// Storage contract: localStorage key `hubhole.save.v1`, schema:
//   {
//     coins: number,
//     stars: { [levelN: string]: number },       // per-level star rating, sparse
//     upgrades: { size, speed, magnet, time, growth },  // each a tier 0-5
//     unlockedLevel: number,                      // highest level index playable (1-based)
//     collection: { [objectKey: string]: { count: number, firstSeenAt: number } },
//     achievements: string[],                      // unlocked achievement ids
//     bestCombo: number,
//   }
//
// CRITICAL (per city-3d-redesign-plan.md): this module must not touch
// browser-only globals (localStorage/window/document) at module top level —
// only inside the exported functions — so a bare dynamic import never throws
// outside a browser. When localStorage is unavailable (e.g. running under
// plain Node for tests), loadSave()/saveSave() transparently fall back to an
// in-memory object store behind the identical API, so save/load round-trip
// logic can be exercised headlessly.

export const SAVE_KEY = 'hubhole.save.v1';

const UPGRADE_KEYS = ['size', 'speed', 'magnet', 'time', 'growth'];

export function defaultSave() {
  return {
    coins: 0,
    stars: {},
    upgrades: { size: 0, speed: 0, magnet: 0, time: 0, growth: 0 },
    unlockedLevel: 1,
    collection: {},
    achievements: [],
    bestCombo: 0,
  };
}

// Returns true only if a working localStorage-like object is reachable.
// Wrapped in try/catch because merely *referencing* localStorage can throw
// (e.g. some browsers in private-mode/sandboxed-iframe contexts), and because
// `typeof localStorage` throws a ReferenceError in older engines if the
// binding doesn't exist at all rather than evaluating to 'undefined'.
function hasLocalStorage() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return false;
    // Confirm it's actually usable, not just present (some environments expose
    // a stub that throws on get/setItem).
    const probeKey = '__hubhole_probe__';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return true;
  } catch (e) {
    return false;
  }
}

// Module-scoped in-memory fallback store, used only when localStorage is
// unavailable. Lazily populated — stays untouched (and unimported-from) in
// environments where localStorage works fine.
let memoryStore = null;

function deepCloneJSON(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return fallback;
  }
}

function safePlainObject(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return deepCloneJSON(fallback, fallback);
  return deepCloneJSON(value, deepCloneJSON(fallback, fallback));
}

function safeArray(value, fallback) {
  if (!Array.isArray(value)) return deepCloneJSON(fallback, fallback);
  return deepCloneJSON(value, deepCloneJSON(fallback, fallback));
}

function safeNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeUpgrades(raw) {
  const defaults = defaultSave().upgrades;
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const key of UPGRADE_KEYS) {
    const n = safeNumber(src[key], defaults[key]);
    out[key] = Math.max(0, Math.floor(n));
  }
  return out;
}

// Defensive normalizer: given whatever JSON.parse produced (or a raw object
// handed to saveSave), always returns a fully-shaped, type-safe save object.
// Never throws.
function normalizeSave(raw) {
  const defaults = defaultSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  return {
    coins: Math.max(0, safeNumber(raw.coins, defaults.coins)),
    stars: safePlainObject(raw.stars, defaults.stars),
    upgrades: normalizeUpgrades(raw.upgrades),
    unlockedLevel: Math.max(1, Math.floor(safeNumber(raw.unlockedLevel, defaults.unlockedLevel))),
    collection: safePlainObject(raw.collection, defaults.collection),
    achievements: safeArray(raw.achievements, defaults.achievements),
    bestCombo: Math.max(0, safeNumber(raw.bestCombo, defaults.bestCombo)),
  };
}

// Reads the save from localStorage (or the in-memory fallback), defensively
// normalized. Corrupt/missing JSON always yields a valid default shape —
// never throws.
export function loadSave() {
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      return normalizeSave(JSON.parse(raw));
    } catch (e) {
      return defaultSave();
    }
  }
  if (memoryStore === null) return defaultSave();
  return normalizeSave(memoryStore);
}

// Normalizes `data` and persists it (localStorage, or the in-memory fallback
// when localStorage is unavailable/unusable). Returns the normalized object
// actually stored, so callers can immediately trust its shape.
export function saveSave(data) {
  const normalized = normalizeSave(data);
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (e) {
      // Quota exceeded or similar — degrade gracefully to the in-memory
      // fallback for this process rather than losing the write entirely.
      memoryStore = normalized;
      return normalized;
    }
  }
  memoryStore = normalized;
  return normalized;
}
