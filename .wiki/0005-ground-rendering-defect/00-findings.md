# 0005 - "The ground is doing something spastic": ground rendering defect findings

Date: 2026-07-27
Reporter: Nico (live review of the deployed build, https://funnel-hub-umber.vercel.app/)
Investigator: root-cause-analyst (code-level; a parallel agent is capturing live-browser evidence)
Severity: high (affects the single largest surface in every frame, on every level, at every radius)
Status: diagnosed, NOT fixed. Fix specification in §7. Nothing in this investigation
touched source, config, or state.

---

## 1. Symptom

Verbatim, as reported:

> "Currently, the 'ground' is doing something spastic and its causing tremendous
> screen tearing and glitching with the texture maps for the ground/floor."

Precise characterization after reading the code. Three separable claims are bundled
in that sentence and they do not have the same cause:

1. "the ground is doing something spastic" : a TEMPORAL artifact. Something on the
   ground plane changes frame to frame. Only one thing in the entire ground pipeline
   is recomputed per frame, and it is the sun's shadow map (§4.1).
2. "screen tearing" : almost certainly not literal display tearing. The loop is a
   single vsynced `requestAnimationFrame` with one `renderer.render()` call
   (`src/main.js:2222-2234`, `src/engine/scene.js:112-114`), `autoClear` untouched at
   its default, no second renderer anywhere. What reads as "tearing" on a large
   near-horizontal plane is a hard, moving, high-contrast discontinuity. Two
   candidates exist in this scene and both are real (§4.1, §4.2).
3. "glitching with the texture maps" : the ground's albedo map itself is baked once
   at level build and never touched again (§5.3). What is modulating the ground's
   apparent surface per frame is the shadow term, not the map.

The symptom is therefore restated as: **the shading of the ground plane is unstable
frame to frame, with the instability strongest under motion and worst as the hole
grows.**

---

## 2. Root cause

**Primary (confidence: high on the mechanism, needs the live capture to confirm it is
what the reporter is seeing).** `followShadow()` in `src/engine/scene.js:61-77` rebuilds
the sun's orthographic shadow volume from the avatar's live radius on every single
frame (`src/main.js:1702` passes `r * 14`), with no texel snapping, no hysteresis on the
box size, and a `shadow.bias` that is expressed in normalized shadow-camera depth while
the shadow camera's depth range is itself a function of that box. The result is that the
2048px shadow map's world-to-texel mapping translates AND rescales every frame, and the
effective world-space depth bias rescales with it. The ground plane is the primary
shadow receiver (`ground.receiveShadow = true`, `src/main.js:566`) and shadowed area
covers most of a typical frame, so every shadow boundary on the ground crawls, boils and,
on a large eat, snaps. Shadow-map texel size goes from 0.36 world units at spawn to 6.6
at the level-1 radius cap, and the world-space bias from 2.4 units to 44.6, so the defect
gets monotonically worse across a run, which matches "currently" and "tremendous".

**Structural (confidence: confirmed by arithmetic, and already measured once in this
repo).** `new THREE.PerspectiveCamera(60, 1, 0.1, 20000)` at `src/engine/scene.js:21`
gives a 200,000:1 far/near ratio. With the chase camera standing off at 12x the avatar
radius (`src/engine/camera.js:64`), the smallest resolvable depth step at the avatar's own
feet is 0.058 world units at spawn and 20 world units at the level-1 radius cap. Every
ground-adjacent Y offset in the codebase is smaller than that quantum at every radius the
game ever reaches. The four-layer ground stack (ground 0.00, detail 0.05, paint 0.08,
blob decals 0.15) therefore has literally zero depth separation anywhere on screen, ever.
It does not currently flicker, for a reason that is pure luck and is documented in §4.2,
and one of the design invariants written into `src/main.js:626-631` is already false
because of it.

---

## 3. Causal chain

**Trigger.** The reporter played the deployed build and moved the hole. The artifact is
motion-gated: nothing in a still frame changes.

**Proximate cause.** Per-frame re-derivation of the shadow projection.
`src/main.js:1702`:

```js
engine.followShadow(avatar.position.x, avatar.position.z, r * 14);
```

runs inside `updatePlay`, so it fires once per frame with a continuously changing `r`.
`src/engine/scene.js:61-77` then does three destabilizing things at once:

```js
const half = Math.max(120, extent);        // extent = r * 14
const dist = half * 2.5;
sun.position.set(x + SUN_DIR.x * dist, SUN_DIR.y * dist, z + SUN_DIR.z * dist);
sun.target.position.set(x, 0, z);
...
if (cam.left !== -half) { cam.left = -half; ... cam.far = dist * 2.2; cam.updateProjectionMatrix(); }
```

- the box CENTRE tracks `(x, z)` as a raw float, so a sub-texel move re-quantizes the
  entire shadow map (classic shadow swim, no texel snapping anywhere in the file);
- the box SIZE tracks `r`, and `r` changes on every eat, so `cam.left !== -half` is true
  on essentially every frame of active play and the projection is rebuilt;
- `cam.far = dist * 2.2 = 5.5 * half = 77r`, and `sun.shadow.bias = -0.0012`
  (`src/engine/scene.js:54`) is normalized against `far - near`, so the bias in world
  units is `0.0012 * (77r - 1)` and grows linearly with the hole.

**Root cause.** A design decision, recorded in the comment at `src/engine/scene.js:44-49`,
to size the shadow volume from the current view rather than from the world, implemented
without the two things that decision makes mandatory: snapping the box origin to the
shadow map's texel grid, and quantizing the box size so it does not change every frame.
The comment states the goal ("keeps it centred on the avatar and sized to the current
view, which is what keeps the shadows sharp as the hole grows") and the guard at line 68
(`if (cam.left !== -half)`) shows the author was thinking about avoiding redundant
projection rebuilds, but the guard compares against a continuous quantity, so it never
fires as a guard. There is no commit where snapping existed and was removed; it was never
written.

**Second root cause, independent.** `src/engine/scene.js:21` sets `near = 0.1` for a game
whose camera stands off 12x an avatar radius that reaches 483 world units on level 1
(`avatar.radiusCap = level.world * 0.2`, `src/main.js:1129`). This was almost certainly a
Three.js boilerplate default that was never revisited. It is not a hypothesis: the repo
has already measured it. `src/engine/avatar.js:139-167`:

> "With the engine's near/far of 0.1/20000 the smallest resolvable depth step at the
> aperture is 0.058 world units at r=26 but 21.5 at r=500 [...] Past roughly r=70 the
> ground and the disc quantise to the SAME depth value and which one survives is decided
> by per-pixel rounding: the intermittent grey bleeding through the black."

That author fixed it locally with `polygonOffset` (`src/engine/avatar.js:331-333`,
`376-378`) and `src/engine/effects.js:189-191` did the same for shockwave rings, but the
finding was never carried back to `scene.js:21`, and the ground stack built afterwards in
`src/main.js` was written against world-unit Y offsets, which the same analysis proves
cannot work.

**Contributing factors.**
- The shadow map is re-rendered every frame for every prop with no effective culling
  (§4.4), so the cost of the unstable shadow is also the largest per-frame GPU cost.
- `src/engine/instancing.js:383` re-uploads the whole blob-shadow instance matrix buffer
  every frame unconditionally, while the sibling prop meshes two lines above are
  dirty-guarded (§4.3).
- Detection was delayed because the entire 0003/0004 workstream was explicitly headless.
  `.wiki/0003-hole-feel-and-visual-fidelity/00-findings.md` §10 closes with "None of this
  has been visually verified on the live URL", and the 9c1f460 commit message says
  "NOT VISUALLY VERIFIED. Nothing here has been seen in a browser." A shadow that swims
  is invisible to every gate this repo has.

---

## 4. Confirmed findings, with the numbers

### 4.1 The shadow volume is rebuilt every frame and never snapped (PRIMARY)

`half = Math.max(120, r * 14)`. The floor never binds: minimum avatar radius is 26
(`src/data/formulas.js:210`, `radiusFromMass(0) = 26`), so `14r >= 364 > 120` from the
first frame. Everything below is therefore governed by `r` alone.

Shadow map is 2048x2048 (`src/engine/scene.js:53`) covering `2 * half` world units.

| avatar radius r | context | shadow texel (world u) | shadow cam far (77r) | world-space bias | lateral shadow shift from bias |
|---|---|---|---|---|---|
| 26 | spawn, every level | 0.355 | 2002 | 2.40 | 1.6 |
| 86 | level 1 at target mass | 1.176 | 6622 | 7.95 | 5.2 |
| 200 | mid-run on a big level | 2.73 | 15400 | 18.5 | 12.1 |
| 483 | level 1 `radiusCap` | 6.60 | 37191 | 44.6 | 29.3 |

(bias = `0.0012 * (77r - 1)`; lateral shift = bias / tan(56.75 deg), the sun elevation
from `SUN_DIR = (120, 220, 80).normalize()` at `src/engine/scene.js:56`.)

Three independent per-frame perturbations:

1. **Translation without texel snapping.** `sun.position` and `sun.target.position` are
   set from raw avatar floats (`src/engine/scene.js:64-65`). Nothing rounds `(x, z)` to a
   multiple of the shadow texel. Every sub-texel move re-rasterizes the shadow map into a
   different texel phase, so every shadow edge on the ground jitters by up to one texel
   per frame: 0.36 world units at spawn, 6.6 at the cap.
2. **Rescale without hysteresis.** `if (cam.left !== -half)` at `src/engine/scene.js:68`
   compares a float against a float derived from `r`, which changes on every eat. The
   guard was written to avoid redundant `updateProjectionMatrix()` calls and in practice
   almost never suppresses one. At level 1 (75s timer, base mass 0 to 1000) `r` averages
   about 0.8 units per second of growth, so `half` grows about 11.2 units per second, or
   0.19 units per frame at 60fps: over half a texel of box growth per frame at spawn
   density. On a single large eat `r` steps discontinuously and the whole shadow map
   re-quantizes in one frame. That is the "snap".
3. **Bias rescale.** Because `cam.far` is `77r`, the world-space meaning of the constant
   `shadow.bias` changes every frame too. A 5-unit radius jump moves every shadow's depth
   bias by 0.46 world units in a single frame, which shifts every shadow edge laterally by
   0.3 world units at once, across the whole screen.

The ground is the receiver that shows all of this: `ground.receiveShadow = true`
(`src/main.js:566`) on a single `PlaneGeometry(level.world, level.world)`
(`src/main.js:534`), and the prop groups all cast (`src/engine/instancing.js:268`).
`tests/golden/spawn-l1.actual.png` shows shadowed area covering a clear majority of the
ground in frame.

**Live-browser confirmation needed for:** whether the visible artifact is edge crawl
(swim), a hard moving boundary (see 4.1a), or acne. All three are consistent with the
code; only a capture can rank them.

### 4.1a The shadow volume can be smaller than the visible ground on wide aspect ratios

Geometry from `src/engine/camera.js`: pitch 55 deg default (`PITCH_DEFAULT`, line 56),
fov 40 (`FOV_DEFAULT`, line 59), standoff `12r` (`DIST_RADIUS_MULT`, line 64).

- camera height = `12r * sin(55) = 9.83r`
- the frustum's TOP ray sits at `55 - 20 = 35` deg below horizontal, so it meets the
  ground at `9.83r / sin(35) = 17.14r` of view distance, i.e. `14.04r` horizontally from
  the camera, i.e. `14.04r - 6.88r = 7.16r` BEYOND the avatar.
- shadow box half-extent is `14r`. `14r > 7.16r`, so along the view axis the box covers
  the visible ground with margin. **This kills the "shadow box too small" hypothesis for
  the forward direction.**
- laterally it is marginal. Horizontal half-fov = `atan(tan(20) * aspect)`. At 16:9 the
  far-ground half-width is `17.14r * tan(32.9) = 11.1r`, inside the box. At 21:9 it is
  `17.14r * tan(40.3) = 14.5r`, **outside the `14r` box**.

Outside the shadow frustum Three's `getShadow()` returns fully lit
(`frustumTest` in the shadow map shader chunk), so on an ultrawide display the far screen
corners get a hard, straight, fully-lit boundary that slides across the ground as the
avatar moves and jumps as `half` rescales. That is a literal moving hard edge on the
ground and is the best code-level candidate for the word "tearing". Marked **medium
confidence, aspect-ratio dependent, needs the reporter's viewport dimensions to confirm.**

### 4.2 Depth precision at the ground is zero, and the layer order is held together by luck

Depth quantum at view distance z, for a 24-bit fixed-point depth buffer:
`dz = z^2 / (near * 2^24)`, with `near = 0.1` this is `z^2 / 1677721.6`. This model
reproduces the repo's own measurement exactly (`src/engine/avatar.js:145-148` states
0.058 at r=26; `12*26 = 312`, `312^2/1677721.6 = 0.0580`).

| r | view dist to avatar (12r) | quantum there | far visible ground (17.14r) | quantum there |
|---|---|---|---|---|
| 26 | 312 | **0.058** | 446 | 0.118 |
| 86 | 1032 | **0.635** | 1474 | 1.29 |
| 200 | 2400 | 3.43 | 3428 | 7.00 |
| 483 | 5796 | 20.0 | 8279 | 40.9 |

Complete enumeration of every ground-adjacent Y offset in the codebase:

| y | what | where | protected? |
|---|---|---|---|
| 0.00 | ground plane | `src/main.js:563-564` | n/a (the datum) |
| 0.05 | ground-detail grain plane | `src/main.js:608` | **NO** |
| 0.08 | road-marking paint geometry (`PAINT_Y`) | `src/main.js:637` | **NO** |
| 0.15 | prop blob-shadow decals | `src/engine/instancing.js:332` | **NO** |
| 0.20 | avatar hub collar base | `src/engine/avatar.js:136` | yes, `polygonOffset -6` (`avatar.js:376-378`) |
| 0.30 | avatar aperture disc | `src/engine/avatar.js:128` | yes, `polygonOffset -2` (`avatar.js:331-333`) |
| 0.35 | avatar wheel body / spokes base | `src/engine/avatar.js:129-131` | yes (parented under the biased pieces) |
| variable | shockwave rings | `src/engine/effects.js:272` | yes, `polygonOffset -1` (`effects.js:189-191`) |

The three unprotected offsets (0.05, 0.08, 0.15) are **all smaller than the depth quantum
at the avatar's own feet at minimum radius (0.058)**. There has never been a radius, a
level, or a screen region where any of them had a full quantum of separation from the
ground. `src/engine/instancing.js:332`'s comment, `// float just above the ground plane to
avoid z-fighting`, describes an outcome the depth buffer cannot deliver.

**Why it is not visibly flickering right now, and why that is not reassuring.** Verified
against the vendored renderer, not assumed. `node_modules/three/build/three.module.js:8112`
`painterSortStable` orders the opaque list by `groupOrder`, then `renderOrder`, then
**`material.id`**, and only then by `z`. The ground stack's material creation order is
`groundMat` (`src/main.js:539`), `detailMat` (599, transparent so a different list),
`paintMat` (667), then the prop materials (724+). That ascending material-id order
happens to coincide exactly with ascending Y, so the layer that should win a tie is
always the one drawn last, and `LessEqualDepth` (the Three default) lets it win even at
identical quantized depth. The transparent list
(`three.module.js:8142` `reversePainterSortStable`) is likewise pinned by explicit
`renderOrder` (`detail` at -2, `src/main.js:612`; blob shadows at -1,
`src/engine/instancing.js:261`).

So the stack is correct by accident of construction order, not by depth. Moving one of
those five `new THREE.Material(...)` lines, adding a material, or setting a `renderOrder`
turns the entire ground into a full-screen z-fight. This is a live tripwire.

**And one stated invariant is already false.** `src/main.js:626-631` claims:

> "Paint is opaque so it draws in the opaque pass and writes depth; the detail plane is
> transparent and depth-TESTS (depthWrite off, depthTest on), so its fragments fail behind
> the paint and the grain never muddies the paint."

With zero depth separation the detail fragments do NOT fail behind the paint: their
quantized depth equals the paint's, and `LessEqualDepth` passes on equal. The multiply
grain darkens every lane marking and crosswalk in the game. That is a look defect that is
shipping today.

### 4.3 Unconditional per-frame instance-buffer re-upload

`src/engine/instancing.js:373-383`:

```js
for (const group of groups.values()) {
  if (group.matrixDirty) { group.mesh.instanceMatrix.needsUpdate = true; group.matrixDirty = false; }
  ...
}
if (shadowMesh) shadowMesh.instanceMatrix.needsUpdate = true;   // <- no guard
```

The prop meshes are correctly dirty-guarded. The blob-shadow mesh is not: its full
`N * 64` byte matrix buffer is re-uploaded every frame whether or not a single prop moved.
`shadowMesh` has one slot per prop (`src/engine/instancing.js:259`), and commit 9c1f460
raised prop counts substantially, so this is on the order of 100-400 KB of bus traffic per
frame for a buffer that is static for most of a level. Confirmed by code; its contribution
to perceived stutter needs a live frame-time capture.

### 4.4 The shadow pass has no effective culling

Every prop group is `castShadow = true` (`src/engine/instancing.js:268`), and each group is
one `InstancedMesh` whose bounding sphere spans the whole world because the instances are
spread across it. Three therefore cannot cull any of them out of the shadow pass, so the
full prop roster is rasterized twice per frame (shadow map plus main pass). The main pass
does have a real per-instance frustum cull (`src/engine/instancing.js:360-371`); the shadow
pass has nothing equivalent. Confirmed by code; frame-cost impact needs a live capture.

---

## 5. Hypotheses killed, with the evidence that killed them

Recorded so the next investigator does not re-walk them.

### 5.1 KILLED: texture filtering / mipmaps / anisotropy

Hypothesis 3 in the brief. Both ground textures are created as bare `THREE.CanvasTexture`
(`src/main.js:554`, `src/main.js:590`) and neither overrides `minFilter` or
`generateMipmaps`. The Three defaults are `generateMipmaps = true` and
`minFilter = LinearMipmapLinearFilter`, so the full mip chain and trilinear minification
are both active. Anisotropy is explicitly set from the device on both
(`src/main.js:559`, `src/main.js:598`, `Math.min(8, renderer.capabilities.getMaxAnisotropy())`).
This is correct, and it is correct on both the layout map and the detail tile. Not the
cause.

### 5.2 KILLED: non-power-of-two silently forcing ClampToEdge and disabling mips

Hypothesis 6. This is a WebGL1 failure mode. `package.json` pins `three@^0.185.0` and the
vendored build is r185 (`assets/vendor/three.module.js` via the import map at
`index.html:392-398`), which is WebGL2-only. WebGL2 supports full mipmapping and
`REPEAT` wrapping on NPOT textures. The layout canvas is NPOT (`groundTextureSize()` at
`src/content/groundtex.js:548-551` rounds to a multiple of 4, e.g. 1016px at world 2415)
and that is fine. The detail tile is 512px, power of two anyway
(`DETAIL_TEX_SIZE`, `src/content/groundtex.js:219`). Not the cause.

### 5.3 KILLED: re-baking or re-uploading the ground texture per frame

Hypothesis 4. `bakeGroundTexture` and `bakeGroundDetail` are called from exactly one place
each, `src/main.js:540` and `src/main.js:588`, both inside `buildLevelWorld()`, which runs
once per level start (`src/main.js:1121`). A repo-wide grep for `needsUpdate` finds no hit
on any ground texture; the only per-frame `needsUpdate` writes are instance matrices and
colors (§4.3). Not the cause.

### 5.4 KILLED: texture size / VRAM limit

Hypothesis 5. `GROUND_TEX_MAX = 2048` (`src/content/groundtex.js:90`), which is exactly the
WebGL2 guaranteed-minimum `MAX_TEXTURE_SIZE`, so the texture is legal on every conformant
device. At level 100 that is 2016px, about 16.3 MB plus 21.7 MB with mips
(`src/content/groundtex.js:82-87`), which is large but is a one-time allocation, not a
per-frame event. The canvas2D bake is a synchronous level-build cost and can hitch on
level entry; it cannot produce a steady-state artifact. Not the cause of the reported
symptom, but see §7.5.

### 5.5 KILLED: something in the frame loop moving, rescaling or re-parenting the ground

Hypothesis 7. The ground, detail and paint meshes are created in `buildLevelWorld` and
added to `state.levelRoot` (`src/main.js:616`, `674`, `676`). Grepping `src/main.js` for
every reference to them shows no write after construction. The level root is properly torn
down and detached on rebuild (`disposeObject3D`, `src/main.js:146-160`, called at
`src/main.js:488`), so there is also no possibility of two stacked ground planes, which
would have been the textbook cause of exactly this symptom. Not the cause.

### 5.6 KILLED: pixel ratio, canvas sizing, drawing-buffer / CSS mismatch

`resize()` at `src/engine/scene.js:96-105` calls `setPixelRatio(min(dpr, 2))` before
`setSize(w, h, true)`, in that order, and updates `camera.aspect` and the projection
matrix. `setSize(..., true)` writes inline `style.width/height` in px, which beats the
`#game{width:100%;height:100%}` rule at `index.html:20` on specificity, so the CSS box and
the drawing buffer agree. Bound to `window.resize` and called once at construction
(`src/engine/scene.js:107-110`). Correct. (Minor, unrelated: there is no `visualViewport`
handling for mobile URL-bar changes.) Not the cause.

### 5.7 KILLED: double render, manual clear, autoClear weirdness

One `renderer.render(scene, camera)` (`src/engine/scene.js:113`) called from one place
(`src/main.js:2232`) inside one `requestAnimationFrame` chain (`src/main.js:2233`, `2273`).
`autoClear`, `autoClearColor` and `autoClearDepth` are never assigned anywhere in `src/`.
The minimap uses a 2D context (`src/ui/minimap.js:38`), not a second WebGL context.
Not the cause.

### 5.8 KILLED: `logarithmicDepthBuffer` is on and interacting badly

It is not on. `logarithmicDepthBuffer` appears nowhere in `src/` or `index.html`; the
renderer is constructed with `{ canvas, antialias: true }` only (`src/engine/scene.js:16`).
Worth noting the opposite: r185 DOES support `reversedDepthBuffer`, which is the better fix
(`node_modules/three/build/three.module.js:2405`, gated on `EXT_clip_control`). See §7.2.

### 5.9 KILLED: the shadow box is too small for the view (forward direction)

Computed in §4.1a: the box half-extent `14r` comfortably exceeds the `7.16r` of visible
ground beyond the avatar. Killed for the forward axis; survives only as a marginal
lateral/ultrawide case, which is recorded there rather than here.

### 5.10 KILLED: shadow acne from insufficient bias

`sun.shadow.bias = -0.0012` normalized against a `77r` depth range gives 2.4 world units of
bias at spawn against a per-texel depth slope of about 0.23 world units. The ground is
over-biased, not under-biased, by an order of magnitude, at every radius. The failure mode
here is peter-panning (shadows detaching from their casters, up to 29 world units of
lateral shift at the level-1 radius cap, §4.1) rather than acne.

---

## 6. Blast radius

- **Every level, every frame, every device.** Neither root cause is conditional on level,
  metro, seed, or device capability. `near = 0.1` and the unsnapped shadow box are
  unconditional.
- **Gets monotonically worse within a single run.** Both defects scale with avatar radius:
  depth quantum with `r^2`, shadow texel and shadow bias linearly with `r`. A player
  reports it "currently" because it is least bad in the first seconds of a level.
- **Sibling instances of the same pattern (world-unit Y offset used as a z-fight
  remedy).** Complete list, from the §4.2 table: `src/main.js:608` (0.05),
  `src/main.js:637` (0.08), `src/engine/instancing.js:332` (0.15). Those are the only three.
  Every other ground-adjacent surface in the codebase already uses `polygonOffset`
  (`src/engine/avatar.js:331-333`, `376-378`; `src/engine/effects.js:189-191`), which is
  evidence that the correct technique is known in this codebase and simply was not applied
  to the ground stack.
- **Sibling instance of the "unguarded per-frame upload" pattern.**
  `src/engine/instancing.js:383` is the only unguarded one; lines 373-381 show the guarded
  form two lines above it, so this is a single omission rather than a pattern.
- **A currently-shipping look defect that falls out of the same root:** the detail grain
  multiplies over every lane marking and crosswalk (§4.2), contradicting the design note at
  `src/main.js:626-631`.
- **A latent tripwire:** the ground layer order is guaranteed only by material creation
  order (§4.2). Any future edit that adds or reorders a material in `buildLevelWorld`
  converts this from "invisible" to "full-screen z-fight".

---

## 7. Fix specification

Ordered by expected effect per unit of risk. Nothing below is implemented. Each item is
independent; they can ship separately.

### 7.1 Snap and quantize the shadow volume (fixes the primary defect)

File: `src/engine/scene.js`, function `followShadow` (lines 61-77).

Two changes, both inside that function, nothing else moves:

1. **Quantize the box size** so it changes in discrete steps instead of every frame. Snap
   `half` up to a power-of-two-ish ladder, e.g.
   `half = Math.max(120, 2 ** Math.ceil(Math.log2(extent)))`, or any monotone step function
   with at least ~1.4x between steps. This makes the `if (cam.left !== -half)` guard at
   line 68 actually guard, so the projection is rebuilt a handful of times per level
   instead of ~60 times per second, and the shadow bias (which scales with `cam.far`) stops
   changing every frame as a side effect.
2. **Snap the box centre to the shadow map's texel grid** before assigning it. With the
   quantized `half` and `mapSize` 2048:

   ```
   texel = (2 * half) / 2048
   snappedX = Math.round(x / texel) * texel
   snappedZ = Math.round(z / texel) * texel
   ```

   and use `snappedX/snappedZ` for BOTH `sun.position` and `sun.target.position`. Strictly
   this should snap in the light's own basis rather than world XZ; snapping in world XZ is
   an approximation that removes most of the swim because the light direction is a fixed
   constant here (`SUN_DIR`, line 56), and it is the cheap correct-enough version. If the
   live capture shows residual crawl, upgrade to snapping in light space (build the light
   view matrix, snap the target in that space, transform back).

Also consider decoupling the growth: `extent = r * 14` at `src/main.js:1702` combined with
`half * 2.5` and `far = dist * 2.2` means the shadow depth range is `77r`. Once `half` is
quantized this stops being a per-frame problem, but the absolute bias at large `r` (44
world units at the cap, §4.1) is still wrong. Prefer expressing the bias in world units by
holding `cam.far` closer to the geometry: `cam.near`/`cam.far` only need to bracket the
scene's height range along the light axis (props are at most a few hundred units tall),
not `77r`. Tightening `cam.far` to something like `dist + 400` makes `shadow.bias` mean
roughly the same thing at every radius.

**Regression test.** `scripts/` has no rendering harness, but this is testable headlessly
against a stub: call `followShadow` twice with avatar positions differing by less than one
shadow texel and assert `sun.target.position` is byte-identical; call it across a small
radius change and assert `sun.shadow.camera.left` is unchanged. Both assertions fail on
today's code. Add to `scripts/logic-test.js` (it already injects THREE, see the DI note at
`src/engine/scene.js:3-11`).

### 7.2 Fix the depth range at the source

File: `src/engine/scene.js:21`.

```js
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20000);
```

`near = 0.1` buys nothing: the closest the chase camera ever gets to anything is the
avatar's own rim at `12r`, minimum `312` world units (`src/engine/camera.js:64`,
`src/data/formulas.js:210`), and the obstacle pull-in clamps to `r * 1.5 = 39` minimum
(`src/engine/camera.js:199`). `far = 20000` is also loose: the largest world is 4800 and
the camera never exceeds about 4700 units of height.

Recommended, in order of preference:

1. **Enable reversed depth.** r185 supports it:
   `new THREE.WebGLRenderer({ canvas, antialias: true, reversedDepthBuffer: true })`.
   Gated on `EXT_clip_control` (`node_modules/three/build/three.module.js:2405-2410`), and
   Three logs a warning and silently falls back when the extension is missing, so it is
   safe to request unconditionally. This alone essentially eliminates the precision
   collapse and is a one-line change.
2. **Independently, tighten near/far** to something like `near = 5`, `far = 12000`. That is
   a 50x precision improvement on its own (quantum scales as `1/near`) and costs nothing:
   with a 12r standoff nothing is ever within 5 units of the camera. Verify against the
   camera's obstacle pull-in path (`src/engine/camera.js:183-206`) which can place the
   camera at `r * 1.5` from the avatar, minimum 39 units, still well clear of 5.

Do BOTH. Item 2 is the safety net for devices without `EXT_clip_control`.

**Regression test.** Assert `camera.near >= 5` and `camera.far / camera.near <= 2500` in
`scripts/logic-test.js`. Add a comment at `src/engine/scene.js:21` pointing at
`src/engine/avatar.js:139-167` so the next person does not reset it to the boilerplate
default.

### 7.3 Give the three unprotected ground layers a real depth bias

Files: `src/main.js`, `src/engine/instancing.js`.

Even after 7.2, world-unit Y offsets of 0.05 / 0.08 / 0.15 are the wrong currency, for
exactly the reason written at `src/engine/avatar.js:151-157`. Convert them to
`polygonOffset`, matching the existing convention in this codebase:

- `src/main.js:599-605` (`detailMat`): add
  `polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1`.
- `src/main.js:667-669` (`paintMat`): add
  `polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2`.
- `src/engine/instancing.js:108-113` (`shadowMat`): add
  `polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3`.

Keep the existing Y offsets as-is (they cost nothing and help at close range); the
polygonOffset is what makes the ordering hold at distance. Note the bias ladder must stay
strictly below the avatar's (`-2` disc, `-6` collar, `src/engine/avatar.js:166-167`) so
the hole still wins over the ground stack; `-1 / -2 / -3` sits inside that budget.

Then **delete or correct the false claim at `src/main.js:626-631`**, which asserts the
detail grain fails behind the paint. With the paint biased ahead of the detail plane it
becomes true for the first time; the comment should say the polygonOffset ladder is what
makes it true, not the 0.03 world units of Y difference.

**Regression test.** Not unit-testable. This is the case for a golden-image check: extend
`scripts/golden-test.cjs` with a capture at large radius (the existing `mid-l1` capture is
at mass 17, i.e. still near minimum radius, which is exactly why the existing goldens never
showed this). A capture at `r > 200` against the deployed URL is the gate.

### 7.4 Guard the blob-shadow instance upload

File: `src/engine/instancing.js:383`.

Track a `shadowMatrixDirty` flag set inside `writeInstanceMatrix()` (line 323-339, alongside
the existing `group.matrixDirty = true` at line 321) and consume it in `update()` the same
way lines 373-377 consume `group.matrixDirty`. Set it unconditionally in `set()` (line 282)
so the initial full write still lands.

**Regression test.** Call `update()` twice with no prop mutation and assert
`shadowMesh.instanceMatrix.version` did not increment on the second call.

### 7.5 Lower priority, record but do not necessarily act

- **Shadow-pass culling (§4.4).** The correct fix is per-instance shadow culling against
  the shadow camera's frustum, which is a real piece of work. A cheap partial win is to set
  `castShadow = false` on the small-prop groups (trash, bikes, pedestrians, lamps) whose
  cast shadows are a few pixels at the gameplay camera anyway, keeping it on for buildings
  and vehicles. Measure first.
- **Ultrawide shadow-box escape (§4.1a).** Derive `extent` from the actual frustum footprint
  rather than from `r * 14`, or simply widen the multiplier when `camera.aspect > 2`.
  Confirm against the reporter's viewport before spending anything on it.
- **Ground texture memory (§5.4)** is already tracked as an open item in
  `.wiki/0003-hole-feel-and-visual-fidelity/00-findings.md` §10 and is not implicated here.

---

## 8. Prevention

The class of bug is: **a rendering invariant asserted in a comment, never expressed as a
gate, on a codebase whose entire test suite is headless.**

Three concrete changes, none of which is a new service or dependency:

1. **The depth-precision finding must live where the decision is made.** It was measured
   correctly once, in `src/engine/avatar.js:139-167`, and then stayed there while two more
   subsystems (the ground stack in `src/main.js`, the blob decals in
   `src/engine/instancing.js`) were built on the assumption it disproves. A one-line
   comment at `src/engine/scene.js:21` pointing at that analysis, plus the numeric assertion
   from §7.2 in the logic suite, converts a finding into a constraint. The general rule:
   when an investigation measures a global engine parameter, the note goes on the
   parameter, not only on the symptom that surfaced it.

2. **Any per-frame recomputation of a projection matrix needs a snapping story in the same
   commit.** `followShadow` is the only such function in the codebase and it has neither
   snapping nor quantization. This is a well-known requirement for cascaded/following
   shadow maps, so the prevention is a checklist item rather than a tool: if a shadow,
   reflection or decal projection follows the player, state in the comment how its texel
   grid is stabilized, or say explicitly that it is not and why that is acceptable.

3. **The golden-image gate must sample the state where the defects live.** All three
   existing captures (`tests/golden/spawn-l1.png`, `mid-l1.png`, `spawn-l50.png`) are at or
   near minimum avatar radius, which is precisely the radius at which both root causes are
   least visible. Add a large-radius capture to `scripts/golden-test.cjs` (against the live
   deployed URL, never localhost) and, because the primary defect is temporal, a two-frame
   capture with the avatar displaced by a sub-texel amount: a correct shadow implementation
   produces near-identical frames, a swimming one does not. That difference is measurable
   headlessly and would have caught §4.1 without a human looking at anything.

Observability note, per the standing rule: nothing here needs error tracking. The evidence
that closes this out is a Playwright capture from the live Vercel URL plus the existing
`window.__fw` debug handle (`src/main.js:2277`), which already exposes `engine`, `avatar`
and `state` and is enough to drive the avatar to a large radius and read
`engine.renderer.info` and the shadow camera's parameters directly from the console.

---

## 9. What is still open

- **The reporter's viewport aspect ratio**, which decides whether §4.1a (hard moving
  lit/unlit boundary in the far corners) is in play or not.
- **A live capture ranking the three shadow failure modes** (swim, rescale snap,
  ultrawide boundary). All three are proven present in the code; their relative visual
  weight is not determinable from source.
- **Frame-time evidence** for §4.3 and §4.4. Both are confirmed as unnecessary per-frame
  work; whether either is large enough to cause a perceptible hitch needs a profile.
