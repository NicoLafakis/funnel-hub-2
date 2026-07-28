# Tasks — Mobile Readiness and Scale-Accurate Placement

**Status:** Implementation in progress
**Date:** 2026-07-28

Each checkpoint should remain independently reviewable. Do not deploy without explicit authorization.

## Checkpoint 0 — Lock evidence and baselines

- [x] Add failing pure tests for first-touch ownership and release/cancellation behavior.
- [x] Add failing startup tests with delayed and rejected optional assets.
- [x] Promote final-transform intersection reporting into a failing placement gate.
- [x] Capture the current 100-level invariant and placement baseline by violation category.
- [ ] Define the minimum-supported mobile hardware decision owner and deadline.

**Exit:** The current defects reproduce deterministically, without changing production behavior.

## Checkpoint 1 — Make the game immediately playable

- [x] Implement ADR-0003: first active touch movement, second touch camera, stable roles.
- [x] Clear touch state on pause, blur, visibility loss, and cancellation; verify neutral in under 300 ms.
- [x] Separate essential boot from optional texture/model loading.
- [x] Wire Start before optional async work and add an idempotent transition latch. The visible loading state remains part of the frontend approval gate.
- [x] Route fresh saves directly to Level 1 within two taps; retain map-first routing for returning saves.
- [x] Update game-design and architecture docs that currently specify left/right touch halves.

**Exit:** Fresh mobile play works with optional assets delayed or missing, and input tests pass.

## Checkpoint 2 — Establish authoritative physical bounds

- [x] Inventory every procedural, model-kit, fallback, landmark, building, and prop visual.
- [x] Define pure-data visual bounds and ground footprints keyed by `visualId`, with documented kind inheritance.
- [x] Normalize pivot/origin, scale, and rotation conventions.
- [x] Add bounds-parity verification against independently measured generated geometry.
- [ ] Make collision, placement, spatial indexing, consumption distance, and diagnostics consume the same bounds contract where applicable.

**Exit:** Every placeable visual resolves validated physical bounds; no renderer import leaks into data/systems.

## Checkpoint 3 — Replace repair-by-overlap with legal-slot placement

- [x] Generate deterministic legal slots from roads, plots, zones, landmarks, spawn/camera clearance, and final footprints.
- [ ] Allocate required/objective content before decorative density.
- [x] Reject or deterministically relocate illegal candidates; do not accept unresolved repair penetrations.
- [x] Validate after final visual, scale, rotation, and transform selection.
- [x] Make all-kind overlap, reserved-lane, road, facing, and bounds checks merge-blocking.
- [ ] Expand seed/RNG-stream and targeted topology coverage in the test strategy.
- [x] Run `npm test`; retain all five difficulty invariants at 100/100.

**Exit:** Final meaningful placement penetration is zero across the required campaign matrix, with reproducible failure artifacts.

## Checkpoint 4 — Prove mobile behavior in automation

- [x] Replace viewport-only “mobile” contexts with `isMobile`, `hasTouch`, mobile UA, and DPR profiles.
- [ ] Add fresh-player, lower-right first touch, second-finger camera, eat/HUD, landmark, orientation, background/resume, completion, and fallback journeys.
- [x] Add traces/screenshots/console/telemetry on failure.
- [x] Point browser automation only at an explicitly authorized deployed URL.
- [x] Add the live-only mobile matrix to CI. It requires the `FLYWHEEL_LIVE_URL` repository variable and does not fall back to localhost.

**Exit:** All live journeys pass on iPhone, Android, small portrait, landscape, and desktop-control profiles.

## Checkpoint 5 — Add adaptive rendering and diagnostics

- [x] Define High/Medium/Low profiles covering DPR, shadows, rival feedback density, optional detail, and shadow distance.
- [x] Implement deterministic initial selection and hysteresis-based downgrade/recovery.
- [x] Fit shadow-camera bounds independently at every shadow-map size.
- [x] Add persisted manual override through the v2 save migration chain.
- [x] Add development-only read-only telemetry for frame time, tier/profile, DPR, draws, triangles, instances, active effects, input roles, viewport/orientation/safe area, and supported memory signals.
- [x] Keep telemetry and the touch bot read-only; live execution remains a release-evidence item.

**Exit:** Synthetic traces pass, quality does not flap, and representative devices meet the agreed performance floor.

## Checkpoint 6 — Mobile UI and continuation

- [x] Nico explicitly approved all named frontend elements on 2026-07-28.
- [x] Reduce title copy to title, one-line premise, Play, sound, and attribution.
- [x] Add reachable 44×44 pause and sound controls plus a pause menu.
- [x] Apply safe-area insets to HUD, controls, toasts, and action surfaces.
- [x] Raise essential mobile text to at least 14 px, add named/non-color cues, preserve reduced motion, and permit browser zoom.
- [x] Make Next Level primary, Upgrade secondary, and Map tertiary after completion.
- [ ] Verify all changed overlays at 360×640 and 800×450.

**Exit:** Approved surfaces pass accessibility/reachability checks and one-tap continuation works.

## Checkpoint 7 — Device validation and release decision

- [ ] Add a touch-capable closed-loop bot with clean and sloppy profiles.
- [ ] Run iOS Safari and Android Chrome sessions, including orientation and background/resume.
- [ ] Run a 10-minute performance soak on agreed low/mid hardware.
- [ ] Conduct five fresh-player and five returning-player observed sessions.
- [ ] Resolve P0 regressions and document any accepted P1/P2 deferrals.
- [x] Update wiki source-of-truth pages for the implementation; live/device release evidence remains pending.

**Exit:** Definition of done in `test-strategy.md` is met and Nico makes the explicit deploy decision.
