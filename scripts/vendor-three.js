// Copies node_modules/three/build/three.module.js into assets/vendor/three.module.js
// so index.html can load it via an import map (bare specifier 'three') without a
// bundler. Also copies three.core.js, which three.module.js imports internally
// (r167+ splits the build into two files). Runs automatically on `npm install`
// (see package.json "postinstall"), and can be re-run manually via
// `npm run vendor-three`.
//
// It ALSO vendors the examples/jsm addons the postprocessing chain in
// src/engine/scene.js imports (EffectComposer + RenderPass + BokehPass depth of
// field + UnrealBloomPass selective bloom, plus everything those import
// transitively). These are copied verbatim — they import three via the bare
// 'three' specifier, which resolves through index.html's import map in the
// browser and through node_modules in the headless test suite, so no rewriting
// is needed. Keeping them here (rather than as one-off manual copies) means
// `npm install` re-vendors every addon at exactly the installed three version,
// so an addon can never silently drift out of sync with three.module.js.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'assets', 'vendor');
const files = ['three.module.js', 'three.core.js'];

// [subdirectory under examples/jsm (and under assets/vendor/), file name]
// Dependency notes:
//   EffectComposer -> CopyShader, ShaderPass, MaskPass
//   RenderPass/ShaderPass/MaskPass/BokehPass/UnrealBloomPass -> Pass
//   BokehPass -> BokehShader
//   UnrealBloomPass -> CopyShader, LuminosityHighPassShader
const addons = [
  ['postprocessing', 'EffectComposer.js'],
  ['postprocessing', 'Pass.js'],
  ['postprocessing', 'RenderPass.js'],
  ['postprocessing', 'ShaderPass.js'],
  ['postprocessing', 'MaskPass.js'],
  ['postprocessing', 'BokehPass.js'],
  ['postprocessing', 'UnrealBloomPass.js'],
  ['shaders', 'CopyShader.js'],
  ['shaders', 'BokehShader.js'],
  ['shaders', 'LuminosityHighPassShader.js'],
];

function copyVerified(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.error(
      `[vendor-three] Source not found: ${src}\n` +
      `[vendor-three] Did "npm install" run and install the "three" package?`
    );
    process.exit(1);
  }

  fs.copyFileSync(src, dest);

  const stat = fs.statSync(dest);
  if (!stat.isFile() || stat.size <= 0) {
    console.error(`[vendor-three] Copy failed or produced an empty file: ${dest}`);
    process.exit(1);
  }

  console.log(`[vendor-three] Vendored ${label} -> ${dest} (${stat.size} bytes)`);
}

function main() {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const file of files) {
    copyVerified(
      path.join(root, 'node_modules', 'three', 'build', file),
      path.join(destDir, file),
      file
    );
  }

  for (const [subdir, file] of addons) {
    const outDir = path.join(destDir, subdir);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    copyVerified(
      path.join(root, 'node_modules', 'three', 'examples', 'jsm', subdir, file),
      path.join(outDir, file),
      `${subdir}/${file}`
    );
  }
}

main();
