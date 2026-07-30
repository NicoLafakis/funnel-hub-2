# Test Strategy — Level 1 City Realism Remediation

**Status:** proposed; nothing implemented
**Date:** 2026-07-29
**Companion:** [00-overview.md](00-overview.md), [requirements.md](requirements.md), [design.md](design.md), [tasks.md](tasks.md)

## 1. Evidence model

This package is almost entirely a rendering-appearance change, and rendering
appearance has no unit test. The honest evidence model is therefore narrow and
must be stated plainly rather than padded with suites that would prove nothing.

Four layers, in the order they carry weight:

1. **Before/after screenshot pairs at a fixed camera** on the live deploy. For
   every requirement except `NR6`, this is the *only* meaningful gate. A
   requirement whose acceptance criterion is "the tower's windows are
   countable" is settled by looking at two images taken from the same place.
2. **Numeric measurements read back off those live frames** — sampled sRGB
   values, pixel widths, the horizon-seam channel-sum, the edibility brightness
   ratio. These exist to stop a change being justified by impression, which is
   the standing practice in `art-direction.md` (every constant that moved there
   moved against a measurement, and two proposals were rejected because the
   measurement said they bought nothing).
3. **`scripts/perf-probe.cjs` cost diffs** — draw calls, triangles, instanced
   group count. These are the only automatic protection for the budgets in
   `00-overview.md`.
4. **The repo's automated gates** — `npm test` and `npm run build`. These
   protect determinism, the difficulty invariants, and placement legality. They
   cannot see a single pixel of this work.

**A screenshot at a different camera is not evidence.** The camera, viewport,
seed, and world state must match the baseline or the pair proves nothing.

## 2. This repo's automated gates, verified

Checked against `package.json` in the current worktree. The complete `scripts`
block is `start`, `build`, `test`, `test:district-objects`, `bounds`,
`test:e2e`, `test:mobile-live`, `test:golden`, `test:play`, `ship`, `models`,
`vendor-three`, `postinstall`.

**There is no `typecheck` script, no `lint` script, and no `format` script**,
and no ESLint, Prettier, or TypeScript config or dependency exists anywhere in
the repo. Any SOP step naming those three does not apply here. The real gates
are:

- **`npm test`** — `scripts/logic-test.js` + `scripts/invariant-test.js` +
  `scripts/placement-audit.mjs 100`. Must stay green: 223+ logic checks, all
  nine documented gameplay invariants at 100/100, and zero all-kind placement
  intersections above 0.25 world units.
- **`npm run build`** — `scripts/build.js`. Must be clean before any push.

Supporting, run per task rather than as a blanket gate:

- **`node scripts/perf-probe.cjs`** — real-GPU cost. Honors `BASE_URL`.
- **`node scripts/district-object-report.js`** (`npm run test:district-objects`)
  — `maximumActiveTriangles`, the gate `094d25e` used to prove a roof-cue change
  was triangle-neutral. Required by task 16.
- **`npm run bounds`** — regenerates physical bounds. Required by task 19,
  because authored geometry changes footprints.

## 3. Capture rig — constraints already paid for

These were discovered during the 0011 capture session and are recorded in
`00-findings.md`. They are process cost that does not need paying twice.

- **`scripts/playtest-capture.cjs` cannot serve live verification.** It
  hardcodes `http://localhost:3003/` in two places. Do not reach for it.
- **`scripts/screenshot-city.cjs` is the correct base to copy.** It honors
  `BASE_URL` (`process.env.BASE_URL || http://localhost:${PORT||3003}/`), so:
  `BASE_URL=https://funnel-hub-umber.vercel.app/ node scripts/screenshot-city.cjs`.
  It resolves Playwright from the **global** install
  (`process.env.APPDATA + '/npm/node_modules/playwright'`), runs headless
  chromium at viewport 1440×900, clicks through `#startBtn` → level node →
  `#goBtn`, and writes five shots to `shots/`: `l1-spawn.png`,
  `l1-building-large.png`, `l1-building-medium.png`, `l1-building-small.png`,
  `l1-vista.png`. It also prints `GROUPS:`, `BUILDINGS:` (with `map=YES|NO
  uv=YES|NO` per building group), `GROUND:` and `propCount:` diagnostics from
  `window.__fw` — useful directly for confirming the photoreal set resolved.
- **Level 1's 75-second clock will end the run mid-session.** `timeSeconds(1)`
  is exactly 75 (`src/data/formulas.js`), and expiry swaps gameplay for the
  "Sync Failed!" overlay (0010 F13). Any capture session longer than ~75 s must
  top `state.timer` back up to `state.levelTime` on an interval. **Take the
  untouched-HUD shot before that interval starts**, or the HUD in the shot shows
  a doctored timer.
- **The 0011 capture driver is not in the repo, and neither are its PNGs.**
  `shots/` is gitignored repo-wide, so the ten review shots
  (`a-spawn` … `j-elevated-rail`) exist only on the capturing machine. Anyone
  verifying this package **re-captures the baseline live first**, from the same
  build the change is being compared against.
- **Do not use pre-existing on-disk shots** under `shots/` or `shots/playtest/`
  for current-appearance judgment — they predate `5b2bf02`/`c0e8568` and no
  longer reflect current rendering.
- **The review baseline is viewport 1600×1000, seed `chicago-loop`, live URL,**
  with world 2415 and block zones 17 residential / 6 park / 2 parking. Match it.
- **Headless frame rates are unusable on this repo.** `tech-architecture.md` §1
  records the standing rule: headless Chromium caps `requestAnimationFrame` at
  ~30 fps regardless of rendering, so any rAF-derived fps figure measures the
  harness. Use `scripts/perf-probe.cjs` (which launches with
  `--use-angle=default --disable-gpu-vsync --disable-frame-rate-limit`) for any
  performance claim.

**Always the live deployed URL — `https://funnel-hub-umber.vercel.app/`. Never
localhost, never a dev server.** Note that this is *not* `funnel-hub-2`; the
obvious guess 404s and the V1 URL can look like a false success.

## 4. Per-requirement verification

"B/A pair" means two captures at the identical fixed camera, viewport, seed and
world state, on the live deploy, before and after the change. Where a B/A pair
is the only meaningful gate, that is stated — those requirements cannot be
automated and must not be reported as passing on a code reading.

| Req | Fixed cameras | Primary evidence | Automated support |
|---|---|---|---|
| **R1** windows and ground floors | `g-skyline`, `b-street`, `d-intersection`, `j-elevated-rail` | **B/A pair is the only gate.** Plus: sampled sRGB of the tower face and of the ground-floor band, before and after; the tower's window grid countable in the after shot | `npm test`; perf-probe unchanged |
| **R4** sky and cloud | `h-far-horizon`, `f-vista` | **B/A pair is the only gate** for "reads as sky." Plus: the horizon-seam channel-sum re-measured and still in the 1–3 band that `94f5383` closed it to; cloud present | perf-probe draw calls and material count unchanged |
| **R3** marking scale | `d-intersection`, `j-elevated-rail` | Pixel measurement of widest stripe vs narrowest car, before and after — this requirement is *defined* by a measurement, not an impression | `npm test` at 100/100 (shared `streetWidth` and the `MIN_STREET_FOR_*` gates affect all 100 levels) |
| **R5** ground clip | the reachable-camera sweep from task 2 | A table of eye height per reachable pitch/radius, plus zero reproducing frames — **or** the proof that no reachable camera reproduces it, which closes the item | none available |
| **R6** parks | `e-park`, `h-far-horizon` | **B/A pair is the only gate.** Plus: a naive-viewer check — someone who has never seen the game calls it "a park" | perf-probe `groupCount` at or below the 60 guard; `npm test` with zero placement penetrations; seeded determinism |
| **R7** water | `e-park`, `h-far-horizon` | **B/A pair for the shoreline.** Plus: two captures one second apart differing visibly on the water surface (this is what proves movement, and it cannot be proved from a single frame) | perf-probe mesh and material count unchanged |
| **R8** roof silhouette | `f-vista`, `g-skyline` | **B/A pair is the only gate.** Plus: countable distinct building tops; no three adjacent towers ending in the same horizontal | `district-object-report`'s `maximumActiveTriangles` at or below its pre-change value |
| **R2** art coherence | every gameplay framing; `c-block` as the reference for what already works | **B/A pair is the only gate**, plus a naive-viewer check: "does anything here look like it came from a different game?" | edibility ratio measurement (below); Level 2 + Level 50 pixel-identical; `npm test`; perf-probe unchanged |

## 5. The two invariants that need a purpose-built check

These are the two things this package could break silently, where a screenshot
of Level 1 would look fine and the damage would be elsewhere.

### 5.1 Edible readability (gates R2, and R1a's third option)

The signal is **value, never hue**: `EDIBLE_LIFT = 1.06` and
`TOO_BIG_DIM = 0.62` / `TOO_BIG_DIM_TEXTURED = 0.78` in
`src/engine/instancing.js` are scalar multiplies on the instance colour applied
before lighting.

Check, run before and after any prop or facade-dim change:

1. Reproduce `art-direction.md` §3's masked-pixel measurement of the rendered
   brightness ratio between an eat-me prop and a too-big prop, at a fixed camera
   with a fixed prop selection.
2. Confirm the ratio is unchanged. **Use the measurement's own before-value as
   the baseline, not a wiki figure** — §3 records 1.284 by one method and
   1.327 by another, and explicitly says only one should be quoted forward
   without the caveat. The comparison that matters is before-vs-after on the
   same method and framing.
3. Convert one capture to greyscale and confirm the edible and too-big groups
   still separate. Hue cannot rescue the signal, so greyscale is the honest test.
4. Confirm the 1.35× tier size step (`TIER_SIZE_STEP`) still reads: seven tiers,
   seven distinguishable silhouette sizes.

### 5.2 The far-field DOF contract (gates R4 and R7, and any atmosphere work)

`src/engine/dof.js` guarantees sharpness inside the playable square by
construction — `farFieldBlurBand` computes the exact four-corner maximum of the
view-depth function over the square, and `smoothstep` returns literal `0.0` at
or below `edge0`. A change to `SHARP_PAD_OF_HAZE_RUN`, to
`RAMP_END_OF_HAZE_RUN`, or to the `playableHalfExtent` / `hazeRun` inputs from
`main.js:2909-2915` would break the proof rather than merely detune it.

Check:

1. Confirm none of those four values changed. This is a diff review, and it is
   sufficient for the DOF pass itself.
2. Capture a fixed `f-vista` frame and confirm the furthest **in-play** building
   still resolves crisp detail, and that visible blur begins only on the
   perimeter context city.
3. **Sky, cloud, haze and water changes need step 2 even though they do not
   touch `dof.js`,** because they can put softness inside the play area through
   fog and haze rather than through blur. `FogExp2` has no onset and attenuates
   from the first metre (an accepted trade, `art-direction.md` §1) — so any fog
   or haze change is a change to an already-accepted everywhere-haze and must be
   re-measured on a fixed in-play capture rather than assumed harmless.
4. Note that the DOF pass is disabled when `profile.effectsDensity < 0.7`
   (`scene.js`), i.e. the low quality tier renders without the composer. Verify
   any atmosphere change at high **and** low quality; the low tier is where a
   sky change has no DOF to hide behind.

## 6. Definition of done

- Every requirement in [`requirements.md`](requirements.md) has a before/after
  pair at a fixed camera on the live deploy, or — for R5 — a recorded proof of
  unreachability.
- The full ten-shot review set is re-captured at the baseline camera, viewport
  and seed, archived beside the 0011 set, and street level and high-camera reads
  are re-scored against the findings' 4/10 and 7/10.
- Every `NR` non-regression requirement has its named evidence: `NR1`–`NR3` and
  `NR5` from the re-captured set, `NR4` from §5.2, `NR6` from
  `scripts/perf-probe.cjs` plus `npm test`.
- The edibility ratio is measured before and after and is unchanged.
- Level 2 and Level 50 captures are pixel-identical to their pre-change
  versions.
- `npm test` green — 100/100 invariants, zero placement penetrations above 0.25
  world units — and `npm run build` clean, both run on the exact state being
  committed.
- Draw calls, triangles, instanced group count and distinct material count are
  no worse than task 4's re-baseline, or a raise is recorded as an explicit
  measured decision against the ≤150 desktop / ≤60 mobile budget.
- The wiki updates in task 21 land in the same change as the code they describe.

## 7. Failure artifacts

- **Appearance:** the before and after frame, the camera parameters, viewport,
  seed, quality tier, and the sampled pixel values that were compared.
- **Cost:** full `scripts/perf-probe.cjs` output — `calls`, `triangles`,
  `averageMs`, `p95Ms`, `sustainedFps`, `longFrames`, `quality`, `dpr`,
  `memory.geometries`, `memory.textures` — at spawn, mid-city and vista, plus
  `groupCount` and `groupKeys`.
- **Determinism or placement:** seed, level, object ids, visual ids, transforms,
  footprints, overlap depth, and the violated rule.
- **Capture rig:** the console and page-error stream (the 0011 session recorded
  zero across the whole session — a non-zero count is itself a finding), plus
  whether the timer top-up interval was running when the frame was taken.
