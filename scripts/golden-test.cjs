// Visual regression (tech-architecture.md §5): screenshots 5 fixed frames —
// title, world map, spawn L1, mid-L1 after 3s of scripted movement, and
// spawn L50 (via a save blob injected into localStorage before load) — and
// compares them against goldens in tests/golden/ with a small pixel
// tolerance. This is the tripwire for B8-class bugs (art or CSS landing
// without the other half).
//
// PNGs are decoded with a tiny hand-rolled decoder on top of Node's builtin
// zlib (no new npm deps): 8-bit grayscale/RGB/RGBA, non-interlaced — exactly
// what Playwright's screenshot encoder emits. Diff metric: the fraction of
// pixels whose worst channel moved by more than PIXEL_TOLERANCE, plus the
// mean absolute channel difference. The game animates continuously (vortex
// swirl shader, minimap, HUD), so an exact match is impossible even across
// identical runs — thresholds were calibrated at ~3x the run-to-run jitter
// measured on this machine (see the measure-only report printed per frame).
//
// Usage:
//   node scripts/golden-test.cjs            compare against goldens
//   node scripts/golden-test.cjs --update   (re)capture the goldens
//
// Expects the dev server on http://localhost:3003 (starts one itself if it
// finds the port closed, and shuts that one down again on exit).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');

function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_PATH) candidates.push(process.env.PLAYWRIGHT_PATH);
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'playwright'));
  candidates.push('playwright'); // local install / npm-link fallback
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (e) { /* try next */ }
  }
  throw new Error('playwright not resolvable (set PLAYWRIGHT_PATH, or npm i -g playwright)');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '..');
const GOLDEN_DIR = path.join(ROOT, 'tests', 'golden');
const BASE_URL = 'http://localhost:3003/';
const UPDATE = process.argv.includes('--update');

// Diff thresholds (see header): PIXEL_TOLERANCE is the per-channel "this
// pixel changed" cutoff; a frame passes when at most MAX_CHANGED_FRACTION of
// its pixels changed AND the mean channel diff stays under MAX_MEAN_DIFF.
const PROFILES = {
  // All frames compare tight: the deterministic frame driver (below) makes
  // even the scripted-movement gameplay frame bit-stable across runs, so
  // there is no jitter budget to hand out. Measured run-to-run noise after
  // the driver landed: <=0.05% of pixels, mean diff <=1.1.
  strict: { pixelTol: 32, maxChanged: 0.05, maxMean: 5, block: 1 },
  // Kept for any future live-gameplay frame that can't be made deterministic
  // (block-averaged color compare — catches black canvases, missing
  // ground/props/HUD and unstyled-overlay regressions only).
  coarse: { pixelTol: 28, maxChanged: 0.25, maxMean: 14, block: 24 },
};

// --- Minimal PNG decoder (builtin zlib only) --------------------------------
// Supports what Playwright emits: bitDepth 8, colorType 0/2/6, no interlace.
function decodePng(buffer) {
  const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG colorType ${colorType}`);
  if (bitDepth !== 8) throw new Error(`unsupported PNG bitDepth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNGs not supported');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4); // normalize to RGBA
  let prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rp]; rp += 1;
    raw.copy(cur, 0, rp, rp + stride); rp += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = cur[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
      cur[x] = v;
    }
    for (let x = 0; x < width; x += 1) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      if (colorType === 0) {
        out[di] = cur[si]; out[di + 1] = cur[si]; out[di + 2] = cur[si]; out[di + 3] = 255;
      } else {
        out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2];
        out[di + 3] = colorType === 6 ? cur[si + 3] : 255;
      }
    }
    prev = Buffer.from(cur);
  }
  return { width, height, data: out };
}

// Averages the RGBA image into block×block-pixel cells (block=1 is a no-op
// copy), returning a smaller image in the same {width,height,data} shape.
function downsample(img, block) {
  if (block <= 1) return img;
  const w = Math.max(1, Math.floor(img.width / block));
  const h = Math.max(1, Math.floor(img.height / block));
  const data = Buffer.alloc(w * h * 4);
  for (let by = 0; by < h; by += 1) {
    for (let bx = 0; bx < w; bx += 1) {
      let r = 0; let g = 0; let b = 0;
      for (let y = by * block; y < (by + 1) * block; y += 1) {
        for (let x = bx * block; x < (bx + 1) * block; x += 1) {
          const o = (y * img.width + x) * 4;
          r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2];
        }
      }
      const n = block * block;
      const o = (by * w + bx) * 4;
      data[o] = Math.round(r / n); data[o + 1] = Math.round(g / n);
      data[o + 2] = Math.round(b / n); data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function diffPngs(a, b, pixelTol) {
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: true, changedFraction: 1, meanDiff: 255 };
  }
  let changed = 0;
  let sum = 0;
  const pixels = a.width * a.height;
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    const d = Math.max(
      Math.abs(a.data[o] - b.data[o]),
      Math.abs(a.data[o + 1] - b.data[o + 1]),
      Math.abs(a.data[o + 2] - b.data[o + 2]),
    );
    sum += d;
    if (d > pixelTol) changed += 1;
  }
  return { sizeMismatch: false, changedFraction: changed / pixels, meanDiff: sum / pixels };
}

// --- Save blob for the L50 frame (schema v2, see src/meta/save.js) ----------
function level50SaveBlob() {
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
    unlockedLevel: 50,
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

// --- Server lifecycle ---------------------------------------------------------
async function ensureServer() {
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    return null; // already running; leave it alone
  } catch (e) { /* start our own */ }
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js')], {
    stdio: 'ignore',
    detached: false,
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

// --- Frame capture ------------------------------------------------------------
async function stabilize(page) {
  // Hide looping <video> elements (hero/win motion): pausing still leaves the
  // displayed frame dependent on decoder timing, which is exactly the jitter
  // this suite must not see. Also hide the transient gameplay overlays
  // (combo banners, toasts, lock badge, telegraph): they appear/disappear on
  // millisecond timers tied to eat events, so their presence in a capture is
  // nondeterministic even for identical runs. The persistent HUD, overlays
  // and canvas stay visible — those are what this suite guards.
  await page.evaluate(() => {
    document.querySelectorAll('video').forEach((v) => {
      try { v.pause(); } catch (e) {}
      v.style.visibility = 'hidden';
    });
    for (const id of ['banner', 'toasts', 'notifs', 'telegraph', 'lockBadge']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  });
}

// Deterministic frame driver: before any game script runs we replace
// requestAnimationFrame with a queue and performance.now with a virtual
// clock that advances exactly 1/60s per pumped frame (the game's dt comes
// from THREE.Clock -> performance.now). An interval auto-pumps frames during
// the browsing phases (title/map/intro); for the scripted-movement frame the
// test stops the auto-pump and pumps an EXACT frame count (180 frames =
// exactly 3.000s of game time), so the avatar path, eats, camera and HUD are
// bit-reproducible across runs and machines.
const FRAME_DRIVER_INIT = `(() => {
  let vnow = 1000;
  const queue = [];
  window.__rafQueue = queue;
  performance.now = () => vnow;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.__pumpFrames = (n) => {
    for (let i = 0; i < n; i += 1) {
      vnow += 1000 / 60;
      const q = queue.splice(0, queue.length);
      for (const cb of q) cb(vnow);
    }
  };
  window.__autoPump = setInterval(() => window.__pumpFrames(4), 16);
})();`;

async function newDrivenPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(FRAME_DRIVER_INIT);
  return page;
}

async function captureFrames(browser) {
  const frames = {};
  const page = await newDrivenPage(browser);

  // 1. Title.
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);
  await stabilize(page);
  frames.title = await page.screenshot();

  // 2. World map.
  await page.click('#startBtn');
  await page.waitForTimeout(1200);
  await stabilize(page);
  frames.map = await page.screenshot();

  // 3. Spawn L1.
  const levelNode = await page.$('.metro-card:not(.locked) .levelnode:not(.locked)');
  if (!levelNode) throw new Error('no unlocked level node on the map');
  await levelNode.click();
  await page.waitForTimeout(800);
  await page.click('#goBtn');
  await page.waitForTimeout(2500);
  await stabilize(page);
  frames['spawn-l1'] = await page.screenshot();

  // 4. Mid-L1 after exactly 3.000s of scripted movement (180 frames on the
  // virtual clock — deterministic; see FRAME_DRIVER_INIT).
  await page.evaluate(() => { clearInterval(window.__autoPump); window.__autoPump = null; });
  await page.keyboard.down('w');
  await page.waitForTimeout(150); // let the keydown land before pumping
  await page.evaluate(() => window.__pumpFrames(180));
  await page.keyboard.up('w');
  await page.evaluate(() => window.__pumpFrames(24)); // 0.4s settle
  await stabilize(page);
  frames['mid-l1'] = await page.screenshot();
  await page.close();

  // 5. Spawn L50 — save blob injected before any game script runs.
  const page50 = await newDrivenPage(browser);
  await page50.addInitScript((blob) => {
    window.localStorage.setItem('flywheel.save.v2', JSON.stringify(blob));
  }, level50SaveBlob());
  await page50.goto(BASE_URL, { waitUntil: 'load', timeout: 30000 });
  await page50.waitForTimeout(1500);
  await stabilize(page50);
  await page50.click('#startBtn');
  await page50.waitForTimeout(1200);
  const clicked = await page50.evaluate(() => {
    // The metro card containing level 50 auto-expands; click its 10th node.
    const cards = [...document.querySelectorAll('.metro-card:not(.locked)')];
    for (const card of cards) {
      const nodes = [...card.querySelectorAll('.levelnode:not(.locked)')];
      const last = nodes[nodes.length - 1];
      if (last && last.querySelector('.lvl-num') && last.querySelector('.lvl-num').textContent.trim() === '10'
        && card.querySelector('.metro-levels') && card.querySelector('.metro-levels').style.display !== 'none') {
        last.click();
        return true;
      }
    }
    return false;
  });
  if (!clicked) throw new Error('could not click the level-50 node on the map');
  await page50.waitForTimeout(800);
  await page50.click('#goBtn');
  await page50.waitForTimeout(2500);
  await stabilize(page50);
  frames['spawn-l50'] = await page50.screenshot();
  await page50.close();

  return frames;
}

// --- Main ---------------------------------------------------------------------
(async () => {
  const serverChild = await ensureServer();
  try {
    if (!fs.existsSync(GOLDEN_DIR)) fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    const browser = await chromium.launch();
    const frames = await captureFrames(browser);
    await browser.close();

    let failures = 0;
    for (const [name, buffer] of Object.entries(frames)) {
      const goldenPath = path.join(GOLDEN_DIR, `${name}.png`);
      if (UPDATE) {
        fs.writeFileSync(goldenPath, buffer);
        console.log(`  updated ${name}.png (${(buffer.length / 1024).toFixed(0)} KB)`);
        continue;
      }
      if (!fs.existsSync(goldenPath)) {
        console.log(`  ✗ FAIL: ${name}.png — no golden yet (run: node scripts/golden-test.cjs --update)`);
        failures += 1;
        continue;
      }
      const profile = PROFILES.strict;
      const current = downsample(decodePng(buffer), profile.block);
      const golden = downsample(decodePng(fs.readFileSync(goldenPath)), profile.block);
      const diff = diffPngs(current, golden, profile.pixelTol);
      const ok = !diff.sizeMismatch
        && diff.changedFraction <= profile.maxChanged
        && diff.meanDiff <= profile.maxMean;
      if (!ok) {
        failures += 1;
        // Keep the offending capture for inspection, next to the golden.
        fs.writeFileSync(path.join(GOLDEN_DIR, `${name}.actual.png`), buffer);
      }
      console.log(
        `  ${ok ? '✓' : '✗ FAIL:'} ${name}.png — changed ${(diff.changedFraction * 100).toFixed(2)}% of pixels`
        + ` (limit ${(profile.maxChanged * 100).toFixed(0)}%), mean diff ${diff.meanDiff.toFixed(2)}`
        + ` (limit ${profile.maxMean})${diff.sizeMismatch ? ' [SIZE MISMATCH]' : ''}`,
      );
    }
    console.log(failures ? `\nRESULT: ${failures} frame(s) differ beyond tolerance` : '\nRESULT: all 5 frames match their goldens');
    process.exitCode = failures ? 1 : 0;
  } finally {
    if (serverChild) serverChild.kill();
  }
})().catch((e) => { console.error('GOLDEN CRASH:', e); process.exit(2); });
