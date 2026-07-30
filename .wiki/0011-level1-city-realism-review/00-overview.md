# 0011 — Level 1 City Realism: Objective Overview

**Tier:** 2 — **Date:** 2026-07-29 — **Status:** Phase-0 measurements and
**Phase A implemented** (2026-07-30, `91eeee9` — tasks 5–8, 10 live, task 9
dropped, task 11 cancelled; evidence in `shots/phase-a/` and `tasks.md`).
Phases B, B+, C not started.

## What was asked

Turn the eight ranked illusion-breakers in
[`00-findings.md`](00-findings.md) into an implementation-ready remediation
package for Level 1 (The Loop · Chicago), without disturbing the other 99
levels.

Primary evidence: `shots/l1-realism-review/` (`a-spawn.png` through
`j-elevated-rail.png`, captured live post-`c0e8568` at 1600×1000). Those PNGs
are untracked — `shots/` is gitignored repo-wide — so anyone verifying this
package re-captures live rather than expecting them in a clone.

## What it really serves

A player looking at Level 1 should believe they are eating a city, not a
tabletop model of one. The findings put that belief at ~7/10 from a high
camera and ~4/10 at street level. The urban *plan* already convinces; the
*rendering* of it is what gives it away. This package fixes the rendering.

## What the code actually says, versus what the findings assumed

Reading the implementation changed the shape of three of the eight items.
These are recorded here because they change what the work *is*, not just how
it is done. Full mechanism in [`design.md`](design.md).

| Findings item | What the findings assumed | What the code shows |
|---|---|---|
| 1 — dark scene, black towers | A lighting problem ("reads as dusk with the sun misplaced") | Two **albedo** problems. The lights are already brightened for the Loop (ambient 0.26 / hemisphere 1.12 / sun 1.60 in `scene.js` `setMood`). The black tower is a texture-variant lottery landing on the darkest art in the set; the black ground floors are a fixed near-black paint band baked into every building model. No light rig change can reach either. |
| 5 — ground plane ends in frame | A shipping render defect | Real geometry, but only reachable from a camera height the game's chase camera never occupies. Confirm reachability before spending on it. |
| 8 — every roof is flat | Roofs have no geometry | Roof geometry exists and ships (parapets, decks, water tanks, plant — `BUILDING_ROOF` in `propkit.js`, authored in `build_props.py`). What is missing is roof *silhouette scale* against the sky at skyline distance. |

None of this overturns the findings' ranking or its player-visible
observations, which stand as captured. It reassigns the cause.

## Load-bearing invariant

At every shippable checkpoint: the far-field-only DOF contract holds (sharp
across the entire playable square, blur only past its edge); the seven
collectible tiers stay instantly readable as edible; the 99 non-Chicago levels
render byte-identically to today; and `npm test` stays green at 100/100
invariants with zero placement penetrations.

## 20 moves ahead

- **Next wants:** the same treatment for Levels 2–10 of Area 1, which means
  every mechanism here must be a per-level *capability* gated on level data,
  never a Chicago hardcode. Where a fix can be authored as data
  (a park-furniture catalog slice, a facade-variant exclusion list) it is,
  so Level 2's pass is a data edit rather than a second code pass.
- **Breaks at scale:** the draw-call and group budget. Level 1 already sits at
  59 instanced groups against a guard of 60 (`tech-architecture.md` §1). Any
  item that wants "one more material" is structurally blocked, not merely
  expensive — see the cost gate below.
- **Unlocks:** a credible Level 1 is the reference frame every later
  neighborhood is judged against, and it is the screenshot the game is sold
  on. It also unlocks the 0007 reference-comparison table's remaining rows
  (Architecture, Street life, Grounding) which no amount of layout work can
  close.
- **Doors kept open:** props gain fidelity through authored geometry and
  baked vertex colour, both of which the existing merge already carries — so
  a later per-level art tier costs data, not architecture.
- **Doors shut:** per-part prop materials (only `.color` survives the
  instancing merge); a photoreal repaint of the other 99 levels; any
  atmosphere change that reintroduces blur inside the play area.

## The cost gate every item passes through

Binding budgets, from `.claude/agents/_shared/3d-pipeline-contract.md` §1 and
`tech-architecture.md` §1:

- draw calls ≤150 desktop / **≤60 mobile**; triangles in view ≤1.5M / ≤400K;
  distinct materials ≤25 / **≤12**;
- Level 1's group count was recorded here as 59 against a guard of 60 —
  **measured stale 2026-07-30: 114 groups live** (see the resolution note
  below);
- only `.color` survives `propkit.mergedKindGeometry` — per-part roughness and
  metalness are silently discarded and an entire merged prop kit renders with
  ONE `MeshStandardMaterial`. Per-part material variety is not available
  without breaking the group budget.

Consequence: every item in this package is either a **texture-content change**
(free — one map per group already exists), an **authored-geometry change**
(free — merges into the existing group), or a **constant change** (free).
Nothing here adds a material or a group. Any proposal that would is named and
rejected in [`design.md`](design.md).

**Budget contradiction — RESOLVED 2026-07-30 (Phase 0, check 4):**
re-measured live with the `renderer.info` auto-reset artifact corrected
(naive reads see only the composer's final quad, `calls=1 tris=1`). Real
baseline: **333 draw calls / 987,291 triangles / 114 instanced groups** at a
quiet spot; `current-state.md`'s ~390/~1.0M is confirmed in substance;
`scene.js`'s "~25 draw calls / 205k triangles" comment was stale and has
been corrected. Two consequences every later task must honour: the ≤150
desktop budget is **already exceeded** (333 calls), so nothing may add a
pass; and the "59 groups against a guard of 60" premise below is stale at
**114 groups** — the group economy has to be re-derived, not assumed. Full
evidence in `00-findings.md`'s measurement addendum.

## Scope line

- **Building:** facade-variant exposure correction and ground-floor albedo
  fix (item 1); sky gradient, haze band and cloud layer (item 4); road-marking
  and street-scale correction after live measurement (item 3); the
  ground-plane clip (item 5); park furniture from the existing catalog
  (item 6); shoreline and water surface (item 7); roof silhouette (item 8);
  the Level-1-only prop art uplift (item 2).
- **Deferred / not building:** any change to the 99 generic levels; a real
  reflection probe or planar reflection for water; volumetric or raymarched
  clouds; per-part prop PBR; tone mapping (measured and rejected —
  `art-direction.md` §5); a second DOF band; new npm dependencies; any paid
  asset or service.
- **Decisions already taken, not re-opened:** Level 1 keeps the photographic
  facades and the props move up to meet them
  ([`ADR 0005`](adr/0005-level1-props-rise-to-photographic-facades.md)); the
  task order is items 1, 4, 3, 5 → 6, 7, 8 → 2; the collectible props' edible
  readability is a hard constraint that caps how far item 2 can go.

## Caliber and package

Tier 2. It is cross-cutting — engine lighting and post-processing, content
textures, ground baking, district generation, the prop kit, and the offline
Blender generator — and it carries one load-bearing, expensive-to-reverse
art-direction decision, which is what warrants the ADR. It adds no backend,
dependency, migration, authentication, payment, or external API, so Tier 3
operational and security documents are not warranted.

`00-overview.md` exists in this package (0006 has one, 0010 does not) because
this package needs three things `00-findings.md` cannot carry: the forward
trajectory above, the tier/package justification, and a hub that links the
ADR to the triad. 0010 could skip it because its findings doc was also its
spine; this package's findings doc is a rendering review whose conclusions
were partly reassigned by the code, so the spine has to live somewhere else.

- [Requirements](requirements.md)
- [Technical design](design.md)
- [ADR 0005 — Level 1 props rise to the photographic facades](adr/0005-level1-props-rise-to-photographic-facades.md)
- [Test strategy](test-strategy.md)
- [Implementation plan](tasks.md)
- [Findings and evidence](00-findings.md)
