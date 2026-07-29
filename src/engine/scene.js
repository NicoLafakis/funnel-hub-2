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
// The postprocessing addons are version-matched copies from
// node_modules/three@0.185.1/examples/jsm (vendored under assets/vendor/) —
// they define classes only, so importing them headlessly is safe too.
import { EffectComposer } from '../../assets/vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../../assets/vendor/postprocessing/RenderPass.js';
import { BokehPass } from '../../assets/vendor/postprocessing/BokehPass.js';

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

  // Postprocessing chain: render -> depth-of-field bokeh. The BokehPass's
  // `focus` is updated every frame from main.js (setFocus) to the
  // camera->avatar distance, so the avatar and its immediate surroundings
  // stay tack-sharp while background city and near foreground fall into
  // blur. BokehShader math: blur = clamp((focus - viewDist) * aperture,
  // +-maxblur), so with aperture 0.0001 defocus beyond ~70 world units
  // reaches full blur — a portrait-style DOF tuned to this game's scale.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bokehPass = new BokehPass(scene, camera, {
    focus: 60,
    aperture: 0.0001,
    maxblur: 0.007,
  });
  composer.addPass(bokehPass);

  function setFocus(distance) {
    if (Number.isFinite(distance) && distance > 0) {
      bokehPass.uniforms.focus.value = distance;
    }
  }

  // Device-pixel-ratio aware resize, capped at 2 — same spirit as the old
  // game's `resize()` (index.html git history: `DPR = Math.min(window.devicePixelRatio||1, 2)`).
  function resize() {
    const hasWindow = typeof window !== 'undefined';
    const w = hasWindow ? window.innerWidth : (canvasEl.clientWidth || 1);
    const h = hasWindow ? window.innerHeight : (canvasEl.clientHeight || 1);
    const dpr = Math.min((hasWindow ? window.devicePixelRatio : 1) || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    composer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    bokehPass.uniforms.aspect.value = camera.aspect;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resize);
  }
  resize();

  function render() {
    composer.render();
  }

  return { scene, camera, renderer, clock, resize, render, setFocus };
}
