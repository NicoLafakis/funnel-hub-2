---
covers:
  - assets/textures/city objects
  - src/content/city-object-catalog.js
  - src/content/archetypes.js
  - src/content/propkit.js
  - src/content/districts.js
  - src/content/physical-bounds.generated.js
---

# Reference-Led City Object Library

**Date:** 2026-07-28  
**Status:** implemented; live visual validation pending deployment

## Decision

City identity now owns object selection. The ten supplied reference sheets are
the canonical initial roster: 234 stable object types, comprising 48
Chicago-specific objects and 186 shared urban objects. Area 1 uses this full
roster across its ten neighborhood levels. Later cities keep the shared kit
and add or replace city-specific objects when their references are authored.

This supersedes the earlier assumption that a metro is primarily distinguished
by 30 palette-and-silhouette variants. Those IDs remain compatible with saves
and later areas, but Area 1 is the city-first pilot.

## Scale contract

- The runtime remains centered world space with `11 world units = 1 metre`.
- Every city object records positive width, height, and depth in metres.
- Rendered physical dimensions and gameplay eat radius remain separate. The
  seven economy tiers still determine mass, progression, and size gates.
- Generated physical bounds measure the final merged geometry and remain the
  authority for legal placement.
- Each city asset preserves its economy tier's calibrated ground envelope with
  a thin curb/plinth/floor-pan base, preventing visual swaps from silently
  reshuffling the route while the visible model can use narrower setbacks.

## Rendering and distribution

- Twelve reusable low-poly construction profiles cover people, clutter,
  furniture, poles, vehicles, transit, rail, shops, mid-rises, towers, civic
  modules, and landmarks. Deterministic profile proportions provide stable
  per-object silhouettes without remote models or new dependencies.
- All 234 IDs are registered collection identities and all appear at least once
  across Area 1.
- Both Chicago Loop sheets are exclusive to Area 1, Level 1. The 24 icon-sheet
  types are interactive; the 24 rail-sheet types compose the render-only Loop
  viaduct, stations, train, and streetscape instead of being scattered as
  freestanding edible buildings or road vehicles. The 186 shared objects are divided across Levels
  2-10 at no more than 21 new types per level. With street props and goldens,
  Level 1 measures 59 opaque groups; the city-authored ceiling is 60. Other
  areas retain their previous ceiling of 24.
- Level 1 uses all 48 Chicago transit, landmark, and streetscape objects, distributed
  deterministically across its downtown-weighted gameplay placements. The
  authored budget preserves every tier's total mass while increasing buildings
  from 63 to 114 and reducing road vehicles from 102 to 74.
- Chicago civic modules are one-off identities; repeated frontage favors the
  actual tower, mid-rise, storefront, and bridgehouse profiles. Tribune Tower
  and the historic Loop storefront row are explicitly classified as buildings.
- A dedicated regression gate asserts that Level 1 contains all 24 interactive
  Chicago icons plus all 24 context rail identities, and Levels 2-10 contain
  no `cityobj_chicago_*` identity.

## Reference inventory

- `chicago-loop-city-objects-01.png`: 24 elevated rail and Loop streetscape assets.
- `chicago-loop-city-objects-02.png`: 24 Chicago buildings, plazas, landmarks, and river assets.
- `city-objects-01.png` through `city-objects-08.png`: 186 shared buildings,
  vehicles, street furniture, parking/service objects, parks/sports, roads,
  community infrastructure, people, and storefront/civic objects.

## Acceptance evidence

- Exactly 234 unique `cityobj_*` IDs, with no duplicates.
- All metric fields are positive and every ID resolves to its declared economy tier.
- Seeded Area 1 generation exposes all 234 types across levels 1–10.
- Duplicate generation remains byte-identical and the 25% direct-predecessor
  novelty invariant remains green.
- Every one of the 543 registered prop geometries has committed measured bounds.
- No new dependency, loader, backend, or unseeded generation path was added.

## Deliberate next step

The procedural assets are the scalable runtime implementation of the supplied
concept sheets. A later art pass may replace high-value IDs with authored GLB
meshes through the existing optional model-kit seam without changing IDs,
placement, saves, or economy. Live review should prioritize Level 1 silhouette
readability and real-device cost at the new 59-group peak.

## Live fidelity iteration — 2026-07-28

The first deployed 1440×900 capture proved catalog presence but contradicted
target fidelity: interactive Chicago buildings still read as unarticulated
prisms. The runtime profiles now author window bays on all four facades,
storefront awnings and entrances, rooftop plant, and stepped tower crowns.
These details are merged into each instanced geometry, adding no draw groups;
all archetypes remain under the 1,500-triangle ceiling. The live-only audit
script records fixed gameplay frames and a timed heading/camera trace for each
deployment iteration.
