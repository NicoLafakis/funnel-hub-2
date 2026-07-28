# Test Strategy — Mobile Readiness and Scale-Accurate Placement

**Status:** Implementation in progress
**Date:** 2026-07-28
**Companion:** [requirements.md](requirements.md), [design.md](design.md), [tasks.md](tasks.md)

## 1. Evidence model

Acceptance requires four complementary evidence layers:

1. **Pure logic tests** for touch ownership, startup state, quality selection, bounds, and placement legality.
2. **Generated-campaign tests** for deterministic layouts, difficulty invariants, and final-world geometry.
3. **Live browser tests** against an explicitly authorized deployed URL with actual mobile/touch emulation.
4. **Real-device sessions** for feel, lifecycle behavior, safe areas, orientation, and sustained performance.

Viewport resizing alone is not mobile evidence. Placement reservations alone are not collision evidence. Tests must inspect the state the player actually receives.

## 2. Acceptance-criteria coverage

| Requirement area | Primary evidence |
|---|---|
| First-touch movement and second-touch camera | Pure pointer-state tests + live touch journeys + real devices |
| Immediate Start and fresh-player routing | Delayed/rejected asset tests + live fresh/returning journeys |
| Scale-accurate placement | Bounds parity tests + final-transform campaign audit |
| Adaptive quality | Synthetic frame traces + live telemetry + device soak |
| Pause, sound, safe area, readable text | DOM/unit checks + live viewport matrix + real devices |
| One-tap continuation | State-flow tests + live completion journey |
| Touch bot and diagnostics | Bot assertions + read-only telemetry checks |

## 3. Pure logic suites

### 3.1 Touch ownership

Run pointer sequences beginning across the full viewport, including corners and the lower-right quadrant:

- the first active touch owns movement regardless of starting X coordinate;
- the second simultaneous touch owns camera orbit;
- roles remain stable when either finger crosses the screen;
- releasing one touch does not release or reassign the other;
- `pointercancel`, blur, pause, and visibility loss clear held input;
- movement reaches neutral within 300 ms after release;
- mouse and keyboard behavior remains unchanged.

### 3.2 Startup and routing

Inject immediate, delayed, rejected, and never-resolving optional texture/model promises:

- Start becomes actionable before optional assets finish;
- every tap produces visible state immediately and cannot double-start;
- missing assets select procedural fallbacks without blocking play;
- a fresh save reaches Level 1 in no more than two intentional taps;
- a returning save retains map-first navigation;
- completion, exit, and resume preserve the documented routing contract.

### 3.3 Geometry bounds parity

For every runtime `visualId` and inherited kind:

- an authoritative physical-bounds entry resolves;
- dimensions and origin/pivot metadata are finite and positive;
- the ground footprint is contained by the declared physical volume;
- independently measured generated geometry fits within tolerance;
- Blender-derived and procedural variants satisfy the same contract;
- fallback visuals do not silently use unrelated dimensions.

### 3.4 Adaptive quality

Feed deterministic frame-time sequences into the controller:

- each supported device class chooses a documented initial tier;
- short spikes do not flap tiers;
- sustained pressure downgrades one stable step at a time;
- recovery requires a longer stable window than downgrade;
- manual override and persisted preference win where documented;
- DPR, shadows, effects, detail, and culling change as one profile;
- shadow-camera fitting is validated at every supported shadow-map size.

## 4. Generated-world verification

The placement gate runs **after final visual selection, scale, rotation, repair, and transform application**. It must verify:

- no meaningful ground-footprint pair penetration above the agreed tolerance (initial proposal: 0.25 world units);
- no road, reserved-lane, spawn, camera, or landmark-clearance intrusion;
- street-facing and zone rules still hold;
- every required objective remains reachable and capacity is sufficient;
- prop/building budgets remain within their difficulty envelope;
- identical seed and content version produce identical transforms;
- audit results identify both objects, transforms, overlap depth/area, and violated rule.

Coverage:

- the standard 100-level invariant campaign;
- five layout salts and five independent RNG-stream salts;
- targeted radial, organic, mega, capstone, and maximum-density cases;
- one neutral/control seed to detect systematic geometry or coordinate errors.

Because this work touches world coordinates and generation, `npm test` must retain all five documented difficulty invariants at 100/100. Spot-check Levels 1, 25, 50, 75, and 100 for determinism and progression. Tests must not tune expected output to a particular random stream.

## 5. Live browser matrix

Browser automation runs only against the explicitly authorized live deployment URL—never localhost. Use real mobile context flags (`isMobile`, `hasTouch`, mobile user agent, DPR) for at least:

- current iPhone portrait;
- current Android portrait;
- 360×640 small portrait;
- 800×450 landscape;
- one desktop control profile.

Required journeys:

1. Fresh save → Start → Level 1.
2. First touch in lower-right → movement.
3. First touch movement + second touch camera.
4. Eat an object → HUD/progression response.
5. Reach and consume/engage the required landmark.
6. Rotate portrait ↔ landscape without inaccessible controls.
7. Background → resume with no stuck input and game paused safely.
8. Complete level → primary one-tap Next Level path.
9. Return as an existing player → map retained.
10. Reject optional assets → playable fallback.

CI should retain trace, screenshot, console output, and relevant telemetry on failure.
The workflow resolves its authorized deployment from the required
`FLYWHEEL_LIVE_URL` repository variable and fails rather than falling back to
localhost when the variable is absent.

## 6. Real-device sessions

At least one iOS Safari and one Android Chrome device must cover clean and sloppy play styles. Include:

- thumb starts from every screen quadrant;
- two-finger role stability;
- rapid taps, interrupted gestures, and app switching;
- safe-area devices and browser chrome expansion/collapse;
- portrait and landscape;
- a sustained 10-minute session on representative low/mid hardware.

Record device, OS/browser, viewport, DPR, selected quality tier, average and p95 frame time, failure point, and reproduction steps. The provisional floor is p95 frame time at or below 33.3 ms on minimum-supported hardware, with 60 fps as the target where the profile permits. Final hardware support remains a product decision.

## 7. Failure artifacts

- Placement: seed, level, RNG stream, object IDs/kinds/visual IDs, transforms, footprints, overlap, and rule.
- Touch: ordered pointer event trace with assigned role and release time.
- Performance: rolling average/p95, tier changes, DPR, draws, triangles, instances, particles, viewport, orientation, and visibility state.
- Browser: trace, screenshot, console, and save fixture.

## 8. Definition of done

- All PRD acceptance criteria have automated or explicitly recorded device evidence.
- The 100-level invariant suite passes 100/100, plus the expanded seed matrix.
- Final-geometry placement violations above tolerance are zero.
- Live mobile journeys pass for every required profile.
- Real-device sign-off covers iOS and Android.
- Any approved UI changes pass 360×640 and 800×450 reachability checks.
