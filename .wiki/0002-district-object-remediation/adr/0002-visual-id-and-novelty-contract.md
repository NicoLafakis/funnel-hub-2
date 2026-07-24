# 0002. Decouple Visual IDs from Gameplay Tiers and Enforce District Novelty

**Status:** Accepted Â· **Date:** 2026-07-24

> Serves [PRD 0002](../requirements.md).

## Context

Seven `kind` values control both gameplay and rendering. The coupling produces
a repetitive campaign and makes metro accessory variants disappear when
instances batch by `kind|golden`. The target is visible district progression
without breaking mass, size, or mobile performance.

## Decision

Gameplay kind remains authority for mass, radius, placement, and mechanic
compatibility. Add immutable registry `visualId`s chosen deterministically from
district catalogs. Districts 2â€“10 prove >=25% direct-predecessor novelty.
Instancing batches by `visualId|materialVariant|golden`.

## Alternatives

- Palette/accessory reskins: inadequate novelty and proven invisible in runtime.
- Separate non-instanced variant renderer: duplicates lifecycle and hurts performance.
- Bespoke scenes per level: too costly; breaks scalable seeded workflow.
- Remote runtime assets: breaks static/offline contract.

## Consequences

- Content authors add data/recipes instead of gameplay branches.
- Group/triangle budgets become explicit merge gates.
- Collection display names need additive normalization.
- Future local GLBs can use the same registry contract.
- The 25% requirement becomes testable rather than subjective.
