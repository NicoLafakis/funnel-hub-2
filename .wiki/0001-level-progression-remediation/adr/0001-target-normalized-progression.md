# 0001. Normalize progression economy against level target

**Status:** Accepted · **Date:** 2026-07-24

Serves [PRD 0001](../requirements.md).

## Context

Flywheel scales its target and ordinary prop values by `n²`, but several
effects apply later as independent multipliers or flat values. Combo turns the
documented 4.28× available-mass economy into approximately 21×, exceptional
objects can exceed an entire target, spawned mass is outside the budget, and
flat permanent bonuses become irrelevant at high levels.

Raising targets would hide the current symptom without preventing the next
unbudgeted multiplier.

## Decision

Use `target(n)` as the common denominator for every progression-affecting mass
source. Combo will not affect growth mass. Exceptional awards and whole-level
spawned mass will use shared target-relative caps. Permanent starting-mass
bonuses will be normalized through the same `itemValueMultiplier(n)` economy.
Automated tests will enforce both minimum reachability and maximum ease.

## Alternatives considered

- Increase all targets by about four times.
- Retain combo growth but cap it near 1.5×.
- Tune each exceptional source independently without a shared unit.

All three leave multiple interacting balance systems without a common budget
and make future regressions difficult to detect.

## Consequences

- Balance changes become comparable and testable across all 100 levels.
- Combo becomes a score/economy skill system rather than a win accelerator.
- Existing golden, mega-prop, storm, crumb, rival, capstone, and build values
  require a one-time retune.
- New mass sources must declare and test their target fraction before merge.
- Target normalization does not dictate the final feel; playtest evidence still
  selects values within the enforced bounds.

