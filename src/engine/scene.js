// Core Three.js engine primitives: renderer, scene, camera, clock, resize/render,
// per-metro atmosphere, and the postprocessing chain (depth of field + selective
// bloom).
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
// node_modules/three@0.185.1/examples/jsm (vendored under assets/vendor/ by
// scripts/vendor-three.js on every `npm install`) — they define classes only,
// so importing them headlessly is safe too.
import { EffectComposer } from '../../assets/vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../../assets/vendor/postprocessing/RenderPass.js';
import { ShaderPass } from '../../assets/vendor/postprocessing/ShaderPass.js';
import { BokehPass } from '../../assets/vendor/postprocessing/BokehPass.js';
import { UnrealBloomPass } from '../../assets/vendor/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
// Selective bloom
// ---------------------------------------------------------------------------
//
// A global UnrealBloomPass over the beauty frame would bloom whatever happens
// to be bright — which in a daylit city is every white building, every sunlit
// road, and the sky itself. Result: a white blobby wash, not a glow.
//
// So bloom here is SELECTIVE by geometry, not by luminance alone. Objects that
// should glow get an extra render layer enabled (BLOOM_LAYER). Each frame the
// engine renders the scene a second time with the camera restricted to that
// layer and the background nulled out — so the bloom source frame contains ONLY
// emissive geometry against black — runs UnrealBloomPass over that, and adds
// the result on top of the finished beauty frame.
//
// The consequence that matters: an ordinary lit surface can be as bright as it
// likes and still contribute exactly zero bloom, because it was never in the
// bloom source frame at all. The per-metro `threshold` then only has to
// separate glow tiers WITHIN the emissive set, which is why Old Fog Town can
// sit at 0.75 (almost nothing glows) while Neon District sits at 0.28.
//
// Layer 0 stays enabled on bloom objects, so they still render normally in the
// beauty pass — enabling BLOOM_LAYER is purely additive.
export const BLOOM_LAYER = 1;

// Emissive intensity at or above which a MeshStandardMaterial is treated as
// "a light source, not a lit surface". Calibrated against the existing content:
// building window bands sit at 0.12-0.25 and stay OUT (this is exactly the
// "don't turn buildings into blobs" line), while streetlight lamp heads (0.9),
// rooftop beacons (1.0), landmark neon (1.4) and the portal (1.8) are IN.
export const BLOOM_EMISSIVE_MIN = 0.6;

// Walks `root` and enables BLOOM_LAYER on every mesh that reads as genuinely
// emissive. Returns how many nodes were marked.
//
// Detection, in priority order:
//   1. node.userData.bloom / material.userData.bloom === false -> never bloom.
//   2. node.userData.bloom / material.userData.bloom === true  -> always bloom.
//   3. additive-blended material                               -> bloom
//      (additive blending is only ever used for glow — the avatar's rim shell,
//      neon tubes — so it is a reliable signal on its own).
//   4. non-black emissive with emissiveIntensity >= BLOOM_EMISSIVE_MIN -> bloom.
//
// Rules 3 and 4 are deliberately content-driven rather than a hardcoded list of
// prop kinds: src/content/propkit.js is owned elsewhere, so any neon signage or
// headlight material added there starts glowing with no change needed here, and
// the userData escape hatch lets that code force the decision either way.
//
// THREE is optional (only used to read the AdditiveBlending constant) so this
// stays callable from anywhere, including headless tests.
export function markBloomEmissive(root, THREE, opts = {}) {
  if (!root || typeof root.traverse !== 'function') return 0;

  const minEmissive = typeof opts.minEmissiveIntensity === 'number'
    ? opts.minEmissiveIntensity
    : BLOOM_EMISSIVE_MIN;
  // THREE.AdditiveBlending === 2; the literal is the fallback for callers that
  // do not have a THREE instance handy.
  const additive = THREE && typeof THREE.AdditiveBlending === 'number' ? THREE.AdditiveBlending : 2;

  let marked = 0;

  root.traverse((node) => {
    if (!node || !(node.isMesh || node.isPoints || node.isLine || node.isSprite)) return;
    if (node.userData && node.userData.bloom === false) return;

    let wants = !!(node.userData && node.userData.bloom === true);

    if (!wants) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.userData && m.userData.bloom === false) return;
        if (m.userData && m.userData.bloom === true) { wants = true; break; }
        if (m.blending === additive) { wants = true; break; }
        const e = m.emissive;
        const emits = e && (e.r > 0.01 || e.g > 0.01 || e.b > 0.01);
        const intensity = typeof m.emissiveIntensity === 'number' ? m.emissiveIntensity : 1;
        if (emits && intensity >= minEmissive) { wants = true; break; }
      }
    }

    if (wants) {
      node.layers.enable(BLOOM_LAYER);
      marked += 1;
    }
  });

  return marked;
}

// Adds the selective-bloom buffer on top of the finished (already
// depth-of-field'd) beauty frame. Kept app-local rather than vendored — it is
// three lines of GLSL specific to this chain, not a three.js addon.
const BloomCombineShader = {
  name: 'BloomCombineShader',
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D( tDiffuse, vUv );
      vec4 glow = texture2D( tBloom, vUv );
      gl_FragColor = vec4( base.rgb + glow.rgb, base.a );
    }`,
};

export function createEngine(canvasEl, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setClearColor(0x0b0f14, 1);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 8000);
  camera.position.set(0, 6, 12);

  // Light rig. The defaults below are the pre-atmosphere values, so an engine
  // that never has applyAtmosphere() called on it renders exactly as it did
  // before per-metro atmospheres existed.
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(120, 220, 80);
  scene.add(sun);

  // Second directional light, used by atmospheres that need a rim or a colored
  // bounce the single sun cannot express — Neon District's magenta signage
  // spill, Capital Prime's cyan rim. Intensity 0 by default = off, so it costs
  // nothing visually until an atmosphere asks for it.
  const fill = new THREE.DirectionalLight(0xffffff, 0);
  fill.position.set(-200, 120, -200);
  scene.add(fill);

  const clock = new THREE.Clock();

  // -------------------------------------------------------------------------
  // Postprocessing
  // -------------------------------------------------------------------------
  // Beauty chain: render -> depth-of-field bokeh -> add selective bloom.
  //
  // Bloom is combined LAST, after the DOF pass, because the bloom buffer is
  // produced from its own dedicated render and already carries its own blur —
  // running it through BokehPass would double-blur the glow and, worse, let the
  // DOF pass's depth buffer (which knows nothing about the bloom buffer) smear
  // the halos incorrectly. Adding after DOF keeps neon reading as light thrown
  // at the lens, which is what it is.
  //
  // The BokehPass's `focus` is updated every frame from main.js (setFocus) to
  // the camera->avatar distance, so the avatar and its immediate surroundings
  // stay tack-sharp while background city and near foreground fall into blur.
  // BokehShader math: blur = clamp((focus - viewDist) * aperture, +-maxblur),
  // so with aperture 0.0001 defocus beyond ~70 world units reaches full blur —
  // a portrait-style DOF tuned to this game's scale.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bokehPass = new BokehPass(scene, camera, {
    focus: 60,
    aperture: 0.0001,
    maxblur: 0.007,
  });
  composer.addPass(bokehPass);

  const bloomCombinePass = new ShaderPass(BloomCombineShader);
  bloomCombinePass.enabled = false; // until an atmosphere asks for bloom
  composer.addPass(bloomCombinePass);

  // Bloom chain (offscreen). Its RenderPass clears to transparent black so that
  // anything NOT on BLOOM_LAYER contributes nothing at all — the selectivity is
  // enforced here, by absence, rather than by a luminance cutoff.
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  const bloomRenderPass = new RenderPass(scene, camera, null, 0x000000, 0);
  bloomComposer.addPass(bloomRenderPass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0.4, 0.6);
  bloomComposer.addPass(bloomPass);

  let bloomEnabled = false;

  function setFocus(distance) {
    if (Number.isFinite(distance) && distance > 0) {
      bokehPass.uniforms.focus.value = distance;
    }
  }

  // -------------------------------------------------------------------------
  // Atmosphere
  // -------------------------------------------------------------------------
  // Reused scratch color so applying an atmosphere every level start allocates
  // nothing.
  const scratchColor = new THREE.Color();
  let currentAtmosphere = null;

  function applyDirectional(light, spec, worldSize) {
    light.color.set(spec.color);
    light.intensity = spec.intensity;
    const { x, y, z } = spec.direction;
    const len = Math.hypot(x, y, z) || 1;
    // Direction is what a DirectionalLight actually uses (position -> target);
    // the magnitude only matters cosmetically today, but scaling it with the
    // world keeps the rig sane if shadow casting is ever added.
    const distance = Math.max(400, worldSize * 0.75);
    light.position.set((x / len) * distance, (y / len) * distance, (z / len) * distance);
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
  }

  // Applies a RESOLVED atmosphere (see atmosphereFor() in src/data/metros.js —
  // every field concrete, no fallbacks left to do) to the live scene.
  //
  // Sky, fog color and renderer clear color are all driven from the same
  // resolved values here so they can never drift apart; a fog color that
  // disagrees with the sky is the classic tell that a scene is faking outdoors.
  //
  // `opts.worldSize` is the level's world footprint — fog near/far arrive as
  // FRACTIONS of it, so haze stays visually consistent as worlds grow across
  // the 100 levels.
  function applyAtmosphere(atmosphere, opts = {}) {
    if (!atmosphere) return currentAtmosphere;

    const worldSize = Number.isFinite(opts.worldSize) && opts.worldSize > 0 ? opts.worldSize : 2400;

    // Sky: background + clear color, from one source of truth.
    scratchColor.set(atmosphere.sky);
    renderer.setClearColor(scratchColor, 1);
    if (scene.background && scene.background.isColor) {
      scene.background.copy(scratchColor);
    } else {
      scene.background = scratchColor.clone();
    }

    // Fog: same treatment, reusing the existing Fog instance when present.
    const near = worldSize * atmosphere.fog.near;
    const far = worldSize * atmosphere.fog.far;
    if (scene.fog && scene.fog.isFog) {
      scene.fog.color.set(atmosphere.fog.color);
      scene.fog.near = near;
      scene.fog.far = far;
    } else {
      scene.fog = new THREE.Fog(new THREE.Color(atmosphere.fog.color), near, far);
    }

    ambient.color.set(atmosphere.ambient.color);
    ambient.intensity = atmosphere.ambient.intensity;

    applyDirectional(sun, atmosphere.sun, worldSize);
    applyDirectional(fill, atmosphere.fill, worldSize);

    setBloom(atmosphere.bloom);

    currentAtmosphere = atmosphere;
    return currentAtmosphere;
  }

  // Strength 0 switches the entire bloom chain off — no second scene render, no
  // blur mip pyramid, no combine pass — so metros that do not glow pay nothing
  // for the feature. EffectComposer recomputes which pass renders to screen from
  // `enabled`, so disabling the combine pass correctly promotes BokehPass back
  // to being the final pass.
  function setBloom(bloom) {
    if (!bloom) return;
    bloomPass.strength = bloom.strength;
    bloomPass.radius = bloom.radius;
    bloomPass.threshold = bloom.threshold;
    bloomEnabled = bloom.strength > 0;
    bloomCombinePass.enabled = bloomEnabled;
    bloomRenderPass.enabled = bloomEnabled;
    bloomPass.enabled = bloomEnabled;
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
    // Both composers resize; EffectComposer.setSize forwards to every pass it
    // owns, which covers BokehPass, the bloom combine pass and UnrealBloomPass's
    // internal mip chain.
    composer.setSize(w, h);
    bloomComposer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    bokehPass.uniforms.aspect.value = camera.aspect;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resize);
  }
  resize();

  function render() {
    if (bloomEnabled) {
      // Bloom source pass: same scene and camera, but the camera is restricted
      // to BLOOM_LAYER and the background is removed, so the frame contains
      // only emissive geometry against black. Fog is deliberately left ON —
      // distant neon should fade into the haze rather than punch through it.
      const prevBackground = scene.background;
      const prevLayerMask = camera.layers.mask;
      scene.background = null;
      camera.layers.set(BLOOM_LAYER);

      bloomComposer.render();

      camera.layers.mask = prevLayerMask;
      scene.background = prevBackground;

      // Neither pass in the bloom chain swaps buffers, so the result always
      // lands in readBuffer; re-reading it each frame keeps the uniform correct
      // across resizes, which recreate the underlying textures.
      bloomCombinePass.uniforms.tBloom.value = bloomComposer.readBuffer.texture;
    }

    composer.render();
  }

  return {
    scene,
    camera,
    renderer,
    clock,
    resize,
    render,
    setFocus,
    applyAtmosphere,
    get atmosphere() { return currentAtmosphere; },
    get bloomEnabled() { return bloomEnabled; },
    // Exposed for tests/debugging; gameplay code should go through
    // applyAtmosphere() so sky, fog and bloom always move together.
    lights: { ambient, sun, fill },
  };
}
