# 0011 — Remediation Requirements

Each requirement traces to a numbered illusion-breaker in
[`00-findings.md`](00-findings.md) and names its evidence shot. Requirement
`R<n>` addresses findings item `<n>` — the numbering is aligned deliberately so
neither doc can drift from the other. `NR<n>` are non-regression requirements
drawn from the findings' "What already works — keep, do not regress" set.

† = look-and-feel change; requires Nico's explicit per-element approval before
implementation (working agreements, `INDEX.md`).

Every acceptance criterion below is stated as something visible in a
screenshot or on screen. Where a number appears, its player-visible
consequence is attached. Verification method for all of them:
[`test-strategy.md`](test-strategy.md) — always the live deploy at
`https://funnel-hub-umber.vercel.app/`, never localhost.

## P0 — the four highest value-per-cost items

- **R1 (item 1) — Tall buildings show their windows; no surface reads as pure
  black.** † The tallest tower in frame reads as a building with visible
  window rhythm and a discernible top, not a solid black cut-out against the
  sky. Ground floors along a street read as shop fronts and entrances, not as
  a continuous black stripe at pavement level. Acceptance: at the fixed
  `g-skyline` camera, the tallest tower's window grid is countable in the
  screenshot; at the fixed `b-street` and `d-intersection` cameras, no
  building's ground floor is a featureless black band, and the authored facade
  art is legible where the player actually stands. Evidence:
  `shots/l1-realism-review/g-skyline.png`, `b-street.png`,
  `d-intersection.png`, `j-elevated-rail.png`. Before/after pair at the same
  camera is the gate.

- **R4 (item 4) — The sky reads as sky, not as a painted wall.** † Looking at
  the horizon shows depth: the sky is lighter and hazier where it meets the
  city and deeper overhead, there is visible cloud, and the horizon line is a
  soft transition rather than a hard edge. Acceptance: in a fixed
  `h-far-horizon` capture a viewer can point at where the sky is nearest and
  where it is furthest; cloud is present; no single hard horizontal line
  separates sky from ground. Evidence: all ten shots show the current flat
  wall; `h-far-horizon.png` and `f-vista.png` are the gate pair.
  **Hard constraint:** the whole playable square must remain as sharp after
  this change as before it — no added atmosphere may put haze or blur inside
  the play area (see `NR4`).

- **R3 (item 3) — Road paint and street width read at the same scale as the
  cars and people on them.** † A crosswalk stripe is visibly narrower than a
  car; a centre-line dash reads as a painted line rather than a slab; and a
  street reads as a street a pedestrian could cross, not as a plaza with cars
  parked in it. Acceptance: in a fixed `d-intersection` capture, a viewer
  asked "is that stripe wider or narrower than that car?" answers *narrower*
  without hesitation; measured on the same screenshot, the widest single
  painted stripe covers a smaller pixel width than the narrowest car beside
  it. Evidence: `d-intersection.png`, `j-elevated-rail.png`.
  **Precondition:** the findings' "3x too wide" figure is an eyeball estimate
  and the code's street width computes to a normal real-world two-lane
  carriageway at the project's canonical scale — so this requirement is
  satisfied by an on-screen measurement, and no constant moves until that
  measurement exists (`design.md` §R3, `tasks.md` task 5).

- **R5 (item 5) — The ground never runs out beneath the player.** No camera
  position a player can reach shows background or sky through the bottom of
  the frame where road surface should be. Acceptance: a sweep of reachable
  camera pitches and player sizes produces no frame with a blue band beneath
  the road; if the sweep proves no reachable camera can produce it, that
  proof is the acceptance evidence and the item closes as unreachable rather
  than as fixed. Evidence: `b-street.png` shows the current band occupying the
  bottom ~13% of frame at a ~9-unit eye height.
  **Note carried from `design.md`:** this is the one item whose *player*
  visibility is in doubt — the chase camera sits far above the height where
  the band appears. Its position in the P0 batch is a recorded priority
  decision, not a claim that a player sees it today.

## P1 — the four remaining illusion-breakers

- **R6 (item 6) — Parks are places, not green rectangles.** † A park block
  reads as a bounded civic space: it has an edge you can see (railing, kerb,
  hedge, or planted border), things in it a person would use (benches, lamps,
  planting), and paths that lead to something rather than crossing empty
  grass. Acceptance: at the fixed `e-park` camera the park contains
  recognisable furniture and a visible boundary; a viewer who has never seen
  the game calls it "a park" rather than "a green square." This closes the
  `0007-chicago-loop-authored-city/00-findings.md` reference-table row *Open
  space* ("Parks and plazas are bounded civic rooms with paths, trees, and
  focal objects"), which item 6 currently contradicts. Evidence:
  `e-park.png`, `h-far-horizon.png`.

- **R7 (item 7) — Water meets land, and the surface is alive.** † The
  shoreline is a transition a viewer can see — the water shallows or the bank
  reads as bank — rather than a knife edge where a flat plane stops. The water
  surface shows movement or light response rather than reading as painted
  card. Acceptance: at the fixed `e-park` and `h-far-horizon` cameras the
  land-to-water join is not a single hard line, and two frames captured a
  second apart differ visibly on the water surface. Evidence: `e-park.png`,
  `h-far-horizon.png`.

- **R8 (item 8) — The skyline is a row of individuals, not a row of
  rectangles.** † Seen against the sky, tall buildings differ from each other
  at the top: crowns, parapets, masts, and roof plant break the outline so no
  two adjacent towers share a silhouette. Acceptance: at the fixed `f-vista`
  and `g-skyline` cameras, a viewer tracing the outline against the sky can
  count distinct building tops; no three adjacent towers terminate in the
  same flat horizontal. Evidence: `f-vista.png`, `g-skyline.png`.
  **Correction carried from `design.md`:** roof geometry already ships. This
  requirement is about how large that geometry reads at skyline distance, not
  about authoring it from nothing.

## P2 — the largest and slowest item

- **R2 (item 2) — One city, one art direction.** † Trees, vehicles,
  pedestrians, and collectible prop blocks sit credibly beside the
  photographic architecture: they read as objects in the same world and the
  same light, not as toys placed on a photograph. Acceptance: in any gameplay
  framing, a viewer asked "does anything here look like it came from a
  different game?" cannot pick out the trees, cars, people, or props. The
  photographic facades stay — this requirement moves the props, not the
  buildings ([`ADR 0005`](adr/0005-level1-props-rise-to-photographic-facades.md)).
  Evidence: visible in every gameplay framing; `c-block.png` is the reference
  for what already works.
  **Two hard constraints, both binding:**
  1. **Edible readability is not negotiable.** After any restyling, a player
     must still tell at a glance which props they can eat and which they
     cannot. Acceptance: the measured brightness ratio between an
     eat-me prop and a too-big prop is unchanged from today's baseline, and a
     greyscale screenshot still separates the two groups.
  2. **The other 99 levels do not change.** Acceptance: a before/after capture
     of Level 2 and Level 50 is pixel-identical.

## Non-regression requirements

Drawn from the findings' "keep, do not regress" list, plus the two standing
invariants this work could plausibly break.

- **NR1 — Blocks still read as blocks.** Streets form real blocks and
  buildings still form a street wall at the pavement rather than floating in
  paved fields. Acceptance: `c-block` and `d-intersection` captures show the
  same street-wall continuity as the baseline set.
- **NR2 — Height banding still reads.** Towers still cluster and step down
  coherently into low-rise. Acceptance: `f-vista` and `g-skyline` captures
  show the same banding.
- **NR3 — The city still continues past the playable square**, and the lake
  still sits on the +X bearing. Acceptance: `h-far-horizon` capture retains
  continuous perimeter city and the lake on the correct side.
- **NR4 — The far-field-only depth-of-field contract survives intact.**
  Everything inside the playable square stays sharp; blur begins only past its
  edge. No sky, haze, cloud, or water change may put softness inside the play
  area. Acceptance: a fixed `f-vista` capture shows crisp detail on the
  furthest in-play building; blur is visible only on the perimeter context
  city (`5b2bf02`, `c0e8568`).
- **NR5 — The photographic storefront facades still read well along a street
  axis.** They are the one thing the review singled out as genuinely
  convincing. Acceptance: `c-block` capture is no worse than the baseline.
- **NR6 — Performance and determinism hold.** Level 1 does not gain instanced
  prop groups (59 today, guarded at 60), does not gain distinct materials, and
  the same seed still produces the identical level. Acceptance: `npm test`
  green at 100/100 invariants with zero placement penetrations;
  `scripts/perf-probe.cjs` draw-call and triangle counts not worse than the
  pre-change run on the same machine.

## Non-goals

Any change to the 99 generic levels' art direction; real reflections or a
reflection probe for water; volumetric clouds; per-part prop materials; tone
mapping (measured and rejected, `art-direction.md` §5); a second or
near-field DOF band; new npm dependencies; paid assets or services; the
economy, the difficulty invariants, the keyboard and camera items covered by
`0010-chicago-level1-playtest`, and the mobile items covered by
`0006-mobile-readiness-and-placement`.
