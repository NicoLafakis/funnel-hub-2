# 0011 — Remediation Design

Per-requirement implementation shape, grounded in the shipped mechanism. Every
file path and symbol name below was read in the current worktree; where a
mechanism could not be confirmed it is marked **UNVERIFIED** rather than
asserted.

Constraints honored throughout: no new npm dependencies (`AGENTS.md`);
`src/systems|content|data|meta/*` never import THREE; all generation stays
seeded from `src/data/seeds.js`; economy values only from
`src/data/formulas.js`; every look-and-feel item is gated on Nico's approval
(† in [`requirements.md`](requirements.md)); no paid asset or service; no
observability SaaS.

**Path correction for anyone following the findings doc:** the instancing
module is `src/engine/instancing.js`. There is no `src/content/instancing.js`.

## 0. The three constraints that shape every item below

### 0.1 Only `.color` survives the instancing merge

`propkit.mergedKindGeometry` (`src/content/propkit.js`) traverses a built prop
`Group` and flattens every child mesh into one `BufferGeometry`
(`position`/`normal`/`color`/`uv` + index). Part *materials* are discarded;
part colours become vertex colours. `createInstancedPropField` then wraps that
in one `InstancedMesh` with a single
`MeshStandardMaterial(roughness 0.72, metalness 0, vertexColors: true,
flatShading: true)`, plus `material.map = opts.map` for facade-textured
buildings. Per-part roughness and metalness authored in the builders
(`standardMat`) are dead on the instanced path.

The only per-instance data that survives is `instanceMatrix` and
`instanceColor`. There are no custom `InstancedBufferAttribute`s anywhere in
the module.

**Consequence for this package:** fidelity can only be bought three ways —
better *geometry* (merges free into the existing group), better *vertex
colour* (free), or one *texture map per merged kind* (already the mechanism the
buildings use; free). "Give the trees a roughness map" is not available at any
price short of breaking the group budget.

### 0.2 The far-field-only DOF band is a proof, not a tuning

`src/engine/dof.js` exports `FarFieldDofShader`, `FAR_FIELD_BLUR_RADIUS_UV`,
and `farFieldBlurBand(camera, playableHalfExtent, hazeRun, out)`. The shader
computes `coc = smoothstep(blurNear, blurFar, viewDepth)` and early-returns a
single unblurred fetch when `coc <= 0.0`. `main.js:2909-2915` passes
`playableHalfExtent = level.world / 2` and `hazeRun = HAZE_RUN_WORLD *
level.world`; the band is

```
base     = -dot(eye, forward)
lateral  = |forward.x| + |forward.z|
nearEdge = base + (playableHalfExtent + SHARP_PAD_OF_HAZE_RUN * hazeRun) * lateral
farEdge  = base + (playableHalfExtent + RAMP_END_OF_HAZE_RUN  * hazeRun) * lateral
```

with `SHARP_PAD_OF_HAZE_RUN = 0.01` and `RAMP_END_OF_HAZE_RUN = 0.45`. That
`nearEdge` is the exact four-corner maximum of the affine view-depth function
over the convex playable square, so it is a *proven* upper bound and GLSL
`smoothstep` returns literal `0.0` at or below `edge0`. Degenerate inputs fail
sharp (`nearEdge = 1e9`, past the 12000 far clip). Wired in
`src/engine/scene.js:393-408` as a `ShaderPass`, enabled only when
`profile.effectsDensity >= 0.7`.

**Consequence:** `NR4` is currently guaranteed by construction. Any atmosphere
work must add its softness through fog/haze/cloud *colour*, never by widening
this band, moving `SHARP_PAD_OF_HAZE_RUN`, or adding a second pass. Fog is the
one exception already accepted: `FogExp2` attenuates from the first metre
(`art-direction.md` §1 records this as a deliberate trade), so any fog-density
change is a change to an already-accepted small everywhere-haze, and must be
re-measured against a fixed in-play capture rather than assumed harmless.

### 0.3 Edible readability is a hard gate on item 2

Edibility signals through **value, never hue**: `EDIBLE_LIFT = 1.06` and
`TOO_BIG_DIM = 0.62` / `TOO_BIG_DIM_TEXTURED = 0.78` in
`src/engine/instancing.js` are scalar multiplies on the instance colour, applied
*before* lighting, which is why the ratio survives any light rig
(`art-direction.md` §3). The recorded rendered ratio is 1.284 by one method and
1.327 by another; both are in the wiki with their methods and neither is
asserted over the other. The seven collectible tiers also hold a sacred 1.35×
size step (`TIER_SIZE_STEP` in `src/data/levels.js`).

**Consequence:** any prop restyling must (a) leave the instance-colour path
untouched so the value ratio is arithmetically unchanged, and (b) not alter
silhouette proportions enough to blur the 1.35× step. Restyling is therefore a
*geometry and base-colour* job, not an instance-colour job. This is the ceiling
on how far R2 can go, and it is why R2 cannot be solved by "make the props
darker and more saturated to match the photos" — that would move the same
scalar the edibility signal rides on.

---

## R1 — Tall buildings show their windows; nothing reads as pure black

Two independent albedo defects, neither of which is a lighting problem. The
current Loop light rig is already the brightened one: `setMood({ cityId })` in
`src/engine/scene.js` sets `ambient.intensity = 0.26`,
`hemi.intensity = 1.12` with `hemi.color = '#d9e7f2'` over
`groundColor = 0xc9b28a`, and `sun.intensity = 1.6` at
`sun.position.set(120, 220, 80)` — roughly 56.7° elevation. Because three's
`HemisphereLight` is a normal-dependent lerp, the worst-case surface still
receives full warm ground bounce at 1.12 plus flat ambient at 0.26. **No
surface in this scene can reach zero irradiance.** Raising the lights further
would wash the palette (`art-direction.md` §5 records the measurement that
pinned the current values to +0.5% frame-mean luma) and still leave both
defects, because both live in albedo.

Also confirmed, because it bounds the options: there is **no
`renderer.toneMapping` and no `renderer.outputColorSpace` assignment anywhere
in `src/`** — the pipeline runs r185 defaults, `NoToneMapping` and
`SRGBColorSpace`. `art-direction.md` §5 records tone mapping as measured and
rejected (0.00% clipping in every configuration tried, and AgX shrank the
edibility ratio to 1.226, invalidating §3's ladder). That rejection stands;
this item does not reopen it. But it is *why* a 0.03-linear surface renders as
flat black rather than a rolled-off dark value: there is no shoulder.

### R1a — The black tower is a texture-variant lottery

`src/engine/instancing.js:274` resolves a group's facade map as
`textures.facades[kind]` — keyed by **gameplay kind**, so every
`building-large` gets a map. What is keyed per group is the *variant pick*:
`facadeEntry[hashKey(key) % facadeEntry.length]` (line 278-280) where
`key = "<visualId>|<materialVariant>|<golden>"` from `identityFor` (line 220),
and `textures.js:470` assembles the array as `[base, ...variants]` — four
entries for `building-large`.

`cityobj_chicago_marina_city_tower_pair` hashes to **index 1 =
`facade-large-glass-dark.png`**, whose measured mean sRGB luminance is
**40.2/255 (0.158)** against its siblings' 45.2 (`facade-large-violet.png`) and
185.5 (`facade-large-concrete-glass.png`). The tower is a `building-large`
(tier 6, `src/data/levels.js`), material variant `default`, geometry
`building_large_slab` via `src/content/modelkit.js:41`. It is **not** the
landmark — `landmarkType = 'mega-spire'` drives a separate non-instanced
`createLandmark(...)`.

Compounding it, `instancing.js:326-327` skips the palette pick when
`photorealFacades && group.facadeMap`, so
`CHICAGO_IDENTITY_COLORS['cityobj_chicago_marina_city_tower_pair'] = '#918b75'`
(`propkit.js:221`) is **dead for this tower** — its instance colour stays
propkit's neutral grey jitter (`0.90–1.02`). Then `setEdibility(false)` applies
`TOO_BIG_DIM_TEXTURED = 0.78`. Net: `0.78 × ~0.96 × 0.158` ≈ 0.12 effective
albedo. The windows are in the art; the whole band is compressed into the
bottom ~12% of the value range, so there is nothing to read.

**Mechanism to change, cheapest first:**
1. **Re-expose the dark-glass art.** Lift `facade-large-glass-dark.png`'s
   levels so its mean lands in the same band as its siblings (the medium/small
   tier arts measure 140–194) while keeping the dark-glass *character* — a
   dark-glass tower should still be the darkest of the four, just not a
   silhouette. This is an asset edit in `assets/textures/photoreal/`, zero code,
   zero cost, and it fixes every group that hashes to that variant, not just
   Marina. Regeneration route if the art is re-generated rather than
   re-levelled: `node scripts/pixellab.js` /
   `scripts/gen-photoreal-tiles.sh` per `AGENTS.md` and
   `texture-map-manifest.md`.
2. **Rescue the identity colour for textured groups.** The palette skip at
   `instancing.js:326-327` exists so a pastel multiply cannot wreck a
   photograph — correct intent, too wide a net. A named exception that still
   applies `CHICAGO_IDENTITY_COLORS[visualId]` (a *specific authored*
   colour, not the pastel palette pick) as a gentle multiply on textured
   Chicago groups restores the buff/limestone/red-slab identities the wiki
   already claims are shipping. Bounded: only ids present in
   `CHICAGO_IDENTITY_COLORS` (`propkit.js:200-224`), only when
   `photorealFacades` is true, so it cannot reach the 99 generic levels.
3. **Reconsider `TOO_BIG_DIM_TEXTURED` for the tallest tier only.** 0.78 is
   already the relaxed value. Do this last and only if 1 and 2 are
   insufficient, because it is the constant the edibility ratio rides on
   (§0.3) and must be re-measured, not re-tuned.

**Deliberately not doing:** raising the light rig (§above — it cannot reach an
albedo problem and it costs the palette calibration); adding an emissive window
material (a second material, blocked by the budget in
[`00-overview.md`](00-overview.md)).

### R1b — The black ground floors are a baked paint band

`scripts/blender/build_props.py:65` defines
`DOOR_GLASS = srgb('#38495e')` → linear `(0.0396, 0.0666, 0.1119)`, described
in its own comment as "fixed, dark ground-floor entrance glass". Decoding the
shipped vertex-colour buffers in `assets/models/*.js` confirms that exact
triple in **every building model**, always at the bottom:

| Model family | Vertices | Height fraction |
|---|---|---|
| `building_large_slab` / `_cornice` / `_curtain` / `_setback` / base | 24 | 0.00–0.07 |
| all `building_medium_*` | 24 | 0.00–0.08 |
| all `building_small_*` | 24–48 | **0.00–0.24** |

Two mechanisms make it unrescuable rather than merely dark. `bakeModelPart`
(`propkit.js:1177-1225`) classifies a vertex as tintable only if it is
greyscale (`|r-g| < 0.02 && |g-b| < 0.02`). `#38495e` is not, so it (a) keeps
its authored colour instead of being whitened for tinting, and (b) is aimed at
`TRIM_UV = [0.04, 0.96]` (`textures.js:142`) — the flat
`TRIM_SWATCH_COLOR = '#ffffff'` swatch — so **the ground-floor band receives no
facade art at all**. The too-big multiply then lands on top: final albedo
≈ linear `(0.031, 0.052, 0.087)` ≈ sRGB `#2e3d51`. In a sun-shadowed street
canyon, that is black.

On small buildings this band is the bottom **24%** of the model — which is why
the defect reads worst exactly where the player stands, and why it is louder
than the tower.

Secondary contributor, same family: `TRIM = '#5f6b7a'` → linear
`(0.114, 0.147, 0.195)`, spread over large height ranges on several models
(`building_large_setback` covers height fraction 0.50–1.00 with 228 vertices).
That is the "tall buildings read as dark cut-outs" complaint arriving from a
second direction.

**Mechanism to change:** lift `DOOR_GLASS` (and review `TRIM`) in
`scripts/blender/build_props.py` toward the range the procedural fallback
already uses for the same job — `PALETTE_GLASS_TINT = '#7190a1'`
(`propkit.js`), which is materially lighter and is what the non-model path
paints. Real ground-floor glazing in daylight reflects sky; it is not darker
than the masonry above it.

**Blocking caveat, must be planned around:** `art-direction.md` §1 records
that **Blender is not installed on this machine** (checked 2026-07-28,
`094d25e`), so `npm run models` cannot run here and
`assets/models/*.js` cannot be regenerated locally. Two routes:
- **Route A (preferred, no Blender):** post-process the shipped vertex colours
  at bake time in `propkit.js` `bakeModelPart` — add a bounded remap that
  lifts the specific authored `DOOR_GLASS`/`TRIM` triples toward target values,
  keyed on the exact linear triple so it cannot catch anything else. This is a
  pure-JS change, ships today, is exactly triangle-neutral, and is reversible
  in one line. It is the same "fix has to land in `propkit.js` instead of the
  `.glb` source until someone runs it on a machine that has Blender" pattern
  `art-direction.md` §1 already established.
- **Route B:** fix `build_props.py` at source and regenerate on a machine with
  Blender. Correct long-term, blocked today. Do both eventually — Route A now,
  Route B when the toolchain is available, then delete the remap.

**UNVERIFIED:** that the specific black regions in `b-street.png` /
`d-intersection.png` are this band rather than cast shadow. The height-fraction
evidence is strong but is static analysis. Task 1 in
[`tasks.md`](tasks.md) confirms it on the live build before the change lands.

---

## R4 — Sky with depth, haze, and cloud

There **is** already a real gradient dome, so this is not a from-nothing build.
`main.js` `buildLevelWorld()` derives `skyColor = new THREE.Color(metro.sky)`,
`skyZenith = skyColor × 0.82`, and
`skyHorizon = skyColor.lerp(0xffffff, 0.34)`, then builds a mesh named
`'sky-dome'`: `SphereGeometry(SKY_DOME_RADIUS = 5000, 24, 12, 0, 2π, 0, π*0.62)`
with per-vertex colour ramped `skyHorizon → skyZenith` on
`sqrt(max(0, y)/radius)`, `MeshBasicMaterial({ vertexColors: true, side:
BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false })`,
`renderOrder = -1000`, `frustumCulled = false`, re-centred on the camera every
frame (`main.js:2360`). `scene.background = skyHorizon` and
`scene.fog = new THREE.FogExp2(skyHorizon, FOG_DENSITY_PER_WORLD /
level.world)` with `FOG_DENSITY_PER_WORLD = 0.55` — 2.2774e-4 at Level 1's
world of 2415. The three-piece horizon stack (skirt y=−2, haze ring y=−1, dome)
all resolve to that one `skyHorizon` colour, which is what closed the
horizon-seam work in `94f5383`.

Why it still reads flat: the ramp spans only `skyHorizon → skyHorizon × 0.82`,
an 18% value spread over the whole dome, on `SphereGeometry(…, 24, 12)` — 12
latitude bands for the gradient. And **there is no cloud mechanism anywhere in
the repo** (confirmed: the only `cloud` hits are the
`cityobj_chicago_cloud_gate_the_bean` sculpture and unrelated `THREE.Points`
particle fields in `src/content/signatures.js` for Desert Spires and Red Square
Heights — neither is on Level 1).

**Mechanism to change, all inside the existing dome, zero new draw calls:**
1. **Widen and reshape the gradient.** Deepen `skyZenith` and lift the
   near-horizon band so the ramp carries a real value spread, and replace the
   `sqrt` ramp with one that holds a brighter, hazier band close to the horizon
   before climbing — a physical sky is not a monotone power curve, it has a
   bright haze skirt. Raise the latitude segment count (12 → 24 or 32) so the
   bands do not read as bands; the dome is 24×12 = ~576 triangles, so doubling
   it is free at this scale.
2. **Add cloud into the same mesh.** The cheapest credible route that adds no
   draw call and no material: bake cloud into the dome's own vertex colours is
   too coarse, so use a second unlit dome cap — but that is +1 draw call and
   +1 material, which the budget in `00-overview.md` treats as expensive.
   Prefer instead a **texture on the existing dome**: give `'sky-dome'` a
   procedurally-baked cloud map (the repo already bakes canvases procedurally
   throughout `groundtex.js` and `textures.js`, and `mulberry32` seeded noise is
   already in `textures.js`), sampled with the dome's existing UVs. One extra
   texture, same mesh, same material, same draw call. Cloud must be
   `fog: false` and `toneMapped: false` like the rest of the dome, and its
   sub-horizon band must remain exactly `skyHorizon` or the seam work in
   `94f5383` reopens — the dome's `thetaLength 0.62π` puts its rim 21.6° below
   the horizon and its ramp is keyed on `max(0, y)` precisely so that band is
   colour-identical to `scene.background`. **Preserve that property.**
3. **Do not touch fog density to buy atmosphere.** `FogExp2` has no onset and
   attenuates from the first metre — `art-direction.md` §1 records that as an
   accepted trade, and raising it puts more haze inside the play area, which is
   an `NR4` violation in spirit even though it is not a DOF change. If the
   horizon needs more separation, buy it in the dome's gradient, not in fog.

**Reality check that caps how much this is worth, and it is already in the
wiki:** `art-direction.md` §4 records that at `PITCH_DEFAULT = 55°` the horizon
line lands **433 px above the top of a 900 px frame** — no horizon geometry is
on screen at the default view. It enters frame only as the player drags pitch
toward `PITCH_MIN = 35°`, and `camera.js` recentres to 55° after 2 s. The sky is
a reward for dragging the camera down, not a constant. The findings call this
"the single fastest 'this is a video game' tell," which is true *of the
screenshots* — and the screenshots were captured at a review camera, not the
default gameplay camera. Item 4 stays in the P0 batch as instructed, and it is
cheap, but its priority rests on the review framing, not on the default frame.

**Deliberately not doing:** volumetric or raymarched clouds (a full-screen
pass, and the composer already carries DOF); a skybox cubemap (six textures, no
gradient control, and the seam identity with `scene.background`/fog would have
to be re-established by hand); an HDRI environment map (texture memory against
the ≤256 MB desktop / ≤96 MB mobile budget for a scene with no metal to
reflect it).

---

## R3 — Road paint and street width at prop scale

All the numbers exist and none of them obviously supports the findings' "3x"
figure. That is the finding of this section.

`src/content/districts.js`:
```js
function streetWidth(world) { return clamp(world * 0.032, 36, 80); }
```
At Level 1's `world = 2415` that is **77.28 world units**. The project's
canonical scale is `WORLD_UNITS_PER_METRE = 11.0` (`propkit.js`, derived from
exactly this: one 3.5 m lane ≈ 38.6 u). So the carriageway is **7.03 m** — a
normal two-lane street, not a 3x-wide one. `CURB_WIDTH = 20` adds 1.8 m of
pavement each side, which is *narrow* for a downtown Loop street, not wide.

Marking geometry is `roadMarkingQuads(layout)` and `parkingStallQuads(layout)`
in `src/content/groundtex.js` — pure, THREE-free, returning world-unit rects
that `main.js:917-966` merges into one `BufferGeometry` named
`'road-markings'` at `PAINT_Y = 0.08` with `paintMat` carrying
`polygonOffsetFactor: -2` (its rung on the ground depth-bias ladder,
`art-direction.md` §5). **One draw call.** Converted to metres at 11 u/m:

| Constant | World units | Metres | Real-world range | Verdict |
|---|---|---|---|---|
| `CROSSWALK_BAND` stripe width `(halfWide*1.8)/(2*6-1)` | 6.32 | 0.57 | 0.30–0.60 | top of range, not oversized |
| `LANE_CENTRE_WIDTH` | 3.0 | 0.27 | 0.10–0.15 | **~2x too wide** |
| `LANE_EDGE_WIDTH` | 2.2 | 0.20 | 0.10–0.15 | ~1.5x too wide |
| centre dash / gap | 14 / 12 | 1.27 / 1.09 | 3.0 / 9.0 (US) | dashes too short, gaps far too short |
| `CURB_WIDTH` | 20 | 1.8 | 2.5–6.0 downtown | too narrow |
| `PARKING_PITCH` | 24 | 2.2 | 6.0–6.7 | far too tight |

So the paint has two genuine defects (centre and edge lines ~1.5–2x too wide;
dash rhythm roughly 3x too frequent) and the crosswalk — the specific thing the
findings called out as "about as wide as a car" — computes as correct. Two
readings can reconcile that, and they lead to opposite fixes:

- **Reading A:** the paint is right and the *props* render smaller than their
  metre dimensions imply, so the mismatch is in `RENDER_SCALE_CORRECTION` /
  `kindRenderScale` (`propkit.js`), not in `groundtex.js`. Changing marking
  constants would then make the mismatch worse while making the numbers wrong.
- **Reading B:** the on-screen ratio really is off and one of the derived
  quantities above is wrong in a way this desk calculation misses.

**Therefore the mechanism for R3 is a measurement, not an edit.** Capture a
fixed `d-intersection` frame on the live deploy, measure in pixels the widest
painted stripe and the narrowest car beside it, and compute the ratio. Only
then move a constant — and move the one the ratio indicts. This is the standing
practice in this wiki: every art-direction entry that moved a constant recorded
the measurement that justified it, and the entries that *rejected* a change
(tone mapping, the 1024 px detail tile) rejected it on measurement too.

Once measured, the likely edits in priority order: dash/gap rhythm
(`14`/`12` → a real 1:3 ratio at scale), `LANE_CENTRE_WIDTH` and
`LANE_EDGE_WIDTH` down toward 0.15 m, `PARKING_PITCH` out toward a real bay
pitch, `CURB_WIDTH` up toward a downtown pavement. All are constants in one
pure module; all are free; all change the ground bake, so all need a
before/after at a fixed camera.

**Watch item:** `MIN_STREET_FOR_MARKINGS = 26` and
`MIN_STREET_FOR_PARKING = 52` gate whether paint appears at all, and the quads
are clipped to `|x| + reach <= layout.world/2`. Narrowing paint must not drop it
below those gates on any of the 99 other levels' street widths — `streetWidth`
is shared, so re-run the full campaign generation, not just Level 1.

**Deliberately not doing:** widening streets. `0007`'s reference table already
called *oversized* intersections the current-reference defect to correct, and
the computed width is already correct at canonical scale. Widening would also
consume block area and change placement capacity, which touches world
coordinates and the placement gate.

---

## R5 — The ground plane's edge in frame

Confirmed geometry, in `main.js` `buildLevelWorld()` unless noted:

| Surface | Name | Geometry | Y |
|---|---|---|---|
| Playable ground | (unnamed) | `PlaneGeometry(2415, 2415)`, **finite**, `receiveShadow` | 0 |
| Grain overlay | `'ground-detail'` | same extent, `MultiplyBlending`, `renderOrder -2` | 0.05 |
| Road paint | `'road-markings'` | merged quads | 0.08 |
| Horizon haze | `'horizon-haze'` | `RingGeometry(1207.5, 2221.80, 64, 6)` | −1 |
| Horizon skirt | `'horizon-skirt'` | `RingGeometry(1159.2, 2052.75, 64, 1)` | −2 |
| Context ground | `'chicago-context-ground'` (`city-context.js`) | `PlaneGeometry(7861, 7861)`, `0x69735f` | −0.82 |
| Water | `chicago-river-0/1`, `lake-michigan-context` | planes, `0x397e9f` | −0.35 |

**The cause is the camera near plane, not a missing surface.**
`src/engine/scene.js:108` builds
`new THREE.PerspectiveCamera(60, 1, 20, 12000)` — `camera.near = 20` world
units, deliberately raised from 0.1 as a depth-precision budget
(`tech-architecture.md` §1 has the full derivation; the 200,000:1 ratio
collapsed the whole ground stack into one depth increment and held its order by
luck). At a 9-unit eye height every ground fragment in the near foreground is
closer than 20 units and is clipped. What remains in that band is whatever was
painted first: the `'sky-dome'`, which has `depthTest: false`,
`renderOrder = -1000`, is camera-locked, and whose entire sub-horizon band is
exactly `skyHorizon`. Hence a blue band. `renderer.setClearColor(0x0b0f14, 1)`
is irrelevant because `scene.background` overrides it.

The skirt cannot catch the ray: its **inner** radius is `level.world * 0.48 =
1159.2`, so it does not exist under the play area at all. The context ground at
y = −0.82 is also behind the same 20-unit near plane.

**The reachability question, which changes what this item is worth.**
`camera.js` uses `DIST_RADIUS_MULT = 17.5` at `PITCH_DEFAULT = 55°`, so camera
height ≈ `17.5 r × sin 55°` ≈ `14.3 r`. At the smallest gameplay radius
(`TIER_BASE_RADIUS = 14`, spawn hole ~26) that is ~370 world units — forty
times the 9-unit height where the band appears. **UNVERIFIED and the first
thing to settle:** whether any reachable combination of pitch, radius, and the
`camera.js` obstacle pull-in (whose clearance derives from
`Math.max(0.5, camera.near * 1.5)`) can put the eye low enough. If none can,
this is a capture-rig artifact of a review camera and closes as unreachable.

**Mechanism if it is reachable, cheapest first:**
1. **Extend the skirt inward** so a continuous lit surface exists under the
   play area at y = −2. It is one `RingGeometry` inner-radius expression and
   the skirt is already unculled and already one draw call. Risk: the skirt
   sits under the opaque ground plane specifically so it cannot z-fight, and
   `94f5383` bound `skirtOuter` to `hazeFull` as one expression precisely to
   stop two constants drifting — do not disturb that binding, only the inner
   radius. Also note `art-direction.md` §1's warning: the skirt's vertex
   colours are a *multiply* on a `MeshStandardMaterial` and can only pull
   toward black, so its colour cannot be re-aimed at the sky.
2. **Clamp the reachable camera height** so the eye cannot descend below the
   near-plane's safe height for the ground plane. Cheapest of all, and it is
   the honest fix if the answer to the reachability question is "only just."
3. **Lower `camera.near`** — rejected. `tech-architecture.md` §1 sized 20
   against the closest the chase camera legitimately gets to anything, and
   `camera.js`'s pull-in clearance now derives from it. Moving it re-opens the
   closed depth-precision defect in `0005-ground-rendering-defect`.

**Deliberately not doing:** a sky-coloured backfill plane under the play area.
It solves the symptom by making the hole invisible rather than solid, and it
claims a new rung on the ground depth-bias ladder for a surface that should not
exist.

---

## R6 — Parks as bounded civic rooms

`buildChicagoLoop(world)` (`src/content/districts.js:298-388`) zones the
eastmost block column and the centre block `'park'`. Park interiors get
`parkSites(blocks, rng)` — a jittered grid (`nx = max(3, floor(b.w/60))`, ±24)
consumed by `PLACEMENT` at trash 0.45 / bike 0.35 share plus street trees and
people.

**There is no park furniture geometry instantiated anywhere.** Everything the
findings read as "board-game" is *painted* in `groundtex.js`'s `zone === 'grass'`
branch: two `mottle()` passes, a `chicagoLoop` path network stroked at
`lineWidth 9`, a central plaza disc at radius `min(hw,hd) * 0.20` with a
`#5f91a3` inner pool. Painted paths on painted grass is exactly what a
board-game square looks like.

**But the assets already exist and are catalogued.** The `CIVIC_PARK` and
`STREET` sheets in `src/content/city-object-catalog.js` list `park bench`,
`memorial bench`, `hedge module`, `fence module`, `planter box`,
`gazebo pavilion`, `picnic table set`, and `playground` entries. They do not
appear on Level 1 because `CHICAGO_AREA_CATALOGS` (`src/content/archetypes.js`)
slices district 1 as `chicagoSpecific.filter(sheet === 'icon')` plus
`sharedUrban` **buildings only** — the shared `street` and `park` sheets are
round-robined to districts 2–10.

**Mechanism:** admit a named subset of the `CIVIC_PARK`/`STREET` park furniture
into Level 1's catalog slice, and bind their placement to real park features
rather than the interior scatter grid — `parkSites` already knows the block
rect, so benches go on path edges, fence/hedge modules go on the block
perimeter, planters go at path junctions. This is the `0007` reference table's
"Bind scatter to frontage, curb, park-path, and plaza-edge slots" row.

**Cost, and why it is the one item with a real budget question.** Every new
`visualId` is a new instanced group, and Level 1 sits at **59 groups against a
guard of 60** (`tech-architecture.md` §1). Admitting six furniture types would
be 65 groups — over the guard. Three ways out, in order of preference:
1. **Reuse existing groups.** A hedge is a tree archetype at a different
   scale and rotation; a fence run is repeated instances of one module. If the
   furniture can be expressed through existing `visualId`s at new transforms,
   it costs **zero** groups. This is the strongly preferred route and it is
   available because `writeInstanceMatrix` already composes arbitrary
   position/rotation/non-uniform scale per instance.
2. **Spend the one free slot plus retire an unused one.** `groupKeys` is a
   live accessor on `createInstancedWorld`; measure which Level 1 groups carry
   the fewest instances and consolidate.
3. **Raise the guard.** Only with a fresh `scripts/perf-probe.cjs` run showing
   headroom against the ≤60 mobile draw-call budget — and note the recorded
   contradiction in `00-overview.md` about which draw-call number is real.
   Do not raise it on assumption.

Also worth taking here for free: the painted `lineWidth 9` path network
(0.82 m paths) is narrow for a Grant Park promenade and the paths currently
lead nowhere. Widening them and terminating them on the plaza disc and the
block edges costs nothing but a constant.

**Deliberately not doing:** authoring new Blender furniture models — blocked
by the Blender-not-installed caveat, and unnecessary if route 1 works.

---

## R7 — Water that meets land and moves

`createCityContext` (`src/content/city-context.js`) builds one
`PlaneGeometry(rec.w, rec.d)` per water rect from `buildChicagoLoop`'s
`context.water` descriptor — `chicago-river-0`, `chicago-river-1`,
`lake-michigan-context` — at `rotation.x = -π/2`, **`position.y = -0.35`**,
`receiveShadow = false`. Material is
`waterMat = MeshStandardMaterial({ color: 0x397e9f, roughness: 0.34,
metalness: 0.05 })`, or with the photoreal tile a per-mesh clone with
`map` at `WATER_TILE_WORLD = 96` repeat and `anisotropy = 4`.

**Confirmed: there is no shoreline transition of any kind** — no beach, no
vertex blend, no alpha ramp, no depth fade. The planes sit 0.35 units below the
ground plane and stop. That 0.35-unit step at a knife-edge boundary is the
"knife-edge shoreline" precisely.

**Mechanism, in cost order:**
1. **Author the shore into the water geometry.** Replace `PlaneGeometry` with a
   subdivided plane whose edge vertices carry a darker/sandier vertex colour and
   whose edge ring rises to meet y = 0, so the join is a graded band rather than
   a step. Same mesh, same material, same draw call, `vertexColors` on the
   material. Note the multiply-only caveat from `art-direction.md` §1: vertex
   colours on a lit `MeshStandardMaterial` can only darken, so the shore band
   must be authored as a *darkening* toward wet sand/riprap, which is
   physically the right direction anyway.
2. **Move the water surface.** Either bake a shore gradient into the water tile
   texture (`assets/textures/photoreal/`, one asset edit, zero code) or animate
   the existing tile's `map.offset` per frame. Offset animation is one line in
   the frame loop, costs nothing, needs no new material, and satisfies "two
   frames a second apart differ visibly." It must be driven off a clock, not a
   frame counter, so it does not change speed with frame rate.
3. **Fake sky response** by pushing `roughness` down and letting the
   hemisphere's `#d9e7f2` sky colour do the work. `metalness: 0.05` with no
   environment map gives nothing to reflect; a lower roughness on a
   `MeshStandardMaterial` with only analytic lights produces a specular
   highlight from the sun, which is exactly the glint a lake has.

**Deliberately not doing:** planar reflections (a second render pass), a
reflection probe or `envMap` (texture memory, and the scene has one metal
surface), or a real water shader (a new material and program, and Harbor Opera
Bay's `water-plane` signature would want the same one — that is a separate,
larger piece of work to be shared across metros, not smuggled in here).

---

## R8 — Skyline silhouette

**Correction to findings item 8, which asserts roofs contribute no
silhouette:** roof geometry exists and ships. `BUILDING_ROOF`
(`propkit.js:782`) records authored deck geometry per tier — small
`{ y: 10.16, half: 3.05 }` with a 0.40-thick parapet, medium
`{ y: 28.88, half: 3.49 }`, large `{ y: 50.82, half: 4.05 }` — and
`buildingRoofCue(THREE, recipe, kind, phase)` places a per-archetype cue
(`cap`/`bar`/`mast`/`canopy`/`spire`/`box`) on that deck in the
`ROOF_CUE_CORNER = [0.55, -0.52]` quadrant, chosen because it is empty on all
three authored models. `build_props.py:371-497` authors parapet rings, slate
decks, water tanks, AC units, stair housings, masts and beacons on all three
tiers, and `art-direction.md` §1 explicitly warns: "Do not read the 'flat dark
roofs' screenshots across this workstream as missing Blender work; the roof kit
was there and occluded by a placement bug one layer up" — a bug fixed in
`094d25e`.

So the real defect is **silhouette scale**, not absence. On a large tower the
authored deck half-extent is 4.05 against the model's own footprint, the
parapet is 0.40 thick, and the tower is 50.82 tall. Against the sky at skyline
distance that furniture subtends almost nothing, and the box's top edge
dominates. Two contributors compound it: `TRIM = '#5f6b7a'` paints large roof
areas dark (see R1b), so the furniture that does exist has no value contrast
against the sky-facing deck; and `material.flatShading = true` gives each face
one constant normal, hardening every transition into a block.

**Mechanism:**
1. **Scale the roof crowns up** on the large and medium tiers — taller
   parapets, taller masts, a real stepped crown on the tower profiles that
   already claim one (`current-state.md`: "stepped tower crowns", Willis's
   "bundled-tube setbacks and twin antennas", Tribune's "taller historic
   crown"). This is geometry inside the existing merged group: **free in draw
   calls**, and `094d25e` set the precedent that a roof-cue change can be made
   exactly triangle-neutral by keeping each recipe's primitive. Verify against
   `scripts/district-object-report.js`'s `maximumActiveTriangles` the way that
   commit did.
2. **Vary crown height per group**, keyed off the existing `hashKey(key)` so it
   stays seeded and deterministic. Adjacent towers then cannot terminate in the
   same horizontal — which is the acceptance criterion, stated as geometry.
3. **Lift the roof-region colours** (R1b's `TRIM` review) so the crown reads
   against the sky at all.

**Deliberately not doing:** raising `camera.js`'s pitch range to show more
skyline (it changes gameplay framing, which `0010` owns); adding roof
geometry to the perimeter context city (`'chicago-context-rooftops'` already
exists at `y = b.h - 0.5` and the context is deliberately low-detail —
`0007` records it "should be judged from gameplay distance").

---

## R2 — One art direction (the largest item)

**The decision is made and is not re-opened here:** Level 1 keeps the
photographic facades; the props move up to meet them. Rationale, rejected
alternative, and consequences are in
[`ADR 0005`](adr/0005-level1-props-rise-to-photographic-facades.md). This
section is only the mechanism.

What currently clashes, with the actual construction:

| Prop | Construction (`propkit.js`) | Why it reads as a toy |
|---|---|---|
| Trees | `buildTree(THREE, accent, flavor)` — `'blob'` (cylinder trunk + `SphereGeometry(1.15)` crown + 0.7 tuft), `'cone'` (cylinder + two `ConeGeometry`), `'lollipop'` | Primitive silhouettes, one flat canopy colour (`#3fae4a` / `#57c256` / `#2f9e44`), fixed trunk `0x8a5a3b`, no branch or foliage break-up |
| Vehicles | `buildCar` = box body + box cabin + 4 `CylinderGeometry(…,10)` wheels at `0x141414`; `buildBus` = box + stripe + 6 wheels | Box-on-box, no glass distinction beyond `PALETTE_GLASS_TINT = '#7190a1'`, wheels are pure black cylinders |
| Pedestrians | `buildPerson` = box legs + box torso + `SphereGeometry(0.14)` head at `0xf2c89b` | Three primitives, saturated shirt tints (`#e0483a`, `#f2c230`, `#3fa9f5`, `#ff6fb3`, `#2ec8b8`) |
| Collectible blocks | `PALETTE_BASE_KINDS` bake with a **white** accent so the instance colour carries the whole body hue; the pastel palette pick supplies six accent-derived hues | Pastel candy hues by construction — this is the "candy-colored prop blocks" complaint, and it is the deliberate Hole.io-style palette from `art-direction.md` §3 |

**The three levers available, given §0.1:**
1. **Authored geometry** (`build_props.py` → `assets/models/*.js`, decoded by
   `modelkit.js`, normalised onto the procedural build's exact bounding box by
   propkit so gameplay and invariants are unaffected). Merges free into the
   existing group. **Blocked today** by the Blender-not-installed caveat —
   which makes this the long-pole task and is exactly why item 2 is last.
2. **Baked vertex colour**, including the R1b remap seam. Free, ships today,
   and is where the tree/vehicle/pedestrian palette desaturation lands.
3. **One texture map per merged kind** — the mechanism `opts.map` already
   provides for buildings, via `mergedKindGeometry`'s facade-region and
   `TRIM_UV` swatch machinery. A tree kind could carry a bark-and-foliage
   atlas the same way, at zero extra draw calls. This is the highest-value
   unblocked lever and the one to try first.

**Level-1-only gating — the mechanism that stops it leaking.** `main.js`
already gates the photoreal path on `level.authoredCity === 'chicago-loop'`
(`main.js:620, 680-681, 1333`), which is the same single flag from
`src/data/levels.js` (`n === 1 ? 'chicago-loop' : null`) that drives
`buildChicagoLoop`, `setMood`'s Chicago values, `landmarkType`, `cityPalette`,
and `groundtex`'s Chicago park treatment. **Every prop change in this item
rides that existing flag.** No new flag, no per-level override table, and the
99 other levels reach none of it by construction rather than by care. The
acceptance test is a pixel-identical Level 2 and Level 50 capture, which turns
"it must not leak" into something a screenshot proves.

**Hard constraint restated because it caps the whole item:** the collectible
props must stay instantly readable as edible. That forbids the obvious move —
desaturating and darkening the pastel collectibles toward the photographs —
because the pastel hues *are* the per-instance colour channel the edibility
value-multiply rides on (§0.3). For collectibles specifically, the available
move is **geometry and texture, not hue**: give them surface and form that read
as urban objects while leaving the palette pick and the `EDIBLE_LIFT` /
`TOO_BIG_DIM` multiplies arithmetically untouched. If the palette itself must
move, it moves by re-authoring the six accent-derived hues at equal *value*, so
the ratio is preserved by construction and can be shown to be preserved by the
same measurement `art-direction.md` §3 already documents.

**Also deliberately not doing:** the vehicle recipe cue bug.
`art-direction.md` §3 records that `hatchback` and the other vehicle recipes
position their cue off the base box rather than the finished prop — the same
family as the building bug fixed in `094d25e` — and deliberately left it
alone: 300 vehicle archetypes across 10 metros is a lot of surface for a cue
that reads as an odd roof rack. That judgement stands; this package does not
inherit it.

---

## What this package deliberately does not do, collected

- **No lighting rig change.** It cannot reach either half of item 1, and the
  current values are calibrated to +0.5% frame-mean luma so no metro's
  palette shifts (`art-direction.md` §5).
- **No tone mapping.** Measured and rejected with numbers: 0.00% clipping in
  every configuration, and AgX shrinks the edibility ratio to 1.226,
  invalidating the grayscale ladder.
- **No new material and no new instanced group** except through R6's route 1
  (reuse) or an explicitly measured budget decision.
- **No `camera.near` change**, no widening of the DOF band, no second DOF pass.
- **No change to the 99 generic levels**, enforced by riding the existing
  `authoredCity` flag rather than adding a new one.
- **No new npm dependency, no paid asset, no paid service, no hosted
  observability.**
- **No fog-density increase** to buy atmosphere; `FogExp2` has no onset and it
  would put more haze inside the play area.

## Open questions this design cannot close from the code

1. **Is R5's blue band reachable by a player?** ~~Static geometry says the
   chase camera never descends near 9 units. Settle live before spending.~~
   **ANSWERED 2026-07-30: no.** Live sweep minimum eye height 315.4u;
   analytic pull-in floor 157.7u (~70u at the theoretical smallest radius)
   against `camera.near = 20`. Closes as a capture-rig artifact; task 11
   cancelled. Evidence: `00-findings.md` addendum.
2. **Which draw-call number is real?** ~~`current-state.md` says ~390,
   `scene.js`'s comment says ~25, the desktop target is ≤150.~~ **ANSWERED
   2026-07-30: ~333 calls / ~987k tris / 114 groups** (live, auto-reset
   artifact corrected). ~390/~1.0M confirmed in substance; the ~25/205k
   comment was stale; ≤150 is already exceeded. Evidence: `00-findings.md`
   addendum.
3. **Do the black regions in `b-street.png` correspond to the `DOOR_GLASS`
   band?** ~~Strong static evidence, not confirmed on a live frame.~~
   **ANSWERED 2026-07-30: yes.** Band interior rgb(23,32,36) with zero
   luminance variance, identical across orientations — flat-swatch paint,
   not shadow. Evidence: `00-findings.md` addendum.
4. **What is the true on-screen stripe-to-car ratio?** ~~R3 does not move a
   constant until this is measured.~~ **ANSWERED 2026-07-30:** crosswalk
   stripe correct (0.57m, ~0.3 ratio vs adjacent car); indicted instead:
   `LANE_CENTRE_WIDTH` (~2x), `LANE_EDGE_WIDTH` (~1.5x), dash/gap (~3x too
   frequent), `PARKING_PITCH` (2.2m vs 6.0–6.7m real). Evidence:
   `00-findings.md` addendum.
5. **What is the base facade art's exposure?** `facade-large.png`,
   `facade-medium.png` and `facade-small.png` are **JPEGs carrying a `.png`
   extension**, so their luminance was not measured alongside the variants.
   Irrelevant to Marina (which picks variant index 1) but it means the base
   tier art may differ in exposure from the variants, and R1a's re-levelling
   should measure all four before choosing a target.

## Direction correction (2026-07-30): the reference screenshots are the target

Nico's steering, measured and recorded in `00-findings.md`'s addendum: the
bar for Level 1 is the reference set in `assets/references/`, not an
abstract "photoreal". Consequences for this design:

- **§R4 is re-aimed.** The reference sky is nearly flat and cloudless —
  paler and more drained than ours (zenith rgb(153,202,230) vs our
  rgb(35,103,223)), fading to near-white haze where ours falls to a
  near-black band (rgb(5,21,34)). Mechanism 1 stands but the direction
  inverts: lift and desaturate, do not deepen. Mechanism 2 (cloud) is
  **dropped** — the target has no cloud. The `94f5383` seam identity must be
  preserved *while the shared `skyHorizon` colour itself moves* to the pale
  value, since dome sub-horizon, `scene.background` and fog all resolve to
  it.
- **Three reference elements enter scope** as `tasks.md` tasks 22–24:
  coloured awnings + glazed shopfronts at ground floor, round leafy trees
  (re-weight to the existing blob/lollipop kinds, no new assets), and real
  traffic density (existing vehicle kinds, parked bays first). None waits on
  Blender.
- **Item 1 (brightness) is unaffected** and remains P0: our frames measure
  46% of the reference's mean luminance (54.1 vs 117.7).
