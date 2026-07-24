# District Object Remediation â€” Implementation Plan

> [Objective overview](00-overview.md) Â· [Requirements](requirements.md) Â· [Technical design](design.md) Â· [Test strategy](test-strategy.md)

Protect gameplay while changing visual content. Do not retune mass/radius:
these tasks preserve the seven gameplay tiers and progression invariants.

- [x] **1. Freeze the baseline.** Report all 100 levels' kinds, marked
  variants, actual renderer groups, triangle estimate, and predecessor
  novelty. Capture live baseline only after authorization. Files: diagnostic
  script and existing golden/live tooling. Done when the known 0% runtime
  novelty is reproducible.

- [x] **2. Add pure visual registry.** Add `visualId`, validation, fallback
  descriptors, material roles, and stable collection keys without changing
  selection. Files: new `src/content/archetypes.js`, `propkit`, tests. Done
  when all legacy props resolve to a visible fallback archetype.

- [x] **3. Make instancing visual-ID aware.** Update grouping, cache keys,
  group creation, and prop contract from `kind|golden` to
  `visualId|materialVariant|golden`. Preserve color, edibility, golden, pulse,
  hide, wobble, and dynamic add paths. Files: `instancing`, `propkit`, `main`,
  tests. Done when a former accessory variant has distinct actual geometry/group.

- [x] **4. Stabilize save/collection keys.** Extend normalizer and existing
  sighting writer with legacy-name mapping and defensive unknown handling.
  Files: `save`, `collection`, tests. Done when old fixtures keep progress and
  unresolvable keys never reach rendering.

- [x] **5. Add seeded catalog selection.** Author `DISTRICT_CATALOGS`, select
  IDs in `generateDistrict`, and emit a novelty report. Preserve placement,
  mass, radius, zoning, and special flags. Done when duplicate generation is
  byte-identical and failures name exact missing archetypes.

- [x] **6. Build Harbor vertical slice.** Produce 30 Harbor archetypes and all
  ten catalogs using art-bible gates. Validate >=25% novelty, silhouette,
  contrast, budget, and runtime rendering. Done when Harbor is playable and
  all existing logic/invariant tests remain green.

- [x] **7. Catalog batch A.** Add Le Vieux Continent + Old Fog Town, including
  visible baguette-bike and black-cab replacements. Done when 20 catalogs pass
  deterministic/performance/visual gates.

- [x] **8. Catalog batch B.** Add Neon District + Desert Spires, preserving
  no-per-prop-light policy. Done when 20 catalogs pass gates.

- [x] **9. Catalog batch C.** Add Coliseum City + Carnival Coast. Reuse a
  primitive recipe only if silhouettes remain distinct. Done when 20 catalogs pass.

- [x] **10. Catalog batch D.** Add Red Square Heights + Harbor Opera Bay.
  Verify snow/water effects do not substitute for geometry diversity. Done when 20 catalogs pass.

- [x] **11. Add Capital Prime and reconcile docs.** Complete its ten catalogs,
  preserve Portal Tower hierarchy, run full campaign tests, then update art
  direction/content-meta with shipped contract. Done when automated criteria
  are green.

- [x] **12. Harden regression/performance coverage.** Add group/triangle and
  geometry-fingerprint tests, allocation guards, and 1/5/10 visual matrix.
  Done when invisible variants, low novelty, invalid IDs, and budget overruns
  fail automated checks.

- [x] **13. Gates and production calibration.** Run `npm test`, `npm run build`,
  `npm run ship` without deployment. After explicit authorization, deploy and
  complete live capture/performance/silhouette review. Retune only catalog data
  and recipes inside budgets. Done when every acceptance criterion is evidenced.

  Gates passed on 2026-07-24: 143 logic checks, all nine invariants across
  100/100 levels, district-object report, build, ship checklist, three-viewport
  production boot smoke, and the full 1/5/10 visual matrix. Production is live
  as deployment `dpl_4UK8UAuoQgxmSdkdGzmMf91T6Qq3`. Physical target-device FPS
  sampling remains external calibration; headless timing is a regression proxy.
