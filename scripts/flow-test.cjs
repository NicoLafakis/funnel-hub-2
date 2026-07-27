// Scripted flow: SPIN IT UP -> world map -> level 1 -> play -> move -> verify.
const path = require('path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const OUT = require('os').tmpdir();

function isNoise(text) {
  return /preload|AbortError|net::ERR_ABORTED|hero-motion|win-motion|favicon/i.test(text);
}

// --- HUD readout parsing ---------------------------------------------------
//
// #score renders through src/ui/format.js's formatCompact(), which emits an
// integer below 1000 and 3 significant figures with a k/M/B suffix at or above
// it ("250", "1.25k", "12.4k", "124k", "1.25M"). It provably never emits a
// thousands separator — the suffix replaces them — so none is handled here;
// if one ever appears, the anchored match below will FAIL rather than quietly
// parse "1" out of "1,250".
//
// Both patterns are FULLY ANCHORED on purpose. A loose regex that matched a
// prefix would return a confidently wrong number ("1.25k" -> 1) and the test
// would report a passing assertion against garbage. A parse failure here is a
// real signal — it means the HUD format changed — so it is surfaced as a hard
// failure at the call site rather than swallowed.
const HUD_NUMBER = /^(\d+(?:\.\d+)?)([kMB]?)$/;
const SUFFIX_SCALE = { '': 1, k: 1e3, M: 1e6, B: 1e9 };

// "1.25k" -> 1250. Returns null (never a partial value) if the token is not
// exactly one well-formed number, suffix optional.
function parseHudNumber(token) {
  const m = HUD_NUMBER.exec(String(token).trim());
  if (!m) return null;
  const value = parseFloat(m[1]) * SUFFIX_SCALE[m[2]];
  return Number.isFinite(value) ? value : null;
}

// "Mass 1.25k / 10.0k" -> { mass: 1250, target: 10000 }. Tolerates the <b>
// wrapper around the mass (textContent already strips it; innerHTML would
// not) and any whitespace shape. Returns null if the whole readout does not
// match, so the caller can fail loudly.
function parseMassReadout(raw) {
  const text = String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^Mass (\S+) \/ (\S+)$/.exec(text);
  if (!m) return null;
  const mass = parseHudNumber(m[1]);
  const target = parseHudNumber(m[2]);
  if (mass === null || target === null) return null;
  return { mass, target, text };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isNoise(msg.text())) errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    if (!isNoise(String(err))) errors.push(`pageerror: ${err}`);
  });

  await page.goto('http://localhost:3003/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Start -> world map.
  await page.click('#startBtn');
  await page.waitForTimeout(1200);
  const mapVisible = await page.$eval('#worldMapScreen', (el) => !el.classList.contains('hidden'));
  await page.screenshot({ path: path.join(OUT, 'fw-flow-1-worldmap.png') });
  console.log('worldMapVisible:', mapVisible);

  // Level 1 node: first metro card should be auto-expanded; click node "1".
  const levelNode = await page.$('.metro-card:not(.locked) .levelnode:not(.locked)');
  if (!levelNode) { console.log('FAIL: no unlocked level node'); process.exit(1); }
  await levelNode.click();
  await page.waitForTimeout(800);
  const introVisible = await page.$eval('#introScreen', (el) => !el.classList.contains('hidden'));
  await page.screenshot({ path: path.join(OUT, 'fw-flow-2-intro.png') });
  console.log('introVisible:', introVisible);

  // DIVE IN -> play.
  await page.click('#goBtn');
  await page.waitForTimeout(2500);
  const hudVisible = await page.$eval('#hud', (el) => !el.classList.contains('hidden'));
  console.log('hudVisible:', hudVisible);
  await page.screenshot({ path: path.join(OUT, 'fw-flow-3-spawn.png') });

  const hudBefore = await page.$eval('#score', (el) => el.textContent);

  // Simulate ~4s of WASD movement (hold W, then weave A/D).
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.down('a');
  await page.waitForTimeout(700);
  await page.keyboard.up('a');
  await page.keyboard.down('d');
  await page.waitForTimeout(700);
  await page.keyboard.up('d');
  await page.waitForTimeout(1200);
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'fw-flow-4-moved.png') });

  const hudAfter = await page.$eval('#score', (el) => el.textContent);
  const timerAfter = await page.$eval('#timer', (el) => el.textContent);
  console.log('hud before:', JSON.stringify(hudBefore));
  console.log('hud after :', JSON.stringify(hudAfter));
  console.log('timer     :', JSON.stringify(timerAfter));

  // Read game state for verification (mass should have grown from eating).
  // The capture used to be assigned and never read; it now backs a real check.
  const before = parseMassReadout(hudBefore);
  const after = parseMassReadout(hudAfter);

  // A readout that will not parse means the HUD number format changed under
  // us — that is a genuine regression and the loudest thing this block can
  // report, so it fails the run rather than degrading to a null capture.
  if (!before || !after) {
    console.log('FAIL: #score readout did not parse');
    console.log('   before:', JSON.stringify(hudBefore));
    console.log('   after :', JSON.stringify(hudAfter));
    await browser.close();
    process.exit(1);
  }

  const massDelta = after.mass - before.mass;
  console.log(`mass: ${before.mass} -> ${after.mass} (delta ${massDelta}) of target ${after.target}`);
  // Growth is REPORTED, not asserted: this leg drives ~4s of scripted WASD and
  // whether it happens to swallow anything depends on the seeded layout under
  // the spawn. Making it a hard failure would buy a flaky test for a signal
  // the seeded soak bot already covers properly. The parse above is the part
  // worth failing on. Exit status therefore stays governed by console errors,
  // exactly as before this change.
  console.log('mass grew:', massDelta > 0);
  if (after.target <= 0) console.log('WARN: target parsed as non-positive');

  console.log('errors:', errors.length);
  errors.forEach((e) => console.log('   ' + e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('FLOW CRASH:', e); process.exit(2); });
