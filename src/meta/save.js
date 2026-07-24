// Meta-progression persistence layer — schema v2.
//
// Storage contract: localStorage key `flywheel.save.v2`, schema:
//   {
//     version: 2,
//     coins: number,
//     lifetimeCoins: number,                        // total coins ever earned (respec cost base)
//     stars: { [levelN: string]: number },          // per-level star rating, sparse
//     upgrades: { size, speed, magnet, time, growth },  // LEGACY V1 tracks (tiers 0-5),
//                                                   // preserved on migration; V2 builds live in `builds`
//     builds: { [tierIndex: string]: string },      // V2 build picks: tier index -> pick id
//     skins: string[],                              // owned skin ids (metro token rewards)
//     activeSkin: string | null,
//     metroTokens: { [metroId: string]: number },   // 3★-per-district tokens, per metro
//     metroPerks: { [metroId: string]: true },      // unlocked permanent per-metro perks
//     tokenClaims: { [levelN: string]: true },      // which 3★ districts already paid a token
//     unlockedLevel: number,                        // highest level index playable (1-based)
//     collection: { [objectKey: string]: { count, firstSeenAt } },   // V1 album (kept)
//     collectionVariants: { [variantKey: string]: { count, firstSeenAt } }, // Skyline-opedia 2.0
//     galleryCards: string[],                       // metro ids with completed opedia pages
//     daily: {                                      // daily challenge state (content-and-meta §3)
//       lastPlayedDate: string | null,              // 'YYYY-MM-DD' of last attempt
//       attemptsLeft: number,                       // attempts remaining on lastPlayedDate
//       streak: number,                             // consecutive days won
//       bestStreak: number,
//       lastWinDate: string | null,
//       wins: number,
//       plays: number,
//     },
//     seedHistory: Array<{ seed, levelN, date, kind }>,  // seeded-gen log (tech §3), capped at 50
//     achievements: string[],
//     bestCombo: number,
//   }
//
// Migration (tech-architecture.md §7): on first load, if no v2 blob exists but a
// `flywheel.save.v1` blob does, it is migrated (coins/stars/levels/skins/upgrades
// preserved, everything else defaulted) and written to the v2 key. The v1 blob is
// left in place untouched — deleting a player's only backup is not a migration, it's
// a gamble.
//
// CRITICAL (per tech-architecture.md): this module must not touch browser-only
// globals (localStorage/window/document) at module top level — only inside the
// exported functions — so a bare dynamic import never throws outside a browser.
// When localStorage is unavailable (e.g. running under plain Node for tests),
// loadSave()/saveSave() transparently fall back to an in-memory object store
// behind the identical API, so save/load round-trip logic can be exercised
// headlessly.

export const SAVE_KEY = 'flywheel.save.v2';
export const LEGACY_SAVE_KEY = 'flywheel.save.v1';

// Legacy V1 upgrade-track keys — kept so migrated saves never lose purchased tiers.
const UPGRADE_KEYS = ['size', 'speed', 'magnet', 'time', 'growth'];

const SEED_HISTORY_CAP = 50;

export function defaultDaily() {
  return {
    lastPlayedDate: null,
    attemptsLeft: 3,
    streak: 0,
    bestStreak: 0,
    lastWinDate: null,
    wins: 0,
    plays: 0,
  };
}

export function defaultSave() {
  return {
    version: 2,
    coins: 0,
    lifetimeCoins: 0,
    stars: {},
    upgrades: { size: 0, speed: 0, magnet: 0, time: 0, growth: 0 },
    builds: {},
    skins: [],
    activeSkin: null,
    metroTokens: {},
    metroPerks: {},
    tokenClaims: {},
    unlockedLevel: 1,
    collection: {},
    collectionVariants: {},
    galleryCards: [],
    daily: defaultDaily(),
    seedHistory: [],
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
    const probeKey = '__flywheel_probe__';
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

function normalizeDaily(raw) {
  const defaults = defaultDaily();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const dateStr = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    lastPlayedDate: dateStr(src.lastPlayedDate),
    attemptsLeft: Math.max(0, Math.floor(safeNumber(src.attemptsLeft, defaults.attemptsLeft))),
    streak: Math.max(0, Math.floor(safeNumber(src.streak, defaults.streak))),
    bestStreak: Math.max(0, Math.floor(safeNumber(src.bestStreak, defaults.bestStreak))),
    lastWinDate: dateStr(src.lastWinDate),
    wins: Math.max(0, Math.floor(safeNumber(src.wins, defaults.wins))),
    plays: Math.max(0, Math.floor(safeNumber(src.plays, defaults.plays))),
  };
}

// Defensive normalizer: given whatever JSON.parse produced (or a raw object
// handed to saveSave), always returns a fully-shaped, type-safe v2 save object.
// Never throws.
function normalizeSave(raw) {
  const defaults = defaultSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const daily = normalizeDaily(raw.daily);
  return {
    version: 2,
    coins: Math.max(0, safeNumber(raw.coins, defaults.coins)),
    lifetimeCoins: Math.max(0, safeNumber(raw.lifetimeCoins, safeNumber(raw.coins, defaults.lifetimeCoins))),
    stars: safePlainObject(raw.stars, defaults.stars),
    upgrades: normalizeUpgrades(raw.upgrades),
    builds: safePlainObject(raw.builds, defaults.builds),
    skins: safeArray(raw.skins, defaults.skins),
    activeSkin: typeof raw.activeSkin === 'string' ? raw.activeSkin : null,
    metroTokens: safePlainObject(raw.metroTokens, defaults.metroTokens),
    metroPerks: safePlainObject(raw.metroPerks, defaults.metroPerks),
    tokenClaims: safePlainObject(raw.tokenClaims, defaults.tokenClaims),
    unlockedLevel: Math.max(1, Math.floor(safeNumber(raw.unlockedLevel, defaults.unlockedLevel))),
    collection: safePlainObject(raw.collection, defaults.collection),
    collectionVariants: safePlainObject(raw.collectionVariants, defaults.collectionVariants),
    galleryCards: safeArray(raw.galleryCards, defaults.galleryCards),
    daily,
    seedHistory: safeArray(raw.seedHistory, defaults.seedHistory).slice(-SEED_HISTORY_CAP),
    achievements: safeArray(raw.achievements, defaults.achievements),
    bestCombo: Math.max(0, safeNumber(raw.bestCombo, defaults.bestCombo)),
  };
}

// Pure v1 -> v2 migration (exported for headless tests). Accepts a parsed
// `flywheel.save.v1` blob (any degree of corruption tolerated) and returns a
// fully-shaped v2 save. Preserves coins/stars/levels/skins/upgrades per
// tech-architecture.md §7; `lifetimeCoins` floors at current coins because V1
// never tracked it (respec cost — 10% of lifetime — needs a sane base).
export function migrateV1(rawV1) {
  const src = rawV1 && typeof rawV1 === 'object' && !Array.isArray(rawV1) ? rawV1 : {};
  const migrated = normalizeSave({
    coins: src.coins,
    lifetimeCoins: src.coins, // best available floor — see note above
    stars: src.stars,
    upgrades: src.upgrades,
    unlockedLevel: src.unlockedLevel,
    collection: src.collection,
    achievements: src.achievements,
    bestCombo: src.bestCombo,
    skins: src.skins,
    activeSkin: src.activeSkin,
  });
  return migrated;
}

// Appends an entry to `saveData.seedHistory` (seeded-gen provenance log,
// tech §3), capped at SEED_HISTORY_CAP most-recent entries. Mutates saveData
// in place and returns it; tolerates a missing/corrupt seedHistory field.
export function logSeed(saveData, entry) {
  if (!saveData || typeof saveData !== 'object') return saveData;
  if (!Array.isArray(saveData.seedHistory)) saveData.seedHistory = [];
  if (entry && typeof entry === 'object' && typeof entry.seed === 'number') {
    saveData.seedHistory.push({
      seed: entry.seed >>> 0,
      levelN: typeof entry.levelN === 'number' ? entry.levelN : null,
      date: typeof entry.date === 'string' ? entry.date : null,
      kind: entry.kind === 'daily' ? 'daily' : 'level',
    });
    if (saveData.seedHistory.length > SEED_HISTORY_CAP) {
      saveData.seedHistory = saveData.seedHistory.slice(-SEED_HISTORY_CAP);
    }
  }
  return saveData;
}

// Reads the save from localStorage (or the in-memory fallback), defensively
// normalized. Corrupt/missing JSON always yields a valid default shape —
// never throws. Migrates a legacy v1 blob on first sight (see header comment).
export function loadSave() {
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return normalizeSave(JSON.parse(raw));
      // No v2 blob: look for a v1 blob to migrate.
      const legacyRaw = localStorage.getItem(LEGACY_SAVE_KEY);
      if (legacyRaw) {
        const migrated = migrateV1(JSON.parse(legacyRaw));
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
        } catch (e) {
          // Persisting the migrated blob failed (quota etc.) — return it
          // anyway; the next successful saveSave will settle it.
        }
        return migrated;
      }
      return defaultSave();
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
