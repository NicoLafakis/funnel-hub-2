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
- **Shadow pass has no effective culling (open, pre-existing).** Every prop
  group casts shadows as one world-spanning `InstancedMesh`, so Three cannot
  cull any instance out of the shadow pass and the full prop roster is
  rasterized twice per frame (shadow map plus main pass); the main pass has a
  real per-instance frustum cull, the shadow pass has none
  (`0005-ground-rendering-defect/00-findings.md` §4.4). Measured on the live
  deploy: 31.2fps sustained at 1440×900 on an Intel iGPU at 434k tris/frame.
  Not caused by the 2026-07-27 fix above; recorded here because it is the
  largest remaining GPU cost this wiki has a number for.
- **Shadow-frustum crawl — IN PROGRESS, not fixed by `00ff4a1`.**
  `followShadow()` (`scene.js`) rebuilds the sun's orthographic shadow volume
  from the avatar's live radius every frame with no texel snapping and no
  size hysteresis, so the shadow map's world-to-texel mapping both translates
  and rescales per frame (`0005-ground-rendering-defect/00-findings.md` §4.1,
  its RC-1). The commit message for `00ff4a1` names this the largest known
  remaining contributor to motion instability and deliberately does not touch
  it. A follow-up pass covering this plus atmosphere work is in flight.

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
  B8 (unstyled accordion) is exactly the bug this catches.
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

## 7. What stays deliberately unchanged

- No bundler, no backend, vendored three (with **both** core files and a
  boot smoke so B1 can't recur). ES modules + import map still fit the
  game's size; if the module count doubles again, reassess — not before.
- localStorage saves (schema v2 with migration from `flywheel.save.v1`).
- The vendored-art pipeline (Leonardo stills) for logos/screens; in-game
  art is procedural by design.
