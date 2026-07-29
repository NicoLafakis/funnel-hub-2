# 0010 — Remediation Design

Per-requirement implementation shape. Constraints honored throughout: no new
deps; `src/systems|content|data|meta` never import THREE; economy values only
from `src/data/formulas.js`; every DOM structure ships with its CSS (B8);
overlays reachable at 360×640 / 800×450 (B9); look-and-feel items gated on
Nico's approval († in requirements.md). Before touching boot/camera/input,
re-read the matching lesson in `lessons-from-v1.md` (B2, B4, B7) and
game-design §1–§2.

## R1 — Keyboard-traversable funnel (src/ui/overlays.js, src/main.js, CSS)

- Add a small focus manager in `src/ui/overlays.js`: each overlay exposes
  `focusables()` (buttons, level nodes, metro cards) and a roving
  `tabindex`; Enter/Space activates, arrows move within grids (level nodes),
  Esc backs out where a back exists.
- Visible focus ring via a `.focus-visible`-style class in the overlay's own
  CSS block (B8 — CSS ships with the DOM change).
- Level nodes and metro cards are currently click-wired divs — give them
  `role="button"`, `tabindex`, and key handlers rather than converting to
  `<button>` (smaller diff, same a11y).
- Verification first: one live tab-order pass to confirm the persona's P0
  (the scripted session only proved no *visible* affordance).
- E2E: extend the boot smoke with a keyboard-only leg (no `page.mouse`).

## R2 — Occlusion fade (src/engine/camera.js or new src/engine/occlusion.js)

- Per frame, raycast camera→avatar against the tall-building instanced
  meshes; instances intersecting the segment get a fade (opacity/dither
  cutout) driven by a per-instance uniform, restoring when clear. Engine
  layer only — systems/content untouched.
- Prefer dithered cutout over transparency sort (instanced meshes + alpha
  blend = sort artifacts; the repo's perf contract favors cheap).
- Budget: one raycast against a prefiltered candidate set (spatial hash
  along the segment), not the full scene.
- Alternative if fade reads badly: slight camera pull-in on occlusion.
  Decide from the before/after screenshot set; Nico approves the treatment.

## R3 — Intro card on fresh boot (src/main.js, src/meta/startup.js)

- `startFreshLevelOne()` currently calls `beginPlay()` directly
  (src/main.js:1640-1649). Route it through `showLevelIntro()` instead, so
  fresh saves get goal/timer/teaching line before first play; DIVE IN then
  starts. Keeps `startRoute` policy pure; the change is one call-site.
- Update `scripts/flow-test.cjs` fresh-boot expectations.

## R4 — Coins counter truthfulness (src/ui/overlays.js:308)

- Cheapest honest fix: hide the counter while `state.coins === 0`
  (`visibility`, keeps layout), reveal on first coin. If design wants it
  always visible, relabel to "0 coins" — pick one with R11's copy pass so
  vocabulary lands once.

## R5 — Settings overlay (src/ui/overlays.js + new CSS, src/meta/save.js)

- New `settingsOverlay` (sound toggle, quality mode select) opened from
  pause and a HUD gear; focusable per R1's manager. Persist to
  `saveData.settings` (schema already has `soundMuted`, `qualityMode` — no
  migration needed).

## R6 — HUD counter sizing (HUD CSS)

- Bump counter font to ≥16 px effective with `clamp()` so B9 viewports hold;
  re-crop `13-hud-strip.png` to verify. Single CSS change, no DOM surgery.

## R7 — Control coach marks (spawn hint UI, src/ui/overlays.js + main.js)

- Extend the existing spawn coach-mark path ("Eat the highlighted props!")
  with a first-run key hint chip row: `WASD`/`↑←↓→` move, `Q`/`E` spin
  camera. Gate on a `saveData.settings.seenControlHints`-style flag (extend
  `defaultSave()`; additive, no migration break) — show once, never again.

## R8 — Street-level lighting (src/engine/scene.js, facade materials)

- Diagnose first: crushed facades suggest fill/hemisphere too weak relative
  to key + shadows (0005 closed depth/shadow issues — re-read its summary in
  `current-state.md` before touching lights). Likely: raise hemisphere
  intensity and/or facade ambient response in the downtown tier. Keep the
  change inside engine/scene + material params; no content data churn.

## R9 — Orbit→W feel test (no code yet)

- Human protocol: orbit 180° via Q/E ×4, hold W, report expected-vs-felt
  direction over 5 trials; compare against the frozen-basis design note in
  game-design §1 (2026-07-28 amendment). Record the verdict in this package;
  a "feels wrong" verdict gets an ADR, not a drive-by tweak.

## R10 — Perf spikes + adaptive quality (src/engine/quality.js)

- The capture showed quality pinned "high" under sustained 31 fps throttle —
  verify the step-down trigger actually fires (forced-throttle run), fix the
  trigger if dead, then re-probe. p95 26 ms spike source: profile spawn vs
  vista (15 ms vs 8 ms) — likely shadow map + instance count; only optimize
  what the probe indicts.

## R11–R13 — Copy, minimap, naming (src/ui/*, content strings)

- R11: one copy pass over HUD + coach marks (single progress noun set;
  comedy voice kept — see existing overlays).
- R12: minimap (src/ui/minimap.js): larger category contrast (shape + color,
  not color alone), rival glyph distinct; size bump only if B9 viewports
  still hold.
- R13: pick the canonical level-1 name ("The Loop — Chicago") and make map
  card, intro, and HUD banner all read it; add the missing HUD label element
  or remove the dead lookup.

## Test strategy deltas

- `scripts/playtest-capture.cjs` becomes the standing playtest rig: re-run
  after R2/R6/R7/R8/R12 and diff the screenshot set.
- New E2E legs: keyboard-only funnel (R1), settings overlay cycle (R5),
  fresh-boot intro routing (R3, in flow-test).
- `npm test` + invariants must stay green; no economy literals touched.
