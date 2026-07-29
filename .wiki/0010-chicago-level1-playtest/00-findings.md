# 0010 — Chicago Level 1 Playtest: Findings Synthesis

Status: **findings complete; remediation proposed, not yet approved or implemented.**
Date: 2026-07-29. Evidence: `shots/playtest/` (13 screenshots + `metrics.json`),
`scripts/playtest-capture.cjs` (capture driver), persona reports in `personas/`.

## Method

A scripted Playwright driver (`scripts/playtest-capture.cjs`, real GPU via
`--use-angle=default`) booted Level 1 (The Loop — Chicago) fresh, ran a
keyboard-control battery with rAF-accurate movement sampling, and captured a
screenshot set covering the full funnel (title → world map → intro → spawn →
movement → eating → building close-ups → vista → HUD/minimap crops).

Three gamer personas evaluated the complete evidence set independently
(ICP QA methodology adapted to player archetypes):

| Persona | Lens | Overall | Verdict |
|---|---|---|---|
| Marcus — hardcore .io/arcade player | input latency, camera discipline, readability in motion, frame rate | 2.5 / 5.0 | Maybe — needs occlusion fix + confirmed 60 fps |
| Priya — casual cozy player | first-minute clarity, charm, readability, onboarding | 3.3 / 5.0 | Maybe → yes if P1s fixed |
| Dez — keyboard-only accessibility player | keyboard coverage, text size, input forgiveness, options | 2.8 / 5.0 | Maybe — out if menus are truly mouse-only |

## What measured well (do not regress)

The input layer is the strongest part of the build — all three personas
converged on this:

- First movement 70–97 ms after keydown; stop 238–242 ms after keyup
  (acceptance ≤ 300 ms — passes).
- WASD/arrow parity confirmed; diagonals normalized (0.984 ratio);
  W+S cancels with zero drift; key-mash leaves no stuck input or NaN.
- Q/E orbit steps measured +44.5° / −44.6° (spec 45°).
- Zero console/page errors across the whole session; all facade + ground
  textures wired (`map=YES` everywhere); eating, growth, and combo feedback work.
- Eating feedback and comedy voice landed: combo banner and toasts were the
  single highest-scoring element (Priya: Feedback & Delight 4.5).

## Performance: persona P0 corrected by measurement

Marcus scored the captured ~31 fps as a P0. That number is a **headless-capture
artifact**: the canonical GPU probe (`scripts/perf-probe.cjs`, vsync off,
1600×900) measured avg 15.06 ms / p95 26.0 ms at spawn and mid-city
(~66 fps), 8 ms at vista, worst-case 1 draw call. Corrected finding: frame
cost is **borderline, not broken** — p95 26 ms misses the 16.7 ms/60 fps
line, and adaptive quality never stepped down during the throttled capture
(quality stayed "high" at 31 fps). Downgraded to P1 (spike control +
verify quality step-down), see `requirements.md` R10.

## Consolidated issues (cross-persona)

Priority resolution per methodology: any persona's P0 blocks; primary-audience
P1s are high. Look-and-feel items require Nico's per-element approval
(working agreements) — flagged †.

### P0

- **F1 — Front door is mouse-only.** Title, world map, and DIVE IN show no
  keyboard/focus affordance; the whole funnel was only traversable by click
  (Dez P0; shots 01–03). In-level keyboard play is excellent, which makes the
  menu gap the single largest adoption blocker. First step is verification
  (tab-order live check), then focus management.
- **F2 — Camera gets buried in skyscrapers.** `08-building-large.png` is a
  full-screen purple rooftop; `09-vista`/`10-ground-detail`/`11-full-hud` show
  a void-black monolith swallowing the avatar (Marcus P0). Tall-tier buildings
  read as untextured black masses up close and fully occlude the player with
  no fade/cutaway. † (occlusion treatment is visual)

### P1

- **F3 — Fresh players never see the intro card.** Fresh-save routing
  (`startRoute` → `startFreshLevelOne`, src/main.js:2928, src/meta/startup.js:10)
  skips the intro: the teaching line ("Swallow anything smaller than your
  rim"), the 1,000-mass goal, and the timer never reach first-timers
  (Priya P1).
- **F4 — "0 collected" never moves.** It's a coins counter
  (src/ui/overlays.js:308), but Level 1 play awards none while Mass climbs
  8 → 67 and combos fire — reads as broken progress to every persona.
- **F5 — No options surface.** No remapping, no options screen; pause and
  sound are small mouse-only circles; save schema holds only
  `soundMuted`/`qualityMode` (Dez P1). †
- **F6 — HUD counters ~13 px.** Mass/timer/collected illegible for
  presbyopia at 1440×900 (Dez P1, verified from native-res crops). †
- **F7 — Controls are never taught.** WASD/arrows and Q/E (proven working)
  appear in no coach mark; the spawn hint is a 👆 pointer-hand, which
  mis-signals a keyboard game (Priya P1, Dez P2). †
- **F8 — Downtown reads too dark.** Street level between towers is murky;
  large facades crush to black (Marcus P1, Priya P2; shots 07/08/10). †

### P2

- **F9 — Orbit-180-then-W divergence.** Displacement dot camera-forward =
  0.569 where design §1 expects away-from-camera. Ambiguous: movement basis
  freezes at gesture start while the chase camera auto-recenters; may be
  correct mechanism that still feels wrong. Needs a human feel test before
  any code change (Marcus P1, Dez P2).
- **F10 — Vocabulary clash.** "Mass 8 / 1.00k" vs "Size 2" vs "0 collected"
  — three nouns for progress; "Mass" reads as spreadsheet jargon (Priya P2). †
- **F11 — Minimap illegible.** 96 px, dots indistinguishable, no rival
  distinction (Marcus P2, Priya). †
- **F12 — Naming whiplash.** "Harbor Metropolis" vs "The Loop — Chicago";
  no level label element found in HUD DOM (`levelLabel: null`) (Priya P2).
- **F13 — Unexplained timer pressure.** 75 s ticks with no stated stakes or
  accommodation (Priya P2, Dez P2).

### Evidence gaps (scripted driver cannot judge)

Analog/touch input, decel-curve feel, audio, actual menu tab-order (F1
verification step), and orbit→W disorientation (F9) all need a human session.
The capture script is rerunnable: `npm start` + `node scripts/playtest-capture.cjs`.

## Cross-persona contradictions

None structural. Marcus wants more routing information density; Priya wants
less jargon — both resolve to the same fix (F10): rename, don't add.

## Remediation

See `requirements.md` (R1–R13), `design.md` (per-fix implementation design),
`tasks.md` (ordered execution with acceptance evidence).
