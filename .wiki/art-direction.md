# V2 Art Direction

Why V1 looks empty and what replaces it. The live diagnosis (D1, D3):
props scattered on a flat colored plane, a ball for a hero, and a grid
band-aid for motion readability. The game has 10 beautiful metro identities
on paper (Harbor Metropolis, Neon District, Desert Spires…) that are
invisible in play.

**Standing direction call (2026-07-27): "premium stylized."** Nico's explicit
call for the current upgrade work: push the flat-cartoon Hole.io read toward
Monument Valley / Donut County polish — richer surface detail, real depth
cues, considered lighting — while staying explicitly NOT photoreal, NOT PBR.
This confirms rather than overturns the standing decision at
`src/content/textures.js:29` (`CITY_TEXTURES_ENABLED = false`) that quarantined
the Leonardo-generated photoreal texture set in `assets/textures/photoreal/`:
the photoreal set stays parked, and "premium" here means better-executed flat
style, not a swap to photorealism. Everything below that references "not
photorealism" is this call, stated once.

## 1. Districts, not scatter

The single biggest visual upgrade. **Levels get procedural district layouts
instead of uniform scatter:**

- **Street grid** per level (2–4 blocks visible at once): roads as dark
  strips on the ground plane with curbs, so the world has *places* — a
  plaza, an avenue, a park. Generated from a seeded RNG (same seed ⇒ same
  district, which also enables the daily challenge, see content-and-meta).
- **Zoned prop placement:** trash/bikes along sidewalks, cars/buses on
  roads, buildings on block corners facing streets, parks = dense small-prop
  clusters (the feast), the landmark on the largest plaza. Placement reads
  from the layout, not from `Math.random()`. On top of the seven template
  tiers, every district scatters the shared street-prop food chain —
  **trees** (mostly parks/plaza edges), **pedestrians** (sidewalks/plazas),
  and **street lamps** (road edges) — all spawn-edible tier-0 snacks, with
  per-metro density multipliers (`streetProps` in metros.js).
- **Spawn framing corridor:** building tiers are deterministically displaced
  from the initial chase-camera sightline behind spawn, the complete landmark
  silhouette is shifted laterally when it intersects that corridor, and seeded
  rivals begin in the forward semicircle. Facades, capstones, and fast-growing
  rivals therefore cannot fill the first gameplay frame without changing
  content budgets. Big Bell Plaza also moves its seed-specific double-decker
  overlap outside the avatar footprint while preserving every prop and mass.
- **Ground gets a texture**, not a color: the layout bakes to a canvas
  ground texture with flat cartoon mobile-game surfaces (asphalt,
  sidewalk, plaza pavers, grass — `assets/textures/`, loaded by
  `src/content/textures.js`, tiled per zone by `groundtex.js`) plus dashed
  center-line road markings per street; it falls back to procedural
  64×64 noise + tints when the images are missing. The V1 grid overlay
  dies with this; real streets do its job.
  **Rebuilt (2026-07-27) to bake entirely in WORLD units** (`groundtex.js`):
  canvas size now derives from `level.world` at a constant
  `GROUND_TEXELS_PER_UNIT` (0.55 tx/u) instead of a fixed 512px stretched
  across a world that varies 2415–4800u, so surface detail no longer reads
  at two different sizes on level 1 vs. level 100 (texel density was
  0.212–0.107, now constant 0.550 up to world ~3724, degrading toward
  0.427 only where the 2048px cap binds — texture memory 1.05MB → 6.7MB
  (L1) / 16.0MB (L100), still 1 draw call / 1 material). Zones are now
  vector-painted (real rotated rects), not raster-filled, and every ground
  class gets real surface detail instead of a flat tint: paving-slab grids
  at fixed world pitch, kerb joints and a two-tone lip, asphalt mottle,
  gutter lines, block rim shadows, grass clumps, park sand paths, sports
  courts, dashed centre lines, lane edges, parking bays, crosswalk zebras,
  manhole covers. The `block` ground class no longer exists as a distinct
  case — formerly-bare block interiors (49% of the map) now default to
  pavement. Grayscale ladder, monotonic across all ten metros, ~32% luma
  span: asphalt 0.54 < grass 0.66 < pavement 0.71 < curb 0.83 < plaza 0.87
  ≈ promenade 0.88 < lane paint 1.00 — the three light paved classes sit
  within 5% of each other in value by design (all concrete) and are told
  apart by slab pitch and a coarser course line instead. **Open, needs
  Nico:** the L100 ground texture runs ~16–22MB (`maxSize` in
  `groundTextureSize()` is the trade-off dial); see the findings doc §10
  for the full open-items roll-up.
  **Blend-mode fix and detail-tile retune (2026-07-27, `00ff4a1`):** the
  multiply-blended detail overlay was shipping without
  `premultipliedAlpha: true`, and three's `WebGLState` has no MultiplyBlending
  case in its non-premultiplied branch — it rejected the blend equation (545
  console errors per live run), fell through to NormalBlending, and with the
  tile's alpha at 255 that REPLACED the ground instead of modulating it: the
  "blown-white ground" defect was a missing boolean, not bad texture content.
  Full mechanism, evidence and the kill-list of other hypotheses live in
  `0005-ground-rendering-defect/00-findings.md`; not repeated here. Fixing it
  exposed a real aliasing defect underneath: the detail tile's finest octave
  sat at 2.02 device px/cycle, on Nyquist, so it crawled under camera motion.
  `DETAIL_TILE_WORLD` went 32 → 64 (top octave now 4.03 px/cycle, 2x margin;
  detail texel density 16 → 8 tx/u, still 19x the layout map's 0.55 tx/u),
  anisotropy went from a hardcoded `min(8, max)` to the uncapped device max
  (16 on the live build — the 8 was throwing away half the filtering for
  nothing), the detail repeat is now a whole number (`detailTileRepeat()`) so
  the tile no longer cuts mid-pattern at the plane edge, and the detail map's
  `colorSpace` moved `NoColorSpace` → `SRGBColorSpace` — the multiply lands
  in an sRGB framebuffer, so the untagged map was arriving at 0.90 against
  the authored 0.78 floor, half the intended contrast. (`groundtex.js`'s own
  comment claims the tile's mean "lands near x0.95"; measured x0.9304 —
  `GROUND_ALBEDO_SCALE` is calibrated against the measured figure, not the
  comment, so trust 0.9304 if the two are ever re-derived.)
  **Close-range detail regression CLOSED (2026-07-28, `4377c82`):** same
  three lattices, same frequencies (lattice 32/64/128, i.e. 16.1/8.06/4.03
  device px/cycle), octave weights `0.50/0.32/0.18 → 0.26/0.30/0.44` — energy
  moved off the coarse rung (reads as tonal drift) onto the finest SAFE rung
  (reads as surface), recovering 79% of the pre-moiré-fix close-range surface
  while staying strictly below the config that visibly crawled: no cycle went
  back under 4.03 device px/cycle, so this is amplitude at a safe frequency,
  not new frequency. Tile mean held to x0.9300 (0.04% drift), so
  `GROUND_ALBEDO_SCALE` did not need re-calibration. A 1024px tile plus a
  lattice-256 octave (2.02 device px/cycle, properly band-limited at that
  resolution) was built and REJECTED after live injection moved close-range
  vHF 1.181 → 1.176 — i.e. nothing — because the ground is minified ~2:1 at
  the gameplay camera and the sampler averages that octave away on mip 1
  before it ever reaches the screen. 4× the texture memory for zero. **New
  open item, accepted not fixed:** the reweight makes the anisotropic
  sampler's grazing-angle failure mode louder in amplitude (though unmoved in
  frequency) — the 4.03 px/cycle rung's surface amplitude went from 18% to
  44% of the tile, and under-motion HF rose 6% (1.816 → 1.923), likely just
  over the crawl verifier's stated bar. Flagged rather than quietly passed;
  needs a live capture under sustained motion to confirm it doesn't read as
  crawl again.
  The world also no longer ends in void: a **horizon skirt** (`RingGeometry`,
  one flat ring from `0.48*world` out to `half + fogFar`, y = -2 so it sits
  under the opaque ground plane and can't z-fight it) continues the ground
  past the map edge and lets the existing fog dissolve it. Its colour is
  sampled from the ground bake's own outer band (32×32 downsample, outermost
  ring averaged) rather than hand-picked, so it tracks any future lighting
  change for free. First pass measured: ground→skirt join improved
  271.6 → 49.0 (the commit message's claimed "34" does not independently
  reproduce — 49.0 is the number that does, and is the one to carry forward),
  but the hard edge was RELOCATED, not eliminated — a new skirt→sky edge
  measured 202.9 and filled 40–50% of frame near the map edge.
  **World-edge relocation CLOSED (2026-07-28, `4377c82`):** the fix is colour
  identity, not more geometry. Fog is now `THREE.FogExp2` at density
  `0.55/level.world` (see the atmosphere note below), and a sky dome plus a
  horizon haze ring both resolve to the same `skyHorizon` colour that the fog
  and `scene.background` use — so ground→skirt→haze→sky is one continuous
  tone match rather than three independently-authored colours meeting at hard
  boundaries. The skirt itself also shrank: its outer radius dropped from
  `world/2 + fogFar` to `world/2 + 1.25·HAZE_RUN` (`HAZE_RUN_WORLD = 0.35`),
  because past `half + HAZE_RUN` every pixel was being lit-shaded and then
  fully covered by the haze ring anyway — cutting skirt+haze frame fill from
  25.27% to 15.88%. Measured on the live deploy at minimum pitch: the flat
  grey slab that used to sit at a constant [123,125,140] and cover 36% of
  frame height is now gone entirely, and the sky-to-world channel step
  dropped 222 → 15 (−93%). Pulling fog in to fix this instead (the obvious
  alternative) was rejected on geometry, not taste: at the play bound the
  avatar is ~26 world units from the map edge, so the skirt starts at the
  player's own feet — no fog curve reaches a surface at zero distance.
  **New open item, deliberate trade:** `FogExp2` has no onset and attenuates
  from the first metre, where the old linear fog did nothing inside 2053u on
  level 1. The district reads measurably crisper at range as a result, but
  there is now a small amount of haze everywhere, including close to the
  player. Accepted because a linear fog can (and did) let the horizon read as
  a hard wall; `FogExp2` structurally cannot reach 1.0 at any finite distance,
  which is also what keeps art-direction.md §3/§4's "landmark always
  silhouette-visible" constraint true by construction rather than by tuning.
- **Buildings get facades:** the same generated set provides a facade
  per building tier (brick storefront / apartment grid / glass tower) —
  bold, flat-color reads, not photorealism.
  propkit's instancing merge keeps the facade box's side-face UVs and maps
  trim parts onto a swatch corner of the texture, so one material serves a
  whole merged building and instance-color signaling (edibility, golden)
  keeps working on top.
- **Blender prop pack:** the street-prop food chain (blob/cone/lollipop
  trees, chibi pedestrians, curved-arm lamps) and cars use authored
  low-poly Blender meshes with beveled edges, exported to
  `assets/models/*.glb` by `scripts/blender/build_props.py` and converted
  to plain JS data modules (`assets/models/*.js`) by
  `scripts/glb-to-js.js` — no glTF loader at runtime. `src/content/
  modelkit.js` decodes them; propkit normalizes each model onto the
  procedural build's exact bounding box, so gameplay/invariants are
  unaffected, and falls back to the procedural bake when the files are
  missing. Regen: `npm run models` (or
  `"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --factory-startup --python scripts/blender/build_props.py && node scripts/glb-to-js.js`).

**Acceptance:** a screenshot of any level is identifiable as "a city
district" (not "objects on a plane") by someone who has never seen the
game. Motion readability without the debug grid.

## 2. The hero — a flywheel, not a ball

**V1:** purple sphere + wireframe shell. "It was a ball" (D3, direct
player quote).

**V2 (superseded within V2, see below):** the hero shipped first as a
**ground-flush vortex disc** — a shallow concave paraboloid-lathe funnel
with a spiral-swirl GLSL, a debris stream, a ground wake, dust puffs, and
a ±3% rim pulse. That build is documented as history in
`0003-hole-feel-and-visual-fidelity/00-findings.md`.

**Current (2026-07-27):** the funnel/swirl/wake/dust stack was removed
wholesale in favor of a **procedural flat FLYWHEEL**
(`src/engine/avatar.js`, `createHoleVisual`, shared with rivals via
`src/main.js`) — four pieces, all in LOCAL units where 1.0 == the
gameplay aperture (`radius()`):
- **Aperture disc** (0 → 1.005): near-black, unlit `MeshBasicMaterial`
  in `colorA` — the visible "hole," painted flat rather than shaded.
- **Wheel body** (1.18 → 1.35): a lit annulus in `colorB`
  (`MeshStandardMaterial`, roughness 0.55 / metalness 0.35) so it takes
  the scene's sun + hemisphere fill.
- **8 spokes** (1.00 → 1.18, half-width 0.055): one merged
  `BufferGeometry` so the piece costs a single draw call regardless of
  spoke count. Shade is `colorB` darkened by `clamp(0.30 + 0.25*swirl,
  0.25, 0.85)` — `swirl` is a repurposed field (see below), no longer a
  shader input.
- **Hub collar** (1.00 → 1.06): unlit `MeshBasicMaterial` in the `ring`
  hue at `ringOpacity` — the gameplay-legible aperture edge, always
  crisp regardless of lighting.

**Update (2026-07-27, same day): the wheel is now genuinely extruded, not
flat annuli.** The body, spokes and collar are built as one-unit-tall solid
geometries and get `scale.y = worldThickness / radius` every frame — the
same divide-by-radius discipline the base heights already used — so each
piece's WORLD thickness is fixed regardless of hole size, verified
identical at r=26, r=100 and r=500. Every wall is purely radial
(`normal.y === 0`) and every top face purely +Y, so a y-only scale cannot
skew a normal: lighting is bit-identical at every hole size, with no
shading pop as the player grows. This supersedes the "wheel is flat, not
extruded" open item recorded below at first ship; see the findings doc §9
for the full before/after.

Ground-stack heights and thicknesses (world units, base divided by radius,
thickness scaled by radius per frame so the band stays fixed at any
scale): aperture disc flat at 0.30 (unextruded — still a painted disc, see
below); wheel body 0.35 → 3.35 (3.0 thick); spokes 0.35 → 2.15 (1.8 thick,
recessed so the rim proud-stands above them); hub collar 0.20 → 3.55 (3.35
thick, the tallest piece and the bore wall of the hole, running from under
the aperture disc up past the body's top face so the mouth edge is never
occluded at grazing angles). None is coplanar with the ground plane (y=0)
or the prop blob shadows (0.15). The collar is opaque rather than
depth-write-disabled now that it is a solid with real self-occlusion
(previously relied on `depthWrite:false` when it was a flat unlit ring).

Cost: 704 triangles / 4 draw calls per wheel (up from the flat build's 256
tris/4 draw calls — the extrusion adds side walls, draw-call count is
unchanged because each piece is still one mesh).

- **Motion:** idle spin at 0.6 rad/s lives on its own inner `spinner`
  group, deliberately separate from the outer group's steering-facing
  damp (`src/engine/camera.js`/`avatar.js`) so the two rotations never
  fight. 8-fold spoke symmetry repeats every ~1.31s — slow enough to
  never strobe at 30 or 60fps. No floating bob, no banking.
  `reducedMotion` calls `setSpinEnabled(false)` on the flywheel and
  freezes the growth ring's travel (see §5).
- **Identity skins** stay (V1 has 5, same ids, same export shape). Two
  fields changed meaning with the rebuild: `colorA` is the aperture
  disc, `colorB` is the wheel/spoke body, `ring`/`ringOpacity` are the
  hub collar. `swirl` is repurposed as **spoke contrast** (how dark the
  spokes read against the body) and no longer drives a shader.
- **Cost:** see the extrusion update above — 704 triangles / 4 draw
  calls per hole (was 256 tris flat; both are far below the ~1,600 tris
  + `ShaderMaterial` program + up to 46 pooled meshes the vortex funnel
  cost).

**Screen-space note, accepted not a defect:** because the chase camera
distance scales with world radius (`camera.js`, `DIST_RADIUS_MULT`),
the wheel's fixed WORLD thickness shrinks as a fraction of the ON-SCREEN
wheel diameter as the player grows — measured 4.3% of wheel diameter at
r=26 down to 0.22% at r=500. Nico reviewed this and accepted it as
physically correct: a thicker rim would need to grow faster than the
hole itself to hold a constant screen fraction, which would make big
holes look like they are wearing a bigger tire, not a bigger hole.
Record this as a decision, not an open defect.

**Open, undecided (recorded, not resolved — full open-items roll-up in
`0003-hole-feel-and-visual-fidelity/00-findings.md` §10):** the aperture
disc itself is still an unextruded flat circle, so it has no depth cue
and may read as a sticker at a distance; the 5 skins differentiate less
now that the swirl bands are gone and spoke-shade contrast is the only
per-skin cue left. Neither blocks ship; both are candidates for a
follow-up pass.

**Acceptance:** 3-playtester squint test: "what is the player character?"
should answer "a wheel/hole," not "a ball." Surfaces across the game aim
for the flat cartoon mobile-game look of the reference, not photorealism.

## 3. Readability rules (the HUD-free layer)

- **Edible glow:** edible props get a subtle edge tint in the metro accent;
  too-big props are dimmed 30%. *(Implemented via per-instance color on
  the instanced prop meshes — a true fresnel isn't possible per-instance;
  the tint reads the same at gameplay distance. Instance colors also carry
  the seeded per-metro pastel palette: buildings/vehicles bake with white
  vertex colors and each instance picks one of 6 accent-derived pastel hues,
  Hole.io-style; the edibility tint is modulated on top of that pick.)* The
  size gate becomes learnable without a tutorial (V1 has zero edibility
  signaling — you learn by bumping). **Verified as still correct
  (2026-07-27 material pass):** `EDIBLE_LIFT` (1.06) and `TOO_BIG_DIM`
  (0.62) are a scalar VALUE multiply on `tmpColor`, not a hue blend — this
  preserves hue and the per-instance palette pick while giving a
  1.71:1 grayscale-legible ratio. **That 1.71:1 is a linear-space albedo
  ratio, not what reaches the screen** — the measured RENDERED ratio (what a
  screenshot actually shows, sRGB-encoded) is **1.284:1** (`= 1.71^(1/2.2)`).
  The legibility conclusion is unaffected; this is a correction to which
  space the number is quoted in, not to the design. **Verified stable under
  the 2026-07-28 lighting rebalance (`4377c82`, §5):** rendered ratio held at
  1.284 → 1.281 across the light-rig change, because lighting is a linear
  multiplier on `material.color × instanceColor` — the edibility tint is
  baked into `instanceColor` before that multiply, so the ratio between
  edible-lifted and too-big-dimmed instances survives ANY lighting rig, not
  just this one. Record the principle: edibility signals through value,
  never hue, so it never collides with the per-metro pastel palette above
  it. **Architectural constraint, worth knowing
  before adding per-part prop materials:** only `.color` survives the
  instancing merge (`propkit.js` — vertex colors carry per-part color into
  one shared `InstancedMesh` material), so per-part metalness/roughness
  values are silently discarded and an entire merged prop kit renders with
  ONE material. Per-part material variety is not possible without
  breaking the draw-call budget (tech-architecture §1); see the findings
  doc §10 for the standing 18-vs-12-material mobile-cap gap this implies.
- **Tier silhouettes:** the 7 tiers already have distinct silhouettes;
  enforce a 1.35× size step in the prop kit and keep it sacred.
- **District vocabulary:** every metro owns 30 low-poly visual archetypes.
  Districts 2–10 reserve at least 25% of initial placements for IDs absent
  from the direct predecessor. Identity is carried by a baked cap, bar, mast,
  canopy, box, or spire profile cue plus environmental naming/placement—not
  color alone. Standard districts stay at 24 or fewer opaque prop groups.
- **Fog with intent:** V1 fog is a flat fade. V2 fog color = metro sky,
  density low enough that the *landmark is always silhouette-visible*
  (it's the goal — never hide the goal).

## 4. Metro identity that survives contact

Each metro gets **one signature visual beyond palette** (cheap, one per
metro, reused across its 10 districts):

| Metro | Signature |
|---|---|
| Harbor Metropolis | bridge silhouette on the horizon |
| Le Vieux Continent | mansard rooftops (roof kit variant) |
| Old Fog Town | real local fog banks that part as you grow |
| Neon District | emissive signs on buildings (bloom-free) |
| Desert Spires | sand drift particles at ground level |
| Coliseum City | travertine (warm) prop tinting |
| Carnival Coast | confetti bursts on tier-ups |
| Red Square Heights | snow dust + breath-fog on the lens |
| Harbor Opera Bay | water plane at the map edge with reflections faked by skybox |
| Capital Prime | the Portal Tower visible from *every* district (god-ray) |

## 5. Motion & juice budget

Everything animates or it ships broken-feeling: prop tumble-in on eat
(0.25s), shadow blob under every prop (cheap decal, not shadow maps at
this scale), one-point lighting (sun + hemisphere; no per-prop dynamic
lights). Juice discipline per V1: effects fire on events, baseline play
stays clean.

**Ground depth-bias ladder (2026-07-27, `00ff4a1`).** The ground stack
(detail grain, lane paint, prop blob-shadow decals) now carries an explicit
`polygonOffset` ladder — detail `-1`, lane paint `-2`, blob-shadow decals `-3`
(`main.js`, `instancing.js`) — instead of relying on world-unit Y offsets and
material-creation-order luck; the "held together by luck" history and the
depth-precision fix that made the ladder necessary are in tech-architecture.md
and `0005-ground-rendering-defect/00-findings.md`. That ladder sits strictly
inside the avatar's own `-2` (aperture disc) / `-6` (hub collar) `polygonOffset`
budget (`avatar.js`), which is what keeps the mouth winning over the ground
stack at every radius the game reaches. Any future ground-adjacent decal — a
new juice beat, a new zone paint, the deferred tier-up prop re-tint sweep
above — claims its own rung in this ladder rather than picking an arbitrary Y
offset.

**Blob shadow retune (2026-07-27), material pass.** Real cast shadows are
on now (findings §6), so the blob decal's own darkening was stacking a
second shadow under every prop. `instancing.js` `SHADOW_COLOR` went
0x000000 → 0x241d3a (near-black to violet) and `SHADOW_OPACITY` 0.26 →
0.18 — measured luma drop under a prop went from -0.177 to -0.099. The
hue shift is deliberate, not cosmetic: shade is lit by the sky-blue
hemisphere fill, so shadowed ground should read cooler as well as darker,
matching how the cast shadow itself renders.

**Shadow snap + lighting-rig pass (2026-07-28, `4377c82`).** Two shipped
changes and one re-derivation, all downstream of the shadow-frustum crawl
fix (tech-architecture.md §1 has the texel-grid math; this is the visual
side).

- **Lights: ambient/hemisphere/directional `0.55/0.70/0.90 → 0.12/0.85/1.55`.**
  Flat ambient was the reason flat-shaded geometry read cheap — it adds equal
  irradiance to every normal, which is pure form-destroying lift. Measured off
  a 0.5-grey probe sphere on the live build (every world normal visible at
  once, read back with `gl.readPixels`): key:fill ratio 1.31 → 1.81 and the
  sphere's tonal spread (the signal that carries FORM) up 18%. Chosen to hold
  frame mean luma to +0.5% (106.6 → 107.1) so no metro's authored palette
  shifts under it; a hotter rig (0.06/0.90/1.75) scored better on the probe
  but drifted frame mean +3% and started blowing the tops of pale facades.
  Ambient is not zeroed — 0.12 is what keeps a north-facing wall in a street
  canyon off the hemisphere's floor value; the hemisphere's warm ground bounce
  is doing the real fill work now, which is why it (not the ambient) absorbed
  most of the intensity the ambient gave up. Night keeps its existing
  day/night ratios (ambient ×0.51, sun ×0.50, hemisphere ×0.43) applied on top
  of these new day values, so night darkens by exactly as much as before.
- **`PCFSoftShadowMap → PCFShadowMap`, deliberate — not a downgrade.** r185
  silently swaps `PCFSoftShadowMap` for `PCFShadowMap` with a console warning
  regardless, so the setting had been a no-op for a while (the earlier note
  here recorded the mechanism and got the consequence wrong). In r185,
  `PCFShadowMap` is already five Vogel-disk samples rotated per pixel by
  interleaved gradient noise — roughly 20 filtered taps — so PCFSoft's only
  remaining effect was the warning itself. The real soft-edge dial was always
  `shadow.radius`, sitting at its default of 1 (hard) the whole time. Moved to
  3 — a ~3-device-pixel penumbra at every hole size, because a shadow texel is
  ~1 device pixel at every radius by construction (the shadow box tracks 14×
  avatar radius, the chase camera stands off 12× avatar radius, so texel size
  and camera distance scale together) — and it is free: GPU-timed
  1.848 → 1.795 ms/frame, radius 1 vs. radius 3, inside run-to-run spread.
- **`SHADOW_OPACITY` re-derived again, `0.18 → 0.12`** (`instancing.js`).
  Not a re-tune — the 0.18 above was fitted to the OLD light rig; rebalancing
  ambient/sun roughly doubles how dark a real cast shadow lands, so leaving
  0.18 in place would have recreated the exact double-darkening the
  0.26 → 0.18 change existed to remove. Measured on the live deploy (toggle
  each contributor, read back the framebuffer, multiply mean luma delta by
  frame coverage for an honest "light removed" figure): cast shadows alone
  went from removing 0.526 to 1.450 (2.8×) under the new rig. The decal's
  darkening job is over; 0.12 sizes it to the residual job only — the
  grazing-angle case where the shadow map's texel footprint is unreliable,
  and the contact edge right under a prop where `normalBias` pushes the cast
  shadow off the footprint.

**Tone mapping considered and rejected (2026-07-28, `4377c82`), with
measurement.** ACES/AgX/Neutral all have highlight rollover to sell; this
scene has none to give them — clipping measured 0.00% in every configuration
tried, so a tone curve can only redistribute an existing 0–182 range, not
protect a blown highlight. AgX flattens the palette (frame sd 25.6 → 23.7,
saturation 0.289 → 0.230) and shrinks the rendered edibility ratio to 1.226,
which would invalidate the per-metro grayscale ladder §3 calibrates
luma-by-luma. Worth recording explicitly: tone mapping is the obvious "make
it look expensive" lever, and it is wrong here for a specific, measured
reason, not a taste call.

**The eat→grow loop (2026-07-27).** After the clutter purge the loop had
a 2%/80ms scale pop for an eat and *nothing at all* for growth. Three
beats now mark it, all discrete, none ambient, all hero-local — no
camera shake, no bloom, nothing drawn over the world:

| Beat | Effect | Scaling | Cost |
|---|---|---|---|
| Eat | 3.5% / 110ms ease-out scale pop (`avatar.js`) | proportional (scales the hero group) | 0 tris, 0 draw calls |
| Eat | 130ms rim impulse: the hub collar lerps 55% toward white and to full opacity, quadratic decay (`createHoleVisual.flashRim`) | colour only — the collar's radius stays exactly `radius()`, so it never lies about the size gate | 0 tris, 0 draw calls |
| **Tier-up** | growth shockwave: a thin ring sweeping local 1.10 → 2.40 over 500ms, fading quadratically, in the skin's `ring` hue (`src/engine/effects.js`) | local units under the radius-scaled avatar group ⇒ identical read at r=26 and r=500; ground height divides by radius like the flywheel stack | 96 tris, +1 draw call **while playing only** (pooled ×3, `visible=false` at rest ⇒ 0) |
| Eat (HUD) | aggregated **"+N" mass float** rising 46px over 750ms — **one per FRAME carrying the frame's total award at the centroid of everything eaten**, never one per prop | screen-space; the aggregation rule is what bounds it, not radius | DOM, pooled ×6, 0 GPU |
| Eat (HUD) | **score-bar sheen** travelling across `#scorefill` while mass comes in, held by a 350ms decaying poke so continuous feeding keeps it alive rather than restarting it every frame | screen-space | one CSS pseudo-element, class toggled on an edge only |
| **Rival tier-up** | growth ring in the rival's archetype hue, **subordinate on three axes at once**: opacity 0.26 (vs 0.55), reach 1.85 (vs 2.40), duration 340ms (vs 500ms) | same local-unit construction under `rival.object3D` | 96 tris, +1 draw call while playing (pooled ×2 per rival) |

The tier-up trigger is the **Size N pill's own ladder** (main.js, the
1–15 readout) — the visual beat and the number the player reads are the
same event by construction. It also punches the pill (420ms CSS kick)
and plays `Audio.grow()`, which existed in audio.js and had never been
called. Downward crossings (mercy/twist radius caps) deliberately do not
fire; shrinking is not a reward.

**Audio.** `Audio.grow()` existed and was called from nowhere. It now
carries the tier-up and was rebuilt to match: a rising 3-note triangle
major triad over ~280ms on a low sine body. Four axes of separation from
`chainPing` (waveform, note count, envelope length, bass component), which
fires far more often and sits in the same register.

**Rival ring concurrency — the worst case is a constant.** All rivals
share ONE `createRingBudget` (`effects.js`): max 2 concurrent rival rings
across the whole level, plus a 0.35s lockout after any *player* tier-up
during which every rival claim is refused. A refused claim is DROPPED, not
queued — a growth mark is a "right now" signal. Measured worst cases:
3 rivals tiering up on the same frame ⇒ 2 fire, 1 dropped (192 tris,
2 draw calls); player + 3 rivals on the same frame ⇒ **1 ring total**
(96 tris, 1 draw call), because the lockout refuses all three. Absolute
ceiling with no lockout active: 3 rings / 288 tris / 3 draw calls.
`reset()` releases claimed slots, so a teardown mid-ring cannot leak a
slot and silently starve every later rival mark.

**Recorded forward move (not built, deferred by choice):** the *tier-up
prop re-tint sweep* — on crossing a tier, props that just became edible
flash their edibility tint for ~400ms, turning an abstract "Size 7" into
"*those* are food now". Rated the highest gameplay value on the effects
menu and deferred only because it drives the per-instance colour buffer
(`instancing.js` / `propkit.js`), which was under concurrent edit. The
seam is `main.js`'s tier-up branch, NOT `effects.js` — see that module's
header.

Why these and not more: the reference (`assets/references/holeio/`)
keeps consumption feedback *inside or immediately around the aperture*
and puts the rest in the HUD — that containment, not the effect count,
is why it never reads as noise. The ring starts under the wheel body
(y=0.24, below every flywheel piece) so it emerges from beneath the hole
rather than being pasted over it, and its inner edge never crosses back
inside the aperture, so the mouth edge and the props around it stay
fully legible.
