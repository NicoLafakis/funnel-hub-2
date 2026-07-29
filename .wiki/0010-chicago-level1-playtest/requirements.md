# 0010 — Remediation Requirements

Each requirement traces to a finding in `00-findings.md` (F#) and names its
acceptance evidence. † = look-and-feel change; requires Nico's explicit
per-element approval before implementation (working agreements).

## P0

- **R1 (F1) — Full keyboard traverse of the boot funnel.** Title, world map
  (metro cards, level nodes, daily card), intro card, and pause/sound
  controls are reachable and activatable with Tab/Shift-Tab/arrows +
  Enter/Space, with a visible focus ring. Acceptance: a Playwright run
  completes title → world map → level 1 → pause → resume using keyboard
  only; focus ring visible in screenshots at 360×640 and 800×450 (B9).
- **R2 (F2) — The avatar is never fully hidden.** Tall buildings between
  camera and avatar fade/cut away; no frame holds the avatar fully occluded
  for more than ~200 ms during normal play. † Acceptance: re-run of the
  building close-up and vista captures shows the avatar + rim in every shot;
  before/after set in `shots/playtest/`.

## P1

- **R3 (F3) — First-timers get the goal.** Fresh-boot players see the intro
  card content (teaching line, mass target, timer) before first gameplay.
  Acceptance: fresh-profile Playwright run reaches gameplay only through the
  intro card; `scripts/flow-test.cjs` updated and green.
- **R4 (F4) — Progress counters only move or only hide.** The coins counter
  increments when coins are earned in level 1, or is relabeled/hidden until
  first coin. No static "0 collected" beside a climbing mass readout.
  Acceptance: scripted eat run shows counter increment or absence.
- **R5 (F5) — Options exist and are keyboard-reachable.** Settings overlay
  (sound, quality mode at minimum) reachable from HUD and pause via
  keyboard; pause/sound buttons focusable. Key remapping is explicitly out
  of scope for this package (future). † Acceptance: keyboard-only open /
  change / close cycle in E2E.
- **R6 (F6) — HUD counters ≥ 16 px effective.** Mass, timer, coins at
  1440×900 and both B9 viewports without layout break. † Acceptance:
  native-res HUD crop; overlay reachability checks at 360×640 / 800×450.
- **R7 (F7) — Controls are taught in-game.** Spawn coach marks name the
  keys (WASD/arrows move, Q/E camera) with key-cap styling, first-run only,
  dismissible. † Acceptance: fresh-boot screenshot shows key hints; repeat
  visit does not.
- **R8 (F8) — Street level is readable.** Downtown/facade lighting pass so
  building faces and the avatar rim read at street level; art direction
  stays premium-stylized, not brighter-everything. † Acceptance: spawn,
  eating, and building close-up captures reviewed against current set.
- **R10 (perf) — Frame-cost spikes controlled + adaptive quality verified.**
  p95 ≤ ~20 ms at spawn/mid-city on the probe GPU; quality manager proven to
  step down under sustained throttle. Acceptance: `scripts/perf-probe.cjs`
  before/after; a forced-throttle run shows a quality step-down event.

## P2

- **R9 (F9) — Orbit→W feel verdict.** Human playtest of orbit-180-then-W
  against the frozen-basis mechanism; document feel verdict in this package
  before any code change. Acceptance: signed-off note +, if it fails, a
  follow-up ADR.
- **R11 (F10) — One progress vocabulary.** HUD/coach copy uses one noun set
  (Mass/Size/coins disambiguated), comedy voice preserved. † Acceptance:
  copy diff + HUD crop.
- **R12 (F11) — Minimap legibility.** Dots distinguishable at a glance
  (size/contrast/shape per category); rival distinct from edible. †
  Acceptance: minimap crop in the capture set.
- **R13 (F12, F13) — Naming + timer clarity.** Single consistent level name
  across map/intro/HUD; timer's stakes stated where it appears. †
  Acceptance: screenshots of all three surfaces.

## Non-goals

Key remapping UI, analog/touch retuning, audio evaluation, mobile layout
(covered by 0006), any economy or difficulty-invariant change.
