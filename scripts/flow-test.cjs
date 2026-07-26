// Scripted flow: SPIN IT UP -> world map -> level 1 -> play -> move -> verify.
const path = require('path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const OUT = require('os').tmpdir();

function isNoise(text) {
  return /preload|AbortError|net::ERR_ABORTED|hero-motion|win-motion|favicon/i.test(text);
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
  const massMatch = /Mass\s*([\d,]+)\s*\/\s*([\d,]+)/.exec(hudAfter.replace(/<[^>]+>/g, ' ')) || /Mass\s+(\d+)\s*\/\s*(\d+)/.exec(hudAfter);
  console.log('mass grew:', hudBefore !== hudAfter);

  console.log('errors:', errors.length);
  errors.forEach((e) => console.log('   ' + e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('FLOW CRASH:', e); process.exit(2); });
