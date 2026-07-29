#!/usr/bin/env node
/* Reports how cleanly each generated metro texture wraps, and how transparent
   each icon is — the two things that silently ruin generated art in-game.

   Usage:
     node scripts/check-tileability.js            # ground textures (street/sidewalk)
     node scripts/check-tileability.js --all      # every texture
     node scripts/check-tileability.js --icons    # icon transparency instead
     node scripts/check-tileability.js --worst 8  # only the N worst rows

   Score is a mean absolute RGB edge difference (0-255). Under ~25 reads as
   seamless in-game; ground textures matter most because they repeat many times
   across the plane, while a facade repeats once or twice per building face.
*/
const path = require('path');
const { ROOT, isValidPng } = require('./pixellab');
const { buildJobs } = require('./art-spec');
const { seamScore, transparentFraction } = require('./png-tiling');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : null; };

const GOOD = 25;

function main() {
  const jobs = buildJobs().filter(j => isValidPng(path.join(ROOT, j.relPath)));

  if (has('--icons')) {
    const rows = jobs
      .filter(j => j.category === 'icon')
      .map(j => ({ key: j.key, pct: Math.round(transparentFraction(path.join(ROOT, j.relPath)) * 100) }))
      .sort((a, b) => a.pct - b.pct);
    console.log('Icon transparency (low = icon fills the whole tile, may look like a sticker):');
    rows.slice(0, val('--worst') || rows.length).forEach(r => console.log(`  ${String(r.pct).padStart(3)}%  ${r.key}`));
    console.log(`\n${rows.filter(r => r.pct >= 20).length}/${rows.length} icons have a healthy transparent margin (>=20%).`);
    return;
  }

  const wanted = has('--all')
    ? j => j.category === 'texture'
    : j => j.category === 'texture' && (j.slot === 'street' || j.slot === 'sidewalk');

  const rows = jobs.filter(wanted)
    .map(j => ({ key: j.key.replace('texture/', ''), ...seamScore(path.join(ROOT, j.relPath)) }))
    .sort((a, b) => b.score - a.score);

  console.log('Texture edge mismatch (0 = perfect seamless wrap):');
  rows.slice(0, val('--worst') || rows.length).forEach(r => {
    const mark = r.h < GOOD && r.v < GOOD ? 'ok  ' : 'SEAM';
    console.log(`  ${mark} ${String(r.score).padStart(4)}  h=${String(r.h).padStart(3)} v=${String(r.v).padStart(3)}  ${r.key}`);
  });
  const clean = rows.filter(r => r.h < GOOD && r.v < GOOD).length;
  console.log(`\n${clean}/${rows.length} tile cleanly (both edges under ${GOOD}).`);
}

main();
