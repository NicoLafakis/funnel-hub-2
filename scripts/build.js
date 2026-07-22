const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
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
console.log(`Built ${dist}`);
