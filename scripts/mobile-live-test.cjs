// Touch-first live-deployment journey. Requires LIVE_URL and never falls back
// to localhost. Uses CDP multi-touch so the control path receives real touch
// events rather than keyboard input in a narrow desktop viewport.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const rawUrl = process.env.LIVE_URL;
if (!rawUrl || /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(rawUrl)) {
  throw new Error('LIVE_URL must name an authorized deployed URL; localhost is forbidden');
}
const LIVE_URL = new URL(rawUrl).toString();
const OUT = path.join(os.tmpdir(), 'fw-mobile-live');
fs.mkdirSync(OUT, { recursive: true });
const profiles = [
  { name: 'iphone-portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' },
  { name: 'android-mid', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' },
  { name: 'android-small', viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' },
  { name: 'phone-landscape', viewport: { width: 800, height: 450 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' },
];

async function touch(client, type, points) {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })),
  });
}

async function playTouchOnlyLevel(page, client, viewport, timeoutMs = 90000) {
  const origin = { id: 7, x: viewport.width * 0.78, y: viewport.height * 0.78 };
  await touch(client, 'touchStart', [origin]);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const fw = window.__fw;
      if (!fw || fw.state.mode !== 'play') return { mode: fw && fw.state.mode };
      const avatar = fw.avatar.position;
      let best = null;
      let bestD2 = Infinity;
      for (const prop of fw.state.propObjects || []) {
        if (prop._eaten || prop._visible === false || prop._edible === false) continue;
        const dx = prop.position.x - avatar.x;
        const dz = prop.position.z - avatar.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = { dx, dz }; }
      }
      if (!best) return { mode: fw.state.mode };
      const len = Math.hypot(best.dx, best.dz) || 1;
      const dx = best.dx / len;
      const dz = best.dz / len;
      const yaw = fw.chaseCamera.yaw;
      return {
        mode: fw.state.mode,
        screenX: -dx * Math.cos(yaw) + dz * Math.sin(yaw),
        screenZ: -(dx * Math.sin(yaw) + dz * Math.cos(yaw)),
      };
    });
    if (sample.mode !== 'play') {
      await touch(client, 'touchEnd', []);
      return sample.mode === 'done' || sample.mode === 'shop' || sample.mode === 'worldmap';
    }
    if (Number.isFinite(sample.screenX) && Number.isFinite(sample.screenZ)) {
      await touch(client, 'touchMove', [{
        id: origin.id,
        x: origin.x + sample.screenX * 56,
        y: origin.y + sample.screenZ * 56,
      }]);
    }
    await page.waitForTimeout(180);
  }
  await touch(client, 'touchEnd', []);
  return false;
}

(async () => {
  const browser = await chromium.launch();
  let failures = 0;
  for (const profile of profiles) {
    const context = await browser.newContext({
      ...profile,
      isMobile: true,
      hasTouch: true,
      locale: 'en-US',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/preload|AbortError|ERR_ABORTED|favicon/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => localStorage.removeItem('flywheel.save.v2'));
    await page.goto(LIVE_URL, { waitUntil: 'load', timeout: 30000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => window.__fw && window.__fw.state.mode === 'play', null, { timeout: 30000 });
    const before = await page.evaluate(() => ({
      x: window.__fw.avatar.position.x,
      z: window.__fw.avatar.position.z,
      yaw: window.__fw.chaseCamera.yaw,
    }));
    const client = await context.newCDPSession(page);
    const w = profile.viewport.width;
    const h = profile.viewport.height;
    const moveStart = { id: 1, x: w * 0.82, y: h * 0.78 };
    const moveEnd = { id: 1, x: w * 0.82, y: h * 0.58 };
    const orbitStart = { id: 2, x: w * 0.22, y: h * 0.72 };
    const orbitEnd = { id: 2, x: w * 0.38, y: h * 0.72 };
    await touch(client, 'touchStart', [moveStart]);
    await touch(client, 'touchMove', [moveEnd]);
    await page.waitForTimeout(500);
    const rolesOne = await page.evaluate(() => window.__fw.inputSnapshot());
    await touch(client, 'touchStart', [moveEnd, orbitStart]);
    await touch(client, 'touchMove', [moveEnd, orbitEnd]);
    await page.waitForTimeout(500);
    const rolesTwo = await page.evaluate(() => window.__fw.inputSnapshot());
    await touch(client, 'touchEnd', []);
    const after = await page.evaluate(() => ({
      x: window.__fw.avatar.position.x,
      z: window.__fw.avatar.position.z,
      yaw: window.__fw.chaseCamera.yaw,
      perf: window.__fw.performanceSnapshot(),
    }));
    const moved = Math.hypot(after.x - before.x, after.z - before.z) > 1;
    const orbited = Math.abs(after.yaw - before.yaw) > 0.01;
    const roleOk = rolesOne.some((p) => p.role === 'stick')
      && rolesTwo.some((p) => p.role === 'stick') && rolesTwo.some((p) => p.role === 'orbit');
    const touchBotCompleted = profile.name === 'android-mid'
      ? await playTouchOnlyLevel(page, client, profile.viewport)
      : null;
    const ok = moved && orbited && roleOk && touchBotCompleted !== false && errors.length === 0;
    if (!ok) failures += 1;
    const shot = path.join(OUT, `${profile.name}.png`);
    await page.screenshot({ path: shot });
    console.log(JSON.stringify({ profile: profile.name, ok, moved, orbited, roleOk, touchBotCompleted, errors, perf: after.perf, shot }));
    await context.close();
  }
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
