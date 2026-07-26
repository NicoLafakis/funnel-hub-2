// Boot smoke: load the game at three viewports, assert zero console errors /
// pageerrors (mp4 preload aborts tolerated), canvas present, SPIN IT UP visible.
const path = require('path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const OUT = require('os').tmpdir();

function isNoise(text) {
  return /preload|AbortError|net::ERR_ABORTED|hero-motion|win-motion|favicon/i.test(text);
}

(async () => {
  const browser = await chromium.launch();
  const viewports = [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 800, height: 450, name: 'small-landscape' },
    { width: 390, height: 844, name: 'mobile' },
  ];
  let failures = 0;
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isNoise(msg.text())) errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      if (!isNoise(String(err))) errors.push(`pageerror: ${err}`);
    });
    await page.goto('http://localhost:3003/', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2500);
    const canvas = await page.$('#game');
    const startBtn = await page.$('#startBtn');
    const btnVisible = startBtn ? await startBtn.isVisible() : false;
    const shot = path.join(OUT, `fw-boot-${vp.name}.png`);
    await page.screenshot({ path: shot });
    const ok = canvas && btnVisible && errors.length === 0;
    if (!ok) failures += 1;
    console.log(`[${vp.name} ${vp.width}x${vp.height}] canvas=${!!canvas} startBtnVisible=${btnVisible} errors=${errors.length} shot=${shot}`);
    errors.forEach((e) => console.log(`   ${e}`));
    await page.close();
  }
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SMOKE CRASH:', e); process.exit(2); });
