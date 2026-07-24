# Flywheel V2

Version 2 of [Flywheel](https://funnel-hub.vercel.app) — the 3D, 3rd-person
city eater. A rebuild, not a fork: same skeleton (Three.js, chase camera,
10 metros × 10 districts, eat-grow-capstone loop), rebuilt feel, look,
performance, and retention per the design wiki.

**Design source of truth: [`.wiki/INDEX.md`](.wiki/INDEX.md)** — read it
first. Every mechanic here is specified and motivated there.

## Status

Playable V2 build: Phases 1–3 implemented (feel, perf, content/meta) per
the wiki — camera-relative input state machine + orbit, seeded district
layouts with streets/zoning/ground texture, instanced rendering + spatial
hash + pooling, vortex hero, edibility signaling, 100-level unlock cadence,
rival archetypes (Grazer/Bandit/Duelist) with piñata payoffs, builds shop
with respec, metro tokens/perks, Skyline-opedia 2.0, daily challenge,
onboarding beats, mercy rules, minimap, responsive/touch UI.

Tests: `npm test` (logic suite + 100-level difficulty-invariant suite),
`npm run test:e2e` (Playwright boot smoke + scripted flow), `npm run ship`
(pre-deploy checklist, no deploy). Title/hub art generated via Leonardo
(`scripts/leonardo.js`).

## Layout (see `.wiki/tech-architecture.md` §4)

```
src/engine/   input (state machine), camera (orbit+lookahead), scene,
              avatar (vortex), spatialhash, pools, instancing
src/systems/  swallow, combo, rivals, storms, achievements, audio
src/content/  propkit, landmarks, districts (layout gen), groundtex
src/data/     formulas, levels, metros, seeds
src/meta/     save, upgrades (builds), worldmap, collection, daily
src/ui/       overlays, minimap
scripts/      serve, build, logic-test, invariant-test, soak-bot,
              smoke-test/flow-test/golden-test (e2e), ship, vendor-three,
              leonardo (art pipeline)
```

## Working agreements

- No bundler, no backend, vendored three.js (both core files — see
  lessons-from-v1 B1), localStorage saves, static deploy.
- `npm test` + browser E2E green before merge; the five difficulty
  invariants (`.wiki/game-design.md` §5) run in CI.
- V1 source lives at `../funnel-hub` for reference/porting; do not edit it
  from this project.
