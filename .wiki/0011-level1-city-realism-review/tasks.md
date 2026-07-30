# 0011 — Remediation Tasks

Ordered for execution in the recorded priority order: findings items 1, 4, 3
and the item-5 defect first (highest player-visible gain per unit of work),
then 6, 7, 8, then 2 (largest and slowest — an asset-authoring effort rather
than a settings change). That order is a decision, not a re-derivation.

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

## Phase 0 — measurements that decide what the later tasks do

These carry no look-and-feel risk and unblock four later tasks. Do them first;
three of them can invalidate a planned edit.

1. **Confirm the ground-floor black band on a live frame** (R1b). Capture the
   fixed `b-street` and `d-intersection` cameras, sample the black regions, and
   confirm they correspond to the `DOOR_GLASS = '#38495e'` band (bottom
   0–24% of small models, 0–8% of medium/large) rather than to cast shadow.
   *Blocks:* task 3. *Evidence:* annotated crop plus sampled sRGB values
   appended to `00-findings.md`.
2. **Settle whether R5's blue band is reachable in play.** Sweep the reachable
   camera space — pitch across the 35°–55° range, avatar radius from spawn to
   the cap, and the `camera.js` obstacle pull-in — and record the lowest eye
   height any of them produces against the 20-unit `camera.near`.
   *Blocks:* task 6. *Evidence:* a table of eye height per configuration, plus
   either a reproducing screenshot (item stays open) or the proof that none
   reproduces (item closes as unreachable, and task 6 is cancelled).
3. **Measure the on-screen stripe-to-car ratio** (R3). At the fixed
   `d-intersection` camera, measure in pixels the widest painted stripe and the
   narrowest car beside it. Also measure a pedestrian's height against the
   crosswalk band. *Blocks:* task 5. *Evidence:* pixel measurements recorded in
   this package; the ratio names which constant moves, in `groundtex.js` or in
   `propkit.js`'s render-scale table — no constant moves before this exists.
4. **Re-baseline draw calls, triangles, and instanced groups.** Run
   `node scripts/perf-probe.cjs` against the live URL and record `calls`,
   `triangles`, `groupCount`, and `groupKeys`. This exists to settle the
   recorded contradiction between `current-state.md` (~390 calls / ~1.0M tris),
   `scene.js`'s comment (~25 / 205k), and the ≤150 desktop / ≤60 mobile
   budgets. *Blocks:* task 8's budget decision. *Evidence:* the probe output,
   plus a note in `current-state.md` reconciling or explicitly flagging the
   three figures. This is also the before-baseline every later task diffs
   against.

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
8. **R4 — sky gradient and haze band** †. Widen the `'sky-dome'` ramp in
   `main.js` `buildLevelWorld()` (deepen `skyZenith`, lift and hold the
   near-horizon haze band, replace the `sqrt` ramp) and raise the dome's
   latitude segment count from 12 so the bands stop reading as bands. The
   sub-horizon band must remain exactly `skyHorizon` — the identity that
   `94f5383` established with `scene.background` and the fog colour, and which
   the horizon-seam closure depends on. *Depends on:* nothing.
   *Evidence:* before/after at `h-far-horizon` and `f-vista`; the horizon-seam
   measurement re-run and still in its 1–3 target band; a fixed `f-vista`
   capture confirming the furthest in-play building is still crisp (`NR4`).
9. **R4 — cloud on the existing dome** †. Procedurally bake a cloud map (the
   seeded `mulberry32` noise machinery in `textures.js` is the precedent) and
   sample it on the sky dome's existing UVs, with `fog: false` and
   `toneMapped: false` like the rest of the dome. One texture, same mesh, same
   material, **no new draw call**. *Depends on:* task 8. *Evidence:* cloud
   visible at `h-far-horizon`; draw-call and material counts unchanged against
   task 4's baseline; sub-horizon band still colour-identical.
10. **R3 — correct the road-marking rhythm and gauge** †. Move only the
    constants task 3's measurement indicts, in `src/content/groundtex.js`
    (`LANE_CENTRE_WIDTH`, `LANE_EDGE_WIDTH`, the 14/12 dash-gap pair,
    `PARKING_PITCH`, `CURB_WIDTH`). *Depends on:* task 3.
    *Evidence:* before/after at `d-intersection` and `j-elevated-rail`, with the
    stripe visibly narrower than a car; `MIN_STREET_FOR_MARKINGS = 26` and
    `MIN_STREET_FOR_PARKING = 52` still satisfied at every street width the
    100-level campaign generates (these constants are shared, so run the full
    campaign, not just Level 1); `npm test` green at 100/100.
11. **R5 — close the ground-plane clip** † *(cancelled if task 2 proves it
    unreachable)*. Extend the `'horizon-skirt'` `RingGeometry` inner radius
    inward, or clamp the reachable camera height — whichever task 2's data
    indicates. Do not touch the `skirtOuter === hazeFull` binding and do not
    move `camera.near`. *Depends on:* task 2. *Evidence:* the reachable-camera
    sweep from task 2 re-run with zero frames showing a blue band beneath the
    road; horizon-seam measurement unchanged.

## Phase B — items 6, 7, 8

12. **R6 — park furniture from the existing catalog** †. Admit a named subset
    of the `CIVIC_PARK`/`STREET` furniture (bench, hedge, fence, planter) into
    Level 1's `CHICAGO_AREA_CATALOGS` district-1 slice, and bind placement to
    real park features via `parkSites` — benches on path edges, fence and hedge
    runs on the block perimeter, planters at path junctions. **Prefer expressing
    the furniture through existing `visualId`s at new transforms (zero new
    groups) before spending a group.** *Depends on:* task 4 (the budget answer).
    *Evidence:* before/after at `e-park`; a visible boundary and recognisable
    furniture; `groupCount` from `scripts/perf-probe.cjs` at or below the 60
    guard, or an explicit measured decision to raise it; `npm test` green with
    zero placement penetrations; seeded determinism preserved.
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
