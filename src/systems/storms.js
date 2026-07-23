// Sync-storm periodic event — ported from the current shipped 2D game's
// "sync storm" block (recovered from git history:
// `git show 97c9024:index.html`, the `stormT-=dt; if(stormT<=0){...}` block
// at lines ~715-731, seeded per-level at line ~454's
// `stormT = 12+Math.random()*8`). Rethemed for the 3D city setting as a
// delivery-truck rush-hour drop (falling crates/parcels work just as well
// per the task brief) — the underlying mechanic is unchanged: a scripted,
// periodic event that drops a cluster of extra edible objects, with a small
// per-item chance of being a golden(-value) drop.
//
// This module deliberately never touches propObjects/scene/camera/world
// size directly — createStormController() takes no required arguments, and
// update()'s only per-frame inputs are `dt` and a `spawnCallback`. Actually
// materializing objects (positions depend on world size + camera, both
// unknown here) and showing banner text are left to whichever later stage
// owns those — this module just fires `spawnCallback(event)` describing
// WHAT happened, with a `bannerText` field so that stage can hook the
// on-screen announcement without this module ever touching the DOM.
//
// No browser-only API is touched anywhere in this file, so a bare `import`
// of this file never throws in Node.

// EXACT numbers ported from the original:
//   - initial delay before a level's first storm: `12+Math.random()*8`
//     seconds (index.html:454, `stormT = 12+Math.random()*8`)
//   - interval between storms thereafter: `14+Math.random()*10` seconds
//     (index.html:717, `stormT=14+Math.random()*10`)
//   - drop size: 12 objects per storm (index.html:721, `for(let k=0;k<12;k++)`)
//   - per-item golden chance: 6% (index.html:723, `Math.random()<.06`)
const DEFAULT_INITIAL_DELAY_MIN = 12;
const DEFAULT_INITIAL_DELAY_JITTER = 8;
const DEFAULT_INTERVAL_MIN = 14;
const DEFAULT_INTERVAL_JITTER = 10;
const DEFAULT_DROP_COUNT = 12;
const DEFAULT_GOLDEN_CHANCE = 0.06;
const DEFAULT_BANNER_TEXT = '🚚 RUSH HOUR — DELIVERY TRUCKS INBOUND';
const DEFAULT_TAG = 'rush-hour-drop';

/**
 * @param {{
 *   intervalMin?: number, intervalJitter?: number,     // steady-state interval
 *   initialDelayMin?: number, initialDelayJitter?: number, // first-storm delay
 *   dropCount?: number,       // objects spawned per storm
 *   goldenChance?: number,    // per-item chance of a golden(-value) drop
 *   bannerText?: string,      // flavor text handed to spawnCallback
 *   tag?: string,             // machine-readable event tag
 * }} [opts]
 * @returns {{ update: (dt:number, spawnCallback?: (event:object)=>void) => void, timeRemaining: number }}
 */
export function createStormController(opts = {}) {
  const intervalMin = typeof opts.intervalMin === 'number' ? opts.intervalMin : DEFAULT_INTERVAL_MIN;
  const intervalJitter = typeof opts.intervalJitter === 'number' ? opts.intervalJitter : DEFAULT_INTERVAL_JITTER;
  const initialDelayMin = typeof opts.initialDelayMin === 'number' ? opts.initialDelayMin : DEFAULT_INITIAL_DELAY_MIN;
  const initialDelayJitter = typeof opts.initialDelayJitter === 'number' ? opts.initialDelayJitter : DEFAULT_INITIAL_DELAY_JITTER;
  const dropCount = typeof opts.dropCount === 'number' ? opts.dropCount : DEFAULT_DROP_COUNT;
  const goldenChance = typeof opts.goldenChance === 'number' ? opts.goldenChance : DEFAULT_GOLDEN_CHANCE;
  const bannerText = typeof opts.bannerText === 'string' ? opts.bannerText : DEFAULT_BANNER_TEXT;
  const tag = typeof opts.tag === 'string' ? opts.tag : DEFAULT_TAG;

  // EXACT initial-seed shape ported from the original's per-level
  // `buildLevel` (`stormT = 12+Math.random()*8`) — the first storm fires
  // sooner than the steady-state interval so every level gets at least one
  // before it ends.
  let timer = initialDelayMin + Math.random() * initialDelayJitter;

  return {
    get timeRemaining() {
      return timer;
    },
    update(dt, spawnCallback) {
      timer -= dt;
      if (timer > 0) return;

      // EXACT reseed shape ported from the original (`stormT=14+Math.random()*10`).
      timer = intervalMin + Math.random() * intervalJitter;

      const goldenFlags = Array.from({ length: dropCount }, () => Math.random() < goldenChance);

      if (typeof spawnCallback === 'function') {
        spawnCallback({
          tag,
          bannerText,
          count: dropCount,
          goldenFlags,
          // The original dropped storm objects from just above the
          // camera's viewport with downward velocity (index.html:724-728,
          // `o.y=Math.max(60,cam.y-H/2-40-Math.random()*120); o.vy=110+...`)
          // — in 3D that's a fall from a higher Y down onto the street, a
          // hint for whichever stage actually spawns the objects.
          dropFromAbove: true,
        });
      }
    },
  };
}
