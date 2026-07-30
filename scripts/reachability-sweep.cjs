// 0011 Phase 0, tasks 2+4 — read-only live measurements.
// Task 2 (R5): sweep the reachable chase-camera space (pitch range, spawn
// radius, obstacle pull-in, level-entry transient) and record the lowest eye
// height any configuration produces, against camera.near = 20.
// Task 4: record groupCount/groupKeys and a perf snapshot as the baseline.
// Never targets localhost. Writes shots/reachability/ (gitignored).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const LIVE_URL = process.env.FW_LIVE_URL || 'https://funnel-hub-umber.vercel.app/';
const OUT = path.resolve('shots/reachability');

const eye = () => {
  const fw = window.__fw;
  return {
    camY: +fw.engine.camera.position.y.toFixed(1),
    camX: +fw.engine.camera.position.x.toFixed(1),
    camZ: +fw.engine.camera.position.z.toFixed(1),
    pitchDeg: +(fw.chaseCamera.pitch * 180 / Math.PI).toFixed(1),
    avatarR: +fw.avatar.radius().toFixed(1),
    near: fw.engine.camera.near,
  };
};

(async () => {
  if (/localhost|127\.0\.0\.1/i.test(LIVE_URL)) throw new Error('refuses localhost');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=default', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.click('#startBtn');
  await page.waitForTimeout(800);
  if (await page.locator('.metro-card:not(.locked) .levelnode:not(.locked)').count()) {
    await page.locator('.metro-card:not(.locked) .levelnode:not(.locked)').first().click();
  }
  await page.click('#goBtn', { force: true });

  // --- Level-entry transient: sample eye height every 120ms for 3s. ---
  const transient = [];
  for (let i = 0; i < 25; i++) {
    const ok = await page.evaluate(() => !!(window.__fw && window.__fw.state && window.__fw.state.mode === 'play' && window.__fw.chaseCamera));
    if (ok) transient.push(await page.evaluate(eye));
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(() => window.__fw && window.__fw.state
    && window.__fw.state.mode === 'play' && window.__fw.state.propObjects.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // Keep the 75s clock from failing the run mid-sweep (findings' rig note).
  await page.evaluate(() => {
    setInterval(() => {
      const s = window.__fw && window.__fw.state;
      if (s && s.mode === 'play' && typeof s.timer === 'number' && s.timer < 30) s.timer = s.levelTime;
    }, 5000);
  });

  // renderer.info resets per internal pass, so with the composer enabled the
  // snapshot only ever sees the final fullscreen quad (calls=1 tris=1).
  // Accumulate across the whole frame instead: reset once at frame start.
  await page.evaluate(() => {
    const e = window.__fw.engine;
    const r = e.renderer;
    r.info.autoReset = false;
    const origRender = e.render.bind(e);
    e.render = (...a) => { r.info.reset(); origRender(...a); };
  });

  const results = { LIVE_URL, transient, configs: [] };

  // --- Config A: spawn idle, default pitch. ---
  const a = await page.evaluate(eye);
  results.configs.push({ label: 'A spawn idle, pitch default', ...a });
  await page.screenshot({ path: path.join(OUT, 'A-spawn-default.png') });

  // --- Config B: orbit to pitch min (right-drag down in steps). ---
  for (let step = 0; step < 12; step++) {
    const p = await page.evaluate(() => window.__fw.chaseCamera.pitch * 180 / Math.PI);
    if (p <= 35.5) break;
    await page.mouse.move(800, 500);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(800, 200, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1200);
  const b = await page.evaluate(eye);
  results.configs.push({ label: 'B pitch min (orbit drag)', ...b });
  await page.screenshot({ path: path.join(OUT, 'B-pitch-min.png') });

  // --- Config C: pitch min + drive through the tower cluster (pull-in). ---
  // Drive with keys through dense city; sample every 100ms, keep the minimum.
  let cMin = null;
  const keys = ['w', 'a', 's', 'd'];
  for (let leg = 0; leg < 6; leg++) {
    const k = keys[leg % keys.length];
    await page.keyboard.down(k);
    const t0 = Date.now();
    while (Date.now() - t0 < 1500) {
      const s = await page.evaluate(eye);
      if (!cMin || s.camY < cMin.camY) cMin = s;
      await page.waitForTimeout(100);
    }
    await page.keyboard.up(k);
  }
  results.configs.push({ label: 'C min over drive-through (pull-in hunt)', ...cMin });
  await page.screenshot({ path: path.join(OUT, 'C-pullin-min.png') });

  // --- Config D: orbit to pitch MAX for the upper bound. ---
  for (let step = 0; step < 16; step++) {
    const p = await page.evaluate(() => window.__fw.chaseCamera.pitch * 180 / Math.PI);
    if (p >= 64.5) break;
    await page.mouse.move(800, 300);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(800, 700, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1200);
  const d = await page.evaluate(eye);
  results.configs.push({ label: 'D pitch max (orbit drag)', ...d });

  // --- Task 4 baseline: groups + perf snapshot. ---
  const groups = await page.evaluate(() => ({
    groupCount: window.__fw.state.world.groupCount,
    groupKeys: window.__fw.state.world.groupKeys,
    props: window.__fw.state.propObjects.length,
  }));
  await page.waitForTimeout(4000);
  const perf = await page.evaluate(() => window.__fw.performanceSnapshot());
  results.groups = groups;
  results.perf = {
    calls: perf.calls, triangles: perf.triangles,
    avgMs: perf.averageMs, p95Ms: perf.p95Ms, fps: perf.sustainedFps,
    geometries: perf.memory.geometries, textures: perf.memory.textures,
  };
  results.errors = errors;

  fs.writeFileSync(path.join(OUT, 'reachability.json'), JSON.stringify(results, null, 2));
  const tmin = Math.min(...transient.map((t) => t.camY));
  console.log(JSON.stringify({
    transientMinCamY: tmin,
    configs: results.configs,
    groupCount: groups.groupCount,
    perf: results.perf,
    errors,
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
