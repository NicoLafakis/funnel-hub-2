// Visual verification: boot into level 1, screenshot the city from gameplay
// and orbit angles, and dump the texture wiring state (facade maps, ground
// map) so a missing texture is visible in text, not just pixels.
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');
const fs = require('node:fs');

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('pageerror:', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text()); });
  await page.goto('http://localhost:3003/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.click('#startBtn');
  await page.waitForTimeout(600);
  await page.click('.metro-card:not(.locked) .levelnode:not(.locked)');
  await page.waitForTimeout(400);
  await page.click('#goBtn');
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    const { engine, state } = window.__fw;
    const groups = state.world ? state.world.groupKeys : [];
    const facades = [];
    engine.scene.traverse((n) => {
      if (n.isInstancedMesh && n.name && n.name.startsWith('prop-field:building')) {
        facades.push(`${n.name} map=${n.material.map ? 'YES' : 'NO'} uv=${n.geometry.attributes.uv ? 'YES' : 'NO'}`);
      }
    });
    let ground = 'none';
    engine.scene.traverse((n) => {
      if (n.geometry && n.geometry.type === 'PlaneGeometry' && n.material) {
        ground = `map=${n.material.map ? 'YES' : 'NO'} size=${n.material.map ? n.material.map.image.width : '-'}`;
      }
    });
    return { groups, facades, ground, propCount: state.propObjects.length };
  });
  console.log('GROUPS:', info.groups.join(', '));
  console.log('BUILDINGS:', info.facades.join(' | '));
  console.log('GROUND:', info.ground);
  console.log('propCount:', info.propCount);

  await page.screenshot({ path: 'shots/l1-spawn.png' });

  // Close-ups: teleport the AVATAR (the chase camera follows it) next to each
  // building tier so the facade textures fill the frame.
  for (const kind of ['building-large', 'building-medium', 'building-small']) {
    await page.evaluate((k) => {
      const { avatar, state } = window.__fw;
      const b = state.propObjects.find((p) => p.kind === k);
      if (b) avatar.object3D.position.set(b.position.x + b.radius * 3, 0, b.position.z + b.radius * 3);
    }, kind);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `shots/l1-${kind}.png` });
  }

  // Wide read: park the avatar at the map edge so the chase camera frames a
  // long view across the district.
  await page.evaluate(() => {
    const { avatar, state } = window.__fw;
    const half = (state.layout ? state.layout.world : 1200) / 2 - 80;
    avatar.object3D.position.set(-half, 0, -half);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/l1-vista.png' });

  await browser.close();
  console.log('shots saved to shots/');
})().catch((e) => { console.error(e); process.exit(1); });
