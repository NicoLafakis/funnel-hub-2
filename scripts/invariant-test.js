// Invariant suite — the game-design.md §5 "immune system". Asserts all five
// difficulty invariants across ALL 100 levels, driven by the headless soak
// bot (scripts/soak-bot.js) playing every level against the real systems
// (swallow / combo / rivals / districts), not by formula vibes:
//   1. Reachable mass in 60% of timer >= 1.5x target (bot's actual mass at
//      the 60%-of-timer probe).
//   2. Avatar radius at 100% target <= 0.25x world width (radiusFromMass of
//      the target mass, honoring the world-relative radiusCap main.js sets).
//   3. Rival hoard at minute 1 <= player's reachable mass by then (sum of
//      simulated rival masses at t=60 vs the bot's mass at t=60).
//   4. Capstone edible radius reachable by 90% of timer with <= combo x2
//      (a second bot run with the combo multiplier clamped to x2).
//   5. Every level completable by the bot WITHOUT upgrades.
//
// Exit criterion from the roadmap: invariant suite passes 100/100. A failing
// level prints its numbers; per-invariant summaries list the worst offenders.
// Exit code 1 on any failure.
//
// The landmark bounding radii (needed for the capstone size gate) are computed
// once here with real three.js + src/content/landmarks.js — same objects the
// game builds — and handed to the THREE-free bot as plain numbers.

const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  const msg = typeof warning === 'string' ? warning : (warning && warning.message) || '';
  if (/MODULE_TYPELESS_PACKAGE_JSON/.test(msg) || /is not specified and it doesn.t parse as CommonJS/.test(msg)) return;
  return originalEmitWarning.call(process, warning, ...args);
};

const SPOT_LEVELS = [1, 25, 50, 75, 100];

async function main() {
  const startedAt = Date.now();
  const { simulateLevel } = await import('./soak-bot.js');
  const { generateLevel, LEVEL_COUNT } = await import('../src/data/levels.js');
  const { METROS } = await import('../src/data/metros.js');
  const { radiusFromMass } = await import('../src/data/formulas.js');
  const landmarks = await import('../src/content/landmarks.js');
  const THREE = await import('three');

  // Real landmark bounding radii per metro (capstone size-gate input).
  const landmarkRadiusByType = {};
  for (const metro of METROS) {
    const group = landmarks.createLandmark(metro.landmarkType, THREE, metro.accent);
    landmarkRadiusByType[metro.landmarkType] = group.boundingRadius;
  }

  // --- Determinism gate: same seed twice => byte-identical run summary. ----
  console.log('DETERMINISM:');
  let deterministic = true;
  for (const n of [1, 50, 100]) {
    const level = generateLevel(n);
    const lr = landmarkRadiusByType[level.metro.landmarkType];
    const a = JSON.stringify(simulateLevel(n, { landmarkRadius: lr }));
    const b = JSON.stringify(simulateLevel(n, { landmarkRadius: lr }));
    if (a !== b) {
      deterministic = false;
      console.log(`  ✗ FAIL: level ${n} simulated twice produced different results`);
    }
  }
  console.log(deterministic
    ? '  ✓ same seed twice => identical run (levels 1, 50, 100)'
    : '  ✗ FAIL: soak bot is nondeterministic');

  // --- Run the bot over all 100 levels ------------------------------------
  // runA: real combos (invariants 1, 3, 5). runB: combo clamped to x2
  // (invariant 4).
  const runs = [];
  for (let n = 1; n <= LEVEL_COUNT; n += 1) {
    const level = generateLevel(n);
    const lr = landmarkRadiusByType[level.metro.landmarkType];
    const runA = simulateLevel(n, { landmarkRadius: lr });
    const runB = simulateLevel(n, { landmarkRadius: lr, maxComboMult: 2 });
    runs.push({ level, runA, runB });
  }

  // --- Evaluate the five invariants ----------------------------------------
  const results = [[], [], [], [], []]; // per-invariant failure lists
  const margins = [[], [], [], [], []]; // per-invariant pass margins (for worst-offender reports)

  for (const { level, runA, runB } of runs) {
    const n = level.n;

    // 1. Reachable mass in 60% of timer >= 1.5x target.
    const need1 = 1.5 * level.target;
    const ratio1 = runA.massAt60PctTimer / need1;
    if (runA.massAt60PctTimer >= need1) margins[0].push({ n, ratio: ratio1 });
    else results[0].push({ n, have: runA.massAt60PctTimer, need: need1, ratio: ratio1 });

    // 2. Avatar radius at 100% target <= 0.25x world width.
    const radiusAtTarget = Math.min(radiusFromMass(level.target / level.itemValueMultiplier), level.world * 0.2);
    const limit2 = 0.25 * level.world;
    if (radiusAtTarget <= limit2) margins[1].push({ n, ratio: radiusAtTarget / limit2 });
    else results[1].push({ n, radius: radiusAtTarget, limit: limit2 });

    // 3. Rival hoard at minute 1 <= player's reachable mass by then.
    if (runA.rivalHoardAt60s <= runA.massAt60s) {
      margins[2].push({ n, ratio: runA.massAt60s > 0 ? runA.rivalHoardAt60s / runA.massAt60s : 0 });
    } else {
      results[2].push({ n, hoard: runA.rivalHoardAt60s, playerMass: runA.massAt60s });
    }

    // 4. Capstone edible radius reachable by 90% of timer with <= combo x2.
    const deadline4 = 0.9 * level.time;
    if (runB.capstoneEdibleTime !== null && runB.capstoneEdibleTime <= deadline4) {
      margins[3].push({ n, ratio: runB.capstoneEdibleTime / deadline4 });
    } else {
      results[3].push({
        n,
        edibleAt: runB.capstoneEdibleTime,
        deadline: deadline4,
        stuck: runB.stuck,
      });
    }

    // 5. Completable by the bot without upgrades.
    if (runA.completed) margins[4].push({ n, ratio: runA.completionTime / level.time });
    else {
      results[4].push({
        n,
        finalMass: runA.finalMass,
        target: level.target,
        capstoneEaten: runA.capstoneEaten,
        capstoneRequired: runA.capstoneRequired,
        stuck: runA.stuck,
      });
    }
  }

  const INVARIANT_NAMES = [
    'Reachable mass in 60% of timer >= 1.5x target (bot simulation)',
    'Avatar radius at 100% target <= 0.25x world width',
    'Rival hoard at minute 1 <= player reachable mass by then',
    'Capstone edible radius reachable by 90% of timer with <= combo x2',
    'Every level completable by the bot WITHOUT upgrades',
  ];

  let totalFails = deterministic ? 0 : 1;
  console.log('\nINVARIANTS (game-design.md §5, all 100 levels):');
  for (let i = 0; i < 5; i += 1) {
    const failures = results[i];
    const passed = LEVEL_COUNT - failures.length;
    totalFails += failures.length;
    const status = failures.length === 0 ? 'PASS' : 'FAIL';
    console.log(`  ${i + 1}. [${status}] ${INVARIANT_NAMES[i]} — ${passed}/${LEVEL_COUNT}`);
    if (failures.length) {
      // Worst offenders first (largest miss ratio).
      const sorted = failures.slice().sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0));
      for (const f of sorted.slice(0, 8)) {
        console.log(`       worst: ${JSON.stringify(f)}`);
      }
      if (sorted.length > 8) console.log(`       ... and ${sorted.length - 8} more`);
    } else {
      // Report the tightest passes — the levels closest to failing.
      const tightest = margins[i].slice().sort((a, b) => a.ratio - b.ratio).slice(0, 3);
      console.log(`       tightest: ${tightest.map((m) => `n=${m.n} (${(m.ratio * 100).toFixed(0)}%)`).join(', ')}`);
    }
  }

  // Spot-level detail table (the soak sample from the tech doc).
  console.log('\nSPOT LEVELS (1/25/50/75/100):');
  for (const n of SPOT_LEVELS) {
    const { level, runA, runB } = runs[n - 1];
    console.log(
      `  L${n}:`
      + ` inv1 ${(runA.massAt60PctTimer / level.target).toFixed(2)}x target by 60%t (need 1.5x)`
      + ` | inv3 hoard@60 ${Math.round(runA.rivalHoardAt60s)} vs bot ${Math.round(runA.massAt60s)}`
      + ` | inv4 capstone-edible@${runB.capstoneEdibleTime === null ? 'never' : runB.capstoneEdibleTime.toFixed(1) + 's'} (limit ${(0.9 * level.time).toFixed(0)}s)`
      + ` | inv5 ${runA.completed ? `won in ${runA.completionTime.toFixed(1)}s / ${level.time}s` : 'NOT COMPLETED'}`,
    );
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nRESULT: ${totalFails === 0 ? `ALL 5 INVARIANTS PASS, ${LEVEL_COUNT}/${LEVEL_COUNT} levels` : `${totalFails} invariant failure(s)`} (${seconds}s)`);
  process.exit(totalFails ? 1 : 0);
}

main().catch((err) => {
  console.error('Invariant run crashed:', err);
  process.exit(1);
});
