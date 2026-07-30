// Read-only pixel measurement for the 0011 realism package.
// Loads reference screenshots and our captures through a headless-browser
// canvas (handles PNG+JPEG without new deps) and reports hard numbers:
// global mean colour/luminance, vertical sky-gradient profiles, and
// horizontal scanline runs (for stripe-vs-car measurement).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.APPDATA + '/npm/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');

const IMAGES = {
  'ref-target-city': 'assets/references/target-in_game-graphics-city.png',
  'ref-target-bg01': 'assets/references/target-in_game-graphics-background-01.png',
  'ref-target-bg02': 'assets/references/target-in_game-graphics-background-02.png',
  'ref-actual-city': 'assets/references/actual-in_game-graphics-city.png',
  'ref-holeio-495': 'assets/references/holeio/1000030495.jpg',
  'ref-holeio-503': 'assets/references/holeio/1000030503.jpg',
  'ours-spawn': 'shots/l1-realism-review/a-spawn.png',
  'ours-street': 'shots/l1-realism-review/b-street.png',
  'ours-block': 'shots/l1-realism-review/c-block.png',
  'ours-intersection': 'shots/l1-realism-review/d-intersection.png',
  'ours-park': 'shots/l1-realism-review/e-park.png',
  'ours-vista': 'shots/l1-realism-review/f-vista.png',
  'ours-skyline': 'shots/l1-realism-review/g-skyline.png',
  'ours-horizon': 'shots/l1-realism-review/h-far-horizon.png',
};

// Sky sample columns (fraction of width) and row fractions to report.
const SKY_COLS = [0.25, 0.5, 0.75];
const SKY_ROWS = [0.05, 0.15, 0.25, 0.33, 0.40, 0.45];

// Scanline run measurements: report runs of bright (near-white) pixels and
// runs of saturated/non-road pixels along chosen rows/columns.
// { img, axis: 'h'|'v', at, from, to, label }
const SCANLINES = [
  // target city: bottom-left crosswalk bars (horizontal scan across bars)
  { img: 'ref-target-city', axis: 'h', at: 900, from: 740, to: 860, label: 'target crosswalk bars row y=900' },
  { img: 'ref-target-city', axis: 'v', at: 975, from: 840, to: 900, label: 'target white car narrow dim col x=975' },
  { img: 'ref-target-city', axis: 'h', at: 872, from: 920, to: 1030, label: 'target white car length row y=872' },
  // ours: crosswalk bars next to the hole
  { img: 'ours-intersection', axis: 'h', at: 575, from: 540, to: 740, label: 'ours crosswalk bars row y=575' },
  // ours: cars + pedestrian + crosswalk band, distant street
  { img: 'ours-intersection', axis: 'h', at: 262, from: 950, to: 1180, label: 'ours cars row y=262' },
  { img: 'ours-intersection', axis: 'h', at: 285, from: 1100, to: 1280, label: 'ours crosswalk band row y=285' },
  { img: 'ours-intersection', axis: 'v', at: 1010, from: 230, to: 290, label: 'ours car narrow dim col x=1010' },
  // holeio: crosswalk stripes right edge + car
  { img: 'ref-holeio-495', axis: 'v', at: 615, from: 380, to: 440, label: 'holeio crosswalk stripes col x=615' },
];

// Rect region means: { img, x, y, w, h, label }
const RECTS = [
  // b-street right building (orig coords, from crop offset x=990,y=140):
  { img: 'ours-street', x: 1150, y: 470, w: 120, h: 50, label: 'b-street right GROUND band A' },
  { img: 'ours-street', x: 1380, y: 480, w: 100, h: 40, label: 'b-street right GROUND band B' },
  { img: 'ours-street', x: 1120, y: 285, w: 80, h: 15, label: 'b-street right black balcony band' },
  { img: 'ours-street', x: 1120, y: 200, w: 60, h: 40, label: 'b-street right upper window box' },
  { img: 'ours-street', x: 240, y: 200, w: 80, h: 60, label: 'b-street left bldg dark face' },
  { img: 'ours-street', x: 40, y: 300, w: 60, h: 40, label: 'b-street left black band' },
  // c-block brick wall (sun-lit red brick) vs its dark window boxes
  { img: 'ours-block', x: 1180, y: 470, w: 40, h: 60, label: 'c-block brick column (lit)' },
  { img: 'ours-block', x: 1240, y: 500, w: 30, h: 50, label: 'c-block window box' },
  // d-intersection hole interior (true black reference)
  { img: 'ours-intersection', x: 760, y: 460, w: 50, h: 30, label: 'd-intersection hole interior (black ref)' },
  // target-city building palette patches (orig coords)
  { img: 'ref-target-city', x: 460, y: 130, w: 60, h: 80, label: 'target purple tower' },
  { img: 'ref-target-city', x: 610, y: 140, w: 50, h: 50, label: 'target red brick' },
  { img: 'ref-target-city', x: 710, y: 120, w: 50, h: 60, label: 'target teal glass' },
  { img: 'ref-target-city', x: 680, y: 280, w: 50, h: 40, label: 'target tan lowrise roof' },
  { img: 'ref-target-city', x: 610, y: 255, w: 40, h: 15, label: 'target awning stripes' },
  { img: 'ref-target-city', x: 850, y: 150, w: 60, h: 40, label: 'target asphalt' },
  { img: 'ref-target-city', x: 662, y: 212, w: 25, h: 20, label: 'target tree canopy' },
  { img: 'ref-target-city', x: 40, y: 300, w: 60, h: 40, label: 'target water (left)' },
  // our building patches for the same table
  { img: 'ours-skyline', x: 700, y: 300, w: 80, h: 100, label: 'ours marina tower (g-skyline)' },
  { img: 'ours-park', x: 300, y: 350, w: 60, h: 40, label: 'ours park grass' },
  { img: 'ref-target-bg02', x: 400, y: 300, w: 80, h: 60, label: 'target bg02 park grass' },
];

(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.goto('about:blank');

  for (const [name, rel] of Object.entries(IMAGES)) {
    const abs = path.join(ROOT, rel);
    const mime = abs.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const fileUrl = `data:${mime};base64,` + fs.readFileSync(abs).toString('base64');
    const r = await page.evaluate(async ({ fileUrl, SKY_COLS, SKY_ROWS }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = fileUrl; });
      const w = img.naturalWidth, h = img.naturalHeight;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, w, h).data;
      const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Global mean.
      let R = 0, G = 0, B = 0, L = 0;
      const n = w * h;
      for (let i = 0; i < data.length; i += 4) {
        R += data[i]; G += data[i + 1]; B += data[i + 2];
        L += lum(data[i], data[i + 1], data[i + 2]);
      }

      // Vertical profile: mean RGB of 20 horizontal bands (full width).
      const bands = [];
      const NB = 20;
      for (let b = 0; b < NB; b++) {
        const y0 = Math.floor(h * b / NB), y1 = Math.floor(h * (b + 1) / NB);
        let r = 0, g = 0, bl = 0, cnt = 0;
        for (let y = y0; y < y1; y += 2) {
          for (let x = 0; x < w; x += 4) {
            const i = (y * w + x) * 4;
            r += data[i]; g += data[i + 1]; bl += data[i + 2]; cnt++;
          }
        }
        bands.push([Math.round(r / cnt), Math.round(g / cnt), Math.round(bl / cnt)]);
      }

      // Sky samples at given column/row fractions.
      const sky = [];
      for (const cf of SKY_COLS) {
        for (const rf of SKY_ROWS) {
          const x = Math.min(w - 1, Math.floor(w * cf));
          const y = Math.min(h - 1, Math.floor(h * rf));
          const i = (y * w + x) * 4;
          sky.push({ c: cf, r: rf, rgb: [data[i], data[i + 1], data[i + 2]] });
        }
      }
      return { w, h, mean: [Math.round(R / n), Math.round(G / n), Math.round(B / n)], meanLum: +(L / n).toFixed(1), bands, sky };
    }, { fileUrl, SKY_COLS, SKY_ROWS });

    console.log(`\n=== ${name} (${r.w}x${r.h}) mean rgb(${r.mean}) lum=${r.meanLum}/255`);
    console.log('  vertical bands (top->bottom, 20):');
    r.bands.forEach((b, i) => console.log(`    ${String(i).padStart(2)} rgb(${b.join(',')})`));
    console.log('  sky samples: ' + r.sky.filter(s => s.c === 0.5).map(s => `y=${s.r}:rgb(${s.rgb.join(',')})`).join(' '));
  }
  // Scanline runs.
  const byImg = {};
  for (const s of SCANLINES) (byImg[s.img] = byImg[s.img] || []).push(s);
  for (const [img, lines] of Object.entries(byImg)) {
    const rel = IMAGES[img];
    const abs = path.join(ROOT, rel);
    const mime = abs.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const fileUrl = `data:${mime};base64,` + fs.readFileSync(abs).toString('base64');
    const out = await page.evaluate(async ({ fileUrl, lines }) => {
      const imgEl = new Image();
      await new Promise((res, rej) => { imgEl.onload = res; imgEl.onerror = rej; imgEl.src = fileUrl; });
      const w = imgEl.naturalWidth, h = imgEl.naturalHeight;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(imgEl, 0, 0);
      const data = cx.getImageData(0, 0, w, h).data;
      const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
      return lines.map(({ axis, at, from, to, label }) => {
        const samples = [];
        for (let p = from; p <= to; p++) {
          const [r, g, b] = axis === 'h' ? px(p, at) : px(at, p);
          samples.push({ p, r, g, b, bright: r > 85 && g > 85 && b > 85 });
        }
        // Downsampled trace so we can see what the line actually crossed.
        const trace = samples.filter((_, i) => i % 6 === 0).map(s => `${s.p}:${s.r},${s.g},${s.b}`).join(' ');
        const runs = [];
        let start = null;
        for (const s of samples) {
          if (s.bright && start === null) start = s.p;
          if (!s.bright && start !== null) { runs.push([start, s.p - 1]); start = null; }
        }
        if (start !== null) runs.push([start, to]);
        return { label, trace, runs: runs.map(([a, b]) => `${a}-${b} (${b - a + 1}px)`) };
      });
    }, { fileUrl, lines });
    console.log(`\n--- scanlines on ${img}`);
    for (const o of out) {
      console.log(`  ${o.label}: ${o.runs.length ? o.runs.join('  ') : '(no runs >85)'}`);
      console.log(`    trace: ${o.trace}`);
    }
  }
  // Rect region means.
  const rectsByImg = {};
  for (const s of RECTS) (rectsByImg[s.img] = rectsByImg[s.img] || []).push(s);
  for (const [img, rects] of Object.entries(rectsByImg)) {
    const rel = IMAGES[img];
    const abs = path.join(ROOT, rel);
    const mime = abs.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const fileUrl = `data:${mime};base64,` + fs.readFileSync(abs).toString('base64');
    const out = await page.evaluate(async ({ fileUrl, rects }) => {
      const imgEl = new Image();
      await new Promise((res, rej) => { imgEl.onload = res; imgEl.onerror = rej; imgEl.src = fileUrl; });
      const w = imgEl.naturalWidth, h = imgEl.naturalHeight;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(imgEl, 0, 0);
      const data = cx.getImageData(0, 0, w, h).data;
      return rects.map(({ x, y, w: rw, h: rh, label }) => {
        let r = 0, g = 0, b = 0, n = 0;
        let mn = 255, mx = 0;
        for (let yy = y; yy < y + rh; yy++) {
          for (let xx = x; xx < x + rw; xx++) {
            const i = (yy * w + xx) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
            const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            if (l < mn) mn = l; if (l > mx) mx = l;
          }
        }
        return { label, rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], lumRange: [Math.round(mn), Math.round(mx)] };
      });
    }, { fileUrl, rects });
    console.log(`\n--- rects on ${img}`);
    for (const o of out) console.log(`  ${o.label}: rgb(${o.rgb.join(',')}) lum ${o.lumRange[0]}..${o.lumRange[1]}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
