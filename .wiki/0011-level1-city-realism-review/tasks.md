# 0011 — Remediation Tasks

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

5. **R1a — re-expose the dark-glass facade art** †. Lift
   `facade-large-glass-dark.png` in `assets/textures/photoreal/` so the tallest
   towers show their windows, keeping it the darkest of the four large-tier
   variants. Measure all four variants first (including the three base tier
   files that are JPEGs carrying a `.png` extension, per `design.md` open
   question 5) so the target is chosen against real numbers.
   *Depends on:* nothing. *Evidence:* before/after pair at the fixed
   `g-skyline` camera; the tower's window grid countable in the after shot.
6. **R1a — restore the Chicago identity colours on textured groups** †. Add the
   bounded exception at `src/engine/instancing.js:326-327` so
   `CHICAGO_IDENTITY_COLORS[visualId]` still applies to textured Chicago groups
   while the pastel palette pick stays skipped. Scoped to ids present in that
   table and to `photorealFacades === true`, so it cannot reach the 99 generic
   levels. *Depends on:* task 5 (so the two changes are evaluated in order, not
   as one indistinguishable diff). *Evidence:* before/after at `g-skyline` and
   `f-vista`; Willis, CNA, Marina, Wrigley, Tribune and the Theatre visibly
   differentiated; Level 2 and Level 50 captures pixel-identical.
7. **R1b — lift the ground-floor and roof-trim albedo** †. Route A from
   `design.md`: a bounded vertex-colour remap in `propkit.js` `bakeModelPart`
   keyed on the exact authored linear triples for `DOOR_GLASS` (`#38495e`) and
   `TRIM` (`#5f6b7a`), lifting them toward the range the procedural fallback
   already uses for the same job. Pure JS, ships without Blender, reversible in
   one line. *Depends on:* task 1. *Evidence:* before/after at `b-street`,
   `d-intersection` and `j-elevated-rail`; no building ground floor is a
   featureless black band; `npm test` green.
   *Follow-up, not blocking:* file the same fix in
   `scripts/blender/build_props.py` for whenever a machine with Blender is
   available, then delete the remap.
8. **R4 — lighten and drain the sky** † *(re-aimed 2026-07-30)*. The
   reference sky is nearly flat and cloudless — pale, drained blue at the
   zenith (measured rgb(153,202,230) against ours at rgb(35,103,223)) fading
   toward near-white haze at the horizon, where ours brightens to
   rgb(84,144,250) and then drops to a near-black sub-horizon band
   rgb(5,21,34). So: lift and desaturate `skyZenith` (much less than the old
   "deepen" plan — the reference is flatter than our dome), push the
   near-horizon band toward the reference's pale haze, and re-aim
   `skyHorizon` itself at the pale value — the `94f5383` identity between
   dome sub-horizon, `scene.background` and fog colour must be *preserved
   while the shared colour changes*, since all three resolve to
   `skyHorizon`. Raise the dome's latitude segment count from 12 so the ramp
   stops reading as bands. *Depends on:* nothing.
   *Evidence:* before/after at `h-far-horizon` and `f-vista`; the zenith and
   horizon values re-measured against the reference numbers above; the
   horizon-seam measurement re-run and still in its 1–3 target band; a fixed
   `f-vista` capture confirming the furthest in-play building is still crisp
   (`NR4`).
9. ~~**R4 — cloud on the existing dome**~~ **DROPPED (2026-07-30).** The
   reference sky is cloudless; adding cloud would move *away* from the
   target. The `design.md` §R4 mechanism-2 notes stand as the record of the
   considered approach.
10. **R3 — correct the road-marking rhythm and gauge** †. Move exactly the
    four constants the Phase-0 measurement indicted, in
    `src/content/groundtex.js`: `LANE_CENTRE_WIDTH` (3.0 → ~1.5),
    `LANE_EDGE_WIDTH` (2.2 → ~1.6), the dash/gap pair (14/12 → a real ~1:3
    rhythm at scale), `PARKING_PITCH` (24 → ~66). The crosswalk band stays as
    authored (measured correct). *Depends on:* nothing (task 3 done).
    *Evidence:* before/after at `d-intersection` and `j-elevated-rail`, with the
    stripe visibly narrower than a car; `MIN_STREET_FOR_MARKINGS = 26` and
    `MIN_STREET_FOR_PARKING = 52` still satisfied at every street width the
    100-level campaign generates (these constants are shared, so run the full
    campaign, not just Level 1); `npm test` green at 100/100.
11. ~~**R5 — close the ground-plane clip**~~ **CANCELLED (2026-07-30).**
    Phase-0 check 2 proved no reachable camera configuration comes within an
    order of magnitude of the eye height where the band appears (measured
    minimum 315.4u live; analytic floor 157.7u at pitch-min / ~70u at the
    theoretical smallest radius, against `camera.near = 20`). The
    `b-street.png` band was a review-rig artifact at ~9u eye height. No fix
    is warranted; the geometry notes in `design.md` §R5 stand as the record.

## Phase B — items 6, 7, 8

12. **R6 — park furniture from the existing catalog** †. Admit a named subset
    of the `CIVIC_PARK`/`STREET` furniture (bench, hedge, fence, planter) into
    Level 1's `CHICAGO_AREA_CATALOGS` district-1 slice, and bind placement to
    real park features via `parkSites` — benches on path edges, fence and hedge
    runs on the block perimeter, planters at path junctions. **Prefer expressing
    the furniture through existing `visualId`s at new transforms (zero new
    groups) before spending a group.** *Depends on:* nothing (task 4 done —
    but note the baseline measured **114 groups**, not the 59/60 the plan
    assumed; the group economy must be re-derived before spending any).
    *Evidence:* before/after at `e-park`; a visible boundary and recognisable
    furniture; `groupCount` re-measured with an explicit decision about what
    the real guard is (the recorded 60-guard premise is stale at 114);
    `npm test` green with zero placement penetrations; seeded determinism
    preserved.
13. **R6 — widen and terminate the painted park paths** †. In `groundtex.js`'s
    `zone === 'grass'` branch, widen the `lineWidth 9` path network toward a
    real promenade and terminate paths on the plaza disc and block edges rather
    than crossing empty grass. *Depends on:* task 12 (so paths and furniture are
    composed together, not twice). *Evidence:* before/after at `e-park`.
14. **R7 — animate and re-surface the water** †. Drive the water tile's
    `map.offset` from a clock (not a frame counter) in the frame loop, and lower
    `waterMat` roughness so the sun produces a real glint against the
    hemisphere's `#d9e7f2` sky. `src/content/city-context.js`.
    *Depends on:* nothing. *Evidence:* two captures a second apart at
    `h-far-horizon` differing visibly on the water; no new material or draw
    call against task 4's baseline.
15. **R7 — author the shoreline transition** †. Replace the water rects'
    `PlaneGeometry` with a subdivided plane whose edge ring rises toward y = 0
    and carries a darker wet-shore vertex colour. Note that vertex colours on a
    lit `MeshStandardMaterial` are a multiply and can only darken — author the
    shore as a darkening toward wet sand or riprap, which is the physically
    correct direction. *Depends on:* task 14. *Evidence:* before/after at
    `e-park` and `h-far-horizon`; the land-to-water join is no longer a single
    hard line; same mesh count, same material count.
16. **R8 — scale up the roof crowns** †. Enlarge parapets, masts and stepped
    crowns on the medium and large tiers so the furniture that already exists
    reads at skyline distance, and vary crown height per group off the existing
    `hashKey(key)` so adjacent towers cannot terminate in the same horizontal.
    Keep each recipe's primitive so the change stays triangle-neutral, the way
    `094d25e` did. *Depends on:* task 7 (roof trim must be light enough to read
    against sky first). *Evidence:* before/after at `f-vista` and `g-skyline`
    with countable distinct building tops;
    `node scripts/district-object-report.js` `maximumActiveTriangles` at or
    below its pre-change value; `npm test` green.

## Phase C — item 2 (largest, slowest)

Sequenced last because its highest-value lever is authored geometry, and
`npm run models` cannot run on this machine (`art-direction.md` §1 — Blender not
installed). The two unblocked levers come first so the item ships value before
the toolchain arrives.

17. **R2 — prop texture maps** †. Give the tree, vehicle and pedestrian merged
    kinds one texture map each via the `opts.map` /
    `mergedKindGeometry` / `TRIM_UV` machinery the buildings already use — bark
    and foliage, vehicle body and glass, clothing — at **zero extra draw
    calls**. Level-1-only, riding `level.authoredCity === 'chicago-loop'`.
    *Depends on:* tasks 5–7 (the level's albedo must be settled before props are
    matched to it). *Evidence:* before/after at `c-block`, `b-street` and
    `e-park`; Level 2 and Level 50 captures pixel-identical; draw calls and
    material count unchanged; edibility brightness ratio measured and unchanged.
18. **R2 — desaturate the non-collectible prop palette for Level 1** †. Move
    the tree canopy, vehicle body and pedestrian shirt base colours toward the
    photographic set's range, in the baked vertex-colour path only.
    **Collectible props are excluded from this task** — their hues occupy the
    per-instance channel the edibility signal rides on. *Depends on:* task 17.
    *Evidence:* before/after in every gameplay framing; edibility ratio measured
    and unchanged from baseline; a greyscale capture still separating edible from
    too-big; Level 2 and Level 50 pixel-identical.
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

## Standing close-out

20. **Re-capture the full ten-shot review set** at the same cameras, viewport
    and seed as the baseline, archive it beside the 0011 set, and re-score
    street level and high-camera reads against the findings' 4/10 and 7/10.
    Update this package's status line to "implemented" with evidence links.
21. **Update the wiki in the same change.** `art-direction.md`'s Level-1-only
    direction update must name props as in-scope (per
    [`ADR 0005`](adr/0005-level1-props-rise-to-photographic-facades.md)'s
    consequences); `current-state.md` item 7 moves from "findings only" to the
    implemented record with its measurements; `INDEX.md`'s 0011 entry moves out
    of "Playtest findings and proposed remediation" into "Implemented
    remediation records"; `0007`'s reference-comparison table gets the
    *Open space*, *Roads*, *Architecture* and *Grounding* rows marked against
    what this pass actually closed.

## Phase B+ — the reference's street level (added 2026-07-30)

Named by the direction correction: the reference frames carry three things
the original plan never listed. None of them waits on Blender — they are
texture/geometry-content work in pipelines that already exist (the PixelLab
set already carries 26 generated textures; the tree/vehicle kinds already
exist as merged groups, including `street_tree_blob` and
`street_tree_lollipop`). Sequence after Phase A (the albedo must be settled
before street-level dressing is matched to it) and interleave with Phase B
by dependency.

22. **Coloured awnings + glazed shopfronts at ground floor** †. The
    reference's storefronts have striped fabric awnings (teal/white,
    red/white, green) and glass shopfront glazing where ours has the flat
    `DOOR_GLASS` band. Mechanism to be designed at implementation time, but
    the cheap route rides task 7's remap: once the ground-floor band samples
    something other than the flat swatch, give it an authored
    shopfront/awning strip texture via the same facade-map machinery the
    buildings already use (one map per group, no new draw call). Level-1-only
    gate. *Depends on:* task 7. *Evidence:* before/after at `b-street` and
    `c-block`; ground floors read as shops, not bands; group/draw-call
    counts unchanged.
23. **Round leafy trees, not conifers** †. The reference canopy is round and
    leafy; our street mix leans on `street_tree_cone`. The round kinds
    (`street_tree_blob`, `street_tree_lollipop`) already exist as live
    groups, so this is a placement-weight data change, not new assets:
    re-weight Level 1's tree pick toward blob/lollipop (and away from cone)
    in the seeded placement data. *Depends on:* nothing. *Evidence:*
    before/after at `e-park` and `d-intersection`; seeded determinism
    preserved; `npm test` green; Level 2 and Level 50 pixel-identical.
24. **Real traffic density** †. The reference carries several vehicles per
    block face, parked and moving; our streets read empty (one bus and one
    car in `c-block`). Raise Level 1's vehicle placement counts in the
    district/placement data toward the reference density, parked bays filled
    first (binds to the `PARKING_PITCH` fix in task 10). Existing vehicle
    kinds only — no new groups. *Depends on:* task 10 (bays must be real
    size before they are filled). *Evidence:* before/after at `c-block` and
    `d-intersection`; placement penetration count zero; perf re-measured
    against the 333-call / 114-group baseline.
