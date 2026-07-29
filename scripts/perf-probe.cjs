// Frame-cost measurement for Level 1 (measured-target budgets, not assumed):
// boots the game, samples engine.getPerformanceSnapshot() at several spots —
// spawn, mid-city, and the long vista (worst case: most of the world in
// frustum) — and reports draw calls / triangles / frame times per spot.
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=default', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('pageerror:', String(e)));
  await page.goto(process.env.BASE_URL || `http://localhost:${process.env.PORT || 3003}/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.click('#startBtn');
  await page.waitForTimeout(1200);
  try {
    if (await page.$('.metro-card:not(.locked) .levelnode:not(.locked)')) {
      await page.click('.metro-card:not(.locked) .levelnode:not(.locked)', { timeout: 2000 });
      await page.waitForTimeout(400);
    }
  } catch { /* no worldmap step */ }
  try {
    const goVisible = await page.evaluate(() => {
      const b = document.querySelector('#goBtn');
      return !!(b && b.offsetParent);
    });
    if (goVisible) await page.click('#goBtn', { timeout: 2000 });
  } catch { /* intro card not up */ }
  await page.waitForTimeout(3000);

  async function sample(label, x, z) {
    if (x !== null) {
      await page.evaluate(([px, pz]) => {
        window.__fw.avatar.object3D.position.set(px, 0, pz);
      }, [x, z]);
      await page.waitForTimeout(600);
    }
    // Let the frame-time ring buffer refill at this spot.
    await page.waitForTimeout(4000);
    const s = await page.evaluate(() => window.__fw.performanceSnapshot());
    console.log(`${label}: calls=${s.calls} tris=${s.triangles} avg=${s.averageMs.toFixed(2)}ms p95=${s.p95Ms.toFixed(2)}ms fps=${s.sustainedFps.toFixed(1)} longFrames=${s.longFrames} quality=${s.quality} dpr=${s.dpr} geom=${s.memory.geometries} tex=${s.memory.textures}`);
    return s;
  }

  const world = await page.evaluate(() => (window.__fw.state.layout ? window.__fw.state.layout.world : 1200));
  await sample('spawn     ', null, null);
  await sample('mid-city  ', 0, 0);
  const half = world / 2 - 80;
  const vista = await sample('vista     ', -half, -half);

  // Walk the avatar through the city for 10s to catch streaming spikes.
  await page.evaluate(() => {
    const { avatar } = window.__fw;
    let t = 0;
    const id = setInterval(() => {
      t += 0.12;
      avatar.object3D.position.set(Math.sin(t) * 300, 0, Math.cos(t * 0.7) * 300);
    }, 100);
    setTimeout(() => clearInterval(id), 9500);
  });
  await page.waitForTimeout(10500);
  const walk = await page.evaluate(() => window.__fw.performanceSnapshot());
  console.log(`walk-10s  : calls=${walk.calls} tris=${walk.triangles} avg=${walk.averageMs.toFixed(2)}ms p95=${walk.p95Ms.toFixed(2)}ms fps=${walk.sustainedFps.toFixed(1)} longFrames=${walk.longFrames}`);

  console.log(`VERDICT: worst-case calls=${Math.max(vista.calls, walk.calls)} (desktop budget 150), tris=${Math.max(vista.triangles, walk.triangles)} (desktop budget 1.5M)`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
