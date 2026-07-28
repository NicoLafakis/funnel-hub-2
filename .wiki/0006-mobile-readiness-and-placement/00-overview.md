# Mobile Readiness and Scale-Accurate Placement - Objective Overview

**Tier:** 2 - **Date:** 2026-07-28 - **Status:** implementation complete; live/device validation pending

## What was asked

Review the external mobile upgrade handoff and combine it with the measured
object-placement problem into one implementation-ready update plan.

Primary evidence:

- [`Testing-01-Flywheel Mobile Upgrade Handoff.pdf`](../external-test-runs/Testing-01-Flywheel%20Mobile%20Upgrade%20Handoff.pdf)
- [`0003-hole-feel-and-visual-fidelity/00-findings.md` section 19](../0003-hole-feel-and-visual-fidelity/00-findings.md)
- Current source at `6600cc3`, the same revision named by the external handoff

## What it really serves

Make the good game that now exists immediately usable on a phone and make its
city physically believable. A new player should be able to tap Play, move with
either thumb, eat their first object, understand the goal, and continue to the
next level without fighting boot latency, navigation, camera ownership, frame
rate, or objects embedded in each other.

## Evidence reconciliation

The external handoff remains the source evidence. Its reference build was
`6600cc3`; the current worktree implements the consolidated response.

| Feedback area | Current-tree verdict | Evidence |
|---|---|---|
| First touch moves from either side | Implemented | First active touch owns movement; second owns camera; roles remain stable through release/cancellation. |
| Fresh save enters Level 1 directly | Implemented | Fresh saves route directly to Level 1; returning saves retain map-first routing. |
| Start is ready while assets load | Implemented | Start wiring is immediate and optional models/textures resolve independently with procedural fallback. |
| Real mobile touch E2E | Awaiting live run | A live-only four-profile CDP multi-touch matrix and read-only Level 1 bot exist; the updated worktree is not deployed. |
| Adaptive graphics | Implemented | Persisted Auto/High/Medium/Low profiles control DPR, shadows, shadow reach, rival feedback, and optional detail with stable automatic downgrade. |
| Shorter opening screen | Implemented | The visible title path is title, one-line premise, Play, sound, and attribution. |
| Touch pause and sound controls | Implemented | Named 44x44 controls and a pause/settings overlay are wired and persisted. |
| Safe-area support | Implemented | All four safe-area insets cover HUD, controls, notifications, touch zones, and action surfaces. |
| Text/zoom accessibility | Implemented; live check pending | Essential mobile text is at least 14px, reduced motion remains supported, and browser zoom is permitted. |
| Optional shop / direct next level | Implemented | Next Level is primary; Upgrade and Map remain available; final-level Next reaches victory. |
| Closed-loop touch bot | Implemented; live check pending | The live script performs a touch-only, read-only Level 1 route without progression writes. |
| Mobile development telemetry | Implemented | Diagnostics expose frame time, tier/profile, DPR, calls, triangles, memory, instances/effects, touch roles, viewport, orientation, and safe areas. |
| Scale-accurate placement | Implemented | Generated final-geometry bounds feed deterministic legal placement; the hard all-kind/landmark audit reports zero penetrations over 0.25 units. |

Existing mechanisms to preserve and extend:

- explicit input state machine, `pointercancel`/blur cleanup, and 0.25-second
  release damping;
- seeded district generation, rendered-footprint math, and shared occupancy;
- procedural fallbacks when textures or model assets are missing;
- instancing, pooling, reduced motion, scrollable overlays, and responsive
  360x640 / 800x450 support;
- objective-aware HUD and failure copy;
- closed-loop desktop play bot that never writes game state.

## Load-bearing invariant

At every shippable checkpoint, a fresh mobile player can reach and control
Level 1 with touch alone, and every generated object occupies a legal,
scale-accurate footprint: no enabled control may be inert, no active touch may
silently change roles, and no meaningful prop penetration may survive the
final placement pass.

## 20 moves ahead

- **Next wants:** reliable device calibration, a settings surface for manual
  quality control, and touch-first play-bot coverage for future mechanics.
- **Breaks at scale:** rendering quality and placement capacity fail first as
  prop counts and visual variants grow; both therefore become data-driven
  contracts rather than additional branches in `main.js`.
- **Unlocks:** trustworthy phone release gates, reproducible performance
  reports, valid city layouts for future metros, and onboarding metrics that
  distinguish boot, control, objective, and performance failures.
- **Doors kept open:** gameplay radius remains separate from rendered physical
  bounds; quality tiers can add future LODs; desktop input and existing saves
  remain compatible.
- **Doors shut:** viewport-only tests being called mobile tests, first-touch
  half-screen role assignment, post-placement collision acceptance, and a
  permanently fixed high-end renderer configuration.

## Scope line

- **Building:** first-touch contract; fresh/returning start routing; immediate
  Start readiness; touch E2E; physical-bounds registry; deterministic legal-slot
  placement; all-kind placement gate; adaptive graphics; performance/input
  diagnostics; pause, sound, safe areas, text/zoom fixes; optional shop; direct
  next level; live and real-device validation plan.
- **Approved and implemented on 2026-07-28:** title structure/copy, visible
  pause/sound controls, pause menu, safe-area spacing, HUD text sizing, Level
  Complete actions, and Settings quality control.
- **Deferred:** haptics, new visual effects, new meta systems, new content,
  backend analytics, engine swap, new npm dependencies, and hot-swapping a
  procedural Level 1 to authored models after play has begun.

## Caliber and package

Tier 2 because this is a cross-cutting release-readiness update spanning input,
boot, UI, rendering, world generation, saves, automation, and documentation.
It adds no backend, dependency, destructive migration, authentication, payment,
or external API, so Tier 3 operational/security documents are not warranted.

- [Requirements / PRD](requirements.md)
- [Technical design](design.md)
- [Touch ownership ADR](adr/0003-first-touch-owns-movement.md)
- [Placement geometry ADR](adr/0004-physical-bounds-drive-placement.md)
- [Test strategy](test-strategy.md)
- [Implementation plan](tasks.md)
