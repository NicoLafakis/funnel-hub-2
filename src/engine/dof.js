// FAR-FIELD-ONLY DEPTH OF FIELD (replaces three's BokehPass, 0010 art pass).
//
// WHAT WAS WRONG, MEASURED FROM THE SHADER RATHER THAN INFERRED. scene.js ran
// three's stock BokehPass with { focus: 60, aperture: 0.0001, maxblur: 0.007 }
// and main.js overwrote `focus` every frame with the camera-to-avatar distance.
// BokehShader.js computes
//
//     factor  = focus + viewZ            // viewZ <= 0, so this is focus - depth
//     dofblur = clamp(factor * aperture, -maxblur, maxblur)
//
// and then displaces 41 colour taps by `dofblur`. Three consequences, all of
// them the reported defect:
//
//   1. The circle of confusion is SYMMETRIC about `focus` — |factor| is used,
//      via the symmetric clamp, so a fragment 500u NEARER than the avatar is
//      blurred exactly as hard as one 500u beyond it. That is the "it blurs
//      things close to the camera" complaint, and it is structural: there is no
//      setting of focus/aperture/maxblur that turns the near lobe off.
//   2. The clamp saturates almost immediately. maxblur/aperture = 0.007/0.0001
//      = 70 world units, so EVERY fragment further than 70u from the focus
//      plane sat at the maximum blur. On level 1 the camera stands off
//      17.5 * 26 = 455u and the map is 2415u across, so the entire frame except
//      a 140u-thick shell around the hole was at peak blur — a flat, uniform
//      soften of the whole image, which is why it read as "too severe" rather
//      than as depth.
//   3. BokehPass renders the WHOLE SCENE A SECOND TIME with an override
//      MeshDepthMaterial into its own RGBA-packed depth target (BokehPass.js
//      :139-150). That doubled the frame's draw calls and its triangle count
//      purely to obtain depth the main render pass had already written.
//
// WHAT THIS IS INSTEAD. One full-screen pass, sampling the depth attachment of
// the composer's own colour buffer (scene.js gives both composer render targets
// a DepthTexture, so there is no second geometry pass at all), with a circle of
// confusion that is EXACTLY ZERO out to the far edge of the playable map and
// ramps monotonically past it:
//
//     coc = smoothstep(blurNear, blurFar, viewDepth)
//
// GLSL's smoothstep returns literal 0.0 for x <= edge0, so "sharp everywhere
// inside the map" is a property of the function, not of a tuned constant — see
// farFieldBlurBand() below for why blurNear is a provable upper bound on the
// view depth of every playable-map fragment. Fragments with coc == 0 take an
// early return after ONE texture fetch, and because that set is a large,
// spatially coherent region (the whole play area) it is the cheap branch on a
// mobile GPU rather than a divergent one.
//
// COLOUR MANAGEMENT is deliberately unchanged: like BokehShader this shader
// carries no <colorspace_fragment> include and sits in the same slot in the
// same composer chain, so whatever the renderer was doing to the linear
// half-float buffer on its way to the default framebuffer it still does.

// Tap count on the sampling disk, excluding the centre sample. Derived against
// what it replaces rather than picked: the old kernel took 41 colour taps at
// EVERY pixel of every frame. This one takes 12 + 1, and only for fragments
// outside the playable map. The disk it has to cover has radius
// BLUR_RADIUS_FRAME_WIDTH * frameWidth = 15.4px at a 1920px-wide buffer, i.e.
// ~745px^2 of area for 13 samples = ~7.6px between samples. That is coarser than
// the content scale, and it is affordable anyway for one specific reason: the
// band this runs on is the horizon, whose content is fogged, flat and
// low-frequency by construction (measured local contrast 0.8 against the city's
// 5.3 — see BLUR_RADIUS_FRAME_WIDTH), so there is almost no high-frequency
// detail for the undersampling to alias against. What residual 12-fold rosette
// there is gets broken up per pixel by the IGN rotation below into screen-pinned
// dither. If a future change ever puts real detail out past the map edge, this
// is the number to raise first, and it costs one texture fetch pair per tap.
const DOF_TAPS = 12;

// Peak blur radius, as a fraction of the render buffer's WIDTH in pixels.
//
// THIS SHIPPED AT 0.0024 AND THAT WAS WRONG, for a reason worth recording
// because the reasoning was plausible and the measurement contradicted it.
// 0.0024 was derived to be a strict reduction against the old pass: the old
// kernel's furthest tap was 0.4 of `dofblur`, whose ceiling was maxblur = 0.007,
// i.e. 0.0028 of the frame in x-uv, and since BokehShader scales the y offset by
// aspect = W/H the old peak was isotropic at 0.28% of frame WIDTH. Shipping
// 0.24% was therefore 14% under the old peak and far under it everywhere else.
//
// Measured on a real level-1 frame (1280x720, hole at the south play bound,
// pitch 42, looking out over the map edge — the framing most GENEROUS to a
// far-field effect), the result was invisible. The depth histogram says why:
//
//   view depth   share of frame   local contrast   fog
//   0 -  500       76.6%            2.9 - 5.3      <1%     <- playable map
//   500 - 1000     20.7%            0.8 - 0.9      2-6%    <- off-map band
//   1000+           0.7%            1.5 - 3.2      6-13%
//
// Two facts kill a subtle radius. First, three quarters of the frame is inside
// the playable map and MUST stay sharp, so the effect can only ever touch the
// remaining quarter. Second, that remaining quarter carries ~6x LESS local
// detail than the city does (0.8 against 5.3) — it is skirt, haze and simplified
// context silhouettes. A 3px blur on already-flat pixels is a no-op you can
// measure but not see. Strength here has to come from the RADIUS, because the
// coverage is capped by the invariant and cannot be bought.
//
// 0.0080 = 0.80% of frame width: 10.2px at 1280, 15.4px at 1920. That is 3.3x
// the old pass's PEAK radius and it is deliberately NOT a reduction on that
// axis — the reduction is in coverage, which is the axis that was the actual
// complaint. The old pass held its peak across essentially the whole frame
// including the near foreground; this one holds a bigger peak across ~11% of the
// frame, none of it inside the playable map. Net effect on the near field is
// still exactly zero, which is the invariant and is asserted in logic-test.js.
//
// Chosen from a four-way visual comparison (0 / 25 / 50 / 75 against the old
// pass as 100). 25 (0.0050) was still too close to invisible to answer the
// complaint; 75 (0.0115) reads well but needs a ramp so short that a single
// context building can go sharp-to-full-blur across its own height. 50 is the
// setting that reads as distance rather than as a filter.
const BLUR_RADIUS_FRAME_WIDTH = 0.0080;

/**
 * Full-screen far-field depth blur. `tDepth` is bound per frame by the pass
 * wrapper in scene.js, because EffectComposer alternates its read buffer and
 * therefore its depth attachment on every swap.
 *
 * @type {{name: string, defines: Object, uniforms: Object, vertexShader: string, fragmentShader: string}}
 */
export const FarFieldDofShader = {
  name: 'FarFieldDofShader',

  defines: {
    DOF_TAPS,
  },

  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    // Camera clip planes, needed to linearise the hardware depth sample.
    cameraNear: { value: 20 },
    cameraFar: { value: 12000 },
    // The distance band, in VIEW DEPTH (world units along the camera's forward
    // axis). Written every frame from farFieldBlurBand().
    blurNear: { value: 1e9 },
    blurFar: { value: 1e9 + 1 },
    // Peak sampling radius in x-uv, plus the frame aspect so the y offset is
    // scaled to make the disk round in pixels rather than in uv.
    blurRadius: { value: 0 },
    aspect: { value: 1 },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,

  fragmentShader: /* glsl */`
    #include <common>
    #include <packing>

    varying vec2 vUv;

    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float blurNear;
    uniform float blurFar;
    uniform float blurRadius;
    uniform float aspect;

    // Golden angle, 2*PI * (1 - 1/phi). Successive taps rotated by this angle
    // with radius sqrt(i/N) is a Vogel disk: uniform area density with no
    // radial spokes, which is what lets 12 samples stand in for a filled disk.
    #define DOF_GOLDEN_ANGLE 2.399963229728653

    // View-space depth (positive, world units) of the fragment at uv.
    // A sky fragment never written by geometry reads depth 1.0 and linearises
    // to cameraFar, so the sky is at full coc — harmless, it is a smooth
    // gradient that blurs to itself.
    float viewDepthAt( const in vec2 uv ) {
      return -perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, cameraNear, cameraFar );
    }

    void main() {
      float coc = smoothstep( blurNear, blurFar, viewDepthAt( vUv ) );

      // Provably-sharp early out. smoothstep is exactly 0.0 for x <= edge0, and
      // blurNear is an upper bound on the view depth of every fragment of the
      // playable map (see farFieldBlurBand), so the whole play area leaves this
      // pass bit-identical to the render pass's output after one fetch.
      if ( coc <= 0.0 ) {
        gl_FragColor = texture2D( tDiffuse, vUv );
        return;
      }

      // Interleaved gradient noise, a function of gl_FragCoord only — the same
      // screen-pinned dither the shadow filter relies on (scene.js), so the
      // rotation pattern does not crawl as the world moves under it.
      float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
      float baseAngle = ign * PI2;
      vec2 radius = vec2( blurRadius, blurRadius * aspect ) * coc;

      vec4 sum = texture2D( tDiffuse, vUv );
      float weight = 1.0;

      for ( int i = 0; i < DOF_TAPS; i ++ ) {
        float fi = float( i ) + 0.5;
        float r = sqrt( fi / float( DOF_TAPS ) );
        float a = baseAngle + fi * DOF_GOLDEN_ANGLE;
        vec2 uv = vUv + vec2( cos( a ), sin( a ) ) * r * radius;

        // Weight each tap by its OWN coc. Without this, a blurred horizon
        // fragment whose disk overlaps the playable map drags sharp city
        // colour outward and the map's silhouette grows a halo into the haze.
        // With it, sharp geometry cannot bleed into the far field at all, and
        // the far field still blurs freely into itself.
        float w = smoothstep( blurNear, blurFar, viewDepthAt( uv ) );
        sum += texture2D( tDiffuse, uv ) * w;
        weight += w;
      }

      gl_FragColor = sum / weight;
      gl_FragColor.a = 1.0;
    }`,
};

// Peak sampling radius in x-uv units, which is the constant above unchanged:
// the radius is defined as a fraction of the frame WIDTH and the shader offsets
// in uv, so the pixel width cancels out and no resolution term survives. It is
// re-exported under a name the call site can read as a derivation, and so the
// resolution-independence is stated once rather than re-argued in scene.js.
export const FAR_FIELD_BLUR_RADIUS_UV = BLUR_RADIUS_FRAME_WIDTH;

// How much of the off-map haze band is spent staying sharp, so the ramp begins
// JUST PAST the map edge rather than exactly at it.
//
// Two reasons it is not zero. The product one: the corner bound below is exact,
// so a pad of zero puts the first non-zero coc on the very fragments at the map
// boundary, and the intent is a sharp map with blur starting outside it. The
// engineering one: with a zero pad, "sharp at the edge" reduces to a float32
// comparison between two differently-rounded evaluations of the same plane
// equation, and the depth buffer's own resolution at the far ground corner is
// 0.069 world units (scene.js NEAR/FAR derivation) — a guard band smaller than
// that guarantees nothing.
//
// This shipped at 0.05 and is now 0.01, cut for the same reason the radius went
// up: the off-map band is only ~20% of the frame to begin with, so spending 5%
// of the haze run before the ramp even starts was giving away visible band for a
// margin far larger than anything needed it. 1% of the haze run is 8.4u on level
// 1 (0.01 * 0.35 * 2415) and 16.8u at level 100. Projected onto the view axis
// that is ~6.3u of guard at the level-1 framing, which is still ~90x the depth
// buffer's resolution out there and ~4 orders of magnitude above float32 rounding
// on a plane equation of this magnitude. logic-test.js asserts the exact-zero
// property directly across 1080 camera configurations, so this margin is checked
// rather than assumed.
const SHARP_PAD_OF_HAZE_RUN = 0.01;

// Where the ramp reaches full blur, as a fraction of the haze run past the map
// edge.
//
// This was 1.0 — full blur exactly where main.js's horizon stack becomes flat
// sky colour — on the reasoning that blur past that point is a no-op so the ramp
// may as well use the whole run. True but backwards: it means the ramp is still
// only PARTWAY up across the entire band that has any content in it, and it
// saturates precisely where saturating stops mattering. Measured on the level-1
// frame described in BLUR_RADIUS_FRAME_WIDTH, a full-length ramp put 22.7% of the
// frame at PARTIAL blur and only 0.6% at full.
//
// 0.45 saturates the ramp inside the band that is actually visible: same frame,
// ~11% at full blur and ~12% partial, i.e. an 18x increase in the share of the
// frame that reaches peak, with no change whatsoever to the sharp region. The
// ramp still spans 277 view-space units at that framing, which is what keeps it
// reading as a distance falloff — the 75-strength candidate shortened it to ~200u
// and at that length a single 400u-tall context building can span sharp to
// fully-blurred across its own height, which reads as a filter edge rather than
// as depth.
const RAMP_END_OF_HAZE_RUN = 0.45;

/**
 * The distance band over which blur ramps up, in view depth (world units along
 * the camera's forward axis).
 *
 * WHY A CORNER MAXIMUM IS EXACT, NOT CONSERVATIVE. View depth of a world point
 * p is depth(p) = dot(p - eye, forward), which is AFFINE in p. The playable map
 * is the convex square |x| <= half, |z| <= half at y = 0, and an affine
 * function on a convex polygon attains its maximum at a vertex — so the largest
 * view depth anywhere on the playable ground is at one of the four corners, and
 * for an affine function the four-corner maximum has the closed form
 *
 *     max = -dot(eye, forward) + half * (|forward.x| + |forward.z|)
 *
 * which is what this computes: no loop, no vectors allocated, exact.
 *
 * WHY IT ALSO BOUNDS EVERY BUILDING, RIVAL AND PROP ABOVE THAT GROUND, i.e.
 * why a ground-plane bound is enough for a 3D city. d(depth)/dy = forward.y,
 * and the chase camera looks DOWN at 35-65 degrees of pitch (camera.js
 * PITCH_MIN/PITCH_MAX), so forward.y = -sin(pitch) is strictly negative across
 * the whole orbit range. Raising y therefore strictly REDUCES view depth: the
 * top of a 671u tower at the far corner is nearer along the view axis than its
 * own footprint is. The ground corners bound the entire playable volume, and
 * blurNear = that bound (plus the SHARP_PAD_OF_HAZE_RUN guard band) makes coc
 * identically 0 for every fragment of it.
 *
 * WHERE THE RAMP ENDS. Not a taste value either. main.js's horizon stack
 * (skirt + haze band + sky dome) is fully opaque horizon colour at radius
 * world/2 + HAZE_RUN, so HAZE_RUN bounds the band that can carry any detail at
 * all; the ramp saturates at RAMP_END_OF_HAZE_RUN of the way across it, which is
 * where the measured local contrast has already collapsed. Both ends therefore
 * sit on the faux context city between the map edge and the horizon, which is
 * the only band the effect is permitted to touch.
 *
 * HOW IT SCALES. Everything here is derived per frame from the live camera
 * matrix and the level's own world size, so it tracks both ladders on its own:
 * the map grows with level (formulas.js worldSize: 2415u at L1, 4800u at L100)
 * and the camera standoff grows with the hole radius (camera.js
 * DIST_RADIUS_MULT * avatar.radius()). A hardcoded start distance would be
 * wrong at one end of both ladders; this one cannot be.
 *
 * @param {{position: {x: number, y: number, z: number}, matrixWorld: {elements: ArrayLike<number>}, updateMatrixWorld?: Function}} camera
 * @param {number} playableHalfExtent - half the playable square's width (level.world / 2).
 * @param {number} hazeRun - radial distance past the map edge over which the
 *   horizon stack reaches flat sky colour (main.js HAZE_RUN_WORLD * level.world).
 * @param {{nearEdge: number, farEdge: number}} [out] - reused output object; the
 *   frame loop calls this every frame, so it must not allocate.
 * @returns {{nearEdge: number, farEdge: number}}
 */
export function farFieldBlurBand(camera, playableHalfExtent, hazeRun, out = { nearEdge: 0, farEdge: 0 }) {
  // main.js calls this after the chase camera has written position/quaternion
  // but before renderer.render(), so matrixWorld is one frame stale unless it
  // is composed here. The renderer's own updateMatrixWorld() then no-ops.
  if (typeof camera.updateMatrixWorld === 'function') camera.updateMatrixWorld();

  // Column 3 of matrixWorld (elements 8..10, column-major) is the camera's
  // local +Z in world space, which for a three.js camera points BACKWARD out
  // of the screen. Forward is its negation.
  const e = camera.matrixWorld.elements;
  const fx = -e[8];
  const fy = -e[9];
  const fz = -e[10];

  // -dot(eye, forward): the view depth of the world origin.
  const base = -(camera.position.x * fx + camera.position.y * fy + camera.position.z * fz);
  // |forward.x| + |forward.z| — how much view depth one unit of lateral map
  // extent buys. It collapses to zero only for a camera looking straight down,
  // which the 65-degree pitch cap forbids; the guard below covers it anyway.
  const lateral = Math.abs(fx) + Math.abs(fz);

  const nearEdge = base + (playableHalfExtent + SHARP_PAD_OF_HAZE_RUN * hazeRun) * lateral;
  const farEdge = base + (playableHalfExtent + RAMP_END_OF_HAZE_RUN * hazeRun) * lateral;

  // EVERY degenerate input lands on the same sentinel: a band parked a hundred
  // thousand units past the 12000-unit far clip plane, i.e. coc identically 0
  // and the pass reduced to a straight copy. This is deliberately fail-SHARP
  // rather than fail-safe-looking, because every failure mode of the alternative
  // is the defect this pass exists to remove:
  //   * a non-finite or non-positive map extent (a caller bug) would otherwise
  //     produce a band starting at the camera and blur the entire play area;
  //   * a zero-width or inverted band means smoothstep runs with edge1 <= edge0,
  //     which blurs the NEAR field — exactly the symmetric-CoC behaviour of the
  //     BokehPass this replaces;
  //   * a non-positive nearEdge means the map is behind the camera, so there is
  //     no playable geometry to keep sharp and no reason to spend the pass.
  if (!Number.isFinite(playableHalfExtent) || playableHalfExtent <= 0
    || !Number.isFinite(hazeRun) || hazeRun <= 0
    || !Number.isFinite(nearEdge) || !Number.isFinite(farEdge)
    || nearEdge <= 0 || farEdge - nearEdge < 1) {
    out.nearEdge = 1e9;
    out.farEdge = 1e9 + 1;
    return out;
  }

  out.nearEdge = nearEdge;
  out.farEdge = farEdge;
  return out;
}
