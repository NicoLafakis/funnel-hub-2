// Procedural prop mesh kit: builds small/medium/large city clutter from
// primitive THREE geometries only (Box/Cylinder/Cone/Sphere), recolored per
// metro via an accent hex so each metro's props read as visually distinct.
//
// Shared-THREE pattern: THREE is always passed in explicitly by the caller
// (see src/engine/scene.js's header comment for the full rationale) — this
// module never does its own `import * as THREE from 'three'` and never
// touches document/window/localStorage at module top level, so a bare Node
// `import` of this file is always safe (no GPU/DOM required).
//
// Exact `kind` strings are a CONTRACT with src/data/levels.js's LEVEL_TEMPLATE
// — keep in sync: 'trash' | 'bike' | 'car' | 'bus' | 'building-small' |
// 'building-medium' | 'building-large'.
//
// Additional kinds used by src/content/citylayout.js (the level-1 authored
// city): 'tree' | 'streetlight' | 'bench' | 'mailbox' | 'hydrant' |
// 'speed-bump' | 'apartment' | 'office'. These use fixed real-world palettes
// (a hydrant is red, a mailbox is blue) rather than the metro accent, so the
// level-1 city reads as a real city; the 7 template kinds stay accent-tinted.

const DEFAULT_ACCENT = '#9aa3ad';

// Optional facade-texture registry. main.js loads PixelLab-generated PNGs
// (assets/textures/) at bootstrap and registers them here via
// setPropTextures(); builders then map them onto the big box surfaces that
// otherwise read as flat untextured slabs (the "background looks terrible"
// complaint). Headless tests never call setPropTextures, so TEXTURES stays
// null and every builder falls back to its original flat-color behavior —
// byte-identical to before this registry existed.
let TEXTURES = null;
export function setPropTextures(textures) {
  TEXTURES = textures || null;
}

// Six-material array for a building box (BoxGeometry face order: +x,-x,+y,
// -y,+z,-z): the four sides get the facade texture with repeat scaled so a
// window reads ~3 world units regardless of building size; top/bottom get a
// plain darker cap so the roof doesn't smear the facade. With no texture,
// returns the flat wall material on every face (original behavior).
function buildingBoxMaterials(THREE, baseColor, texture, dim, opts = {}) {
  const cap = standardMat(THREE, shade(THREE, baseColor, -0.12), opts);
  if (!texture) {
    const flat = standardMat(THREE, baseColor, opts);
    return [flat, flat, cap, cap, flat, flat];
  }
  const map = texture.clone();
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(Math.max(0.25, dim.w / 26), Math.max(0.25, dim.h / 30));
  const side = standardMat(THREE, baseColor, opts);
  side.map = map;
  return [side, side, cap, cap, side, side];
}

function resolveColor(THREE, hex) {
  const color = new THREE.Color();
  if (typeof hex === 'string' || typeof hex === 'number') {
    color.set(hex);
  } else {
    color.set(DEFAULT_ACCENT);
  }
  return color;
}

// A lighter/darker (and optionally more/less saturated) variant of a base
// color, by nudging it in HSL space — cheap way to get a believable palette
// (body/cabin/trim/glass) out of a single metro accent hex.
function shade(THREE, color, deltaL, deltaS = 0) {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const out = new THREE.Color();
  out.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s + deltaS)), Math.min(1, Math.max(0, hsl.l + deltaL)));
  return out;
}

function standardMat(THREE, color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

// Per-kind footprint/height in world units. Deliberately modest (props sit in
// the ~1-45 unit range) relative to the avatar's own radius() formula
// (26 + sqrt(mass)*1.9, see src/engine/avatar.js radius()) so a small/young
// avatar reads as dwarfed by a building-large while trash/bike read as
// plausibly swallowable early on. Every prop's local origin sits at its own
// base footprint center (y=0 is "on the ground"), not its geometric center,
// so placement code can drop it straight onto a ground plane.
const DIMENSIONS = {
  trash: { w: 1.1, h: 0.9, d: 1.1 },
  bike: { w: 0.55, h: 1.3, d: 1.8 },
  car: { w: 2.0, h: 1.5, d: 4.2 },
  bus: { w: 2.6, h: 3.0, d: 9.0 },
  'building-small': { w: 7, h: 11, d: 7 },
  'building-medium': { w: 11, h: 24, d: 11 },
  'building-large': { w: 15, h: 42, d: 15 },
  // Level-1 authored-city kinds (src/content/citylayout.js).
  tree: { w: 3.2, h: 6.5, d: 3.2 },
  streetlight: { w: 0.9, h: 6.2, d: 0.9 },
  bench: { w: 2.4, h: 1.0, d: 0.9 },
  mailbox: { w: 1.0, h: 1.4, d: 0.8 },
  hydrant: { w: 0.9, h: 1.2, d: 0.9 },
  'speed-bump': { w: 3.2, h: 0.35, d: 0.9 },
  apartment: { w: 11, h: 24, d: 11 },
  office: { w: 15, h: 42, d: 15 },
};

function buildTrash(THREE, accent) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.trash;

  const bodyMat = standardMat(THREE, shade(THREE, accent, -0.1), { roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h, dim.d), bodyMat);
  body.position.set(0, dim.h / 2, 0);
  body.rotation.y = 0.35;
  group.add(body);

  // Squashed sphere "lid bulge" for a lumpy, non-perfectly-boxy silhouette.
  const lidMat = standardMat(THREE, shade(THREE, accent, 0.15), { roughness: 0.6 });
  const lid = new THREE.Mesh(new THREE.SphereGeometry(dim.w * 0.42, 8, 6), lidMat);
  lid.position.set(dim.w * 0.15, dim.h * 0.92, 0);
  lid.scale.set(1, 0.5, 1);
  group.add(lid);

  return group;
}

function buildBike(THREE, accent) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.bike;

  const frameMat = standardMat(THREE, accent, { metalness: 0.4, roughness: 0.5 });
  const wheelMat = standardMat(THREE, shade(THREE, accent, -0.35), { roughness: 0.8 });

  const wheelRadius = dim.h * 0.32;
  const wheelGeo = new THREE.TorusGeometry(wheelRadius, wheelRadius * 0.16, 6, 12);

  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rearWheel.position.set(0, wheelRadius, -dim.d * 0.32);
  rearWheel.rotation.y = Math.PI / 2;
  group.add(rearWheel);

  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.position.set(0, wheelRadius, dim.d * 0.32);
  frontWheel.rotation.y = Math.PI / 2;
  group.add(frontWheel);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h * 0.16, dim.d * 0.62), frameMat);
  frame.position.set(0, wheelRadius * 1.5, 0);
  group.add(frame);

  const seatPost = new THREE.Mesh(
    new THREE.CylinderGeometry(dim.w * 0.3, dim.w * 0.3, dim.h * 0.5, 6),
    frameMat
  );
  seatPost.position.set(0, wheelRadius * 2.1, -dim.d * 0.22);
  group.add(seatPost);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 1.8, dim.w * 0.3, dim.w * 0.3), frameMat);
  handle.position.set(0, wheelRadius * 2.3, dim.d * 0.3);
  group.add(handle);

  return group;
}

function buildWheel(THREE, radius, width, material) {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 10);
  const wheelMesh = new THREE.Mesh(geo, material);
  wheelMesh.rotation.z = Math.PI / 2;
  return wheelMesh;
}

function buildCar(THREE, accent) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.car;

  const bodyMat = standardMat(THREE, accent, { metalness: 0.35, roughness: 0.45 });
  const cabinMat = standardMat(THREE, shade(THREE, accent, 0.2), { metalness: 0.2, roughness: 0.3 });
  const wheelMat = standardMat(THREE, 0x141414, { roughness: 0.9 });

  const wheelRadius = dim.h * 0.26;
  const body = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h * 0.55, dim.d), bodyMat);
  body.position.set(0, wheelRadius + dim.h * 0.275, 0);
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.82, dim.h * 0.5, dim.d * 0.45), cabinMat);
  cabin.position.set(0, wheelRadius + dim.h * 0.55 + dim.h * 0.25, -dim.d * 0.05);
  group.add(cabin);

  const wheelPositions = [
    [dim.w / 2, wheelRadius, dim.d * 0.32],
    [-dim.w / 2, wheelRadius, dim.d * 0.32],
    [dim.w / 2, wheelRadius, -dim.d * 0.32],
    [-dim.w / 2, wheelRadius, -dim.d * 0.32],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = buildWheel(THREE, wheelRadius, dim.w * 0.18, wheelMat);
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  return group;
}

function buildBus(THREE, accent) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.bus;

  const bodyMat = standardMat(THREE, accent, { metalness: 0.25, roughness: 0.55 });
  const stripeMat = standardMat(THREE, shade(THREE, accent, 0.3), { roughness: 0.4 });
  const wheelMat = standardMat(THREE, 0x141414, { roughness: 0.9 });

  const wheelRadius = dim.h * 0.16;
  const body = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h - wheelRadius, dim.d), bodyMat);
  body.position.set(0, wheelRadius + (dim.h - wheelRadius) / 2, 0);
  group.add(body);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 1.01, dim.h * 0.18, dim.d * 1.01), stripeMat);
  stripe.position.set(0, wheelRadius + dim.h * 0.5, 0);
  group.add(stripe);

  const wheelZs = [dim.d * 0.34, dim.d * 0.02, -dim.d * 0.34];
  for (const z of wheelZs) {
    for (const x of [dim.w / 2, -dim.w / 2]) {
      const wheel = buildWheel(THREE, wheelRadius, dim.w * 0.16, wheelMat);
      wheel.position.set(x, wheelRadius, z);
      group.add(wheel);
    }
  }

  return group;
}

function buildBuilding(THREE, accent, dim, opts = {}) {
  const group = new THREE.Group();

  const wallOpts = { roughness: 0.85, metalness: 0.05 };
  const windowColor = shade(THREE, accent, 0.35);
  const windowMat = standardMat(THREE, windowColor, {
    roughness: 0.3,
    metalness: 0.1,
    emissive: windowColor,
    emissiveIntensity: 0.15,
  });

  // Template buildings stay accent-tinted per metro; the neutral concrete
  // facade texture (when registered) multiplies with that tint, so each
  // metro keeps its palette but gains real windows instead of a flat slab.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(dim.w, dim.h, dim.d),
    buildingBoxMaterials(THREE, accent, TEXTURES && TEXTURES.concrete, dim, wallOpts)
  );
  base.position.set(0, dim.h / 2, 0);
  group.add(base);

  // Window band(s) only when no facade texture is present — with a texture
  // the facade already carries windows and the emissive bands double up.
  const bandCount = TEXTURES && TEXTURES.concrete ? 0 : (opts.tiers ? 3 : 1);
  for (let i = 0; i < bandCount; i += 1) {
    const t = (i + 1) / (bandCount + 1);
    const band = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 1.02, dim.h * 0.08, dim.d * 1.02), windowMat);
    band.position.set(0, dim.h * t, 0);
    group.add(band);
  }

  if (opts.tiers) {
    const setbackH = dim.h * 0.22;
    const setback = new THREE.Mesh(
      new THREE.BoxGeometry(dim.w * 0.6, setbackH, dim.d * 0.6),
      buildingBoxMaterials(
        THREE, accent, TEXTURES && TEXTURES.concrete,
        { w: dim.w * 0.6, h: setbackH, d: dim.d * 0.6 }, wallOpts
      )
    );
    setback.position.set(0, dim.h + setbackH / 2, 0);
    group.add(setback);

    const antennaH = dim.h * 0.25;
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(dim.w * 0.03, dim.w * 0.03, antennaH, 6),
      standardMat(THREE, 0x8a8f96, { metalness: 0.6, roughness: 0.4 })
    );
    antenna.position.set(0, dim.h + setbackH + antennaH / 2, 0);
    group.add(antenna);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(dim.w * 0.05, 6, 6),
      standardMat(THREE, 0xff3b30, { emissive: 0xff3b30, emissiveIntensity: 1 })
    );
    beacon.position.set(0, dim.h + setbackH + antennaH, 0);
    group.add(beacon);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Level-1 authored-city builders (src/content/citylayout.js). Fixed real-world
// palettes — these read as specific street objects, not metro-tinted clutter.
// ---------------------------------------------------------------------------

function buildTree(THREE) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.tree;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(dim.w * 0.09, dim.w * 0.13, dim.h * 0.42, 7),
    standardMat(THREE, 0x6b4a2f, { roughness: 0.95 })
  );
  trunk.position.set(0, dim.h * 0.21, 0);
  group.add(trunk);

  // Two stacked foliage blobs for a lumpy deciduous silhouette.
  const foliageMat = standardMat(THREE, 0x3e7d3a, { roughness: 0.9 });
  const foliageDark = standardMat(THREE, 0x2f6230, { roughness: 0.9 });
  const lower = new THREE.Mesh(new THREE.SphereGeometry(dim.w * 0.46, 8, 6), foliageDark);
  lower.position.set(0, dim.h * 0.55, 0);
  lower.scale.set(1, 0.85, 1);
  group.add(lower);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(dim.w * 0.36, 8, 6), foliageMat);
  upper.position.set(0, dim.h * 0.78, 0);
  group.add(upper);

  return group;
}

function buildStreetlight(THREE) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.streetlight;

  const poleMat = standardMat(THREE, 0x3a3f45, { metalness: 0.5, roughness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(dim.w * 0.16, dim.w * 0.22, dim.h * 0.92, 6), poleMat);
  pole.position.set(0, dim.h * 0.46, 0);
  group.add(pole);

  // Curved-arm stand-in: a horizontal box reaching out over the road (+z),
  // with a warm emissive lamp head at its tip.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.18, dim.w * 0.18, dim.h * 0.3), poleMat);
  arm.position.set(0, dim.h * 0.9, dim.h * 0.13);
  group.add(arm);

  const lampMat = standardMat(THREE, 0xffe6a8, { emissive: 0xffd88a, emissiveIntensity: 0.9, roughness: 0.4 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.42, dim.w * 0.2, dim.h * 0.12), lampMat);
  lamp.position.set(0, dim.h * 0.88, dim.h * 0.26);
  group.add(lamp);

  return group;
}

function buildBench(THREE) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.bench;

  const woodMat = standardMat(THREE, 0x8a6239, { roughness: 0.85 });
  const ironMat = standardMat(THREE, 0x2e3236, { metalness: 0.5, roughness: 0.5 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h * 0.14, dim.d * 0.62), woodMat);
  seat.position.set(0, dim.h * 0.45, 0);
  group.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h * 0.42, dim.d * 0.12), woodMat);
  back.position.set(0, dim.h * 0.72, -dim.d * 0.38);
  back.rotation.x = -0.15;
  group.add(back);

  for (const x of [-dim.w * 0.42, dim.w * 0.42]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.07, dim.h * 0.45, dim.d * 0.7), ironMat);
    leg.position.set(x, dim.h * 0.225, 0);
    group.add(leg);
  }

  return group;
}

function buildMailbox(THREE) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.mailbox;

  const blueMat = standardMat(THREE, 0x2b4f9e, { metalness: 0.3, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h * 0.62, dim.d), blueMat);
  body.position.set(0, dim.h * 0.38, 0);
  group.add(body);

  // Rounded top: squashed sphere cap, the classic relay-box silhouette.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(dim.w * 0.5, 8, 6), blueMat);
  cap.position.set(0, dim.h * 0.69, 0);
  cap.scale.set(1, 0.55, dim.d / dim.w);
  group.add(cap);

  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(dim.w * 0.7, dim.h * 0.06, dim.d * 0.1),
    standardMat(THREE, 0x14181f, { roughness: 0.6 })
  );
  slot.position.set(0, dim.h * 0.58, dim.d * 0.48);
  group.add(slot);

  for (const x of [-dim.w * 0.32, dim.w * 0.32]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.1, dim.h * 0.12, dim.w * 0.1), blueMat);
    leg.position.set(x, dim.h * 0.06, 0);
    group.add(leg);
  }

  return group;
}

function buildHydrant(THREE) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.hydrant;

  const redMat = standardMat(THREE, 0xc03325, { metalness: 0.25, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(dim.w * 0.3, dim.w * 0.36, dim.h * 0.62, 8), redMat);
  body.position.set(0, dim.h * 0.36, 0);
  group.add(body);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(dim.w * 0.3, 8, 6), redMat);
  dome.position.set(0, dim.h * 0.67, 0);
  group.add(dome);

  const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(dim.w * 0.08, dim.w * 0.08, dim.h * 0.14, 6), redMat);
  bonnet.position.set(0, dim.h * 0.85, 0);
  group.add(bonnet);

  // Side nozzles.
  const nozzleMat = standardMat(THREE, 0x8f2318, { metalness: 0.35, roughness: 0.45 });
  for (const sign of [-1, 1]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(dim.w * 0.12, dim.w * 0.12, dim.w * 0.25, 6), nozzleMat);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(sign * dim.w * 0.36, dim.h * 0.45, 0);
    group.add(nozzle);
  }

  const base = new THREE.Mesh(new THREE.CylinderGeometry(dim.w * 0.42, dim.w * 0.46, dim.h * 0.1, 8), redMat);
  base.position.set(0, dim.h * 0.05, 0);
  group.add(base);

  return group;
}

function buildSpeedBump(THREE) {
  const group = new THREE.Group();
  const dim = DIMENSIONS['speed-bump'];

  // Low half-cylinder ridge, yellow with two dark hazard bands across the top.
  const ridge = new THREE.Mesh(
    new THREE.CylinderGeometry(dim.h, dim.h, dim.w, 10, 1, false, 0, Math.PI),
    standardMat(THREE, 0xd9a713, { roughness: 0.8 })
  );
  ridge.rotation.z = Math.PI / 2;
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, 0, 0);
  group.add(ridge);

  const bandMat = standardMat(THREE, 0x2b2b2b, { roughness: 0.85 });
  for (const x of [-dim.w * 0.25, dim.w * 0.25]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.14, dim.h * 0.5, dim.d * 0.9), bandMat);
    band.position.set(x, dim.h * 0.7, 0);
    group.add(band);
  }

  return group;
}

// Brick mid-rise with per-floor window strips and a parapet — the residential
// filler of the level-1 blocks (gameplay slot of 'building-medium').
function buildApartment(THREE) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.apartment;

  const brick = new THREE.Color(0x9a6b52);
  const trimMat = standardMat(THREE, 0x7d5340, { roughness: 0.9 });
  const windowColor = new THREE.Color(0xffe2b0);
  const windowMat = standardMat(THREE, windowColor, {
    roughness: 0.35,
    emissive: windowColor,
    emissiveIntensity: 0.25,
  });

  // Brick facade texture when registered (near-white tint so the texture's
  // own palette shows through); flat brick color otherwise.
  const facadeTex = TEXTURES && TEXTURES.apartment;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(dim.w, dim.h, dim.d),
    buildingBoxMaterials(THREE, facadeTex ? new THREE.Color(0xf2e8e0) : brick, facadeTex, dim, { roughness: 0.9, metalness: 0.02 })
  );
  base.position.set(0, dim.h / 2, 0);
  group.add(base);

  // One window strip every ~3.4 units of height reads as "one floor each" —
  // only without a facade texture, which already carries the window grid.
  if (!facadeTex) {
    const floors = Math.max(3, Math.floor(dim.h / 3.4));
    for (let i = 0; i < floors; i += 1) {
      const y = dim.h * ((i + 0.7) / (floors + 0.4));
      for (const rot of [0, Math.PI / 2]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.9, dim.h * 0.045, dim.d * 1.015), windowMat);
        strip.rotation.y = rot;
        strip.position.set(0, y, 0);
        group.add(strip);
      }
    }
  }

  const parapet = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 1.04, dim.h * 0.05, dim.d * 1.04), trimMat);
  parapet.position.set(0, dim.h * 1.01, 0);
  group.add(parapet);

  // Rooftop water tank — the instant "apartment building" tell.
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(dim.w * 0.14, dim.w * 0.14, dim.h * 0.12, 8),
    standardMat(THREE, 0x6e4f35, { roughness: 0.9 })
  );
  tank.position.set(dim.w * 0.22, dim.h * 1.1, dim.d * 0.18);
  group.add(tank);

  return group;
}

// Glass-curtain tower — the downtown slot filler (gameplay slot of
// 'building-large'). Cool glazing, vertical mullion strips, setback + antenna.
function buildOffice(THREE) {
  const group = new THREE.Group();
  const dim = DIMENSIONS.office;

  const glassColor = new THREE.Color(0x7fb2c9);
  const glassMat = standardMat(THREE, glassColor, {
    roughness: 0.25,
    metalness: 0.35,
    emissive: glassColor,
    emissiveIntensity: 0.12,
  });
  const coreMat = standardMat(THREE, 0x4c5a66, { roughness: 0.7, metalness: 0.2 });

  // Glass-curtain facade texture when registered; flat glass slab otherwise.
  const facadeTex = TEXTURES && TEXTURES.office;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(dim.w, dim.h, dim.d),
    buildingBoxMaterials(THREE, facadeTex ? new THREE.Color(0xffffff) : glassColor, facadeTex, dim, {
      roughness: 0.25,
      metalness: 0.35,
      emissive: glassColor,
      emissiveIntensity: 0.12,
    })
  );
  slab.position.set(0, dim.h / 2, 0);
  group.add(slab);

  // Horizontal floor bands so the curtain wall reads as stories, not a
  // monolith — only without a facade texture, which carries them already.
  if (!facadeTex) {
    const bandMat = standardMat(THREE, 0x33414c, { roughness: 0.5, metalness: 0.4 });
    const bands = Math.max(4, Math.floor(dim.h / 4.5));
    for (let i = 1; i < bands; i += 1) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 1.015, dim.h * 0.02, dim.d * 1.015), bandMat);
      band.position.set(0, dim.h * (i / bands), 0);
      group.add(band);
    }
  }

  const setbackH = dim.h * 0.18;
  const setback = new THREE.Mesh(new THREE.BoxGeometry(dim.w * 0.62, setbackH, dim.d * 0.62), coreMat);
  setback.position.set(0, dim.h + setbackH / 2, 0);
  group.add(setback);

  const antennaH = dim.h * 0.22;
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(dim.w * 0.03, dim.w * 0.03, antennaH, 6),
    standardMat(THREE, 0x8a8f96, { metalness: 0.6, roughness: 0.4 })
  );
  antenna.position.set(0, dim.h + setbackH + antennaH / 2, 0);
  group.add(antenna);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(dim.w * 0.045, 6, 6),
    standardMat(THREE, 0xff3b30, { emissive: 0xff3b30, emissiveIntensity: 1 })
  );
  beacon.position.set(0, dim.h + setbackH + antennaH, 0);
  group.add(beacon);

  return group;
}

// Visual-scale helper for the level-1 authored city. The template's gameplay
// radii (16-90, see LEVEL_TEMPLATE in src/data/levels.js) were never meant to
// equal mesh footprints (1-15 world units) — under the old random scatter the
// mismatch went unnoticed, but an authored street grid makes it glaring (a
// "car" 10x smaller than the player ball). scaleForRadius returns the uniform
// mesh scale that makes a prop's visual size match its swallow radius, so
// "looks smaller than your rim" and "passes the size gate" agree on screen.
//   - footprint mode (default): scale so max(w, d) fills 2*radius*FILL —
//     right for blobby props (trash, cars, buildings, trees).
//   - height mode: scale so h becomes 2*radius*FILL — right for thin poles
//     (streetlights), where footprint-matching would blow the pole up to a
//     30-unit-wide column.
const SCALE_FILL = 0.85;
const SCALE_MODE = { streetlight: 'height' };

export function scaleForRadius(kind, radius) {
  const dim = DIMENSIONS[kind] || { w: 2, h: 2, d: 2 };
  const target = 2 * Math.max(1, radius || 1) * SCALE_FILL;
  const basis = SCALE_MODE[kind] === 'height' ? dim.h : Math.max(dim.w, dim.d);
  return target / basis;
}

export function createPropMesh(kind, THREE, accentColorHex) {
  const accent = resolveColor(THREE, accentColorHex);
  switch (kind) {
    case 'trash':
      return buildTrash(THREE, accent);
    case 'bike':
      return buildBike(THREE, accent);
    case 'car':
      return buildCar(THREE, accent);
    case 'bus':
      return buildBus(THREE, accent);
    case 'building-small':
      return buildBuilding(THREE, accent, DIMENSIONS['building-small']);
    case 'building-medium':
      return buildBuilding(THREE, accent, DIMENSIONS['building-medium'], { tiers: true });
    case 'building-large':
      return buildBuilding(THREE, accent, DIMENSIONS['building-large'], { tiers: true });
    case 'tree':
      return buildTree(THREE);
    case 'streetlight':
      return buildStreetlight(THREE);
    case 'bench':
      return buildBench(THREE);
    case 'mailbox':
      return buildMailbox(THREE);
    case 'hydrant':
      return buildHydrant(THREE);
    case 'speed-bump':
      return buildSpeedBump(THREE);
    case 'apartment':
      return buildApartment(THREE);
    case 'office':
      return buildOffice(THREE);
    default: {
      // Defensive fallback for an unrecognized kind: a plain tinted box so
      // callers never get a throw for a typo'd/future kind string.
      const dim = { w: 2, h: 2, d: 2 };
      const fallbackMesh = new THREE.Mesh(new THREE.BoxGeometry(dim.w, dim.h, dim.d), standardMat(THREE, accent));
      fallbackMesh.position.set(0, dim.h / 2, 0);
      return fallbackMesh;
    }
  }
}

// Simplified single-geometry stand-ins used for instancing. Real-time crowds
// of hundreds of identical props (trash/bikes/cars especially — see
// LEVEL_TEMPLATE baseCount in src/data/levels.js, up to 42 per tier per
// level) need one draw call per kind, so the instanced variant trades
// createPropMesh's multi-part detail for a single representative box
// silhouette sized the same as the detailed prop's overall footprint.
function representativeGeometry(THREE, kind) {
  const dim = DIMENSIONS[kind] || { w: 2, h: 2, d: 2 };
  switch (kind) {
    case 'bike':
      return { geometry: new THREE.BoxGeometry(dim.w * 1.4, dim.h * 0.7, dim.d), dim };
    case 'car':
    case 'bus':
      return { geometry: new THREE.BoxGeometry(dim.w, dim.h * 0.75, dim.d), dim };
    default:
      return { geometry: new THREE.BoxGeometry(dim.w, dim.h, dim.d), dim };
  }
}

export function createInstancedPropField(kind, count, THREE, accentColorHex) {
  const accent = resolveColor(THREE, accentColorHex);
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const { geometry, dim } = representativeGeometry(THREE, kind);
  const material = standardMat(THREE, accent, { roughness: 0.7, metalness: 0.1 });

  const mesh = new THREE.InstancedMesh(geometry, material, safeCount);
  mesh.name = `prop-field:${kind}`;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(0, dim.h / 2, 0);
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const baseHsl = { h: 0, s: 0, l: 0 };
  accent.getHSL(baseHsl);
  const jitterColor = new THREE.Color();

  for (let i = 0; i < safeCount; i += 1) {
    // Identity-ish placement at the origin, resting on the ground plane. The
    // caller (level/scene assembly — out of this module's scope) is expected
    // to overwrite each instance's matrix via setMatrixAt() once it knows
    // where in the world this instance should spawn. Initializing every
    // instance to a valid, finite matrix (rather than leaving THREE's
    // default all-zero instance matrix) guarantees no NaN/undefined ever
    // reads out of this mesh, even before a caller places it.
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);

    // Slight deterministic per-instance lightness jitter (not random, so
    // results are reproducible) so a field of hundreds of identical props
    // doesn't read as visibly cloned.
    const l = Math.min(1, Math.max(0, baseHsl.l + 0.06 * Math.sin(i * 12.9898)));
    jitterColor.setHSL(baseHsl.h, baseHsl.s, l);
    mesh.setColorAt(i, jitterColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return mesh;
}
