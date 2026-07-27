# Flywheel V2 — Design Wiki

This wiki holds the complete design for Flywheel V2 (the successor to the
3D city game at [funnel-hub.vercel.app](https://funnel-hub.vercel.app),
source: `../funnel-hub`). Read in order; each doc cites the V1 evidence it
builds on.

1. [`lessons-from-v1.md`](lessons-from-v1.md) — 9 shipped bugs (B1–B9) and
   4 design flaws (D1–D4) with root causes. Every proposal traces here.
2. [`game-design.md`](game-design.md) — camera-relative controls + orbit,
   minimap, eat-loop juice, rival archetypes, 5 testable difficulty
   invariants.
3. [`art-direction.md`](art-direction.md) — procedural districts (streets,
   zoning, ground texture), vortex hero, edibility signaling, metro
   signatures.
4. [`tech-architecture.md`](tech-architecture.md) — instancing/pooling/
   spatial hash, seeded worldgen, module map, E2E + CI, responsive/mobile.
5. [`content-and-meta.md`](content-and-meta.md) — 100-level unlock cadence,
   district identities, shop-as-builds, daily challenge, onboarding.
6. [`roadmap.md`](roadmap.md) — 4 phases with exit criteria and risks.
7. [`economy-balance-audit.md`](economy-balance-audit.md) — 2026-07-24 audit
   of mass-per-level vs. mass-available vs. accumulation rate. Finding: the
   combo multiplier is applied to mass at award time but is absent from the
   4.28x available-mass invariant, so levels are winnable on ~20% of the
   props in under 17% of the timer.
8. [`0001-level-progression-remediation/00-overview.md`](0001-level-progression-remediation/00-overview.md)
   — implementation-ready remediation package for progression mechanics:
   requirements, target-normalized economy design, decision record, tests,
   phased tasks, and save-compatible reward changes.

9. [`0002-district-object-remediation/00-overview.md`](0002-district-object-remediation/00-overview.md)
   â€” implementation-ready plan for district-specific object catalogs, visible
   variants, and a tested 25% level-to-level visual-novelty contract.

10. [`0003-hole-feel-and-visual-fidelity/00-findings.md`](0003-hole-feel-and-visual-fidelity/00-findings.md)
    — 2026-07-27 investigation of the "hole fights you when turning" motion
    complaint and the gap to the Hole.io reference art
    (`assets/references/holeio/`). Findings: the motion problem is a single
    closed feedback loop between camera yaw and avatar facing (2394° of camera
    rotation and 85 direction reversals per 3s of held input) plus an
    unnormalised `atan2` difference; 100% of road vehicles are placed
    perpendicular to their road, 26% of buildings and 46% of street lamps
    stand in the roadway; and the camera frames ~3.5x too close. Reproduce
    with `scripts/motion-probe.mjs` and `scripts/placement-audit.mjs`.

## Working agreements (edit as the project evolves)

- Docs are source-of-truth for *intent*; code comments for *mechanism*.
  When they disagree, fix the doc in the same PR.
- Every new mechanic ships with its acceptance test from these docs
  implemented (logic suite or E2E).
- Keep the B1–B9 lessons visible: before merging anything touching boot,
  camera, input, economy formulas, respawns, or world coordinates, re-read
  the matching lesson.
