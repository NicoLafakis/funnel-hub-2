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

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20000);
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
