# AGENTS.md — Flywheel V2

3D third-person city-eater web game. Three.js r185 (vendored), ES modules +
import map, **no bundler, no backend**, localStorage saves, static deploy.

## Source of truth

- Design intent: `.wiki/` (read `INDEX.md` first). Docs are intent; code
  comments are mechanism. When they disagree, fix the doc in the same change.
- V1 reference: `../funnel-hub` (read-only — never edit it from here).
- `lessons-from-v1.md` B1–B9 / D1–D4: before touching boot, camera, input,
  economy formulas, respawns, or world coordinates, re-read the matching
  lesson.

## Hard rules

- No new npm dependencies. No CSS frameworks.
- Only `assets/vendor/three.module.js` + `three.core.js` — both are required
  (B1). No `three/examples/jsm` imports; they are not vendored.
- `src/engine/*` may `import 'three'`; `src/systems|content|data|meta/*` may
  NOT (THREE is passed in). No DOM/window at module top level anywhere in
  `src/` except `main.js` and `src/ui/*` (functions only).
- All world/level generation is seeded (`src/data/seeds.js`) — no
  `Math.random()` in generation paths. Same seed ⇒ identical level.
- Every DOM structure ships with its CSS in the same change (B8). Every
  overlay stays reachable at 360×640 and 800×450 (B9).
- Economy/values come from `src/data/formulas.js` — never hardcode literals
  (B3). The 5 difficulty invariants (`.wiki/game-design.md` §5) must pass
  100/100 levels before merge.

## Commands

- `npm start` — dev server on :3003
- `npm test` — logic suite + 100-level invariant suite
- `npm run test:e2e` — Playwright boot smoke (3 viewports) + scripted flow
  (uses the globally installed Playwright, `process.env.APPDATA +
  "/npm/node_modules/playwright"`, from `.cjs` scripts)
- `npm run build` / `npm run ship` — dist build / pre-deploy checklist
  (ship never deploys by default)
- `node scripts/leonardo.js` — art pipeline (key from `.leonardo-key`,
  gitignored; never print it). Generated city surfaces live in
  `assets/textures/` (building facades per tier + ground zones) and are
  loaded at runtime by `src/content/textures.js` — the game must keep
  working with those files missing (procedural fallback).
- `node scripts/screenshot-city.cjs` — visual check: boots level 1 (dev
  server must be running) and writes gameplay screenshots to `shots/`.

## Conventions

- Comedy voice in all player-facing text (see existing overlays/collection).
- Prop/level/metro data lives in `src/data|content` as pure data; systems
  read flags defensively with defaults.
- Save schema is v2 (`flywheel.save.v2`) with migration from v1 — extend
  `defaultSave()` + `migrateV1` chain, never break old blobs.
