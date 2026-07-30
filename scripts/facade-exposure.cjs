// 0011 task 5 — measure + re-expose facade tier art (read-measure-write in
// assets/textures/photoreal/). Usage:
//   node scripts/facade-exposure.cjs measure   -> luminance table, no writes
//   node scripts/facade-exposure.cjs lift      -> re-expose the dark variant
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const SETS = {
  large: ['facade-large.png', 'facade-large-concrete-glass.png', 'facade-large-glass-dark.png', 'facade-large-violet.png'],
  medium: ['facade-medium.png', 'facade-medium-brick-bay.png', 'facade-medium-brick-loft.png', 'facade-medium-limestone.png'],
  small: ['facade-small.png', 'facade-small-brick-brown.png', 'facade-small-ironspot.png', 'facade-small-limestone.png', 'facade-small-painted.png'],
};
const LIFT_FILE = 'facade-large-glass-dark.png';
// Task 5 target: windows countable on the tallest towers, still the darkest
// of the four large-tier variants. Chosen against the measured table.
const LIFT_TARGET_MEAN = 95;

(async () => {
  const mode = process.argv[2] || 'measure';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');

  async function analyse(file) {
    const abs = path.join(ROOT, 'assets/textures/photoreal', file);
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(abs).toString('base64');
    return page.evaluate(async (dataUrl2) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl2; });
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      let L = 0, n = 0;
      const hist = new Array(8).fill(0);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        L += l; n++;
        hist[Math.min(7, Math.floor(l / 32))]++;
      }
      return { mean: +(L / n).toFixed(1), hist: hist.map((h) => +(100 * h / n).toFixed(1)) };
    }, dataUrl);
  }

  for (const [tier, files] of Object.entries(SETS)) {
    console.log(`--- ${tier}`);
    for (const f of files) {
      const r = await analyse(f);
      console.log(`  ${f.padEnd(36)} mean ${String(r.mean).padStart(6)}  lum-hist(0..255,8) ${r.hist.join(' ')}`);
    }
  }

  if (mode === 'lift') {
    const abs = path.join(ROOT, 'assets/textures/photoreal', LIFT_FILE);
    const before = await analyse(LIFT_FILE);
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(abs).toString('base64');
    const out = await page.evaluate(async ({ dataUrl2, target }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl2; });
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const im = cx.getImageData(0, 0, cv.width, cv.height);
      const d = im.data;
      // Exposure lift in gamma form: out = 255 * (in/255)^(1/g), g solved so
      // the mean lands near target. Soft — preserves hue and window contrast.
      let L = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        L += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++;
      }
      const mean = L / n;
      // gamma approximation: mean scales ~ (mean/255)^(1/g)*255; solve g.
      let g = 1.0;
      for (let iter = 0; iter < 40; iter++) {
        const m2 = 255 * Math.pow(mean / 255, 1 / g);
        if (Math.abs(m2 - target) < 0.5) break;
        g *= (m2 < target) ? 1.02 : 0.98;
      }
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, 1 / g);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]];
      }
      cx.putImageData(im, 0, 0);
      return { gamma: +g.toFixed(3), png: cv.toDataURL('image/png') };
    }, { dataUrl2: dataUrl, target: LIFT_TARGET_MEAN });
    fs.writeFileSync(abs, Buffer.from(out.png.split(',')[1], 'base64'));
    const after = await analyse(LIFT_FILE);
    console.log(`\nLIFT ${LIFT_FILE}: gamma=${out.gamma} mean ${before.mean} -> ${after.mean}`);
    console.log(`  hist before ${before.hist.join(' ')}`);
    console.log(`  hist after  ${after.hist.join(' ')}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
