// Procedural landmark kit: one finale-worthy, low-poly, primitives-only
// silhouette per metro (see src/data/metros.js `landmarkType`), recolored via
// an accent hex. These are stylized abstractions — no exact architectural
// reproduction is attempted, silhouette-recognizable is the bar.
//
// Shared-THREE pattern: THREE is always passed in explicitly by the caller
// (see src/engine/scene.js's header comment for the full rationale) — this
// module never does its own `import * as THREE from 'three'` and never
// touches document/window/localStorage at module top level, so a bare Node
// `import` of this file is always safe (no GPU/DOM required).
//
// Exact `landmarkType` strings are a CONTRACT with src/data/metros.js — keep
// in sync: 'liberty-statue' | 'lattice-tower' | 'clock-tower' | 'sky-tower' |
// 'mega-spire' | 'amphitheater' | 'mountain-statue' | 'onion-palace' |
// 'sail-opera' | 'portal-tower'.

const DEFAULT_ACCENT = '#9aa3ad';

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
// out of a single metro accent hex.
function shade(THREE, color, deltaL, deltaS = 0) {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const out = new THREE.Color();
  out.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s + deltaS)), Math.min(1, Math.max(0, hsl.l + deltaL)));
  return out;
}

function mat(THREE, color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.15,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

// "Glassy" emissive material for mega-spire — transmission + low roughness
// reads as glass/crystal even without a matching environment map.
function glassMat(THREE, color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.15,
    metalness: opts.metalness ?? 0.1,
    transmission: opts.transmission ?? 0.5,
    transparent: true,
    opacity: opts.opacity ?? 0.85,
    emissive: opts.emissive ?? color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.6,
  });
}

// A thin cylindrical strut running from `start` to `end` — the shared
// building block for tapering legs/arms across several landmark types
// (lattice-tower's legs, liberty-statue's arm, mountain-statue's arms).
function strut(THREE, start, end, radiusBottom, radiusTop, material, radialSegments = 6) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(0.001, dir.length());
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments);
  const strutMesh = new THREE.Mesh(geo, material);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  strutMesh.position.copy(mid);
  const up = new THREE.Vector3(0, 1, 0);
  const normalizedDir = dir.clone().normalize();
  strutMesh.quaternion.setFromUnitVectors(up, normalizedDir);
  return strutMesh;
}

// Computes boundingRadius/height from the assembled group's world-space
// bounding box/sphere and attaches them directly to the returned Group, as
// required by the capstone-gate contract. Falls back to safe non-zero
// defaults in the (should-never-happen) case of a degenerate/empty box, so a
// caller can never read NaN/undefined off a landmark.
function finalize(THREE, group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  group.height = Number.isFinite(size.y) && size.y > 0 ? size.y : 20;
  group.boundingRadius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 10;
  return group;
}

// --- liberty-statue --------------------------------------------------------
// Simplified robed-figure silhouette: rectangular pedestal, tapered-cylinder
// robe, sphere head, one arm raised holding a small glowing "torch" shape.
function buildLibertyStatue(THREE, accent) {
  const group = new THREE.Group();
  const stoneMat = mat(THREE, shade(THREE, accent, -0.3, -0.1), { roughness: 0.9, metalness: 0.05 });
  const robeMat = mat(THREE, shade(THREE, accent, 0.05), { roughness: 0.55, metalness: 0.2 });
  const torchMat = mat(THREE, 0xffd54a, { emissive: 0xffb300, emissiveIntensity: 1.2, roughness: 0.3 });

  const pedestalH = 18;
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(14, pedestalH, 14), stoneMat);
  pedestal.position.set(0, pedestalH / 2, 0);
  group.add(pedestal);

  const robeH = 34;
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 8, robeH, 10), robeMat);
  robe.position.set(0, pedestalH + robeH / 2, 0);
  group.add(robe);

  const head = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), robeMat);
  head.position.set(0, pedestalH + robeH + 2.6, 0);
  group.add(head);

  const crown = new THREE.Mesh(new THREE.ConeGeometry(3.8, 2.4, 8), stoneMat);
  crown.position.set(0, pedestalH + robeH + 5.4, 0);
  group.add(crown);

  // Raised arm: angled up and out to one side, ending in a glowing torch.
  const armStart = new THREE.Vector3(3.6, pedestalH + robeH * 0.78, 0);
  const armEnd = new THREE.Vector3(9.5, pedestalH + robeH + 7, 0);
  group.add(strut(THREE, armStart, armEnd, 1.5, 1.0, robeMat, 8));

  const torchBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.2, 8), stoneMat);
  torchBase.position.copy(armEnd).add(new THREE.Vector3(0, 0.8, 0));
  group.add(torchBase);

  const torch = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), torchMat);
  torch.position.copy(armEnd).add(new THREE.Vector3(0, 2.4, 0));
  group.add(torch);

  // Other arm: held down against the body, for silhouette balance.
  const arm2Start = new THREE.Vector3(-3.4, pedestalH + robeH * 0.75, 0);
  const arm2End = new THREE.Vector3(-4.6, pedestalH + robeH * 0.35, 0);
  group.add(strut(THREE, arm2Start, arm2End, 1.4, 1.1, robeMat, 8));

  return finalize(THREE, group);
}

// --- lattice-tower ----------------------------------------------------------
// Four tapering legs converging toward a point, with horizontal cross-brace
// rings — Eiffel-silhouette-flavored, not a literal reproduction.
function buildLatticeTower(THREE, accent) {
  const group = new THREE.Group();
  const metalMat = mat(THREE, accent, { metalness: 0.6, roughness: 0.4 });

  const baseSpread = 16;
  const apexHeight = 60;
  const apex = new THREE.Vector3(0, apexHeight, 0);
  const legBases = [
    new THREE.Vector3(baseSpread, 0, baseSpread),
    new THREE.Vector3(-baseSpread, 0, baseSpread),
    new THREE.Vector3(baseSpread, 0, -baseSpread),
    new THREE.Vector3(-baseSpread, 0, -baseSpread),
  ];
  for (const base of legBases) {
    group.add(strut(THREE, base, apex, 1.6, 0.35, metalMat, 6));
  }

  // Horizontal cross-brace rings at increasing height, shrinking radius to
  // roughly match how far the tapering legs have converged at that height.
  const braceHeights = [10, 24, 40];
  for (const h of braceHeights) {
    const t = h / apexHeight;
    const ringRadius = baseSpread * Math.SQRT2 * (1 - t) + 0.5;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.5, 6, 16), metalMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h;
    group.add(ring);
  }

  const spireTip = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 6), metalMat);
  spireTip.position.set(0, apexHeight + 3, 0);
  group.add(spireTip);

  return finalize(THREE, group);
}

// --- clock-tower -------------------------------------------------------------
// Tall rectangular tower with a circular clock face on each side near the
// top, and a spire cap.
function buildClockTower(THREE, accent) {
  const group = new THREE.Group();
  const stoneMat = mat(THREE, accent, { roughness: 0.85, metalness: 0.05 });
  const faceMat = mat(THREE, 0xf5f0dc, { roughness: 0.4, metalness: 0.1 });
  const handMat = mat(THREE, 0x222222, { roughness: 0.6 });
  const roofMat = mat(THREE, shade(THREE, accent, -0.25), { roughness: 0.5, metalness: 0.3 });

  const towerH = 46;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(8, towerH, 8), stoneMat);
  tower.position.set(0, towerH / 2, 0);
  group.add(tower);

  const faceY = towerH * 0.82;
  const faceGeo = new THREE.CylinderGeometry(3, 3, 0.6, 16);
  const outwardDirs = [
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(-1, 0, 0),
  ];
  for (const dirVec of outwardDirs) {
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(dirVec.x * 4.05, faceY, dirVec.z * 4.05);
    face.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec);
    group.add(face);

    const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.4), handMat);
    hourHand.position.set(dirVec.x * 4.35, faceY, dirVec.z * 4.35);
    hourHand.quaternion.copy(face.quaternion);
    group.add(hourHand);
  }

  const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 8), roofMat);
  spire.position.set(0, towerH + 6, 0);
  group.add(spire);

  return finalize(THREE, group);
}

// --- sky-tower ---------------------------------------------------------------
// Tall cylindrical spire with ring/torus observation-deck bands, neon
// emissive accent material.
function buildSkyTower(THREE, accent) {
  const group = new THREE.Group();
  const bodyMat = mat(THREE, shade(THREE, accent, -0.1), { metalness: 0.5, roughness: 0.35 });
  const neonMat = mat(THREE, accent, { emissive: accent, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2 });

  const towerH = 90;
  const towerMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 5.5, towerH, 12), bodyMat);
  towerMesh.position.set(0, towerH / 2, 0);
  group.add(towerMesh);

  const deckHeights = [22, 45, 68];
  for (const h of deckHeights) {
    const t = h / towerH;
    const r = 5.5 + (2.6 - 5.5) * t + 1.6;
    const deck = new THREE.Mesh(new THREE.TorusGeometry(r, 0.7, 6, 20), neonMat);
    deck.rotation.x = Math.PI / 2;
    deck.position.y = h;
    group.add(deck);
  }

  const tip = new THREE.Mesh(new THREE.ConeGeometry(1, 8, 8), neonMat);
  tip.position.set(0, towerH + 4, 0);
  group.add(tip);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), neonMat);
  beacon.position.set(0, towerH + 8.5, 0);
  group.add(beacon);

  return finalize(THREE, group);
}

// --- mega-spire ---------------------------------------------------------------
// A single ultra-thin tower built from stacked tapering cylinder segments
// getting narrower toward the top, glassy emissive material throughout.
function buildMegaSpire(THREE, accent) {
  const group = new THREE.Group();
  const glass = glassMat(THREE, accent, { transmission: 0.6, emissiveIntensity: 0.5 });

  const segments = 7;
  const totalHeight = 140;
  const segH = totalHeight / segments;
  let y = 0;
  for (let i = 0; i < segments; i += 1) {
    const t = i / segments;
    const rBottom = 6 * (1 - t) + 0.5;
    const rTop = 6 * (1 - (t + 1 / segments)) + 0.5;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, segH, 8), glass);
    seg.position.set(0, y + segH / 2, 0);
    group.add(seg);
    y += segH;
  }

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.6, 6, 8), glass);
  tip.position.set(0, y + 3, 0);
  group.add(tip);

  return finalize(THREE, group);
}

// --- amphitheater --------------------------------------------------------
// A ring/drum shape approximating a colosseum: a circular arrangement of
// arch-like repeated pier segments, plus horizontal ring bands and a floor.
function buildAmphitheater(THREE, accent) {
  const group = new THREE.Group();
  const stoneMat = mat(THREE, accent, { roughness: 0.85, metalness: 0.05 });
  const archMat = mat(THREE, shade(THREE, accent, -0.15), { roughness: 0.8, metalness: 0.05 });

  const drumRadius = 34;
  const pierCount = 20;
  const pierH = 16;
  for (let i = 0; i < pierCount; i += 1) {
    const angle = (i / pierCount) * Math.PI * 2;
    const x = Math.cos(angle) * drumRadius;
    const z = Math.sin(angle) * drumRadius;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, pierH, 2.2), i % 2 === 0 ? stoneMat : archMat);
    pier.position.set(x, pierH / 2, z);
    pier.rotation.y = -angle;
    group.add(pier);
  }

  const ringBands = [pierH * 0.4, pierH * 0.85];
  for (const h of ringBands) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(drumRadius, 0.8, 6, pierCount), stoneMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = h;
    group.add(band);
  }

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(drumRadius * 0.75, drumRadius * 0.75, 0.6, 24), archMat);
  floor.position.set(0, 0.3, 0);
  group.add(floor);

  return finalize(THREE, group);
}

// --- mountain-statue --------------------------------------------------------
// A large cone mountain base topped with a simplified arms-out humanoid
// statue (torso box + two outstretched arm boxes forming a T/cross shape).
function buildMountainStatue(THREE, accent) {
  const group = new THREE.Group();
  const rockMat = mat(THREE, shade(THREE, accent, -0.2, -0.15), { roughness: 0.95, metalness: 0 });
  const statueMat = mat(THREE, shade(THREE, accent, 0.1), { roughness: 0.5, metalness: 0.15 });

  const mountainH = 60;
  const mountain = new THREE.Mesh(new THREE.ConeGeometry(30, mountainH, 10), rockMat);
  mountain.position.set(0, mountainH / 2, 0);
  group.add(mountain);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 3, 8), statueMat);
  base.position.set(0, mountainH + 1.5, 0);
  group.add(base);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 3), statueMat);
  torso.position.set(0, mountainH + 3 + 4.5, 0);
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), statueMat);
  head.position.set(0, mountainH + 3 + 9 + 2, 0);
  group.add(head);

  const armLength = 7;
  const armGeo = new THREE.BoxGeometry(armLength, 1.8, 1.8);
  const armY = mountainH + 3 + 7.5;
  const rightArm = new THREE.Mesh(armGeo, statueMat);
  rightArm.position.set(armLength / 2 + 2.5, armY, 0);
  group.add(rightArm);
  const leftArm = new THREE.Mesh(armGeo, statueMat);
  leftArm.position.set(-(armLength / 2 + 2.5), armY, 0);
  group.add(leftArm);

  return finalize(THREE, group);
}

// --- onion-palace --------------------------------------------------------
// A rectangular base building topped with one-to-three onion domes (a Lathe
// revolve around Y), gold/blue tones, with small corner spires.
function onionDomeGeometry(THREE, radius, height) {
  const pts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(radius * 0.55, height * 0.06),
    new THREE.Vector2(radius, height * 0.3),
    new THREE.Vector2(radius * 0.9, height * 0.52),
    new THREE.Vector2(radius * 0.5, height * 0.74),
    new THREE.Vector2(radius * 0.15, height * 0.92),
    new THREE.Vector2(0.001, height),
  ];
  return new THREE.LatheGeometry(pts, 14);
}

function buildOnionPalace(THREE, accent) {
  const group = new THREE.Group();
  const wallMat = mat(THREE, shade(THREE, accent, -0.1), { roughness: 0.8, metalness: 0.05 });
  const goldMat = mat(THREE, 0xd4af37, { metalness: 0.6, roughness: 0.3, emissive: 0x3a2c05, emissiveIntensity: 0.2 });
  const blueMat = mat(THREE, shade(THREE, accent, 0.15), { metalness: 0.3, roughness: 0.4 });

  const baseW = 24;
  const baseH = 16;
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseW), wallMat);
  base.position.set(0, baseH / 2, 0);
  group.add(base);

  const domeSpecs = [
    { x: 0, z: 0, r: 6.5, h: 14, domeMat: goldMat },
    { x: 7.5, z: 0, r: 3.6, h: 8, domeMat: blueMat },
    { x: -7.5, z: 0, r: 3.6, h: 8, domeMat: goldMat },
  ];
  for (const spec of domeSpecs) {
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(spec.r * 0.7, spec.r * 0.7, 2, 10), wallMat);
    neck.position.set(spec.x, baseH + 1, spec.z);
    group.add(neck);

    const dome = new THREE.Mesh(onionDomeGeometry(THREE, spec.r, spec.h), spec.domeMat);
    dome.position.set(spec.x, baseH + 2, spec.z);
    group.add(dome);

    const spikeH = spec.h * 0.18;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(spec.r * 0.08, spikeH, 6), spec.domeMat);
    spike.position.set(spec.x, baseH + 2 + spec.h + spikeH / 2, spec.z);
    group.add(spike);
  }

  return finalize(THREE, group);
}

// --- sail-opera --------------------------------------------------------
// Several tilted, curved shell/sail shapes (half-cones) fanned out on a wide
// platform base.
function buildSailOpera(THREE, accent) {
  const group = new THREE.Group();
  const sailMat = mat(THREE, shade(THREE, accent, 0.25), { roughness: 0.35, metalness: 0.1 });
  const platformMat = mat(THREE, shade(THREE, accent, -0.3), { roughness: 0.9 });

  const platformR = 30;
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(platformR, platformR * 1.05, 3, 20), platformMat);
  platform.position.set(0, 1.5, 0);
  group.add(platform);

  const shellSpecs = [
    { angle: -0.9, r: 10, h: 22, tilt: 0.4 },
    { angle: -0.45, r: 12, h: 30, tilt: 0.32 },
    { angle: 0, r: 14, h: 38, tilt: 0.22 },
    { angle: 0.45, r: 12, h: 30, tilt: 0.32 },
    { angle: 0.9, r: 10, h: 22, tilt: 0.4 },
  ];

  for (const spec of shellSpecs) {
    // openEnded half-cone (thetaLength = PI) approximates a curved sail/shell.
    const shellGeo = new THREE.ConeGeometry(spec.r, spec.h, 12, 1, true, 0, Math.PI);
    const shell = new THREE.Mesh(shellGeo, sailMat);
    const fanX = Math.sin(spec.angle) * platformR * 0.5;
    const fanZ = -platformR * 0.15 - Math.abs(spec.angle) * 3;
    shell.position.set(fanX, 3 + spec.h * 0.5, fanZ);
    shell.rotation.y = Math.PI + spec.angle * 0.6;
    shell.rotation.z = spec.tilt;
    group.add(shell);
  }

  return finalize(THREE, group);
}

// --- portal-tower --------------------------------------------------------
// A tall tower topped with a glowing torus portal ring, sci-fi/AI-portal
// aesthetic — the finale metro's capstone.
function buildPortalTower(THREE, accent) {
  const group = new THREE.Group();
  const bodyMat = mat(THREE, shade(THREE, accent, -0.15), { metalness: 0.5, roughness: 0.3 });
  const portalMat = mat(THREE, accent, { emissive: accent, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.1 });
  const horizonMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const towerH = 100;
  const towerMesh = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, towerH, 12), bodyMat);
  towerMesh.position.set(0, towerH / 2, 0);
  group.add(towerMesh);

  const collarHeights = [30, 60];
  for (const h of collarHeights) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.6, 6, 16), bodyMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = h;
    group.add(collar);
  }

  const ringRadius = 11;
  const portalRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 1.6, 10, 24), portalMat);
  portalRing.position.set(0, towerH + ringRadius + 2, 0);
  group.add(portalRing);

  const horizon = new THREE.Mesh(new THREE.CircleGeometry(ringRadius * 0.85, 24), horizonMat);
  horizon.position.copy(portalRing.position);
  group.add(horizon);

  return finalize(THREE, group);
}

export function createLandmark(landmarkType, THREE, accentColorHex) {
  const accent = resolveColor(THREE, accentColorHex);
  switch (landmarkType) {
    case 'liberty-statue':
      return buildLibertyStatue(THREE, accent);
    case 'lattice-tower':
      return buildLatticeTower(THREE, accent);
    case 'clock-tower':
      return buildClockTower(THREE, accent);
    case 'sky-tower':
      return buildSkyTower(THREE, accent);
    case 'mega-spire':
      return buildMegaSpire(THREE, accent);
    case 'amphitheater':
      return buildAmphitheater(THREE, accent);
    case 'mountain-statue':
      return buildMountainStatue(THREE, accent);
    case 'onion-palace':
      return buildOnionPalace(THREE, accent);
    case 'sail-opera':
      return buildSailOpera(THREE, accent);
    case 'portal-tower':
      return buildPortalTower(THREE, accent);
    default: {
      // Defensive fallback for an unrecognized landmarkType: a plain tinted
      // obelisk so callers never get a throw for a typo'd/future type.
      const group = new THREE.Group();
      const obelisk = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 6), mat(THREE, accent));
      obelisk.position.set(0, 20, 0);
      group.add(obelisk);
      return finalize(THREE, group);
    }
  }
}
