// Metro-flavored prop VARIANTS — the per-place skins that make a Tokyo
// backstreet and a Roman piazza stop being furnished identically.
//
// -----------------------------------------------------------------------------
// THE SEAM (read this before adding anything)
// -----------------------------------------------------------------------------
// src/content/propkit.js owns the generic prop set, the DIMENSIONS envelope for
// every `kind`, and the material helpers. This module owns ONLY the alternate
// meshes, registered per metro id per kind:
//
//   VARIANTS[metroId][kind] = [builder, builder, ...]
//
// createPropMesh(kind, THREE, accent, metroIdOrOpts) resolves metro-FIRST:
//   1. metro id given AND VARIANTS[metroId][kind] exists -> build the variant
//   2. anything else (no metro id, unknown metro, metro with no variant for
//      that slot, builder throws) -> fall through to the generic builder,
//      byte-identical to the behavior before this module existed.
//
// That makes the registry purely additive: adding a Tokyo vending machine can
// never touch the other nine metros, and a metro with no entry for a slot keeps
// exactly today's prop. Nothing here is reachable unless a caller opts in by
// passing a metro id.
//
// -----------------------------------------------------------------------------
// THE ECONOMY IS NOT TOUCHED
// -----------------------------------------------------------------------------
// A variant is a MESH SWAP ONLY. Swallow radius and mass come from the level
// template (src/data/levels.js) / city layout (src/content/citylayout.js) and
// are attached by src/main.js to the prop record, never read off the mesh — so
// a variant cannot move a prop between tiers, change eat-gate math, or shift
// level pacing. Variants are additionally authored to fill roughly the same
// DIMENSIONS envelope as the prop they replace, because propkit's
// scaleForRadius() sizes every prop from that envelope: a variant that ignored
// it would render at the wrong on-screen size for its swallow radius. A test
// pins that (variant vs generic scale basis within ~30%).
//
// -----------------------------------------------------------------------------
// GLOW IS FREE
// -----------------------------------------------------------------------------
// src/engine/scene.js's markBloomEmissive() is run over the whole level root
// once at build time and marks any material with emissiveIntensity >= 0.6 (or
// additive blending) for the selective bloom pass. So neon signboards, taxi
// roof lamps, headlights and holo-pylons authored below at >= 0.6 bloom with no
// wiring at all — that threshold is why every light source here sits at 0.7-1.5
// while merely "lit" surfaces stay under it.
//
// -----------------------------------------------------------------------------
// CONVENTIONS
// -----------------------------------------------------------------------------
// - THREE is dependency-injected (this module never imports 'three'; see
//   src/engine/scene.js's header for the full rationale).
// - No browser-only API at module top level, so plain `import` under Node is
//   always safe and the whole registry is unit-testable headlessly.
// - Every builder receives `(THREE, ctx)` and returns a THREE.Group whose local
//   origin sits at its base footprint center (y = 0 is "on the ground"), the
//   same contract every generic propkit builder honors.
//   ctx = {
//     dim,                     // DIMENSIONS entry for the slot being filled
//     accent,                  // THREE.Color — the metro accent
//     mat(color, opts),        // propkit's standardMat, bound to THREE
//     shade(color, dL, dS),    // propkit's HSL nudge, bound to THREE
//     color(hex),              // new THREE.Color(hex)
//   }

// ---------------------------------------------------------------------------
// Shared micro-helpers
// ---------------------------------------------------------------------------

// Rolling wheel oriented across the X axis (same convention as propkit's
// buildWheel) — variants that are vehicles all need it.
function wheel(THREE, radius, width, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 10), material);
  m.rotation.z = Math.PI / 2;
  return m;
}

// A glowing panel/tube. emissiveIntensity defaults to 1.0, comfortably above
// scene.js's BLOOM_EMISSIVE_MIN (0.6), so anything built with this blooms.
function glowMat(ctx, hex, intensity = 1.0) {
  return ctx.mat(hex, { emissive: hex, emissiveIntensity: intensity, roughness: 0.35, metalness: 0.05 });
}

function box(THREE, w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

function cyl(THREE, rTop, rBottom, h, seg, material) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
}

function put(group, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

// ===========================================================================
// NEON DISTRICT — Tokyo at night. Everything that can glow, glows.
// ===========================================================================

// Roadside drinks vending machine: the single most Tokyo object there is. The
// whole front face is a light source at night.
function buildVendingMachine(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const h = d.h * 1.9; // taller than a bin — that IS the silhouette
  const bodyMat = ctx.mat('#d81b53', { roughness: 0.5, metalness: 0.2 });
  put(g, box(THREE, d.w, h, d.d * 0.8, bodyMat), 0, h / 2, 0);

  const faceMat = glowMat(ctx, '#ffeec2', 1.1);
  put(g, box(THREE, d.w * 0.82, h * 0.55, d.d * 0.06, faceMat), 0, h * 0.62, d.d * 0.42);

  // Drink rows read as three dark bands across the lit face.
  const shelfMat = ctx.mat('#2b1f28', { roughness: 0.8 });
  for (let i = 0; i < 3; i += 1) {
    put(g, box(THREE, d.w * 0.84, h * 0.03, d.d * 0.08, shelfMat), 0, h * (0.45 + i * 0.15), d.d * 0.44);
  }
  const trayMat = ctx.mat('#1a1218', { roughness: 0.9 });
  put(g, box(THREE, d.w * 0.7, h * 0.12, d.d * 0.1, trayMat), 0, h * 0.2, d.d * 0.44);
  return g;
}

// Yatai noodle stall: cart body, red awning, and a vertical kanji signboard
// burning at the front.
function buildNoodleStall(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const cartMat = ctx.mat('#5c3b2e', { roughness: 0.85 });
  const counterH = d.h * 0.42;
  put(g, box(THREE, d.w * 0.9, counterH, d.d * 0.55, cartMat), 0, counterH / 2, 0);

  // Awning: a shallow tilted red slab on four posts.
  const postMat = ctx.mat('#3a2a22', { roughness: 0.8 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(g, box(THREE, d.w * 0.06, d.h * 0.5, d.w * 0.06, postMat),
        sx * d.w * 0.4, counterH + d.h * 0.25, sz * d.d * 0.24);
    }
  }
  const awningMat = ctx.mat('#b32020', { roughness: 0.7 });
  const awning = put(g, box(THREE, d.w * 1.05, d.h * 0.05, d.d * 0.62, awningMat), 0, d.h * 0.9, 0);
  awning.rotation.x = 0.08;

  // The signboard — a vertical lantern-lit strip of kanji.
  const signMat = glowMat(ctx, '#ff3b6b', 1.3);
  put(g, box(THREE, d.w * 0.16, d.h * 0.55, d.w * 0.1, signMat), d.w * 0.45, d.h * 0.55, d.d * 0.3);
  const lanternMat = glowMat(ctx, '#ffcf6a', 1.1);
  for (const sx of [-0.28, 0.05]) {
    put(g, cyl(THREE, d.w * 0.09, d.w * 0.09, d.h * 0.14, 8, lanternMat), sx * d.w, d.h * 0.78, d.d * 0.3);
  }
  return g;
}

// Capsule scooter: the delivery moped that owns every Tokyo backstreet, with
// a lit headlamp.
function buildCapsuleScooter(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const shellMat = ctx.mat(ctx.shade(ctx.accent, 0.05), { metalness: 0.35, roughness: 0.4 });
  const darkMat = ctx.mat('#17161d', { roughness: 0.8 });
  const wr = d.h * 0.26;

  put(g, wheel(THREE, wr, d.w * 0.35, darkMat), 0, wr, -d.d * 0.3);
  put(g, wheel(THREE, wr, d.w * 0.35, darkMat), 0, wr, d.d * 0.32);

  // Stepped-through body: floor pan + rounded rear shell.
  put(g, box(THREE, d.w * 1.1, d.h * 0.1, d.d * 0.5, shellMat), 0, wr * 1.1, -d.d * 0.02);
  const rear = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 1.0, 8, 6), shellMat), 0, wr * 1.7, -d.d * 0.26);
  rear.scale.set(1, 0.85, 1.5);

  // Front legshield + headlamp.
  const shield = put(g, box(THREE, d.w * 1.15, d.h * 0.5, d.w * 0.2, shellMat), 0, wr * 1.9, d.d * 0.26);
  shield.rotation.x = 0.22;
  put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.4, 8, 6), glowMat(ctx, '#fff3d0', 1.2)),
    0, wr * 2.1, d.d * 0.34);
  put(g, box(THREE, d.w * 1.6, d.w * 0.16, d.w * 0.16, darkMat), 0, wr * 2.6, d.d * 0.2);
  return g;
}

// Signboard canyon in a single prop: a pole stacked with vertical neon signs.
function buildSignboardPole(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const poleMat = ctx.mat('#26232e', { metalness: 0.5, roughness: 0.5 });
  put(g, cyl(THREE, d.w * 0.14, d.w * 0.2, d.h * 0.95, 6, poleMat), 0, d.h * 0.475, 0);

  const hues = ['#ff2e93', '#2ee6ff', '#ffe03a'];
  for (let i = 0; i < 3; i += 1) {
    const signH = d.h * 0.2;
    const y = d.h * (0.3 + i * 0.23);
    const side = i % 2 ? 1 : -1;
    put(g, box(THREE, d.w * 0.12, signH, d.w * 1.6, glowMat(ctx, hues[i], 1.25)),
      side * d.w * 0.9, y, 0);
    put(g, box(THREE, d.w * 1.6, d.w * 0.12, d.w * 0.12, poleMat), side * d.w * 0.5, y + signH * 0.5, 0);
  }
  return g;
}

// ===========================================================================
// OLD FOG TOWN — London under permanent overcast. Almost nothing glows; the
// silhouettes do the work.
// ===========================================================================

function buildBlackCab(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const bodyMat = ctx.mat('#15171a', { metalness: 0.4, roughness: 0.35 });
  const glassMat = ctx.mat('#39434d', { metalness: 0.3, roughness: 0.2 });
  const tyreMat = ctx.mat('#101010', { roughness: 0.9 });
  const wr = d.h * 0.24;

  // Hackney proportions: tall greenhouse, short bonnet, upright rear.
  put(g, box(THREE, d.w, d.h * 0.42, d.d, bodyMat), 0, wr + d.h * 0.21, 0);
  put(g, box(THREE, d.w * 0.92, d.h * 0.46, d.d * 0.56, bodyMat), 0, wr + d.h * 0.62, -d.d * 0.1);
  put(g, box(THREE, d.w * 0.95, d.h * 0.3, d.d * 0.5, glassMat), 0, wr + d.h * 0.66, -d.d * 0.1);
  // Amber "TAXI" roof sign — the one lit thing on it.
  put(g, box(THREE, d.w * 0.5, d.h * 0.1, d.d * 0.1, glowMat(ctx, '#ffb54a', 0.85)),
    0, wr + d.h * 0.9, d.d * 0.12);

  for (const [x, z] of [[d.w / 2, d.d * 0.33], [-d.w / 2, d.d * 0.33], [d.w / 2, -d.d * 0.33], [-d.w / 2, -d.d * 0.33]]) {
    put(g, wheel(THREE, wr, d.w * 0.18, tyreMat), x, wr, z);
  }
  return g;
}

function buildDoubleDecker(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const h = d.h * 1.5; // double-deckers are genuinely taller than a city bus
  const redMat = ctx.mat('#b8232f', { metalness: 0.2, roughness: 0.55 });
  const glassMat = ctx.mat('#2f3b44', { metalness: 0.3, roughness: 0.25 });
  const tyreMat = ctx.mat('#111111', { roughness: 0.9 });
  const wr = d.h * 0.15;

  put(g, box(THREE, d.w, h - wr, d.d, redMat), 0, wr + (h - wr) / 2, 0);
  // Two window bands — the deck line is the whole tell.
  for (const y of [wr + (h - wr) * 0.32, wr + (h - wr) * 0.78]) {
    put(g, box(THREE, d.w * 1.01, h * 0.16, d.d * 0.93, glassMat), 0, y, 0);
  }
  // Front destination blind.
  put(g, box(THREE, d.w * 0.7, h * 0.08, d.d * 0.03, ctx.mat('#efe6cf', { roughness: 0.8 })),
    0, wr + (h - wr) * 0.9, d.d * 0.5);

  for (const z of [d.d * 0.36, -d.d * 0.3]) {
    for (const x of [d.w / 2, -d.w / 2]) put(g, wheel(THREE, wr, d.w * 0.16, tyreMat), x, wr, z);
  }
  return g;
}

function buildPhoneBox(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const w = d.w * 0.72;
  const redMat = ctx.mat('#a51f24', { roughness: 0.5, metalness: 0.15 });
  const glassMat = ctx.mat('#5f7a7f', { roughness: 0.2, metalness: 0.2, emissive: '#5f7a7f', emissiveIntensity: 0.2 });

  put(g, box(THREE, w, d.h * 0.9, w, redMat), 0, d.h * 0.45, 0);
  // Glazing: a grid of panes recessed on all four faces.
  for (let i = 0; i < 3; i += 1) {
    const y = d.h * (0.32 + i * 0.2);
    put(g, box(THREE, w * 0.72, d.h * 0.14, w * 1.02, glassMat), 0, y, 0);
    put(g, box(THREE, w * 1.02, d.h * 0.14, w * 0.72, glassMat), 0, y, 0);
  }
  // Crown: stepped cornice + dome finial.
  put(g, box(THREE, w * 1.14, d.h * 0.07, w * 1.14, redMat), 0, d.h * 0.93, 0);
  const dome = put(g, new THREE.Mesh(new THREE.SphereGeometry(w * 0.4, 10, 8), redMat), 0, d.h * 0.96, 0);
  dome.scale.set(1, 0.55, 1);
  return g;
}

function buildIronLamppost(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const ironMat = ctx.mat('#1f2529', { metalness: 0.55, roughness: 0.45 });

  put(g, cyl(THREE, d.w * 0.34, d.w * 0.5, d.h * 0.1, 8, ironMat), 0, d.h * 0.05, 0);
  put(g, cyl(THREE, d.w * 0.13, d.w * 0.22, d.h * 0.72, 8, ironMat), 0, d.h * 0.46, 0);
  // Ladder bar — the Victorian lamplighter's rest, dead giveaway.
  put(g, box(THREE, d.w * 1.1, d.w * 0.09, d.w * 0.09, ironMat), 0, d.h * 0.68, 0);
  // Lantern: tapered glass box under a little pitched cap.
  const lantern = put(g, cyl(THREE, d.w * 0.42, d.w * 0.3, d.h * 0.16, 4, glowMat(ctx, '#ffd9a0', 0.95)),
    0, d.h * 0.9, 0);
  lantern.rotation.y = Math.PI / 4;
  const cap = put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.5, d.h * 0.09, 4), ironMat), 0, d.h * 1.02, 0);
  cap.rotation.y = Math.PI / 4;
  return g;
}

function buildPillarBox(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const redMat = ctx.mat('#96201f', { roughness: 0.55, metalness: 0.15 });
  put(g, cyl(THREE, d.w * 0.46, d.w * 0.48, d.h * 0.82, 12, redMat), 0, d.h * 0.41, 0);
  const cap = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.48, 10, 8), redMat), 0, d.h * 0.82, 0);
  cap.scale.set(1, 0.5, 1);
  put(g, cyl(THREE, d.w * 0.52, d.w * 0.52, d.h * 0.05, 12, redMat), 0, d.h * 0.8, 0);
  put(g, box(THREE, d.w * 0.5, d.h * 0.06, d.w * 0.1, ctx.mat('#161616', { roughness: 0.7 })),
    0, d.h * 0.66, d.w * 0.42);
  return g;
}

// ===========================================================================
// LE VIEUX CONTINENT — Paris at golden hour. Ironwork, awnings, zinc green.
// ===========================================================================

const PARIS_GREEN = '#2f4f3f';

function buildCafeTable(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const h = d.h * 1.15;
  const rattanMat = ctx.mat('#c8a869', { roughness: 0.9 });
  const ironMat = ctx.mat('#2a2724', { metalness: 0.5, roughness: 0.5 });

  put(g, cyl(THREE, d.w * 0.05, d.w * 0.05, h * 0.72, 6, ironMat), 0, h * 0.36, 0);
  put(g, cyl(THREE, d.w * 0.2, d.w * 0.22, h * 0.04, 8, ironMat), 0, h * 0.03, 0);
  put(g, cyl(THREE, d.w * 0.4, d.w * 0.4, h * 0.05, 12, ctx.mat('#e2d6c0', { roughness: 0.6 })), 0, h * 0.74, 0);

  // Two wicker chairs, angled toward the street the way they always are.
  for (const [sx, sz, rot] of [[-0.42, 0.15, 0.5], [0.4, -0.25, -2.4]]) {
    const seat = put(g, box(THREE, d.w * 0.34, h * 0.05, d.d * 0.34, rattanMat), sx * d.w, h * 0.42, sz * d.d);
    seat.rotation.y = rot;
    const back = put(g, box(THREE, d.w * 0.34, h * 0.34, d.d * 0.05, rattanMat), sx * d.w, h * 0.6, sz * d.d);
    back.rotation.y = rot;
    back.translateZ(-d.d * 0.15);
  }
  return g;
}

function buildNewsKiosk(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const greenMat = ctx.mat(PARIS_GREEN, { roughness: 0.6, metalness: 0.2 });
  const bodyH = d.h * 0.62;

  put(g, cyl(THREE, d.w * 0.42, d.w * 0.44, bodyH, 8, greenMat), 0, bodyH / 2, 0);
  // Poster panels wrapping the drum.
  const posterMats = [ctx.mat('#c8493c', { roughness: 0.8 }), ctx.mat('#d9c26a', { roughness: 0.8 }), ctx.mat('#3f6f9c', { roughness: 0.8 })];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const panel = put(g, box(THREE, d.w * 0.36, bodyH * 0.5, d.w * 0.04, posterMats[i]),
      Math.cos(a) * d.w * 0.42, bodyH * 0.55, Math.sin(a) * d.w * 0.42);
    panel.rotation.y = -a;
  }
  // Scalloped awning + finial.
  const awning = put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.52, d.h * 0.16, 8), greenMat), 0, bodyH + d.h * 0.08, 0);
  awning.rotation.y = Math.PI / 8;
  put(g, cyl(THREE, d.w * 0.05, d.w * 0.05, d.h * 0.12, 6, greenMat), 0, bodyH + d.h * 0.2, 0);
  put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.08, 8, 6), ctx.mat('#c9a66b', { metalness: 0.6, roughness: 0.3 })),
    0, bodyH + d.h * 0.27, 0);
  return g;
}

function buildWallaceFountain(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const h = d.h * 1.7;
  const greenMat = ctx.mat(PARIS_GREEN, { roughness: 0.55, metalness: 0.25 });

  put(g, cyl(THREE, d.w * 0.4, d.w * 0.5, h * 0.12, 8, greenMat), 0, h * 0.06, 0);
  put(g, cyl(THREE, d.w * 0.3, d.w * 0.34, h * 0.1, 8, greenMat), 0, h * 0.17, 0);
  // Four caryatids holding the dome.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    put(g, box(THREE, d.w * 0.13, h * 0.44, d.w * 0.13, greenMat),
      Math.cos(a) * d.w * 0.24, h * 0.44, Math.sin(a) * d.w * 0.24);
  }
  const dome = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.36, 10, 8), greenMat), 0, h * 0.68, 0);
  dome.scale.set(1, 0.6, 1);
  put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.4, h * 0.16, 8), greenMat), 0, h * 0.78, 0);
  put(g, cyl(THREE, d.w * 0.04, d.w * 0.04, h * 0.1, 6, greenMat), 0, h * 0.89, 0);
  return g;
}

function buildIronBench(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const slatMat = ctx.mat('#2c4a3b', { roughness: 0.75 });
  const ironMat = ctx.mat('#20211f', { metalness: 0.55, roughness: 0.45 });

  for (let i = 0; i < 3; i += 1) {
    put(g, box(THREE, d.w, d.h * 0.07, d.d * 0.16, slatMat), 0, d.h * 0.44, (i - 1) * d.d * 0.2);
  }
  for (let i = 0; i < 3; i += 1) {
    const slat = put(g, box(THREE, d.w, d.h * 0.09, d.d * 0.06, slatMat), 0, d.h * (0.6 + i * 0.14), -d.d * 0.34);
    slat.rotation.x = -0.14;
  }
  // Scrolled cast-iron ends.
  for (const sx of [-1, 1]) {
    put(g, box(THREE, d.w * 0.06, d.h * 0.44, d.d * 0.75, ironMat), sx * d.w * 0.48, d.h * 0.22, 0);
    const scroll = put(g, new THREE.Mesh(new THREE.TorusGeometry(d.h * 0.16, d.h * 0.035, 6, 10), ironMat),
      sx * d.w * 0.48, d.h * 0.62, -d.d * 0.24);
    scroll.rotation.y = Math.PI / 2;
  }
  return g;
}

function buildParisLamppost(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const ironMat = ctx.mat('#23282b', { metalness: 0.55, roughness: 0.42 });
  const gildMat = ctx.mat('#c9a66b', { metalness: 0.7, roughness: 0.3 });

  put(g, cyl(THREE, d.w * 0.36, d.w * 0.52, d.h * 0.09, 8, ironMat), 0, d.h * 0.045, 0);
  put(g, cyl(THREE, d.w * 0.11, d.w * 0.2, d.h * 0.74, 8, ironMat), 0, d.h * 0.46, 0);
  put(g, cyl(THREE, d.w * 0.16, d.w * 0.16, d.h * 0.04, 8, gildMat), 0, d.h * 0.83, 0);
  // Twin lanterns on a cross-arm.
  put(g, box(THREE, d.w * 1.7, d.w * 0.09, d.w * 0.09, ironMat), 0, d.h * 0.9, 0);
  for (const sx of [-1, 1]) {
    const lantern = put(g, cyl(THREE, d.w * 0.3, d.w * 0.2, d.h * 0.12, 4, glowMat(ctx, '#ffdca8', 1.0)),
      sx * d.w * 0.8, d.h * 0.85, 0);
    lantern.rotation.y = Math.PI / 4;
    const cap = put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.34, d.h * 0.06, 4), gildMat), sx * d.w * 0.8, d.h * 0.94, 0);
    cap.rotation.y = Math.PI / 4;
  }
  return g;
}

// ===========================================================================
// HARBOR METROPOLIS — New York at midday. Yellow, steam, street food.
// ===========================================================================

function buildYellowCab(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const yellowMat = ctx.mat('#f2b705', { metalness: 0.3, roughness: 0.42 });
  const glassMat = ctx.mat('#3c4d5a', { metalness: 0.3, roughness: 0.2 });
  const tyreMat = ctx.mat('#131313', { roughness: 0.9 });
  const wr = d.h * 0.26;

  put(g, box(THREE, d.w, d.h * 0.5, d.d, yellowMat), 0, wr + d.h * 0.25, 0);
  put(g, box(THREE, d.w * 0.86, d.h * 0.42, d.d * 0.46, yellowMat), 0, wr + d.h * 0.7, -d.d * 0.04);
  put(g, box(THREE, d.w * 0.88, d.h * 0.26, d.d * 0.42, glassMat), 0, wr + d.h * 0.74, -d.d * 0.04);
  // Checker stripe + roof light: the two things that make it a cab, not a car.
  put(g, box(THREE, d.w * 1.01, d.h * 0.09, d.d * 1.01, ctx.mat('#1c1c1c', { roughness: 0.7 })), 0, wr + d.h * 0.24, 0);
  put(g, box(THREE, d.w * 0.34, d.h * 0.12, d.d * 0.09, glowMat(ctx, '#ffe9a8', 0.9)), 0, wr + d.h * 0.96, -d.d * 0.02);

  for (const [x, z] of [[d.w / 2, d.d * 0.32], [-d.w / 2, d.d * 0.32], [d.w / 2, -d.d * 0.32], [-d.w / 2, -d.d * 0.32]]) {
    put(g, wheel(THREE, wr, d.w * 0.18, tyreMat), x, wr, z);
  }
  return g;
}

function buildTrashBags(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const bagMat = ctx.mat('#1b1b1f', { roughness: 0.95 });
  const bagMat2 = ctx.mat('#2a2a30', { roughness: 0.95 });
  const bags = [
    [-0.22, 0.3, 0.16, 0.44], [0.24, 0.28, -0.2, 0.4], [0.02, 0.62, -0.02, 0.34],
  ];
  for (let i = 0; i < bags.length; i += 1) {
    const [x, y, z, r] = bags[i];
    const bag = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * r, 8, 6), i % 2 ? bagMat2 : bagMat),
      x * d.w, y * d.h, z * d.d);
    bag.scale.set(1, 1.15, 0.92);
  }
  // A busted-open produce crate wedged in, because there always is one.
  const crate = put(g, box(THREE, d.w * 0.42, d.h * 0.34, d.d * 0.38, ctx.mat('#9c7a4e', { roughness: 0.9 })),
    -d.w * 0.38, d.h * 0.17, -d.d * 0.3);
  crate.rotation.y = 0.4;
  return g;
}

function buildHotDogCart(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const steelMat = ctx.mat('#c6ccd2', { metalness: 0.6, roughness: 0.35 });
  const cartH = d.h * 0.4;

  put(g, box(THREE, d.w * 0.8, cartH * 0.7, d.d * 0.5, steelMat), 0, cartH * 0.6, 0);
  put(g, box(THREE, d.w * 0.84, cartH * 0.12, d.d * 0.54, ctx.mat('#8d949a', { metalness: 0.5, roughness: 0.4 })), 0, cartH, 0);
  // Cart wheels.
  for (const sx of [-1, 1]) {
    const w = put(g, cyl(THREE, d.w * 0.16, d.w * 0.16, d.w * 0.06, 10, ctx.mat('#2b2b2b', { roughness: 0.85 })),
      sx * d.w * 0.36, d.w * 0.16, -d.d * 0.2);
    w.rotation.z = Math.PI / 2;
  }
  // Blue-and-white striped umbrella — the cart's whole silhouette at distance.
  put(g, cyl(THREE, d.w * 0.04, d.w * 0.04, d.h * 0.62, 6, steelMat), d.w * 0.28, d.h * 0.6, 0);
  const blue = ctx.mat('#2e64a8', { roughness: 0.7 });
  const white = ctx.mat('#eef2f4', { roughness: 0.7 });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const panel = put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.42, d.h * 0.14, 4, 1, true), i % 2 ? blue : white),
      d.w * 0.28, d.h * 0.9, 0);
    panel.rotation.y = a;
  }
  // Condiment bottles.
  for (const [sx, hex] of [[-0.2, '#c0392b'], [-0.06, '#e8b93a']]) {
    put(g, cyl(THREE, d.w * 0.04, d.w * 0.05, d.h * 0.1, 6, ctx.mat(hex, { roughness: 0.5 })), sx * d.w, d.h * 0.45, d.d * 0.1);
  }
  return g;
}

function buildSteamManhole(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const ironMat = ctx.mat('#3e4247', { metalness: 0.55, roughness: 0.6 });
  const r = Math.min(d.w, d.d * 3) * 0.42;

  put(g, cyl(THREE, r, r, d.h * 0.6, 14, ironMat), 0, d.h * 0.3, 0);
  put(g, cyl(THREE, r * 0.72, r * 0.72, d.h * 0.9, 14, ctx.mat('#4a4f55', { metalness: 0.5, roughness: 0.55 })), 0, d.h * 0.45, 0);

  // The steam plume — translucent, deliberately NOT emissive so it stays a
  // daylight haze rather than a glowing blob under the bloom pass. Kept low and
  // spreading rather than tall: this fills the flat 'speed-bump' road slot, so
  // a column of steam would tower absurdly once scaled to that slot's radius.
  const steamMat = new THREE.MeshStandardMaterial({
    color: 0xdfe6ea, roughness: 1, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false,
  });
  for (let i = 0; i < 3; i += 1) {
    const puff = put(g, new THREE.Mesh(new THREE.SphereGeometry(r * (0.3 + i * 0.13), 8, 6), steamMat),
      r * 0.16 * i, d.h * 0.9 + i * r * 0.28, r * 0.1 * i);
    puff.scale.set(1, 0.7, 1);
  }
  return g;
}

// ===========================================================================
// DESERT SPIRES — Dubai at blown-out high noon. Gold trim, palms, supercars.
// ===========================================================================

const GOLD = '#d4af37';

function buildPalmTree(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const trunkMat = ctx.mat('#9c8055', { roughness: 0.95 });
  const trunkH = d.h * 0.68;

  // Segmented trunk with a slight lean — a straight cylinder reads as a pole.
  const segs = 6;
  for (let i = 0; i < segs; i += 1) {
    const t = i / segs;
    const seg = put(g, cyl(THREE, d.w * (0.1 - t * 0.03), d.w * (0.13 - t * 0.03), trunkH / segs, 7, trunkMat),
      t * d.w * 0.12, trunkH * (t + 0.5 / segs), 0);
    seg.rotation.z = -0.06;
  }
  const crownY = trunkH;
  const crownX = d.w * 0.12;
  // Fronds: tapered boxes drooping from the crown. Kept inside the slot's
  // footprint — a real palm's spread would render 2x the prop it replaces.
  const frondMat = ctx.mat('#4f7a37', { roughness: 0.85 });
  const frondMat2 = ctx.mat('#3f6a2c', { roughness: 0.85 });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const frond = put(g, box(THREE, d.w * 0.5, d.h * 0.03, d.w * 0.16, i % 2 ? frondMat : frondMat2),
      crownX + Math.cos(a) * d.w * 0.26, crownY + d.h * 0.1, Math.sin(a) * d.w * 0.26);
    frond.rotation.y = -a;
    frond.rotation.z = 0.34;
  }
  // Date clusters.
  for (const sx of [-1, 1]) {
    put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.13, 6, 5), ctx.mat('#a3612c', { roughness: 0.9 })),
      crownX + sx * d.w * 0.16, crownY + d.h * 0.03, 0);
  }
  return g;
}

function buildSupercar(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const paintMat = ctx.mat(ctx.shade(ctx.accent, -0.05, 0.15), { metalness: 0.6, roughness: 0.18 });
  const goldMat = ctx.mat(GOLD, { metalness: 0.85, roughness: 0.2 });
  const glassMat = ctx.mat('#22262c', { metalness: 0.4, roughness: 0.12 });
  const tyreMat = ctx.mat('#141414', { roughness: 0.85 });
  const wr = d.h * 0.2;

  // Wedge: low nose, high haunches.
  put(g, box(THREE, d.w, d.h * 0.3, d.d * 0.98, paintMat), 0, wr + d.h * 0.14, 0);
  const nose = put(g, box(THREE, d.w * 0.9, d.h * 0.14, d.d * 0.34, paintMat), 0, wr + d.h * 0.08, d.d * 0.36);
  nose.rotation.x = -0.06;
  const canopy = put(g, box(THREE, d.w * 0.78, d.h * 0.24, d.d * 0.36, glassMat), 0, wr + d.h * 0.38, -d.d * 0.04);
  canopy.rotation.x = 0.04;
  // Gold trim strake + rear wing.
  put(g, box(THREE, d.w * 1.02, d.h * 0.05, d.d * 0.7, goldMat), 0, wr + d.h * 0.03, -d.d * 0.05);
  put(g, box(THREE, d.w * 0.9, d.h * 0.04, d.d * 0.14, goldMat), 0, wr + d.h * 0.42, -d.d * 0.44);
  for (const sx of [-1, 1]) {
    put(g, box(THREE, d.w * 0.06, d.h * 0.14, d.d * 0.06, goldMat), sx * d.w * 0.4, wr + d.h * 0.34, -d.d * 0.44);
  }
  // Headlights.
  for (const sx of [-1, 1]) {
    put(g, box(THREE, d.w * 0.22, d.h * 0.06, d.d * 0.04, glowMat(ctx, '#ffffff', 1.1)), sx * d.w * 0.3, wr + d.h * 0.14, d.d * 0.52);
  }
  for (const [x, z] of [[d.w / 2, d.d * 0.34], [-d.w / 2, d.d * 0.34], [d.w / 2, -d.d * 0.34], [-d.w / 2, -d.d * 0.34]]) {
    put(g, wheel(THREE, wr, d.w * 0.2, tyreMat), x, wr, z);
  }
  return g;
}

function buildGoldPlanter(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const stoneMat = ctx.mat('#e8dcc0', { roughness: 0.7 });
  const goldMat = ctx.mat(GOLD, { metalness: 0.85, roughness: 0.22 });

  put(g, cyl(THREE, d.w * 0.46, d.w * 0.36, d.h * 0.7, 10, stoneMat), 0, d.h * 0.35, 0);
  put(g, cyl(THREE, d.w * 0.5, d.w * 0.5, d.h * 0.09, 10, goldMat), 0, d.h * 0.7, 0);
  put(g, cyl(THREE, d.w * 0.4, d.w * 0.4, d.h * 0.06, 10, goldMat), 0, d.h * 0.1, 0);
  // Clipped ornamental shrub.
  const shrubMat = ctx.mat('#3d6b3a', { roughness: 0.9 });
  const shrub = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.38, 8, 6), shrubMat), 0, d.h * 0.95, 0);
  shrub.scale.set(1, 0.9, 1);
  put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.2, 8, 6), shrubMat), d.w * 0.2, d.h * 1.2, 0);
  return g;
}

function buildGoldLamppost(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const goldMat = ctx.mat(GOLD, { metalness: 0.85, roughness: 0.24 });
  const creamMat = ctx.mat('#f0e6cd', { roughness: 0.6 });

  put(g, cyl(THREE, d.w * 0.34, d.w * 0.46, d.h * 0.08, 10, creamMat), 0, d.h * 0.04, 0);
  put(g, cyl(THREE, d.w * 0.1, d.w * 0.16, d.h * 0.8, 10, goldMat), 0, d.h * 0.48, 0);
  put(g, cyl(THREE, d.w * 0.2, d.w * 0.2, d.h * 0.04, 10, goldMat), 0, d.h * 0.6, 0);
  // Frosted globe.
  put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.42, 10, 8), glowMat(ctx, '#fff6dd', 1.0)), 0, d.h * 0.94, 0);
  put(g, cyl(THREE, d.w * 0.06, d.w * 0.06, d.h * 0.06, 6, goldMat), 0, d.h * 1.02, 0);
  return g;
}

// ===========================================================================
// COLISEUM CITY — Rome at dry midday. Travertine, awnings, cypress, Vespas.
// ===========================================================================

const TRAVERTINE = '#ddd0b4';

function buildVespa(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const shellMat = ctx.mat('#8fbfae', { metalness: 0.4, roughness: 0.35 });
  const chromeMat = ctx.mat('#c9ced4', { metalness: 0.8, roughness: 0.22 });
  const tyreMat = ctx.mat('#16161a', { roughness: 0.85 });
  const wr = d.h * 0.2; // small scooter wheels

  put(g, wheel(THREE, wr, d.w * 0.32, tyreMat), 0, wr, -d.d * 0.28);
  put(g, wheel(THREE, wr, d.w * 0.32, tyreMat), 0, wr, d.d * 0.3);
  // Monocoque: bulbous rear cowl + flat floorboard + tall front legshield.
  const cowl = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 1.1, 8, 6), shellMat), 0, wr * 1.9, -d.d * 0.24);
  cowl.scale.set(1, 0.9, 1.35);
  put(g, box(THREE, d.w * 1.15, d.h * 0.08, d.d * 0.4, shellMat), 0, wr * 1.15, d.d * 0.02);
  const shield = put(g, box(THREE, d.w * 1.25, d.h * 0.52, d.w * 0.22, shellMat), 0, wr * 2.0, d.d * 0.26);
  shield.rotation.x = 0.14;
  // Saddle + mirrors + round headlamp.
  put(g, box(THREE, d.w * 0.8, d.h * 0.09, d.d * 0.28, ctx.mat('#3b2b22', { roughness: 0.8 })), 0, wr * 2.7, -d.d * 0.18);
  put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.34, 8, 6), glowMat(ctx, '#fff0c8', 0.85)), 0, wr * 2.3, d.d * 0.36);
  put(g, box(THREE, d.w * 1.7, d.w * 0.14, d.w * 0.14, chromeMat), 0, wr * 3.0, d.d * 0.26);
  return g;
}

function buildMarketStall(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const woodMat = ctx.mat('#8a6a44', { roughness: 0.9 });
  const tableH = d.h * 0.38;

  put(g, box(THREE, d.w * 0.9, d.h * 0.05, d.d * 0.6, woodMat), 0, tableH, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(g, box(THREE, d.w * 0.05, d.h * 0.8, d.w * 0.05, woodMat), sx * d.w * 0.42, d.h * 0.4, sz * d.d * 0.28);
    }
  }
  // Striped canvas awning, pitched.
  const cream = ctx.mat('#efe3c8', { roughness: 0.85 });
  const red = ctx.mat('#b8422f', { roughness: 0.85 });
  for (let i = 0; i < 5; i += 1) {
    const strip = put(g, box(THREE, d.w * 0.2, d.h * 0.03, d.d * 0.78, i % 2 ? red : cream),
      (i - 2) * d.w * 0.2, d.h * 0.84, 0);
    strip.rotation.x = 0.12;
  }
  // Produce crates on the table.
  const crateMat = ctx.mat('#a98455', { roughness: 0.9 });
  const produce = ['#c0392b', '#e0a92b', '#5d8c3a'];
  for (let i = 0; i < 3; i += 1) {
    put(g, box(THREE, d.w * 0.22, d.h * 0.1, d.d * 0.24, crateMat), (i - 1) * d.w * 0.28, tableH + d.h * 0.07, 0);
    put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.09, 6, 5), ctx.mat(produce[i], { roughness: 0.8 })),
      (i - 1) * d.w * 0.28, tableH + d.h * 0.15, 0);
  }
  return g;
}

function buildCypress(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const h = d.h * 1.5; // cypresses are the tall thin exclamation marks of Rome
  put(g, cyl(THREE, d.w * 0.07, d.w * 0.11, h * 0.16, 6, ctx.mat('#6b5340', { roughness: 0.95 })), 0, h * 0.08, 0);
  const darkGreen = ctx.mat('#26492b', { roughness: 0.92 });
  const midGreen = ctx.mat('#2f5a33', { roughness: 0.92 });
  // Three stacked tapering cones = the flame silhouette.
  put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.36, h * 0.5, 8), midGreen), 0, h * 0.36, 0);
  put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.3, h * 0.42, 8), darkGreen), 0, h * 0.6, 0);
  put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.2, h * 0.34, 8), midGreen), 0, h * 0.83, 0);
  return g;
}

function buildStoneFountain(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const h = d.h * 1.25;
  const stoneMat = ctx.mat(TRAVERTINE, { roughness: 0.85 });
  const bronzeMat = ctx.mat('#6e5a35', { metalness: 0.65, roughness: 0.4 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x8fd0e0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55,
  });

  put(g, box(THREE, d.w * 0.9, h * 0.5, d.d * 0.6, stoneMat), 0, h * 0.25, 0);
  put(g, box(THREE, d.w * 1.0, h * 0.1, d.d * 0.7, stoneMat), 0, h * 0.53, 0);
  put(g, box(THREE, d.w * 0.55, h * 0.42, d.d * 0.4, stoneMat), 0, h * 0.75, -d.d * 0.06);
  // Curved bronze spout + a trickle.
  const spout = put(g, cyl(THREE, d.w * 0.06, d.w * 0.06, d.w * 0.5, 6, bronzeMat), 0, h * 0.66, d.d * 0.18);
  spout.rotation.x = Math.PI / 2.4;
  put(g, cyl(THREE, d.w * 0.03, d.w * 0.03, h * 0.2, 5, waterMat), 0, h * 0.5, d.d * 0.28);
  return g;
}

function buildStoneBench(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const stoneMat = ctx.mat(TRAVERTINE, { roughness: 0.9 });
  const wornMat = ctx.mat('#c9bb9d', { roughness: 0.95 });

  put(g, box(THREE, d.w, d.h * 0.16, d.d * 0.8, stoneMat), 0, d.h * 0.46, 0);
  for (const sx of [-1, 1]) {
    put(g, box(THREE, d.w * 0.16, d.h * 0.38, d.d * 0.8, wornMat), sx * d.w * 0.38, d.h * 0.19, 0);
  }
  // A chipped carved band along the front edge.
  put(g, box(THREE, d.w * 0.86, d.h * 0.05, d.d * 0.06, wornMat), 0, d.h * 0.4, d.d * 0.4);
  return g;
}

// ===========================================================================
// CARNIVAL COAST — Rio, bright and saturated. Beach, fruit, cable cars, samba.
// ===========================================================================

function buildBeachUmbrella(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const h = d.h * 2.0;
  put(g, cyl(THREE, d.w * 0.05, d.w * 0.05, h * 0.85, 6, ctx.mat('#d8d2c4', { roughness: 0.7 })), 0, h * 0.42, 0);

  const a = ctx.mat('#f24b4b', { roughness: 0.7 });
  const b = ctx.mat('#ffe14d', { roughness: 0.7 });
  for (let i = 0; i < 8; i += 1) {
    const panel = put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.55, h * 0.24, 4, 1, true), i % 2 ? a : b),
      0, h * 0.82, 0);
    panel.rotation.y = (i / 8) * Math.PI * 2;
  }
  put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.09, 6, 5), ctx.mat('#f24b4b', { roughness: 0.6 })), 0, h * 0.96, 0);
  // A cooler slumped in the shade.
  put(g, box(THREE, d.w * 0.42, h * 0.12, d.d * 0.34, ctx.mat('#3aa6d8', { roughness: 0.6 })), d.w * 0.4, h * 0.06, d.d * 0.2);
  return g;
}

function buildFruitCart(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const woodMat = ctx.mat('#a9793f', { roughness: 0.9 });
  const deckH = d.h * 0.36;

  put(g, box(THREE, d.w * 0.85, deckH * 0.5, d.d * 0.5, woodMat), 0, deckH * 0.75, 0);
  put(g, box(THREE, d.w * 0.9, deckH * 0.1, d.d * 0.56, ctx.mat('#c69352', { roughness: 0.85 })), 0, deckH, 0);
  for (const sx of [-1, 1]) {
    const w = put(g, cyl(THREE, d.w * 0.18, d.w * 0.18, d.w * 0.06, 10, ctx.mat('#4a3a2c', { roughness: 0.9 })),
      sx * d.w * 0.4, d.w * 0.18, -d.d * 0.16);
    w.rotation.z = Math.PI / 2;
  }
  // Green-and-yellow canopy on corner poles.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(g, cyl(THREE, d.w * 0.03, d.w * 0.03, d.h * 0.42, 5, woodMat), sx * d.w * 0.4, deckH + d.h * 0.21, sz * d.d * 0.24);
    }
  }
  const green = ctx.mat('#2fa25a', { roughness: 0.75 });
  const yellow = ctx.mat('#ffd23a', { roughness: 0.75 });
  for (let i = 0; i < 4; i += 1) {
    put(g, box(THREE, d.w * 0.24, d.h * 0.03, d.d * 0.66, i % 2 ? green : yellow), (i - 1.5) * d.w * 0.24, deckH + d.h * 0.44, 0);
  }
  // Piled fruit — the color is the point.
  const fruits = ['#ff9f1c', '#e63946', '#ffe14d', '#6ab04c'];
  for (let i = 0; i < 8; i += 1) {
    const fx = (i % 4 - 1.5) * d.w * 0.19;
    const fz = (i < 4 ? -1 : 1) * d.d * 0.11;
    put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.1, 6, 5), ctx.mat(fruits[i % 4], { roughness: 0.7 })),
      fx, deckH + d.h * 0.06, fz);
  }
  return g;
}

function buildCableCarPylon(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const steelMat = ctx.mat('#b9563a', { metalness: 0.5, roughness: 0.5 });
  const cableMat = ctx.mat('#4d4d52', { metalness: 0.7, roughness: 0.4 });

  // Four splayed lattice legs with cross-bracing.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = put(g, box(THREE, d.w * 0.12, d.h * 0.78, d.w * 0.12, steelMat),
        sx * d.w * 0.3, d.h * 0.39, sz * d.w * 0.3);
      leg.rotation.z = -sx * 0.05;
      leg.rotation.x = sz * 0.05;
    }
  }
  for (let i = 1; i <= 3; i += 1) {
    const y = d.h * (i * 0.2);
    put(g, box(THREE, d.w * 0.9, d.w * 0.08, d.w * 0.08, steelMat), 0, y, -d.w * 0.3);
    put(g, box(THREE, d.w * 0.08, d.w * 0.08, d.w * 0.9, steelMat), d.w * 0.3, y, 0);
  }
  // Head frame + the cable running off into the hillside.
  put(g, box(THREE, d.w * 1.4, d.h * 0.05, d.w * 0.3, steelMat), 0, d.h * 0.82, 0);
  for (const sx of [-1, 1]) {
    const sheave = put(g, new THREE.Mesh(new THREE.TorusGeometry(d.w * 0.22, d.w * 0.06, 6, 10), cableMat),
      sx * d.w * 0.55, d.h * 0.88, 0);
    sheave.rotation.y = Math.PI / 2;
  }
  const cable = put(g, cyl(THREE, d.w * 0.04, d.w * 0.04, d.h * 0.9, 5, cableMat), 0, d.h * 0.9, 0);
  cable.rotation.x = Math.PI / 2.1;
  return g;
}

function buildSambaDrums(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const skinMat = ctx.mat('#f2e7cf', { roughness: 0.75 });
  const hoopMat = ctx.mat('#c9ced4', { metalness: 0.7, roughness: 0.3 });
  const shells = ['#1f8a5c', '#f2c53d', '#2b6cb0'];

  const layout = [[-0.26, 0.9, 0.3], [0.05, 1.25, 0.36], [0.32, 0.7, 0.26]];
  for (let i = 0; i < 3; i += 1) {
    const [x, hFrac, r] = layout[i];
    const drumH = d.h * hFrac;
    put(g, cyl(THREE, d.w * r, d.w * r, drumH, 12, ctx.mat(shells[i], { roughness: 0.55, metalness: 0.15 })),
      x * d.w, drumH / 2, 0);
    put(g, cyl(THREE, d.w * r * 1.04, d.w * r * 1.04, d.h * 0.05, 12, hoopMat), x * d.w, drumH, 0);
    put(g, cyl(THREE, d.w * r * 0.98, d.w * r * 0.98, d.h * 0.02, 12, skinMat), x * d.w, drumH + d.h * 0.02, 0);
  }
  // A pair of sticks laid across the top.
  const stickMat = ctx.mat('#c9a06a', { roughness: 0.8 });
  for (const sz of [-1, 1]) {
    const stick = put(g, cyl(THREE, d.w * 0.03, d.w * 0.03, d.w * 0.5, 5, stickMat), d.w * 0.06, d.h * 1.3, sz * d.d * 0.12);
    stick.rotation.z = Math.PI / 2;
  }
  return g;
}

// ===========================================================================
// RED SQUARE HEIGHTS — cold desaturated winter. Concrete, panel colors, trams.
// ===========================================================================

function buildLada(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const bodyMat = ctx.mat('#c8cbc2', { metalness: 0.28, roughness: 0.5 });
  const glassMat = ctx.mat('#4b555c', { metalness: 0.3, roughness: 0.25 });
  const trimMat = ctx.mat('#6d7178', { metalness: 0.5, roughness: 0.4 });
  const tyreMat = ctx.mat('#151515', { roughness: 0.9 });
  const wr = d.h * 0.23;

  // Utterly rectilinear — that boxiness IS the car.
  put(g, box(THREE, d.w, d.h * 0.42, d.d * 0.95, bodyMat), 0, wr + d.h * 0.21, 0);
  put(g, box(THREE, d.w * 0.92, d.h * 0.36, d.d * 0.44, bodyMat), 0, wr + d.h * 0.6, -d.d * 0.02);
  put(g, box(THREE, d.w * 0.94, d.h * 0.22, d.d * 0.4, glassMat), 0, wr + d.h * 0.63, -d.d * 0.02);
  put(g, box(THREE, d.w * 1.02, d.h * 0.06, d.d * 0.98, trimMat), 0, wr + d.h * 0.08, 0);
  // Square headlights, roof rack.
  for (const sx of [-1, 1]) {
    put(g, box(THREE, d.w * 0.2, d.h * 0.09, d.d * 0.03, glowMat(ctx, '#fff6de', 0.8)), sx * d.w * 0.3, wr + d.h * 0.26, d.d * 0.48);
  }
  for (const sz of [-1, 1]) {
    put(g, box(THREE, d.w * 0.86, d.h * 0.03, d.d * 0.04, trimMat), 0, wr + d.h * 0.8, sz * d.d * 0.16);
  }
  for (const [x, z] of [[d.w / 2, d.d * 0.32], [-d.w / 2, d.d * 0.32], [d.w / 2, -d.d * 0.32], [-d.w / 2, -d.d * 0.32]]) {
    put(g, wheel(THREE, wr, d.w * 0.16, tyreMat), x, wr, z);
  }
  return g;
}

function buildSovietKiosk(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const panelMat = ctx.mat('#b9bcae', { roughness: 0.85, metalness: 0.05 });
  const trimMat = ctx.mat('#8c3b34', { roughness: 0.7 });
  const glassMat = ctx.mat('#5a6a70', { metalness: 0.25, roughness: 0.2, emissive: '#5a6a70', emissiveIntensity: 0.18 });
  const h = d.h * 0.72;

  put(g, box(THREE, d.w * 0.86, h, d.d * 0.7, panelMat), 0, h / 2, 0);
  // Serving hatch + goods window.
  put(g, box(THREE, d.w * 0.5, h * 0.3, d.d * 0.04, glassMat), 0, h * 0.62, d.d * 0.36);
  put(g, box(THREE, d.w * 0.56, h * 0.06, d.d * 0.16, trimMat), 0, h * 0.44, d.d * 0.38);
  // Flat overhanging roof + sign board.
  put(g, box(THREE, d.w * 1.0, h * 0.07, d.d * 0.84, trimMat), 0, h * 1.02, 0);
  put(g, box(THREE, d.w * 0.7, h * 0.16, d.d * 0.04, trimMat), 0, h * 1.14, d.d * 0.3);
  // Ribbed side panels.
  for (let i = 0; i < 4; i += 1) {
    put(g, box(THREE, d.w * 0.03, h * 0.8, d.d * 0.72, ctx.mat('#a4a89b', { roughness: 0.9 })),
      (i - 1.5) * d.w * 0.22, h * 0.5, 0);
  }
  return g;
}

function buildConcretePlanter(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const concreteMat = ctx.mat('#9a9c96', { roughness: 0.95, metalness: 0.02 });
  const wornMat = ctx.mat('#87897f', { roughness: 0.98 });

  put(g, box(THREE, d.w, d.h * 0.66, d.d, concreteMat), 0, d.h * 0.33, 0);
  put(g, box(THREE, d.w * 1.08, d.h * 0.1, d.d * 1.08, wornMat), 0, d.h * 0.66, 0);
  put(g, box(THREE, d.w * 1.06, d.h * 0.08, d.d * 1.06, wornMat), 0, d.h * 0.04, 0);
  // Dirt + a hardy little conifer.
  put(g, box(THREE, d.w * 0.82, d.h * 0.05, d.d * 0.82, ctx.mat('#4a4136', { roughness: 1 })), 0, d.h * 0.68, 0);
  put(g, new THREE.Mesh(new THREE.ConeGeometry(d.w * 0.34, d.h * 0.7, 7), ctx.mat('#3a5a3e', { roughness: 0.92 })),
    0, d.h * 1.05, 0);
  return g;
}

function buildTramStop(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const poleMat = ctx.mat('#6f7479', { metalness: 0.5, roughness: 0.5 });
  const signMat = ctx.mat('#a52a2a', { roughness: 0.6 });

  put(g, cyl(THREE, d.w * 0.3, d.w * 0.42, d.h * 0.06, 8, poleMat), 0, d.h * 0.03, 0);
  put(g, cyl(THREE, d.w * 0.13, d.w * 0.16, d.h * 0.86, 8, poleMat), 0, d.h * 0.46, 0);
  // Tram-stop plate + timetable box.
  put(g, box(THREE, d.w * 1.5, d.h * 0.16, d.w * 0.1, signMat), 0, d.h * 0.86, 0);
  put(g, box(THREE, d.w * 1.2, d.h * 0.1, d.w * 0.12, ctx.mat('#e8e4d8', { roughness: 0.85 })), 0, d.h * 0.86, d.w * 0.06);
  put(g, box(THREE, d.w * 1.0, d.h * 0.2, d.w * 0.09, ctx.mat('#dfe3e6', { roughness: 0.8 })), 0, d.h * 0.6, d.w * 0.09);
  // Overhead-wire bracket reaching over the track.
  put(g, box(THREE, d.w * 0.1, d.w * 0.1, d.h * 0.34, poleMat), 0, d.h * 0.94, d.h * 0.16);
  put(g, cyl(THREE, d.w * 0.05, d.w * 0.05, d.w * 0.4, 6, ctx.mat('#3f4348', { metalness: 0.7, roughness: 0.4 })),
    0, d.h * 0.9, d.h * 0.3);
  return g;
}

// ===========================================================================
// HARBOR OPERA BAY — Sydney morning. Timber, gum trees, surf, working harbor.
// ===========================================================================

function buildFerryBollard(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const ironMat = ctx.mat('#2f3a40', { metalness: 0.6, roughness: 0.5 });
  const ropeMat = ctx.mat('#b9a882', { roughness: 0.95 });

  put(g, cyl(THREE, d.w * 0.46, d.w * 0.56, d.h * 0.12, 10, ironMat), 0, d.h * 0.06, 0);
  put(g, cyl(THREE, d.w * 0.36, d.w * 0.42, d.h * 0.62, 10, ironMat), 0, d.h * 0.43, 0);
  const head = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.44, 10, 8), ironMat), 0, d.h * 0.76, 0);
  head.scale.set(1, 0.72, 1);
  // Mooring rope coiled around the shaft and slung off to one side.
  for (let i = 0; i < 2; i += 1) {
    const coil = put(g, new THREE.Mesh(new THREE.TorusGeometry(d.w * 0.44, d.w * 0.08, 6, 12), ropeMat),
      0, d.h * (0.3 + i * 0.14), 0);
    coil.rotation.x = Math.PI / 2;
  }
  const tail = put(g, cyl(THREE, d.w * 0.07, d.w * 0.07, d.w * 0.5, 6, ropeMat), d.w * 0.3, d.h * 0.06, d.w * 0.3);
  tail.rotation.z = Math.PI / 2.2;
  return g;
}

function buildSurfboardRack(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const frameMat = ctx.mat('#8d949a', { metalness: 0.55, roughness: 0.45 });
  const boardColors = ['#f2f5f7', '#2fa8c8', '#f2b705'];

  // A-frame rack.
  for (const sz of [-1, 1]) {
    put(g, box(THREE, d.w * 0.28, d.h * 0.7, d.w * 0.2, frameMat), 0, d.h * 0.35, sz * d.d * 0.4);
  }
  put(g, box(THREE, d.w * 0.24, d.w * 0.2, d.d * 0.95, frameMat), 0, d.h * 0.62, 0);

  // Three boards leaning at slightly different angles — never neatly stacked.
  for (let i = 0; i < 3; i += 1) {
    const board = put(g, box(THREE, d.w * 0.5, d.h * 1.15, d.w * 0.14, ctx.mat(boardColors[i], { roughness: 0.35, metalness: 0.1 })),
      (i - 1) * d.w * 1.1, d.h * 0.56, d.d * 0.06 * (i - 1));
    board.rotation.z = -0.16 + i * 0.13;
    board.rotation.x = 0.08;
    // Fin stub.
    put(g, box(THREE, d.w * 0.1, d.h * 0.16, d.w * 0.06, ctx.mat('#33383c', { roughness: 0.6 })),
      (i - 1) * d.w * 1.1, d.h * 1.06, d.d * 0.06 * (i - 1));
  }
  return g;
}

function buildGumTree(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const trunkMat = ctx.mat('#d8d2c6', { roughness: 0.9 });
  const patchMat = ctx.mat('#a89c8a', { roughness: 0.95 });
  const trunkH = d.h * 0.58;

  put(g, cyl(THREE, d.w * 0.09, d.w * 0.15, trunkH, 8, trunkMat), 0, trunkH / 2, 0);
  // Mottled bark patches — the eucalypt tell.
  for (let i = 0; i < 3; i += 1) {
    const patch = put(g, cyl(THREE, d.w * 0.1, d.w * 0.11, trunkH * 0.16, 8, patchMat),
      0, trunkH * (0.25 + i * 0.24), 0);
    patch.rotation.y = i * 0.7;
  }
  // Two forking limbs into a sparse, open, blue-green canopy.
  const canopyMat = ctx.mat('#6f8f73', { roughness: 0.92 });
  const canopyMat2 = ctx.mat('#5d7d66', { roughness: 0.92 });
  for (const sx of [-1, 1]) {
    const limb = put(g, cyl(THREE, d.w * 0.05, d.w * 0.08, trunkH * 0.42, 6, trunkMat), sx * d.w * 0.1, trunkH * 1.1, 0);
    limb.rotation.z = -sx * 0.34;
    const blob = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.34, 8, 6), sx > 0 ? canopyMat : canopyMat2),
      sx * d.w * 0.22, trunkH * 1.36, sx * d.w * 0.08);
    blob.scale.set(1, 0.72, 1);
  }
  const top = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.3, 8, 6), canopyMat), 0, trunkH * 1.55, 0);
  top.scale.set(1.1, 0.62, 1.1);
  return g;
}

function buildHarborBench(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const timberMat = ctx.mat('#a9713f', { roughness: 0.82 });
  const steelMat = ctx.mat('#8f979c', { metalness: 0.6, roughness: 0.4 });

  // Wide timber slats over a curved steel frame.
  for (let i = 0; i < 4; i += 1) {
    put(g, box(THREE, d.w, d.h * 0.06, d.d * 0.13, timberMat), 0, d.h * 0.45, (i - 1.5) * d.d * 0.17);
  }
  for (let i = 0; i < 3; i += 1) {
    const slat = put(g, box(THREE, d.w, d.h * 0.07, d.d * 0.07, timberMat), 0, d.h * (0.58 + i * 0.13), -d.d * 0.36);
    slat.rotation.x = -0.2;
  }
  for (const sx of [-1, 1]) {
    put(g, box(THREE, d.w * 0.05, d.h * 0.45, d.d * 0.06, steelMat), sx * d.w * 0.42, d.h * 0.22, d.d * 0.3);
    put(g, box(THREE, d.w * 0.05, d.h * 0.8, d.d * 0.06, steelMat), sx * d.w * 0.42, d.h * 0.4, -d.d * 0.34);
    put(g, box(THREE, d.w * 0.05, d.h * 0.06, d.d * 0.75, steelMat), sx * d.w * 0.42, d.h * 0.42, 0);
  }
  return g;
}

// ===========================================================================
// CAPITAL PRIME — sci-fi dusk finale. Everything is a light source.
// ===========================================================================

function buildHoverDrone(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const shellMat = ctx.mat('#2a2f42', { metalness: 0.6, roughness: 0.3 });
  const hover = d.h * 0.55; // it floats — no wheels anywhere on it

  const body = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 1.1, 10, 8), shellMat), 0, hover, 0);
  body.scale.set(1, 0.55, 1.6);
  put(g, box(THREE, d.w * 1.6, d.h * 0.06, d.d * 0.36, shellMat), 0, hover, 0);
  // Four thruster pods, glowing violet under the chassis.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pod = put(g, cyl(THREE, d.w * 0.32, d.w * 0.26, d.h * 0.12, 8, shellMat),
        sx * d.w * 0.75, hover - d.h * 0.08, sz * d.d * 0.3);
      pod.rotation.x = 0;
      put(g, cyl(THREE, d.w * 0.24, d.w * 0.24, d.h * 0.04, 8, glowMat(ctx, '#7a5cff', 1.4)),
        sx * d.w * 0.75, hover - d.h * 0.15, sz * d.d * 0.3);
    }
  }
  // Sensor bar + underslung cargo clamp.
  put(g, box(THREE, d.w * 1.2, d.h * 0.05, d.d * 0.06, glowMat(ctx, '#00e5ff', 1.2)), 0, hover + d.h * 0.12, d.d * 0.28);
  put(g, box(THREE, d.w * 0.5, d.h * 0.2, d.d * 0.3, shellMat), 0, hover - d.h * 0.3, 0);
  return g;
}

function buildHoloAdPylon(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const baseMat = ctx.mat('#1b2033', { metalness: 0.5, roughness: 0.4 });

  put(g, cyl(THREE, d.w * 0.34, d.w * 0.46, d.h * 0.12, 8, baseMat), 0, d.h * 0.06, 0);
  put(g, box(THREE, d.w * 0.24, d.h * 0.9, d.w * 0.24, baseMat), 0, d.h * 0.5, 0);
  // The projected panel: an additive-blended slab, so it reads as light rather
  // than a lit surface — and additive blending alone puts it in the bloom pass.
  const holoMat = new THREE.MeshStandardMaterial({
    color: 0x7ad9ff,
    emissive: 0x7ad9ff,
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    roughness: 0.2,
  });
  put(g, box(THREE, d.w * 0.72, d.h * 0.62, d.w * 0.04, holoMat), 0, d.h * 0.66, d.w * 0.1);
  // Scan bands drifting across it.
  for (let i = 0; i < 3; i += 1) {
    put(g, box(THREE, d.w * 0.76, d.h * 0.03, d.w * 0.05, glowMat(ctx, '#c9f2ff', 1.6)),
      0, d.h * (0.48 + i * 0.18), d.w * 0.11);
  }
  put(g, cyl(THREE, d.w * 0.4, d.w * 0.4, d.h * 0.03, 8, glowMat(ctx, '#7a5cff', 1.2)), 0, d.h * 0.14, 0);
  return g;
}

function buildSecurityBollard(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const shellMat = ctx.mat('#20263a', { metalness: 0.6, roughness: 0.35 });

  put(g, cyl(THREE, d.w * 0.5, d.w * 0.58, d.h * 0.08, 10, shellMat), 0, d.h * 0.04, 0);
  put(g, cyl(THREE, d.w * 0.28, d.w * 0.34, d.h * 0.78, 10, shellMat), 0, d.h * 0.47, 0);
  // Two hazard rings + a scanner eye.
  for (const y of [0.34, 0.6]) {
    put(g, cyl(THREE, d.w * 0.36, d.w * 0.36, d.h * 0.06, 10, glowMat(ctx, '#ff3b6b', 1.2)), 0, d.h * y, 0);
  }
  const eye = put(g, new THREE.Mesh(new THREE.SphereGeometry(d.w * 0.2, 8, 6), glowMat(ctx, '#00e5ff', 1.3)), 0, d.h * 0.9, 0);
  eye.scale.set(1, 0.8, 1);
  put(g, cyl(THREE, d.w * 0.3, d.w * 0.26, d.h * 0.06, 10, shellMat), 0, d.h * 0.86, 0);
  return g;
}

function buildChargingStation(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const h = d.h * 1.5;
  const shellMat = ctx.mat('#232a3d', { metalness: 0.55, roughness: 0.35 });

  put(g, box(THREE, d.w * 0.9, h * 0.06, d.d * 1.1, shellMat), 0, h * 0.03, 0);
  put(g, box(THREE, d.w * 0.7, h * 0.86, d.d * 0.7, shellMat), 0, h * 0.48, 0);
  // Status screen.
  put(g, box(THREE, d.w * 0.5, h * 0.26, d.d * 0.06, glowMat(ctx, '#4dffa8', 1.1)), 0, h * 0.68, d.d * 0.36);
  // Charge-level bar up the flank.
  for (let i = 0; i < 4; i += 1) {
    put(g, box(THREE, d.w * 0.08, h * 0.06, d.d * 0.05, glowMat(ctx, '#7a5cff', 1.0)),
      d.w * 0.36, h * (0.24 + i * 0.1), d.d * 0.3);
  }
  // Coiled cable on a hook.
  const coil = put(g, new THREE.Mesh(new THREE.TorusGeometry(d.w * 0.24, d.w * 0.07, 6, 12), ctx.mat('#14181f', { roughness: 0.85 })),
    -d.w * 0.4, h * 0.5, 0);
  coil.rotation.y = Math.PI / 2;
  put(g, box(THREE, d.w * 0.16, h * 0.05, d.d * 0.12, shellMat), -d.w * 0.38, h * 0.66, 0);
  return g;
}

function buildHoloLamppost(THREE, ctx) {
  const g = new THREE.Group();
  const d = ctx.dim;
  const shellMat = ctx.mat('#232a3d', { metalness: 0.6, roughness: 0.32 });

  put(g, cyl(THREE, d.w * 0.34, d.w * 0.48, d.h * 0.06, 8, shellMat), 0, d.h * 0.03, 0);
  put(g, cyl(THREE, d.w * 0.1, d.w * 0.16, d.h * 0.88, 8, shellMat), 0, d.h * 0.47, 0);
  // A floating light bar held off the post by a thin arm.
  put(g, box(THREE, d.w * 0.09, d.w * 0.09, d.h * 0.24, shellMat), 0, d.h * 0.9, d.h * 0.1);
  put(g, box(THREE, d.w * 0.5, d.h * 0.05, d.h * 0.3, glowMat(ctx, '#00e5ff', 1.4)), 0, d.h * 0.86, d.h * 0.22);
  // Vertical accent strip running the length of the post.
  put(g, box(THREE, d.w * 0.06, d.h * 0.6, d.w * 0.06, glowMat(ctx, '#7a5cff', 1.0)), d.w * 0.14, d.h * 0.5, 0);
  return g;
}

// ===========================================================================
// THE REGISTRY
// ===========================================================================
//
// metroId -> kind -> [builder, ...]. Metro ids are the exact `id` values from
// src/data/metros.js (a hard contract there); kinds are the exact strings from
// src/content/propkit.js's DIMENSIONS table. A test pins both, so a rename on
// either side fails loudly instead of silently reverting a metro to generic
// props.
//
// Multiple builders in one slot are variety within a metro: the caller passes
// an integer `variant` (usually a spawn-loop index) and it is taken modulo the
// list length, so one street can hold a mix while staying deterministic.
export const METRO_PROP_VARIANTS = {
  'neon-district': {
    trash: [buildVendingMachine],
    bike: [buildCapsuleScooter],
    'building-small': [buildNoodleStall],
    streetlight: [buildSignboardPole],
  },
  'old-fog-town': {
    car: [buildBlackCab],
    bus: [buildDoubleDecker],
    'building-small': [buildPhoneBox],
    streetlight: [buildIronLamppost],
    mailbox: [buildPillarBox],
  },
  'vieux-continent': {
    trash: [buildCafeTable],
    'building-small': [buildNewsKiosk],
    hydrant: [buildWallaceFountain],
    bench: [buildIronBench],
    streetlight: [buildParisLamppost],
  },
  'harbor-metropolis': {
    car: [buildYellowCab],
    trash: [buildTrashBags],
    'building-small': [buildHotDogCart],
    'speed-bump': [buildSteamManhole],
  },
  'desert-spires': {
    tree: [buildPalmTree],
    car: [buildSupercar],
    trash: [buildGoldPlanter],
    streetlight: [buildGoldLamppost],
  },
  'coliseum-city': {
    bike: [buildVespa],
    'building-small': [buildMarketStall],
    tree: [buildCypress],
    hydrant: [buildStoneFountain],
    bench: [buildStoneBench],
  },
  'carnival-coast': {
    trash: [buildBeachUmbrella],
    'building-small': [buildFruitCart],
    streetlight: [buildCableCarPylon],
    bench: [buildSambaDrums],
  },
  'red-square-heights': {
    car: [buildLada],
    'building-small': [buildSovietKiosk],
    trash: [buildConcretePlanter],
    streetlight: [buildTramStop],
  },
  'harbor-opera-bay': {
    hydrant: [buildFerryBollard],
    bike: [buildSurfboardRack],
    tree: [buildGumTree],
    bench: [buildHarborBench],
  },
  'capital-prime': {
    bike: [buildHoverDrone],
    'building-small': [buildHoloAdPylon],
    hydrant: [buildSecurityBollard],
    mailbox: [buildChargingStation],
    streetlight: [buildHoloLamppost],
  },
};

// True when `metroId` has at least one authored variant for `kind`. Pure, no
// THREE needed — usable by tests and by callers deciding whether to bother
// threading a metro id through.
export function hasMetroVariant(metroId, kind) {
  const slots = METRO_PROP_VARIANTS[metroId];
  return !!(slots && Array.isArray(slots[kind]) && slots[kind].length > 0);
}

// Every kind this metro re-skins. Empty array for an unknown metro.
export function metroVariantKinds(metroId) {
  const slots = METRO_PROP_VARIANTS[metroId];
  return slots ? Object.keys(slots) : [];
}

// Builds the metro's variant mesh for `kind`, or returns null when there is no
// variant — null is the signal for propkit to fall through to the generic
// builder, which is what makes the whole feature additive.
//
// A builder that throws is treated the same as "no variant": the caller falls
// back rather than taking the level build down with it. Authoring a bad prop
// should cost you that prop's flavor, not the whole city.
export function createMetroVariantMesh(metroId, kind, THREE, ctx, variantIndex = 0) {
  if (!THREE || !ctx) return null;
  const slots = METRO_PROP_VARIANTS[metroId];
  if (!slots) return null;
  const builders = slots[kind];
  if (!Array.isArray(builders) || builders.length === 0) return null;

  const idx = Number.isFinite(variantIndex)
    ? ((Math.floor(variantIndex) % builders.length) + builders.length) % builders.length
    : 0;
  try {
    const mesh = builders[idx](THREE, ctx);
    return mesh && typeof mesh.traverse === 'function' ? mesh : null;
  } catch (err) {
    return null;
  }
}
