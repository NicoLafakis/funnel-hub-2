# 0005. Level 1 Props Rise to the Photographic Facades

**Status:** Accepted - **Date:** 2026-07-29

> Serves [plan 0011](../requirements.md), requirement R2.

## Context

Level 1 renders two art directions at once. The photographic facade set in
`assets/textures/photoreal/` supplies per-tier building faces baked at their
real face aspect, and `0011-level1-city-realism-review/00-findings.md` records
that along a street axis those facades "read genuinely well" — the one element
of the review that was praised without qualification. Standing directly beside
them are cartoon conifer trees, toy low-poly cars, chibi pedestrians, and
pastel candy-coloured collectible blocks. Item 2 of that review states the
consequence plainly: each is acceptable alone; together the eye stops believing
either.

The wiki already carries the direction call this decision has to live inside.
`art-direction.md`'s standing call (2026-07-27) is "premium stylized" —
explicitly NOT photoreal, NOT PBR — and its direction update (2026-07-28,
**Level 1 only**) supersedes that for the Chicago Loop, where new target frames
put the photographic set into production. The 99 generic levels keep the
procedural premium-stylized path unchanged.

So the conflict is not a question of which direction the game has. It is a
question of which side of an already-split Level 1 moves to close the split.

Two facts constrain any answer:

- **Only `.color` survives the instancing merge.** `propkit.mergedKindGeometry`
  flattens every part mesh into one `BufferGeometry` and discards part
  materials; the whole merged kit renders with one `MeshStandardMaterial`
  carrying at most one `map`. Per-part roughness and metalness are silently
  dropped. Per-part material variety is unavailable without breaking the
  instanced-group budget (Level 1 measures 59 groups against a guard of 60,
  `tech-architecture.md` §1).
- **The collectible props' edibility signal rides on the per-instance colour.**
  `EDIBLE_LIFT = 1.06` and `TOO_BIG_DIM = 0.62` / `TOO_BIG_DIM_TEXTURED = 0.78`
  (`src/engine/instancing.js`) are scalar value multiplies applied before
  lighting, which is why `art-direction.md` §3 can guarantee the ratio survives
  any light rig. The pastel palette pick occupies the same channel.

## Decision

**Level 1 keeps the photographic facade set. The props rise to meet it.**

Trees, vehicles, pedestrians, and the pastel collectible blocks are brought up
to sit credibly beside photographic architecture, for Level 1 only. The uplift
is bought through the three levers the instancing merge actually permits —
authored geometry, baked vertex colour, and one texture map per merged kind —
and never through per-part materials or additional instanced groups.

The uplift rides the existing `level.authoredCity === 'chicago-loop'` flag
(`src/data/levels.js`, consumed at `src/main.js:620, 680-681, 1333`), the same
single datum that already gates the photoreal texture set, the authored layout,
the Chicago light mood, the city palette, and the Chicago park ground
treatment. No new per-level flag and no override table are introduced, so the
99 generic levels reach none of this by construction rather than by care.

**The collectible props' instant readability as edible is a hard constraint on
this decision, not a consideration inside it.** Any restyling that changes the
per-instance colour channel — including the obvious move of desaturating the
pastel collectibles toward the photographs — is out of bounds. Collectibles
gain fidelity through geometry and texture; if the six accent-derived pastel
hues must move at all, they move at equal *value* so the edibility ratio is
preserved by construction and provable by the same measurement
`art-direction.md` §3 documents.

## Alternatives considered

- **Drop Level 1's photoreal facades back to procedural stylized, for
  consistency. REJECTED.** This is the symmetric fix and it loses on four
  counts. (1) It overturns a standing direction call made against approved
  target reference frames only one day earlier, and reverses it on the strength
  of a review that praised the very thing it would delete — the findings
  identify the photographic storefronts as the one element already working.
  (2) It discards shipped, working machinery, not merely an asset choice: the
  per-tier face-aspect bake (`PHOTOREAL_FACE_ASPECT`), the per-group variant
  arrays picked by stable key hash at zero extra draw calls, the appended roof
  strip and `facadeRegion` tiling, the photo ground-zone patterns, the water
  tiles, and the `photorealFacades` palette bypass. (3) It does not actually
  fix the item: cartoon trees beside procedural flat facades is the read
  `0007-chicago-loop-authored-city/00-findings.md`'s reference table already
  condemned in its *Architecture* row — "flat color blocks and repeated
  silhouettes reveal the kit quickly" — so consistency would be achieved at the
  level the target reference was chosen to escape. (4) It moves the wrong
  quantity: the review's overall verdict is that the urban *plan* convinces and
  the *rendering* betrays it, and the facades are the strongest rendering asset
  the level has.
- **Keep both directions and accept the clash as stylistic contrast.
  REJECTED.** The findings are direct live evidence that it does not read as
  contrast, it reads as inconsistency; and item 2 is ranked second of eight,
  above three defects.
- **Give the props real PBR materials so they sit in the same lighting model as
  the photographs. REJECTED on architecture, not taste.** Per-part materials do
  not survive `mergedKindGeometry`. Delivering them means one group per part
  per prop kind, which breaks the 60-group guard and the ≤12 distinct-material
  mobile budget outright. `art-direction.md` §3 already records this as a
  standing architectural constraint.
- **Apply the uplift to all 100 levels for a single coherent game. REJECTED.**
  It contradicts the standing premium-stylized call for the other 99 levels,
  multiplies the asset-authoring cost by the full metro roster, and would need
  every metro's palette re-verified against the edibility ladder. Level 1 is
  the authored pilot; later neighborhoods each get their own researched pass
  (`0007`, "Levels 2–10 of the first metro are not silently relabeled as
  Chicago").
- **Solve the clash with a post-process unifying grade instead of touching
  assets. REJECTED with prior measurement.** `art-direction.md` §5 records tone
  mapping considered and rejected on numbers: clipping measured 0.00% in every
  configuration so a curve can only redistribute an existing 0–182 range, and
  AgX flattened the palette (frame sd 25.6 → 23.7, saturation 0.289 → 0.230)
  and shrank the rendered edibility ratio to 1.226, invalidating the grayscale
  ladder `art-direction.md` §3 calibrates luma by luma.

## Consequences

- Level 1 becomes the first level whose prop art is authored to a different
  fidelity bar than the shared kit. The uplift must therefore be expressible as
  data and assets reached through the `authoredCity` flag, or it will become a
  branch in `main.js` that the next authored level has to fork.
- `art-direction.md`'s 2026-07-28 Level-1-only direction update must be extended
  when this is implemented: it currently scopes the photographic call to
  facades, ground zones and water tiles, and will need to name props as
  in-scope for Level 1 too.
- The Blender prop pack becomes the long pole. `art-direction.md` §1 records
  that Blender is not installed on this machine, so `npm run models` cannot
  regenerate `assets/models/*.js` here. Geometry-led uplift is blocked until a
  machine with Blender is available; the texture-map and vertex-colour levers
  are not. This is why R2 is sequenced last.
- The collectible-readability constraint permanently caps how far the pastel
  palette can move. That cap is a gameplay decision expressed as an art
  constraint, and any future proposal to relax it must first show a measured
  replacement signal, not an argument.
- Every prop change acquires a mandatory non-regression gate: a pixel-identical
  capture of a non-Chicago level. Without it, "it must not leak" is an
  intention rather than a check.
- Draw calls, instanced groups, and distinct materials are unchanged by this
  decision, so it does not consume the mobile budget headroom that R6's park
  furniture may need.
- Reversing this decision later means re-deriving the procedural facade path for
  Level 1 and re-authoring the target reference expectation. It is not cheap,
  which is why it is recorded as an ADR rather than settled in `design.md`.
