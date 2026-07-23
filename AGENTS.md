# AGENTS.md

Onboarding contract for AI agents (and humans acting like one) working in this repo.

## What Flywheel is

An eat-'em-up game (in the spirit of hole.io), now set across 10 stylized city metros (10 districts/levels each, 100 total), rendered in true 3D with a 3rd-person chase camera behind a visible avatar. Swallow city props — trash, bikes, cars, buses, buildings — and eventually each metro's landmark capstone. See [`README.md`](README.md) for gameplay, controls, and setup, and [`docs/city-3d-redesign-plan.md`](docs/city-3d-redesign-plan.md) for the full design rationale (formulas, tiers, metro table).

## Architecture in one sentence

Three.js (vendored as an ES module, no bundler) rendered via `<script type="module" src="src/main.js">` and an import map (`three` → `./assets/vendor/three.module.js`), with all game logic split across plain ES modules under `src/` (`engine/`, `data/`, `content/`, `systems/`, `meta/`, `ui/`). `index.html` is now just markup/CSS/overlays plus that one module script tag — no inline game logic. `scripts/` holds Node tools (serve, build, test, vendor-three, art-generation CLI). Still no backend/database, but there IS persistence now: `localStorage` (via `src/meta/save.js`) for coins, upgrades, unlocked-level, stars, achievements, and the "Skyline-opedia" collection.

## Module map

- `src/main.js` — the only file that touches `document`/`window` at call time; bootstraps the engine once, wires every system together, and drives the screen flow (start → world map → level intro → play → done/fail → shop → next/win).
- `src/engine/` — `scene.js` (renderer/camera/clock), `avatar.js` (player growth/movement, `radius() = 26 + sqrt(mass)*1.9`), `camera.js` (chase cam with obstacle-avoidance raycast), `input.js` (keyboard/pointer → normalized axes).
- `src/data/` — `formulas.js` (`target(n) = 1000*n²` and every other per-level curve: time, world size, tier, rival count, hazard density, capstone gate, item-value multiplier), `metros.js` (the 10 metros + landmarks), `levels.js` (`generateLevel(n)`/`generateAllLevels()`).
- `src/content/` — `propkit.js`/`landmarks.js`: procedural Three.js geometry (no external model downloads) for props and landmark capstones.
- `src/systems/` — `audio.js`, `combo.js`, `achievements.js`, `swallow.js` (eat-gate math), `rivals.js`, `storms.js` — ported faithfully from the original 2D game (recoverable via `git show 97c9024:index.html`) and adapted to the 100-level economy.
- `src/meta/` — `save.js` (localStorage + in-memory fallback), `upgrades.js` (5 tracks: size/speed/magnet/time/growth), `collection.js`, `worldmap.js`.
- `src/ui/` — `overlays.js`: generic overlay show/hide, the shop renderer, and `updateHUD()`.

**Architectural rule that must hold for every module**: no browser-only API (`document`/`window`/`localStorage`) may be touched at module top level — only inside exported functions — so every file stays `import()`-able headlessly under plain Node (no DOM/GPU needed; Three.js geometry/Object3D construction needs no GPU context, only `WebGLRenderer.render()` does). This is what makes the test suite possible without a browser.

## Run / test

```bash
npm install                  # postinstall vendors three.module.js into assets/vendor/
npm start                    # serves at http://localhost:3003
npm test                     # 53-check headless suite (formulas, levels, save/upgrades, scene graph, swallow math, achievements/combo, audio)
npm run build                # copies index.html + assets/ + src/ into dist/
```

## Hard rules

- **Never commit `.leonardo-key`.** It's gitignored. The Leonardo AI API key comes only from the `LEONARDO_API_KEY` env var or that gitignored file — never hardcode it anywhere, including scripts or commit messages.
- **Run `npm test` before committing** any change under `src/` or to `index.html`. All 53 checks must pass. The suite imports the real modules directly (`import()` in plain Node) — it no longer regex-extracts a script tag, so splitting logic across files is expected and fine.
- **Run `npm run build` before pushing** — it now also copies `src/` into `dist/`, so a missing/renamed file under `src/` will surface there.
- **Static-only.** Don't introduce a backend, database, or server-side dependency. Persistence is `localStorage` only, client-side.
- **Keep THREE as dependency-injected**, not re-imported per module. `src/main.js` does the single `import * as THREE from 'three'` and passes that instance into every factory (`createEngine`, `createAvatar`, `createPropMesh`, etc.) — don't add a second `import * as THREE from 'three'` inside a new module.

## Deeper context

For architecture, conventions, module breakdowns, ADRs, and a deploy runbook, see `.wiki/INDEX.md` — a local-only wiki (not part of this public repo; it lives in the working copy but is gitignored/never committed). If you don't have local access to it, this file and [`STATUS.md`](STATUS.md) are the public-facing summary.
