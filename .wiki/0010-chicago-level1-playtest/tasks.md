# 0010 — Remediation Tasks

Ordered for execution. Gate: nothing marked † merges without Nico's explicit
per-element approval (working agreements). Each task lists its acceptance
evidence — no task is done without it.

## Phase A — verification + blockers (no look-and-feel risk)

1. **F1 live tab-order audit** (R1). Keyboard-only walk of title → world map
   → intro → gameplay; record which elements take focus. Evidence: audit
   note appended to `00-findings.md` confirming or downgrading Dez's P0.
2. **R1 keyboard funnel** †(focus ring styling). Focus manager + roles +
   key handlers per `design.md`. Evidence: keyboard-only E2E leg green;
   focus-ring screenshots at 360×640 and 800×450.
3. **R3 fresh-boot intro card.** Route `startFreshLevelOne` through
   `showLevelIntro`. Evidence: fresh-profile Playwright run + updated
   `scripts/flow-test.cjs` green.
4. **R4 coins counter.** Hide-until-first-coin (or relabel, if decided with
   R11). Evidence: scripted eat run screenshot.

## Phase B — visual blockers (Nico approval required)

5. **R2 occlusion fade** †. Camera→avatar raycast + dither cutout per
   `design.md`; treatment choice (fade vs pull-in) from a before/after
   capture diff. Evidence: new `08/09/10/11` captures, avatar visible in all.
6. **R8 street-level lighting** †. Hemisphere/facade fill pass after reading
   `current-state.md` 0005 summary. Evidence: spawn/eating/building
   captures reviewed against the 0010 set.
7. **R6 HUD counter sizing** †. Evidence: native-res HUD strip crop; B9
   viewport checks.
8. **R7 control coach marks** †. First-run key hints + save flag.
   Evidence: fresh vs repeat boot screenshots.
9. **R12 minimap legibility** †. Evidence: `12-minimap.png` crop comparison.

## Phase C — surfaces and polish

10. **R5 settings overlay** †. Sound + quality, keyboard-reachable, persisted
    to existing `settings` schema. Evidence: keyboard-only open/change/close
    E2E.
11. **R11 copy pass** † + **R13 naming/timer clarity** †. One vocabulary;
    canonical "The Loop — Chicago" on map/intro/HUD; timer stakes line.
    Evidence: copy diff + three-surface screenshots.
12. **R10 adaptive-quality verification + spike control.** Forced-throttle
    run, fix step-down trigger if dead, re-probe. Evidence:
    `scripts/perf-probe.cjs` before/after + step-down event log.

## Phase D — judgment call

13. **R9 orbit→W human feel test.** 5-trial protocol per `design.md`.
    Evidence: verdict note in this package; ADR only if it fails.

## Standing close-out

14. Re-run `node scripts/playtest-capture.cjs` end-to-end, archive the new
    set beside the 0010 baseline, and update this package's status line to
    "implemented" with the evidence links. `npm test` + invariant suite
    green throughout.
