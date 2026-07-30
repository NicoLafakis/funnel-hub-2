// 0011 Phase 0, task 2 follow-up — exercise the chase-camera obstacle pull-in
// against the Level 1 landmark and record the lowest reachable eye height.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const LIVE_URL = process.env.FW_LIVE_URL || 'https://funnel-hub-umber.vercel.app/';
const OUT = path.resolve('shots/reachability');

(async () => {
  if (/localhost|127\.0\.0\.1/i.test(LIVE_URL)) throw new Error('refuses localhost');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('pageerror:', String(e)));

  await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.click('#startBtn');
  await page.waitForTimeout(800);
  if (await page.locator('.metro-card:not(.locked) .levelnode:not(.locked)').count()) {
    await page.locator('.metro-card:not(.locked) .levelnode:not(.locked)').first().click();
  }
  await page.click('#goBtn', { force: true });
  await page.waitForFunction(() => window.__fw && window.__fw.state
    && window.__fw.state.mode === 'play' && window.__fw.state.propObjects.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    setInterval(() => {
      const s = window.__fw && window.__fw.state;
      if (s && s.mode === 'play' && typeof s.timer === 'number' && s.timer < 30) s.timer = s.levelTime;
    }, 5000);
  });

  // Pitch to minimum via the camera API.
  await page.evaluate(() => {
    const c = window.__fw.chaseCamera;
    for (let i = 0; i < 40; i++) c.orbitBy(0, -0.02);
  });
  await page.waitForTimeout(1200);
  console.log('pitch now:', await page.evaluate(() => window.__fw.chaseCamera.pitch * 180 / Math.PI));

  // Locate the landmark mesh (the only registered obstacle).
  const landmark = await page.evaluate(() => {
    const hits = [];
    window.__fw.engine.scene.traverse((o) => {
      if (o.name && /landmark|willis|tower/i.test(o.name)) {
        hits.push({ name: o.name, x: +o.position.x.toFixed(1), z: +o.position.z.toFixed(1) });
      }
    });
    const layout = window.__fw.state.layout || {};
    return { hits, layoutKeys: Object.keys(layout), landmark: layout.landmark || null };
  });
  console.log(JSON.stringify(landmark, null, 2));

  // Probe positions: ring around the landmark / city centre, sample min camY.
  const centre = landmark.landmark && typeof landmark.landmark.x === 'number'
    ? landmark.landmark
    : { x: 0, z: 0 };
  const results = [];
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    for (const d of [40, 80, 140]) {
      const px = centre.x + Math.sin(ang) * d;
      const pz = centre.z + Math.cos(ang) * d;
      let minY = Infinity;
      for (let s = 0; s < 15; s++) {
        const y = await page.evaluate(([px2, pz2]) => {
          window.__fw.avatar.object3D.position.set(px2, 0, pz2);
          return window.__fw.engine.camera.position.y;
        }, [px, pz]);
        if (y < minY) minY = y;
        await page.waitForTimeout(120);
      }
      results.push({ ang: +ang.toFixed(2), d, minY: +minY.toFixed(1) });
    }
  }
  // Let the camera settle at the worst spot and screenshot.
  const worst = results.reduce((a, b) => (b.minY < a.minY ? b : a));
  console.log('worst:', JSON.stringify(worst));
  console.log('all:', JSON.stringify(results));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'E-pullin-probe.png') });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
