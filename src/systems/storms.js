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

// V2 flag-gated behaviors (content-and-meta.md §1 unlock cadence), off by
// default so V1 behavior is byte-identical when the level def's flags are
// absent. main.js maps level-def flags onto these opts:
//   - hazardCargo (L36+): some dropped crates are HAZARDS, not food — the
//     event gains a `hazardFlags` array (true = dangerous cargo; a hazard is
//     never also golden). The spawner owns what "hazard" means visually and
//     gameplay-wise; this module just deals the flags.
//   - surges (L56+): every storm is followed SURGE_DELAY seconds later by a
//     second, smaller wave (tag suffixed '-surge', `surge: true` on the
//     event) — the "storm surge" beat.
const DEFAULT_HAZARD_CHANCE = 0.25;
const SURGE_DELAY = 3;
const SURGE_FRACTION = 0.5;
const DEFAULT_SURGE_BANNER_TEXT = '⚡ STORM SURGE — SECOND WAVE INBOUND';

/**
 * @param {{
 *   intervalMin?: number, intervalJitter?: number,     // steady-state interval
 *   initialDelayMin?: number, initialDelayJitter?: number, // first-storm delay
 *   dropCount?: number,       // objects spawned per storm
 *   goldenChance?: number,    // per-item chance of a golden(-value) drop
 *   bannerText?: string,      // flavor text handed to spawnCallback
 *   tag?: string,             // machine-readable event tag
 *   hazardCargo?: boolean,    // V2 flag (L36+): deal hazardFlags with each event
 *   hazardChance?: number,    // per-item hazard chance when hazardCargo is on
 *   surges?: boolean,         // V2 flag (L56+): follow-up second wave per storm
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
  const hazardCargo = opts.hazardCargo === true;
  const hazardChance = typeof opts.hazardChance === 'number' ? opts.hazardChance : DEFAULT_HAZARD_CHANCE;
  const surges = opts.surges === true;

  // EXACT initial-seed shape ported from the original's per-level
  // `buildLevel` (`stormT = 12+Math.random()*8`) — the first storm fires
  // sooner than the steady-state interval so every level gets at least one
  // before it ends.
  let timer = initialDelayMin + Math.random() * initialDelayJitter;

  // Countdown to a pending surge wave (surges flag only); null = none armed.
  let surgeTimer = null;

  // Deals one drop event. Golden and hazard flags are mutually exclusive —
  // a hazard crate is never a jackpot.
  function dealEvent(count, isSurge) {
    const goldenFlags = [];
    const hazardFlags = [];
    for (let i = 0; i < count; i += 1) {
      const golden = Math.random() < goldenChance;
      const hazard = hazardCargo && !golden && Math.random() < hazardChance;
      goldenFlags.push(golden && !hazard);
      hazardFlags.push(hazard);
    }
    const event = {
      tag: isSurge ? `${tag}-surge` : tag,
      bannerText: isSurge ? DEFAULT_SURGE_BANNER_TEXT : bannerText,
      count,
      goldenFlags,
      surge: isSurge,
      // The original dropped storm objects from just above the
      // camera's viewport with downward velocity (index.html:724-728,
      // `o.y=Math.max(60,cam.y-H/2-40-Math.random()*120); o.vy=110+...`)
      // — in 3D that's a fall from a higher Y down onto the street, a
      // hint for whichever stage actually spawns the objects.
      dropFromAbove: true,
    };
    // Only present when the level flag is on, so V1 consumers see no change.
    if (hazardCargo) event.hazardFlags = hazardFlags;
    return event;
  }

  return {
    get timeRemaining() {
      return timer;
    },
    update(dt, spawnCallback) {
      // A surge wave is independent of the main storm timer.
      if (surgeTimer !== null) {
        surgeTimer -= dt;
        if (surgeTimer <= 0) {
          surgeTimer = null;
          if (typeof spawnCallback === 'function') {
            spawnCallback(dealEvent(Math.max(1, Math.ceil(dropCount * SURGE_FRACTION)), true));
          }
        }
      }

      timer -= dt;
      if (timer > 0) return;

      // EXACT reseed shape ported from the original (`stormT=14+Math.random()*10`).
      timer = intervalMin + Math.random() * intervalJitter;

      if (surges) surgeTimer = SURGE_DELAY;

      if (typeof spawnCallback === 'function') {
        spawnCallback(dealEvent(dropCount, false));
      }
    },
  };
}
