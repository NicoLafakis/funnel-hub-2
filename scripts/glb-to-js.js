// GLB -> JS data-module converter for the Blender prop pack (zero deps).
//
// The runtime never loads glTF (B1: only the vendored three core files exist,
// no GLTFLoader). This script parses each assets/models/<name>.glb by hand —
// 12-byte header, chunk 0 = JSON, chunk 1 = BIN — reads the accessor /
// bufferView tables, and emits assets/models/<name>.js:
//
//   export default {
//     positions: "<base64 f32 LE>", normals: "<base64 f32 LE>",
//     colors: "<base64 f32 LE>", indices: "<base64 u16/u32 LE>",
//     indexType: 16|32,
//   }
//
// src/content/modelkit.js decodes these with atob() into BufferGeometry.
// Supported inputs: float32 POSITION/NORMAL (VEC3), COLOR_0 as float32 or
// normalized uint8/uint16 (VEC3/VEC4), indices uint8/uint16/uint32, node TRS
// transforms, multiple primitives per mesh. Missing COLOR_0 falls back to the
// primitive material's baseColorFactor, then to white.
//
// Usage: node scripts/glb-to-js.js [glbDir]   (default assets/models)

import fs from 'node:fs';
import path from 'node:path';

const MODEL_DIR = process.argv[2] || 'assets/models';

const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  if (buf.readUInt32LE(4) !== 2) throw new Error('not glTF 2');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8')); // 'JSON'
    else if (type === 0x004e4942) bin = chunk; // 'BIN\0'
    offset += 8 + len;
  }
  if (!json || !bin) throw new Error('missing JSON or BIN chunk');
  return { json, bin };
}

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const Type = CT[acc.componentType];
  const n = NCOMP[acc.type];
  const stride = view.byteStride || n * Type.BYTES_PER_ELEMENT;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Type(acc.count * n);
  if (stride === n * Type.BYTES_PER_ELEMENT) {
    const src = new Type(bin.buffer, bin.byteOffset + base, acc.count * n);
    out.set(src);
  } else {
    for (let i = 0; i < acc.count; i += 1) {
      const o = base + i * stride;
      for (let c = 0; c < n; c += 1) out[i * n + c] = new Type(bin.buffer, bin.byteOffset + o + c * Type.BYTES_PER_ELEMENT, 1)[0];
    }
  }
  return { data: out, count: acc.count, n, componentType: acc.componentType, normalized: !!acc.normalized };
}

// Minimal TRS -> mat4 (column-major) for node transforms.
function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const x2 = qx + qx; const y2 = qy + qy; const z2 = qz + qz;
  const xx = qx * x2; const xy = qx * y2; const xz = qx * z2;
  const yy = qy * y2; const yz = qy * z2; const zz = qz * z2;
  const wx = qw * x2; const wy = qw * y2; const wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function applyMat4(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function applyMat3(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
}

function convert(file) {
  const { json, bin } = parseGlb(fs.readFileSync(file));
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vertexOffset = 0;
  let hasColors = false;

  // node index -> world matrix (scene roots only — the prop pack is flat).
  const nodes = json.nodes || [];
  const meshNodes = nodes.map((node, i) => ({ node, i })).filter((e) => e.node.mesh !== undefined);

  for (const { node } of meshNodes) {
    const m = nodeMatrix(node);
    const mesh = json.meshes[node.mesh];
    for (const prim of mesh.primitives) {
      const pos = readAccessor(json, bin, prim.attributes.POSITION);
      const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(json, bin, prim.attributes.NORMAL) : null;
      const col = prim.attributes.COLOR_0 !== undefined ? readAccessor(json, bin, prim.attributes.COLOR_0) : null;
      for (let i = 0; i < pos.count; i += 1) {
        const p = applyMat4(m, pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]);
        positions.push(p[0], p[1], p[2]);
        if (nrm) {
          const nv = applyMat3(m, nrm.data[i * 3], nrm.data[i * 3 + 1], nrm.data[i * 3 + 2]);
          const len = Math.hypot(nv[0], nv[1], nv[2]) || 1;
          normals.push(nv[0] / len, nv[1] / len, nv[2] / len);
        } else {
          normals.push(0, 1, 0);
        }
        if (col) {
          let r = col.data[i * col.n];
          let g = col.data[i * col.n + 1];
          let b = col.data[i * col.n + 2];
          if (col.normalized && col.componentType === 5121) { r /= 255; g /= 255; b /= 255; }
          if (col.normalized && col.componentType === 5123) { r /= 65535; g /= 65535; b /= 65535; }
          colors.push(r, g, b);
        } else {
          colors.push(1, 1, 1);
        }
      }
      if (col) hasColors = true;
      if (!col && prim.material !== undefined && json.materials) {
        // Per-face material -> vertex color fallback (baseColorFactor).
        const factor = (json.materials[prim.material].pbrMetallicRoughness || {}).baseColorFactor;
        if (factor) {
          for (let i = 0; i < pos.count; i += 1) {
            colors.splice(colors.length - 3, 3, factor[0], factor[1], factor[2]);
          }
        }
      }
      if (prim.indices !== undefined) {
        const idx = readAccessor(json, bin, prim.indices);
        for (let i = 0; i < idx.count; i += 1) indices.push(idx.data[i] + vertexOffset);
      } else {
        for (let i = 0; i < pos.count; i += 1) indices.push(i + vertexOffset);
      }
      vertexOffset += pos.count;
    }
  }

  const indexType = vertexOffset > 65535 ? 32 : 16;
  const IndexArray = indexType === 32 ? Uint32Array : Uint16Array;
  const payload = {
    positions: Buffer.from(new Float32Array(positions).buffer).toString('base64'),
    normals: Buffer.from(new Float32Array(normals).buffer).toString('base64'),
    colors: Buffer.from(new Float32Array(colors).buffer).toString('base64'),
    indices: Buffer.from(new IndexArray(indices).buffer).toString('base64'),
    indexType,
  };
  return {
    payload,
    stats: { vertices: vertexOffset, triangles: indices.length / 3, colors: hasColors },
  };
}

const files = fs.readdirSync(MODEL_DIR).filter((f) => f.endsWith('.glb'));
if (!files.length) {
  console.error(`no .glb files in ${MODEL_DIR} — run scripts/blender/build_props.py first`);
  process.exit(1);
}
for (const file of files) {
  const name = path.basename(file, '.glb');
  const { payload, stats } = convert(path.join(MODEL_DIR, file));
  const out = `// Generated by scripts/glb-to-js.js from assets/models/${file} — do not edit.
// Rebuild: "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python scripts/blender/build_props.py && node scripts/glb-to-js.js
export default {
  positions: "${payload.positions}",
  normals: "${payload.normals}",
  colors: "${payload.colors}",
  indices: "${payload.indices}",
  indexType: ${payload.indexType},
};
`;
  fs.writeFileSync(path.join(MODEL_DIR, `${name}.js`), out);
  console.log(`${name}: ${stats.vertices} verts, ${stats.triangles} tris, COLOR_0=${stats.colors ? 'yes' : 'NO'}`);
}
