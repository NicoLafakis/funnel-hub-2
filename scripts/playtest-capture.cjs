// Playtest session capture: boots Level 1 (Chicago), runs a scripted
// keyboard-control battery with rAF-accurate movement sampling, captures a
// screenshot set for graphics review, and dumps everything to
// shots/playtest/ (PNGs + metrics.json) for persona evaluation.
//
// Dev server must be running (npm start, :3003).
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join('shots', 'playtest');

function isNoise(text) {
  return /preload|AbortError|net::ERR_ABORTED|hero-motion|win-motion|favicon/i.test(text);
}

// In-page sampler: records avatar position + camera forward every rAF for
// `durationMs`. Returns samples on the page clock (performance.now()).
function sampleFor(page, durationMs) {
  return page.evaluate((dur) => new Promise((resolve) => {
    const { avatar, engine } = window.__fw;
    const pos = avatar.object3D.position;
    const cam = engine.camera;
    const t0 = performance.now();
    const samples = [];
    function tick() {
      const t = performance.now();
      const e = cam.matrixWorld.elements;
      // World forward = -Z column of the camera matrix.
      const fx = -e[8], fz = -e[10];
      const fl = Math.hypot(fx, fz) || 1;
      samples.push({ t: t - t0, x: pos.x, z: pos.z, fx: fx / fl, fz: fz / fl });
      if (t - t0 < dur) requestAnimationFrame(tick);
      else resolve(samples);
    }
    requestAnimationFrame(tick);
  }), durationMs);
}

// Analysis helpers (Node side).
function dist(a, b) { return Math.hypot(b.x - a.x, b.z - a.z); }

function speedSeries(samples) {
  const out = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000;
    out.push({ t: samples[i].t, v: dt > 0 ? dist(samples[i - 1], samples[i]) / dt : 0 });
  }
  return out;
}

function analyze(samples, keyUpAtMs) {
  const speeds = speedSeries(samples);
  const peak = speeds.reduce((m, s) => Math.max(m, s.v), 0);
  const moveThresh = Math.max(0.5, peak * 0.1);
  const firstMove = speeds.find((s) => s.v > moveThresh);
  // Stop time: first sample after keyUp where speed drops below threshold and stays.
  let stopMs = null;
  if (keyUpAtMs != null) {
    for (let i = 0; i < speeds.length; i++) {
      if (speeds[i].t < keyUpAtMs) continue;
      const rest = speeds.slice(i, i + 5);
      if (rest.length && rest.every((s) => s.v <= moveThresh)) { stopMs = speeds[i].t - keyUpAtMs; break; }
    }
  }
  return {
    peakSpeed: +peak.toFixed(2),
    timeToFirstMoveMs: firstMove ? +firstMove.t.toFixed(1) : null,
    stopAfterReleaseMs: stopMs != null ? +stopMs.toFixed(1) : null,
    distanceTotal: +speeds.reduce((d, s, i) => d + (i ? dist(samples[i - 1], samples[i]) : 0), 0).toFixed(2),
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // --use-angle=default routes WebGL to the real GPU (same trick as
  // scripts/perf-probe.cjs); without it headless falls back to software GL
  // and every timing metric is garbage.
  const browser = await chromium.launch({ args: ['--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => { if (!isNoise(String(e))) errors.push(`pageerror: ${e}`); });

  const metrics = { viewport: { w: 1440, h: 900 }, controls: {}, graphics: {}, errors };
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  // --- Boot funnel ---------------------------------------------------------
  // Fresh saves route Start straight into level 1 (meta/startup.js startRoute);
  // a save with any stars routes via world map -> intro. Capture whichever
  // funnel shows up, then backfill the skipped screens with a seeded save.
  await page.goto('http://localhost:3003/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1800);
  await shot('01-title');
  await page.click('#startBtn');
  await page.waitForTimeout(1500);

  const sawWorldMap = await page.$eval('#worldMapScreen', (el) => !el.classList.contains('hidden')).catch(() => false);
  metrics.freshBootRoute = sawWorldMap ? 'world-map' : 'straight-to-level-1';
  if (sawWorldMap) {
    await shot('02-worldmap');
    const levelNode = await page.$('.metro-card:not(.locked) .levelnode:not(.locked)');
    if (!levelNode) { console.log('FAIL: no unlocked level node'); process.exit(1); }
    await levelNode.click();
    await page.waitForTimeout(800);
    await shot('03-intro');
    await page.click('#goBtn');
  }
  await page.waitForTimeout(3000);
  await shot('04-spawn');

  const inPlay = await page.$eval('#hud', (el) => !el.classList.contains('hidden')).catch(() => false);
  if (!inPlay) { console.log('FAIL: HUD never appeared'); process.exit(1); }

  // Backfill world-map/intro shots if the fresh route skipped them.
  if (!sawWorldMap) {
    const seeded = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await seeded.addInitScript(() => {
      try {
        localStorage.setItem('flywheel.save.v2', JSON.stringify({
          version: 2, coins: 0, lifetimeCoins: 0, stars: { 1: 2 },
          upgrades: { size: 0, speed: 0, magnet: 0, time: 0, growth: 0 },
          builds: {}, skins: [], activeSkin: null, metroTokens: {}, metroPerks: {},
          tokenClaims: {}, rewardClaims: { firstClear: {}, starMilestones: {} },
          unlockedLevel: 2, collection: {}, collectionVariants: {}, legacyCollectionKeys: {},
          galleryCards: [],
          daily: { lastPlayedDate: null, attemptsLeft: 3, streak: 0, bestStreak: 0, lastWinDate: null, wins: 0, plays: 0 },
          seedHistory: [], achievements: [], bestCombo: 0,
          settings: { soundMuted: false, qualityMode: 'auto', resolvedQuality: null },
        }));
      } catch { /* storage unreachable: shots just missing */ }
    });
    await seeded.goto('http://localhost:3003/', { waitUntil: 'load', timeout: 30000 });
    await seeded.waitForTimeout(1500);
    await seeded.click('#startBtn');
    await seeded.waitForTimeout(1200);
    await seeded.screenshot({ path: path.join(OUT, '02-worldmap.png') });
    const node = await seeded.$('.metro-card:not(.locked) .levelnode:not(.locked)');
    if (node) {
      await node.click();
      await seeded.waitForTimeout(800);
      await seeded.screenshot({ path: path.join(OUT, '03-intro.png') });
    }
    await seeded.close();
  }

  metrics.hudVisible = await page.$eval('#hud', (el) => !el.classList.contains('hidden'));
  metrics.levelLabel = await page.$eval('body', () => {
    const el = document.querySelector('#levelName, #hudLevel, .hud-level');
    return el ? el.textContent : null;
  }).catch(() => null);

  // --- Idle perf sample (4s) ----------------------------------------------
  metrics.graphics.perfSpawn = await page.evaluate(() => new Promise((resolve) => {
    const frames = [];
    let last = performance.now();
    const t0 = last;
    function tick() {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (now - t0 < 4000) requestAnimationFrame(tick);
      else {
        frames.sort((a, b) => a - b);
        resolve({
          avgMs: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2),
          p95Ms: +frames[Math.floor(frames.length * 0.95)].toFixed(2),
          fps: +(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)).toFixed(1),
          snapshot: window.__fw.performanceSnapshot(),
        });
      }
    }
    requestAnimationFrame(tick);
  }));

  // --- Control battery ------------------------------------------------------
  // Generic key drive: hold `key` for holdMs, keep sampling trailMs after release.
  async function drive(key, holdMs = 1000, trailMs = 700) {
    const p = sampleFor(page, holdMs + trailMs);
    await page.waitForTimeout(60); // let sampler anchor a baseline frame
    await page.keyboard.down(key);
    await page.waitForTimeout(holdMs);
    const upAt = await page.evaluate(() => performance.now());
    await page.keyboard.up(key);
    const samples = await p;
    // keyUp happened at ~(60ms baseline + holdMs) on the sample clock.
    const keyUpAtMs = 60 + holdMs;
    return { samples, analysis: analyze(samples, keyUpAtMs) };
  }

  // W hold: latency, speed, stop time.
  const wRun = await drive('w', 1200, 800);
  metrics.controls.wHold = wRun.analysis;
  await shot('05-moving');

  // ArrowUp parity.
  const arrowRun = await drive('ArrowUp', 1000, 600);
  metrics.controls.arrowUp = arrowRun.analysis;

  // Diagonal W+D vs cardinal speed ratio (normalized => ~1.0 expected).
  const pd = sampleFor(page, 1300);
  await page.waitForTimeout(60);
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(1000);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  const diagSamples = await pd;
  metrics.controls.diagonal = analyze(diagSamples, null);
  metrics.controls.diagonalVsCardinalRatio = wRun.analysis.peakSpeed > 0
    ? +(metrics.controls.diagonal.peakSpeed / wRun.analysis.peakSpeed).toFixed(3) : null;

  // Q/E stepped orbit: camera yaw before/after one E press (~PI/4 expected).
  const yawOf = () => page.evaluate(() => {
    const e = window.__fw.engine.camera.matrixWorld.elements;
    return Math.atan2(-e[8], -e[10]);
  });
  const yawBefore = await yawOf();
  await page.keyboard.press('e');
  await page.waitForTimeout(700);
  const yawAfterE = await yawOf();
  await page.keyboard.press('q');
  await page.waitForTimeout(700);
  const yawAfterQ = await yawOf();
  const stepDeg = (a, b) => +(((b - a) * 180 / Math.PI + 540) % 360 - 180).toFixed(1);
  metrics.controls.orbitStepE_deg = stepDeg(yawBefore, yawAfterE);
  metrics.controls.orbitStepQ_deg = stepDeg(yawAfterE, yawAfterQ);

  // Orbit-180-then-W acceptance: rotate camera ~180 via E x4, hold W, verify
  // movement aligns with camera forward (away from camera).
  for (let i = 0; i < 4; i++) { await page.keyboard.press('e'); await page.waitForTimeout(450); }
  const pOrbit = sampleFor(page, 1400);
  await page.waitForTimeout(60);
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  const orbitSamples = await pOrbit;
  // Alignment of net displacement with mean camera forward during the hold.
  const held = orbitSamples.filter((s) => s.t > 100 && s.t < 950);
  if (held.length > 10) {
    const dx = held[held.length - 1].x - held[0].x;
    const dz = held[held.length - 1].z - held[0].z;
    const dl = Math.hypot(dx, dz) || 1;
    const mf = held.reduce((a, s) => ({ fx: a.fx + s.fx / held.length, fz: a.fz + s.fz / held.length }), { fx: 0, fz: 0 });
    const fl = Math.hypot(mf.fx, mf.fz) || 1;
    metrics.controls.orbit180ThenW = {
      dotWithCameraForward: +((dx / dl) * (mf.fx / fl) + (dz / dl) * (mf.fz / fl)).toFixed(3),
      moved: +(dl).toFixed(2),
    };
  }
  await shot('06-after-orbit-180-w');

  // Key-mash: alternate a/d rapidly, then release — must stop clean, no errors.
  const mashErrBefore = errors.length;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down(i % 2 ? 'a' : 'd');
    await page.waitForTimeout(45);
    await page.keyboard.up(i % 2 ? 'a' : 'd');
  }
  const pMash = sampleFor(page, 900);
  const mashSamples = await pMash;
  const mashSpeeds = speedSeries(mashSamples);
  const tailStill = mashSpeeds.slice(-10).every((s) => s.v < 0.5);
  metrics.controls.keyMash = {
    stopsCleanlyAfterRelease: tailStill,
    newErrorsDuringMash: errors.length - mashErrBefore,
    anyNaN: mashSamples.some((s) => !Number.isFinite(s.x) || !Number.isFinite(s.z)),
  };

  // Opposite keys (W+S) should cancel to ~zero movement.
  const pOpp = sampleFor(page, 900);
  await page.waitForTimeout(60);
  await page.keyboard.down('w');
  await page.keyboard.down('s');
  await page.waitForTimeout(600);
  await page.keyboard.up('s');
  await page.keyboard.up('w');
  const oppSamples = await pOpp;
  const oppA = oppSamples[0], oppB = oppSamples[oppSamples.length - 1];
  metrics.controls.oppositeKeysCancelDrift = +dist(oppA, oppB).toFixed(2);

  // --- Eating / gameplay feedback -------------------------------------------
  const scoreBefore = await page.$eval('#score', (el) => el.textContent);
  // Teleport next to small props and drive through them.
  await page.evaluate(() => {
    const { avatar, state } = window.__fw;
    const small = state.propObjects.find((p) => !p._eaten && p.kind && !p.kind.startsWith('building'));
    if (small) avatar.object3D.position.set(small.position.x - 20, 0, small.position.z);
  });
  await page.waitForTimeout(400);
  const pEat = sampleFor(page, 2500);
  await page.keyboard.down('w');
  await page.waitForTimeout(2200);
  await page.keyboard.up('w');
  await pEat;
  await shot('07-eating');
  const scoreAfter = await page.$eval('#score', (el) => el.textContent);
  metrics.eating = { scoreBefore, scoreAfter, grew: scoreBefore !== scoreAfter };

  // --- Graphics capture set ---------------------------------------------------
  // Building tier close-ups (chase cam follows avatar).
  for (const kind of ['building-large', 'building-medium', 'building-small']) {
    const found = await page.evaluate((k) => {
      const { avatar, state } = window.__fw;
      const b = state.propObjects.find((p) => p.kind === k && !p._eaten);
      if (!b) return false;
      avatar.object3D.position.set(b.position.x + b.radius * 3, 0, b.position.z + b.radius * 3);
      return true;
    }, kind);
    if (found) {
      await page.waitForTimeout(900);
      await shot(`08-${kind}`);
    }
  }

  // Vista from map edge.
  await page.evaluate(() => {
    const { avatar, state } = window.__fw;
    const half = (state.layout ? state.layout.world : 1200) / 2 - 80;
    avatar.object3D.position.set(-half, 0, -half);
  });
  await page.waitForTimeout(900);
  await shot('09-vista');

  // Ground-level detail: drop the camera low near the avatar.
  await page.evaluate(() => {
    const { avatar, engine } = window.__fw;
    const p = avatar.object3D.position;
    engine.camera.position.set(p.x + 30, 12, p.z + 30);
    engine.camera.lookAt(p.x, 0, p.z);
  });
  await page.waitForTimeout(300);
  await shot('10-ground-detail');

  // HUD + minimap crops.
  await shot('11-full-hud');
  const minimapInfo = await page.evaluate(() => {
    const el = document.querySelector('#minimap, .minimap, canvas[data-minimap]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  metrics.graphics.minimapPresent = !!minimapInfo;
  if (minimapInfo) {
    await page.screenshot({ path: path.join(OUT, '12-minimap.png'), clip: minimapInfo });
  }
  await page.screenshot({ path: path.join(OUT, '13-hud-strip.png'), clip: { x: 0, y: 0, width: 1440, height: 110 } });

  // Texture wiring dump (facades + ground), same idea as screenshot-city.cjs.
  metrics.graphics.wiring = await page.evaluate(() => {
    const { engine, state } = window.__fw;
    const facades = [];
    engine.scene.traverse((n) => {
      if (n.isInstancedMesh && n.name && n.name.startsWith('prop-field:building')) {
        facades.push(`${n.name} map=${n.material.map ? 'YES' : 'NO'} uv=${n.geometry.attributes.uv ? 'YES' : 'NO'}`);
      }
    });
    let ground = 'none';
    engine.scene.traverse((n) => {
      if (n.geometry && n.geometry.type === 'PlaneGeometry' && n.material) {
        ground = `map=${n.material.map ? 'YES' : 'NO'} size=${n.material.map && n.material.map.image ? n.material.map.image.width : '-'}`;
      }
    });
    return { facades, ground, propCount: state.propObjects.length };
  });

  metrics.errors = errors;
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
  console.log('shots + metrics in', OUT);
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('CAPTURE CRASH:', e); process.exit(2); });
