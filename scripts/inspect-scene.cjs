// Scene introspection via window.__fw: avatar subtree composition + prop scale check.
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('pageerror:', String(e)));
  await page.goto('http://localhost:3003/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.click('#startBtn');
  await page.waitForTimeout(600);
  await page.click('.metro-card:not(.locked) .levelnode:not(.locked)');
  await page.waitForTimeout(400);
  await page.click('#goBtn');
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const { engine, avatar, state } = window.__fw;
    function describe(node, depth) {
      const lines = [];
      const mat = node.material;
      lines.push(`${'  '.repeat(depth)}${node.type} name=${node.name || '-'} geo=${node.geometry ? node.geometry.type : '-'} mat=${mat ? mat.type : '-'}${mat && mat.wireframe ? ' WIREFRAME' : ''} visible=${node.visible} scale=${node.scale.x.toFixed(2)}`);
      for (const c of node.children) lines.push(...describe(c, depth + 1));
      return lines;
    }
    const avatarTree = describe(avatar.object3D, 0);

    // Scene-level meshes that are spheres near avatar scale (find the wireframe owner).
    const suspects = [];
    engine.scene.traverse((n) => {
      if (n.material && n.material.wireframe) suspects.push(`wireframe: ${n.geometry.type} mat=${n.material.type} name=${n.name || '-'}`);
    });

    // Prop scale sanity: first few props and their world scale/radius.
    const props = state.propObjects.slice(0, 6).map((p) => ({
      kind: p.kind, radius: p.radius, scale: p.scale, pos: [Math.round(p.position.x), Math.round(p.position.z)],
    }));
    return { avatarTree, suspects, props, propCount: state.propObjects.length, drawCalls: state.world ? state.world.drawCalls : -1 };
  });
  console.log('AVATAR TREE:');
  info.avatarTree.forEach((l) => console.log(l));
  console.log('WIREFRAME SUSPECTS:', info.suspects);
  console.log('PROPS:', JSON.stringify(info.props, null, 1));
  console.log('propCount:', info.propCount, 'drawCalls:', info.drawCalls);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
