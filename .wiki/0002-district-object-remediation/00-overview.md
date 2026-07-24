# District Object Remediation â€” Objective Overview

**Tier:** 2 Â· **Date:** 2026-07-24 Â· **Status:** implemented; live validation pending deployment authorization

## What was asked

Replace the visually repetitive object system with themed objects that evolve
through every ten-district metro. At least 25% of the placed objects in each
district must be visually new compared with the preceding district, while
some previously introduced objects may repeat.

## What it really serves

Make the player understand where they are and how far they have progressed
from the world itself. The game retains its fast, readable, low-poly
eat-and-grow language while each district becomes a different part of its
metro rather than the same seven objects under a new color filter.

## Evidence that forces this work

The current code has seven gameplay kinds in all 100 levels. Only one kind per
metro is marked as a variant, covering 3.0â€“7.9% of placements. The instanced
renderer groups by `kind|golden`, ignores the variant descriptor, and renders
the base geometry even when district and collection systems believe a variant
exists.

Comparable games derive readability from a clear size ladder and coherent
object families: [Hole.io](https://play.google.com/store/apps/details?id=io.voodoo.holeio)
uses escalating street clutter, vehicles, and structures; [Attack Hole](https://apps.apple.com/us/app/attack-hole-black-hole-games/id1661115841)
uses a coherent weapon vocabulary; [All in Hole](https://apps.apple.com/us/app/all-in-hole-black-hole-games/id6503284107)
uses themed target sets and regular new levels. These are patterns to adapt,
not assets or proprietary formulas to copy.

## Load-bearing invariant

For every district after the first in a metro, at least 25% of placed initial
props shall resolve to visual archetypes absent from the preceding district.
Every resolved `visualId` shall render its authored geometry/material while
its gameplay tier, mass, radius, and deterministic placement remain valid.

## 20 moves ahead

- **Next wants:** the collection can show things that actually existed in the
  world, and future metros add data rather than renderer branches.
- **Breaks at scale / edges:** unlimited unique geometry breaks the mobile
  draw-call/GPU budget; archetype and group budgets are mandatory.
- **Unlocks:** visual collection pages, curated bonus districts, seasonal
  swaps, and future local-asset/LOD workflows.
- **Doors kept open:** gameplay tier and `visualId` are separate; procedural
  recipes remain supported alongside future authored local meshes.
- **Doors shut:** palette-only metros, invisible variants, and one-geometry-
  per-gameplay-tier rendering.

## Scope line

- **Building:** data-driven visual registry, district catalogs/reveal
  schedules, variant-aware instancing, ten-metro content production,
  validation, screenshots, and budgets.
- **Surfacing for Nico's call:** procedural-only initial catalog versus an
  approved local GLB supplement; exact novelty denominator.
- **Dropping:** photoreal conversion, a new art style, remote asset loading,
  monetization, and UI redesign.

## Caliber and package

Tier 2 because this crosses content generation, renderer contract,
deterministic testing, collection/save semantics, and performance. Package:

- [Requirements / PRD](requirements.md)
- [Technical design](design.md)
- [Visual catalog brief](art-bible.md)
- [Decision record](adr/0002-visual-id-and-novelty-contract.md)
- [Test strategy](test-strategy.md)
- [Implementation plan](tasks.md)
- [Completion audit](completion-audit.md)

## Shipped implementation evidence

- `src/content/archetypes.js` owns 300 immutable visual IDs: 30 per metro,
  distributed through 100 validated district catalogs.
- `generateDistrict()` uses an independent seeded visual stream and reserves
  at least 25% of initial placements for IDs absent from the predecessor.
- Instancing keys are `visualId|materialVariant|golden`; procedural silhouette
  cues are baked into merged geometry and cannot disappear during batching.
- The measured automated envelope is 25.2% minimum novelty, 12 maximum opaque
  groups, and 360 maximum triangles for any non-landmark archetype.
- Legacy display names normalize into stable IDs; unknown keys remain in the
  diagnostic legacy bucket and never become renderer input.
- Logic, determinism, and all nine progression invariants pass across 100/100
  levels. The production 1/5/10 matrix and three-viewport smoke pass at
  `https://funnel-hub-umber.vercel.app`; physical target-device FPS sampling
  remains external calibration because headless cadence is not hardware proof.
