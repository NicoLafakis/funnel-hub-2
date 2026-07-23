// Copies node_modules/three/build/three.module.js into assets/vendor/three.module.js
// so index.html can load it via an import map (bare specifier 'three') without a
// bundler. Also copies three.core.js, which three.module.js imports internally
// (r167+ splits the build into two files). Runs automatically on `npm install`
// (see package.json "postinstall"), and can be re-run manually via
// `npm run vendor-three`.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'assets', 'vendor');
const files = ['three.module.js', 'three.core.js'];

function main() {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const file of files) {
    const src = path.join(root, 'node_modules', 'three', 'build', file);
    const dest = path.join(destDir, file);

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

    console.log(`[vendor-three] Vendored ${file} -> ${dest} (${stat.size} bytes)`);
  }
}

main();
