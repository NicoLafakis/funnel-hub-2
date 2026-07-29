// Generate the generic (non-metro-specific) seamless tileable facade textures.
// Superseded for per-metro art by scripts/generate-metro-art.js; kept as the
// one-shot generator for the shared fallback facades in assets/textures/.
// API key: env PIXELLAB_API_KEY, or a .pixellab-key file in the repo root (gitignored).
const { callTool, extractText, sleep } = require('./pixellab');

async function main() {
  const facades = [
    {
      name: 'facade_apartment_tile',
      desc: 'Seamless tileable pixel art brick wall texture with evenly spaced windows. Red-brown brick pattern with small rectangular windows in a regular grid. Building facade texture for 3D game, must tile seamlessly in both directions.',
      w: 64, h: 64,
    },
    {
      name: 'facade_office_tile',
      desc: 'Seamless tileable pixel art modern glass curtain wall texture. Blue-tinted reflective glass windows in a steel grid frame pattern. Corporate building facade for 3D game, must tile seamlessly in both directions.',
      w: 64, h: 64,
    },
    {
      name: 'facade_concrete_tile',
      desc: 'Seamless tileable pixel art concrete wall texture with small windows. Grey concrete panels with evenly spaced rectangular windows. Generic city building facade for 3D game, must tile seamlessly in both directions.',
      w: 64, h: 64,
    },
    {
      name: 'facade_storefront',
      desc: 'Seamless tileable pixel art small storefront facade. Colorful shop fronts with awnings, display windows, and signage. Street-level commercial building for 3D city game, must tile seamlessly horizontally.',
      w: 64, h: 64,
    },
  ];

  for (const f of facades) {
    console.log(`Creating ${f.name}...`);
    const result = await callTool('create_image_pro', {
      description: f.desc,
      width: f.w,
      height: f.h,
      no_background: false,
    });
    console.log(`  -> ${extractText(result).slice(0, 250)}`);
    await sleep(500);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
