# Flywheel V2

Version 2 of [Flywheel](https://funnel-hub.vercel.app) — the 3D, 3rd-person
city eater. A rebuild, not a fork: same skeleton (Three.js, chase camera,
10 metros × 10 districts, eat-grow-capstone loop), rebuilt feel, look,
performance, and retention per the design wiki.

**Design source of truth: [`.wiki/INDEX.md`](.wiki/INDEX.md)** — read it
first. Every mechanic here is specified and motivated there.

## Status

Scaffold. See the [roadmap](.wiki/roadmap.md): Phase 1 (Feel) is up first —
input state machine, camera-relative steering + orbit, district layouts,
vortex hero, edibility glow.

## Layout (planned — see `.wiki/tech-architecture.md` §4)

```
src/engine/   input, camera, scene, avatar, spatialhash, pools, instancing
src/systems/  swallow, combo, rivals, storms, achievements, audio
src/content/  propkit, landmarks, districts, groundtex
src/data/     formulas, levels, metros, seeds
src/meta/     save, upgrades, worldmap, collection, daily
src/ui/       overlays, minimap
scripts/      serve, build, test, vendor-three, e2e
```

## Working agreements

- No bundler, no backend, vendored three.js (both core files — see
  lessons-from-v1 B1), localStorage saves, static deploy.
- `npm test` + browser E2E green before merge; the five difficulty
  invariants (`.wiki/game-design.md` §5) run in CI.
- V1 source lives at `../funnel-hub` for reference/porting; do not edit it
  from this project.
