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

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 8000);
  camera.position.set(0, 6, 12);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(120, 220, 80);
  scene.add(sun);

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

  return { scene, camera, renderer, clock, resize, render };
}
