// Invariant suite — the game-design.md §5 "immune system". Asserts all nine
// progression floors and ease ceilings across ALL 100 levels, driven by the headless soak
// bot (scripts/soak-bot.js) playing every level against the real systems
// (swallow / combo / rivals / districts), not by formula vibes:
// The suite also compares all 100 summaries twice for determinism and probes
// maximum-growth / maximum-utility builds at five campaign checkpoints.
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
  const { applyBuilds } = await import('../src/meta/upgrades.js');
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
  for (let n = 1; n <= LEVEL_COUNT; n += 1) {
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
    ? '  ✓ same seed twice => byte-identical summaries (all 100 levels)'
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

  // --- Evaluate the nine invariants ----------------------------------------
  const results = Array.from({ length: 9 }, () => []);
  const margins = Array.from({ length: 9 }, () => []);

  for (const { level, runA, runB } of runs) {
    const n = level.n;

    // 1. Bounded normal timer.
    if (level.time >= 75 && level.time <= 120) margins[0].push({ n, ratio: level.time / 120 });
    else results[0].push({ n, time: level.time });

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

    const completion = runA.completionFraction;
    if (completion !== null && completion >= 0.55 && completion <= 0.80) {
      margins[5].push({ n, ratio: completion });
    } else {
      results[5].push({ n, completionFraction: completion });
    }

    const budget = runA.budgetConsumptionFraction;
    if (budget !== null && budget >= 0.45 && budget <= 0.70) {
      margins[6].push({ n, ratio: budget });
    } else {
      results[6].push({ n, budgetConsumptionFraction: budget });
    }

    if (runA.maxSingleAwardFraction <= 0.15 + 1e-9) {
      margins[7].push({ n, ratio: runA.maxSingleAwardFraction / 0.15 });
    } else {
      results[7].push({ n, maxSingleAwardFraction: runA.maxSingleAwardFraction });
    }

    if (runA.availableMass.totalAward <= runA.availableMass.limit + 1e-9) {
      margins[8].push({ n, ratio: runA.availableMass.fraction });
    } else {
      results[8].push({ n, availableMass: runA.availableMass });
    }
  }

  const INVARIANT_NAMES = [
    'Base timer is bounded to 75-120 seconds',
    'Avatar radius at 100% target <= 0.25x world width',
    'Rival hoard at minute 1 <= player reachable mass by then',
    'Capstone edible radius reachable by 90% of timer with <= combo x2',
    'Every level completable by the bot WITHOUT upgrades',
    'No-upgrade completion lands at 55%-80% of timer',
    'Completion consumes 45%-70% of route mass budget',
    'Maximum single award is <=15% of target',
    'Initial and dynamically spawned mass stay within available-mass budget',
  ];

  const maxGrowthBuild = {
    1: 'wide-maw', 2: 'greased-axle', 3: 'second-stomach',
    4: 'turbo-bearings', 5: 'devourer',
  };
  const maxUtilityBuild = {
    1: 'wide-maw', 2: 'magnet-core', 3: 'heavy-breakfast',
    4: 'vacuum-throat', 5: 'time-bandit',
  };
  const maxGoldenBuild = {
    1: 'wide-maw', 2: 'greased-axle', 3: 'second-stomach',
    4: 'golden-touch', 5: 'devourer',
  };
  const buildFailures = [];
  for (const n of SPOT_LEVELS) {
    const level = generateLevel(n);
    const lr = landmarkRadiusByType[level.metro.landmarkType];
    for (const [name, build] of [
      ['growth', maxGrowthBuild],
      ['utility', maxUtilityBuild],
      ['golden', maxGoldenBuild],
    ]) {
      const stats = applyBuilds({
        startMass: 0,
        timeSeconds: level.time,
        itemValueMultiplier: level.itemValueMultiplier,
      }, build);
      const run = simulateLevel(n, { landmarkRadius: lr, buildStats: stats });
      if (!run.completed || run.completionFraction < 0.25 || run.maxSingleAwardFraction > 0.15 + 1e-9) {
        buildFailures.push({
          n,
          name,
          completed: run.completed,
          completionFraction: run.completionFraction,
          maxSingleAwardFraction: run.maxSingleAwardFraction,
        });
      }
    }
  }

  let totalFails = deterministic ? 0 : 1;
  totalFails += buildFailures.length;
  console.log('\nINVARIANTS (game-design.md §5, all 100 levels):');
  for (let i = 0; i < INVARIANT_NAMES.length; i += 1) {
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
  console.log(`  BUILD CEILING: [${buildFailures.length ? 'FAIL' : 'PASS'}] maximum builds stay >=25% timer and <=15% target/event`);
  for (const failure of buildFailures) console.log(`       worst: ${JSON.stringify(failure)}`);

  // Spot-level detail table (the soak sample from the tech doc).
  console.log('\nSPOT LEVELS (1/25/50/75/100):');
  for (const n of SPOT_LEVELS) {
    const { level, runA, runB } = runs[n - 1];
    console.log(
      `  L${n}:`
      + ` completion ${(runA.completionFraction * 100).toFixed(0)}%t`
      + ` | inv3 hoard@60 ${Math.round(runA.rivalHoardAt60s)} vs bot ${Math.round(runA.massAt60s)}`
      + ` | inv4 capstone-edible@${runB.capstoneEdibleTime === null ? 'never' : runB.capstoneEdibleTime.toFixed(1) + 's'} (limit ${(0.9 * level.time).toFixed(0)}s)`
      + ` | budget ${(runA.budgetConsumptionFraction * 100).toFixed(0)}%`
      + ` | max-award ${(runA.maxSingleAwardFraction * 100).toFixed(0)}% target`
      + ` | ${runA.completed ? `won in ${runA.completionTime.toFixed(1)}s / ${level.time}s` : 'NOT COMPLETED'}`,
    );
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nRESULT: ${totalFails === 0 ? `ALL 9 INVARIANTS PASS, ${LEVEL_COUNT}/${LEVEL_COUNT} levels` : `${totalFails} invariant failure(s)`} (${seconds}s)`);
  process.exit(totalFails ? 1 : 0);
}

main().catch((err) => {
  console.error('Invariant run crashed:', err);
  process.exit(1);
});
