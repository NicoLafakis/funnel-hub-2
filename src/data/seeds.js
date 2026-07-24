// Seeded PRNG + seed derivation for V2's deterministic world generation
// (.wiki/tech-architecture.md §3): every level's district layout, props and
// goldens generate from (metro, district, seed) — same inputs ⇒ identical
// output, in every browser, so the daily challenge (seed = date) works with
// zero backend and soak tests can replay exact seeds.
//
// Pure JS, no DOM, no Math.random anywhere in generation — Math.imul-based
// integer math only, which is specified identically across engines.

// mulberry32: a tiny, well-distributed 32-bit PRNG (public-domain design by
// Tommy Ettinger). Returns a function producing floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a 32-bit string hash — stable across browsers (byte-wise imul), used
// to turn date strings / labels into seeds.
export function hashStr(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Per-level seed from the (metro, district) coordinate, both 0-based. The
// salt derives independent sub-streams from the same coordinate (0 = the
// level itself; daily challenges and layout sub-systems pass their own).
// Multiplier-xor mixing (golden-ratio-ish odd constants) so nearby
// coordinates never produce nearby seeds.
export function levelSeed(metroIndex, districtIndex, salt = 0) {
  const m = (Math.imul((metroIndex | 0) + 1, 0x9E3779B1)
    ^ Math.imul((districtIndex | 0) + 1, 0x85EBCA6B)
    ^ Math.imul((salt | 0) + 1, 0xC2B2AE35)) >>> 0;
  return m;
}

// Daily-challenge seed from a 'YYYY-MM-DD' string: one layout per day, same
// for every player, no backend (.wiki/content-and-meta.md §3).
export function dailySeed(dateStr) {
  return hashStr(`flywheel-daily:${dateStr}`);
}
