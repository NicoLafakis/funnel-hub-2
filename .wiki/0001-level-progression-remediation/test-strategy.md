# Level Progression Remediation — Test Strategy

> [Requirements](requirements.md) · [Technical design](design.md)

## Acceptance-criteria coverage

| Criterion | Level | Location |
|---|---|---|
| AC-001 combo-independent mass | Unit | `scripts/logic-test.js`, `src/systems/swallow.js` |
| AC-002 bounded mass sources | Unit + simulation | logic suite and `scripts/invariant-test.js` |
| AC-003 bounded timers | Unit | formulas/level generation tests |
| AC-004 five-level authored arcs | Unit | all-level descriptor validation |
| AC-005 idempotent reward settlement | Unit + save fixtures | meta progression/save tests |
| AC-006 objective-aware stars | Unit | objective/star fixtures |
| AC-007 normalized upgrades | Unit + simulation | build matrix against levels 1/25/50/75/100 |
| AC-008 old saves preserved | Unit | v2 and migrated-v1 fixtures |
| AC-009 deterministic floor/ceiling | Simulation | two 100-level invariant passes |
| AC-010 docs match behavior | Review gate | `.wiki/` source-of-truth check |

## Required invariants

Run against all 100 levels:

1. Base timer is 75–120 seconds.
2. Avatar radius at target is at most 25% of world width.
3. Rival hoard at minute one does not exceed player-reachable mass.
4. Required capstones are edible by 90% of the timer.
5. The no-upgrade bot completes every level.
6. No-upgrade completion time is 55–80% of base timer.
7. Completion consumes 45–70% of the 2× target route budget.
8. Maximum swallow-frame or rival award is at most 0.15× target.
9. Initial plus dynamic progression mass stays within the 8× target
   available-mass budget.

The full 100-level summary is generated twice and compared byte-for-byte.
Maximum-growth and maximum-utility builds run at levels 1, 25, 50, 75, and 100;
they must complete at or after 25% of their extended timer and retain the 15%
single-event cap.

## Critical edge cases

- Golden + elite + mega flags appearing together.
- Multiple props swallowed in one frame.
- Storm or piñata mass added after initial generation.
- Maximum mass-gain and time-extension builds.
- Replay after first clear, after star improvement, and after full 3-star claim.
- Existing save with stars but no reward claims.
- Corrupt claim values, unknown objective ids, and invalid tuning values.
- Level 100 unlock behavior and repeated completion.

## Verification gates

1. `npm test`
2. `npm run build`
3. `npm run ship` pre-deploy checks, without deployment
4. Live E2E only when a deployed URL containing the change exists

Never start a localhost server or run browser automation against localhost.
Deployment requires Nico's explicit instruction.

## Playtest calibration

Automation guards mathematical bounds; it does not prove fun or human pass
rates. Record, for representative levels 1, 5, 10, 25, 50, 75, and 100:

- completion time / base timer;
- props and budget consumed;
- first meaningful size increase;
- time spent with no edible target;
- star result;
- retries and mercy use.

Adjust target ranges only from recorded sessions. Keep the global single-event
cap and deterministic budget accounting unless a new ADR replaces them.
