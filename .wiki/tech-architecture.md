# V2 Tech Architecture

Keep what's healthy, fix what shipped broken. V1's module tree
(`src/engine|systems|meta|data|content|ui` with pure, DOM-free modules) is
genuinely good and survives V2. The failures were in rendering scale,
tooling gaps, and the deploy path — see lessons B1, B8.

## 1. Rendering performance — the 60fps budget

**Target: 60fps on a mid-range phone (2021-era), 370–400 props, 3 rivals.**

V1 draws every prop as an individual mesh in the scene graph. Fine on
desktop; it will not hold 60fps on mobile at the tripled prop counts
(which D2 forced). V2:

- **InstancedMesh per (kind, tint) pair.** The 7 prop tiers × golden
  variant = ≤15 draw calls for all props, down from ~400. Transforms update
  per-frame via instance matrices (tumble, vacuum pull, squash).
- **Object pooling everywhere:** props, particles, floaters, rival crumbs.
  Zero allocations in the frame loop — V1 allocates vectors per frame in
  the camera and swallow paths.
- **Frustum + distance culling** through the spatial hash (already needed
  for rivals): props beyond 1.2× fog distance skip matrix updates.
- **Shadows:** blob decals under props, not shadow maps. One directional
  light for form, hemisphere for fill.
- **Budget watchdog in dev builds:** frame-time histogram; warn at >14ms
  p95. Perf regressions get caught like test failures, not player reports.
- **Depth precision is a budget, not a default.** `camera.near`/`camera.far`
  (`scene.js`) set how many of the depth buffer's 2^24 fixed-point values land
  near the ground: `dz(z) ≈ z^2 / (near * 2^24)` for `far >> near`, so
  resolution is set almost entirely by `near`. Shipped at `(0.1, 20000)` — a
  200,000:1 ratio — the whole ground stack (ground 0.00, detail grain 0.05,
  lane paint 0.08) collapsed into a single depth increment at the avatar
  (0.081u of resolution against a 0.08u-tall stack) and held its visual order
  only because Three r185 sorts opaques by `material.id` and the ids happened
  to ascend with Y — luck, not design; full derivation and the "layer order is
  a live tripwire" framing in `0005-ground-rendering-defect/00-findings.md`.
  Fixed 2026-07-27 (`00ff4a1`) to `(20, 12000)`, a 600:1 ratio and 0.0004u of
  resolution at the avatar. `near = 20` is sized off the closest the chase
  camera legitimately gets to anything, 277u (`12r - 1.5r` at minimum
  radius); `far = 12000` off the measured worst case, 8595u at L100 (camera
  standoff `12*151` plus the 6788u ground diagonal) — note fog far is
  `world * 2.0` (9600 at L100), not the 4830 an earlier pass through this
  wiki implied. `camera.js`'s obstacle pull-in clearance now derives from
  `camera.near` (`Math.max(0.5, camera.near * 1.5)`) instead of a flat 0.5
  units, so a future near-plane change can't silently clip the landmark
  stand-off again the way a 20-unit near plane would have against the old
  constant.
- **Ground depth-bias ladder.** Even after the near/far fix, quantization at
  the far ground corner is still 0.069u — larger than the 0.05u the detail
  plane leads the ground by — so the three previously-unprotected ground
  layers now carry an explicit `polygonOffset` ladder instead of relying on Y
  offsets and draw order: detail `-1`, lane paint `-2`, blob-shadow decals
  `-3` (`main.js`, `instancing.js`). This sits strictly inside the avatar's
  own `-2` (aperture disc) / `-6` (hub collar) budget (`avatar.js`, art-
  direction.md §5), which is what keeps the mouth winning over the ground
  stack at every radius. Any future ground-adjacent decal claims a rung in
  this ladder rather than picking an arbitrary Y offset.
- **Cost of the 2026-07-27 ground fix (`00ff4a1`):** +1 draw call (42 → 43)
  and +128 triangles for the horizon skirt (art-direction.md §1 has the
  description and its open items), no new textures — well inside the budget
  above.
- **Shadow pass has no effective culling — CORRECTION to this record
  (2026-07-28, `4377c82`).** Every prop group casts shadows as one
  world-spanning `InstancedMesh`, so Three cannot cull any instance out of
  the shadow pass and the full prop roster is rasterized twice per frame
  (shadow map plus main pass). The line that used to be here — "the main
  pass has a real per-instance frustum cull, the shadow pass has none" — is
  WRONG and this is a correction, not a restatement: `instancing.js:360-371`
  is an UPDATE-SKIP, not a rasterization cull. The module's own header
  comment says it plainly — instances outside the camera frustum "skip their
  matrix update (their last matrix stays in the buffer)". The `InstancedMesh`
  draw call still issues the full instance count every frame; the GPU
  rasterizes every prop in BOTH passes regardless. Skipping the matrix write
  only saves a CPU-side buffer write for instances that were already
  offscreen last frame, not a GPU draw. This was profiled specifically because
  the wrong premise made "mirror the main pass's cull into the shadow pass"
  look like free performance: it is not, because there was nothing to mirror.
  Real per-instance shadow culling would need spatial buckets, which breaks
  the merged-instancing draw-call budget this section opens with — measured
  and REJECTED (below). Caster pass cost, measured: 0.411 ms of a 2.72 ms
  frame; only 17% of props are in-box at spawn, 100% at the radius cap.
- **Real-device fps — RETRACTED, was a measurement artifact (2026-07-28,
  `4377c82`).** The previously recorded "31.2fps sustained at 1440×900 on an
  Intel iGPU at 434k tris/frame" is not a property of the game. Headless
  Chromium caps `requestAnimationFrame` at ~30fps even with rendering
  disabled entirely, so that number was measuring the harness, not the
  scene. Uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`): 368fps
  with full rendering, 1794fps with rendering stubbed out — true render cost
  2.72 ms/frame, GPU 1.85 ms, CPU 93.15% idle over a 6s sustained-motion
  window. **Standing rule: any fps figure taken through headless Playwright
  on this repo is unusable, including the existing golden-test harness
  (§5).** Use uncapped flags plus `EXT_disjoint_timer_query_webgl2` GPU
  timing for any future perf claim instead of rAF-derived fps. Real-device
  fps (phone/tablet) remains UNMEASURED — see §6.
- **Shadow-frustum crawl — FIXED (2026-07-28, `4377c82`), gone by
  construction.** `followShadow()` (`scene.js`) was perturbing three things
  every frame: the box centre tracked raw avatar floats with no snapping;
  the box size tracked radius continuously so the `if (cam.left !== -half)`
  guard compared an always-changing float and never guarded; and
  `shadow.far` was `77r` while `shadow.bias` was normalized against it, so
  the WORLD-space bias rescaled every frame too
  (`0005-ground-rendering-defect/00-findings.md` §4.1, its RC-1). Now:
  - **Power-of-two box ladder** (`half = 2 ** Math.ceil(Math.log2(want))`,
    floor `SHADOW_HALF_MIN = 128`) so the guard actually guards — the
    projection now rebuilds a handful of times per level instead of ~60x/sec.
    Measured: `rebuiltOn1pctRadius` went `true → false`.
  - **Exact light-space texel snap**, not the world-XZ approximation the
    findings doc's §7.1 offered as "good enough" — light-space costs three
    extra dot products for a constant light direction (`SUN_DIR`), so there
    was no reason to take the approximation. `half` and `mapSize` (2048) are
    both powers of two, so `texel = 2*half/2048` is exact in binary floating
    point and `Math.round(v/texel)*texel` cannot drift.
  - **Geometry-derived near/far/bias/normalBias**, replacing constants. Near
    is set from the box + a `SHADOW_CASTER_HEIGHT` (900u, covers the L75
    worst-case building at 671u) pad; far brackets the same box on the depth
    axis; bias is derived from texel size, not left constant.
  - **Acceptance number:** a fixed world point now lands in 1 distinct
    shadow-texel phase across 32 sub-texel avatar displacements, at
    r=26/200/483 — before, it landed in 32 of 32 at every radius.
  - **Measured effect:** world bias down 7.3× at spawn and 8.5× at the
    radius cap; lateral shadow shift 1.574 → 0.215 (spawn) and
    29.255 → 3.438 (cap). Texel size itself went UP (0.3555 → 0.5 at spawn,
    6.6035 → 8.0 at the cap) — accepted, because the power-of-two ladder can
    make the box up to 2× larger than needed, and the texel is ~1 device
    pixel at every radius by construction while `shadow.radius` (art-
    direction.md §5) is now 3, so 2 device pixels of coarsening is still
    inside the PCF kernel's reach.
  - **The findings doc's own bias fix advice (§7.1) is WRONG and is NOT
    followed — record both halves.** §7.1 said tightening `cam.far` would
    make `shadow.bias` "mean roughly the same thing at every radius." A
    constant WORLD-space bias is not the goal: the self-shadowing error a
    depth bias has to cover is the depth change across ONE SHADOW TEXEL on
    the receiving surface, which scales WITH radius (texel size scales with
    radius). What was actually wrong was the CONSTANT OF PROPORTIONALITY —
    the shipped bias worked out to `0.0924r` world units against a
    requirement of `~0.0090r`, over-biased **10.3× at every radius**. That is
    exactly why the failure mode was always peter-panning (shadows detaching
    from casters) and never acne — §5.10 of the findings doc ("over-biased by
    an order of magnitude") is RIGHT; §7.1's proposed fix is WRONG. The
    shipped fix instead makes bias proportional to texel size directly (see
    the derivation above), which is the form the error actually takes.
  - **Cost:** +2 draw calls (43 → 45; the prior ground-fix entry above took
    it 42 → 43), +1,320 triangles, +0 textures, +0.098ms GPU (+5.3%) on the
    measured tier. Program count at L1 spawn measures **12** (an earlier
    record said 17 there; 17-19 appear later in a session once pooled
    effects and rival flywheels compile — 12 is the correct spawn figure).
    Draw calls and triangle counts reproduce exactly.
- **Shadow-box coverage gap at default pitch (new, open, 2026-07-28).** The
  findings doc's §4.1a killed the "shadow box too small" hypothesis using
  `FOV_DEFAULT = 40`; `main.js:254` actually passes `fov: 70`. Redone at 70:
  camera height `12r·sin(55°) = 9.83r`, top ray 20° below horizontal, ground
  intersection at `27.0r` from the camera — **20.1r beyond the avatar,
  against the shadow box's 14r half-extent.** The hypothesis is ALIVE, not
  dead: shadows visibly pop in ~14r ahead of the player at the default
  pitch. Covering it needs `half ≈ 36r` at 16:9 including lateral corners, a
  2.6× shadow-texel cost. Deliberately not spent this pass — Nico's call.

## 2. World representation — the spatial hash is the world

V1 re-derives "what's near X" by scanning the prop array per agent per
retarget. V2 makes a **uniform-grid spatial hash** the single source of
truth for proximity: swallow checks, rival targeting, cluster scoring,
vacuum pulls, minimap dots, and the look-ahead compass all query it.
Rebuilt incrementally per frame (only moved props re-insert). O(1) queries
are what makes instancing + 400 props + 3 rivals cheap.

## 3. Seeded world generation

Levels generate from `(metro, district, seed)` via a mulberry32-style PRNG.
Same inputs ⇒ identical layout, props, goldens. This unlocks:
- **Daily challenge** (seed = date) with zero backend.
- **Replayability of stars** (3★ runs aren't RNG luck).
- **Deterministic E2E tests** (the soak bot replays exact seeds).
Save format gains `seedHistory` but stays localStorage-only.

## 4. Module map (delta from V1)

```
src/
  engine/   input.js (state machine), camera.js (orbit+lookahead),
            scene.js, avatar.js, spatialhash.js (new), pools.js (new),
            instancing.js (new), effects.js (new: pooled one-shot event
            effects — the growth shockwave; art §5)
  systems/  swallow.js, combo.js, rivals.js, storms.js, achievements.js,
            audio.js
  content/  propkit.js, landmarks.js, districts.js (new: layout generator),
            groundtex.js (new)
  data/     formulas.js, levels.js, metros.js, seeds.js (new)
  meta/     save.js, upgrades.js, worldmap.js, collection.js, daily.js (new)
  ui/       overlays.js, minimap.js (new), format.js (new: shared compact
            number formatter — "1.25k"/"124k"/"1.25M" — used by both the
            HUD score readout and the "+N" mass float so the two never
            disagree; pure, no DOM/THREE), responsive.css work in index.html
```

Rules V1 already had, kept and enforced: no DOM/window at module top level;
THREE passed in, never imported by systems; pure functions where possible.

## 5. Tooling & testing — close the gaps V1 proved exist

- **E2E suite (Playwright) joins the logic suite.** Three tiers:
  1. *Boot smoke* (B1): load the deployed URL, assert canvas renders +
     zero console errors + start button clickable at 3 viewports
     (incl. 800×450, B9). Runs against the live URL after every deploy.
  2. *Flow*: start → map → intro → play → win → shop, scripted.
  3. *Soak*: the greedy bot plays seeded levels 1/25/50/75/100 to
     completion, asserting the 5 difficulty invariants (game-design §5).
     **Note (2026-07-27):** sampling only these 5 of 100 levels is exactly
     the defect that let the maximum-build ceiling ship broken — see
     `0003-hole-feel-and-visual-fidelity/00-findings.md` §16. Any ceiling/ease
     assertion (as opposed to a difficulty floor) needs the full 100-level
     sweep, not this sample.
- **Visual regression:** screenshot 5 fixed frames (title, map, spawn L1,
  mid-L1, spawn L50) against golden images with a small pixel tolerance.
  B8 (unstyled accordion) is exactly the bug this catches. **Standing
  caveat (2026-07-28, `4377c82`, §1):** this harness is headless Playwright,
  and headless Chromium caps `requestAnimationFrame` at ~30fps even with
  rendering disabled — any fps or frame-time figure this suite (or any
  future one built on it) reports is unusable as a performance claim. It is
  still valid for pixel-diff regression, which is what it is actually for;
  the caveat is specifically about repurposing it for timing.
- **Closed-loop play bot (`npm run test:play`, `scripts/play-bot.cjs`,
  added 2026-07-27):** joins two halves that existed separately —
  `scripts/soak-bot.js` (pure-Node brain: greedy routing against the real
  swallow/combo/rival systems, used by the soak tier above) and
  `scripts/flow-test.cjs` (real Playwright hands: keypresses into the
  input machine). Each tick it reads world state off `window.__fw`, picks
  a target with soak-bot's greedy rule, and expresses that decision
  **only** as `page.keyboard`/`page.mouse` events — it never writes game
  state. That constraint is the whole point of the harness: a bot that
  pokes mass to win proves nothing about whether a level is playable
  through real input, which is exactly what the sim-only soak tier above
  cannot tell you. Every run prints soak-bot's verdict for the same seed;
  a browser loss on a level the sim calls winnable is the divergence
  signal this harness exists to catch.
  - **Calibration probe:** before playing, presses `w` and checks
    observed displacement against the predicted camera-relative heading,
    hard-failing on mismatch. WASD is camera-relative and 8-directional,
    so a steering bug looks exactly like a working bot that wanders —
    this is the check that tells the two apart.
  - **Profiles:** `--profile=clean` (default, precise input) and
    `--profile=sloppy` (seeded input latency, heading overshoot, wrong
    turns) — sloppy exists to find "player got stuck" bugs a perfect bot
    never reaches. The noise stream is seeded, but browser frame timing
    is not, so sloppy failures reproduce statistically, not exactly; the
    soak-bot divergence assertion is deliberately gated to the clean
    profile only.
  - Other flags: `--level`, `--seed`, `--timeout`, `--headed`, `--shots`.
  - Verified 2026-07-27: L1, L12, L30 all WIN under clean, within ~3s of
    the sim's predicted time, zero console errors.
  - `scripts/deep-flow-test.cjs` is a **SCREEN test**, not player-fidelity
    evidence — it pokes state directly (e.g. `avatar.mass = 1200`) to
    reach a screen fast. Don't confuse its passes with play-bot's.
- **CI (GitHub Actions):** `npm test` + build + E2E headless on PR;
  deploy step on main. V1 has no CI; every bug above shipped through
  "ran it manually once."
- **Pre-deploy checklist becomes a script:** `npm run ship` = test → build
  → deploy → alias-verify (V1's deploys twice left the alias pointing at a
  stale deployment) → boot smoke against live.

## 6. Responsive & mobile (B9)

- Overlays become scrollable flex columns with `max-height: 100dvh` and
  `overflow-y: auto`; buttons never leave the viewport at 360×640.
- Touch: left half = virtual stick (move), right half = orbit drag; pinch
  = camera pitch. Larger HUD tap targets (≥44px).
- `prefers-reduced-motion`: disables screen shake, slow-mo, and the
  flywheel's idle spin (`avatar.js` `setSpinEnabled(false)`; the debris
  stream it used to gate was removed with the vortex funnel, see
  art-direction §2). The eat→grow beats (art §5) are **readability, not
  spectacle**, so they survive it in reduced form: the eat pop and rim
  impulse are unchanged, the Size-pill punch is unchanged (a pill kick is
  not vestibular), and the growth shockwave still fires but holds one
  radius and fades instead of travelling (`effects.js`
  `setReducedMotion`). The growth beat is never silently dropped — a
  player who cannot see the tier-up cannot learn the size gate. Rival
  growth rings follow the same rule (still fire, stop travelling).
  **Correction to an earlier claim in this file:** the Size-pill punch and
  the score-bar sheen are CSS animations, and index.html carries a global
  `html[data-reduced-motion="true"] * { animation:none; transition:none }`
  rule — so they ARE suppressed under reduced motion, by project-wide
  policy rather than by a per-effect decision. That is why the "+N" mass
  float is animated in JS instead of CSS: a CSS-animated float would
  appear under reduced motion and then never leave. Its reduced-motion
  variant drops the rise and keeps the number and the fade, because the
  "+N" is the readable value of a bite, not decoration.
- **Mobile GPU cost — UNMEASURED (open, 2026-07-28).** Every performance
  number in §1 (2.72 ms/frame, the 0.098ms shadow-snap cost, the 0.411ms
  caster pass) is from the desktop-tier device the live deploy was profiled
  on. The shadow feature alone is 0.545 ms of that 2.72 ms frame; on a
  mid-tier phone GPU that scales to something that plausibly matters, and
  nothing in this wiki has a real number for a phone yet. A device-tier
  switch is a ready, deliberately-not-built lever: dropping the shadow map
  to 1024px and setting `castShadow = false` on small-prop groups (trash,
  bikes, pedestrians, lamps — a few pixels of shadow at the gameplay camera
  anyway) measured −15% combined GPU on the desktop tier as a proxy. Spend
  this only once a real device measurement exists to spend it against.

## 7. What stays deliberately unchanged

- No bundler, no backend, vendored three (with **both** core files and a
  boot smoke so B1 can't recur). ES modules + import map still fit the
  game's size; if the module count doubles again, reassess — not before.
- localStorage saves (schema v2 with migration from `flywheel.save.v1`).
- The vendored-art pipeline (Leonardo stills) for logos/screens; in-game
  art is procedural by design.
