// One-shot generator for the shared ground tiles, generic building facades, and
// the HUD font. Submits jobs and records their ids in art-generation-jobs.json;
// scripts/download-art.js fetches the finished assets.
// Superseded for per-metro art by scripts/generate-metro-art.js.
// API key: env PIXELLAB_API_KEY, or a .pixellab-key file in the repo root (gitignored).
const fs = require('fs');
const path = require('path');
const { callTool, extractText, sleep, ROOT } = require('./pixellab');

async function main() {
  console.log('=== PixelLab Art Generation for Flywheel ===\n');
  const allJobs = {};

  // ---- GROUND TEXTURES (create_tiles_pro) ----
  // Valid tile_type: 'hex', 'hex_pointy', 'isometric', 'oblique', 'octagon', 'square_topdown'
  const tileDescs = [
    { name: 'asphalt', desc: 'Dark grey asphalt road surface with subtle cracks and worn urban texture. City street pavement.' },
    { name: 'sidewalk', desc: 'Light grey concrete sidewalk with subtle expansion joints and slightly weathered surface. Clean urban pedestrian path.' },
    { name: 'grass', desc: 'Lush green grass lawn with subtle texture variation. City park ground, manicured but natural looking.' },
    { name: 'parking', desc: 'Dark asphalt parking lot surface with faded white parking space line markings. Worn commercial parking area.' },
  ];

  for (let i = 0; i < tileDescs.length; i++) {
    const td = tileDescs[i];
    console.log(`[${i + 1}/7] Creating ${td.name} tile...`);
    const result = await callTool('create_tiles_pro', {
      description: td.desc,
      tile_type: 'square_topdown',
      tile_size: 32,
    });
    const text = extractText(result);
    console.log(`  -> ${td.name}:`, text.slice(0, 300));
    allJobs[td.name] = { type: 'tile', text };
    await sleep(500);
  }

  // ---- BUILDING FACADE TEXTURES (create_image_pixflux) ----
  // Valid view: 'side', 'low top-down', 'high top-down'
  const facades = [
    { name: 'facade_apartment', desc: 'Pixel art brick apartment building facade with windows, fire escape ladders, and colorful awnings. Warm red-brown brick with varied window patterns. Urban residential building side view, seamless tileable.' },
    { name: 'facade_office', desc: 'Pixel art modern glass office building facade with reflective blue-tinted windows in a grid pattern. Steel and concrete frame, corporate skyscraper side view, seamless tileable.' },
  ];

  for (let i = 0; i < facades.length; i++) {
    const f = facades[i];
    console.log(`[${i + 5}/7] Creating ${f.name}...`);
    const result = await callTool('create_image_pixflux', {
      description: f.desc,
      width: 128,
      height: 128,
      no_background: false,
      view: 'side',
    });
    const text = extractText(result);
    console.log(`  -> ${f.name}:`, text.slice(0, 300));
    allJobs[f.name] = { type: 'image', text };
    await sleep(500);
  }

  // ---- CUSTOM FONT ----
  // Valid weight: 'Bold', 'Regular' (case-sensitive)
  console.log('[7/7] Creating custom pixel font...');
  const fontResult = await callTool('create_font', {
    description: 'Bold chunky arcade game font with thick strokes. Playful but readable, perfect for a city destruction game HUD. Slightly rounded edges, energetic feel.',
    weight: 'Bold',
    glyph_px: 16,
    font_name: 'FlywheelArcade',
  });
  const fontText = extractText(fontResult);
  console.log('  -> Font:', fontText.slice(0, 300));
  allJobs.font = { type: 'font', text: fontText };

  const jobsPath = path.join(ROOT, 'art-generation-jobs.json');
  allJobs.timestamp = new Date().toISOString();
  fs.writeFileSync(jobsPath, JSON.stringify(allJobs, null, 2));
  console.log('\n=== All jobs submitted! Saved to art-generation-jobs.json ===');
}

main().catch(e => { console.error(e); process.exit(1); });
