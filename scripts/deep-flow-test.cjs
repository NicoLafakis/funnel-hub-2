// Deep flow: done screen -> build shop -> next level -> fail screen -> second wind.
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

  await page.goto('http://localhost:3003/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.click('#startBtn');
  await page.waitForTimeout(500);
  await page.click('.metro-card:not(.locked) .levelnode:not(.locked)');
  await page.waitForTimeout(400);
  await page.click('#goBtn');
  await page.waitForTimeout(1500);

  // Force a win: mass over target.
  await page.evaluate(() => { window.__fw.avatar.mass = 1200; });
  await page.waitForTimeout(800);
  const doneVisible = await page.$eval('#doneScreen', (el) => !el.classList.contains('hidden'));
  console.log('doneVisible:', doneVisible);
  await page.screenshot({ path: path.join(OUT, 'fw-flow-5-done.png') });

  // -> Build shop.
  await page.click('#nextBtn');
  await page.waitForTimeout(600);
  const shopVisible = await page.$eval('#shopScreen', (el) => !el.classList.contains('hidden'));
  const coins = await page.$eval('#coinBalance', (el) => el.textContent);
  console.log('shopVisible:', shopVisible, 'coins:', coins);
  await page.screenshot({ path: path.join(OUT, 'fw-flow-6-shop.png') });

  // Buy the tier-1 pick if affordable.
  const buyResult = await page.evaluate(() => {
    const btn = document.querySelector('.buildpick:not(:disabled)');
    if (!btn) return 'no-affordable-pick';
    btn.click();
    return 'clicked';
  });
  await page.waitForTimeout(400);
  const builds = await page.evaluate(() => JSON.stringify(window.__fw.state.saveData.builds));
  console.log('buy:', buyResult, 'builds:', builds);
  await page.screenshot({ path: path.join(OUT, 'fw-flow-7-shop-bought.png') });

  // Continue -> level 2 intro -> play -> force a fail.
  await page.click('#shopContinueBtn');
  await page.waitForTimeout(500);
  const intro2 = await page.$eval('#introBadge', (el) => el.textContent);
  console.log('next intro:', intro2);
  await page.click('#goBtn');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__fw.state.timer = 0.3; });
  await page.waitForTimeout(1000);
  const failVisible = await page.$eval('#failScreen', (el) => !el.classList.contains('hidden'));
  const windVisible = await page.$eval('#secondWindBtn', (el) => !el.classList.contains('hidden'));
  console.log('failVisible:', failVisible, 'secondWindOffered:', windVisible);
  await page.screenshot({ path: path.join(OUT, 'fw-flow-8-fail.png') });

  // Accept the second wind -> play resumes with +15s.
  if (windVisible) {
    await page.click('#secondWindBtn');
    await page.waitForTimeout(500);
    const resumed = await page.evaluate(() => ({
      mode: window.__fw.state.mode,
      timer: Math.round(window.__fw.state.timer),
    }));
    console.log('after second wind:', JSON.stringify(resumed));
    await page.screenshot({ path: path.join(OUT, 'fw-flow-9-secondwind.png') });
  }

  console.log('errors:', errors.length);
  errors.forEach((e) => console.log('   ' + e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('DEEP FLOW CRASH:', e); process.exit(2); });
