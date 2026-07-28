// Closed-loop browser PLAY BOT — plays real levels end-to-end in a real
// headless Chromium, driving the game ONLY through real user input.
//
// WHY THIS EXISTS
// ---------------
// Two halves of a player already lived in this repo and had never been
// joined:
//   - scripts/soak-bot.js  is the BRAIN. Pure Node, no DOM/THREE: it
//     regenerates the district and simulates the REAL systems (swallow.js,
//     combo.js, rivals.js) with greedy nearest-edible routing. It can tell
//     you whether a level is completable — but it never touches the game the
//     player actually runs.
//   - scripts/flow-test.cjs is the HANDS. Real Playwright keyboard events
//     into src/engine/input.js — but it holds 'w' for four seconds and calls
//     it a day, so it proves the wiring exists, not that the game is
//     playable.
// This script is the join: every tick it READS world state out of the page,
// DECIDES a heading with soak-bot's greedy rule, and EXPRESSES that decision
// as nothing but page.keyboard / page.mouse events. What comes out the other
// end is player-fidelity evidence: if this bot cannot finish a level, a human
// pressing the same keys cannot either.
//
// THE HARD RULE (the entire value of this harness rests on it)
// ------------------------------------------------------------
// The bot may READ window.__fw freely. It must NEVER WRITE game state. No
// `avatar.mass = ...`, no `state.timer = ...`, no calling internal systems to
// manufacture progress. scripts/deep-flow-test.cjs does exactly that on
// purpose — it is a SCREEN test (does the done/fail/shop overlay render?) and
// is explicitly NOT player-fidelity evidence. The moment this file pokes
// state to "make the bot progress", it stops testing whether the game can be
// played and starts testing whether the game can be cheated. If a level
// cannot be finished without a poke, that is a FINDING to report, not a poke
// to write.
//
// THE MOST LIKELY FAILURE MODE: CAMERA-RELATIVE STEERING
// ------------------------------------------------------
// src/engine/input.js emits `move` as a normalized SCREEN-space vector
// (x > 0 = screen right, z < 0 = away from camera = W). The avatar's world
// velocity is that vector ROTATED BY THE CAMERA YAW
// (cameraRelativeMove: away -> (sin yaw, cos yaw), right -> (-cos yaw,
// sin yaw)). A bot that presses 'w' expecting world -Z walks in a circle the
// moment the player (or this bot) nudges the camera with Q/E. So every tick
// we fold the desired WORLD heading back through the LIVE chaseCamera.yaw
// with the exact inverse of that rotation, and only then quantize.
//
// WASD IS 8-DIRECTIONAL, NOT ANALOG. axesFromKeys() can only produce the 8
// compass headings, so the desired world vector is snapped to the nearest of
// them and RE-EVALUATED EVERY TICK — the per-tick re-aim is what turns 8
// coarse headings into a usable pursuit curve.
//
// GROUND TRUTH
// ------------
// soak-bot.js predicts, from the same seed, whether the level is winnable and
// roughly when. If the browser bot fails a level soak-bot says is winnable,
// that divergence is the single most valuable output of this whole harness —
// it means the simulated rules and the shipped game disagree — so it is
// surfaced loudly in the summary rather than buried in a pass/fail bit.
//
// USAGE
//   node scripts/play-bot.cjs [--level=N] [--profile=clean|sloppy]
//                             [--seed=N] [--timeout=MS] [--headed] [--shots]
//
// Expects the dev server on http://localhost:3003 (starts one itself if it
// finds the port closed, and shuts that one down again on exit) — the usual
// live-URL-only rule is explicitly waived for this script.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Playwright is installed GLOBALLY on this machine, not per-project. Same
// resolution ladder as golden-test.cjs (env override -> %APPDATA%\npm ->
// plain require) so all the browser scripts fail the same way if it is gone.
function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_PATH) candidates.push(process.env.PLAYWRIGHT_PATH);
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'playwright'));
  candidates.push('playwright');
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (e) { /* try next */ }
  }
  throw new Error('playwright not resolvable (set PLAYWRIGHT_PATH, or npm i -g playwright)');
}
const { chromium } = loadPlaywright();

// The gates the bot reasons with come from the REAL modules, never from
// copied literals — a tuning change to DEFAULT_SIZE_GATE must move the bot's
// idea of "edible" with it or the harness silently drifts away from the game
// it is supposed to be testing. Node's require(esm) support (>=22.12) lets a
// .cjs script pull these straight out of the ESM sources.
const { DEFAULT_SIZE_GATE } = require('../src/systems/swallow.js');
const { mulberry32 } = require('../src/data/seeds.js');
const { simulateLevel } = require('./soak-bot.js');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:3003/';
const SHOT_DIR = path.join(os.tmpdir(), 'fw-play-bot');

// Noise policy — copied VERBATIM from flow-test.cjs on purpose. Two browser
// harnesses disagreeing about what counts as an error is how a real error
// ends up ignored in one of them.
function isNoise(text) {
  return /preload|AbortError|net::ERR_ABORTED|hero-motion|win-motion|favicon/i.test(text);
}

// --- CLI ---------------------------------------------------------------------
function parseArgs(argv) {
  const out = {
    level: 1, profile: 'clean', seed: 12345, timeout: 180000, headed: false, shots: false,
  };
  for (const arg of argv) {
    const m = /^--([a-zA-Z]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'level') out.level = Math.max(1, Math.min(100, Number(value) || 1));
    else if (key === 'profile') out.profile = value === 'sloppy' ? 'sloppy' : 'clean';
    else if (key === 'seed') out.seed = Number(value) >>> 0;
    else if (key === 'timeout') out.timeout = Math.max(10000, Number(value) || 180000);
    else if (key === 'headed') out.headed = true;
    else if (key === 'shots') out.shots = true;
  }
  return out;
}

// --- Server lifecycle (same pattern as golden-test.cjs) -----------------------
async function ensureServer() {
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    return null; // already running; leave it alone
  } catch (e) { /* start our own */ }
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js')], {
    stdio: 'ignore', detached: false,
  });
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(BASE_URL, { signal: AbortSignal.timeout(1000) });
      return child;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  child.kill();
  throw new Error('dev server did not come up on :3003');
}

// --- Save blob ----------------------------------------------------------------
// The world map only renders nodes the save says are unlocked, and the metro
// card containing `unlockedLevel` auto-expands (src/meta/worldmap.js). So the
// cheapest honest way to reach level N as a player would is to seed a save
// that has N unlocked and then CLICK the node — the bot still navigates the
// real menus, it just doesn't have to grind 40 levels first. This is save
// state, not game state: it is written before any game script runs and never
// touched again once play begins.
function saveBlob(unlockedLevel) {
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
    unlockedLevel,
    collection: {},
    collectionVariants: {},
    galleryCards: [],
    daily: {
      lastPlayedDate: null, attemptsLeft: 3, streak: 0, bestStreak: 0,
      lastWinDate: null, wins: 0, plays: 0,
    },
    seedHistory: [],
    achievements: [],
    bestCombo: 0,
  };
}

// --- Steering math -------------------------------------------------------------
// The 8 headings axesFromKeys() can produce, in screen space, indexed by
// 45°-steps of atan2(right, away). Index 0 is straight away from the camera.
const DIR_KEYS = [
  ['w'], ['w', 'd'], ['d'], ['s', 'd'], ['s'], ['s', 'a'], ['a'], ['w', 'a'],
];

// EXACT inverse of input.js's cameraRelativeMove(): given a desired WORLD
// direction and the live camera yaw, return the screen-space intent that
// would produce it. Kept as its own function (rather than inlined) because it
// is the one piece of math that, if wrong, makes the bot walk in circles
// while looking superficially alive — it is verified empirically at startup
// by the calibration probe below.
function worldDirToScreen(dx, dz, yaw) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return { away: dx * s + dz * c, right: -dx * c + dz * s };
}

// Nearest of the 8 WASD headings to a screen-space (right, away) vector.
function snapDirIndex(right, away) {
  const angle = Math.atan2(right, away);
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

// Rotate a world direction by `rad` — used only by the sloppy profile's
// heading overshoot / wrong turns.
function rotate(dx, dz, rad) {
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  return { dx: dx * c - dz * s, dz: dx * s + dz * c };
}

// --- In-page readers -----------------------------------------------------------
// Everything below runs inside the page and is STRICTLY read-only. Target
// selection happens in here rather than in Node deliberately: a level can
// hold thousands of props, and shipping the whole roster across the CDP
// bridge 15 times a second would make the bot's own observation the dominant
// cost of the run. The DECISION RULE itself is soak-bot's, ported verbatim:
//   1. the capstone the moment its own gate lets it be eaten (it is both the
//      best meal and, on gated levels, the finish line), else
//   2. the nearest prop whose radius fits under r * DEFAULT_SIZE_GATE,
//   3. and if nothing at all is edible, camp the capstone — the size gate may
//      still open as the avatar grows.
const READ_STATE = (gate) => {
  const fw = window.__fw;
  if (!fw) return { ready: false };
  const { avatar, chaseCamera, state } = fw;
  const r = avatar.radius();
  const pos = avatar.position;
  const props = state.propObjects || [];

  let capstone = null;
  let best = null;
  let bestDistSq = Infinity;
  const limit = r * gate;
  for (let i = 0; i < props.length; i += 1) {
    const obj = props[i];
    if (obj.isCapstone) { capstone = obj; continue; }
    if (obj.hazard) continue;
    if (obj.radius > limit) continue;
    const dx = obj.position.x - pos.x;
    const dz = obj.position.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) { bestDistSq = d2; best = obj; }
  }

  let target = null;
  let targetKind = 'none';
  if (
    capstone
    && typeof capstone.capstoneGate === 'number'
    && capstone.capstoneGate > 0
    && capstone.radius <= r * capstone.capstoneGate
  ) {
    target = capstone;
    targetKind = 'capstone';
  } else if (best) {
    target = best;
    targetKind = 'prop';
  } else if (capstone) {
    target = capstone;
    targetKind = 'capstone-camp'; // nothing edible; wait out the size gate
  }

  return {
    ready: true,
    mode: state.mode,
    timer: state.timer,
    levelTime: state.level ? state.level.time : null,
    levelTarget: state.level ? state.level.target : null,
    mass: avatar.mass,
    radius: r,
    x: pos.x,
    z: pos.z,
    yaw: chaseCamera.yaw,
    propCount: props.length,
    edibleCount: best ? 1 : 0, // cheap "is anything edible" flag, not a census
    capstoneEdible: !!state.capstoneEdible,
    capstoneEaten: !!state.capstoneEaten,
    targetKind,
    tx: target ? target.position.x : null,
    tz: target ? target.position.z : null,
  };
};

// --- The bot -------------------------------------------------------------------
async function run(opts) {
  const wallStart = Date.now();
  const rng = mulberry32(opts.seed >>> 0);
  const sloppy = opts.profile === 'sloppy';
  const errors = [];
  const notes = [];
  let shotIndex = 0;

  // Ground truth first: the sim is cheap and its verdict frames everything
  // the browser run reports afterwards.
  const truth = simulateLevel(opts.level);

  const browser = await chromium.launch({ headless: !opts.headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isNoise(msg.text())) errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    if (!isNoise(String(err))) errors.push(`pageerror: ${err}`);
  });

  const shot = async (name) => {
    if (!opts.shots) return;
    if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
    shotIndex += 1;
    await page.screenshot({ path: path.join(SHOT_DIR, `${String(shotIndex).padStart(3, '0')}-${name}.png`) });
  };

  await page.addInitScript((blob) => {
    window.localStorage.setItem('flywheel.save.v2', JSON.stringify(blob));
  }, saveBlob(opts.level));

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  // --- Navigate like a player: title -> map -> level node -> intro -> play ---
  await page.click('#startBtn');
  await page.waitForTimeout(1200);
  await shot('worldmap');

  // Levels are laid out ten-per-metro-card in order, and the card holding
  // `unlockedLevel` auto-expands, so level N is node (N-1)%10 of card
  // floor((N-1)/10). Locating it by position rather than by label keeps this
  // working if the node's inner markup changes.
  const cardIndex = Math.floor((opts.level - 1) / 10);
  const nodeIndex = (opts.level - 1) % 10;
  const node = page.locator('.metro-card').nth(cardIndex).locator('.levelnode').nth(nodeIndex);
  await node.click({ timeout: 10000 });
  await page.waitForTimeout(800);
  await shot('intro');

  await page.click('#goBtn');
  await page.waitForTimeout(2500);
  await shot('spawn');

  // --- Calibration probe: verify 'w' moves where we predict ------------------
  // Before ANY pursuit logic runs, press 'w' for a beat and check the observed
  // world displacement against cameraRelativeMove's prediction for the live
  // yaw. If the sign convention were wrong the bot would still look busy while
  // walking in circles, and the whole run would be a confident lie — so this
  // failure is reported rather than swallowed.
  const pre = await page.evaluate(READ_STATE, DEFAULT_SIZE_GATE);
  if (!pre.ready) throw new Error('window.__fw not present after entering play');
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await page.waitForTimeout(200);
  const post = await page.evaluate(READ_STATE, DEFAULT_SIZE_GATE);
  const obsX = post.x - pre.x;
  const obsZ = post.z - pre.z;
  const obsLen = Math.hypot(obsX, obsZ);
  const predX = Math.sin(pre.yaw);
  const predZ = Math.cos(pre.yaw);
  const cosErr = obsLen > 1e-6 ? (obsX * predX + obsZ * predZ) / obsLen : 0;
  const calibrated = obsLen > 1 && cosErr > 0.9;
  notes.push(
    `calibration: 'w' moved ${obsLen.toFixed(1)}u, alignment with predicted `
    + `(sin yaw, cos yaw) = ${cosErr.toFixed(3)} -> ${calibrated ? 'OK' : 'MISMATCH'}`,
  );

  // --- Play loop -------------------------------------------------------------
  const TICK_MS = 66;               // ~15 Hz of decisions against a 60 Hz game
  const STUCK_WINDOW_MS = 1500;     // no meaningful motion for this long = stuck
  const STUCK_MIN_MOVE = 12;        // world units; below this counts as "not moving"
  const held = new Set();
  let longestStuckMs = 0;
  let stuckSinceMs = 0;
  let stuckEvents = 0;
  let escapeUntil = 0;
  let escapeAngle = 0;
  let idleUntil = 0;              // sloppy: hands-off-the-keyboard pause
  let wrongTurnUntil = 0;         // sloppy: committed-to-a-bad-heading window
  let wrongTurnAngle = 0;
  let nextDecisionMs = 0;         // sloppy: reaction-time gate (see below)
  let appliedDirIndex = -1;
  let lastPos = { x: pre.x, z: pre.z };
  let lastStuckCheck = Date.now();
  let startMass = pre.mass;
  let maxMass = pre.mass;
  let ticks = 0;
  let lastShotMs = 0;
  let endState = null;

  const setKeys = async (keys) => {
    for (const k of [...held]) {
      if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    }
    for (const k of keys) {
      if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    }
  };

  const deadline = wallStart + opts.timeout;
  while (Date.now() < deadline) {
    const s = await page.evaluate(READ_STATE, DEFAULT_SIZE_GATE);
    ticks += 1;
    if (!s.ready) break;
    if (s.mode !== 'play') { endState = s; break; }
    maxMass = Math.max(maxMass, s.mass);

    const now = Date.now();

    // --- stuck accounting (measured on OBSERVED motion, not on intent) ------
    if (now - lastStuckCheck >= STUCK_WINDOW_MS) {
      const moved = Math.hypot(s.x - lastPos.x, s.z - lastPos.z);
      if (moved < STUCK_MIN_MOVE && held.size > 0) {
        if (stuckSinceMs === 0) { stuckSinceMs = lastStuckCheck; stuckEvents += 1; }
        longestStuckMs = Math.max(longestStuckMs, now - stuckSinceMs);
        // Escape: commit to a random heading for ~0.5s. A bot that keeps
        // re-deriving the SAME blocked heading every tick would report a
        // stuck level that a human would walk out of in one sidestep.
        escapeAngle = rng() * Math.PI * 2;
        escapeUntil = now + 500;
      } else {
        stuckSinceMs = 0;
      }
      lastPos = { x: s.x, z: s.z };
      lastStuckCheck = now;
    }

    // --- decide a world heading --------------------------------------------
    let dx;
    let dz;
    if (now < escapeUntil) {
      dx = Math.cos(escapeAngle);
      dz = Math.sin(escapeAngle);
    } else if (s.tx === null) {
      // Nothing edible AND no capstone left: the district is picked clean.
      // Sweep rather than freeze so the run ends on the timer, not on a
      // motionless bot that would read as "stuck".
      const a = (now / 3000) % (Math.PI * 2);
      dx = Math.cos(a);
      dz = Math.sin(a);
    } else {
      dx = s.tx - s.x;
      dz = s.tz - s.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
    }

    // --- sloppy profile: deliberately human-bad input ----------------------
    // This profile exists to surface "player got stuck / couldn't tell what
    // was edible" bugs that a frame-perfect bot never hits. All noise is
    // drawn from the seeded PRNG so any failure reproduces exactly from
    // --seed.
    let dirIndex;
    if (sloppy) {
      if (now < idleUntil) {
        await setKeys([]);
        await page.waitForTimeout(TICK_MS);
        continue;
      }
      // REACTION TIME, modelled as a decision GATE rather than a queue.
      // The first cut of this queued each new heading behind a fresh
      // 100-250ms delay — but the overshoot below re-rolls the heading every
      // tick, so the queued value never stopped changing and the delay never
      // elapsed: the bot livelocked with its hands off the keys and "lost"
      // level 1 with 85 of 1000 mass. That was a harness bug masquerading as
      // a soak-bot divergence, which is exactly the kind of false signal this
      // script must not emit. So instead: between decisions the bot KEEPS ITS
      // KEYS DOWN and simply does not re-aim, which is what a laggy human
      // actually does — it acts on stale information rather than on nothing.
      if (now < nextDecisionMs) {
        await page.waitForTimeout(TICK_MS);
        continue;
      }
      nextDecisionMs = now + 100 + rng() * 150;
      if (now >= wrongTurnUntil && rng() < 0.10) {
        wrongTurnAngle = (rng() - 0.5) * Math.PI * 1.5; // a real misread, not a wobble
        wrongTurnUntil = now + 300 + rng() * 400;
      }
      if (rng() < 0.04) { idleUntil = now + 300 + rng() * 600; }
      let ang = (rng() - 0.5) * 0.7;                    // heading overshoot
      if (now < wrongTurnUntil) ang += wrongTurnAngle;
      const r2 = rotate(dx, dz, ang);
      dx = r2.dx; dz = r2.dz;
      // Occasional camera nudge (Q/E). This is not noise for its own sake:
      // it is the cheapest way to prove the camera-relative conversion holds
      // at a yaw the calibration probe never saw.
      if (rng() < 0.01) {
        await page.keyboard.press(rng() < 0.5 ? 'q' : 'e');
      }
    }

    const screen = worldDirToScreen(dx, dz, s.yaw);
    dirIndex = snapDirIndex(screen.right, screen.away);

    if (dirIndex !== appliedDirIndex) {
      await setKeys(DIR_KEYS[dirIndex]);
      appliedDirIndex = dirIndex;
    }

    if (opts.shots && now - lastShotMs > 4000) {
      lastShotMs = now;
      await shot(`play-${Math.round(s.mass)}`);
    }

    await page.waitForTimeout(TICK_MS);
  }

  await setKeys([]);
  await page.waitForTimeout(300);
  const final = endState || await page.evaluate(READ_STATE, DEFAULT_SIZE_GATE);
  await shot(`end-${final.mode || 'unknown'}`);
  const wallMs = Date.now() - wallStart;
  await browser.close();

  return {
    truth,
    calibrated,
    notes,
    errors,
    ticks,
    wallMs,
    startMass,
    finalMass: Math.max(maxMass, final.mass || 0),
    levelTarget: final.levelTarget || (pre && pre.levelTarget),
    levelTime: final.levelTime || (pre && pre.levelTime),
    inGameElapsed: (pre.levelTime != null && final.timer != null)
      ? pre.levelTime - final.timer
      : null,
    mode: final.mode,
    capstoneEaten: final.capstoneEaten,
    propsRemaining: final.propCount,
    longestStuckMs,
    stuckEvents,
    timedOut: Date.now() >= deadline && final.mode === 'play',
  };
}

// --- Main ----------------------------------------------------------------------
(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const serverChild = await ensureServer();
  let res;
  try {
    res = await run(opts);
  } finally {
    if (serverChild) serverChild.kill();
  }

  const sloppy = opts.profile === 'sloppy';
  const won = res.mode === 'done' || res.mode === 'win';
  const lost = res.mode === 'fail';
  const massGrew = res.finalMass > res.startMass;

  const failures = [];
  if (res.errors.length) failures.push(`${res.errors.length} console/page error(s)`);
  if (!won && !lost) failures.push(`level neither won nor lost — ended in mode "${res.mode}"${res.timedOut ? ' (HANG: wall-clock timeout with the level still running)' : ''}`);
  if (!massGrew) failures.push('avatar mass did not increase over the run');
  if (!res.calibrated) failures.push("steering calibration failed ('w' did not move the avatar where camera yaw predicts)");

  console.log('');
  console.log('=== PLAY BOT ===================================================');
  console.log(`  level ${opts.level} · profile ${opts.profile} · seed ${opts.seed}`);
  res.notes.forEach((n) => console.log(`  ${n}`));
  console.log(`  outcome        : ${res.mode}${won ? ' (WIN)' : lost ? ' (LOSS)' : ' (NO RESOLUTION)'}`);
  console.log(`  mass           : ${res.startMass.toFixed(0)} -> ${res.finalMass.toFixed(0)} of target ${res.levelTarget}`);
  console.log(`  capstone eaten : ${res.capstoneEaten}`);
  console.log(`  props left     : ${res.propsRemaining}`);
  console.log(`  in-game time   : ${res.inGameElapsed === null ? 'n/a' : `${res.inGameElapsed.toFixed(1)}s of ${res.levelTime}s`}`);
  console.log(`  wall clock     : ${(res.wallMs / 1000).toFixed(1)}s over ${res.ticks} decision ticks`);
  console.log(`  longest stuck  : ${res.longestStuckMs}ms (${res.stuckEvents} stuck episode(s))`);
  console.log(`  errors         : ${res.errors.length}`);
  res.errors.forEach((e) => console.log(`     ${e}`));

  // --- soak-bot divergence -----------------------------------------------------
  console.log('  --- ground truth (scripts/soak-bot.js, same seed) ---');
  console.log(`  sim says       : ${res.truth.completed ? `WINNABLE in ~${res.truth.completionTime.toFixed(1)}s` : 'NOT completable by the greedy bot'}`
    + ` (final mass ${res.truth.finalMass.toFixed(0)} / ${res.truth.target})`);
  // The sim models a PERFECT greedy bot with zero reaction time. The sloppy
  // profile is deliberately worse than that, so "sloppy lost what the sim
  // wins" is the profile working as designed, not a rules disagreement — it
  // is reported as a margin, never as a divergence, or the alarm would cry
  // wolf on every sloppy run and stop meaning anything on a clean one.
  let divergence = null;
  if (sloppy) {
    const pct = res.levelTarget ? (100 * res.finalMass) / res.levelTarget : 0;
    console.log(`  sloppy margin  : reached ${pct.toFixed(0)}% of target`
      + ` (a sloppy loss is expected; only a CLEAN loss is a divergence)`);
  } else if (res.truth.completed && !won) {
    divergence = 'BROWSER BOT FAILED A LEVEL THE SIM SAYS IS WINNABLE';
  } else if (!res.truth.completed && won) {
    divergence = 'browser bot WON a level the sim says is not completable (sim is pessimistic here)';
  }
  if (divergence) {
    console.log('');
    console.log('  ****************************************************************');
    console.log(`  ** SOAK-BOT DIVERGENCE: ${divergence}`);
    console.log('  ** The simulated rules and the shipped game disagree. This is');
    console.log('  ** the highest-value signal this harness produces.');
    console.log('  ****************************************************************');
  }
  // Only the pessimistic direction is a failure: the sim is deliberately
  // conservative (no vacuum assist, no storm drops), so the browser bot
  // beating it is expected, while the browser bot LOSING what the sim wins
  // means the shipped game is harder than its own model.
  if (!sloppy && res.truth.completed && !won) failures.push('soak-bot divergence (sim winnable, browser lost)');

  console.log('');
  console.log(failures.length ? `RESULT: FAIL — ${failures.join('; ')}` : 'RESULT: PASS');
  console.log('================================================================');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('PLAY BOT CRASH:', e); process.exit(2); });
