# STATUS.md

_Last updated: 2026-07-22._

## Built and working

Independently verified this session (main agent ran `npm test` and `npm run build` directly, not just trusting subagent self-reports): both pass clean on the current working tree.

- **Full 3D city rewrite is live in code** (`docs/city-3d-redesign-plan.md`, implemented 2026-07-22): true 3D via a vendored Three.js ES module (import map, no bundler), 3rd-person chase camera (with obstacle-avoidance raycast) behind a visible growing avatar, replacing the old 2D top-down canvas entirely. `index.html` no longer contains inline game logic — see `AGENTS.md` for the new `src/` module map.
- **100 levels across 10 stylized city metros** (10 districts each), generated formulaically (`src/data/levels.js` / `src/data/formulas.js`), not hand-authored. Score target is exactly `target(n) = 1000×n²` as requested (1k/4k/9k/…/10,000,000 at level 100). World size, timer, rival count, hazard density, and the capstone size-gate all scale independently per a 6-tier difficulty curve (tutorial → first-contest at level 6 → escalation → expert → master → capital-siege at 100), so difficulty genuinely spikes after level 6 without the per-level object count exploding — item *value* scales by n² instead, verified at a constant ~1.43x spawnable-mass-to-target ratio at every sampled level (1, 6, 7, 10, 25, 50, 100).
- **Full game loop wired end-to-end** (`src/main.js`): start → world map → level intro → play → done/fail → shop → next level or win screen at 100. Verified by reading the file directly — this is a real integration, not scaffolding.
- **Mandatory meta-progression, now actually built** (was "proposed" as of the last STATUS update): `localStorage` save (`src/meta/save.js`, with an in-memory fallback when storage is unavailable), a coin economy, 5 upgrade tracks (size/speed/magnet/time/growth) with a shop screen, a world-map level-select grid, per-level stars, and a "Skyline-opedia" collection album.
- **14 achievements** (11 original + 3 new: `metroCleared`, `centurion`, `hoarder`), combo multiplier (up to 5x, 6 named tiers), golden pickups (8x bonus), rush-hour "storm" drop events, edible rival holes (AI gets more aggressive at the master/capital-siege tiers), Konami-code god mode, and the `unsub`/`breeze` typed easter eggs — all ported faithfully from the original 2D game (recovered via `git show 97c9024:index.html`) and confirmed against the original's exact constants (eat-gate 0.82/0.78, combo formula, golden 8x, rival radius/timing).
- **53-check headless test suite** (`npm test` / `scripts/logic-test.js`, rewritten this session) — no longer regex-extracts a `<script>` tag; imports the real `src/` modules directly under plain Node. Covers formulas, level generation/pacing invariant, save/load (with and without localStorage), upgrades, real Three.js scene-graph construction (props/landmarks, no GPU needed), swallow math, achievements/combo, and audio. **53 passed, 0 failed**, confirmed by direct run.
- **`npm run build`** now also copies `src/` into `dist/` alongside `index.html` and `assets/` (including the vendored `assets/vendor/three.module.js`). Confirmed working.
- **AI-generated art assets** (`assets/`) and **synthesized Web Audio** carry over unchanged from before the rewrite.

## Known gaps (honest, not yet resolved)

- **Not visually verified in a browser.** Everything above was verified by direct code read + `npm test`/`npm run build` (both real, both passing) — nobody has actually loaded the game in a browser and played through it yet. Per standing rule, browser verification happens against a live deployed URL, never localhost, and this repo has no live URL yet (see below). This is the single biggest unverified area: WebGL rendering, camera feel, and UI layout have zero eyes-on confirmation.
- **The Integration stage's own final self-report was low-quality** — its structured `summary`/`knownGaps` fields came back as placeholder junk (`"summary": "test"`, `"knownGaps": ["a", "b"]`) despite the numeric fields (tests/build) checking out under independent verification. Treat any claim from that agent's prose as unverified; everything stated above in "Built and working" was re-checked directly against the repo, not taken from that report.
- **Stack-based spawning / vacuum mechanics** (`docs/redesign.md` Phase 1: clustered stacks, attract radius, multi-eat cascades) were **not** part of this implementation pass — explicitly scoped out as an optional stretch goal, not required for the city/3D/100-level rewrite.
- No CI — `npm test` and `npm run build` are run manually by whoever is pushing.
- No analytics or telemetry (by design — this is a static client-only game).

See `docs/city-3d-redesign-plan.md` for the full design (formulas, tier table, metro list), `docs/redesign.md` for the superseded/partial earlier proposal, and `docs/genre-research.md` for the underlying research.

## Repo / publishing status

- Public GitHub repo: `https://github.com/NicoLafakis/hubhole` (package name `hubhole`; the local working-copy folder is separately named).
- Version-controlled since 2026-07-22 (`git init -b main`, initial commit `97c9024`).
- Tracked: `index.html`, `package.json`, `package-lock.json`, `README.md`, `scripts/`, `docs/`, `assets/`, plus this file and `AGENTS.md`.
- **Untracked as of this update — not yet committed**: `src/` (the entire new module tree), `assets/vendor/` (vendored `three.module.js`), `docs/city-3d-redesign-plan.md`. `git add`/commit was not performed as part of this session's implementation pass.
- Gitignored: `.leonardo-key`, `node_modules/`, `dist/`, `.DS_Store`, `Thumbs.db`, `*.log`.
- Not deployed to a live URL yet — see `.wiki/runbooks/deploy.md` (local-only wiki) for the deploy options (Vercel/Netlify/GitHub Pages).
