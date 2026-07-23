# STATUS.md

_Last updated: 2026-07-23 (post-deploy verification pass)._

## Live

- **Deployed: https://funnel-hub.vercel.app** — Vercel project `funnel-hub`, serving the `dist/` static build. Redeploy flow: `npm run build && cd dist && vercel --prod`. SSO deployment protection was disabled via the Vercel API so the site is public.
- **Rebrand to Flywheel shipped (2026-07-23)**: the game is now **Flywheel** (previous brand retired) — title/og tags, start-screen copy, and all in-game vortex copy rewritten to flywheel language, package renamed to `flywheel`, save key moved to `flywheel.save.v1` (fresh key, no migration), and the logo/hero/rival/og art regenerated with flywheel prompts. No game-logic changes.

## Verified in a real browser (2026-07-23)

A scripted Playwright playthrough (start → world map → intro → play → done → shop → level 2, plus seeded level-25 and level-100 runs) confirmed movement, eating/growth, combos, achievements, notifications, save persistence, coins/stars, shop, unlock progression, rivals, and the landmark capstone gate — zero console errors, locally and on the live URL. Three shipped bugs were found and fixed in commit `de9df67`:

- **Boot blocker**: `assets/vendor/three.core.js` was missing (three r185 split build) — the game never loaded. `scripts/vendor-three.js` now vendors both files.
- **Camera inside the avatar**: chase-camera offset didn't scale with avatar radius, so the screen showed the inside of the player sphere and no city. Framing now scales (~2.2r away, ~29° down).
- **Rival-bonus curve break**: `(150+level*50)*itemValueMultiplier` paid 5.15× the entire level-100 target (one rival eat = instant win). Now a constant 20%-of-target share (`200 * itemValueMultiplier`).
- Plus a look-and-feel improvement: prop placement is zoned with a "spawn feast" ring near the player start instead of uniform scatter (the chase-camera view was empty).

## Built and working

Independently verified this session (main agent ran `npm test` and `npm run build` directly, not just trusting subagent self-reports): both pass clean on the current working tree.

- **Full 3D city rewrite is live in code** (`docs/city-3d-redesign-plan.md`, implemented 2026-07-22): true 3D via a vendored Three.js ES module (import map, no bundler), 3rd-person chase camera (with obstacle-avoidance raycast) behind a visible growing avatar, replacing the old 2D top-down canvas entirely. `index.html` no longer contains inline game logic — see `AGENTS.md` for the new `src/` module map.
- **100 levels across 10 stylized city metros** (10 districts each), generated formulaically (`src/data/levels.js` / `src/data/formulas.js`), not hand-authored. Score target is exactly `target(n) = 1000×n²` as requested (1k/4k/9k/…/10,000,000 at level 100). World size, timer, rival count, hazard density, and the capstone size-gate all scale independently per a 6-tier difficulty curve (tutorial → first-contest at level 6 → escalation → expert → master → capital-siege at 100), so difficulty genuinely spikes after level 6 without the per-level object count exploding — item *value* scales by n² instead, verified at a constant ~1.43x spawnable-mass-to-target ratio at every sampled level (1, 6, 7, 10, 25, 50, 100).
- **Full game loop wired end-to-end** (`src/main.js`): start → world map → level intro → play → done/fail → shop → next level or win screen at 100. Verified by reading the file directly — this is a real integration, not scaffolding.
- **Mandatory meta-progression, now actually built** (was "proposed" as of the last STATUS update): `localStorage` save (`src/meta/save.js`, with an in-memory fallback when storage is unavailable), a coin economy, 5 upgrade tracks (size/speed/magnet/time/growth) with a shop screen, a world-map level-select grid, per-level stars, and a "Skyline-opedia" collection album.
- **14 achievements** (11 original + 3 new: `metroCleared`, `centurion`, `hoarder`), combo multiplier (up to 5x, 6 named tiers), golden pickups (8x bonus), rush-hour "storm" drop events, edible rival flywheels (AI gets more aggressive at the master/capital-siege tiers), Konami-code god mode, and the `unsub`/`breeze` typed easter eggs — all ported faithfully from the original 2D game (recovered via `git show 97c9024:index.html`) and confirmed against the original's exact constants (eat-gate 0.82/0.78, combo formula, golden 8x, rival radius/timing).
- **53-check headless test suite** (`npm test` / `scripts/logic-test.js`, rewritten this session) — no longer regex-extracts a `<script>` tag; imports the real `src/` modules directly under plain Node. Covers formulas, level generation/pacing invariant, save/load (with and without localStorage), upgrades, real Three.js scene-graph construction (props/landmarks, no GPU needed), swallow math, achievements/combo, and audio. **53 passed, 0 failed**, confirmed by direct run.
- **`npm run build`** now also copies `src/` into `dist/` alongside `index.html` and `assets/` (including the vendored `assets/vendor/three.module.js`). Confirmed working.
- **AI-generated art assets** (`assets/`) and **synthesized Web Audio** carry over unchanged from before the rewrite.

## Known gaps (honest, not yet resolved)

- **No storms on levels 1–10 by design** (they're the hazard system, starting at escalation tier) — the Storm Chaser achievement is therefore unlockable only from level 11 onward. Worth deciding if that's intended.
- **Economy is slow at the start**: a level-1 win pays ~56 coins vs a 100-coin first upgrade, so the first purchase takes ~2 levels.
- **The Integration stage's own final self-report was low-quality** — its structured `summary`/`knownGaps` fields came back as placeholder junk (`"summary": "test"`, `"knownGaps": ["a", "b"]`) despite the numeric fields (tests/build) checking out under independent verification. Treat any claim from that agent's prose as unverified; everything stated above in "Built and working" was re-checked directly against the repo, not taken from that report.
- **Stack-based spawning / vacuum mechanics** (`docs/redesign.md` Phase 1: clustered stacks, attract radius, multi-eat cascades) were **not** part of this implementation pass — explicitly scoped out as an optional stretch goal, not required for the city/3D/100-level rewrite.
- No CI — `npm test` and `npm run build` are run manually by whoever is pushing.
- No analytics or telemetry (by design — this is a static client-only game).

See `docs/city-3d-redesign-plan.md` for the full design (formulas, tier table, metro list), `docs/redesign.md` for the superseded/partial earlier proposal, and `docs/genre-research.md` for the underlying research.

## Repo / publishing status

- Public GitHub repo: `https://github.com/NicoLafakis/hubhole` (repo URL predates the rebrand; package name is now `flywheel`; the local working-copy folder is separately named).
- Version-controlled since 2026-07-22 (`git init -b main`, initial commit `97c9024`).
- Tracked: `index.html`, `package.json`, `package-lock.json`, `README.md`, `scripts/`, `docs/`, `assets/`, `src/`, plus this file and `AGENTS.md`.
- Gitignored: `.leonardo-key`, `node_modules/`, `dist/`, `.DS_Store`, `Thumbs.db`, `*.log`.
- **Deployed**: https://funnel-hub.vercel.app (see "Live" above).
