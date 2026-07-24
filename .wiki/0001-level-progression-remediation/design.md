# Level Progression Remediation — Technical Design

> [Objective overview](00-overview.md) · [Requirements](requirements.md) ·
> [Implementation plan](tasks.md)

## Approach

The correction keeps the existing `1000n²` economy skeleton but makes all
progression inputs speak the same unit: fraction of target. Combo leaves the
mass path. Exceptional sources receive explicit caps. Timers become bounded.
Level data authors a five-level learning phase and active mechanic combination.
Reward settlement distinguishes first clear from replay, and permanent bonuses
are normalized before being applied.

## Progression flow

```text
generateLevel(n)
  -> target + bounded timer + progression phase + objectives + mechanics
  -> seeded district and declared mass budget
  -> swallow/event awards capped against target
  -> run metrics collected by gameplay and simulator
  -> objective-aware stars
  -> idempotent first-clear / star-improvement / replay settlement
  -> save v2
```

## Economy contract

### Ordinary props

Ordinary swallowed mass is:

```js
baseMass * itemValueMultiplier(n) * boundedBuildMassMultiplier
```

Combo is excluded. A build multiplier is permitted only while the maximum
single-event and completion-ceiling invariants still pass.

### Exceptional awards

Goldens, elite goldens, mega props, rival bonuses, storm drops, crumbs, and
capstones are clamped by shared helpers. Recommended starting caps:

- Ordinary golden total award: at most `0.10 * target`
- Elite golden total award: at most `0.15 * target`
- Any combined mega/golden object: at most `0.15 * target`
- Rival bonus: at most `0.10 * target`
- Any one swallow frame/event: at most `0.15 * target`

Spawned mass also counts toward a declared level-wide available-mass budget so
storms and crumbs cannot silently inflate the district.

The implementation keeps two explicit budgets:

- Route mass budget: `2 * target`, used for the 45–70% completion-consumption
  corridor.
- Available mass budget: `8 * target`, covering the initial district and all
  later storm, crumb, parade, twist, and command spawns. A shared runtime
  ledger admits, proportionally trims, or rejects dynamic records before they
  enter the gameplay roster.

### Combo

Combo remains a skill/readability system but affects score and a bounded coin
bonus, not growth. If a score field is not already persisted, it stays run-local
until a separate score-progression decision is approved.

## Timer curve

Replace `60 + 6n` with a bounded curve. Initial candidate:

```js
75 + 5 * ((levelInChapterOf(n) - 1) % 5)
```

This yields 75, 80, 85, 90, and 95-second teaching arcs. Authored pressure and
test levels may override up to 120 seconds. Build time bonuses apply afterward
but are included in ease-ceiling simulations.

The exact curve is tuning data, not an architectural commitment. The hard
contract is 75–120 base seconds for normal campaign levels.

## Five-level campaign rhythm

Each metro contains two arcs:

| Position | Phase | Purpose |
|---|---|---|
| 1 / 6 | teach | Introduce one mechanic or rule |
| 2 / 7 | reinforce | Repeat it with low pressure |
| 3 / 8 | pressure | Add route, time, or rival pressure |
| 4 / 9 | combine | Pair it with one mastered mechanic |
| 5 / 10 | test | Mastery check, reward beat, or metro capstone |

Mechanics are authored per level. Unlock level means "available to author," not
"permanently enabled forever."

## Stars and objectives

Each level declares one completion condition and up to two mastery conditions.
Examples that use existing mechanics:

- Finish within the target completion window.
- Eat the capstone.
- Eat a rival.
- Reach a bounded combo count.
- Collect one or both goldens.
- Finish without second wind.

One star is completion. The second and third stars correspond to the declared
mastery conditions. This avoids a universal speed-only rating while requiring
no new mode.

## Reward settlement

Recommended initial reward model:

- First clear: full `coinsForLevel(stars)` reward.
- Improved best stars: award only the positive difference between old and new
  star milestone value.
- Ordinary replay: 20% of the base completion reward, rounded deterministically.
- Golden coins and other explicitly run-earned currency remain separately
  bounded.

The settlement helper returns a breakdown and mutates claims once. `levelDone()`
displays/uses that result but does not recompute it.

## Permanent bonuses

Replace flat starting mass with base-mass units that scale through
`itemValueMultiplier(n)`, or with a percentage of a declared starting budget.
Keep move speed, reach, attraction, and time bonuses only if the upgraded
simulation still satisfies ease ceilings. No build changes unlock requirements.
The representative maximum-growth and maximum-utility builds must remain at or
above 25% of their extended timer and below the 15% single-event cap.

## Save normalization

`defaultSave()` adds reward claims. `loadSave()`:

1. Preserves every existing field.
2. Creates missing claim maps.
3. Infers claims from saved stars.
4. Clamps malformed claim values.
5. Never subtracts currency or re-locks levels.

The schema remains v2 because this is an additive normalization of the current
v2 shape. If implementation requires a semantic migration chain, increment an
internal revision rather than breaking the storage key.

## Alternatives considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Raise target about 4× | Small code change | Preserves single-item win buttons and hidden inflation | Reject |
| Cap combo mass at 1.5× | Retains combo-growth link | Still couples skill streaks to core balance | Reject |
| Remove combo from mass | Restores intended prop consumption and isolates scoring | Requires coin/score reward retune | Choose |
| Disable replay | Eliminates farming | Removes useful star/collection replay | Reject |
| Full replay rewards | Simple | Makes easiest-level farming optimal | Reject |
| Bounded replay reward | Keeps replay while favoring progress | Adds claim state | Choose |
| Continue permanent mechanic stacking | Minimal data work | Late levels become complexity piles | Reject |
| Author active mechanic sets | Supports teach/reinforce/test rhythm | More level data | Choose |

## Cross-cutting constraints

- Seeded generation and deterministic simulation remain mandatory.
- Economy values stay in `src/data/formulas.js`; level-specific authoring stays
  in `src/data/levels.js`.
- No new dependencies, backend, top-level DOM access, or Three.js imports in
  systems/data/meta code.
- No frontend modification without separate explicit approval.
