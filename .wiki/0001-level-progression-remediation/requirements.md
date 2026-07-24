# PRD 0001: Level Progression Remediation

> [Objective overview](00-overview.md) · [Technical design](design.md) ·
> [Implementation plan](tasks.md)

- **Status:** Implemented; automated gates complete, live human calibration pending
- **Priority:** P0 balance correction
- **Owner surface:** `src/data/formulas.js`, `src/data/levels.js`,
  `src/systems/swallow.js`, `src/meta/upgrades.js`, `src/meta/save.js`,
  `src/main.js`, `scripts/soak-bot.js`, `scripts/invariant-test.js`
- **Migration:** additive v2 save normalization; no save reset
- **Companion ADR:** [0001 — Target-normalized progression economy](adr/0001-target-normalized-progression.md)

## 1. Problem and goal

The current campaign is mathematically completable but not meaningfully paced.
The soak bot wins on roughly 20% of props and 3–17% of the timer because combo
multiplies growth mass up to 5×. Timers expand from 66 to 660 seconds, stars
collapse to easy 3-star awards, full rewards can be farmed from level 1, and
flat permanent bonuses decay against the `n²` economy.

The goal is a 100-level curve in which normal levels remain short, require a
substantial growth route, teach mechanics in readable arcs, and reward forward
progress without making upgrades mandatory.

## 2. Load-bearing invariant

Every mass source is bounded against `target(n)` and participates in automated
difficulty-floor and ease-ceiling tests across all 100 levels.

## 3. Goals

1. Normal campaign levels last 75–120 seconds before build bonuses.
2. The no-upgrade soak bot completes normal levels between 55% and 80% of the
   base timer and consumes 45–70% of the district's progression budget.
3. No single swallow event grants more than 15% of the target.
4. Every level remains completable without permanent upgrades.
5. Levels follow five-level teach, reinforce, pressure, combine, and test arcs.
6. First-clear rewards encourage forward progress; replay cannot be the optimal
   coin strategy.
7. Permanent progression choices retain comparable utility from level 1 to 100.
8. Existing v2 saves continue to load without losing coins, stars, builds,
   perks, collection state, or unlocked levels.

## 4. Non-goals

- No visual, asset, copy-style, layout, navigation, or animation changes.
- No backend, account, monetization, lives/energy, ads, or new dependency.
- No multiplayer, tournament, crew, leaderboard, or new game mode.
- No prestige/New Game+ implementation.
- No claim that competitor proprietary formulas are known.

## 5. Personas and user stories

- As a new player, I want early levels to teach one growth decision at a time
  so that success feels learned rather than automatic.
- As a progressing player, I want later levels to test combinations I have
  already learned without becoming progressively longer chores.
- As a completionist, I want stars and metro rewards to represent mastery.
- As a returning player, I want replay to remain available without making
  early-level farming the best progression path.
- As the balance maintainer, I want deterministic upper and lower bounds so
  economy regressions fail before merge.

## 6. Functional requirements

- **FR-001:** Combo shall not multiply progression mass. Combo may multiply a
  non-progression score and a bounded coin bonus.
- **FR-002:** Every golden, elite golden, mega prop, rival bonus, storm drop,
  crumb, capstone, starting-mass bonus, and mass-gain upgrade shall have an
  explicit target-relative budget or cap.
- **FR-003:** Normal base timers shall be selected from a bounded 75–120 second
  curve. Difficulty shall not be created by unbounded timer growth.
- **FR-004:** Each level descriptor shall expose its progression phase:
  `teach`, `reinforce`, `pressure`, `combine`, or `test`.
- **FR-005:** Newly introduced mechanics shall not automatically remain active
  in every later level; level descriptors shall author active combinations.
- **FR-006:** Completion rewards shall distinguish first clear, improved-star
  clear, and ordinary replay.
- **FR-007:** A replay shall not award more progression currency per expected
  minute than advancing through an uncleared level.
- **FR-008:** Stars shall evaluate declared level objectives. Time may remain
  one objective, but cannot be the only mastery signal for all 100 levels.
- **FR-009:** Permanent mass bonuses shall use target-normalized/base-mass
  values or non-decaying percentages.
- **FR-010:** Build choices shall improve style or efficiency but shall never
  be required by the no-upgrade completion invariant.
- **FR-011:** Save data shall record idempotent first-clear reward claims and
  preserve all existing v2 fields.
- **FR-012:** The invariant suite shall test both too-hard and too-easy bounds
  for every level.
- **FR-013:** Difficulty changes shall remain seeded and deterministic.

## 7. Data model and save compatibility

Add fields to `defaultSave()` and defensive normalization:

```js
rewardClaims: {
  firstClear: { [levelN]: true },
  starMilestones: { [levelN]: 0 | 1 | 2 | 3 }
}
```

Existing saves infer `firstClear[levelN] = true` for levels with saved stars.
Their saved star count becomes the claimed milestone. No existing currency is
removed and no reward is retroactively charged.

Level descriptors add pure-data fields:

```js
progression: {
  phase: 'teach' | 'reinforce' | 'pressure' | 'combine' | 'test',
  objectives: string[],
  targetCompletionRange: [0.55, 0.80],
  targetBudgetConsumptionRange: [0.45, 0.70]
}
```

Exact objective parameter shapes belong in `src/data/levels.js` and remain
defensively read by consumers.

## 8. Surfaces and UX

No frontend structural or visual work is authorized. Existing result, map,
shop, and HUD surfaces consume revised values. If objective-aware stars require
new player-facing explanation, that becomes a separately approved frontend
change.

## 9. Interface contract

No external API. Pure internal contracts should be centralized:

```js
progressionMassBudget(levelNumber)
maxSingleAward(levelNumber)
levelReward(level, result, saveData)
starResult(level, runMetrics)
```

All settlement must pass through the existing `levelDone()` flow; no parallel
reward path.

## 10. Security and access control

N/A: offline, single-player, localStorage application with no competitive
backend. Save tampering is accepted as a product constraint.

## 11. Data integrity and write path

Reward settlement must be idempotent for first-clear and star milestones.
`saveSave()` remains the canonical persistence call. A failed or repeated
settlement may not double-grant a first-clear reward.

## 12. Testing strategy

Pure formula and settlement behavior receives logic tests. All 100 levels run
through the deterministic simulator with no upgrades. Representative build
combinations run separately to prove they improve efficiency without creating
single-event wins. See [test strategy](test-strategy.md).

## 13. Observability and logging

No new analytics or logging service. The invariant script prints per-level
completion fraction, budget-consumption fraction, maximum single award, and
failure reason so balance failures are diagnosable in CI.

## 14. Error handling and player feedback

Malformed or missing new save fields normalize to safe defaults. Unknown
progression phases/objectives fall back to a normal completion objective.
Invalid numeric tuning fails logic tests rather than silently producing
`NaN`, negative timers, or unbounded rewards.

## 15. Performance and cost

No new dependency or runtime network cost. Added checks must remain linear in
the existing prop/event counts. The 100-level invariant suite should remain
suitable for the normal `npm test` gate.

## 16. Accessibility

N/A for this mechanics-only change. No DOM structure, interaction, or
player-facing presentation is changed.

## 17. Phases

1. Correct the mass economy and add ease ceilings.
2. Bound timers and validate all 100 levels.
3. Normalize permanent bonuses.
4. Split first-clear, star-improvement, and replay rewards.
5. Author five-level progression arcs and objective-aware stars.
6. Run full logic, invariant, build, and live-deployment verification gates.

Each phase must leave the logic suite green and the campaign completable.

## 18. Reuse — do not fork

Reuse `target()`, `itemValueMultiplier()`, `coinsForLevel()`,
`generateLevel()`, `checkSwallow()`, `applyBuilds()`, `defaultSave()`,
`loadSave()/saveSave()`, `simulateLevel()`, and `levelDone()`. Extend the
existing invariant suite rather than creating a second balance harness.

## 19. Acceptance criteria

- [x] AC-001 / FR-001: combo count changes do not change awarded mass.
- [x] AC-002 / FR-002: every mass source reports a target fraction and no
  single event exceeds 0.15× target.
- [x] AC-003 / FR-003: all normal base timers are 75–120 seconds.
- [x] AC-004 / FR-004–005: all 100 levels have a valid authored progression
  phase and active-mechanic set.
- [x] AC-005 / FR-006–007: first clear, star improvement, and replay settle
  distinct, idempotent rewards; level 1 farming is not optimal.
- [x] AC-006 / FR-008: stars are derived from declared objectives and produce
  meaningful 1/2/3-star separation in simulation fixtures.
- [x] AC-007 / FR-009–010: upgrade value does not decay under `n²` scaling and
  no-upgrade completion remains 100/100.
- [x] AC-008 / FR-011: old v2 save fixtures load with all previous progress and
  inferred reward claims.
- [x] AC-009 / FR-012–013: deterministic floor and ceiling invariants pass
  100/100 levels twice with byte-identical summaries.
- [x] AC-010: `.wiki/game-design.md`, `.wiki/content-and-meta.md`,
  `.wiki/roadmap.md`, and the economy audit agree with shipped behavior.

## 20. Dependencies and integration points

No external dependency. Internal ordering dependency: mass correction and
ceiling tests precede timer, rewards, stars, and authored-arc tuning.

## 21. Open questions

1. **Replay payout:** recommended default is 20% of the base level coin reward,
   with no repeated first-clear or star-milestone award. Zero reward is simpler
   but makes replay purely score/collection-driven.
2. **Capstone requirement:** recommended default is mandatory landmark
   consumption only on metro test levels (10, 20, …, 100); other levels may
   contain the landmark as an optional high-value target.
3. **Final target ranges:** begin with the numeric ranges in this PRD, then
   adjust only from live playtest evidence while retaining hard global ceilings.

## 22. Companion ADR

[ADR 0001](adr/0001-target-normalized-progression.md) records the decision to
normalize all progression economy effects against the level target.

## Implementation estimate

Medium-to-large, roughly six independently verifiable implementation phases.
The highest-risk work is reward migration and retuning the 100-level simulator,
not the one-line combo correction.
