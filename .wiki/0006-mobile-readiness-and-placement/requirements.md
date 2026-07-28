# PRD 0006: Mobile Readiness and Scale-Accurate Placement

> [Objective overview](00-overview.md) - [Technical design](design.md) - [Implementation plan](tasks.md)

- **Status:** Implementation in progress
- **Priority:** P0 release-readiness program
- **Owner surface:** input, bootstrap/flow, renderer, district generation, UI overlays, save normalization, automated tests
- **Migration:** additive save normalization only; existing blobs remain valid
- **Source evidence:** external mobile handoff at `6600cc3`; placement findings section 19

## 1. Overview / problem / goal

The current build contains a stronger game but still places avoidable friction
in front of mobile players and leaves visibly invalid object intersections in
generated cities. The goal is a touch-first first session and a physically
valid world that remain deterministic, performant, and save-compatible.

## 2. Load-bearing invariant

At every shippable checkpoint, a fresh mobile player can reach and control
Level 1 with touch alone, and every generated object occupies a legal,
scale-accurate footprint: no enabled control may be inert, no active touch may
silently change roles, and no meaningful prop penetration may survive the
final placement pass.

## 3. Goals

1. Reach controllable Level 1 from a fresh save in at most two taps.
2. Make the first non-UI touch movement anywhere on the play surface.
3. Keep camera control independent on a second touch without interrupting movement.
4. Make Start functional or explicitly loading whenever it appears actionable.
5. Replace viewport-only mobile confidence with real touch-event coverage.
6. Eliminate meaningful all-kind prop intersections using final rendered bounds.
7. Adapt rendering cost to device capability without erasing the visual identity.
8. Make pause, sound, safe areas, readable text, and next-level continuation usable by touch.
9. Preserve deterministic generation, exact prop budgets, difficulty formulas, desktop controls, and old saves.

## 4. Non-goals

- No new npm dependency, CSS framework, backend, account, cloud telemetry, or analytics service.
- No rewrite of the avatar, visual identity, economy, progression, or objective system.
- No automatic deployment.
- No frontend implementation until Nico explicitly approves the named frontend surfaces.
- No requirement to make decorative non-collidable geometry physically exact when it does not alter the ground footprint.
- No hot replacement of already-instanced Level 1 art after optional models finish loading.
- Haptics and a sloppy touch bot are follow-up work after the P0/P1 release gate.

## 5. Personas and user stories

- As a new phone player, I want my first thumb gesture to move immediately so the controls do not feel broken.
- As a returning player, I want fast access to the map and my progression without losing existing behavior.
- As a player on a weaker phone, I want the game to reduce expensive effects before input and frame pacing degrade.
- As a player, I want buildings, vehicles, people, and street furniture to occupy believable ground positions.
- As a tester, I want repeatable touch, layout, and performance evidence so a narrow desktop browser is never mistaken for a phone.
- As a maintainer, I want one physical-bounds contract reused by rendering, placement, shadows, and audits.

## 6. Functional requirements

### Touch input

- **FR-001:** The first active non-UI touch shall receive the movement role regardless of horizontal position.
- **FR-002:** A second concurrent touch shall receive the camera-orbit role; optional pinch pitch may remain on the two-touch pair.
- **FR-003:** Touch roles shall remain stable for each pointer's lifetime and shall not silently swap mid-gesture.
- **FR-004:** If the movement touch ends while the camera touch remains, camera control remains camera control; the next new touch may claim movement.
- **FR-005:** Releasing the camera touch shall not cancel or reset the movement touch.
- **FR-006:** `pointercancel`, blur, orientation change, page hiding, and interrupted gestures shall clear input safely.
- **FR-007:** Releasing all movement input shall stop the avatar within 300ms.
- **FR-008:** Desktop keyboard, mouse drag-target, right-drag orbit, and keyboard orbit shall remain supported.

### Boot and first session

- **FR-009:** Start interaction shall be wired before optional texture/model loading begins to block user input.
- **FR-010:** Repeated Start taps shall be idempotent and begin at most one transition.
- **FR-011:** Optional model/texture failure shall retain procedural gameplay.
- **FR-012:** A fresh save shall route Play directly to Level 1 without the map, level selection, or intro-confirmation overlay.
- **FR-013:** A returning save shall retain map access and a clear Continue/Play path.
- **FR-014:** When a required initialization step is not ready, Start shall expose an accessible loading state or a visible actionable error; taps shall never disappear silently.

### Physical placement

- **FR-015:** Every placeable `visualId` shall resolve to authoritative local width, depth, height, base anchor, forward axis, allowed zones, and clearance metadata.
- **FR-016:** Physical bounds shall be expressed from the shared `WORLD_UNITS_PER_METRE` contract and converted in pure data/logic code without importing Three.js into data/content generation.
- **FR-017:** Placement shall use the final rendered oriented footprint, including authored visual variant, `scaleMult`, and yaw; gameplay radius alone shall never stand in for physical size.
- **FR-018:** Roads, lanes, sidewalks, parcels, plazas, parks, spawn clearance, camera clearance, landmarks, and already accepted props shall be simultaneous placement constraints.
- **FR-019:** When a candidate is invalid, the seeded solver shall try another legal candidate or deterministically produce more legal capacity; it shall not drop a budgeted prop or accept an illegal collision as a fallback.
- **FR-020:** Party-wall adjacency may share an edge but shall not penetrate beyond the common floating-point tolerance.
- **FR-021:** The final post-repair layout shall be audited after all clamps, road corrections, mega scaling, and re-facing operations.
- **FR-022:** Same level inputs and seed streams shall produce byte-identical output.

### Mobile quality and diagnostics

- **FR-023:** The renderer shall support high, medium, and low quality profiles without a page restart.
- **FR-024:** Profiles shall control DPR cap, shadow-map size/enabled state, shadow distance, particles/feedback density, decorative animation, and optional detail cost through existing systems.
- **FR-025:** Shadow texel snapping, bias derivation, and coverage shall use the active shadow-map size and shall retain the ground-stability fix.
- **FR-026:** Automatic quality selection shall make a conservative initial mobile choice and may only downgrade during a session after sustained poor frame time; it shall not oscillate during active play.
- **FR-027:** Automatic selection and manual override shall persist locally with backward-compatible defaults.
- **FR-028:** Development diagnostics shall expose average/p95 frame time, sustained FPS, long frames, active quality/DPR, renderer calls/triangles/memory, visible instances, active effects, viewport/orientation/safe areas, and active pointer roles without sending data off-device.

### Mobile UI, accessibility, and flow

- **FR-029:** Mobile players shall have visible touch-accessible pause and sound controls with at least 44x44 CSS-pixel targets.
- **FR-030:** Pausing or safely suspending shall stop the gameplay timer; background/resume shall not charge hidden time.
- **FR-031:** HUD, minimap, controls, notifications, overlays, toasts, and bottom actions shall respect all four safe-area insets.
- **FR-032:** Critical mobile gameplay text shall be at least 14 CSS pixels and remain usable with increased text scaling.
- **FR-033:** Critical state shall not rely on color or audio alone; interactive controls shall have accessible names.
- **FR-034:** The viewport policy shall permit user zoom unless a verified game-breaking browser behavior requires a narrower documented exception.
- **FR-035:** The opening screen shall retain only the title, one-line premise, Play, sound, and required attribution; optional video shall not delay input readiness and reduced-motion shall use a static presentation.
- **FR-036:** Level Complete shall make Next Level primary, Upgrade secondary, and World Map tertiary for ordinary levels.
- **FR-037:** The shop and map shall remain available but shall not block progression between ordinary levels.
- **FR-038:** Player-facing text introduced by this update shall follow the existing comedy voice.

### Automation and validation

- **FR-039:** Mobile E2E shall use `isMobile`, `hasTouch`, a mobile user agent, realistic DPR, and real touch/pointer events with no keyboard input in touch-control scenarios.
- **FR-040:** Required profiles shall include representative iPhone-size portrait, mid-range Android portrait, small Android portrait, and landscape phone configurations.
- **FR-041:** Automated journeys shall cover fresh/returning start, right-side first touch, second-finger camera, consumption/HUD, landmark blocker, orientation, background/resume, pause, safe areas, optional shop, and direct next level.
- **FR-042:** Browser validation shall run against the resolved live Vercel URL, never localhost, and shall store diagnostic screenshots for major mobile states.
- **FR-043:** A touch-only closed-loop bot shall reuse the existing target-selection brain, never write game state, and report divergence from the reachability model.
- **FR-044:** Real-device testing shall name the minimum supported hardware before release and record the handoff's first-session and frame-time metrics.

## 7. Data model and save evolution

Extend `defaultSave()` and the existing v2 normalization/migration chain with a
defensive optional settings object:

```js
settings: {
  soundMuted: false,
  qualityMode: 'auto',       // auto | high | medium | low
  resolvedQuality: null,     // last automatic tier or null
}
```

Unknown/missing values normalize to defaults. No existing coins, stars,
levels, builds, daily state, collection, achievements, or seed history may be
changed. Placement metadata is static content data and does not enter the save.

## 8. Surfaces and UX

Frontend surfaces are the title screen, gameplay HUD controls, pause menu,
Settings quality control, Level Complete actions, safe-area spacing, and
critical mobile text. Nico approved all named surfaces on 2026-07-28; live
visual verification remains part of release evidence.

States required for every new control: default, pressed/focus, disabled or
loading where applicable, and accessible name. The first-session common path
is at most two taps: page -> Play -> controllable Level 1. Ordinary continuation
is one tap: Level Complete -> Next Level.

## 9. Interface contracts

No network API is added. New internal contracts:

- `createInputMachine`: explicit movement/camera pointer ownership and diagnostic snapshot.
- `createEngine`: `setQuality(profile)` and `getPerformanceSnapshot()`.
- placement geometry: pure lookup from `visualId`/kind/scale to oriented local bounds and clearances.
- placement audit: machine-readable summary plus non-zero exit on any gated violation.
- bootstrap: start-request latch separated from optional asset readiness.

## 10. Security, authorization, and access control

N/A: this remains a static, single-player, localStorage-only game with no
backend, accounts, privileged actions, or new external input surface. Debug
diagnostics must expose metrics only, never localStorage values or secrets.

## 11. Data integrity and write path

All settings writes use the existing save module and normalization path.
Start, pause/resume, quality changes, level settlement, and next-level actions
must be idempotent against repeated taps. The update shall not invent a second
save key or mutate level/economy data to make placement tests pass.

## 12. Testing strategy

See [test-strategy.md](test-strategy.md). Pure input, routing, settings,
quality policy, bounds, solver, and audit logic are unit tested. Live browser
tests cover actual touch/viewport/lifecycle behavior. Real devices remain the
authority for sustained GPU/thermal performance.

## 13. Observability and logging

No telemetry SaaS or backend is added. A toggleable development diagnostic
snapshot shall make input, rendering, and viewport state inspectable locally
and through the existing `window.__fw` debug surface. Automated failures print
profile, seed, level, pointer trace, quality tier, and placement pair/constraint
details sufficient to reproduce the failure.

## 14. Error handling and user feedback

- Optional asset failure: use procedural fallback, no blocking error.
- Required initialization failure: keep the title usable and show a concise retry/error state.
- Duplicate Play/Next/Pause action: ignore safely after the first accepted transition.
- Lost pointer/page visibility/orientation event: clear touches and pause/suspend safely.
- No legal placement candidate: fail generation/audit with level, seed, visual ID, attempted zone, and capacity details; never silently overlap/drop.
- Unsupported quality value: normalize to `auto` and choose a safe tier.

## 15. Performance, cost, and telemetry budgets

- No new runtime dependency or paid service.
- Preserve the design target of 60fps on a 2021-era mid-range phone where verified.
- Release floor: the agreed minimum device must keep p95 frame time at or below 33.3ms during the specified stress scenes; the exact device roster is a release decision, not a headless-browser inference.
- Automatic downgrade default: after warm-up, sustained p95 above 33.3ms for 8 seconds may lower one tier; no automatic upgrade in the same session, at most one automatic downgrade per level, and a 30-second cooldown.
- Placement generation and audit remain bounded and deterministic; candidate/backtracking limits must fail diagnostically rather than hang.

## 16. Accessibility

Target WCAG 2.2 AA basics for the HTML surfaces: named controls, 44x44 touch
targets, visible focus, readable contrast, zoom/text scaling, reduced motion,
safe areas, and state communication that is not color/audio-only. Automated
checks supplement but do not replace phone and screen-reader review.

## 17. Phases and rollout

1. Contract tests and baseline evidence.
2. First-touch ownership, immediate Start, and fresh-session routing.
3. Physical-bounds registry, legal-slot solver, and hard placement gate.
4. Real touch E2E and lifecycle coverage against the live URL.
5. Adaptive renderer and development diagnostics.
6. Frontend-approved pause/sound/safe-area/accessibility/flow changes.
7. Touch closed-loop bot and real-device validation.

Each phase is independently testable. No deployment occurs without Nico
explicitly saying to push/go live.

## 18. Reuse - do not fork

Reuse and extend:

- `createInputMachine` and `createInput`;
- `loadCityTextures`, `loadModelKit`, and their procedural fallbacks;
- `defaultSave`/normalization/migration and `flywheel.save.v2`;
- `WORLD_UNITS_PER_METRE`, `kindFootprint`, `kindRenderScale`, visual registry, and final geometry bounds;
- district site pools, seeded RNG streams, oriented-rectangle SAT, and occupancy grid;
- `createEngine`, `followShadow`, instancing, pooling, and reduced-motion mechanisms;
- overlay show/hide and existing HUD/update primitives;
- existing soak brain and closed-loop play bot;
- existing Vercel live URL and CI workflow.

Forked touch systems, alternate save keys, duplicate geometry registries, and
separate mobile-only gameplay rules are rejected.

## 19. Acceptance criteria

- [x] AC-001: First touch in either lower quadrant moves and does not orbit.
- [x] AC-002: Second touch orbits while first-touch movement continues; releasing either touch preserves the other role correctly.
- [x] AC-003: All cancellation/lifecycle events clear input and hidden time is not charged.
- [x] AC-004: Fresh save reaches controllable Level 1 within two taps; returning save retains map access.
- [x] AC-005: Start is never visibly enabled without an active handler; optional asset failure still boots procedural gameplay.
- [x] AC-006: All 100 default levels preserve exact budgets, bounds, mass, determinism, and all existing difficulty gates/statuses.
- [x] AC-007: Across required layout sweeps, no all-kind or landmark footprint pair penetrates more than 0.25 world units and no road/lane/facing constraint regresses.
- [x] AC-008: Every visual ID's declared placement bounds match the final merged runtime geometry within the documented tolerance.
- [x] AC-009: High/medium/low profiles apply without restart and keep shadow fitting derived from the active map size.
- [x] AC-010: Automatic quality downgrade is stable, persistent, bounded, and manually overrideable.
- [ ] AC-011: Mobile touch journeys use real touch events with no keyboard and pass in portrait and landscape against the live URL.
- [ ] AC-012: Pause, sound, safe areas, zoom/text scaling, named controls, and 44x44 targets pass automated and human checks after frontend approval.
- [x] AC-013: Ordinary Level Complete can reach the next playable level in one tap while shop/map remain available.
- [ ] AC-014: Touch closed-loop play completes Level 1 without state writes and reports model divergence.
- [ ] AC-015: The agreed minimum real device meets the release frame-time floor in spawn, dense eat, rival, landmark, and transition scenes.

## 20. Dependencies and integration points

- Three.js r185 vendored pair only; no examples imports.
- Existing global Playwright installation and live Vercel URL.
- Existing Blender/model-to-JS pipeline for validating authored bounds.
- Existing save schema v2 normalization.
- Frontend portions were approved by Nico on 2026-07-28; deployment still requires the explicit release phrase.
- Release performance blocks on naming and testing the minimum real device.

## 21. Open questions and assumed defaults

- **Assumed default:** first touch movement and second touch camera, with stable pointer roles until release, per the external handoff.
- **Assumed default:** fresh means no completed level/star record; returning players keep the world-map path.
- **Assumed default:** 0.25 world units remains the floating-point-only overlap tolerance already used by the placement audit.
- **Release decision:** name the minimum supported phone/device roster before real-device sign-off. Until then the existing 2021-era mid-range phone target remains provisional.
- **Frontend gate:** Nico must explicitly approve edits to each named frontend surface before implementation begins on that surface.

## 22. Companion ADRs

- [ADR 0003: First active touch owns movement](adr/0003-first-touch-owns-movement.md)
- [ADR 0004: Final physical bounds drive placement](adr/0004-physical-bounds-drive-placement.md)

## Implementation estimate

Large Tier-2 update, best delivered in seven checkpoints. Estimated agent
budget: 70k-110k implementation/verification tokens, with real-device and
external playtest time outside that estimate.
