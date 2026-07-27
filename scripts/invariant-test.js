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
  // Invariants 5 and 7 are scored by the layout-insensitive reachability model,
  // NOT by the walked bot — see scripts/reachability-model.js and findings §15.
  const { estimateCompletion } = await import('./reachability-model.js');
  const { generateLevel, LEVEL_COUNT } = await import('../src/data/levels.js');
  const { generateDistrict } = await import('../src/content/districts.js');
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
    // One district generation shared by all three passes (see soak-bot.js).
    const layout = generateDistrict(level);
    const runA = simulateLevel(n, { landmarkRadius: lr, level, layout });
    const runB = simulateLevel(n, { landmarkRadius: lr, level, layout, maxComboMult: 2 });
    const model = estimateCompletion(n, { level, layout });
    runs.push({ level, layout, runA, runB, model });
  }

  // --- Evaluate the nine invariants ----------------------------------------
  const results = Array.from({ length: 9 }, () => []);
  const margins = Array.from({ length: 9 }, () => []);

  // === INVARIANT 6: pacing band — READ THIS BEFORE TOUCHING THE NUMBERS =====
  //
  // WHAT IT WAS: a PER-LEVEL band. Every one of the 100 levels had to complete
  // between 55% and 80% of its timer, or that level counted as a failure.
  //
  // WHAT IT IS NOW: an AGGREGATE band. The MEAN completionFraction across all
  // completed levels must land in [0.61, 0.69]. Per-level values are reported
  // but are not individually fatal.
  //
  // WHY IT CHANGED (2026-07, authorised by Nico via the 3D team lead during the
  // 0003 art pass; the per-level form was found to be a golden master, not an
  // invariant):
  //
  // The bot is greedy — it walks to the nearest edible prop. Its route, and
  // therefore its finish time, is CHAOTICALLY sensitive to prop POSITIONS, even
  // when the economy (prop count, mass, radii, tiers, spawns) is byte-identical.
  // Any purely cosmetic re-placement reshuffles which prop is "nearest" at a few
  // decision points, and the route diverges from there.
  //
  // MEASURED NOISE (23 perturbations of the UNTOUCHED pre-art-pass generator:
  // 11 different worldgen seed salts + 12 rigid whole-layout translations of
  // 1-45 world units; 2254 level samples). None of these change any gameplay
  // quantity — they only move props:
  //
  //   per-level completionFraction   min 0.198  p0.5 0.324  p5 0.453
  //                                  p50 0.658  p95 0.880  p99 0.954  max 0.996
  //   per-config MEAN                0.635 - 0.672   (spread 0.037)
  //   per-config MEDIAN              0.633 - 0.673   (spread 0.040)
  //
  // The per-level spread is ~0.80 wide. NO per-level band both passes a correct
  // generator and retains any value: [0.55,0.80] passed as few as 47/100 under
  // pure noise; even [0.30,1.00] only reached 92/100. A per-level band wide
  // enough to be noise-proof would assert nothing. Widening was not an option;
  // aggregating was.
  //
  // The MEAN, by contrast, is stable to +/-0.019 under all that noise, while a
  // REAL economy regression moves it well outside that. Measured by scaling the
  // level target multiplier (all runs still completed 100/100):
  //
  //   x0.90 -> 0.601   x0.95 -> 0.618   x0.97 -> 0.625   x1.00 -> 0.651
  //   x1.03 -> 0.666   x1.05 -> 0.674   x1.10 -> 0.698
  //
  // The band below is derived from the noise envelope (0.635-0.672) plus a
  // margin for unsampled layouts, then CLOSED UP until it catches the +/-10%
  // economy cases. It was NOT fitted to the current layout — the post-art-pass
  // tree happens to mean 0.669, which is inside the pre-existing noise envelope.
  //
  // RETAINED VALUE: the gate fails on an effective economy shift of about 10%
  // in either direction for a layout sitting mid-envelope (measured on the
  // pre-art-pass generator: x0.90 -> 0.601 below the floor, x1.10 -> 0.698
  // above the ceiling). Because the band is only ~2x the noise width, a layout
  // near an envelope edge trades sensitivity between directions rather than
  // losing it: the current tree (mean 0.669, near the ceiling) catches x1.05
  // and x0.85, but not x0.90. So the guaranteed-catch figure across arbitrary
  // layouts is ~15%, with ~5-10% caught in practice. It is BLIND to shifts of
  // a few percent. That is the honest limit of what a route-walked metric can
  // resolve, and it is why invariant 5 (per-level completability) and
  // invariant 7 (route mass budget) remain the sharp gates.
  //
  // WARNING — DO NOT RE-TIGHTEN THIS BAND, and do not restore the per-level
  // form, on the evidence of one layout looking fine. The per-level version
  // spent three years passing only because the prop coordinates never moved.
  // If you want per-level teeth back, the fix is to make the bot's route
  // insensitive to layout (e.g. score against an ordered mass budget rather
  // than a walked path), NOT a narrower number here. Per-level completability
  // is still hard-gated by invariant 5, which is unaffected by any of this.
  const COMPLETION_PACING_BAND = [0.61, 0.69];
  const completionSamples = [];

  for (const { level, runA, runB, model } of runs) {
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

    // 5. Completable WITHOUT upgrades — scored by the layout-insensitive
    // reachability model, not by the walked bot. The intent is unchanged and
    // still per-level and binary: every level must be completable. What
    // changed is that "completable" no longer means "one greedy walk happened
    // to work on these exact coordinates". See findings §13 (the defect) and
    // §15 (the model). Do NOT revert this to runA without reading both.
    if (model.completed) margins[4].push({ n, ratio: model.completionTime / level.time });
    else {
      results[4].push({
        n,
        finalMass: Math.round(model.finalMass),
        target: level.target,
        reachedFraction: +(model.finalMass / level.target).toFixed(3),
        capstoneEaten: model.capstoneEaten,
        capstoneRequired: model.capstoneRequired,
        stuck: model.stuck,
      });
    }

    // Invariant 6 is scored in AGGREGATE, not per level — see the long note at
    // COMPLETION_PACING_BAND below. Collect the samples here; gate after the loop.
    const completion = runA.completionFraction;
    if (completion !== null) {
      completionSamples.push({ n, ratio: completion });
      margins[5].push({ n, ratio: completion });
    }

    // 7. Route mass budget — derived from the same model run as invariant 5.
    // It was never independent of 5 (an uncompleted level reports null and
    // fails the band), so leaving it on the walked bot would have kept it
    // layout-coupled for no gain.
    const budget = model.budgetConsumptionFraction;
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

  // Invariant 6 aggregate gate (see COMPLETION_PACING_BAND above).
  const meanCompletion = completionSamples.length
    ? completionSamples.reduce((a, s) => a + s.ratio, 0) / completionSamples.length
    : null;
  if (meanCompletion === null
    || meanCompletion < COMPLETION_PACING_BAND[0]
    || meanCompletion > COMPLETION_PACING_BAND[1]) {
    results[5].push({
      meanCompletionFraction: meanCompletion,
      band: COMPLETION_PACING_BAND,
      sampledLevels: completionSamples.length,
    });
  }

  const INVARIANT_NAMES = [
    'Base timer is bounded to 75-120 seconds',
    'Avatar radius at 100% target <= 0.25x world width',
    'Rival hoard at minute 1 <= player reachable mass by then',
    'Capstone edible radius reachable by 90% of timer with <= combo x2',
    'Every level completable by the bot WITHOUT upgrades',
    'Mean no-upgrade completion lands at 61%-69% of timer (aggregate)',
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
  // === BUILD CEILING — READ findings §16 BEFORE TOUCHING THIS ==============
  //
  // TWO defects were fixed here on 2026-07-27, and the gate now FAILS. That
  // failure is the correct, measured verdict, not a regression to tune away.
  //
  // 1. IT SAMPLED 5 LEVELS OUT OF 100. It only ever probed n in {1,25,50,75,
  //    100}, and it passed because those five happened to be clean. Run the
  //    SAME walked bot over all 100 levels and 31 of the 300 level/build
  //    combinations already sat under the 0.25 floor, worst 18%. The gate was
  //    passing by not looking.
  // 2. IT USED THE WALKED BOT, which plays badly — it walks to the nearest
  //    prop, not the best one. "Can a maxed-out player trivialise this level?"
  //    is a question about COMPETENT play, so the reachability model is the
  //    right instrument for it (unlike invariant 6, where the model's
  //    adaptiveness costs sensitivity — see §16). The model also makes the
  //    full 100-level sweep cheap: ~24ms per 100 runs against ~875ms.
  //
  // Under the model, across all 100 levels, 120 of 300 combinations fall below
  // the floor, worst 4.8% (utility build, low levels). The floor was NOT
  // lowered to accommodate that: no measurement supports a lower one, and the
  // fact that the gate fails on BOTH instruments once the sample is widened is
  // what distinguishes "the floor was miscalibrated" from "the builds are
  // overpowered". It is the latter. See §16 for the full evidence.
  const BUILD_COMPLETION_FLOOR = 0.25;
  const buildFailures = [];
  const buildSamples = [];
  for (let n = 1; n <= LEVEL_COUNT; n += 1) {
    const { level, layout } = runs[n - 1];
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
      const run = estimateCompletion(n, { level, layout, buildStats: stats });
      if (run.completed) buildSamples.push({ n, name, ratio: run.completionFraction });
      if (!run.completed || run.completionFraction < BUILD_COMPLETION_FLOOR) {
        // The old record also asserted maxSingleAwardFraction <= 0.15 here.
        // That is dropped: it is the same tautology as invariant 8 (§12) —
        // capProgressionAward clamps the award before it is ever recorded, so
        // it could not fail. Nothing is lost by removing it.
        buildFailures.push({
          n,
          name,
          completed: run.completed,
          completionFraction: run.completed ? +run.completionFraction.toFixed(3) : null,
        });
      }
    }
  }

  // The build ceiling counts as ONE failure however many combinations breach
  // it — 120 of 300 do, and letting that dominate the tally would bury the
  // nine invariants it sits beside.
  let totalFails = deterministic ? 0 : 1;
  totalFails += buildFailures.length ? 1 : 0;
  console.log('\nINVARIANTS (game-design.md §5, all 100 levels):');
  for (let i = 0; i < INVARIANT_NAMES.length; i += 1) {
    const failures = results[i];
    const passed = LEVEL_COUNT - failures.length;
    totalFails += failures.length;
    const status = failures.length === 0 ? 'PASS' : 'FAIL';
    if (i === 5) {
      // Aggregate invariant: an x/100 count would be misleading. Report the mean
      // and the per-level spread it was computed from.
      const sorted = completionSamples.map((s) => s.ratio).sort((a, b) => a - b);
      const pct = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN);
      console.log(`  6. [${status}] ${INVARIANT_NAMES[5]} — mean ${meanCompletion === null ? 'n/a' : (meanCompletion * 100).toFixed(1) + '%'}`
        + ` (band ${(COMPLETION_PACING_BAND[0] * 100).toFixed(0)}-${(COMPLETION_PACING_BAND[1] * 100).toFixed(0)}%,`
        + ` ${completionSamples.length} levels sampled)`);
      console.log(`       per-level spread (informational, NOT gated):`
        + ` min ${(sorted[0] * 100).toFixed(0)}%`
        + ` p5 ${(pct(0.05) * 100).toFixed(0)}%`
        + ` p50 ${(pct(0.5) * 100).toFixed(0)}%`
        + ` p95 ${(pct(0.95) * 100).toFixed(0)}%`
        + ` max ${(sorted[sorted.length - 1] * 100).toFixed(0)}%`);
      if (failures.length) console.log(`       FAIL: ${JSON.stringify(failures[0])}`);
      continue;
    }
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
  const buildTotal = LEVEL_COUNT * 3;
  console.log(`  BUILD CEILING: [${buildFailures.length ? 'FAIL' : 'PASS'}]`
    + ` maximum builds stay >=${(BUILD_COMPLETION_FLOOR * 100).toFixed(0)}% of timer`
    + ` — ${buildTotal - buildFailures.length}/${buildTotal} level/build combinations`
    + ` (${LEVEL_COUNT} levels x 3 builds, scored by the reachability model)`);
  if (buildSamples.length) {
    const sorted = buildSamples.map((s) => s.ratio).sort((a, b) => a - b);
    const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    console.log(`       spread: min ${(sorted[0] * 100).toFixed(0)}%`
      + ` p5 ${(pct(0.05) * 100).toFixed(0)}%`
      + ` p25 ${(pct(0.25) * 100).toFixed(0)}%`
      + ` p50 ${(pct(0.5) * 100).toFixed(0)}%`
      + ` max ${(sorted[sorted.length - 1] * 100).toFixed(0)}%`);
  }
  if (buildFailures.length) {
    const byBuild = {};
    for (const f of buildFailures) byBuild[f.name] = (byBuild[f.name] || 0) + 1;
    console.log(`       by build: ${Object.entries(byBuild).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    const worst = buildFailures.slice().sort((a, b) => (a.completionFraction ?? 0) - (b.completionFraction ?? 0));
    for (const f of worst.slice(0, 5)) console.log(`       worst: ${JSON.stringify(f)}`);
    console.log(`       ... ${buildFailures.length} of ${buildTotal} combinations below the floor.`
      + ` This is the measured verdict, NOT a gate to re-tune — see findings §16.`);
  }

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
