# 0011 — Level 1 City Realism Review

Status: **findings recorded; Phase-0 measurements complete (see addendum);
no remediation implemented.**
Date: 2026-07-29. Evidence: `shots/l1-realism-review/` (10 screenshots,
`a-spawn.png` through `j-elevated-rail.png`), plus the 2026-07-30
measurement addendum below.

## Method

Ten screenshots of Level 1 (The Loop — Chicago) were captured live, post-
`c0e8568` (the far-field DOF re-tune that follows `5b2bf02`, see
`art-direction.md` §1). This session is a rendering/realism review, not a
persona playtest — it reads the current build directly against the "does
this look like a city" bar rather than through the three 0010 personas.

- **Target:** `https://funnel-hub-umber.vercel.app/` — the live deploy, per
  the working agreement that browser journeys use an authorized live URL,
  never localhost.
- **Viewport:** 1600×1000.
- **Seed:** stable `chicago-loop` (Level 1's fixed authored layout).
- **Console/page errors:** zero across the whole session.
- **World state at capture:** world 2415u; block zones = 17 residential /
  6 park / 2 parking; no `plaza`-zoned block present in this seed's output.
- **Shots:** `a-spawn`, `b-street`, `c-block`, `d-intersection`, `e-park`,
  `f-vista`, `g-skyline`, `h-far-horizon`, `i-parking`, `j-elevated-rail`,
  all in `shots/l1-realism-review/`.

**Capture-rig note (reusable process, recorded here since it cost time to
find):** `scripts/playtest-capture.cjs` hardcodes `http://localhost:3003/`
twice and therefore cannot serve live-URL verification; `scripts/
screenshot-city.cjs` honors `BASE_URL` and is the correct base to copy for
any future live capture driver. Level 1's 75s clock (0010 F13) fails the run
mid-session and swaps gameplay for the "Sync Failed!" overlay, so any capture
session running longer than ~75s must top `state.timer` back up to
`state.levelTime` on an interval — take the untouched-HUD shot before that
interval starts, or the HUD will show a doctored timer. The throwaway capture
script and its log used for this session are not part of the repo, and the
resulting PNGs are not checked in either: they live on disk under
`shots/l1-realism-review/` but are untracked because `shots/` is gitignored
repo-wide (same as `shots/playtest/` in the 0010 package), so anyone who
needs them must re-capture live rather than expecting them in a clone.

**Do not use for current-appearance judgment:** pre-existing on-disk shots
under `shots/` and `shots/playtest/` predate `5b2bf02`/`c0e8568` and no
longer reflect current rendering.

## Overall verdict

Reads as a city at roughly **7/10 from a high camera**; roughly **4/10 at
street level**. The urban *plan* is convincing; the *rendering* of it is
what gives it away.

## What already works — keep, do not regress

- **Block grammar holds:** streets form real blocks, buildings form a street
  wall at the sidewalk rather than floating in paved fields.
- **Height banding works:** towers cluster and step down coherently into
  low-rise.
- **Perimeter continuation works:** the city visibly continues past the
  playable square, and the lake sits on the correct bearing (+X).
- **Photographic brick-and-glass storefront facades**, seen along a street
  axis, read genuinely well (best visible in `c-block.png`).

## Ranked illusion-breakers, worst first

1. **Overall scene is too dark, and tall buildings render as flat black
   cutouts.** The tallest tower (`cityobj_chicago_marina_city_tower_pair`)
   is a solid black silhouette with no readable windows or detail
   (`g-skyline.png`); large areas of the city sit in deep shadow with
   pure-black ground floors (`b-street.png`, `d-intersection.png`,
   `j-elevated-rail.png`). Player-facing consequence: it reads as dusk with
   the sun misplaced rather than as a daytime city, and the authored facade
   art is invisible where it matters most.

   > **Errata (2026-07-29, remediation design pass):** the observation stands
   > — the tower does render near-black on screen — but "reads as dusk with
   > the sun misplaced" is the wrong cause. The Loop rig is already the
   > brightened one (`setMood`: ambient 0.26 / hemisphere 1.12 / sun 1.60,
   > `src/engine/scene.js`), and three.js `HemisphereLight` means no surface
   > in this scene can reach zero irradiance — no light-rig change can reach
   > this defect. Two real causes, both albedo: (a) a facade-variant lottery —
   > `src/engine/instancing.js:279` picks by `hashKey(key) % facadeEntry.length`,
   > and `cityobj_chicago_marina_city_tower_pair` lands on
   > `facade-large-glass-dark.png` (measured mean 40.2/255 against a sibling at
   > 185.5); because the group carries a facade map, the palette pick is
   > skipped (`instancing.js:326-327`), so `CHICAGO_IDENTITY_COLORS` is dead
   > for that tower, and `TOO_BIG_DIM_TEXTURED = 0.78` (`instancing.js:106`,
   > applied at `:535`) multiplies on top, netting ~0.12 effective albedo.
   > (b) the black ground floors are a baked paint band, not shadow:
   > `DOOR_GLASS = srgb('#38495e')` in `scripts/blender/build_props.py:65`
   > occupies the bottom 0–8% of medium/large building models and 0–24% of
   > small ones, is non-greyscale so `bakeModelPart` never whitens it for
   > tinting, and is aimed at the flat white `TRIM_UV` swatch so it receives
   > no facade art at all. This paragraph is left as-written above; treat it
   > as historical record of the observation at review time, not current
   > fact. Full mechanism in [`design.md`](design.md) §R1, remediation in
   > [`tasks.md`](tasks.md) tasks 5-7.
2. **Two art directions are in conflict.** Photographic facades stand
   directly beside cartoon conifer trees, toy low-poly cars, and pastel
   candy-colored prop blocks. Each is acceptable alone; together the eye
   stops believing either. Visible in every gameplay framing.
3. **Scale disagreement in road markings and street width.** Crosswalk bars
   and lane dashes are enormous relative to cars and pedestrians — a single
   stripe reads about as wide as a car (`d-intersection.png`,
   `j-elevated-rail.png`) — and streets read roughly 3x too wide and too
   empty. Consequence: the city reads as a scale model with oversized decals.

   > **Errata (2026-07-29, remediation design pass):** the "3x too wide" figure
   > does not survive arithmetic. `streetWidth(2415) = 77.28u` = 7.03m at the
   > canonical `WORLD_UNITS_PER_METRE = 11.0` — an ordinary two-lane street —
   > and `CURB_WIDTH = 20` (`src/content/groundtex.js:178`) is 1.8m of
   > pavement, i.e. narrow rather than wide. The crosswalk stripe — the
   > specific thing called out above as "about as wide as a car" — computes to
   > 0.57m, the top of the real-world 0.30–0.60m range, so it is correct as
   > authored. The genuine defects are narrower and in the opposite direction
   > from this item's framing: the centre line is roughly 2x too wide and the
   > dash rhythm roughly 3x too frequent. This paragraph is left as-written
   > above; treat it as historical record of the observation at review time,
   > not current fact. The remediation gates any constant change on a live
   > pixel measurement first, not on this desk estimate — see
   > [`design.md`](design.md) §R3, [`tasks.md`](tasks.md) tasks 3 and 10.
4. **The sky is a flat blue wall:** one near-uniform blue, a hard horizon
   line, no clouds, no haze gradient, no near-ground light shift. Present in
   all 10 shots. This is the single fastest "this is a video game" tell in
   the set.
5. **The ground plane visibly ends inside the frame.** At pedestrian eye
   height (~9u) a flat blue band occupies the bottom ~13% of the frame with
   a thin dark-green strip above it — background shows through beneath the
   road surface (`b-street.png`). This is a defect, not a styling issue, and
   it is in the render, not the capture path.

   > **Note (2026-07-29, remediation design pass):** the geometry cause is
   > confirmed — `camera.near = 20` (`src/engine/scene.js`) clips the finite
   > y=0 ground plane at this eye height and exposes the camera-locked sky
   > dome behind it, and the perimeter skirt's inner radius sits at 1159.2u,
   > too far out to catch the ray under the play area. But this band was
   > produced at a ~9-unit review-camera eye height, and the chase camera the
   > player actually uses sits at ~14.3x avatar radius — about 370 world units
   > at spawn, forty times higher. Whether any reachable camera configuration
   > reproduces this is unverified and is now a proof task
   > ([`tasks.md`](tasks.md) task 2) that can cancel the fix outright if no
   > reachable camera reaches it. See [`design.md`](design.md) §R5.
6. **Parks read as board-game squares:** a flat green rectangle with tan
   cross-paths and no benches, fences, railings, planting beds, or authored
   edges (`e-park.png`, `h-far-horizon.png`). This contradicts
   `art-direction.md` §1's requirement that parks be bounded civic rooms.
7. **Water is a flat dark plane with a knife-edge shoreline** — no shore
   transition, no surface movement, no reflection (`e-park.png`,
   `h-far-horizon.png`).
8. **Every roof is flat**, so the skyline silhouette against the sky is a
   row of identical rectangles and no tower reads as individual
   (`f-vista.png`, `g-skyline.png`). Roof art is painted on upward faces but
   contributes no silhouette.

   > **Errata (2026-07-29, remediation design pass):** "every roof is flat" is
   > contradicted by the code and this is already flagged as a misreading risk
   > in `art-direction.md` §1. Roof geometry exists and ships:
   > `BUILDING_ROOF`/`buildingRoofCue` (`propkit.js`) and
   > `scripts/blender/build_props.py:371-497` author parapets, decks, water
   > tanks and masts on all three building tiers. The real defect is silhouette
   > *scale* at skyline distance — the authored deck furniture subtends almost
   > nothing against a 50u-tall tower at the review camera's distance — plus
   > dark roof-trim colour (`TRIM = '#5f6b7a'`) that removes value contrast
   > against the sky. This paragraph is left as-written above; treat it as
   > historical record of the observation at review time, not current fact.
   > See [`design.md`](design.md) §R8, [`tasks.md`](tasks.md) task 16.

## Recommendation (not implemented)

Items 1, 4, and 3, plus the item-5 defect, are the highest value-per-cost —
they would move street level from ~4 to ~7 without authoring a single new
building. This is a recommendation for the next pass, not a scoped or
approved change.

---

## Measurement addendum (2026-07-30, Phase 0 of `tasks.md`)

Read-only. Two passes: reference-vs-capture pixel measurement
(`scripts/ref-measure.cjs`, sampling the PNGs through a headless-browser
canvas) and the four Phase-0 live checks (`scripts/reachability-sweep.cjs`,
`scripts/pullin-probe.cjs`, `scripts/perf-probe.cjs`; raw output in
`shots/reachability/reachability.json`). No game code was changed.

### Direction correction: the reference screenshots are the target

The target is the reference set in `assets/references/` (the
`target-in_game-graphics-*` frames, `actual-in_game-graphics-city.png`, and
the `holeio/` stills) — **not** an abstract "photoreal" bar. Consequences
recorded here so they cannot get lost:

- Their sky has **no cloud and is nearly flat** — it is simply *paler* than
  ours, and their distance fades toward near-white haze while ours fades to
  a near-black band. The sky task is therefore "lighten and drain it," and
  the planned cloud layer (`tasks.md` task 9, `design.md` §R4 mechanism 2)
  is **dropped**.
- Three things the reference has that the original plan never named:
  **coloured awnings and glazed shopfronts at ground floor**, **round leafy
  trees** (not our conifers), and **real traffic density**. All three are
  achievable in the existing pipelines (see tasks 22–24).

### Reference vs capture: the hard numbers

Global mean luminance (0–255), whole frame:

| Set | Values | Mean |
|---|---|---|
| Reference (6 frames) | 110.6, 102.5, 110.3, 115.4, 129.5, 137.9 | **117.7** |
| Ours (8 gameplay frames) | 38.1, 59.9, 43.5, 41.7, 50.3, 78.0, 47.1, 74.3 | **54.1** |

Ours renders at **46% of the reference's brightness** (~2.2× darker); even
our brightest frame (`f-vista`, 78.0) is below the darkest reference (102.5).
Item 1 remains the number-one defect, unaffected by the re-aim.

Sky gradient (sRGB, center column):

| | Zenith (y=0.05) | Toward horizon | At/below horizon |
|---|---|---|---|
| Reference (`target-bg02`) | rgb(153,202,230) pale, drained | lightens | near-white haze |
| Ours (`h-far-horizon`) | rgb(35,103,223) deep saturated | rgb(84,144,250) at y=0.45 | **near-black band rgb(5,21,34)** |

The gradients run in *opposite directions at the seam*: theirs goes pale,
ours goes near-black. Water tells the same story: reference lake
rgb(142,186,242) lum ~183; ours rgb(6,22,35) lum ~17 — 10× darker.

Crosswalk stripe vs car (scanline runs, same-depth neighbours):

- Reference (`target-city`, orig px): zebra stripe narrow dim **8px** vs
  adjacent car narrow dim **13–20px** → stripe ≈ 0.4–0.6 of car width.
- Ours (`d-intersection`): crosswalk bar narrow dim ~15px at ~2.4px/u →
  0.57m as authored (matches the §R3 desk figure, real-world correct);
  a car at the same depth would be ~50px wide → ratio ≈ 0.3. **The
  stripe-to-car ratio is not the defect** — confirming the errata on item 3.

Street level inventory (target crops at native res): striped awnings
(teal/white, red/white, green), glazed shopfronts, street trees spaced
roughly one per building bay along every sidewalk, parks with round
canopies/gazebo/fountain, dense parked and moving traffic (several cars per
block face), thin crosswalk stripes. Building palette per frame: red brick,
tan/brown, purple-lavender mid-rise, teal glass, dark-roof low-rises with
readable roof furniture — 6–8 distinct mid-light palettes.

### Phase 0 check 1 — the black ground floors are baked paint (task 1, R1b) ✔

Rect samples on the live captures (`b-street.png`):

- Right-building ground-floor band interior: **rgb(23,32,36), luminance
  range 30..30 — perfectly uniform**. A cast shadow multiplies whatever
  facade texture lies beneath and cannot erase it; a zero-variance region
  means there is no texture beneath — the band samples the flat white
  `TRIM_UV` swatch exactly as the code reading said.
- The identical value rgb(23,32,36) appears on the left-side buildings'
  dark faces — same value on different orientations, which illumination
  cannot produce from different irradiance.
- Value is consistent with `DOOR_GLASS #38495e` = rgb(56,73,94) × shade-side
  lighting × `TOO_BIG_DIM_TEXTURED 0.78`. Balcony/trim bands render
  rgb(13,9,7) down to rgb(2,2,2) (`TRIM #5f6b7a`); the hole interior (true
  black reference) measures rgb(0,1,1).

Confirmed: albedo, not shadow. Task 7's vertex-colour remap is the right
shape of fix.

### Phase 0 check 2 — R5's blue band is NOT reachable in play (task 2) ✔

Live sweep at 1600×1000 (`reachability-sweep.cjs`, `pullin-probe.cjs`),
`camera.near = 20`:

| Configuration | Eye height |
|---|---|
| Level-entry transient (3s, 120ms samples) | min 448.4u |
| A — spawn idle, pitch default 55° (r=31.4) | 450.4u |
| B — pitch min 35° (orbit drag) | 315.4u |
| C — drive-through pull-in hunt | 315.4u (no lower) |
| D — pitch max 65° | 690.4u |
| Pull-in probe, 24 positions ringing the landmark | min 315.4u |

Analytic floor, independent of the sweep: the pull-in ray originates at
`avatar.y + height/2`, so a pulled camera can never sit below half the
free-flight height — 157.7u at the measured minimum, ~70u even at the
smallest theoretical radius (r=14, pitch 35°). The band in `b-street.png`
was produced at a ~9u review-rig eye height. **No reachable camera gets
within an order of magnitude of the near plane.** Item 5 closes as a
capture-rig artifact; `tasks.md` task 11 is cancelled.

### Phase 0 check 3 — road-marking measurement (task 3, R3) ✔

On-screen pixels (`b-street`, `d-intersection`, native res) against the
`groundtex.js` constants (11 u/m):

| Marking | Authored | Real-world | On-screen check | Verdict |
|---|---|---|---|---|
| `LANE_CENTRE_WIDTH` | 3.0u = 0.27m | 0.10–0.15m | dash ~35px vs truck width ~170px at same depth (0.21 vs real ~0.12) | **~2× too wide — move it** |
| `LANE_EDGE_WIDTH` | 2.2u = 0.20m | 0.10–0.15m | consistent with centre line | **~1.5× too wide — move it** |
| dash/gap | 14u/12u = 1.27m/1.09m | 3m/9m (US) | dash:gap ≈ 2:1 on screen vs real 1:3 | **~3× too frequent — move it** |
| `PARKING_PITCH` | 24u = 2.2m | 6.0–6.7m | — | **far too tight — move it** |
| crosswalk stripe | 6.32u = 0.57m | 0.30–0.60m | ~15px vs ~50px car at same depth ≈ 0.3 | correct — do not move |

The measurement indicts the same constants as the desk estimate: centre
line, edge line, dash rhythm, parking pitch. Reading A (props undersized)
is not supported for the markings themselves — the stripe:car ratio is
right. Task 10 proceeds against those four constants only.

### Phase 0 check 4 — perf re-baseline (task 4) ✔

Live deploy, real GPU, 1600×1000. **Instrumentation fix discovered:**
`renderer.info` auto-resets per internal pass, so with the composer enabled
`performanceSnapshot()` only ever sees the final fullscreen quad — this is
why naive reads return `calls=1 tris=1`. Re-measured with
`info.autoReset=false` + one reset per frame (accumulates shadow pass and
composer passes — the honest whole-frame cost):

- **calls = 333, triangles = 987,291, geometries = 163, textures = 26**
  (spawn idle, post-sweep).
- **`state.world.groupCount = 114`** (632 prop instances; full key list in
  `reachability.json`) — the "59 instanced prop groups, guard 60" premise in
  `tech-architecture.md` §1 / `00-overview.md` is stale. Any task written
  against a zero-group-headroom assumption must be re-read against 114.
- Frame times (perf-probe, live): spawn avg 9.41ms / p95 21.40ms;
  mid-city 9.67/21.00; vista 3.34/8.60; 10s walk 11.41/21.80.
- Sweep snapshot (different spot): avg 14.49ms / p95 27.80ms.

Reconciliation of the three recorded figures: `current-state.md`'s
"~390 calls / ~1.0M tris" is **confirmed in substance** (333/~987k at a
quiet spot; ~390 at busier ones); `scene.js:159`'s "~25 draw calls / 205k
triangles" comment is **stale and wrong** (corrected in the same change as
this note); the ≤150 desktop budget is **exceeded at 333 calls**, which the
next pass that wants headroom must reckon with.


## Relationship to existing wiki claims

- **`0007-chicago-loop-authored-city/00-findings.md`'s park-as-civic-room
  requirement** ("Parks and plazas are bounded civic rooms with paths,
  trees, and focal objects," from its reference-comparison table, and
  referenced from `art-direction.md` §1 as the source of Level 1's district
  pattern) is contradicted by item 6 above: parks currently render as flat
  rectangles with cross-paths and no furniture or edges. Not an errata to
  that page — the requirement is still the intended direction — but this
  review is evidence that Level 1 does not yet meet it.
- **`current-state.md`'s "Loop day mood" note** (the brighter ambient/
  hemisphere fill, "keeping masonry readable inside dense street canyons")
  and **0010 F8** ("Downtown reads too dark") both already flagged the same
  direction as item 1 here. This review adds fresh live evidence, post-DOF
  re-tune, that the defect is still present and is now the single
  highest-ranked illusion-breaker in a dedicated realism pass, not just a
  persona complaint.
- No claim in this package overturns or supersedes prior wiki text; it adds
  a new, dated evidence layer. See `current-state.md`'s desktop UX debt
  entry for the cross-reference into 0010.
