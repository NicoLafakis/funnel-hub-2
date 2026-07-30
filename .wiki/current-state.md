# Current State

**Verified:** 2026-07-28 in the current 0006 implementation worktree
**Purpose:** concise operational truth; historical findings remain evidence, not current instructions.

## Product and runtime

- Flywheel V2 is a static Three.js r185 browser game with no bundler or backend.
- The live validation surface is `https://funnel-hub-umber.vercel.app`.
- The current hero is the extruded flywheel. Earlier sphere, vortex, and flat-wheel descriptions are historical.
- The city uses seeded district generation, instanced visual groups, procedural fallbacks, a v2 localStorage save, and the 100-level campaign.
- Current touch behavior follows ADR 0003: the first active touch moves from either side, the second touch orbits, and roles remain stable until release.
- The chase camera smoothly follows avatar heading while each continuous movement gesture retains its captured yaw basis, preventing camera/steering feedback.
- Level 1 is an authored Chicago Loop pilot: a fixed orthogonal block plan,
  eastern park edge, elevated rail cue, river edges, and instanced perimeter
  skyline replace the generic layout and dead horizon for that level only.
- Its render-only background now continues the city with 454 buildings, 1,138
  trees, 62 road strips, distance-softened materials, and an eastern lakefront.
  Its near ring is capped to low-rise infill; every taller simplified mass sits
  at least two context blocks behind the playable edge, preventing foreground
  occlusion without exposing an empty grid.
- Area 1 now owns a 234-type reference-led city catalog: all 48 assets from
  the two `chicago-loop-*` sheets are exclusive to Level 1. Its 24 icon assets
  are interactive and its 24 rail assets compose the authored context; 186
  shared urban objects are distributed across Levels 2-10.
- Reference-led building profiles include four-sided window bays, storefront
  bases, rooftop plant, and stepped tower crowns; chase heading uses a 0.16s
  critically damped angular spring for continuous left/right follow velocity.
- The Blender prop pack now carries 15 building archetypes (upgraded base
  small/medium/large plus brownstone, storefront, warehouse, rowhouse, loft,
  deco, office, hotel, slab, setback, curtain, cornice) with dense roof
  furniture — capped parapets, water towers, penthouses, AC plant. Chicago
  building visualIds map per-archetype in `modelkit.js` (per-model graceful
  degradation; base pack stays all-or-nothing), and Level 1's building mix
  drops the legacy flat-box baselines in favor of the full authored roster
  (~114 instanced groups). Group/draw-call budgets are measured targets, not
  ceilings: `scripts/perf-probe.cjs` (real GPU via `--use-angle=default`)
  measures L1 at ~73-79fps avg / ~1.0M tris / ~390 calls on an Intel iGPU at
  1600×900 uncapped.
- Signature Chicago profiles override that shared recipe where identity
  matters: Willis uses bundled-tube setbacks and twin antennas, Marina City
  uses paired balcony drums, CNA keeps its red slab, Tribune gets a taller
  historic crown, and the Chicago Theatre carries a projecting marquee.
- Chicago city-object bodies now participate in the existing procedural facade
  atlas (4×5, 6×10, or 8×18 bays by tier). Oversized geometry windows remain
  only as the missing-texture fallback, so live buildings gain finer facade
  rhythm while reducing triangles and retaining one instanced draw per ID.
- The approved target frame now owns the ground palette: charcoal asphalt and
  neutral concrete supersede the historical lavender-road reference palette.
- The Loop day mood uses a dedicated brighter ambient/hemisphere fill while
  retaining its directional key, keeping masonry readable inside dense street
  canyons without changing lighting on the other 99 levels. With the
  photoreal set the fill warms further (neutral hemisphere sky, sun 1.6) and
  too-big photoreal buildings dim to 0.78 instead of 0.62 so the facade art
  survives the edibility pass; the pale blue-gray buildings at the edge of
  frame are the intentionally distance-softened render-only context, not an
  edibility tint.
- Level 1 uses 3.75× interactive tree density, weighted toward downtown
  sidewalks, to reproduce the target's continuous canopy without changing
  later Area 1 levels.
- Its elevated rail now includes steel supports, two station decks and
  canopies, and a three-car L train assembled on the authored route.
- The authored Level 1 budget preserves every tier's global mass product while
  rebalancing the visible composition from 102 vehicles/63 buildings to 74
  vehicles/194 buildings; later levels retain the global template. Level 1's
  160 small frontage pieces each carry half the former mass, preserving the
  tier's exact 756-mass product while closing more of the street wall.
- Level 1 keeps two unbuilt surface parking lots (blocks (1,1) and (3,3)):
  building site pools skip them, the final legal-slot pass rejects any
  building footprint overlapping a lot, stall paint is geometry
  (`parkingStallQuads`, appended to the road-marking mesh), and 30% of the
  car budget parks in the stalls — counts and mass untouched.
- Level 1 orders those building sites by civic hierarchy: low-rise storefront
  runs frame the opening park, medium buildings step behind them, and large
  towers occupy the outer commercial skyline. Stable block sorting preserves
  contiguous frontage runs and seeded output.
- Chicago frontage slots use the small-building party-wall module instead of
  the campaign's widest-mega-tower pitch. Medium and large buildings still
  place first and reserve their full physical parcels through shared occupancy;
  small shops then close the remaining street wall at the denser cadence.
- Chicago civic modules appear once each; repeated block frontage draws from
  architectural profiles, including corrected Tribune Tower and historic
  storefront classifications.
- Chase framing uses the approved 55° pitch/FOV 40 lens at a 17.5r standoff,
  widened from 12r after live Loop frontage occluded too much of the grid.
- The Loop's civic plaza is a compact landmark court inside a developed host
  block; neither it nor the former duplicate plaza consumes a full block of
  dead concrete.
- Level 1 uses an authored Chicago material palette: brick, buff limestone,
  concrete, blue-green glass, and restrained landmark purple for buildings,
  with a separate realistic traffic palette. Building profiles add dark
  ground-floor glazing, entrance canopies, roof parapets, plant, and vents.
- Level 1 renders with the photographic texture set
  (`assets/textures/photoreal/`, `PHOTOREAL_TEXTURES_ENABLED`): facades are
  composed at each tier's real face aspect so windows stay square, each tier
  carries a per-group variant array (5 storefront / 4 mid-rise / 4 tower
  looks, stable key-hash pick, zero extra draw calls), roof faces tile from
  a strip appended to each facade canvas (propkit `facadeRegion`, 32u tile),
  ground zones fill from photo patterns at quarter wash (open pavement and
  park paths included), and the river/lake context planes use water tiles.
  Textured building groups skip the palette multiply (`photorealFacades`).
  Generic levels keep the procedural facade bake. Tiles are generated with
  `scripts/pixellab.js` (PixelLab, key in `.pixellab`); status and known
  gaps live in `texture-map-manifest.md`.

## Verified automated baseline

`npm test` on 2026-07-28 produced:

- 223 logic checks passed;
- deterministic duplicate summaries for all 100 levels;
- all nine documented gameplay invariants pass at 100/100;
- the final-transform placement audit reports zero all-kind intersections above 0.25 world units;
- maximum-build floor at 173/300, intentionally reported as debt rather than tuned green.

The nine gameplay invariants and hard placement gate are green, and `npm test` exits zero. The separate maximum-build floor remains visible as explicit non-gating balance debt.

## Active product debt

1. **Mobile validation:** a live-only multi-touch matrix and read-only touch bot now exist but remain unexecuted until this worktree is deployed with authorization; real-device iOS/Android evidence remains open.
2. **Physical validation:** all 543 registered prop geometries and 10 landmarks use generated final-geometry bounds in the legal-slot pass and all-kind gate.
3. **Balance debt:** maximum builds remain substantially below the intended duration floor.
4. **Mobile performance:** real-device phone/tablet frame time remains unmeasured; headless `requestAnimationFrame` figures are not valid performance evidence.
5. **Mobile UI:** Nico approved all seven named surfaces on 2026-07-28. The shorter title, pause/sound controls, safe areas, mobile typography, persisted quality selector, and direct Level Complete actions are implemented; live viewport and assistive-technology evidence remains open.
6. **Desktop UX debt (proposed):** the [`0010-chicago-level1-playtest`](0010-chicago-level1-playtest/00-findings.md) package (2026-07-29) documents mouse-only menu traversal, tall-building camera occlusion, the fresh-boot intro-card skip, a static coins counter, ~13px HUD counters, untaught keyboard controls, and dark street-level reads (in tension with the Loop brightness fill noted above — revisit together). Remediation is specified in that package but not yet approved or implemented.
7. **City realism debt (findings plus proposed remediation):** the [`0011-level1-city-realism-review`](0011-level1-city-realism-review/00-overview.md) package (2026-07-29, captured live post-`c0e8568`) ranks eight illusion-breakers ahead of item 6's dark-street finding, worst first: black-cutout tall buildings, a clashing photographic-vs-cartoon art direction, oversized road markings, a flat featureless sky, a ground-plane defect visible at pedestrian eye height, board-game-flat parks, flat water, and flat roof silhouettes. The package now also carries a full `requirements.md`/`design.md`/`tasks.md`/`test-strategy.md` remediation plan plus [`ADR 0005`](0011-level1-city-realism-review/adr/0005-level1-props-rise-to-photographic-facades.md) (Level 1 props rise to meet the photographic facades). **Nothing is implemented or approved** — every look-and-feel task still needs Nico's per-element sign-off.
   **Corrected causes, do not act on the findings doc's original framing:**
   reading the code overturned the stated cause of three items. Item 1
   ("too dark", read as lighting) is actually two albedo defects — a
   facade-variant lottery landing on the darkest glass art for the tallest
   tower, and a baked near-black ground-floor paint band
   (`DOOR_GLASS = '#38495e'`, `scripts/blender/build_props.py:65`) that
   `bakeModelPart` cannot whiten for tinting — not a light-rig problem; the
   Loop rig is already brightened and three's `HemisphereLight` cannot reach
   zero irradiance. Item 3 ("streets 3x too wide") does not survive
   arithmetic: the computed street width is an ordinary 7.03m two-lane
   carriageway and the crosswalk stripe is correct; the real defects are a
   ~2x-too-wide centre line and a dash rhythm ~3x too frequent. Item 8
   ("every roof is flat") is contradicted by the code and by this page's own
   `art-direction.md` warning against exactly that misreading — roof
   geometry ships; the defect is silhouette scale at skyline distance. Full
   errata with file paths and measurements is in
   [`00-findings.md`](0011-level1-city-realism-review/00-findings.md) inline
   on each affected item.
   **Draw-call contradiction — RESOLVED 2026-07-30** (0011 Phase 0, check 4;
   full evidence in `0011`'s
   [`00-findings.md`](0011-level1-city-realism-review/00-findings.md)
   measurement addendum): this page's **~390 draw calls / ~1.0M triangles is
   confirmed in substance** — re-measured live at **333 calls / 987,291
   triangles / 163 geometries / 26 textures** at a quiet spot, with frame
   times avg 9.4–14.5ms / p95 21–28ms. `scene.js`'s "~25 draw calls / 205k
   triangles" comment was stale and is corrected. Instrumentation caveat now
   on record: with the composer enabled, `renderer.info` auto-reset makes
   naive `performanceSnapshot()` reads return `calls=1 tris=1` (the final
   fullscreen quad) — any future probe must accumulate per-frame as
   `scripts/reachability-sweep.cjs` does. Two hard consequences: the ≤150
   desktop budget is **already exceeded** (333 calls), and
   **`state.world.groupCount` is 114**, not the 59-guarded-at-60 this page
   and `tech-architecture.md` §1 record — 0011's task 12 group economy was
   re-scoped accordingly.
   **Blocking constraint carried from `art-direction.md` §1:** Blender is
   not installed on this machine, so `npm run models` cannot regenerate
   `assets/models/*.js`. This is why 0011's item-2 authored-geometry prop
   uplift (task 19) is sequenced last in that package's plan, and why its
   near-term prop-albedo fix (task 7) is a vertex-colour remap in
   `propkit.js` rather than a source-model edit.

The implementation-ready plan for items 1–5 is [`0006-mobile-readiness-and-placement/00-overview.md`](0006-mobile-readiness-and-placement/00-overview.md).

## Closed defects that should not be reopened without new evidence

- Camera/avatar steering feedback loop and unbounded angle handling.
- False-failure messaging and capstone effective-radius mismatch.
- Ground depth precision, blend-mode rejection, shadow-frustum crawl, and horizon seam.
- Missing district visual identity and direct-predecessor novelty contract.

The numbered findings packages preserve the diagnosis and measurements for these closed defects.

## Documentation precedence

When statements disagree, use this order:

1. `AGENTS.md` for non-negotiable working constraints.
2. This page for verified current status.
3. `game-design.md`, `tech-architecture.md`, `art-direction.md`, and `content-and-meta.md` for active intent.
4. Accepted ADRs for durable decisions; proposed ADRs for intended changes not yet implemented.
5. Numbered remediation/findings packages for historical evidence and implementation records.

Code remains the authority for present mechanism. If it disagrees with active intent, update the implementation and documentation together.
