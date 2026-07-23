// Core difficulty-curve formulas for the 10-metro / 100-level rewrite.
// Exact shapes specified in docs/city-3d-redesign-plan.md — do not deviate.
// Pure functions, no browser/DOM APIs, safe to import in Node or in-browser.

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

export function rivalCount(n) {
  const t = tierOf(n);
  if (t === 'tutorial') return 0;
  if (t === 'first-contest') return 1;
  if (t === 'escalation') return n <= 15 ? 1 : 2;
  if (t === 'expert') return 2;
  if (t === 'master') return 3;
  return 3;
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
