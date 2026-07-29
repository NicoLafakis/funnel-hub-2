/* Minimal dependency-free PNG decoder + a seam metric for judging how well a
   texture wraps. Used by scripts/check-tileability.js and by the art pipeline
   to keep the better of two generations when a texture is regenerated.

   seamScore() returns { h, v, score } as mean absolute RGB difference (0-255)
   between the left/right columns and the top/bottom rows. 0 = a perfect wrap;
   anything under ~25 reads as seamless in-game at typical repeat densities.
*/
const fs = require('fs');
const zlib = require('zlib');

// Decodes an 8-bit RGB/RGBA non-interlaced PNG (what PixelLab returns) into
// raw pixel bytes. Throws on anything else rather than guessing.
function decodePng(file) {
  const b = fs.readFileSync(file);
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  const bitDepth = b.readUInt8(24);
  const colorType = b.readUInt8(25);
  const interlace = b.readUInt8(28);
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${bitDepth}, colorType ${colorType}, interlace ${interlace}): ${file}`);
  }
  const bpp = colorType === 6 ? 4 : 3;

  const chunks = [];
  let off = 8;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') chunks.push(b.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * bpp + 1;
  const out = Buffer.alloc(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    for (let x = 0; x < width * bpp; x++) {
      const rv = raw[y * stride + 1 + x];
      const a = x >= bpp ? out[y * width * bpp + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * width * bpp + x] : 0;
      const ul = x >= bpp && y > 0 ? out[(y - 1) * width * bpp + x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = rv; break;
        case 1: v = rv + a; break;
        case 2: v = rv + up; break;
        case 3: v = rv + ((a + up) >> 1); break;
        case 4: {
          const p = a + up - ul;
          const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul);
          v = rv + (pa <= pb && pa <= pc ? a : (pb <= pc ? up : ul));
          break;
        }
        default: v = rv;
      }
      out[y * width * bpp + x] = v & 255;
    }
  }
  return { width, height, bpp, data: out };
}

function seamScore(file) {
  const { width, height, bpp, data } = decodePng(file);
  let hx = 0, vy = 0;
  for (let y = 0; y < height; y++) {
    for (let k = 0; k < 3; k++) {
      hx += Math.abs(data[(y * width) * bpp + k] - data[(y * width + width - 1) * bpp + k]);
    }
  }
  for (let x = 0; x < width; x++) {
    for (let k = 0; k < 3; k++) {
      vy += Math.abs(data[x * bpp + k] - data[((height - 1) * width + x) * bpp + k]);
    }
  }
  const h = hx / (height * 3);
  const v = vy / (width * 3);
  return { h: Math.round(h), v: Math.round(v), score: Math.round(h + v) };
}

// Fraction of pixels that are effectively transparent (alpha < 16), 0-1.
// 0 for an RGB image with no alpha channel.
function transparentFraction(file) {
  const { width, height, bpp, data } = decodePng(file);
  if (bpp !== 4) return 0;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) n++;
  return n / (width * height);
}

module.exports = { decodePng, seamScore, transparentFraction };
