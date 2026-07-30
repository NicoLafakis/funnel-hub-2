// 0011 Phase A evidence — after-shots on the live deploy, approximating the
// review rig's fixed cameras (b-street, d-intersection, g-skyline,
// h-far-horizon). Freezes the chase camera and composes each frame directly,
// so framings match the 0011 review set closely enough to pair with it.
// Writes shots/phase-a/ (gitignored).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const LIVE_URL = process.env.FW_LIVE_URL || 'https://funnel-hub-umber.vercel.app/';
const OUT = path.resolve('shots/phase-a');

(async () => {
  if (/localhost|127\.0\.0\.1/i.test(LIVE_URL)) throw new Error('refuses localhost');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

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
    // Freeze the chase camera: the frame loop still renders, but update()
    // becomes a no-op so composed camera poses hold.
    window.__fw.chaseCamera.update = () => {};
  });

  // Helper: compose a camera pose and shoot.
  async function shot(name, pose) {
    await page.evaluate((p) => {
      const fw = window.__fw;
      if (p.avatar) fw.avatar.object3D.position.set(p.avatar[0], 0, p.avatar[1]);
      fw.engine.camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      fw.engine.camera.lookAt(p.look[0], p.look[1], p.look[2]);
    }, pose);
    await page.waitForTimeout(700);
    await page.evaluate((p) => { // re-assert after any residual easing
      const fw = window.__fw;
      fw.engine.camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      fw.engine.camera.lookAt(p.look[0], p.look[1], p.look[2]);
    }, pose);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('shot', name);
  }

  // Locate the Marina tower pair for the skyline framing.
  const marina = await page.evaluate(() => {
    const p = window.__fw.state.propObjects.find((q) => q.visualId === 'cityobj_chicago_marina_city_tower_pair');
    return p ? { x: p.position.x, z: p.position.z, r: p.radius } : null;
  });
  console.log('marina:', JSON.stringify(marina));

  // g-skyline: low eye beside the Marina tower, looking up at it.
  if (marina) {
    await shot('g-skyline.png', {
      avatar: [marina.x + marina.r * 3.5, marina.z + marina.r * 3.5],
      pos: [marina.x + 420, 45, marina.z + 420],
      look: [marina.x, 420, marina.z],
    });
  }

  // b-street: street-level eye straight down a street canyon (spawn area).
  const spawn = await page.evaluate(() => {
    const s = window.__fw.state.layout.spawn;
    return { x: s.x, z: s.z };
  });
  await shot('b-street.png', {
    avatar: [spawn.x, spawn.z],
    pos: [spawn.x, 26, spawn.z - 260],
    look: [spawn.x, 30, spawn.z + 400],
  });

  // d-intersection: chase-style high view over an intersection near spawn.
  await shot('d-intersection.png', {
    avatar: [spawn.x, spawn.z + 150],
    pos: [spawn.x - 180, 260, spawn.z - 220],
    look: [spawn.x + 60, 0, spawn.z + 260],
  });

  // h-far-horizon: high pitch view across the park toward the horizon/lake.
  await shot('h-far-horizon.png', {
    avatar: [spawn.x, spawn.z],
    pos: [spawn.x - 420, 330, spawn.z - 420],
    look: [spawn.x + 900, 40, spawn.z + 900],
  });

  // f-vista: long diagonal across the city from the far corner.
  const world = await page.evaluate(() => window.__fw.state.layout.world);
  const half = world / 2 - 120;
  await shot('f-vista.png', {
    avatar: [-half, -half],
    pos: [-half - 150, 700, -half - 150],
    look: [200, 60, 200],
  });

  // a-spawn: the default chase view at spawn (unfrozen equivalent).
  await shot('a-spawn.png', {
    avatar: [spawn.x, spawn.z],
    pos: [spawn.x, 450, spawn.z - 320],
    look: [spawn.x, 0, spawn.z + 200],
  });

  // c-block: street-level down an avenue canyon.
  await shot('c-block.png', {
    avatar: [spawn.x + 200, spawn.z],
    pos: [spawn.x + 200, 30, spawn.z - 300],
    look: [spawn.x + 200, 60, spawn.z + 500],
  });

  // e-park: the centre park block from a mid height.
  const park = await page.evaluate(() => {
    const bs = window.__fw.state.layout.blocks.filter((b) => b.zone === 'park')
      .sort((a, b) => b.w * b.d - a.w * a.d);
    return { x: bs[0].x, z: bs[0].z, w: bs[0].w, d: bs[0].d };
  });
  await shot('e-park.png', {
    avatar: [park.x, park.z],
    pos: [park.x - park.w * 0.7, 300, park.z - park.d * 0.7],
    look: [park.x, 0, park.z],
  });

  // i-parking: a surface parking lot.
  const lot = await page.evaluate(() => {
    const b = window.__fw.state.layout.blocks.find((b2) => b2.zone === 'parking');
    return b ? { x: b.x, z: b.z, w: b.w, d: b.d } : null;
  });
  if (lot) {
    await shot('i-parking.png', {
      avatar: [lot.x, lot.z],
      pos: [lot.x - lot.w * 0.6, 260, lot.z - lot.d * 0.6],
      look: [lot.x, 0, lot.z],
    });
  }

  // j-elevated-rail: along the L tracks.
  await shot('j-elevated-rail.png', {
    avatar: [spawn.x, spawn.z],
    pos: [spawn.x - 500, 120, spawn.z + 300],
    look: [spawn.x + 400, 60, spawn.z + 300],
  });

  // Sky value samples for the re-aim check (dome pixels, h-far-horizon frame).
  const skySample = await page.evaluate(() => {
    const fw = window.__fw;
    fw.engine.camera.position.set(0, 330, -420);
    fw.engine.camera.lookAt(900, 40, 900);
    return null;
  });
  console.log(JSON.stringify({ errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
