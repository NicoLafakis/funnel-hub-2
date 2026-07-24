# Economy Balance Audit — levels complete far too fast

**Date:** 2026-07-24
**Verdict:** Confirmed. Levels are winnable on ~20% of the props and in
~3–17% of the timer. The felt problem is real and has one dominant cause.

Everything below is measured against the code as committed at `e808857`,
using the repo's own conservative soak bot (`scripts/soak-bot.js`) plus a
direct replay of the eat order through the real `combo.js` tracker.

---

## 1. What the design intends

`src/data/levels.js` states the intent explicitly (lines 42–56):

- `sum(baseMass * baseCount)` across the 7 tiers = **4281**
- `target(n) / itemValueMultiplier(n)` = **1000** at every level
- ⇒ a level carries **4.28x** its target in available mass
- Stated goal: *"winning must require eating ~25% of the content"*

That ratio is level-invariant by construction (both `target(n)` and
`itemValueMultiplier(n)` carry the same `n²` skeleton), and it is correct
**as far as it goes**.

## 2. What actually happens

The intent is expressed in **base mass**. The award path is not.
`src/systems/swallow.js:126`:

```js
let gained = obj.mass * itemValueMultiplier * mult;
```

`mult` is the combo multiplier — `1 + min(4, floor(count/4))`, i.e. **up to
5x**, reached after 16 eats and held as long as the player eats once every
2.2s. With 369 props in a district, the combo window is effectively never
allowed to lapse. The player spends nearly the whole run at 4–5x.

The combo multiplier is **not** in the 4.28x invariant. Fold it in and the
effective available mass is **~4.28 × 5 ≈ 21x target**.

### Measured: props required to reach target

Replaying the real prop roster in the order the size gate forces
(smallest tier first) through the real combo tracker:

| Level | Props to hit target (with combo) | % of district | Without combo | % of district |
|---|---|---|---|---|
| 1 | 75 | 20.3% | 236 | 64.0% |
| 25 | 75 | 20.3% | 236 | 64.0% |
| 50 | 75 | 20.3% | 236 | 64.0% |
| 100 | 75 | 20.3% | 236 | 64.0% |

(369 props per district at every level.)

**64% is the design's intended feel. 20% is what ships.** The combo
multiplier alone accounts for the entire gap.

### Measured: the soak bot's runs

`scripts/soak-bot.js` is deliberately pessimistic — greedy nearest-edible
routing, no cluster planning, no golden detours, no vacuum-snap assist, no
storm mass, no upgrades, no builds, no perks, traffic treated as parked.
A human outperforms it on every axis. It still wins like this:

| Level | Timer | Won at | % of timer used | Final mass ÷ target |
|---|---|---|---|---|
| 1 | 66s | 6.4s | 9.7% | 11.6x |
| 5 | 90s | 7.6s | 8.4% | 11.9x |
| 10 | 120s | 19.6s | 16.3% | 19.3x |
| 20 | 180s | 28.0s | 15.6% | 9.3x |
| 25 | 210s | 18.4s | 8.8% | 12.2x |
| 40 | 300s | 19.6s | 6.5% | 8.5x |
| 50 | 360s | 33.2s | 9.2% | 7.9x |
| 75 | 510s | 37.4s | 7.3% | 8.7x |
| 90 | 600s | 16.8s | **2.8%** | 14.6x |
| 100 | 660s | 41.4s | 6.3% | 11.2x |

No level in the sample uses more than 17% of its clock. The timer is
decorative. So is most of the district.

## 3. Secondary amplifiers (all stack on top)

Each of these was derived in base-mass terms and is then silently
multiplied by the same combo `mult` at award time:

1. **Goldens.** `src/content/districts.js:508` picks goldens from tiers
   1–5. At 5x combo, one golden is worth, as a fraction of the *entire
   level target*:

   | Golden tier | Base mass | Value at 5x combo |
   |---|---|---|
   | 1 bike | 5 | 0.20x target |
   | 2 car | 9 | 0.36x target |
   | 3 bus | 16 | 0.64x target |
   | 4 building-small | 28 | **1.12x target** |
   | 5 building-medium | 48 | **1.92x target** |

   A single tier-5 golden is a win button — nearly two whole levels of
   mass from one prop. Elite goldens (L71+) double it again to 16x.

2. **Mega-props** (L26+, `districts.js:497`) triple a prop's mass and are
   drawn from tiers ≥4. A mega tier-5 golden is possible: 48 × 3 × 8 × 5
   = 5.76x target from one object. (Available mass rises to ~4.7x base
   from L26 onward — visible in the audit run as `availBaseVsTarget`.)

3. **Rival eat bonus** = `100n²` = 10% of target, per rival, and it is
   further multiplied by `massGainMultiplier` and `rivalBonusMultiplier`
   at `main.js:1629`. Correctly derived as a fraction of target; simply
   generous on top of an economy that is already 21x over.

4. **Storm drops** (L11+) and piñata crumbs add props *beyond* the 4281
   budget, none of it counted in the invariant.

5. **Upgrades / builds.** `massGainMultiplier` reaches 1.2+ before growth
   tiers, and multiplies `res.massGained` — which already contains combo.

## 4. Why nothing caught it

`scripts/invariant-test.js` asserts five invariants. Every one is a
**floor on difficulty**, none is a **ceiling on ease**:

1. reachable mass ≥ 1.5x target — floor
2. avatar radius ≤ 0.25x world — cosmetic
3. rival hoard ≤ player mass — floor
4. capstone edible by 90% of timer — floor
5. every level completable by the bot — floor

Invariant 5 records `completionTime / level.time` as a *margin* and prints
it, but never asserts an upper bound. A bot winning at 2.8% of the timer
passes the suite cleanly. The immune system only ever tested for "too
hard."

## 5. Recommended fixes, in order of leverage

**A. Stop making combo a mass multiplier (single biggest lever).**
Combo should multiply **coins and score**, not mass. Removing it from the
mass path restores exactly the designed 64%-of-props / 4.28x economy with
zero retuning elsewhere. If combo must stay in the mass path, cap it at
~1.5x rather than 5x. This is one line: `swallow.js:126`.

**B. Cap golden value against the target, not against the prop.**
Restrict golden eligibility to tiers 1–3, and/or express the golden bonus
as a fixed fraction of `target(n)` the way `rivalEatBonus` already is
(that function is the correct pattern — lesson B3 applied). No single
prop should be worth more than ~10–15% of a level.

**C. Add ceiling invariants to the suite.** Three assertions, all cheap:
   - bot completion time ≥ ~50% of the timer
   - props eaten at win ≥ ~40% of the district budget
   - no single prop worth more than 0.15 × target at max combo

   Without these, any future retune drifts straight back here.

**D. Only if A is rejected:** raise `target(n)` by ~4x (i.e. `4000n²`).
This is the worse fix — it papers over the multiplier rather than
correcting it, and leaves single-prop win buttons intact.

**Recommendation: A + B + C.** A restores the intended pacing, B removes
the outlier spikes A alone would leave, C keeps it there.

## 6. Open call for Nico

Fix A changes the feel of the combo system: combo stops being the thing
that wins the level and becomes the thing that pays out. That is a design
decision, not a bug fix — flagging it rather than assuming it.
