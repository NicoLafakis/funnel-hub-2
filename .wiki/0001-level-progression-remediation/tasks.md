# Level Progression Remediation — Implementation Plan

> [Objective overview](00-overview.md) · [Requirements](requirements.md) ·
> [Technical design](design.md) · [Test strategy](test-strategy.md)

Each phase is ordered and independently verifiable. Do not begin later tuning
until the earlier economy gate is green.

- [x] **1. Freeze the baseline.** Record current 100-level completion-time,
  prop-consumption, maximum-award, star, and reward-farming results from the
  deterministic harness. Files: `scripts/soak-bot.js`,
  `.wiki/economy-balance-audit.md`. Done when the before-state is reproducible.

- [x] **2. Add failing ease ceilings first.** Extend the simulator and invariant
  suite with completion fraction, progression-budget consumption, maximum
  single award, and dynamic available-mass accounting. Files:
  `scripts/soak-bot.js`, `scripts/invariant-test.js`,
  `scripts/logic-test.js`. Done when current behavior fails for the documented
  reasons while existing difficulty floors still run.

- [x] **3. Decouple combo from growth.** Remove combo from progression mass and
  expose it only to bounded coin/score calculation. Files:
  `src/systems/combo.js`, `src/systems/swallow.js`, `src/main.js`,
  `src/data/formulas.js`. Done when identical swallows award identical mass at
  combo 0 and maximum combo.

- [x] **4. Budget exceptional mass.** Add shared target-relative helpers and
  apply them to goldens, elites, mega props, rivals, storms, crumbs, and
  capstones. Files: `src/data/formulas.js`, `src/data/levels.js`,
  `src/content/districts.js`, `src/systems/swallow.js`,
  `src/systems/rivals.js`, relevant storm/crumb wiring in `src/main.js`. Done
  when no event exceeds 15% of target and dynamic mass stays in budget.

- [x] **5. Bound normal timers.** Replace the linear 66–660 second curve with
  the declared 75–120 second contract and retune level targets/budgets only as
  needed to pass both floors and ceilings. Files: `src/data/formulas.js`,
  `src/data/levels.js`, simulator/tests. Done when 100/100 levels are
  completable and normal bot clears land in the target window.

- [x] **6. Normalize permanent progression.** Convert flat starting-mass perks
  and builds into base-mass or target-relative values; test maximum build
  combinations against ease ceilings. Files: `src/meta/upgrades.js`,
  `src/main.js`, formula and simulation tests. Done when benefits retain their
  intended ratio at levels 1, 25, 50, 75, and 100 without becoming gates.

- [x] **7. Make rewards progression-aware.** Add one canonical settlement
  helper for first clear, improved stars, and replay. Add idempotent reward
  claims and safe inference for existing saves. Files: `src/meta/save.js`, a
  progression/reward module under `src/meta/`, `src/main.js`, save fixtures.
  Done when repeated settlement cannot duplicate milestone rewards and early
  replay is not optimal.

- [x] **8. Author five-level arcs.** Add progression phases and explicit active
  mechanic sets to all 100 level descriptors. Treat mechanic unlocks as authoring
  availability, not permanent accumulation. Files: `src/data/levels.js`,
  relevant systems' defensive reads, descriptor tests. Done when every metro
  contains two valid teach/reinforce/pressure/combine/test arcs.

- [x] **9. Introduce objective-aware stars.** Move star calculation from
  `main.js` to pure progression logic using declared objectives and collected
  run metrics. Keep one star for completion and map two mastery conditions to
  stars two and three. Files: `src/data/levels.js`, progression module,
  `src/main.js`, tests. Done when star fixtures demonstrate distinct mastery
  paths and rewards remain idempotent.

- [x] **10. Reconcile documentation.** Update `.wiki/game-design.md`,
  `.wiki/content-and-meta.md`, `.wiki/roadmap.md`, and
  `.wiki/economy-balance-audit.md` with the final shipped formulas and measured
  post-change results. Done when docs and code state the same timer, budget,
  reward, upgrade, and invariant contracts.

- [x] **11. Run gates.** Run `npm test`, `npm run build`, and `npm run ship`
  without deployment. Live E2E waits for an explicitly deployed URL and Nico's
  approval. Done when all allowed gates pass and failures are documented.

- [ ] **12. Human calibration.** Playtest representative levels on the live
  build and record the metrics in the test strategy. Retune only declared data
  within the invariant bounds. Done when the numeric targets are supported by
  recorded human sessions rather than intuition.
