import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
copyRecursive(path.join(root, 'index.html'), path.join(dist, 'index.html'));
if (fs.existsSync(path.join(root, 'assets'))) {
  copyRecursive(path.join(root, 'assets'), path.join(dist, 'assets'));
}
if (fs.existsSync(path.join(root, 'src'))) {
  copyRecursive(path.join(root, 'src'), path.join(dist, 'src'));
}
console.log(`Built ${dist}`);
