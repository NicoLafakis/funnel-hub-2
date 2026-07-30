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

import { QUALITY_PROFILES } from './quality.js';
import { EffectComposer } from '../../assets/vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../../assets/vendor/postprocessing/RenderPass.js';
import { ShaderPass } from '../../assets/vendor/postprocessing/ShaderPass.js';
import { FarFieldDofShader, FAR_FIELD_BLUR_RADIUS_UV } from './dof.js';

// --- Sun shadow geometry (0005 RC-1). See followShadow() for the derivations.
// Every one of these is load-bearing; none is a taste value.
export const SHADOW_MAP_SIZE = 2048;
// Floor for the box half-extent ladder. Must itself be a power of two, or the
// floor lands the ladder on a rung whose texel size is not a power of two and
// the texel snap stops being exact. Never binds in practice (minimum avatar
// radius is 26 and main.js passes 14r = 364), it exists so the function is
// total for any caller.
export const SHADOW_HALF_MIN = 128;
// Tallest thing that may cast into the box, world units. Sets how far the light
// stands off so nothing is clipped by the near plane. Measured worst case is
// the L75 building-large at 671u; 900 leaves room for landmark capstones.
const SHADOW_CASTER_HEIGHT = 900;
// Shadow-camera near plane. Only has to be > 0; it is a pad, not a budget —
// the ortho depth buffer is linear so near costs nothing here (unlike the view
// camera above, where near sets the whole precision budget).
const SHADOW_NEAR = 1;
// Depth bias, expressed in shadow texels of ground slope. 1.0 covers the depth
// change across one texel on flat ground; the PCF kernel's wider reach is
// covered by normalBias instead, which offsets the lookup rather than the depth
// and therefore does not scale with the kernel's own error.
const SHADOW_BIAS_TEXELS = 1.0;
// Normal-offset bias, in shadow texels. Sized against the 3-texel PCF radius.
const SHADOW_NORMAL_BIAS_TEXELS = 3.0;

export function createEngine(canvasEl, THREE, { quality = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setClearColor(0x0b0f14, 1);
  let activeQuality = QUALITY_PROFILES[quality] || QUALITY_PROFILES.high;
  let activeShadowMapSize = activeQuality.shadowMapSize;

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

  // KEY / FILL BALANCE (0005 atmosphere pass, art-direction.md §5 "one-point
  // lighting"). This rig shipped as ambient 0.55 + hemisphere 0.7 + sun 0.9,
  // and 0.55 of FLAT ambient is the single reason flat-shaded geometry read
  // cheap: ambient adds the same irradiance to every normal, so it is pure
  // form-destroying lift. Measured on the live build with a 0.5-grey probe
  // sphere parked in front of the chase camera (every normal visible at once,
  // read back with gl.readPixels):
  //
  //   rig                       key:fill   sphere max:min   frame sd   frame mean
  //   0.55 / 0.70 / 0.90        1.31       1.371            25.6       106.6
  //   0.12 / 0.85 / 1.55        1.812      1.977            30.2       107.1  <- this
  //   0.20 / 0.80 / 1.35        1.672      1.788            28.3       105.1
  //   0.06 / 0.90 / 1.75        1.945      2.146            32.2       109.9
  //
  // "key" is the sphere texel whose world normal points at the sun's horizontal
  // bearing, "fill" the one pointing directly away. 1.31 is barely a light — a
  // sunlit face and a shaded face differed by 31%. 1.81 is a real key light.
  //
  // Chosen for the middle column, not the last: exposure has to survive the
  // change or every metro's authored palette shifts under it. Frame mean luma
  // moves 106.6 -> 107.1 (+0.5%) and mean saturation 0.289 -> 0.298, while the
  // tonal spread that carries FORM goes up 18%. The 1.75 variant reads better
  // still on the probe but drifts frame mean +3% and starts blowing the tops of
  // pale facades.
  //
  // The ambient is not deleted outright: 0.12 is what keeps a north-facing wall
  // in a street canyon off the hemisphere's floor value, and the hemisphere's
  // warm ground bounce (0xc9b28a) is doing the real fill work.
  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);

  // Hemisphere fill (Hole.io-style bright world): cool sky-blue from above,
  // warm ground bounce from below — kills the flat monochrome look the bare
  // ambient+directional pair gave. Unlike ambient this one is NORMAL-DEPENDENT
  // (three bakes it into an SH probe), so it fills without flattening: it is
  // the right place to spend the intensity the ambient gave up. Colors and
  // intensity are per-mood adjustable via setMood() below.
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0xc9b28a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dd, 1.55); // warm-tinted midday sun
  sun.position.set(120, 220, 80);
  scene.add(sun);
  scene.add(sun.target);

  // Real cast shadows (art-direction §5). Crisp contact shadows under every
  // building, car, tree and lamp are the single biggest contributor to the
  // reference's "clean 3D" read — flat blob decals cannot draw a building's
  // silhouette across a street. Level 1 measures ~333 draw calls / ~987k
  // triangles a frame (live, 2026-07-30, composer+shadow pass included —
  // renderer.info auto-reset hides everything but the final quad, so probe
  // with autoReset=false as scripts/reachability-sweep.cjs does), already
  // past the ≤150 desktop target, so this shadow pass is spent, not free.
  //
  // The light is directional, so its shadow camera is an ORTHOGRAPHIC box that
  // has to be re-aimed at whatever the player is looking at — a box big enough
  // to cover a 2400-4800u world in one go would quantise to mush at any sane
  // map size. followShadow() below keeps it centred on the avatar and sized to
  // the current view, which is what keeps the shadows sharp as the hole grows.
  renderer.shadowMap.enabled = true;
  // SHADOW FILTER — PCFShadowMap is a DELIBERATE choice here, not a fallback.
  //
  // This line used to say PCFSoftShadowMap with a note that r185 silently
  // downgrades it. The note was right about the mechanism (WebGLShadowMap.js:99
  // warns "PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."
  // and overwrites this.type; renderer.shadowMap.type reads back as 1 on the
  // live build) and wrong about the consequence. In r185 PCFShadowMap is no
  // longer the old 9-tap box filter that PCFSoft existed to improve on — read
  // shadowmap_pars_fragment.glsl.js:114-148: it is FIVE Vogel-disk samples,
  // rotated per pixel by interleaved gradient noise, each one a hardware 2x2
  // sampler2DShadow fetch, i.e. ~20 filtered taps. PCFSoft's only remaining
  // effect in r185 is a console warning on every render.
  //
  // The actual soft-edge dial is shadow.radius, which scales that Vogel disk in
  // SHADOW TEXELS. It shipped at the default 1 (a one-texel penumbra = hard).
  // It costs nothing to widen — same five taps at a wider spread — and that is
  // measured, not assumed: GPU-timed on the live build with
  // EXT_disjoint_timer_query_webgl2, 45 renders per sample, four interleaved
  // reps, radius 1 -> 1.848 ms/frame, radius 4 -> 1.795 ms/frame (identical
  // inside run-to-run spread).
  //
  // radius 3 is chosen because a shadow texel here is ~1 DEVICE PIXEL at every
  // radius, by construction: the box half-extent tracks 14x the avatar radius
  // and the chase camera stands off 12x the avatar radius, so texel size and
  // camera distance scale together. Measured 0.5u/texel at r=26 against 2.06
  // device px per world unit (1.03 px), and 8u/texel at r=483 against 0.111
  // px/u (0.89 px). So radius 3 is a ~3-pixel penumbra at every hole size —
  // soft enough to read as a real light, tight enough not to smear a lamp post
  // into a stain. The IGN rotation is a function of gl_FragCoord only, so the
  // dither pattern is pinned to the SCREEN and does not crawl with the world.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(activeShadowMapSize, activeShadowMapSize);
  sun.shadow.radius = 3;
  // bias / normalBias are NOT constants any more — followShadow() derives both
  // from the box geometry on every rebuild. See the block comment there.
  const SUN_DIR = new THREE.Vector3(120, 220, 80).normalize();
  // Sun elevation, from SUN_DIR. sin is the +Y component; cot = cos/sin is the
  // depth-per-lateral-unit slope on flat ground, which is what sets both the
  // shadow camera's depth range and the minimum honest depth bias.
  const SIN_ELEV = SUN_DIR.y;                                    // 0.836327
  const COT_ELEV = Math.sqrt(1 - SIN_ELEV * SIN_ELEV) / SIN_ELEV; // 0.655574
  // The shadow camera's own basis, precomputed because SUN_DIR is a constant.
  // These are EXACTLY the axes Object3D.lookAt() builds for the shadow camera
  // (Matrix4.lookAt: z = eye-target normalized, x = normalize(up x z),
  // y = z x x, with the camera's default up of +Y), which is what makes the
  // texel snap below correct rather than approximate.
  const LS_Z = SUN_DIR.clone();
  const LS_X = new THREE.Vector3(0, 1, 0).cross(LS_Z).normalize();
  const LS_Y = LS_Z.clone().cross(LS_X);

  let shadowHalf = 0; // current quantised box half-extent; 0 = not built yet

  // Re-centre the sun and its shadow box on a world point, covering `extent`
  // world units around it. main.js calls this each frame with the avatar
  // position and a radius-derived extent.
  //
  // SHADOW CRAWL (0005 RC-1) — what this function used to do, and why all three
  // of its per-frame perturbations are gone.
  //
  // It shipped as: half = max(120, extent); dist = half*2.5; sun and target set
  // from the raw avatar floats; and a guard `if (cam.left !== -half)` around the
  // projection rebuild. Measured on the live deploy (Playwright + window.__fw,
  // followShadow called 8 times with the avatar displaced by 1/8 of a shadow
  // texel each time):
  //
  //   1. TRANSLATION. 8 of 8 calls produced 8 DISTINCT sun.target positions, at
  //      both r=26 and r=483. Nothing rounded the centre to the shadow map's
  //      texel grid, so every sub-texel move re-rasterised the whole map into a
  //      new texel phase and every shadow edge jittered by up to one texel:
  //      0.355 world units at spawn, 6.60 at the level-1 radius cap.
  //   2. RESCALE. `half` tracked a continuous float, so the guard compared two
  //      floats that differ on essentially every frame of active play. Measured
  //      directly: a 1% radius change moved cam.left -364 -> -367.64 and cam.far
  //      2002 -> 2022, i.e. the guard suppressed nothing and the projection was
  //      rebuilt ~60x/second.
  //   3. BIAS RESCALE. cam.far was dist*2.2 = 77r and shadow.bias is normalised
  //      against (far - near), so the constant -0.0012 meant 2.40 world units of
  //      depth bias at spawn and 44.63 at the cap — 29 world units of lateral
  //      shadow detachment, growing every frame the hole grew.
  //
  // The three fixes, in the same order:
  //
  //   1. The box centre is snapped to the texel grid IN LIGHT SPACE (not world
  //      XZ, which is the cheap approximation the 0005 findings doc offered as
  //      good enough — light space is exact and costs three extra dot products,
  //      so there is no reason to take the approximation). `half` is a power of
  //      two and mapSize is 2048, so `texel` is an exact power of two and
  //      Math.round(v/texel)*texel is exact in binary floating point: the snap
  //      cannot drift. The depth axis is deliberately NOT snapped — it does not
  //      affect which texel a world point lands in.
  //   2. `half` snaps UP to a power of two, so the guard finally guards: the
  //      projection is rebuilt a handful of times per level instead of every
  //      frame. Powers of two, not the 1.4x ladder the findings doc allowed,
  //      precisely so `texel` stays a power of two for point 1. The cost is that
  //      the box can be up to 2x larger than needed, i.e. the texel up to 2x
  //      coarser (0.355 -> 0.5 at spawn) — which is free here, because the texel
  //      is ~1 device pixel and 2 device pixels is still under the 3-texel PCF
  //      radius above.
  //   3. cam.near/cam.far now bracket the ACTUAL scene along the light axis, and
  //      the bias is derived from the box instead of being a constant. Both
  //      derivations are below.
  //
  // A constant WORLD-space bias would also have been wrong, so this deliberately
  // does not do what the findings doc suggested ("makes shadow.bias mean roughly
  // the same thing at every radius"). The self-shadowing error a depth bias has
  // to cover is the depth change across ONE SHADOW TEXEL on the receiving
  // surface, which on flat ground is texel * cot(elevation) — it is proportional
  // to texel size, so the correct bias is proportional to texel size too, and
  // texel size is proportional to the hole radius. What was wrong before was the
  // CONSTANT OF PROPORTIONALITY: the shipped bias worked out to 0.0924r world
  // units against a requirement of ~0.0090r, i.e. over-biased by 10.3x at every
  // radius. That is why the failure mode was peter-panning and never acne.
  function followShadow(x, z, extent) {
    // Quantise the box size. SHADOW_HALF_MIN is itself a power of two so the
    // floor cannot land the ladder on a non-power-of-two rung.
    const want = Math.max(SHADOW_HALF_MIN, extent * activeQuality.shadowDistanceMult);
    const half = 2 ** Math.ceil(Math.log2(want));
    const texel = (2 * half) / activeShadowMapSize;

    // Snap the box centre to the texel grid in light space. The input point is
    // (x, 0, z); LS_X has no Y component by construction (up x z always does),
    // so only LS_Y and LS_Z need the zero Y carried through.
    const s = Math.round((x * LS_X.x + z * LS_X.z) / texel) * texel;
    const t = Math.round((x * LS_Y.x + z * LS_Y.z) / texel) * texel;
    const d = x * LS_Z.x + z * LS_Z.z; // depth axis — not snapped, does not alias
    const cx = LS_X.x * s + LS_Y.x * t + LS_Z.x * d;
    const cy = LS_X.y * s + LS_Y.y * t + LS_Z.y * d;
    const cz = LS_X.z * s + LS_Y.z * t + LS_Z.z * d;

    // Light standoff. Derivation: a ground point at light-space offset `t` from
    // the centre sits at depth (dist - COT_ELEV*t), and a caster of height H
    // sits SIN_ELEV*H nearer the light. So the nearest thing in the box is at
    // dist - COT_ELEV*half - SIN_ELEV*SHADOW_CASTER_HEIGHT, and putting that on
    // the near plane fixes `dist`. Note this only moves the shadow CAMERA — a
    // directional light's shading direction is position-minus-target, and both
    // move together, so nothing about the lighting changes.
    const dist = SHADOW_NEAR + COT_ELEV * half + SIN_ELEV * SHADOW_CASTER_HEIGHT;
    sun.position.set(cx + SUN_DIR.x * dist, cy + SUN_DIR.y * dist, cz + SUN_DIR.z * dist);
    sun.target.position.set(cx, cy, cz);
    sun.target.updateMatrixWorld();

    if (half !== shadowHalf) {
      shadowHalf = half;
      const cam = sun.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = SHADOW_NEAR;
      // Far plane: the far side of the same box. The ground spans
      // +-COT_ELEV*half in depth about the centre, so the range is
      // 2*COT_ELEV*half plus the caster height that pushed `dist` out.
      cam.far = SHADOW_NEAR + 2 * COT_ELEV * half + SIN_ELEV * SHADOW_CASTER_HEIGHT;
      cam.updateProjectionMatrix();
      // shadow.bias is in NORMALISED shadow-camera depth (shadowCoord.z is 0..1
      // across [near, far] for an orthographic camera), so a world-unit
      // requirement has to be divided by the range to become a bias value.
      sun.shadow.bias = -(SHADOW_BIAS_TEXELS * texel * COT_ELEV) / (cam.far - cam.near);
      // normalBias IS in world units (shadowmap_vertex.glsl.js offsets the
      // lookup position along the surface normal), and its job is to cover the
      // PCF kernel's reach rather than a single texel — hence the wider
      // multiplier. Scaling it with texel size keeps the detach it causes at a
      // constant ~2 shadow texels, i.e. ~2 device pixels, at every hole size.
      sun.shadow.normalBias = SHADOW_NORMAL_BIAS_TEXELS * texel;
    }
  }

  // Single entry point for per-level lighting mood (metro palette + night
  // variants). Callers pass hex colors for the hemisphere sky/ground bounce
  // and `night: true` to dim every fixture — main.js's night dimming must go
  // through here, never by poking light intensities directly.
  function setMood({ sky, ground, night, cityId } = {}) {
    if (sky !== undefined) hemi.color.set(sky);
    if (ground !== undefined) hemi.groundColor.set(ground);
    // Night keeps the SAME day/night ratios it always had (ambient x0.51,
    // sun x0.50, hemisphere x0.43) applied to the rebalanced day values above,
    // so the night levels darken by exactly as much as before rather than
    // inheriting a second, accidental change from the key/fill pass.
    const dim = !!night;
    const chicagoDay = !dim && cityId === 'chicago-loop';
    ambient.intensity = dim ? 0.06 : chicagoDay ? 0.26 : 0.12;
    sun.intensity = dim ? 0.78 : chicagoDay ? 1.6 : 1.55;
    hemi.intensity = dim ? 0.37 : chicagoDay ? 1.12 : 0.85;
    // Chicago day: soften the hemisphere sky toward neutral — the default
    // blue fill reads cold against the photoreal masonry. Other levels keep
    // their metro sky (set above on every call).
    if (chicagoDay) hemi.color.set('#d9e7f2');
  }

  const clock = new THREE.Clock();

  // DEPTH OF FIELD — far field only. The low profile still renders straight to
  // the default framebuffer with no composer at all, so its GPU budget is
  // untouched; medium/high get exactly ONE extra full-screen pass.
  //
  // THE DEPTH ATTACHMENT IS THE WHOLE POINT OF THIS RENDER TARGET. EffectComposer
  // otherwise builds its two half-float buffers with a plain depth RENDERBUFFER,
  // which a shader cannot read — which is why the BokehPass this replaces had to
  // re-render the entire scene with an override MeshDepthMaterial just to get
  // depth into a texture (BokehPass.js:139-150), doubling the frame's draw calls
  // and triangles. Attaching a DepthTexture to the composer's own buffers means
  // the RenderPass writes depth and colour in the SAME geometry pass and the DOF
  // shader samples what is already there: one geometry pass, one blur pass.
  //
  //   * HalfFloatType matches what EffectComposer would have chosen on its own,
  //     so the colour precision of the chain is unchanged.
  //   * The size is 1x1 on purpose. resize() runs immediately below (and again
  //     from setQuality) and is the single owner of the buffer dimensions; a
  //     guessed initial size would just be a second, drift-prone copy of it.
  //   * renderTarget2 is `renderTarget1.clone()` inside EffectComposer, and
  //     RenderTarget.copy() clones the depth texture rather than sharing it, so
  //     each buffer owns its own depth attachment and the read/write swap cannot
  //     hand the shader a depth texture that is being written to.
  //   * DepthTexture image sizing is handled by WebGLTextures, which re-allocates
  //     it from the render target's width/height whenever they change, so
  //     composer.setSize() covers it.
  const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  composerTarget.texture.name = 'EffectComposer.rt1';
  const composer = new EffectComposer(renderer, composerTarget);
  composer.addPass(new RenderPass(scene, camera));

  const dofPass = new ShaderPass(FarFieldDofShader);
  dofPass.uniforms.cameraNear.value = camera.near;
  dofPass.uniforms.cameraFar.value = camera.far;
  dofPass.uniforms.blurRadius.value = FAR_FIELD_BLUR_RADIUS_UV;
  // tDepth has to be rebound every frame rather than once here: EffectComposer
  // swaps readBuffer/writeBuffer after this pass (needsSwap is true for a
  // ShaderPass), so the buffer the RenderPass drew into — and therefore the
  // depth attachment holding this frame's depth — alternates between
  // renderTarget1 and renderTarget2. Wrapping render() keeps that coupling in
  // one place instead of leaving a stale texture bound on alternate frames.
  const renderDofPass = dofPass.render.bind(dofPass);
  dofPass.render = (r, writeBuffer, readBuffer, deltaTime, maskActive) => {
    dofPass.uniforms.tDepth.value = readBuffer.depthTexture;
    renderDofPass(r, writeBuffer, readBuffer, deltaTime, maskActive);
  };
  composer.addPass(dofPass);

  const frameTimes = [];
  let lastRenderAt = null;

  function setQuality(next) {
    const profile = typeof next === 'string' ? QUALITY_PROFILES[next] : next;
    if (!profile) return false;
    activeQuality = profile;
    dofPass.enabled = profile.effectsDensity >= 0.7;
    activeShadowMapSize = profile.shadowMapSize;
    renderer.shadowMap.enabled = profile.shadows;
    sun.castShadow = profile.shadows;
    sun.shadow.mapSize.set(activeShadowMapSize, activeShadowMapSize);
    if (sun.shadow.map && typeof sun.shadow.map.dispose === 'function') sun.shadow.map.dispose();
    sun.shadow.map = null;
    shadowHalf = 0;
    resize();
    return true;
  }

  // Device-pixel-ratio aware resize, capped at 2 — same spirit as the old
  // game's `resize()` (index.html git history: `DPR = Math.min(window.devicePixelRatio||1, 2)`).
  function resize() {
    const hasWindow = typeof window !== 'undefined';
    const w = hasWindow ? window.innerWidth : (canvasEl.clientWidth || 1);
    const h = hasWindow ? window.innerHeight : (canvasEl.clientHeight || 1);
    const dpr = Math.min((hasWindow ? window.devicePixelRatio : 1) || 1, activeQuality.dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    // The DOF disk is defined as a fraction of frame WIDTH but offsets in uv,
    // so only the aspect correction is resolution-dependent — it makes the disk
    // round in pixels instead of stretched in uv. Same scheme BokehShader used.
    dofPass.uniforms.aspect.value = camera.aspect;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resize);
  }
  resize();

  function render() {
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (lastRenderAt !== null) {
      frameTimes.push(now - lastRenderAt);
      if (frameTimes.length > 300) frameTimes.shift();
    }
    lastRenderAt = now;
    if (dofPass.enabled) composer.render();
    else renderer.render(scene, camera);
  }

  // Replaces the old setFocus(distance). A focus DISTANCE was the wrong shape of
  // API for this effect and was load-bearing in the defect: three's bokeh CoC is
  // symmetric about the focus plane, so "focus on the hole" necessarily meant
  // "blur everything nearer than the hole just as hard". A BAND is the honest
  // contract — sharp at and before nearEdge, fully blurred at and past farEdge —
  // and it cannot express a near-field blur at all. Derive the arguments with
  // farFieldBlurBand() in dof.js; do not pass hand-picked distances.
  function setDepthBlurBand(nearEdge, farEdge) {
    if (!Number.isFinite(nearEdge) || !Number.isFinite(farEdge) || farEdge <= nearEdge) return false;
    dofPass.uniforms.blurNear.value = nearEdge;
    dofPass.uniforms.blurFar.value = farEdge;
    return true;
  }

  function getPerformanceSnapshot() {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const averageMs = frameTimes.length ? frameTimes.reduce((sum, n) => sum + n, 0) / frameTimes.length : 0;
    const p95Ms = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    return {
      quality: activeQuality.id,
      dpr: renderer.getPixelRatio(),
      averageMs,
      p95Ms,
      sustainedFps: averageMs > 0 ? 1000 / averageMs : 0,
      longFrames: frameTimes.filter((n) => n > 50).length,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      memory: { ...renderer.info.memory },
      profile: { ...activeQuality },
    };
  }

  setQuality(activeQuality);

  return {
    scene, camera, renderer, clock, resize, render,
    setDepthBlurBand, setMood, followShadow, setQuality, getPerformanceSnapshot,
  };
}
