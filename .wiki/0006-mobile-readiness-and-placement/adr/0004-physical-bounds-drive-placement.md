# 0004. Final Physical Bounds Drive Placement

**Status:** Accepted - **Date:** 2026-07-28

> Serves [PRD 0006](../requirements.md).

## Context

The generator now knows rendered kind footprints and uses shared occupancy,
but it still begins with generic independent point pools and resolves conflicts
through repair passes. The final audit leaves 9.2% of buildings and a documented
11.36% of all props intersecting. Visual variants can also extend geometry
beyond the kind-level `DIMENSIONS` record. Gameplay radius is an edibility
quantity, not a sufficient physical placement contract.

## Decision

Placement shall be driven by a committed pure-data physical-bounds registry
keyed by `visualId`, with kind inheritance. The registry carries complete visual
bounds and a separate solid ground footprint. A no-dependency build/validation
script derives complete bounds from final merged geometry; tests reject stale
records. Ground footprints may explicitly exclude aerial overhangs such as lamp
arms and awnings.

The seeded generator allocates footprint-sized legal slots under simultaneous
zone, road, lane, parcel, spawn, camera, landmark, world-bound, and occupancy
constraints. Post-placement operations must finish with the same constraints
valid. A missing legal candidate is a diagnostic generation failure or a
deterministic capacity-extension event, never permission to overlap or drop a
budgeted prop.

## Alternatives considered

- Continue tuning repair offsets: rejected because it treats symptoms and creates priority conflicts.
- Use gameplay radius as occupancy: rejected because it does not match final rendered width/depth.
- Use full visual AABB for every collision: rejected because realistic overhangs do not occupy ground.
- Add a physics engine: rejected because it adds a dependency/runtime cost and threatens seeded determinism.
- Hand-author 300 unrelated rectangles: rejected in favor of kind inheritance, recipe overrides, and geometry validation.

## Consequences

- Rendering, placement, shadows, and audits gain a shared measurement language.
- Visual recipes that alter ground footprint must declare an override and pass geometry validation.
- District generation becomes constraint allocation rather than scatter-and-repair.
- Generator failures become louder and more reproducible.
- The asset pipeline gains a committed generated-data artifact but no new dependency.
- `art-direction.md`, `tech-architecture.md`, and findings section 19 must be updated when implemented.
