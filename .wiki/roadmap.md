# V2 Roadmap

**Reconciled:** 2026-07-28
**Current verified baseline:** [`current-state.md`](current-state.md)

## Delivered baseline

Phases 1–4 established the playable V2 foundation:

- camera-relative steering, fixed-yaw camera/orbit, minimap, and extruded flywheel hero;
- seeded district layouts, zoning, ground surfaces, metro signatures, and visual catalogs;
- instancing, pooling/reuse, spatial queries, procedural asset fallbacks, and v2 saves;
- target-normalized progression, objective stars, mutually exclusive builds, metro tokens/perks, daily state, and collection rewards;
- rival archetypes, capstone mechanics, failure-state communication, and the closed-loop desktop play bot;
- ground depth/blend corrections, texel-snapped directional shadows, atmosphere, and horizon-seam closure.

The earlier phase estimates and historical check counts are no longer useful
planning inputs and have been removed. Their implementation evidence remains
in packages 0001–0005 and git history.

## Current release blockers

1. Maximum-build duration passes 173/300 combinations and remains explicit balance debt.
2. The true-touch live matrix and touch bot are implemented but await an authorized deployment; real-device validation remains incomplete.
3. Mobile UI/accessibility and continuation changes are implemented but await live viewport verification.
4. Real-device mobile frame time is unmeasured.

## Phase 5 — Mobile readiness and physical world integrity (in progress)

1. First-touch movement, second-touch camera, and lifecycle-safe input.
2. Immediate Start plus direct Level 1 routing for fresh players.
3. Authoritative physical bounds and deterministic legal-slot placement.
4. Final-transform collision, road, lane, facing, spawn, camera, and landmark gates.
5. True touch/mobile live-browser coverage and real-device sessions.
6. Adaptive rendering quality and read-only diagnostics.
7. Approved title, pause/sound, safe-area, typography, Settings, and post-level continuation improvements.

Scope, architecture, acceptance criteria, and checkpoints:
[`0006-mobile-readiness-and-placement/00-overview.md`](0006-mobile-readiness-and-placement/00-overview.md).

**Exit:**

- all nine difficulty invariants pass 100/100;
- final meaningful placement penetration is zero across the required campaign matrix;
- required touch journeys pass against the authorized live deployment;
- iOS and Android device sessions meet the agreed usability and performance floor;
- approved UI surfaces remain reachable at 360×640 and 800×450.

## Deferred product decisions

- Prestige/New Game+ requires retention evidence from playtests.
- Content drips follow stability and mobile-readiness work.
- Minimum-supported mobile hardware and the final p95 frame-time floor need an owner decision before release validation.

## Explicitly out of scope

- Multiplayer.
- Monetization, ads, accounts, or any backend.
- Engine or bundler migration.
- New game modes beyond the daily challenge.
- More avatar, effects, meta, or environmental complexity before Phase 5's reach/control/understand/continue goals are met.

## Active risks

- A bounds migration touches generation, collision, consumption distance,
  spatial indexing, authored models, fallbacks, and deterministic snapshots.
- Placement fixes can alter mass reachability and RNG consumption; layout and
  random-stream sweeps must accompany the 100-level invariant suite.
- Quality downgrades can destabilize the existing shadow fix unless snapping,
  bias, and coverage derive from the active shadow-map size.
- Mobile automation can produce false confidence if it only resizes a desktop
  viewport; required profiles must enable touch/mobile context behavior.
- UI improvements can create small-landscape regressions unless each approved
  DOM change ships with CSS and both required viewport checks.
