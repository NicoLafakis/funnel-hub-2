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
            instancing.js (new)
  systems/  swallow.js, combo.js, rivals.js, storms.js, achievements.js,
            audio.js
  content/  propkit.js, landmarks.js, districts.js (new: layout generator),
            groundtex.js (new)
  data/     formulas.js, levels.js, metros.js, seeds.js (new)
  meta/     save.js, upgrades.js, worldmap.js, collection.js, daily.js (new)
  ui/       overlays.js, minimap.js (new), responsive.css work in index.html
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
- **Visual regression:** screenshot 5 fixed frames (title, map, spawn L1,
  mid-L1, spawn L50) against golden images with a small pixel tolerance.
  B8 (unstyled accordion) is exactly the bug this catches.
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
- `prefers-reduced-motion`: disables screen shake, slow-mo, and the debris
  stream.

## 7. What stays deliberately unchanged

- No bundler, no backend, vendored three (with **both** core files and a
  boot smoke so B1 can't recur). ES modules + import map still fit the
  game's size; if the module count doubles again, reassess — not before.
- localStorage saves (schema v2 with migration from `flywheel.save.v1`).
- The vendored-art pipeline (Leonardo stills) for logos/screens; in-game
  art is procedural by design.
