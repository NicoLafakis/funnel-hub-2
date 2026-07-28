// Core Three.js engine primitives: renderer, scene, camera, clock, resize/render.
//
// Shared THREE instance: this project does not have every engine module do its
// own `import * as THREE from 'three'`. Instead src/main.js performs a single
// `import * as THREE from 'three'` for the whole app and passes that one THREE
// namespace object into createEngine()/createAvatar()/createChaseCamera() as an
// explicit parameter (dependency injection). ES module imports are cached per
// resolved specifier under both the browser import map and Node's node_modules
// resolution, so there is only ever one underlying 'three' module either way —
// passing THREE explicitly just makes that sharing visible and lets tests
// inject a THREE instance without relying on import-cache behavior.
//
// No browser-only API (document/window) is touched at module top level — only
// inside createEngine(), so a bare `import` of this file never throws in Node.
export function createEngine(canvasEl, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setClearColor(0x0b0f14, 1);

  const scene = new THREE.Scene();

  // NEAR/FAR — a depth-precision budget, not defaults (0004 defect 3).
  //
  // This shipped as (0.1, 20000): a 200,000:1 ratio into a 24-bit fixed-point
  // depth buffer, with logarithmicDepthBuffer off. Depth resolution in a
  // standard perspective projection is
  //
  //     dz(z) = z^2 * (far - near) / (near * far * (2^24 - 1))
  //
  // which for far >> near collapses to ~z^2 / (near * 2^24): resolution is set
  // almost entirely by NEAR, and lowering FAR buys almost nothing. Measured on
  // the old values:
  //
  //     dz(368u, at the avatar)     = 0.081 world units
  //     dz(2052u, at fog near)      = 2.51  world units
  //
  // The ground stack is base ground y=0.00, ground-detail y=0.05, road paint
  // y=0.08 — the WHOLE stack fits inside a single depth increment at the
  // avatar, and 30 objects sit within 0.05 of y=0. It did not visibly z-fight
  // only because the detail plane has depthWrite off and the paint happened to
  // draw first; that is luck, not ordering, and it was one material change away
  // from breaking.
  //
  // NEAR = 20. Justified against the measured minimum camera-to-geometry
  // distance across the whole level ladder, not guessed:
  //   * camera.js frames at dist = 12 * avatar.radius() with pitch 35-65 deg.
  //     avatar.radius() floors at 26 on EVERY level (avatar.js: 26 + sqrt(...)),
  //     and radiusCap = world*0.2 is never reached (max realistic radius ~151).
  //     So the closest the camera ever legitimately sits to the hero is
  //     12r - 1.35r = 10.65 * 26 = 277 units. NEAR is 14x inside that.
  //   * the only other geometry the camera can approach is a tall building it
  //     is already flying into: max prop height is 419u (building-large, every
  //     level; 671u at L75) against a camera height of 12r*sin(pitch) = 179-283u
  //     at spawn radius. That fly-through is a PRE-EXISTING artifact — at
  //     near 0.1 you see through the building's culled backfaces, at near 20 you
  //     see through it 20 units sooner. It is not made meaningfully worse.
  //   * the one place a 20-unit near plane is genuinely new is camera.js's
  //     landmark pull-in, which parked the eye 0.5 units off the landmark face.
  //     That clearance is now derived from camera.near — see camera.js.
  //
  // FAR = 12000. Measured requirement is 8595 units (level 100: camera standoff
  // 12*151 = 1807 plus the 6788-unit ground diagonal), and the largest fog far
  // is 9600 (level 100, world*2.0). Anything past fog far is 100% fog colour,
  // and scene.background is set to that same colour by main.js, so far-plane
  // clipping out there is literally invisible. 12000 covers both with margin.
  //
  // Result: 600:1 instead of 200,000:1, and
  //     dz(368u)  = 0.0004 world units  (202x finer)
  //     dz(2052u) = 0.0125 world units  (201x finer)
  //     dz(4830u) = 0.069  world units  (at the far ground corner)
  // The 0.05 ground/detail gap is now 4 depth increments even at fog near.
  // logarithmicDepthBuffer stays OFF on purpose: it costs a per-fragment
  // gl_FragDepth write (which also disables early-Z) on every mobile GPU, and
  // 600:1 does not need it.
  const camera = new THREE.PerspectiveCamera(60, 1, 20, 12000);
  camera.position.set(0, 6, 12);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  // Hemisphere fill (Hole.io-style bright world): cool sky-blue from above,
  // warm ground bounce from below — kills the flat monochrome look the bare
  // ambient+directional pair gave. Colors/intensity are per-mood adjustable
  // via setMood() below.
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0xc9b28a, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dd, 0.9); // warm-tinted midday sun
  sun.position.set(120, 220, 80);
  scene.add(sun);
  scene.add(sun.target);

  // Real cast shadows (art-direction §5). Crisp contact shadows under every
  // building, car, tree and lamp are the single biggest contributor to the
  // reference's "clean 3D" read — flat blob decals cannot draw a building's
  // silhouette across a street. Level 1 renders in ~25 draw calls / 205k
  // triangles, so there is ample budget for one extra shadow pass.
  //
  // The light is directional, so its shadow camera is an ORTHOGRAPHIC box that
  // has to be re-aimed at whatever the player is looking at — a box big enough
  // to cover a 2400-4800u world in one go would quantise to mush at any sane
  // map size. followShadow() below keeps it centred on the avatar and sized to
  // the current view, which is what keeps the shadows sharp as the hole grows.
  renderer.shadowMap.enabled = true;
  // NOTE (0004, left for the lighting pass — deliberately NOT fixed here):
  // PCFSoftShadowMap is deprecated in r185 and WebGLShadowMap silently swaps it
  // for PCFShadowMap with a console warning (node_modules/three/src/renderers/
  // webgl/WebGLShadowMap.js:99). renderer.shadowMap.type reads back as 1
  // (PCFShadowMap), not 2, on the live build — so the "soft" in this line has
  // been a no-op for a while. Related and also unfixed here: the shadow frustum
  // below is re-aimed every frame without texel snapping, which is why the
  // shadow edges crawl (2048px over a 2*410u box = 0.42 world units per shadow
  // texel, measured live).
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0012;      // acne suppression on large flat ground quads
  sun.shadow.normalBias = 1.2;    // world units — props are big, so this is too
  const SUN_DIR = new THREE.Vector3(120, 220, 80).normalize();

  // Re-centre the sun and its shadow box on a world point, covering `extent`
  // world units around it. main.js calls this each frame with the avatar
  // position and a radius-derived extent.
  function followShadow(x, z, extent) {
    const half = Math.max(120, extent);
    const dist = half * 2.5;
    sun.position.set(x + SUN_DIR.x * dist, SUN_DIR.y * dist, z + SUN_DIR.z * dist);
    sun.target.position.set(x, 0, z);
    sun.target.updateMatrixWorld();
    const cam = sun.shadow.camera;
    if (cam.left !== -half) {
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 1;
      cam.far = dist * 2.2;
      cam.updateProjectionMatrix();
    }
  }

  // Single entry point for per-level lighting mood (metro palette + night
  // variants). Callers pass hex colors for the hemisphere sky/ground bounce
  // and `night: true` to dim every fixture — main.js's night dimming must go
  // through here, never by poking light intensities directly.
  function setMood({ sky, ground, night } = {}) {
    if (sky !== undefined) hemi.color.set(sky);
    if (ground !== undefined) hemi.groundColor.set(ground);
    const dim = !!night;
    ambient.intensity = dim ? 0.28 : 0.55;
    sun.intensity = dim ? 0.45 : 0.9;
    hemi.intensity = dim ? 0.3 : 0.7;
  }

  const clock = new THREE.Clock();

  // Device-pixel-ratio aware resize, capped at 2 — same spirit as the old
  // game's `resize()` (index.html git history: `DPR = Math.min(window.devicePixelRatio||1, 2)`).
  function resize() {
    const hasWindow = typeof window !== 'undefined';
    const w = hasWindow ? window.innerWidth : (canvasEl.clientWidth || 1);
    const h = hasWindow ? window.innerHeight : (canvasEl.clientHeight || 1);
    const dpr = Math.min((hasWindow ? window.devicePixelRatio : 1) || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resize);
  }
  resize();

  function render() {
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, clock, resize, render, setMood, followShadow };
}
