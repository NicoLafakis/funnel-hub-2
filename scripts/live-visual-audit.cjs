// Live-only Level 1 visual + chase-follow evidence. Never targets localhost.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const LIVE_URL = process.env.FW_LIVE_URL || 'https://funnel-hub-umber.vercel.app/';
const OUT = path.resolve(process.env.FW_AUDIT_DIR || 'shots/live-audit');

async function enterLevelOne(page) {
  await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.click('#startBtn');
  await page.waitForTimeout(800);
  const alreadyPlaying = await page.evaluate(() => window.__fw && window.__fw.state
    && window.__fw.state.mode === 'play');
  if (!alreadyPlaying && await page.locator('#goBtn:visible').count()) {
    if (await page.locator('.metro-card:not(.locked) .levelnode:not(.locked)').count()) {
      await page.locator('.metro-card:not(.locked) .levelnode:not(.locked)').first().click();
    }
    await page.click('#goBtn', { force: true });
  }
  await page.waitForFunction(() => window.__fw && window.__fw.state
    && window.__fw.state.mode === 'play' && window.__fw.state.propObjects.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
}

(async () => {
  if (/localhost|127\.0\.0\.1/i.test(LIVE_URL)) throw new Error('live audit refuses localhost');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await enterLevelOne(page);

  const version = await page.evaluate(() => ({
    props: window.__fw.state.propObjects.length,
    groups: window.__fw.state.world.groupCount,
    groupKeys: window.__fw.state.world.groupKeys,
    context: window.__fw.state.layout.context && {
      buildings: window.__fw.state.layout.context.buildings.length,
      trees: window.__fw.state.layout.context.trees.length,
      roads: window.__fw.state.layout.context.roads.length,
    },
  }));
  await page.screenshot({ path: path.join(OUT, '01-spawn.png') });

  await page.keyboard.down('d');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '02-right.png') });
  await page.keyboard.up('d');
  await page.keyboard.down('a');

  const trace = [];
  const start = Date.now();
  while (Date.now() - start < 2200) {
    trace.push(await page.evaluate(() => {
      const fw = window.__fw;
      const c = fw.engine.camera.position;
      const a = fw.avatar.object3D.position;
      const chase = fw.state.chaseCamera || fw.chaseCamera;
      return {
        t: performance.now(),
        avatarX: a.x, avatarZ: a.z,
        heading: fw.avatar.object3D.rotation.y,
        cameraX: c.x, cameraZ: c.z,
        followYaw: chase && chase.followYaw,
        yaw: chase && chase.yaw,
      };
    }));
    await page.waitForTimeout(33);
  }
  await page.keyboard.up('a');
  await page.screenshot({ path: path.join(OUT, '03-left-reversal.png') });

  await page.evaluate(() => {
    const { avatar, state } = window.__fw;
    const half = state.layout.world / 2 - 120;
    avatar.object3D.position.set(-half, 0, -half);
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, '04-vista.png') });

  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify({ LIVE_URL, version, errors, trace }, null, 2));
  console.log(JSON.stringify({ LIVE_URL, OUT, version, errors, samples: trace.length }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
