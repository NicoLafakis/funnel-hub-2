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
// BLUR_RADIUS_FRAME_WIDTH * frameWidth = 4.6px at a 1920px-wide buffer, i.e.
// ~66px^2 of area for 13 samples = ~2.3px between samples, which is inside the
// ~3px scale at which the horizon band's content (fogged, flat, low-frequency
// context silhouettes) has any detail left to alias. The residual 12-fold
// pattern is broken up per pixel by the IGN rotation below, so what is left of
// it is screen-pinned dither rather than a visible rosette.
const DOF_TAPS = 12;

// Peak blur radius, as a fraction of the render buffer's WIDTH in pixels.
//
// Derived from the pass it replaces so the change is a strict reduction. The
// old kernel's furthest tap was at 0.4 of `dofblur`, whose ceiling was
// maxblur = 0.007, i.e. 0.0028 of the frame in x-uv; BokehShader multiplies the
// y offset by `aspect` = W/H, so 0.0028 * aspect * H = 0.0028 * W and the peak
// radius was isotropic at 0.28% of frame WIDTH (5.4px at 1920, 10.8px at 1920
// CSS px with dprCap 2). This ships 0.24%: 14% gentler than the old PEAK, and
// gentler by construction everywhere else, since the old pass held that peak
// across essentially the entire frame (see point 2 above) while this one only
// reaches it at the horizon.
const BLUR_RADIUS_FRAME_WIDTH = 0.0024;

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
// 5% of the haze run: 42u on level 1 (0.05 * 0.35 * 2415), 84u at level 100.
// That is 1.7% of the map's own width at either end — visually "just past the
// edge", ~600x the depth resolution out there, and it costs 5% of a ramp whose
// far end is already invisible under fog.
const SHARP_PAD_OF_HAZE_RUN = 0.05;

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
 * WHERE THE RAMP ENDS. Not a taste value either: main.js's horizon stack
 * (skirt + haze band + sky dome) is fully opaque horizon colour at radius
 * world/2 + HAZE_RUN, and past that every pixel is exactly one flat colour, on
 * which blur is a no-op. So full blur is reached at the corner bound of the
 * square of half-extent (world/2 + HAZE_RUN) — the ramp spends its entire
 * length on the only band where it can be seen: the faux context city between
 * the map edge and the horizon.
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
  const farEdge = base + (playableHalfExtent + hazeRun) * lateral;

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
