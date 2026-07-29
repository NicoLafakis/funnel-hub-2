const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('pageerror:', String(e)));
  await page.goto(process.env.BASE_URL || 'http://localhost:3010/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('#startBtn');
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const { avatar, state } = window.__fw;
    const lot = state.layout.blocks.find((b) => b.zone === 'parking');
    const overlaps = state.propObjects.filter((p) => p.kind.startsWith('building')
      && Math.abs(p.position.x - lot.x) < lot.w / 2
      && Math.abs(p.position.z - lot.z) < lot.d / 2)
      .map((p) => `${p.kind}@${Math.round(p.position.x)},${Math.round(p.position.z)}`);
    avatar.object3D.position.set(lot.x, 0, lot.z + lot.d * 0.55);
    return { lot: { x: lot.x, z: lot.z }, overlaps };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/l1-parking-lot.png' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
