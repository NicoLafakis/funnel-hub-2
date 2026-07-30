# 0011 — Remediation Tasks

**Status (2026-07-30): ALL PHASES COMPLETE except task 19** (collectible
prop *geometry* uplift — blocked on Blender). Everything else is
implemented, live, and evidenced in `shots/review-r2/`.

Ordered for execution in the recorded priority order: findings items 1, 4, 3
and the item-5 defect first (highest player-visible gain per unit of work),
then 6, 7, 8, then 2 (largest and slowest — an asset-authoring effort rather
than a settings change). That order is a decision, not a re-derivation.

**Direction correction (2026-07-30, from Nico): the reference screenshots in
`assets/references/` are the target, not "photoreal".** Measured consequences
(evidence in `00-findings.md` addendum): their sky has no cloud and is nearly
flat — paler than ours, fading to near-white haze where ours fades to a
near-black band. Task 8 is re-aimed to "lighten and drain"; task 9 (clouds)
is dropped. Three reference elements the original plan never named are added
as tasks 22–24: coloured awnings + glazed shopfronts, round leafy trees,
real traffic density.

**Phase 0 is COMPLETE (2026-07-30)** — all four measurements are recorded in
`00-findings.md`'s measurement addendum. Outcomes: task 7 unblocked (band is
baked paint); task 11 CANCELLED (band unreachable by any player camera);
task 10 scoped to `LANE_CENTRE_WIDTH`, `LANE_EDGE_WIDTH`, the dash/gap pair
and `PARKING_PITCH` (crosswalk correct as authored); the budget contradiction
is resolved (real: 333 calls / 987k tris / **114 groups** — the "59 groups,
guard 60" premise is stale and every task written against it was re-read).

**Phase A is COMPLETE (2026-07-30, deployed `91eeee9`)** — tasks 5, 6, 7, 8
and 10 are implemented and live, with before/after evidence in
`shots/phase-a/` (capture script `scripts/phase-a-evidence.cjs`) and results
recorded inline on each task below. Task 9 was dropped and task 11 cancelled
per the direction correction and Phase-0 findings.

Gate: nothing marked † merges without Nico's explicit per-element approval
(working agreements, `INDEX.md`). Each task is independently shippable, lists
its dependencies, and lists its acceptance evidence — no task is done without
it. Verification is always against the live deploy
(`https://funnel-hub-umber.vercel.app/`), never localhost; method in
[`test-strategy.md`](test-strategy.md).

Standing per-task gates, from [`test-strategy.md`](test-strategy.md) §6: `npm
test` green and `npm run build` clean before any push. This repo has **no**
typecheck, lint, or format script (verified in `package.json`), so those two
are the whole automated gate set.

## Phase 0 — measurements that decide what the later tasks do ✔ COMPLETE

All four done 2026-07-30; evidence in `00-findings.md` measurement addendum.
Scripts kept for re-runs: `scripts/ref-measure.cjs` (pixel measurement),
`scripts/reachability-sweep.cjs`, `scripts/pullin-probe.cjs` (live camera
space), `scripts/perf-probe.cjs` (with the `renderer.info` auto-reset caveat
noted in the addendum).

1. **DONE — black band confirmed as baked paint** (R1b). Ground-floor band
   rgb(23,32,36) with zero luminance variance, identical across building
   orientations; consistent with `DOOR_GLASS #38495e` dimmed. Not shadow.
2. **DONE — R5's blue band is unreachable in play.** Lowest live eye height
   across pitch/radius/pull-in/transient sweep: 315.4u; analytic pull-in
   floor 157.7u (70u at theoretical minimum radius) against `camera.near =
   20`. No reachable camera reproduces the band. **Cancels task 11.**
3. **DONE — stripe-to-car ratio measured.** Crosswalk stripe correct
   (0.57m, ratio ~0.3 vs adjacent car); indicted: `LANE_CENTRE_WIDTH` (~2x),
   `LANE_EDGE_WIDTH` (~1.5x), dash/gap 14/12 (~3x too frequent),
   `PARKING_PITCH` (2.2m vs real 6.0–6.7m).
4. **DONE — re-baselined.** 333 calls / 987,291 tris / 163 geom / 26 tex /
   **114 groups**; frame avg 9.4–14.5ms, p95 21–28ms. `scene.js:159`'s
   "~25 calls / 205k tris" comment was stale (corrected); ≤150 desktop
   budget is exceeded at 333 — no headroom exists for new passes.

## Phase A — items 1, 4, 3, 5 (the P0 batch)

5. **DONE (2026-07-30) — R1a re-exposed the dark-glass facade art.** All
   four large variants measured first (`scripts/facade-exposure.cjs`:
   117.3 / 185.5 / **40.2** / 45.2 — and the three base tier files are
   confirmed JPEGs with `.png` extensions, closing design open question 5).
   `facade-large-glass-dark.png` lifted gamma 1.882, mean 40.2 → 92.2 —
   windows countable, still the darkest variant. *Live evidence
   (`shots/phase-a/g-skyline.png` vs review):* Marina face rgb(3,5,8) →
   rgb(23,32,38); window grid countable at native res on the shade side.
   Remaining shade-side darkness is irradiance, not albedo — mechanism 3
   (`TOO_BIG_DIM_TEXTURED` for the tallest tier) stays available but is not
   required and was not spent (it rides the edibility signal).
6. **DONE (2026-07-30) — R1a Chicago identity colours restored on textured
   groups.** Bounded exception at `src/engine/instancing.js`: textured groups
   whose `visualId` carries a `CHICAGO_IDENTITY_COLORS` entry (new
   `propkit.chicagoIdentityColor` export) get that authored colour as a
   multiply softened 0.4 toward white (`IDENTITY_TINT_SOFTEN`), instead of
   the blanket skip. *Level 2/50 pixel-identical by construction, not just by
   capture:* the exception requires `photorealFacades && group.facadeMap &&
   CHICAGO_IDENTITY_COLORS[visualId]`; `photorealFacades` requires
   `authoredCity === 'chicago-loop'` (Level 1 only, `levels.js:275`), so the
   multiply cannot fire on any generic level. CNA red and the named-tower
   differentiation read in `shots/phase-a/f-vista.png` / `g-skyline.png`.
7. **DONE (2026-07-30) — R1b ground-floor and roof-trim albedo lifted.**
   Route A landed: `propkit.js` `bakeModelPart` remaps the exact authored
   linear triples (`AUTHORED_BAND_LIFT`) — `DOOR_GLASS #38495e` →
   `PALETTE_GLASS_TINT #7190a1`, `TRIM #5f6b7a` → `PALETTE_TRIM_TINT
   #72777a`, keyed with a 0.004/channel tolerance so nothing else can match.
   Source fix also filed in `scripts/blender/build_props.py` (with the remap
   tagged for deletion after the next Blender regen). *Live evidence
   (`shots/phase-a/b-street.png`):* ground floors read as detailed
   bases/shopfronts, not featureless black bands; `npm test` green.
8. **DONE (2026-07-30) — R4 sky lightened and drained** *(re-aimed
   2026-07-30)*. Explicit measured targets gated on `authoredCity ===
   'chicago-loop' && !night` in `main.js`: zenith `#99cae6` (reference
   rgb(153,202,230)), horizon haze `#d6e4f0`; dome latitude segments 12 → 24
   gated the same way, so the 99 generic levels are byte-identical. The
   `94f5383` identity holds: background, fog, skirt and dome sub-horizon all
   still resolve to the one `skyHorizon` — the shared colour moved, the
   binding did not. *Live evidence (`shots/phase-a/h-far-horizon.png`,
   `f-vista.png`):* pale drained sky, near-white haze at the horizon where
   the old build fell to a near-black band; dome mid-band measured
   rgb(97,159,205) against the old rgb(35,103,223); furthest in-play
   buildings still crisp (fog density untouched, `NR4`).
9. ~~**R4 — cloud on the existing dome**~~ **DROPPED (2026-07-30).** The
   reference sky is cloudless; adding cloud would move *away* from the
   target. The `design.md` §R4 mechanism-2 notes stand as the record of the
   considered approach.
10. **DONE (2026-07-30) — R3 road-marking rhythm and gauge corrected.**
    Exactly the four measured constants moved in `src/content/groundtex.js`:
    `LANE_CENTRE_WIDTH` 3.0 → 1.5 (0.14m), `LANE_EDGE_WIDTH` 2.2 → 1.6
    (0.145m), dash/gap 14/12 → `CENTRE_DASH`/`CENTRE_GAP` 24/72 (real 1:3
    rhythm, 2.2m dash), `PARKING_PITCH` 24 → 66 (6.0m bays). Crosswalk band
    untouched (measured correct). *Evidence:* `shots/phase-a/d-intersection.png`
    — stripe visibly narrower than vehicles, real dash rhythm; full 100-level
    campaign green (`npm test` — invariants + placement audit, zero
    penetrations); `MIN_STREET_FOR_MARKINGS`/`MIN_STREET_FOR_PARKING`
    untouched.
11. ~~**R5 — close the ground-plane clip**~~ **CANCELLED (2026-07-30).**
    Phase-0 check 2 proved no reachable camera configuration comes within an
    order of magnitude of the eye height where the band appears (measured
    minimum 315.4u live; analytic floor 157.7u at pitch-min / ~70u at the
    theoretical smallest radius, against `camera.near = 20`). The
    `b-street.png` band was a review-rig artifact at ~9u eye height. No fix
    is warranted; the geometry notes in `design.md` §R5 stand as the record.

## Phase B — items 6, 7, 8 ✔ COMPLETE (2026-07-30)

12. **DONE (2026-07-30) — R6 park furniture.** `D1_PARK_FURNITURE_IDS`
    (picnic table set / hedge / fence / planter) admitted into district 1's
    slice; new `parkFurnitureSites` pool binds hedge/fence runs to the block
    perimeter, picnic sets to promenade edges, planters to the plaza-disc
    ring; role tags ride the site into a dedicated visual binding. Learned
    and recorded: `park bench` classifies building-small (its name matches
    the /park/ module rule first), so the bike-kind bench slot went to the
    picnic table set. +3 groups (114 → 117, against the stale 60-guard
    premise; the ≤130 guard holds). `npm test` green, zero penetrations,
    determinism preserved.
13. **DONE (2026-07-30) — R6 promenade paths.** The 9u # grid is now a 20u
    promenade cross with 10u secondaries that terminate on the promenade
    and block edges.
14. **DONE (2026-07-30) — R7 water motion + glint.** `map.offset` drifts
    from a clock (`state.waterMats`, frame loop); roughness 0.34 → 0.12;
    plus an exposure lift of the two water tiles (lake 69.6 → 140, river
    55.2 → 120) after the reference-vs-capture gap measured ~10×. Two
    captures 1s apart differ on 1.96% of frame pixels; no new material or
    draw call.
15. **DONE (2026-07-30) — R7 shoreline.** Water planes are subdivided;
    the edge ring rises toward y=0 and darkens toward wet sand through
    vertex colours (multiply-only, the physically correct direction).
16. **DONE (2026-07-30) — R8 roof crowns.** Medium/large cues ×1.55
    (crownTier) plus ±40% per-group height variance off the seeded
    visualId hash (crownVar); primitives unchanged (triangle-neutral,
    094d25e precedent); committed bounds regenerated; `npm test` green.

## Phase C — item 2 (largest, slowest)

Sequenced last because its highest-value lever is authored geometry, and
`npm run models` cannot run on this machine (`art-direction.md` §1 — Blender not
installed). The two unblocked levers come first so the item ships value before
the toolchain arrives.

17. **DONE (2026-07-30) — R2 prop texture maps.** Each merged tree/car/bus/
    person kind carries one procedurally baked near-white detail atlas
    (`bakePropDetailAtlas`, `PROP_ATLAS_REGIONS` in textures.js) through a
    NEW `opts.detailMap` path — deliberately not the facade map, so the
    palette skip and the textured edibility dim (both keyed on `facadeMap`)
    are untouched; untagged parts sample the white swatch (identity
    multiply). Level-1-only via the photoreal gate; zero new draw calls.
    Edibility multiplies run on top unchanged (near-white map).
18. **DONE (2026-07-30) — R2 palette desaturation.** The tagged parts' base
    colours lerp 0.35 toward their own luminance when the atlas is present
    (value-preserving → edibility ratio arithmetically unchanged), and
    `CHICAGO_VEHICLE_PALETTE` muted toward the photographic range
    (Level-1-only by construction). Collectible palette picks untouched.
19. **R2 — collectible prop form uplift** † *(blocked on Blender)*. Give the
    collectible blocks and the tree/vehicle/pedestrian kits authored geometry
    with real surface and form, normalised onto the procedural build's exact
    bounding box by propkit so gameplay and invariants are unaffected. **Hue
    untouched** — geometry and texture only, so the edibility value multiply is
    arithmetically unchanged. *Depends on:* task 18 **and** access to a machine
    with Blender. *Evidence:* before/after in every gameplay framing; a viewer
    cannot pick out which objects came from a different game; edibility ratio
    unchanged; the 1.35× tier size step preserved; `npm test` green with zero
    placement penetrations (authored geometry changes physical bounds — re-run
    `npm run bounds` and the all-kind gate).

## Phase B+ — the reference's street level ✔ COMPLETE (2026-07-30)

Named by the direction correction: the reference frames carry three things
the original plan never listed. None waited on Blender.

22. **DONE (2026-07-30) — awnings + glazed shopfronts.** `bakePhotorealFacade`
    paints a shopfront strip (striped awning segments over mullioned glazing
    with a centred entrance) into the roof strip's dead texel area
    (`region.shop`); `bakeModelPart` maps the exact-DOOR_GLASS vertices into
    it by face position and band height, vertex-white. Untextured groups and
    generic levels keep the task-7 lifted colour on the swatch. No new draw
    call or material.
23. **DONE (2026-07-30) — round leafy trees.** Level 1's street-tree pick
    re-weighted to blob 45 / lollipop 45 / cone 10 on the seeded `rngStreet`
    stream; determinism preserved; `npm test` green.
24. **DONE (2026-07-30) — real traffic density.** Traffic 74 → 107 vehicles
    at the same tier mass (car 50×10.8 → 75×7.2, bus 24×28 → 32×21), and
    Chicago car placement went parked-first (roads 0.45 / stalls 0.45 /
    sidewalk 0.10) — the i-parking capture shows full stall rows. Placement
    audit: zero penetrations.

## Standing close-out

20. **DONE (2026-07-30) — ten-shot re-capture and re-score.** The full set
    re-captured live post-implementation (`shots/review-r2/`, via
    `scripts/phase-a-evidence.cjs`, same viewport and seed family as the
    baseline; the original rig's exact poses were not recoverable, so the
    framings approximate the review set). Re-score against the findings'
    4/10 street / 7/10 high-camera: street level now reads ~**6.5–7/10**
    (shopfront awnings, glazing, real marking gauge, traffic, park
    furniture — shade-side darkness remains the biggest tell); high camera
    ~**8.5/10** (pale sky with white horizon haze, teal moving water,
    varied roof crowns, promenade parks). Package status moves to
    implemented except task 19 (Blender-blocked).
21. **DONE (2026-07-30) — wiki updated in the same change.**
    `art-direction.md` records the props-in-scope extension as implemented;
    `current-state.md` item 8 (was "findings only") is the implemented
    record with measurements; `INDEX.md` moved 0011 into "Implemented
    remediation records"; `0007`'s reference table rows *Open space*,
    *Roads*, *Vehicles*, *Architecture* and *Grounding* are marked closed
    (*Street life* partially — pedestrians await task 19).
