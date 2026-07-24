# District Object Remediation — Completion Audit

> Audited 2026-07-24 against [requirements](requirements.md),
> [test strategy](test-strategy.md), and [implementation tasks](tasks.md).

This audit distinguishes source/build proof from evidence that can only come
from the deployed game. Passing a narrow unit test is not treated as proof of
a broader visual or device-performance claim.

## Acceptance evidence

| Criterion | Status | Authoritative evidence |
|---|---|---|
| AC-001 / FR-001–002 | Proven | `VISUAL_ARCHETYPES` contains 300 validated descriptors with gameplay kind, recipe, material role, dimensions, silhouette metadata, introduction, returns, and stable collection key. All 100 generated layouts resolve every placement to a matching descriptor. |
| AC-002 / FR-003–004 | Proven | `DISTRICT_CATALOGS` contains ten catalogs for each of ten metros. `npm run test:district-objects` reports 100 catalogs and a minimum non-initial novelty ratio of 0.252. |
| AC-003 / FR-005 | Proven | `createInstancedWorld()` keys groups by `visualId\|materialVariant\|golden`. Logic tests construct a base car and former Black Cab variant, prove different merged-geometry fingerprints, and observe two runtime groups. |
| AC-004 / FR-006 | Proven | Visual selection uses an independent seeded RNG while preserving the former variant selector's gameplay RNG consumption point. `npm test` passes all 143 logic checks and all nine gameplay invariants across 100/100 levels. Dynamic additions resolve through renderer fallbacks. |
| AC-005 / FR-007–008 | Proven | Initial props write registered `collectionKey` values. Skyline-opedia exposes exactly the 30 visible IDs per metro. Legacy display names normalize to permanent IDs, normalization is idempotent, and unresolved save keys remain in `legacyCollectionKeys` without becoming renderer input. |
| AC-006 / FR-009 | Proven | Logic and invariant suites regenerate all 100 levels twice and compare visual-ID/run summaries byte-for-byte. |
| AC-007 / FR-010, static portion | Proven | All 300 geometry fingerprints are finite and at or below 1,500 triangles; observed maximum is 360 per archetype. All 100 layouts stay at or below 12 opaque prop groups. An instrumented frame update creates no geometry/material groups. Build and ship checklist pass. |
| AC-007 / FR-010, device portion | Production proxy proven; physical device pending | Production headless Chromium at 390x844 showed about 33.3 ms median and 50 ms p95 normally and under 4x CPU throttling. The identical cadence indicates a headless scheduling ceiling, so this is regression evidence, not a target-device 60 FPS claim. |
| AC-008 / FR-011–012 | Proven in production review | Fixed-framing production captures were reviewed for districts 1, 5, and 10 in all ten metros. Initial-frame obstructions found at levels 30 and 70 were remediated; final mobile captures show readable framing with no page or console errors. |
| AC-009 | Proven | `art-direction.md`, `content-and-meta.md`, the accepted ADR, requirements, implementation status, and shipped module contracts describe the same 30-archetype/25%-novelty system. |

## Command evidence

Executed successfully on 2026-07-24:

```text
npm test
  143 logic checks passed
  all 9 invariants passed, 100/100 levels

npm run test:district-objects
  300 archetypes
  100 catalogs
  minimum novelty 0.252
  maximum groups 12
  maximum active merged-geometry triangles 1956

npm run build
  dist built successfully

npm run ship
  ship checklist passed 5/5
  production deployment dpl_4UK8UAuoQgxmSdkdGzmMf91T6Qq3 READY
  stable alias https://funnel-hub-umber.vercel.app
```

`git diff --check` also passes. Line-ending notices are repository/worktree
warnings rather than whitespace errors.

## Live verification record

- Boot smoke passed against production at 1440x900, 800x450, and 390x844 with
  zero page or console errors.
- Districts 1, 5, and 10 were captured for all ten metros from production.
- Review found level 70's building frontage and level 30's landmark/bus cluster
  obstructing the initial chase frame. Seeded corridor corrections and a
  radius-derived camera safety envelope were implemented, retested, and
  redeployed.
- Final level 1, 30, and 70 captures booted with the HUD visible and zero page
  or console errors.
- Remaining external calibration: sample median/p95 FPS on intended physical
  mobile hardware. Headless timing is not substituted for that measurement.
