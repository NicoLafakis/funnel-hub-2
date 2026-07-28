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
   §5 covers the closed-loop play bot (`npm run test:play`) that joins
   soak-bot's brain to real Playwright input and never writes game state.
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
    (`assets/references/holeio/`), and the record of the fix. Diagnosis: a
    closed feedback loop between camera yaw and avatar facing (2394° of camera
    rotation and 85 direction reversals per 3s of held input) plus an
    unnormalised `atan2` difference; 100% of road vehicles perpendicular to
    their road, 26% of buildings and 46% of lamps in the roadway; camera
    framed ~3.5x too close; shadows off and the edibility tint flattening the
    palette to the metro accent. All fixed except row-building block
    perimeters, which are deferred with their measurements. Also records that
    the 100/100 difficulty-invariant merge gate is fitted to one RNG stream —
    the untouched generator scores 47-55/100 at any other seed salt — and that
    invariant 6 ships at 91/100 as an explicit call. Reproduce with
    `scripts/motion-probe.mjs` and `scripts/placement-audit.mjs`. §9 (added
    same day) records that the vortex-funnel hero this doc diagnosed was then
    replaced with a flat flywheel, itself superseded same day by an extruded
    thick wheel — see `art-direction.md` §2 for its current form. §10
    consolidates every open/deferred/decided-against item from that day's
    four follow-up passes (geometry, material, placement, juice) in one
    place, including the standing note that none of it has been visually
    verified on the live URL. §12-§19 (same day) are the test-instrument and
    placement work: invariant 8 is tautological (§12); invariants 5, 7 and the
    build ceiling were golden masters of one prop layout, rebuilt on a
    layout-insensitive reachability model (§13, §15) — §13 also carries the
    warning that its sweep was NOT exhaustive and that invariants 3 and 4 are
    partial golden masters it never checked; prop counts move TWO levers, not
    one (§14); the BUILD CEILING now fails honestly at 173/300 with a named
    owner rather than being tuned green (§16); the golden lottery is
    tier-weighted, with the general rule that any acceptance test touching a
    random draw must sweep the RNG STREAM as well as the layout (§17);
    built-out blocks give blocks a contiguous street wall (§18); and §19 is the
    session's largest visual finding — **18.73% of ALL props intersected
    another prop**, 57% of those with one prop essentially inside the other,
    fixed to 11.36% by adding the prop-vs-prop occupancy test that had never
    existed. §19 also records the six open items handed to the economy
    workstream and the cost paid: invariants 3 and 4 are DEGRADED to 99/100,
    accepted and documented rather than tuned away. Still unverified visually.

11. [`0004-false-level-failure/00-findings.md`](0004-false-level-failure/00-findings.md)
    — 2026-07-27 root-cause analysis of "I got over the required amount of
    mass, but still failed." Verdict: the win check is correct, but 91 of 100
    levels require the district landmark as a second condition that is stated
    once on the intro screen and never again, the mass bar clamps full for the
    rest of the run, and the fail screen unconditionally blames the mass
    target ("Time ran out at 126,069 / 100,000 mass"). Also finds that on
    L41-L50 the mega-spire landmark's size gate does not open until ~101.6% of
    the advertised target, so the displayed goal is not a sufficient goal
    there. Fix spec and regression tests in §7. Probes in `evidence/`.

## Working agreements (edit as the project evolves)

- Docs are source-of-truth for *intent*; code comments for *mechanism*.
  When they disagree, fix the doc in the same PR.
- Every new mechanic ships with its acceptance test from these docs
  implemented (logic suite or E2E).
- Keep the B1–B9 lessons visible: before merging anything touching boot,
  camera, input, economy formulas, respawns, or world coordinates, re-read
  the matching lesson.
