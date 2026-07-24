// Daily challenge (content-and-meta.md §3, tech-architecture.md §3): one level
// per day, seed = dailySeed(date) so everyone gets the same layout with zero
// backend. 3 attempts per day, streak counter in the save. The zero-backend
// retention engine.
//
// Pure logic, headless-testable: every function takes the save object plus an
// explicit `today` string ('YYYY-MM-DD') so tests inject dates freely. No DOM,
// no Date.now() on the read path.
//
// SEED RESOLUTION: src/data/seeds.js is created by a parallel workstream with
// the exact export `dailySeed('YYYY-MM-DD') -> uint32`. This module resolves it
// lazily (top-level dynamic import in a try/catch) so a bare import of this
// file never hard-fails while that file is absent; until it lands, a local
// deterministic FNV-1a fallback keeps the daily playable. Same date in => same
// seed out, always.

let resolvedDailySeed = null;
try {
  const seeds = await import('../data/seeds.js');
  if (seeds && typeof seeds.dailySeed === 'function') resolvedDailySeed = seeds.dailySeed;
} catch (e) {
  // seeds.js not landed yet — the fallback below covers it. Swallow
  // deliberately: this is an availability probe, not a real error path.
}

// FNV-1a over 'flywheel-daily:' + date — deterministic uint32 stopgap used only
// until src/data/seeds.js ships (see header).
function fallbackDailySeed(dateStr) {
  const s = `flywheel-daily:${dateStr}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const DAILY_ATTEMPTS = 3;
// Unlock cadence (content-and-meta.md §1): the daily unlocks at level 31.
export const DAILY_UNLOCK_LEVEL = 31;

// The seed for a date's daily level — feeds the seeded world generator.
export function dailyLevelSeed(today) {
  const dateStr = typeof today === 'string' ? today : '';
  if (resolvedDailySeed) return resolvedDailySeed(dateStr) >>> 0;
  return fallbackDailySeed(dateStr);
}

// 'YYYY-MM-DD' of the day BEFORE `today`, in UTC. Returns null for garbage in.
export function yesterdayOf(today) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const t = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(t - 86400000).toISOString().slice(0, 10);
}

function dailyOf(saveData) {
  const d = saveData && saveData.daily;
  return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
}

function ensureDaily(saveData) {
  if (!saveData.daily || typeof saveData.daily !== 'object' || Array.isArray(saveData.daily)) {
    saveData.daily = {
      lastPlayedDate: null, attemptsLeft: DAILY_ATTEMPTS, streak: 0, bestStreak: 0,
      lastWinDate: null, wins: 0, plays: 0,
    };
  }
  return saveData.daily;
}

// Read-only status for UI/world-map rendering. Rolls over attempt counts when
// the date changed, and reports the *effective* streak (a streak dies the
// moment a day is skipped, even before the next attempt is recorded).
export function getDailyStatus(saveData, today) {
  const d = dailyOf(saveData);
  const unlocked = !!(saveData && typeof saveData.unlockedLevel === 'number' && saveData.unlockedLevel >= DAILY_UNLOCK_LEVEL);
  if (!d) {
    return {
      unlocked, date: today, seed: dailyLevelSeed(today),
      attemptsLeft: DAILY_ATTEMPTS, attemptsUsed: 0, canAttempt: unlocked,
      streak: 0, bestStreak: 0, wins: 0, plays: 0, playedToday: false,
    };
  }
  const playedToday = d.lastPlayedDate === today;
  const attemptsLeft = playedToday
    ? Math.max(0, typeof d.attemptsLeft === 'number' ? d.attemptsLeft : DAILY_ATTEMPTS)
    : DAILY_ATTEMPTS;
  // Effective streak: zero if the last win is older than yesterday.
  const yesterday = yesterdayOf(today);
  const streakAlive = d.lastWinDate === today || d.lastWinDate === yesterday;
  const streak = streakAlive ? (typeof d.streak === 'number' ? d.streak : 0) : 0;
  return {
    unlocked,
    date: today,
    seed: dailyLevelSeed(today),
    attemptsLeft,
    attemptsUsed: DAILY_ATTEMPTS - attemptsLeft,
    canAttempt: unlocked && attemptsLeft > 0,
    streak,
    bestStreak: typeof d.bestStreak === 'number' ? d.bestStreak : 0,
    wins: typeof d.wins === 'number' ? d.wins : 0,
    plays: typeof d.plays === 'number' ? d.plays : 0,
    playedToday,
  };
}

export function canAttemptDaily(saveData, today) {
  return getDailyStatus(saveData, today).canAttempt;
}

// Consumes one attempt for `today`. Handles the day rollover (fresh date ->
// attempts reset; a skipped day kills the streak). Mutates saveData; returns
// { ok, attemptsLeft } — ok:false when no attempts remain.
export function recordDailyAttempt(saveData, today) {
  if (!saveData || typeof saveData !== 'object') return { ok: false, attemptsLeft: 0 };
  const d = ensureDaily(saveData);
  if (d.lastPlayedDate !== today) {
    // New day. A win older than yesterday means the streak is dead.
    if (d.lastWinDate !== yesterdayOf(today) && d.lastWinDate !== today) d.streak = 0;
    d.attemptsLeft = DAILY_ATTEMPTS;
    d.lastPlayedDate = today;
  }
  if (d.attemptsLeft <= 0) return { ok: false, attemptsLeft: 0 };
  d.attemptsLeft -= 1;
  d.plays = (typeof d.plays === 'number' ? d.plays : 0) + 1;
  return { ok: true, attemptsLeft: d.attemptsLeft };
}

// Records the outcome of a daily run. On a win: streak increments if yesterday
// was also won (or this is a fresh streak), bestStreak tracks the max. Losing
// does NOT break a streak — only skipping a day does. Mutates saveData;
// returns { won, streak, bestStreak, wins }.
export function recordDailyResult(saveData, today, result) {
  if (!saveData || typeof saveData !== 'object') return { won: false, streak: 0, bestStreak: 0, wins: 0 };
  const d = ensureDaily(saveData);
  const won = !!(result && result.won);
  if (won) {
    const wasAlive = d.lastWinDate === yesterdayOf(today) || d.lastWinDate === today;
    d.streak = wasAlive ? (typeof d.streak === 'number' ? d.streak : 0) + 1 : 1;
    d.lastWinDate = today;
    d.wins = (typeof d.wins === 'number' ? d.wins : 0) + 1;
    d.bestStreak = Math.max(typeof d.bestStreak === 'number' ? d.bestStreak : 0, d.streak);
  }
  return { won, streak: d.streak, bestStreak: d.bestStreak, wins: d.wins };
}
