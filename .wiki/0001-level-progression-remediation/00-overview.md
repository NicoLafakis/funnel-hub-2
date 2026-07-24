# Level Progression Remediation — Objective Overview

**Tier:** 2 · **Date:** 2026-07-24 · **Status:** implemented; live human calibration pending

## What was asked

Remediate Flywheel's level progression using the current-code audit and
observable progression patterns from successful mobile eat-and-grow games.
The work is mechanics-only: no visual redesign, asset work, monetization, or
backend.

## What it really serves

Make each level deliver a legible growth arc in a short mobile-sized session,
make the 100-level campaign teach and test mastery instead of merely adding
time, and make permanent rewards encourage forward progress rather than
level-1 farming.

The benchmark set is:

- [Hole.io](https://play.google.com/store/apps/details?id=io.voodoo.holeio):
  short eat-and-grow sessions and immediate size escalation.
- [All in Hole](https://homa.helpshift.com/hc/en/9-all-in-hole/section/37-gameplay-1719416354/):
  discrete goals, streak rewards, bonus levels, helpers, and no farming of
  completed campaign levels.
- [Attack Hole](https://apps.apple.com/us/app/attack-hole-black-hole-games/id1661115841):
  a two-stage gather-then-convert level arc.
- [Tornado.io](https://apps.apple.com/gb/app/tornado-io/id1415515883):
  match-sized play, boosts, tournaments, and prestige ranking.
- [Donut County](https://apps.apple.com/us/app/donut-county/id1292099839):
  introduce, explore, and recombine mechanics without permanently stacking
  every idea into every later level.

These sources establish mechanic patterns, not proprietary balance formulas.
Flywheel's numeric curve will be derived from deterministic simulations and
playtest targets rather than invented competitor statistics.

## Load-bearing invariant

Every progression-affecting mass source must be representable as a bounded
fraction of `target(n)` and must be included in both a difficulty floor and an
ease ceiling. No reward, multiplier, upgrade, or spawned object may bypass that
budget.

## 20 moves ahead

- **Next wants:** campaign playtesting can tune a small set of declared target
  ranges rather than editing unrelated constants.
- **Breaks at scale / edges:** authored modifiers can still create impossible
  or trivial layouts; the soak bot and per-level budgets remain merge gates.
- **Unlocks:** objective-aware stars, bonus stages, and eventual New Game+ can
  reuse the same level contract without changing the core economy again.
- **Doors kept open:** level descriptors gain explicit pacing and reward
  fields; no new mode, backend, dependency, or UI structure is required.
- **Doors shut:** unbounded mass multipliers, ten-minute normal levels, and
  full campaign rewards from repeatedly farming the easiest district.

## Scope line

- **Building:** bounded mass economy, short-session timers, five-level teaching
  arcs, first-clear versus replay rewards, normalized upgrades, objective-aware
  stars, ceiling invariants, save-safe reward claims, and source-of-truth docs.
- **Surfacing for Nico's call:** whether replay rewards should be reduced or
  removed; final timer/completion target ranges after live playtest; whether a
  capstone must be eaten on every level or only metro capstones.
- **Dropping:** lives/energy, ads, purchases, tournaments, crews, leaderboards,
  new modes, new assets, interface redesign, and analytics services.

## Caliber and package

Tier 2 because the correction crosses formulas, level generation, reward
settlement, upgrades, saves, simulation, tests, and multiple source-of-truth
documents. Package:

- [Requirements / PRD](requirements.md)
- [Technical design](design.md)
- [Decision record](adr/0001-target-normalized-progression.md)
- [Test strategy](test-strategy.md)
- [Implementation plan](tasks.md)
