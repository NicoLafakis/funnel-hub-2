# 0011 — Level 1 City Realism Review

Status: **findings recorded; no remediation implemented.**
Date: 2026-07-29. Evidence: `shots/l1-realism-review/` (10 screenshots,
`a-spawn.png` through `j-elevated-rail.png`).

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
2. **Two art directions are in conflict.** Photographic facades stand
   directly beside cartoon conifer trees, toy low-poly cars, and pastel
   candy-colored prop blocks. Each is acceptable alone; together the eye
   stops believing either. Visible in every gameplay framing.
3. **Scale disagreement in road markings and street width.** Crosswalk bars
   and lane dashes are enormous relative to cars and pedestrians — a single
   stripe reads about as wide as a car (`d-intersection.png`,
   `j-elevated-rail.png`) — and streets read roughly 3x too wide and too
   empty. Consequence: the city reads as a scale model with oversized decals.
4. **The sky is a flat blue wall:** one near-uniform blue, a hard horizon
   line, no clouds, no haze gradient, no near-ground light shift. Present in
   all 10 shots. This is the single fastest "this is a video game" tell in
   the set.
5. **The ground plane visibly ends inside the frame.** At pedestrian eye
   height (~9u) a flat blue band occupies the bottom ~13% of the frame with
   a thin dark-green strip above it — background shows through beneath the
   road surface (`b-street.png`). This is a defect, not a styling issue, and
   it is in the render, not the capture path.
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

## Recommendation (not implemented)

Items 1, 4, and 3, plus the item-5 defect, are the highest value-per-cost —
they would move street level from ~4 to ~7 without authoring a single new
building. This is a recommendation for the next pass, not a scoped or
approved change.

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
