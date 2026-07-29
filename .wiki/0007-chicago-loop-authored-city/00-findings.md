---
covers:
  - src/content/districts.js
  - src/content/city-context.js
  - src/data/levels.js
  - src/main.js
---

# Chicago Loop Authored-City Pilot

**Date:** 2026-07-28

**Status:** implementation complete; live visual validation pending
## Reference comparison

Compared references:

- [`actual-in_game-graphics-city.png`](../../assets/references/actual-in_game-graphics-city.png)
- [`target-in_game-graphics-city.png`](../../assets/references/target-in_game-graphics-city.png)
- [`target-in_game-graphics-background-01.png`](../../assets/references/target-in_game-graphics-background-01.png)
- [`target-in_game-graphics-background-02.png`](../../assets/references/target-in_game-graphics-background-02.png)

| Dimension | Current reference | Target reference | Required correction |
|---|---|---|---|
| Urban structure | Organic diagonals and multi-road knots dominate. | Legible orthogonal avenues form repeatable blocks. | Author the primary street skeleton before placing props. |
| Block form | Towers sit as isolated objects in large paved fields. | Buildings form perimeter street walls with interior courts and service space. | Allocate continuous frontage runs and reserve deliberate voids. |
| Scale hierarchy | A few extremely large towers overpower nearby objects. | Low-, mid-, and high-rise forms transition coherently across blocks. | Compose height bands; use towers as anchors, not random punctuation. |
| Open space | Grass appears as leftover polygons beside roads. | Parks and plazas are bounded civic rooms with paths, trees, and focal objects. | Author named park/plaza blocks and populate them by function. |
| Roads | Intersections are oversized and visually noisy; diagonal markings overlap. | Lane widths, crossings, medians, and intersections repeat consistently. | Prefer city-specific orthogonal road modules and controlled junctions. |
| Vehicles | Alignment is physically legal but traffic reads sparse and incidental. | Vehicles form directional traffic streams with curb and parking rhythms. | Preserve lane alignment and compose density by street class. |
| Street life | Small props are scattered with weak relation to entrances and curbs. | Trees, lamps, people, parked cars, and furniture reinforce sidewalks. | Bind scatter to frontage, curb, park-path, and plaza-edge slots. |
| Architecture | Flat color blocks and repeated silhouettes reveal the kit quickly. | Facade depth, roof equipment, windows, storefronts, and material variation create believable buildings. | Expand the Chicago kit after the layout pilot; keep instancing and physical bounds. |
| Grounding | Large undifferentiated slabs separate objects from their surroundings. | Curbs, sidewalks, lots, crossings, and landscaping connect every object to a use. | Make surfaces derive from the authored block program. |
| Horizon | The playable slab ends in sky/haze with little surrounding context. | The city continues beyond the playable composition. | Add low-detail, non-interactive perimeter city and geographic edge cues. |

The key finding is that collision correctness is necessary but insufficient.
The actual reference is now capable of legal placement, but it lacks authored
urban intent. The target reads as a city because streets, blocks, buildings,
open spaces, traffic, and background all agree on one spatial hierarchy.

### Background-reference update (2026-07-28)

The two added references clarify that the horizon is not a decorative skyline
strip. It is a continuation of the same block-and-road grammar visible in the
play area. Reference 01 fills every edge with progressively smaller blocks and
tree canopy; reference 02 makes water a meaningful boundary, then carries the
scene with bridges, a far skyline, and terrain. Both soften only distant detail
while preserving strong near/midground silhouettes.

The runtime does not ship a post-processing composer, so this pass does not add
a costly full-screen depth-of-field shader. It uses the equivalent gameplay
technique: instanced simplified geometry, a quieter far-distance palette, and
the existing exponential fog. Chicago combines both reference modes—dense city
continuation north/west/south and a broad Lake Michigan edge to the east.

> **Errata (2026-07-29, `5b2bf02`):** the claim above ("does not ship a
> post-processing composer") was already false when written — a `BokehPass`
> composer had been ported in the July 29 recovery (`0009-july29-recovery`)
> before this pass — and is unambiguously false now: `5b2bf02` replaced that
> `BokehPass` with a purpose-built far-field-only `ShaderPass`
> (`src/engine/dof.js`) that is sharp across the whole playable square and
> ramps up only past its edge, i.e. exactly across the faux context city this
> section describes. See `tech-architecture.md` §1 for the current pipeline.
> This paragraph is left as-written above; treat it as historical record of
> the finding at the time, not current fact.

## Chicago research translated into level rules

Authoritative and architectural sources establish the following durable cues:

- The City of Chicago describes the Loop as bounded roughly by the Chicago
  River to the north and west, Grant Park to the east, and Congress Parkway to
  the south: [City of Chicago Loop tour](https://webapps1.chicago.gov/landmarksweb/web/tourdetails.htm?touId=32).
- The same source describes a mix of post-Fire masonry, early steel-frame
  skyscrapers, and Art Deco high-rises rather than one repeated tower family.
- CTA identifies the elevated Loop as active infrastructure used by multiple
  rail lines: [CTA rail map](https://www.transitchicago.com/assets/1/6/ctamap_LMap.pdf).
- The Chicago Architecture Center treats the elevated railway as an iconic
  city symbol: [The Chicago L](https://www.architecture.org/online-resources/buildings-of-chicago/the-chicago-l).
- The Chicago Park District places Grant Park in the Loop, west-bounded by
  Michigan Avenue, and describes its formal gardens, boulevards, civic focal
  points, and lakefront role: [Grant Park](https://www.chicagoparkdistrict.com/parks-facilities/grant-ulysses-park).

This is a compressed game interpretation, not a GIS reconstruction. Level 1
uses a centered world-space coordinate system and retains the existing economy,
camera, spawn, and footprint contracts.

## Implemented pilot

- Level 1 displays as **The Loop · Chicago**.
- Its generated archetype is the fixed `chicago-loop` authored layout.
- Eight orthogonal streets form 25 bounded blocks.
- The eastern column is a continuous park/civic edge; central park and plaza
  blocks create deliberate gameplay voids.
- The existing seeded prop allocator populates those authored zones, and the
  final physical-bounds pass remains authoritative.
- Four elevated-rail segments form the Loop cue above the playable streets.
- Two narrow water planes imply the Chicago River along the north and west
  edges; a third broad plane establishes Lake Michigan to the east.
- 454 low-detail buildings, 1,138 tree canopies, 62 road strips, and rooftop
  silhouettes extend the city beyond the north, west, and south boundaries.
  Distance-banded color and fog soften the far field; as of `5b2bf02`
  (2026-07-29) the far-field-only DOF pass in `src/engine/dof.js` also ramps
  up across exactly this band (see the errata note above).
- Background context is render-only: it cannot be eaten, collided with, added
  to spatial hashes, or counted as progression mass.
- The generic Harbor bridge signature is disabled for the Chicago pilot, and
  its in-level landmark uses the existing spire vocabulary instead of the
  Liberty-statue silhouette.

## Deliberate limits and next decisions

- This pass changes composition and context, not the complete building kit.
  Achieving the target's facade realism still requires Chicago-specific
  masonry, curtain-wall, storefront, rooftop, parking, and transit modules.
- Levels 2–10 of the first metro are not silently relabeled as Chicago. Each
  needs its own researched neighborhood plan before the metro identity changes.
- The faux surrounding city is intentionally low-detail and should be judged
  from gameplay distance; it is not explorable geometry.
- Live review must check whether the elevated rail remains readable without
  appearing collidable and whether the skyline survives fog at mobile quality.

## Acceptance evidence

- Level 1 remains deterministic and preserves every prop count and mass budget.
- Chicago context has three water planes, four rail segments, 454 instanced
  buildings, 1,138 trees, and 62 background road strips. The near context ring
  is capped to low-rise infill; every taller skyline mass begins at least two
  context blocks beyond the play boundary. Edge views therefore retain a
  continuous city without giant foreground occluders or an empty road grid.
- Level 2 and all later levels receive no Chicago context.
- Full invariant and placement audits must remain green before deployment.
