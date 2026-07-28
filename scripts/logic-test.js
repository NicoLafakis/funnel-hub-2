'use strict';
// Flywheel logic test suite — module-import-based (the ES-module engine
// rewrite has no single <script> tag left to regex-extract, unlike the
// original single-file version of this test). Runnable via the existing
// `npm test` command (`node scripts/logic-test.js`) — this file stays plain
// CommonJS (package.json keeps no "type": "module"), and pulls in every real
// ES module under src/ via dynamic `import()` calls from an async IIFE.
// Node resolves the bare 'three' specifier via node_modules (declared as a
// real dependency in package.json) exactly the same package the browser
// loads via assets/vendor/three.module.js through the import map — so scene-
// graph construction can be exercised headlessly with zero mocking.
//
// Output style matches the original single-file test: a `check()` helper
// printing a checkmark or FAIL per assertion, a final pass/fail summary line,
// and a nonzero exit code if anything failed.

// Silence Node's benign "module type not specified, reparsing as ESM"
// warning — expected and harmless (this repo intentionally keeps no
// "type":"module" in package.json per the task brief), but it would
// otherwise print once per dynamically-imported src/ file below and drown
// out the real check output.
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  const msg = typeof warning === 'string' ? warning : (warning && warning.message) || '';
  if (/MODULE_TYPELESS_PACKAGE_JSON/.test(msg) || /is not specified and it doesn.t parse as CommonJS/.test(msg)) return;
  return originalEmitWarning.call(process, warning, ...args);
};

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log('  ✓', name);
  } else {
    fail += 1;
    console.log('  ✗ FAIL:', name);
  }
}

function approxEqual(a, b, eps) {
  return Math.abs(a - b) <= (eps == null ? 1e-6 : eps);
}

async function main() {
  const formulas = await import('../src/data/formulas.js');
  const metrosMod = await import('../src/data/metros.js');
  const levelsMod = await import('../src/data/levels.js');
  const propkit = await import('../src/content/propkit.js');
  const landmarks = await import('../src/content/landmarks.js');
  const seedsMod = await import('../src/data/seeds.js');
  const districtsMod = await import('../src/content/districts.js');
  const archetypesMod = await import('../src/content/archetypes.js');
  const instancingMod = await import('../src/engine/instancing.js');
  const groundtexMod = await import('../src/content/groundtex.js');
  const audioMod = await import('../src/systems/audio.js');
  const comboMod = await import('../src/systems/combo.js');
  const achMod = await import('../src/systems/achievements.js');
  const swallowMod = await import('../src/systems/swallow.js');
  const saveMod = await import('../src/meta/save.js');
  const upgradesMod = await import('../src/meta/upgrades.js');
  const progressionMod = await import('../src/meta/progression.js');
  const avatarMod = await import('../src/engine/avatar.js');
  const cameraMod = await import('../src/engine/camera.js');
  const inputMod = await import('../src/engine/input.js');
  const qualityMod = await import('../src/engine/quality.js');
  const effectsMod = await import('../src/engine/effects.js');
  const physicalBoundsMod = await import('../src/content/physical-bounds.js');
  const startupMod = await import('../src/meta/startup.js');
  const cityContextMod = await import('../src/content/city-context.js');
  const cityObjectsMod = await import('../src/content/city-object-catalog.js');
  const THREE = await import('three');

  const {
    target, chapterOf, levelInChapterOf, timeSeconds, worldSize, rivalCount, capstoneGate, itemValueMultiplier,
    coinsForLevel, rivalEatBonus, reachableMassFraction, LEVEL_ONE_MIN_PAYOUT,
    GOLDEN_MASS_MULTIPLIER, GOLDEN_COIN_BONUS, radiusFromMass,
  } = formulas;
  const { METROS } = metrosMod;
  const { generateAllLevels, generateLevel } = levelsMod;

  console.log('INPUT:');
  {
    const machine = inputMod.createInputMachine();
    machine.pointerDown({ id: 1, x: 350, y: 580, pointerType: 'touch', viewportW: 360, viewportH: 640 });
    machine.pointerMove({ id: 1, x: 310, y: 520, viewportW: 360, viewportH: 640 });
    machine.update(0.1, {});
    check('first touch owns movement even in the lower-right quadrant',
      machine.state === 'key-steer' && Math.hypot(machine.move.x, machine.move.z) > 0);
    check('input diagnostics expose stable movement ownership',
      machine.pointerRoles.length === 1 && machine.pointerRoles[0].role === 'stick');

    machine.pointerDown({ id: 2, x: 40, y: 500, pointerType: 'touch', viewportW: 360, viewportH: 640 });
    machine.pointerMove({ id: 2, x: 80, y: 500, viewportW: 360, viewportH: 640 });
    check('second touch owns camera while movement remains held',
      machine.state === 'orbit'
        && machine.pointerRoles.find((p) => p.id === 1).role === 'stick'
        && machine.pointerRoles.find((p) => p.id === 2).role === 'orbit'
        && machine.consumeOrbit().yaw > 0);

    machine.pointerUp(1);
    check('remaining camera touch is not silently promoted to movement',
      machine.pointerRoles.length === 1 && machine.pointerRoles[0].role === 'orbit');
    machine.pointerDown({ id: 3, x: 300, y: 500, pointerType: 'touch', viewportW: 360, viewportH: 640 });
    check('next new touch may claim movement while camera ownership stays stable',
      machine.pointerRoles.find((p) => p.id === 2).role === 'orbit'
        && machine.pointerRoles.find((p) => p.id === 3).role === 'stick');

    machine.blur();
    machine.update(0.3, {});
    check('lifecycle cancellation clears roles and reaches neutral within 300ms',
      machine.state === 'idle' && machine.pointerRoles.length === 0
        && machine.move.x === 0 && machine.move.z === 0);
  }

  console.log('ADAPTIVE QUALITY:');
  check('automatic initial quality is conservative on mobile and high on desktop',
    qualityMod.selectInitialQuality({ mobile: true }) === 'medium'
      && qualityMod.selectInitialQuality({ mobile: true, deviceMemory: 4 }) === 'low'
      && qualityMod.selectInitialQuality({ mobile: false }) === 'high');
  check('manual quality mode overrides automatic device selection',
    qualityMod.selectInitialQuality({ mode: 'high', mobile: true, deviceMemory: 2 }) === 'high');
  {
    const controller = qualityMod.createQualityController({ initial: 'high', sustainMs: 100, cooldownMs: 0 });
    check('short frame-time spikes do not flap quality', controller.sample(40) === null && controller.tier === 'high');
    controller.sample(40);
    const changed = controller.sample(40);
    check('sustained poor frame time downgrades exactly one tier', changed === 'medium' && controller.tier === 'medium');
    for (let i = 0; i < 10; i += 1) controller.sample(40);
    check('automatic downgrade is limited to once per level', controller.tier === 'medium');
    controller.beginLevel();
    controller.sample(40); controller.sample(40);
    check('quality can downgrade again only after a new level and sustained pressure', controller.sample(40) === 'low');
  }

  console.log('PHYSICAL BOUNDS:');
  {
    const entries = Object.values(physicalBoundsMod.PHYSICAL_BOUNDS);
    check('every registered visual ID resolves authoritative physical metadata',
      entries.length === Object.keys(archetypesMod.VISUAL_ARCHETYPES).length
        && entries.every((b) => b.width > 0 && b.depth > 0 && b.height > 0
          && Number.isFinite(b.baseAnchor.x) && Number.isFinite(b.baseAnchor.y) && Number.isFinite(b.baseAnchor.z)
          && b.forwardAxis === '+z'
          && b.allowedZones.length > 0 && b.worldUnitsPerMetre === propkit.WORLD_UNITS_PER_METRE));
    check('committed bounds exactly match every merged runtime geometry',
      Object.values(archetypesMod.VISUAL_ARCHETYPES).every((descriptor) => {
        const measured = propkit.visualGeometryFingerprint(descriptor.id, descriptor.gameplayKind, THREE).bounds;
        const declared = physicalBoundsMod.PHYSICAL_BOUNDS[descriptor.id];
        return measured.length === 6
          && approxEqual(declared.width, measured[3] - measured[0])
          && approxEqual(declared.height, measured[4] - measured[1])
          && approxEqual(declared.depth, measured[5] - measured[2])
          && approxEqual(declared.baseAnchor.x, (measured[0] + measured[3]) / 2)
          && approxEqual(declared.baseAnchor.y, measured[1])
          && approxEqual(declared.baseAnchor.z, (measured[2] + measured[5]) / 2);
      }));
    const fp = physicalBoundsMod.renderedGroundFootprint('street_person_red', 'person', 3, Math.PI / 2);
    check('rendered ground footprint applies final scale and yaw without THREE',
      fp.width === physicalBoundsMod.PHYSICAL_BOUNDS.street_person_red.width * 3
        && fp.depth === physicalBoundsMod.PHYSICAL_BOUNDS.street_person_red.depth * 3
        && fp.yaw === Math.PI / 2);
  }

  console.log('STARTUP:');
  check('fresh saves route directly to level 1 while returning saves retain the map',
    startupMod.startRoute(saveMod.defaultSave()) === 'level-1'
      && startupMod.startRoute({ unlockedLevel: 2, stars: { 1: 1 } }) === 'world-map');
  {
    const latch = startupMod.createStartLatch();
    check('repeated Start actions accept at most one transition',
      latch.accept() === true && latch.accept() === false && latch.accepted === true);
  }
  {
    let textures = 'pending';
    let models = 'pending';
    let releaseTexture;
    const delayed = new Promise((resolve) => { releaseTexture = resolve; });
    const optional = startupMod.beginOptionalAssets({
      textures: () => delayed,
      models: () => Promise.reject(new Error('optional model unavailable')),
      onTextures: (value) => { textures = value; },
      onModels: (value) => { models = value; },
    });
    await Promise.resolve();
    check('delayed optional assets do not synchronously block startup', textures === 'pending');
    releaseTexture('loaded');
    await Promise.all([optional.textureTask, optional.modelTask]);
    check('delayed and rejected optional assets resolve to loaded/procedural outcomes',
      textures === 'loaded' && models === null);
  }

  // ---------------------------------------------------------------------
  console.log('FORMULAS:');
  // 1. target(n) = 1000 * n^2 for a full loop n=1..100.
  {
    let allMatch = true;
    for (let n = 1; n <= 100; n += 1) {
      if (target(n) !== 1000 * n * n) { allMatch = false; break; }
    }
    check('target(n) === 1000*n*n for n=1..100', allMatch);
  }

  // 2. timeSeconds stays bounded; worldSize remains non-decreasing.
  {
    let timeBounded = true;
    let worldNonDecreasing = true;
    let prevTime = -Infinity;
    let prevWorld = -Infinity;
    for (let n = 1; n <= 100; n += 1) {
      const t = timeSeconds(n);
      const w = worldSize(n);
      if (!(t >= 75 && t <= 120)) timeBounded = false;
      if (!(w >= prevWorld)) worldNonDecreasing = false;
      prevTime = t;
      prevWorld = w;
    }
    check('timeSeconds(n) stays within 75-120 seconds across n=1..100', timeBounded);
    check('worldSize(n) non-decreasing across n=1..100', worldNonDecreasing);
  }

  {
    const levels = generateAllLevels();
    const expected = ['teach', 'reinforce', 'pressure', 'combine', 'test'];
    check('all 100 levels author a valid five-level progression phase',
      levels.every((level) => expected.includes(level.progression.phase)));
    check('every metro contains two teach/reinforce/pressure/combine/test arcs',
      levels.every((level) => level.progression.phase === expected[(level.levelInChapter - 1) % 5]));
    check('all levels declare exactly two mastery objectives',
      levels.every((level) => level.progression.objectives.length === 2));
  }

  // 3. chapterOf/levelInChapterOf boundary correctness.
  check('chapterOf(1) === 1', chapterOf(1) === 1);
  check('levelInChapterOf(1) === 1', levelInChapterOf(1) === 1);
  check('chapterOf(10) === 1', chapterOf(10) === 1);
  check('levelInChapterOf(10) === 10', levelInChapterOf(10) === 10);
  check('chapterOf(11) === 2', chapterOf(11) === 2);
  check('levelInChapterOf(11) === 1', levelInChapterOf(11) === 1);
  check('chapterOf(100) === 10', chapterOf(100) === 10);
  check('levelInChapterOf(100) === 10', levelInChapterOf(100) === 10);

  // 7 (rivalCount/capstoneGate — grouped here since they're formulas too).
  {
    // V2 unlock cadence (content-and-meta.md §1): rivals L6, rival pairs L41,
    // triple rivals L76 — replaces V1's tier-band counts.
    let cadenceHolds = true;
    for (let n = 1; n <= 100; n += 1) {
      const expected = n <= 5 ? 0 : n <= 40 ? 1 : n <= 75 ? 2 : 3;
      if (rivalCount(n) !== expected) cadenceHolds = false;
    }
    check('rivalCount follows the V2 cadence (0 n<=5, 1 n<=40, 2 n<=75, 3 n>=76)', cadenceHolds);

    let gateNonDecreasing = true;
    let prevGate = -Infinity;
    for (let n = 1; n <= 100; n += 1) {
      const g = capstoneGate(n);
      if (!(g >= prevGate)) gateNonDecreasing = false;
      prevGate = g;
    }
    check('capstoneGate(n) non-decreasing across n=1..100', gateNonDecreasing);
    check('capstoneGate(100) === 0.95', capstoneGate(100) === 0.95);
  }

  // ---------------------------------------------------------------------
  console.log('METROS:');
  check('METROS.length === 10', METROS.length === 10);
  {
    const types = METROS.map((m) => m.landmarkType);
    const uniqueTypes = new Set(types);
    check('all landmarkType values unique', uniqueTypes.size === types.length);

    const expected = new Set([
      'liberty-statue', 'lattice-tower', 'clock-tower', 'sky-tower', 'mega-spire',
      'amphitheater', 'mountain-statue', 'onion-palace', 'sail-opera', 'portal-tower',
    ]);
    const actual = new Set(types);
    const setsMatch = expected.size === actual.size && [...expected].every((t) => actual.has(t));
    check('landmarkType values match the 10 specified keys', setsMatch);
  }

  // ---------------------------------------------------------------------
  console.log('LEVELS:');
  const allLevels = generateAllLevels();
  check('generateAllLevels().length === 100', allLevels.length === 100);
  {
    const allValid = allLevels.every((lvl) => (
      METROS.includes(lvl.metro)
      && lvl.target > 0
      && lvl.time > 0
      && lvl.world > 0
    ));
    check('every level has a valid metro reference and positive target/time/world', allValid);
  }

  // 6. Pacing invariant, computed from real generated level data (not
  // hardcoded), for the specified sample of n values.
  {
    const sampleNs = [1, 6, 7, 10, 25, 50, 100];
    let allInRange = true;
    const ratios = [];
    for (const n of sampleNs) {
      const lvl = generateLevel(n);
      const massSum = lvl.template.reduce((sum, tier) => sum + tier.baseMass * tier.baseCount, 0);
      const totalAvailable = massSum * lvl.itemValueMultiplier;
      const ratio = totalAvailable / lvl.target;
      ratios.push(`n=${n}:${ratio.toFixed(3)}`);
      if (!(ratio >= 3.8 && ratio <= 4.8)) allInRange = false;
    }
    check(`pacing invariant holds (3.8x-4.8x headroom — chase-cam visibility needs more content than top-down) for n in {${sampleNs.join(',')}} [${ratios.join(' ')}]`, allInRange);
  }

  // ---------------------------------------------------------------------
  console.log('SEEDS (V2 deterministic generation, tech-architecture.md §3):');
  {
    const { mulberry32, hashStr, levelSeed, dailySeed } = seedsMod;
    const r1 = mulberry32(12345);
    const r2 = mulberry32(12345);
    let deterministic = true;
    let inRange = true;
    for (let i = 0; i < 1000; i += 1) {
      const a = r1();
      const b = r2();
      if (a !== b) deterministic = false;
      if (!(a >= 0 && a < 1)) inRange = false;
    }
    check('mulberry32 same seed => identical stream (1000 draws)', deterministic);
    check('mulberry32 outputs stay in [0, 1)', inRange);
    check('hashStr is deterministic and uint32', hashStr('flywheel') === hashStr('flywheel') && hashStr('flywheel') >>> 0 === hashStr('flywheel'));
    check('levelSeed(m,d,salt) is uint32, stable, and salt-sensitive',
      levelSeed(3, 7) === levelSeed(3, 7)
        && levelSeed(3, 7) !== levelSeed(3, 7, 1)
        && levelSeed(3, 7) !== levelSeed(7, 3)
        && (levelSeed(3, 7) >>> 0) === levelSeed(3, 7));
    check('dailySeed(YYYY-MM-DD) is stable per date, differs per day',
      dailySeed('2026-07-23') === dailySeed('2026-07-23') && dailySeed('2026-07-23') !== dailySeed('2026-07-24'));
  }

  // ---------------------------------------------------------------------
  console.log('V2 ECONOMY (content-and-meta.md §4, lessons B3/B6, game-design.md §5):');
  {
    // Coin payout is FLAT in n: coins = 50 + 25*stars + challengeBonus.
    check('coinsForLevel(1..3 stars) === 75/100/125 (flat payout, no mass scaling)',
      coinsForLevel(1) === 75 && coinsForLevel(2) === 100 && coinsForLevel(3) === 125);
    check('coinsForLevel(3, challengeBonus) stacks challenges on top', coinsForLevel(3, 40) === 165);
    // First upgrade affordable after level 1 (content-and-meta.md §4):
    // meta/upgrades.js must price cost(track, 0) <= this.
    check('LEVEL_ONE_MIN_PAYOUT === 75 (1-star level-1 clear)', LEVEL_ONE_MIN_PAYOUT === 75);

    // Rival bonus re-derived (lesson B3): exactly 10% of target at EVERY
    // level — meaningful, never a win button (V1 hit 5.15x target at n=100).
    let bonusInBand = true;
    for (let n = 1; n <= 100; n += 1) {
      const ratio = rivalEatBonus(n) / target(n);
      if (!(ratio >= 0.05 && ratio <= 0.105)) bonusInBand = false;
    }
    check('rivalEatBonus(n) stays within 5%-10.5% of target(n) for n=1..100', bonusInBand);
    check('rivalEatBonus(n) === 100*n*n (10% of target by construction)', rivalEatBonus(50) === 100 * 50 * 50);

    // Goldens: 8x mass kept, +10 coins each (content-and-meta.md §4).
    check('golden constants: 8x mass multiplier kept, +10 coins added',
      GOLDEN_MASS_MULTIPLIER === 8 && GOLDEN_COIN_BONUS === 10);

    // Radius growth normalized (B6): radius from BASE mass is level-invariant.
    check('radiusFromMass is base-mass based and matches the ported avatar shape (26 + sqrt(m)*1.9)',
      approxEqual(radiusFromMass(1000), 26 + Math.sqrt(1000) * 1.9));
  }

  // ---------------------------------------------------------------------
  console.log('TIER SIZE STEP (art-direction.md §3):');
  {
    check('propkit TIER_SIZE_STEP === 1.35 (sacred constant)', propkit.TIER_SIZE_STEP === 1.35);
    let stepHolds = true;
    const tpl = generateLevel(1).template;
    for (let k = 1; k < tpl.length; k += 1) {
      const ratio = tpl[k].baseRadius / tpl[k - 1].baseRadius;
      if (!(ratio >= 1.34 && ratio <= 1.36)) stepHolds = false;
    }
    check('LEVEL_TEMPLATE baseRadius follows the 1.35x step across all 7 tiers', stepHolds);
  }

  // ---------------------------------------------------------------------
  console.log('DISTRICTS (V2 layout generator, art-direction.md §1, flaws D1/D2):');
  {
    const { generateDistrict } = districtsMod;

    // Determinism: same seed => byte-identical descriptor.
    const a = JSON.stringify(generateDistrict(generateLevel(37)));
    const b = JSON.stringify(generateDistrict(generateLevel(37)));
    const c = JSON.stringify(generateDistrict(generateLevel(38)));
    check('generateDistrict is deterministic for the same level seed', a === b);
    check('generateDistrict differs across levels (different seeds)', a !== c);

    // All 100 levels generate without throwing and honor the D2 content
    // budget exactly (per-kind prop counts === propBudget counts).
    let allHonorBudget = true;
    for (let n = 1; n <= 100; n += 1) {
      const lvl = generateLevel(n);
      const d = generateDistrict(lvl);
      for (const tier of lvl.propBudget) {
        if ((d.stats.perTier[tier.kind] || 0) !== tier.baseCount) allHonorBudget = false;
      }
      if (!d.landmarkPlaza || d.landmarkPlaza.zone !== 'plaza') allHonorBudget = false;
    }
    check('all 100 districts generate and honor the per-tier prop budget exactly', allHonorBudget);

    // game-design.md §5 invariant 1, base-mass terms: reachable mass in 60%
    // of the timer >= 1.5x target at the soak-bot sample levels.
    const sampleNs = [1, 25, 50, 75, 100];
    let invariant1 = true;
    const reach = [];
    for (const n of sampleNs) {
      const d = generateDistrict(generateLevel(n));
      const available = d.stats.totalBaseMass * formulas.ORDINARY_MASS_FRACTION;
      reach.push(`n=${n}:${(available / 1000).toFixed(2)}x`);
      if (available < 1.5 * 1000) invariant1 = false;
    }
    check(`difficulty floor: total awarded base mass >= 1.5x target at n in {${sampleNs.join(',')}} [${reach.join(' ')}]`, invariant1);

    // game-design.md §2 acceptance: >=5 edible props at spawn on level 1
    // (avatar r=26, size gate 0.78 => edible radius <= 20.28).
    const d1 = generateDistrict(generateLevel(1));
    const edibleAtSpawn = d1.props.filter((p) => Math.hypot(p.x, p.z) <= 130 && p.radius <= 26 * 0.78).length;
    check('level 1 spawn area shows >=5 edible props', edibleAtSpawn >= 5);

    // Goldens are seeded into the descriptor (1 base, 2 from L46).
    check('golden props are placed per the cadence (L1: 1, L46: 2)',
      d1.props.filter((p) => p.golden).length === 1
        && generateDistrict(generateLevel(46)).props.filter((p) => p.golden).length === 2);

    // Street props (trees/people/lamps, levels.js STREET_PROP_TIERS): every
    // level scatters every kind, stats.streetProps reports the exact counts,
    // and every one is edible at the level-1 spawn gate (avatar r=26, size
    // gate 0.78 => radius <= 20.28) — they are the opening food chain.
    let streetPropsOk = true;
    for (let n = 1; n <= 100; n += 1) {
      const d = generateDistrict(generateLevel(n));
      for (const tier of levelsMod.STREET_PROP_TIERS) {
        const placed = d.props.filter((p) => p.kind === tier.kind);
        if (placed.length === 0) streetPropsOk = false;
        if ((d.stats.streetProps[tier.kind] || 0) !== placed.length) streetPropsOk = false;
        if (placed.some((p) => p.radius > 26 * 0.78 || p.golden || p.mega)) streetPropsOk = false;
      }
    }
    check('every level scatters tree/person/streetlamp street props, all spawn-edible and counted', streetPropsOk);

    // Every prop stays inside the playable world (B7 coordinate contract).
    let allInside = true;
    const bound = d1.world / 2;
    for (const p of d1.props) {
      if (Math.abs(p.x) > bound || Math.abs(p.z) > bound) allInside = false;
    }
    check('all placed props stay within ±world/2', allInside);

    // groundtex headless fallback: pure descriptor, no canvas, real zoning.
    const bake = groundtexMod.bakeGroundTexture(d1, { metro: generateLevel(1).metro });
    check('bakeGroundTexture returns canvas:null + descriptor headlessly (no DOM at import or call)',
      bake.canvas === null && bake.descriptor.cells.length === bake.descriptor.res * bake.descriptor.res);
    check('ground descriptor contains asphalt streets and tinted blocks',
      bake.descriptor.cells.includes('asphalt') && bake.descriptor.cells.includes('grass'));

    check('level 1 is the authored Chicago Loop pilot',
      generateLevel(1).cityName === 'Chicago'
        && generateLevel(1).districtName === 'The Loop · Chicago'
        && d1.archetype === 'chicago-loop');
    check('the Loop preserves tier mass while favoring buildings over traffic', (() => {
      const global = generateLevel(2).propBudget;
      const loop = generateLevel(1).propBudget;
      const massPreserved = loop.every((tier, i) => approxEqual(
        tier.baseMass * tier.baseCount,
        global[i].baseMass * global[i].baseCount,
      ));
      const count = (kinds) => loop.filter((tier) => kinds.includes(tier.kind))
        .reduce((sum, tier) => sum + tier.baseCount, 0);
      return massPreserved
        && count(['car', 'bus']) === 74
        && count(['building-small', 'building-medium', 'building-large']) === 114;
    })());
    check('the Loop uses an orthogonal eight-street grid with an eastern park edge',
      d1.streets.length === 8
        && d1.streets.every((street) => street.rotY === 0 || street.rotY === Math.PI / 2)
        && d1.blocks.filter((block) => block.chicago && block.chicago.column === 4)
          .every((block) => block.zone === 'park'));
    check('the Loop carries river, elevated rail, and surrounding skyline context',
      d1.context && d1.context.id === 'chicago-loop'
        && d1.context.water.length === 3
        && d1.context.rail.length === 4
        && d1.context.buildings.length === 454
        && d1.context.roads.length === 62
        && d1.context.trees.length === 1138);
    check('authored Chicago context remains render-only and absent from level 2',
      generateDistrict(generateLevel(2)).context === null);
    const contextGroup = cityContextMod.createCityContext(THREE, d1.context);
    check('Chicago context builds as a finite, low-draw scene group',
      contextGroup.isGroup
        && contextGroup.children.length > 0
        && contextGroup.children.filter((child) => child.isInstancedMesh).length === 14
        && contextGroup.children.length === 19);
  }

  // ---------------------------------------------------------------------
  console.log('METRO V2 DATA (art-direction.md §4, content-and-meta.md §1/§2):');
  {
    const sigTypes = new Set(['bridge-silhouette', 'mansard-roofs', 'fog-banks', 'emissive-signs', 'sand-drift', 'travertine-tint', 'confetti', 'snow-dust', 'water-plane', 'god-ray-tower']);
    check('every metro has a signature visual descriptor with a known type',
      METROS.every((m) => m.signature && sigTypes.has(m.signature.type) && m.signature.params));
    check('every metro has a propVariant referencing a known propkit accessory and template kind',
      METROS.every((m) => m.propVariant
        && propkit.PROP_ACCESSORIES[m.propVariant.accessory]
        && ['trash', 'bike', 'car', 'bus', 'building-small', 'building-medium', 'building-large'].includes(m.propVariant.kind)));
    check('every metro has an authored capstoneTwist ({id, description, params})',
      METROS.every((m) => m.capstoneTwist && m.capstoneTwist.id && m.capstoneTwist.description && m.capstoneTwist.params));
    check('every metro declares street-prop density flags (vegetation/pedestrians/lamps) as non-negative numbers',
      METROS.every((m) => m.streetProps
        && ['vegetation', 'pedestrians', 'lamps'].every((k) => Number.isFinite(m.streetProps[k]) && m.streetProps[k] >= 0)));

    // The unlock cadence lands exactly one intro line on each unlock level,
    // and the capstone twist only surfaces on each metro's 10th district.
    const lvls = generateAllLevels();
    check('every cadence unlock level carries exactly one introLine',
      lvls.filter((l) => l.introLine).length === levelsMod.MECHANIC_UNLOCKS.length
        && lvls.every((l) => (l.unlockId ? l.introLine.length > 0 : l.introLine === '')));
    check('capstoneTwist surfaces exactly on the 10 capstone levels (every metro district 10)',
      lvls.filter((l) => l.capstoneTwist !== null).length === 10
        && lvls.every((l) => l.isCapstone === (l.levelInChapter === 10)));
    check('every level carries a deterministic seed and metroIndex/districtIndex',
      lvls.every((l) => Number.isInteger(l.seed) && l.metroIndex === l.chapter - 1 && l.districtIndex === l.levelInChapter - 1));
  }

  // ---------------------------------------------------------------------
  console.log('SAVE/LOAD:');
  {
    const normalizedSettings = saveMod.saveSave({ settings: { soundMuted: true, qualityMode: 'turbo', resolvedQuality: 'low' } }).settings;
    check('quality and sound settings normalize without breaking old saves',
      normalizedSettings.soundMuted === true
        && normalizedSettings.qualityMode === 'auto'
        && normalizedSettings.resolvedQuality === 'low');
  }
  {
    // Mocked localStorage path.
    const memStore = {};
    global.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null),
      setItem: (k, v) => { memStore[k] = String(v); },
      removeItem: (k) => { delete memStore[k]; },
    };
    const before = saveMod.loadSave();
    before.coins = 1234;
    before.upgrades.speed = 3;
    before.unlockedLevel = 42;
    before.stars['7'] = 3;
    before.collection.trash = { count: 5, firstSeenAt: 111 };
    before.achievements.push('first');
    const written = saveMod.saveSave(before);
    check('saveSave (mocked localStorage) returns normalized data', written.coins === 1234 && written.upgrades.speed === 3);
    const reloaded = saveMod.loadSave();
    check(
      'loadSave round-trips through mocked localStorage',
      reloaded.coins === 1234
        && reloaded.upgrades.speed === 3
        && reloaded.unlockedLevel === 42
        && reloaded.stars['7'] === 3
        && reloaded.collection.trash.count === 5
        && reloaded.achievements.includes('first')
    );
    delete global.localStorage;
  }
  {
    // No-localStorage fallback path (in-memory store inside save.js).
    check('no global.localStorage present for fallback check', typeof global.localStorage === 'undefined');
    const defaults = saveMod.loadSave();
    check('loadSave() with no localStorage returns a valid default shape', defaults.coins === 0 && defaults.unlockedLevel === 1);
    defaults.coins = 777;
    defaults.upgrades.magnet = 2;
    saveMod.saveSave(defaults);
    const reloadedFallback = saveMod.loadSave();
    check(
      'save/load round-trips via the in-memory fallback when localStorage is unavailable',
      reloadedFallback.coins === 777 && reloadedFallback.upgrades.magnet === 2
    );
  }

  // ---------------------------------------------------------------------
  console.log('UPGRADES:');
  {
    const { UPGRADE_KEYS, cost, applyUpgrades } = upgradesMod;
    let costMonotonic = true;
    for (const key of UPGRADE_KEYS) {
      let prev = -Infinity;
      for (let tier = 0; tier <= 4; tier += 1) {
        const c = cost(key, tier);
        if (!(c > prev)) costMonotonic = false;
        prev = c;
      }
    }
    check('upgrade cost curve is monotonically increasing for every track', costMonotonic);

    const base = { startMass: 0, timeSeconds: 66 };
    const zeroUpgrades = { size: 0, speed: 0, magnet: 0, time: 0, growth: 0 };
    const maxUpgrades = { size: 5, speed: 5, magnet: 5, time: 5, growth: 5 };
    const modifiedZero = applyUpgrades(base, zeroUpgrades);
    const modifiedMax = applyUpgrades(base, maxUpgrades);
    check(
      'applyUpgrades actually changes base stats when tiers are purchased',
      modifiedMax.startMass > modifiedZero.startMass
        && modifiedMax.moveSpeedMultiplier > modifiedZero.moveSpeedMultiplier
        && modifiedMax.attractRadiusMultiplier > modifiedZero.attractRadiusMultiplier
        && modifiedMax.timeSeconds > modifiedZero.timeSeconds
        && modifiedMax.massGainMultiplier > modifiedZero.massGainMultiplier
    );
  }

  // ---------------------------------------------------------------------
  console.log('V2 META (schema v2 migration, builds, daily, tokens — wiki: content-and-meta.md §3/§4, tech-architecture.md §7):');
  {
    const dailyMod = await import('../src/meta/daily.js');
    const collectionMod = await import('../src/meta/collection.js');

    // Schema v2 migration (tech §7): a synthetic v1 blob keeps its
    // coins/stars/levels/skins/upgrades and gains v2 fields.
    const v1Blob = {
      coins: 500,
      stars: { 1: 3, 2: 2, 11: 3 },
      upgrades: { size: 2, speed: 1, magnet: 0, time: 0, growth: 3 },
      unlockedLevel: 15,
      collection: { trash: { count: 9, firstSeenAt: 5 } },
      achievements: ['first', 'gold'],
      bestCombo: 12,
    };
    const migrated = saveMod.migrateV1(v1Blob);
    check(
      'migrateV1 preserves v1 coins/stars/levels/upgrades/collection/achievements',
      migrated.coins === 500
        && migrated.stars['1'] === 3 && migrated.stars['11'] === 3
        && migrated.unlockedLevel === 15
        && migrated.upgrades.size === 2 && migrated.upgrades.growth === 3
        && migrated.collection.trash.count === 9
        && migrated.achievements.includes('gold')
        && migrated.bestCombo === 12
    );
    check(
      'migrateV1 fills v2 fields with sane defaults (builds/tokens/daily/seedHistory)',
      migrated.version === 2
        && Object.keys(migrated.builds).length === 0
        && Object.keys(migrated.metroTokens).length === 0
        && migrated.daily.attemptsLeft === 3 && migrated.daily.streak === 0
        && Array.isArray(migrated.seedHistory) && migrated.seedHistory.length === 0
        && migrated.lifetimeCoins === 500 // floors at current coins (v1 never tracked it)
    );

    // Builds (content §3, flaw D4): mutually exclusive tier picks; picking
    // locks the tier; respec costs 10% of lifetime coins.
    const buildSave = saveMod.defaultSave();
    buildSave.coins = 5000;
    buildSave.lifetimeCoins = 10000;
    const buy1 = upgradesMod.buyBuildPick(buildSave, 'wide-maw'); // tier 1, price 80
    check('buying a tier-1 pick works and charges its price', buy1.ok === true && buildSave.coins === 4920);
    const buyDup = upgradesMod.buyBuildPick(buildSave, 'lingering-combo'); // same tier
    check('a locked tier rejects a second pick (mutually exclusive)', buyDup.ok === false && buyDup.reason === 'tier-locked' && buildSave.coins === 4920);
    const buyPoor = upgradesMod.buyBuildPick({ coins: 0, builds: {} }, 'devourer');
    check('unaffordable picks are rejected without mutation', buyPoor.ok === false && buyPoor.reason === 'insufficient-coins');
    check('respecCost is 10% of lifetime coins, rounded up', upgradesMod.respecCost(buildSave) === 1000);
    const rs = upgradesMod.respec(buildSave);
    check('respec clears builds and charges 10% of lifetime coins', rs.ok === true && rs.cost === 1000 && buildSave.coins === 3920 && Object.keys(buildSave.builds).length === 0);
    const stats = upgradesMod.applyBuilds({ startMass: 0, timeSeconds: 60 }, { 1: 'wide-maw', 3: 'overtime-clause' });
    check(
      'applyBuilds folds picks into modified stats (eat radius + extra seconds)',
      approxEqual(stats.eatRadiusMultiplier, 1.15) && stats.timeSeconds === 68 && stats.startMass === 0
    );

    // Metro tokens & perks (content §3): 3★ a district -> token; 10 tokens ->
    // skin + perk. Fog Town is metro index 2 (id old-fog-town) -> levels 21-30.
    const tokSave = saveMod.defaultSave();
    for (let n = 21; n <= 30; n += 1) tokSave.stars[String(n)] = 3;
    const granted = upgradesMod.claimMetroTokens(tokSave, METROS);
    check('claimMetroTokens grants one token per 3-star district', granted.length === 10 && tokSave.metroTokens['old-fog-town'] === 10);
    const grantedAgain = upgradesMod.claimMetroTokens(tokSave, METROS);
    check('token claims are idempotent (no double-pay)', grantedAgain.length === 0 && tokSave.metroTokens['old-fog-town'] === 10);
    check('canUnlockMetroPerk true at 10 tokens', upgradesMod.canUnlockMetroPerk(tokSave, 'old-fog-town') === true);
    const unlock = upgradesMod.unlockMetroPerk(tokSave, 'old-fog-town');
    check(
      'unlockMetroPerk spends 10 tokens and grants skin + perk flags',
      unlock.ok === true
        && tokSave.metroTokens['old-fog-town'] === 0
        && tokSave.metroPerks['old-fog-town'] === true
        && tokSave.skins.includes('skin-black-cab')
        && upgradesMod.perkEffects(tokSave).fogRevealsProps === true
    );
    const unlockAgain = upgradesMod.unlockMetroPerk(tokSave, 'old-fog-town');
    check('perk unlock is idempotent-guarded', unlockAgain.ok === false && unlockAgain.reason === 'already-unlocked');

    // Daily challenge (content §3, tech §3): injected dates, 3 attempts/day,
    // streak on consecutive wins, skipped day kills the streak.
    const dSave = saveMod.defaultSave();
    dSave.unlockedLevel = 40; // daily unlocks at 31
    check('daily is locked before level 31', dailyMod.getDailyStatus(saveMod.defaultSave(), '2026-07-23').unlocked === false);
    check('same date yields the same daily seed', dailyMod.dailyLevelSeed('2026-07-23') === dailyMod.dailyLevelSeed('2026-07-23'));
    check('different dates yield different daily seeds', dailyMod.dailyLevelSeed('2026-07-23') !== dailyMod.dailyLevelSeed('2026-07-24'));
    dailyMod.recordDailyAttempt(dSave, '2026-07-23');
    dailyMod.recordDailyAttempt(dSave, '2026-07-23');
    const third = dailyMod.recordDailyAttempt(dSave, '2026-07-23');
    const fourth = dailyMod.recordDailyAttempt(dSave, '2026-07-23');
    check('exactly 3 attempts per day', third.ok === true && third.attemptsLeft === 0 && fourth.ok === false);
    const nextDay = dailyMod.getDailyStatus(dSave, '2026-07-24');
    check('attempts reset on a new day', nextDay.attemptsLeft === 3 && nextDay.canAttempt === true);
    const win1 = dailyMod.recordDailyResult(dSave, '2026-07-23', { won: true });
    check('first daily win starts a streak of 1', win1.streak === 1);
    const win2 = dailyMod.recordDailyResult(dSave, '2026-07-24', { won: true });
    check('consecutive-day win increments the streak', win2.streak === 2 && win2.bestStreak === 2);
    const skipped = dailyMod.getDailyStatus(dSave, '2026-07-26');
    check('skipping a day zeroes the effective streak', skipped.streak === 0 && skipped.bestStreak === 2);

    // Skyline-opedia 2.0 (content §3): variant sightings, page progress,
    // bounty + gallery card on completion.
    const cSave = saveMod.defaultSave();
    const variants = [{ key: 'black-cab', name: 'Black Cab' }, { key: 'fog-bike', name: 'Fog Bike' }];
    check('metroPageProgress starts empty', collectionMod.metroPageProgress(cSave.collectionVariants, 'old-fog-town', variants).complete === false);
    cSave.collectionVariants = collectionMod.recordVariantSighting(cSave.collectionVariants, 'old-fog-town', 'black-cab').collectionVariants;
    cSave.collectionVariants = collectionMod.recordVariantSighting(cSave.collectionVariants, 'old-fog-town', 'fog-bike').collectionVariants;
    const pageProgress = collectionMod.metroPageProgress(cSave.collectionVariants, 'old-fog-town', variants);
    check('variant sightings complete the metro page', pageProgress.complete === true && pageProgress.unlocked === 2);
    const bounty = collectionMod.claimMetroPageReward(cSave, 'old-fog-town', variants);
    check('completing a page pays the bounty + gallery card', bounty.ok === true && cSave.coins === collectionMod.METRO_PAGE_BOUNTY && cSave.galleryCards.includes('old-fog-town'));
    check('page bounty cannot be claimed twice', collectionMod.claimMetroPageReward(cSave, 'old-fog-town', variants).ok === false);
    check('resolveMetroVariants tolerates a propkit with no variant data', collectionMod.resolveMetroVariants({}, 'old-fog-town').length === 0);
  }

  // ---------------------------------------------------------------------
  console.log('LEVEL PROGRESSION REMEDIATION:');
  {
    const objectiveLevel = generateLevel(10);
    const mastered = progressionMod.starResult(objectiveLevel, {
      completed: true,
      completionFraction: 0.65,
      capstoneEaten: true,
      peakCombo: 20,
      goldensEaten: 2,
      rivalsEaten: 1,
      usedSecondWind: false,
    });
    check('objective-aware stars grant completion plus two mastery stars',
      mastered.stars === 3 && mastered.mastery.length === 2);
    const oneStar = progressionMod.starResult(objectiveLevel, {
      completed: true,
      completionFraction: 0.95,
      capstoneEaten: false,
    });
    const twoStars = progressionMod.starResult(objectiveLevel, {
      completed: true,
      completionFraction: 0.95,
      capstoneEaten: true,
    });
    check('objective fixtures produce distinct 1-star, 2-star, and 3-star outcomes',
      oneStar.stars === 1 && twoStars.stars === 2 && mastered.stars === 3);
    check('an incomplete run earns zero stars',
      progressionMod.starResult(objectiveLevel, { completed: false }).stars === 0);

    const rewardSave = saveMod.defaultSave();
    const level = generateLevel(1);
    const first = progressionMod.levelReward(level, { stars: 1 }, rewardSave);
    const duplicate = progressionMod.levelReward(level, { stars: 1 }, rewardSave);
    const improved = progressionMod.levelReward(level, { stars: 3 }, rewardSave);
    const fullReplay = progressionMod.levelReward(level, { stars: 3 }, rewardSave);
    check('first clear, replay, and star improvement settle distinct rewards',
      first.kind === 'first-clear'
        && duplicate.kind === 'replay'
        && improved.kind === 'star-improvement'
        && fullReplay.kind === 'replay');
    check('reward claims make first-clear and star milestones idempotent',
      first.coins === 75 && duplicate.coins === 15 && improved.coins === 50 && fullReplay.coins === 25);
    check('level 1 replay pays less per run than advancing to an uncleared level',
      fullReplay.coins < progressionMod.levelReward(generateLevel(2), { stars: 1 }, rewardSave).coins);

    const oldSave = saveMod.defaultSave();
    oldSave.stars = { 7: 2 };
    delete oldSave.rewardClaims;
    const normalized = saveMod.saveSave(oldSave);
    check('existing v2 stars infer first-clear and star-milestone reward claims',
      normalized.rewardClaims.firstClear['7'] === true
        && normalized.rewardClaims.starMilestones['7'] === 2);
    const preservedFixture = {
      ...saveMod.defaultSave(),
      coins: 321,
      lifetimeCoins: 654,
      stars: { 2: 3 },
      builds: { 1: 'wide-maw' },
      skins: ['void'],
      activeSkin: 'void',
      metroTokens: { fog: 4 },
      metroPerks: { fog: true },
      tokenClaims: { 2: true },
      unlockedLevel: 9,
      collection: { car: { count: 2, firstSeenAt: 1 } },
      collectionVariants: { cab: { count: 1, firstSeenAt: 2 } },
      galleryCards: ['fog'],
      achievements: ['first'],
      bestCombo: 12,
    };
    const preserved = saveMod.saveSave(preservedFixture);
    check('old v2 normalization preserves all existing progression fields',
      preserved.coins === 321
        && preserved.lifetimeCoins === 654
        && preserved.stars['2'] === 3
        && preserved.builds['1'] === 'wide-maw'
        && preserved.activeSkin === 'void'
        && preserved.metroTokens.fog === 4
        && preserved.metroPerks.fog === true
        && preserved.tokenClaims['2'] === true
        && preserved.unlockedLevel === 9
        && preserved.collection.car.count === 2
        && preserved.collectionVariants.cab.count === 1
        && preserved.galleryCards[0] === 'fog'
        && preserved.achievements[0] === 'first'
        && preserved.bestCombo === 12);

    const lowCombo = { mult: () => 1, onEat() {} };
    const highCombo = { mult: () => 5, onEat() {} };
    const avatar = { radius: () => 100, position: { x: 0, z: 0 } };
    const prop = () => [{ position: { x: 0, z: 0 }, radius: 10, mass: 20 }];
    const low = swallowMod.checkSwallow(avatar, prop(), lowCombo, 10, 1, target(1));
    const high = swallowMod.checkSwallow(avatar, prop(), highCombo, 10, 1, target(1));
    check('combo count changes do not change progression mass', low.massGained === high.massGained);
    check('single swallow awards are capped at 15% of target',
      swallowMod.checkSwallow(
        avatar,
        [{ position: { x: 0, z: 0 }, radius: 10, mass: 10000, golden: true, elite: true }],
        lowCombo,
        10,
        1,
        target(1),
      ).massGained <= target(1) * formulas.MAX_SINGLE_AWARD_FRACTION);

    const sourceProps = [
      { mass: 10 },
      { mass: 10, golden: true },
      { mass: 10, golden: true, elite: true },
      { mass: 10, mega: true },
      { mass: 10, storm: true },
      { mass: 10, crumb: true },
      { mass: 10, isCapstone: true },
    ];
    const sourceReports = sourceProps.map((entry) => formulas.progressionAwardReport(
      entry, level.itemValueMultiplier, level.progression.ordinaryMassFraction, level.target,
    ));
    check('ordinary, golden, elite, mega, storm, crumb, and capstone sources report target fractions',
      JSON.stringify(sourceReports.map((entry) => entry.source))
        === JSON.stringify(['ordinary', 'golden', 'elite-golden', 'mega', 'storm', 'crumb', 'capstone'])
        && sourceReports.every((entry) => Number.isFinite(entry.targetFraction) && entry.targetFraction <= 0.15));

    const layout = districtsMod.generateDistrict(level);
    const initialProps = layout.props.map((entry) => ({
      mass: entry.mass,
      golden: entry.golden,
      elite: entry.elite,
      mega: entry.mega,
    }));
    initialProps.push({ mass: level.template.at(-1).baseMass * 8, isCapstone: true });
    const ledger = progressionMod.createAvailableMassLedger(level, initialProps);
    const overflow = Array.from({ length: 1000 }, () => ({ mass: 10000, storm: true }));
    ledger.admit(overflow);
    check('dynamic mass ledger deterministically clamps spawned mass to its declared budget',
      ledger.totalAward <= ledger.limit + 1e-9
        && ledger.dynamicAward > 0
        && ledger.remaining <= 1e-6);

    const startL1 = upgradesMod.applyBuilds(
      { startMass: 0, itemValueMultiplier: itemValueMultiplier(1) },
      { 3: 'heavy-breakfast' },
    ).startMass;
    const startL100 = upgradesMod.applyBuilds(
      { startMass: 0, itemValueMultiplier: itemValueMultiplier(100) },
      { 3: 'heavy-breakfast' },
    ).startMass;
    check('starting-mass build retains the same target fraction at levels 1 and 100',
      approxEqual(startL1 / target(1), startL100 / target(100)));

    const allLevels = generateAllLevels();
    check('all levels expose a defensive active-mechanic descriptor',
      allLevels.every((entry) => entry.mechanics
        && Array.isArray(entry.mechanics.rivals)
        && typeof entry.mechanics.storms === 'boolean'
        && typeof entry.mechanics.traffic === 'boolean'));
    check('mechanic unlock means available, not permanently active',
      generateLevel(11).mechanics.storms === true
        && generateLevel(12).mechanics.storms === false
        && generateLevel(13).mechanics.storms === true);
  }

  // ---------------------------------------------------------------------
  console.log('DISTRICT VISUAL REMEDIATION:');
  {
    const catalogErrors = archetypesMod.validateArchetypeCatalogs();
    check('visual registry and all 100 district catalogs validate', catalogErrors.length === 0);
    check('registry contains the 300 legacy metro archetypes, shared street props, and all 234 reference-led city objects',
      Object.keys(archetypesMod.VISUAL_ARCHETYPES).length
        === 300 + archetypesMod.STREET_PROP_ARCHETYPE_IDS.length + cityObjectsMod.CITY_OBJECTS.length
        && cityObjectsMod.CITY_OBJECTS.length === 234);
    check('every city object declares stable metric dimensions and the canonical gameplay tier seam',
      cityObjectsMod.CITY_OBJECTS.every((entry) => entry.id.startsWith('cityobj_')
        && entry.widthM > 0 && entry.heightM > 0 && entry.depthM > 0
        && archetypesMod.VISUAL_ARCHETYPES[entry.id].gameplayKind === entry.gameplayKind));
    check('Chicago towers and storefront rows resolve as architecture, not clutter',
      cityObjectsMod.CITY_OBJECT_BY_ID.cityobj_chicago_tribune_tower.gameplayKind === 'building-large'
        && cityObjectsMod.CITY_OBJECT_BY_ID.cityobj_chicago_historic_loop_corner_storefront_row.gameplayKind === 'building-small');
    check('Skyline-opedia exposes exactly the 30 visible archetypes per metro',
      METROS.every((metro) => Array.isArray(propkit.metroVariants[metro.id])
        && propkit.metroVariants[metro.id].length === 30));

    let noveltyPass = true;
    let deterministicPass = true;
    let validPlacementPass = true;
    let maxChicagoGroups = 0;
    let maxLegacyGroups = 0;
    const areaOneCityObjects = new Set();
    const levelOneCityObjects = new Set();
    const levelOneContextObjects = new Set();
    const laterChicagoObjects = new Set();
    for (let n = 1; n <= 100; n += 1) {
      const level = generateLevel(n);
      const a = districtsMod.generateDistrict(level);
      const b = districtsMod.generateDistrict(level);
      deterministicPass = deterministicPass && JSON.stringify(a.props.map((p) => p.visualId))
        === JSON.stringify(b.props.map((p) => p.visualId));
      validPlacementPass = validPlacementPass && a.props.every((p) => {
        const descriptor = archetypesMod.VISUAL_ARCHETYPES[p.visualId];
        return descriptor && descriptor.gameplayKind === p.kind && p.collectionKey === descriptor.collectionKey;
      });
      if (level.levelInChapter > 1 && a.stats.novelty.ratio < 0.25) noveltyPass = false;

      const scene = new THREE.Scene();
      const world = instancingMod.createInstancedWorld({ scene, propkit, accent: level.metro.accent });
      world.set(a.props.map((p) => ({
        kind: p.kind,
        visualId: p.visualId,
        collectionKey: p.collectionKey,
        golden: p.golden,
        position: new THREE.Vector3(p.x, 0, p.z),
        radius: p.radius,
        scale: 1,
        scaleY: 1,
      })));
      if (n <= 10) {
        maxChicagoGroups = Math.max(maxChicagoGroups, world.groupCount);
        for (const p of a.props) {
          if (!p.visualId.startsWith('cityobj_')) continue;
          areaOneCityObjects.add(p.visualId);
          if (n === 1) levelOneCityObjects.add(p.visualId);
          else if (p.visualId.startsWith('cityobj_chicago_')) laterChicagoObjects.add(p.visualId);
        }
        if (n === 1) for (const id of a.context.assetIds || []) {
          areaOneCityObjects.add(id);
          levelOneContextObjects.add(id);
        }
      } else {
        maxLegacyGroups = Math.max(maxLegacyGroups, world.groupCount);
      }
      world.dispose();
    }
    check('all 100 levels resolve valid gameplay-kind/visual-ID pairs', validPlacementPass);
    check('districts 2-10 in every metro meet >=25% direct-predecessor novelty', noveltyPass);
    check('all 100 visual-ID selections are byte-identical on duplicate generation', deterministicPass);
    check('all 234 reference-led object types appear deterministically across Area 1',
      areaOneCityObjects.size === cityObjectsMod.CITY_OBJECTS.length);
    check('both chicago-loop reference sheets belong exclusively to Area 1 Level 1',
      levelOneCityObjects.size === cityObjectsMod.CHICAGO_CITY_OBJECTS.filter((entry) => entry.sheet === 'icon').length
        && cityObjectsMod.CHICAGO_CITY_OBJECTS.filter((entry) => entry.sheet === 'icon')
          .every((entry) => levelOneCityObjects.has(entry.id))
        && levelOneContextObjects.size === cityObjectsMod.CHICAGO_CITY_OBJECTS.filter((entry) => entry.sheet === 'rail').length
        && cityObjectsMod.CHICAGO_CITY_OBJECTS.filter((entry) => entry.sheet === 'rail')
          .every((entry) => levelOneContextObjects.has(entry.id))
        && [...levelOneCityObjects].every((id) => id.startsWith('cityobj_chicago_'))
        && laterChicagoObjects.size === 0);
    check(`city-authored levels stay <=60 opaque groups (observed ${maxChicagoGroups})`, maxChicagoGroups <= 60);
    check(`legacy levels retain the <=24 opaque-group budget (observed ${maxLegacyGroups})`, maxLegacyGroups <= 24);
    check('all 100 layouts keep building tiers out of the initial chase-camera corridor',
      generateAllLevels().every((level) => districtsMod.generateDistrict(level).props.every((p) => {
        if (p.tierIndex < 4 || p.z <= -200 || p.z >= 35) return true;
        return Math.abs(p.x) >= 90 + p.radius;
      })));
    check('Big Bell Plaza keeps bus-sized props outside the avatar spawn footprint',
      districtsMod.generateDistrict(generateAllLevels()[29]).props.every((p) =>
        p.tierIndex !== 3 || Math.hypot(p.x, p.z) >= 90));
    check('all 100 layouts keep the landmark out of the initial chase-camera corridor',
      generateAllLevels().every((level) => {
        const landmark = districtsMod.generateDistrict(level).landmark;
        return landmark.z <= -240 || landmark.z >= 50 || Math.abs(landmark.x) >= 720;
      }));

    const fallback = archetypesMod.resolveVisualArchetype('missing_saved_path.glb', 'car');
    check('unknown visual IDs resolve to a safe gameplay-kind fallback',
      fallback.id === 'fallback_car' && fallback.gameplayKind === 'car');

    const variant = archetypesMod.VISUAL_ARCHETYPES.old_fog_town_black_cab;
    const baseId = archetypesMod.DISTRICT_CATALOGS['old-fog-town'][1].mixes.car[0];
    const baseFingerprint = propkit.visualGeometryFingerprint(baseId, 'car', THREE);
    const variantFingerprint = propkit.visualGeometryFingerprint(variant.id, 'car', THREE);
    check('a former accessory variant has distinct merged runtime geometry',
      JSON.stringify(baseFingerprint) !== JSON.stringify(variantFingerprint));
    {
      let geometryBuildCalls = 0;
      const trackedPropkit = {
        ...propkit,
        createInstancedPropField(...args) {
          geometryBuildCalls += 1;
          return propkit.createInstancedPropField(...args);
        },
      };
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0, 1, 1000);
      const world = instancingMod.createInstancedWorld({ scene, propkit: trackedPropkit });
      const pair = [baseId, variant.id].map((visualId, i) => ({
        kind: 'car', visualId, position: new THREE.Vector3(i * 5, 0, 0),
        radius: 2, scale: 1, scaleY: 1, golden: false,
      }));
      world.set(pair);
      const buildsAfterSet = geometryBuildCalls;
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
      camera.position.set(0, 20, 30);
      camera.lookAt(0, 0, 0);
      world.update(1 / 60, camera);
      check('base and former variant appear as distinct visual-ID runtime groups',
        world.groupCount === 2
        && world.groupKeys.some((key) => key.startsWith(`${baseId}|`))
        && world.groupKeys.some((key) => key.startsWith(`${variant.id}|`)));
      check('frame update creates no geometry/material groups', geometryBuildCalls === buildsAfterSet);
      world.dispose();
    }

    let geometryBudgetsPass = true;
    for (const descriptor of Object.values(archetypesMod.VISUAL_ARCHETYPES)) {
      const fingerprint = propkit.visualGeometryFingerprint(descriptor.id, descriptor.gameplayKind, THREE);
      if (!Number.isFinite(fingerprint.checksum) || fingerprint.triangles > 1500) geometryBudgetsPass = false;
    }
    check('all merged geometries (543 catalog entries) are finite and remain <=1500 triangles', geometryBudgetsPass);

    const collectionKeysMod = await import('../src/meta/collection.js');
    check('legacy display names normalize to permanent visual collection IDs',
      collectionKeysMod.normalizeCollectionVisualKey('Black Cab') === 'old_fog_town_black_cab'
      && collectionKeysMod.normalizeCollectionVisualKey('old_fog_town_black_cab') === 'old_fog_town_black_cab');
    const legacySave = saveMod.saveSave({
      collection: {
        'Black Cab': { count: 2, firstSeenAt: 10 },
        'mystery-prop': { count: 1, firstSeenAt: 20 },
      },
    });
    const normalizedAgain = saveMod.saveSave(legacySave);
    check('collection normalization is idempotent and preserves unknown legacy keys diagnostically',
      JSON.stringify(legacySave) === JSON.stringify(normalizedAgain)
      && legacySave.collection.old_fog_town_black_cab.count === 2
      && legacySave.legacyCollectionKeys['mystery-prop'].count === 1);
  }

  // ---------------------------------------------------------------------
  console.log('SCENE GRAPH (propkit + landmarks, real three.js, no GL context):');
  {
    const kindsInTemplates = new Set();
    generateLevel(1).template.forEach((t) => kindsInTemplates.add(t.kind));
    check(
      'every kind used in level templates is exactly the 7 propkit kinds',
      kindsInTemplates.size === 7
        && ['trash', 'bike', 'car', 'bus', 'building-small', 'building-medium', 'building-large'].every((k) => kindsInTemplates.has(k))
    );

    function isFiniteBox(obj) {
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return false;
      const size = new THREE.Vector3();
      box.getSize(size);
      return Number.isFinite(size.x) && Number.isFinite(size.y) && Number.isFinite(size.z);
    }
    function hasMeshChild(obj) {
      let found = false;
      obj.traverse((node) => { if (node.isMesh) found = true; });
      return found;
    }

    let allPropsValid = true;
    for (const kind of kindsInTemplates) {
      const mesh = propkit.createPropMesh(kind, THREE, '#8fb8d9');
      const isObject3D = mesh instanceof THREE.Object3D;
      if (!isObject3D || !isFiniteBox(mesh) || !hasMeshChild(mesh)) allPropsValid = false;
    }
    check('createPropMesh returns a valid, finite, mesh-bearing Object3D for every template kind', allPropsValid);

    // V2 variant path (content-and-meta.md §2): tint + accessory reskin.
    const variantMesh = propkit.createPropMesh('bike', THREE, '#8fb8d9', METROS[1].propVariant);
    check('createPropMesh honors a metro propVariant (tint + accessory) without breaking the mesh contract',
      variantMesh instanceof THREE.Object3D && isFiniteBox(variantMesh) && hasMeshChild(variantMesh));

    const landmarkTypes = METROS.map((m) => m.landmarkType);
    let allLandmarksValid = true;
    for (const lt of landmarkTypes) {
      const group = landmarks.createLandmark(lt, THREE, '#f0c419');
      const isObject3D = group instanceof THREE.Object3D;
      const hasBoundingRadius = typeof group.boundingRadius === 'number' && Number.isFinite(group.boundingRadius) && group.boundingRadius > 0;
      if (!isObject3D || !hasBoundingRadius || !isFiniteBox(group) || !hasMeshChild(group)) allLandmarksValid = false;
    }
    check('createLandmark returns a valid, finite, mesh-bearing Object3D for all 10 landmarkTypes', allLandmarksValid);
  }

  // ---------------------------------------------------------------------
  console.log('SWALLOW MATH:');
  {
    const { checkSwallow, DEFAULT_SIZE_GATE, GOLDEN_BONUS_MULTIPLIER, EAT_REACH_FACTOR } = swallowMod;

    // Fake avatar: radius() = 100, positioned at origin.
    const fakeAvatar = { radius: () => 100, position: { x: 0, y: 0, z: 0 } };
    const reach = 100 * EAT_REACH_FACTOR; // 82

    function makeCombo() { return { mult: () => 1, onEat() { this._n = (this._n || 0) + 1; return this._n; } }; }

    // Case 1: within reach, within default size gate -> eaten.
    const edibleClose = { position: { x: 10, y: 0, z: 0 }, radius: 50, mass: 10 }; // r=50 <= 100*0.78=78
    // Case 2: within reach, radius exceeds default size gate -> NOT eaten.
    const tooBigClose = { position: { x: -10, y: 0, z: 0 }, radius: 90, mass: 10 }; // r=90 > 78
    // Case 3: out of reach (distance > reach), otherwise edible -> NOT eaten.
    const farAway = { position: { x: reach + 20, y: 0, z: 0 }, radius: 20, mass: 10 };
    // Case 4: golden bonus — edible, within default gate.
    const goldenObj = { position: { x: 0, y: 0, z: 20 }, radius: 30, mass: 10, golden: true };

    const arr1 = [edibleClose, tooBigClose, farAway, goldenObj];
    const result1 = checkSwallow(fakeAvatar, arr1, makeCombo(), 5); // itemValueMultiplier=5

    check('edible/close object is eaten', result1.eaten.includes(edibleClose));
    check('object exceeding the default size gate is NOT eaten despite being in reach', !result1.eaten.includes(tooBigClose));
    check('object out of reach is NOT eaten despite passing the size gate', !result1.eaten.includes(farAway));
    check('golden object is eaten and array is mutated (spliced) in place', result1.eaten.includes(goldenObj) && arr1.length === 2);

    const expectedMass1 = (10 * 5 + 10 * 5 * GOLDEN_BONUS_MULTIPLIER) * formulas.ORDINARY_MASS_FRACTION;
    check('massGained applies the declared ordinary fraction and golden multiplier', approxEqual(result1.massGained, expectedMass1));

    // Combo-multiplier-read-once-per-frame: multiple eats in one call must
    // all use the SAME (start-of-call) multiplier, even though onEat()
    // increments the combo tracker's internal count during the loop.
    let comboMultReads = 0;
    const growingMultCombo = {
      mult() { comboMultReads += 1; return 3; }, // constant so we can verify call count separately below
      onEat() { return 1; },
    };
    const multiEatArr = [
      { position: { x: 1, y: 0, z: 0 }, radius: 10, mass: 4 },
      { position: { x: 2, y: 0, z: 0 }, radius: 10, mass: 6 },
      { position: { x: 3, y: 0, z: 0 }, radius: 10, mass: 8 },
    ];
    const resultMulti = checkSwallow(fakeAvatar, multiEatArr, growingMultCombo, 1);
    check('combo multiplier is never read by progression mass calculation', comboMultReads === 0);
    check('combo count does not alter mass awarded', approxEqual(resultMulti.massGained, (4 + 6 + 8) * formulas.ORDINARY_MASS_FRACTION));

    // Capstone gating: a capstone object with a looser gate (0.95) is edible
    // even though its radius (90) would fail the DEFAULT size gate (0.78) a
    // regular object uses at the same avatar radius.
    const capstoneObj = {
      position: { x: 0, y: 0, z: 0 }, radius: 90, mass: 50, isCapstone: true, capstoneGate: 0.95,
    };
    const capstoneArr = [capstoneObj];
    const capstoneResult = checkSwallow(fakeAvatar, capstoneArr, makeCombo(), 1);
    check(
      'a capstone object uses its own capstoneGate instead of DEFAULT_SIZE_GATE',
      capstoneResult.eaten.includes(capstoneObj) && 90 > 100 * DEFAULT_SIZE_GATE
    );

    // Magnet (reachMultiplier): an object beyond the default reach becomes
    // edible once reachMultiplier extends the pickup range, WITHOUT that
    // extension affecting the size gate.
    const magnetTarget = { position: { x: reach + 20, y: 0, z: 0 }, radius: 20, mass: 10 };
    const noMagnetResult = checkSwallow(fakeAvatar, [{ ...magnetTarget, position: { ...magnetTarget.position } }], makeCombo(), 1);
    check('object beyond default reach is not eaten with reachMultiplier=1 (default)', noMagnetResult.eaten.length === 0);
    const withMagnetResult = checkSwallow(fakeAvatar, [{ ...magnetTarget, position: { ...magnetTarget.position } }], makeCombo(), 1, 1.5);
    check('the same object IS eaten once reachMultiplier (magnet upgrade) extends pickup range', withMagnetResult.eaten.length === 1);
  }

  // ---------------------------------------------------------------------
  console.log('AVATAR (speedMultiplier hook):');
  {
    const fakeScene = { add() {} };
    const a1 = avatarMod.createAvatar(fakeScene, THREE);
    const a2 = avatarMod.createAvatar(fakeScene, THREE);
    check('avatar.speedMultiplier defaults to 1', a1.speedMultiplier === 1);
    a2.speedMultiplier = 2;
    a1.setMoveInput(1, 0);
    a2.setMoveInput(1, 0);
    a1.update(0.1);
    a2.update(0.1);
    check(
      'doubling speedMultiplier roughly doubles per-frame displacement at equal mass',
      approxEqual(a2.object3D.position.x / a1.object3D.position.x, 2, 0.05)
    );
  }

  // ---------------------------------------------------------------------
  console.log('ACHIEVEMENTS / COMBO:');
  {
    const { ACH, createAchievementTracker, checkHoarder } = achMod;
    const keys = Object.keys(ACH);
    // V2: 16 keys — the original 14 plus `duelist` (game-design.md §4,
    // Duelist archetype) and `secondWind` (game-design.md §6, mercy rules).
    check('16 achievement keys present', keys.length === 16);
    const expectedKeys = [
      'first', 'combo10', 'combo25', 'gold', 'rival', 'fast', 'storm', 'god', 'unsub', 'breeze', 'win',
      'metroCleared', 'centurion', 'hoarder', 'duelist', 'secondWind',
    ];
    check('achievement keys match the expected 16 (14 original+V1-new + duelist/secondWind per game-design.md §4/§6)', expectedKeys.every((k) => keys.includes(k)));

    const tracker = createAchievementTracker();
    const first = tracker.unlock('first');
    check('unlock() returns the [title, description] entry on first unlock', Array.isArray(first) && first.length === 2);
    const again = tracker.unlock('first');
    check('unlock() is idempotent (returns null on repeat)', again === null);
    check('checkHoarder(50) is true, checkHoarder(49) is false', checkHoarder(50) === true && checkHoarder(49) === false);

    const { COMBO_TIERS } = comboMod;
    const thresholds = COMBO_TIERS.map(([n]) => n);
    check('combo tier thresholds intact ([30,25,20,15,10,5], highest-first)', JSON.stringify(thresholds) === JSON.stringify([30, 25, 20, 15, 10, 5]));

    const combo = comboMod.createComboTracker();
    // mult() = 1 + min(4, floor(count/4)) — after 8 eats, floor(8/4)=2, so x3.
    for (let i = 0; i < 8; i += 1) combo.onEat();
    check('combo mult formula holds mid-run (8 eats -> x3)', combo.mult() === 3);
    combo.update(3); // > COMBO_WINDOW (2.2s) -> resets
    check('combo resets to 0 after its window elapses', combo.count === 0);
  }

  // ---------------------------------------------------------------------
  // Steering stability (.wiki/0003-hole-feel-and-visual-fidelity §1). These
  // guard the two defects that made the hole "fight you" turning left/right:
  // a camera yaw derived from the avatar's heading (closed feedback loop),
  // and an unnormalised atan2 difference in the facing damp (wrap snap).
  console.log('STEERING STABILITY:');
  {
    const { cameraRelativeMove, createInputMachine } = await import('../src/engine/input.js');
    const { shortestAngleTo } = await import('../src/engine/avatar.js');

    // The wrap itself: damping across the +/-PI seam must take the short way.
    check('shortest angle across the +PI/-PI seam is small and correctly signed',
      Math.abs(shortestAngleTo(Math.PI * 0.98, -Math.PI * 0.98) - (Math.PI * 0.04)) < 1e-9);
    check('shortest angle is stable for an unbounded accumulated rotation',
      Math.abs(shortestAngleTo(Math.PI * 6 + 0.1, 0.2) - 0.1) < 1e-9);
    check('shortest angle is always within (-PI, PI]',
      [0.3, 3.0, -3.0, 12.7, -40.1, 99.9].every((a) =>
        [0.1, 2.9, -2.9, 7.3].every((b) => {
          const d = shortestAngleTo(a, b);
          return d > -Math.PI - 1e-9 && d <= Math.PI + 1e-9;
        })));

    // Replay held movement against a gesture-frozen camera basis. Camera
    // presentation may follow heading, but a held direction must stay straight.
    const DT = 1 / 60;
    function travel(keys, cameraYaw) {
      const machine = createInputMachine({});
      keys.forEach((k) => machine.handleKeyDown(k));
      let x = 0;
      let z = 0;
      let rotY = 0;
      let reversals = 0;
      let prev = 0;
      for (let i = 0; i < 180; i += 1) {
        machine.update(DT, { cameraYaw });
        const mv = cameraRelativeMove(machine.move, cameraYaw);
        const len = Math.hypot(mv.dx, mv.dz);
        if (len <= 0.0001) continue;
        const nx = mv.dx / len;
        const nz = mv.dz / len;
        const speed = 340 * Math.min(1, len) * (60 / Math.max(60, 26));
        x += nx * speed * DT;
        z += nz * speed * DT;
        const step = shortestAngleTo(rotY, Math.atan2(nx, nz)) * Math.min(1, DT * 6);
        rotY += step;
        if (prev !== 0 && Math.sign(step) !== Math.sign(prev)) reversals += 1;
        prev = step;
      }
      return { x, z, distance: Math.hypot(x, z), reversals };
    }

    const CAM_YAW = 0; // camera.js BASE_YAW
    const runs = [['w'], ['a'], ['s'], ['d'], ['w', 'd']].map((keys) => travel(keys, CAM_YAW));
    const ideal = 340 * (60 / Math.max(60, 26)) * 3;
    check('every held direction travels a straight line at full speed (no curving)',
      runs.every((r) => r.distance > ideal * 0.97));
    check('no held direction reverses the avatar heading mid-run (no judder)',
      runs.every((r) => r.reversals === 0));

    // Direction correctness at spawn. With BASE_YAW = 0 the eye sits
    // at -Z and looks along +Z, so "away from camera" (W) is world +Z. Screen
    // right is (up x view) = -X, matching input.js's documented mapping.
    // The gesture-frozen basis keeps these directions stable for the run.
    const [fw, left, back, right] = runs;
    check('W drives up-screen (world +Z) and S drives down-screen (world -Z)',
      fw.z > ideal * 0.9 && back.z < -ideal * 0.9 && Math.abs(fw.x) < 1 && Math.abs(back.x) < 1);
    check('D strafes screen-right (world -X) and A strafes screen-left (world +X)',
      right.x < -ideal * 0.9 && left.x > ideal * 0.9 && Math.abs(right.z) < 1 && Math.abs(left.z) < 1);

    const camera = new THREE.PerspectiveCamera(70, 1, 20, 12000);
    const cameraAvatar = {
      position: new THREE.Vector3(0, 0, 0),
      object3D: new THREE.Group(),
      radius: () => 26,
    };
    const chase = cameraMod.createChaseCamera(camera, cameraAvatar, THREE);
    cameraAvatar.object3D.rotation.y = Math.PI / 2;
    for (let i = 0; i < 60; i += 1) chase.update(DT);
    check('camera smoothly turns behind the avatar heading',
      Math.abs(shortestAngleTo(chase.followYaw, Math.PI / 2)) < 0.03
        && camera.position.x < -200);
    check('camera follow reverses continuously and catches the player within one second', (() => {
      cameraAvatar.object3D.rotation.y = -1.2;
      let previousYaw = chase.followYaw;
      let previousVelocity = chase.followYawVelocity;
      let maxYawStep = 0;
      let maxVelocityStep = 0;
      for (let i = 0; i < 60; i += 1) {
        chase.update(DT);
        maxYawStep = Math.max(maxYawStep, Math.abs(shortestAngleTo(previousYaw, chase.followYaw)));
        maxVelocityStep = Math.max(maxVelocityStep, Math.abs(chase.followYawVelocity - previousVelocity));
        previousYaw = chase.followYaw;
        previousVelocity = chase.followYawVelocity;
      }
      return Math.abs(shortestAngleTo(chase.followYaw, -1.2)) < 0.03
        && maxYawStep < 0.22
        && maxVelocityStep < 6;
    })());
    check('manual orbit remains an offset from the followed heading', (() => {
      const before = chase.yaw;
      chase.orbitBy(0.25, 0);
      return approxEqual(shortestAngleTo(before, chase.yaw), 0.25, 1e-6);
    })());
  }

  // ---------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // WIN RULE (.wiki/0004-false-level-failure) — the conjunction, the copy it
  // produces, the HUD states it drives, and the balance property that the
  // advertised mass target is actually a sufficient goal.
  // -------------------------------------------------------------------------
  console.log('WIN RULE (0004):');
  {
    const winMod = await import('../src/systems/win.js');
    const formatMod = await import('../src/ui/format.js');
    const { evaluateWin, capstoneChipState, massBarState, failReasonText } = winMod;
    const { formatProgress } = formatMod;
    const { generateLevel, LEVEL_COUNT } = levelsMod;
    const { capstoneGateRadius, radiusFromMass } = formulas;
    const THREE = await import('three');

    const snap = (o = {}) => ({
      mass: 0,
      capstoneEaten: false,
      capstoneEdible: false,
      shieldRemaining: 0,
      peakCombo: 0,
      portalComboNeeded: 0,
      ...o,
    });
    // A capstone-required level (capstoneGate above the default) and one
    // without, expressed directly so the truth table does not depend on which
    // level numbers happen to carry the requirement.
    const gated = { target: 1000, capstoneGate: 0.92, isCapstone: false };
    const plain = { target: 1000, capstoneGate: swallowMod.DEFAULT_SIZE_GATE, isCapstone: false };

    // --- truth table: all four quadrants of (massMet, capstoneMet) ---------
    check('win: mass met + capstone eaten => won',
      evaluateWin(snap({ mass: 1000, capstoneEaten: true }), gated).won === true);
    check('win: mass met + capstone standing => NOT won, blamed on the capstone',
      (() => {
        const w = evaluateWin(snap({ mass: 1200 }), gated);
        return w.won === false && w.massMet === true && w.blockingReason === 'capstone';
      })());
    check('win: mass short + capstone eaten => NOT won, blamed on the mass',
      (() => {
        const w = evaluateWin(snap({ mass: 400, capstoneEaten: true }), gated);
        return w.won === false && w.blockingReason === 'mass';
      })());
    check('win: both short => blockingReason "both"',
      evaluateWin(snap({ mass: 400 }), gated).blockingReason === 'both');
    check('win: mass alone wins where no capstone is required (L1-L9 shape)',
      (() => {
        const w = evaluateWin(snap({ mass: 1000 }), plain);
        return w.won === true && w.capstoneRequired === false;
      })());
    check('win: every 10th level requires the capstone even at the default gate',
      evaluateWin(snap({ mass: 1000 }), { ...plain, isCapstone: true }).won === false);

    // --- blocker precedence: most specific reason first --------------------
    check('win: shield outranks size as the stated blocker',
      evaluateWin(snap({ mass: 1000, shieldRemaining: 4 }), gated).capstoneBlocker === 'shield');
    check('win: portal combo outranks size once the shield is down',
      evaluateWin(snap({ mass: 1000, portalComboNeeded: 25, peakCombo: 9 }), gated)
        .capstoneBlocker === 'combo');
    check('win: size is the blocker when nothing else holds',
      evaluateWin(snap({ mass: 1000 }), gated).capstoneBlocker === 'size');
    check('win: no blocker once the landmark is edible (it is takeable now)',
      evaluateWin(snap({ mass: 1000, capstoneEdible: true }), gated).capstoneBlocker === null);

    // --- THE 0004 ACCEPTANCE TEST -----------------------------------------
    // The reported sentence was "Time ran out at 126,069 / 100,000 mass." on a
    // loss whose real cause was the standing landmark. That must be impossible
    // now, at any level, for any over-target mass.
    //
    // COVERAGE NOTE: this sweep runs every level with shieldRemaining 0 and
    // portalComboNeeded 0, so the 100-level pass exercises the SIZE blocker
    // only. The shield and combo blockers, and the 'both' quadrant, are
    // asserted on the rendered copy in the single-case checks directly below —
    // that is where to look for them, not in the sweep.
    let blamedMass = 0;
    for (let n = 1; n <= LEVEL_COUNT; n += 1) {
      const level = generateLevel(n);
      const w = evaluateWin(snap({ mass: level.target * 1.26 }), level);
      if (w.won) continue; // L1-L9: mass alone really is the whole rule
      const text = failReasonText(w, {
        mass: level.target * 1.26,
        target: level.target,
        shieldRemaining: 0,
        peakCombo: 0,
        portalComboNeeded: 0,
      });
      if (/Time ran out at/.test(text)) blamedMass += 1;
    }
    check('fail copy: an over-target loss is NEVER explained as "Time ran out at X / Y mass" (0004)',
      blamedMass === 0);
    check('fail copy: a genuine mass shortfall still says time ran out',
      /^Time ran out at/.test(failReasonText(
        evaluateWin(snap({ mass: 400, capstoneEaten: true }), gated),
        { mass: 400, target: 1000, shieldRemaining: 0, peakCombo: 0, portalComboNeeded: 0 },
      )));
    check('fail copy: a shielded landmark names the shield and its remaining eats',
      /shield held: 4 more eats/.test(failReasonText(
        evaluateWin(snap({ mass: 1000, shieldRemaining: 4 }), gated),
        { mass: 1000, target: 1000, shieldRemaining: 4, peakCombo: 0, portalComboNeeded: 0 },
      )));
    // The fourth quadrant, on the RENDERED copy rather than only on
    // evaluateWin: both short must name BOTH, and must not silently degrade
    // into the mass-only sentence the way the pre-fix copy did.
    check('fail copy: a both-short loss names the mass AND the standing landmark',
      (() => {
        const text = failReasonText(
          evaluateWin(snap({ mass: 400 }), gated),
          { mass: 400, target: 1000, shieldRemaining: 0, peakCombo: 0, portalComboNeeded: 0 },
        );
        return /Time ran out at/.test(text) && /landmark still standing/.test(text);
      })());
    check('fail copy: a sealed portal names the combo it needed and the best reached',
      /peak combo of 25 \(best this run: 9\)/.test(failReasonText(
        evaluateWin(snap({ mass: 1000, portalComboNeeded: 25, peakCombo: 9 }), gated),
        { mass: 1000, target: 1000, shieldRemaining: 0, peakCombo: 9, portalComboNeeded: 25 },
      )));

    // --- HUD: chip states and the mass bar --------------------------------
    const chipFor = (s, lvl = gated) => capstoneChipState(evaluateWin(snap(s), lvl), snap(s));
    check('chip: hidden when no landmark is required',
      chipFor({ mass: 10 }, plain).hidden === true);
    check('chip: "grow bigger" while size-locked',
      /grow bigger/.test(chipFor({ mass: 10 }).text));
    check('chip: shield state counts down the remaining eats',
      /shielded · 3 more eats/.test(chipFor({ shieldRemaining: 3 }).text));
    check('chip: portal state shows combo progress',
      /combo 9\/25/.test(chipFor({ portalComboNeeded: 25, peakCombo: 9 }).text));
    check('chip: shouts EAT THE LANDMARK the moment it is edible',
      (() => {
        const c = chipFor({ capstoneEdible: true });
        return c.tone === 'ready' && /EAT THE LANDMARK/.test(c.text);
      })());
    check('chip: goes muted once the landmark is down',
      chipFor({ capstoneEaten: true }).tone === 'done');

    // THE INVARIANT 0004 BROKE: a full, ungated bar means the level is won.
    let barLies = 0;
    for (const m of [0.5, 0.99, 1, 1.5, 4]) {
      const w = evaluateWin(snap({ mass: 1000 * m }), gated);
      const bar = massBarState(1000 * m, 1000, w);
      if (!w.won && bar.percent >= 100 && !bar.gated) barLies += 1;
      if (!w.won && !bar.gated) barLies += 1;
    }
    check('mass bar: never reads full-and-ungated on a level that is not won (0004)',
      barLies === 0);
    check('mass bar: fills to 100% ungated once the level is actually won',
      (() => {
        const w = evaluateWin(snap({ mass: 1000, capstoneEaten: true }), gated);
        const bar = massBarState(1000, 1000, w);
        return bar.percent === 100 && bar.gated === false;
      })());

    // --- formatter: a short mass must never render as the target ----------
    let collisions = 0;
    for (let n = 1; n <= LEVEL_COUNT; n += 1) {
      const t = generateLevel(n).target;
      const ref = formatProgress(t, t);
      for (const f of [0.99, 0.995, 0.999, 0.9999, 0.99999]) {
        const m = t * f;
        if (m >= t) continue;
        if (formatProgress(m, t) === ref) collisions += 1;
      }
    }
    check('formatProgress: a mass short of target never renders as the target (§4.4)',
      collisions === 0);
    check('formatProgress: still truncates, never rounds up',
      formatProgress(999900, 1000000) !== '1.00M');
    check('formatProgress: unchanged from formatCompact below 99% of target',
      formatProgress(500000, 1000000) === formatMod.formatCompact(500000));

    // --- BALANCE: the advertised target must be a sufficient goal ---------
    // This is the check that would have caught L41-L50 at authoring time. The
    // invariant suite only checks the gate is reachable in TIME; this asserts
    // it opens at or under the mass the HUD prints as the goal.
    const landmarkRadiusByType = {};
    for (const metro of metrosMod.METROS) {
      landmarkRadiusByType[metro.landmarkType] = landmarks
        .createLandmark(metro.landmarkType, THREE, metro.accent).boundingRadius;
    }
    const overTarget = [];
    for (let n = 1; n <= LEVEL_COUNT; n += 1) {
      const level = generateLevel(n);
      const capstoneRequired = level.capstoneGate > swallowMod.DEFAULT_SIZE_GATE || level.isCapstone;
      if (!capstoneRequired) continue;
      // Calls the REAL rule (win.js capstoneEffectiveRadius) with the REAL
      // landmark geometry, rather than restating the formula here.
      //
      // HONEST LIMIT: this verifies the RULE, not the spawn. main.js could
      // revert to max(landmark.boundingRadius, ...) with the helper left
      // correct and this check would stay green with the defect back in the
      // live game. The wiring assertion below is what closes that gap.
      const effRadius = winMod.capstoneEffectiveRadius(
        landmarkRadiusByType[level.metro.landmarkType], capstoneGateRadius(level),
      ).radius;
      const needAvatarR = effRadius / level.capstoneGate;
      // invert radiusFromMass by bisection — it is monotonic in mass.
      let lo = 0;
      let hi = level.target * 10;
      for (let i = 0; i < 80; i += 1) {
        const mid = (lo + hi) / 2;
        if (radiusFromMass(mid) < needAvatarR) lo = mid; else hi = mid;
      }
      const needBase = hi;
      const baseTarget = level.target / level.itemValueMultiplier;
      if (needBase > baseTarget * 1.0001) overTarget.push(`L${n} ${(needBase / baseTarget).toFixed(3)}x`);
    }
    check('balance: an oversized landmark mesh is scaled down, never allowed to raise the gate',
      (() => {
        const s = winMod.capstoneEffectiveRadius(73.6, 64.8);
        return s.radius === 64.8 && Math.abs(s.meshScale - 64.8 / 73.6) < 1e-9;
      })());
    check('balance: a landmark already under the economy radius is left at scale 1',
      winMod.capstoneEffectiveRadius(24.2, 64.8).meshScale === 1);
    check('balance: the capstone size gate opens at or below the advertised target, every level'
      + (overTarget.length ? ` (over on: ${overTarget.slice(0, 6).join(', ')})` : ''),
      overTarget.length === 0);

    // --- WIRING: the rule the checks above measure is the rule that RUNS ---
    //
    // Every balance check in this section, and the evidence probe beside the
    // findings doc, calls capstoneEffectiveRadius() directly. None of them can
    // see what main.js actually spawns, so all of them would stay green if the
    // spawn reverted to max(landmark.boundingRadius, capstoneGateRadius(level))
    // while the helper stayed correct — the original 0004 §4.3 defect, back in
    // the live game, with a fully green suite.
    //
    // Source-text matching is crude and it is deliberate. buildLevelWorld is a
    // closure inside main(), which needs a WebGL context and a DOM, so the
    // spawn cannot be exercised headlessly and an end-to-end assertion on the
    // produced radius is not available here. This grep is the only Node-visible
    // link between the rule these tests measure and the code that ships. If
    // the spawn ever becomes independently callable, replace this with a real
    // end-to-end check on the capstone prop's radius.
    {
      // Node reparses this file as ESM (see the warning suppression at the
      // top), so `require` and `__dirname` are not available — dynamic import
      // plus the running script's own path, which holds under either parse.
      const fs = await import('node:fs');
      const path = await import('node:path');
      const mainSrc = fs.readFileSync(
        path.join(path.dirname(process.argv[1]), '..', 'src', 'main.js'), 'utf8',
      );
      check('wiring: main.js never lets landmark geometry raise the capstone gate',
        !/Math\.max\(\s*landmark\.boundingRadius/.test(mainSrc));
      check('wiring: the capstone gate radius comes from capstoneEffectiveRadius()',
        /capstoneEffectiveRadius\(\s*\n?\s*landmark\.boundingRadius,\s*capstoneGateRadius\(level\)/
          .test(mainSrc));
      check('wiring: the spawned capstone prop takes its radius from that result',
        /const gateRadius = capstoneSize\.radius;/.test(mainSrc)
        && /radius: gateRadius,/.test(mainSrc));
      check('wiring: an oversized landmark mesh is actually scaled by the returned factor',
        /landmark\.scale\.multiplyScalar\(capstoneSize\.meshScale\)/.test(mainSrc));
    }
  }

  console.log('AUDIO:');
  {
    const { Audio } = audioMod;
    let threw = false;
    try {
      Audio.init(); // no AudioContext exists in Node -> should be a safe no-op
      Audio.beep(440, 0.1, 'sine', 0.2, 220, 0);
      Audio.noise(0.1, 0.1, 0, 800);
      Audio.gulp(40);
      Audio.gulp(40, 7); // V2: combo-pitch variant (game-design.md §3)
      Audio.comboUp(4);
      Audio.chainPing(3); // V2: tier-up pitch ladder (game-design.md §3)
      Audio.vacuumWhoosh(); // V2: vacuum snap (game-design.md §3)
      Audio.pinataBurst(); // V2: rival piñata (game-design.md §4)
      Audio.wedgeThunk(); // V2: wedge wobble (game-design.md §3)
      Audio.golden();
      Audio.rivalEat();
      Audio.storm();
      Audio.grow();
      Audio.fail();
      Audio.done();
      Audio.win();
      Audio.tick();
      Audio.god();
    } catch (e) {
      threw = true;
      console.log('   audio error:', e.message);
    }
    check('every Audio method is callable without throwing when no AudioContext exists', !threw);
    check('Audio.ac stays null with no AudioContext available (never fakes one)', Audio.ac === null);
  }

  console.log('MOBILE UI CONTRACT:');
  {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.join(path.dirname(process.argv[1]), '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const mainSrc = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
    check('viewport permits zoom and requests full safe-area coverage',
      /viewport-fit=cover/.test(html) && !/user-scalable=no|maximum-scale=1/.test(html));
    check('pause and sound controls are named 44px touch targets',
      /id="pauseBtn"[^>]+aria-label="Pause game"/.test(html)
        && /\.iconbtn\{width:44px;height:44px/.test(html)
        && (html.match(/class="[^"]*sound-toggle/g) || []).length >= 3);
    check('all four safe-area insets are represented in the UI contract',
      ['top', 'right', 'bottom', 'left'].every((side) => html.includes(`env(safe-area-inset-${side})`)));
    check('Level Complete exposes primary next, optional upgrade, and map actions',
      /id="nextBtn"/.test(html) && /id="upgradeBtn"/.test(html) && /id="doneMapBtn"/.test(html)
        && /nextBtn\.addEventListener\('click', continueDirectly\)/.test(mainSrc));
    check('pause stops play updates and persisted quality/sound controls are wired',
      /state\.mode = 'paused'/.test(mainSrc)
        && /state\.saveData\.settings\.qualityMode = normalized/.test(mainSrc)
        && /state\.saveData\.settings\.soundMuted = Audio\.muted/.test(mainSrc));
    check('final campaign Next reaches victory before chapter-end map routing',
      mainSrc.indexOf('level.n >= LEVEL_COUNT', mainSrc.indexOf('function continueDirectly'))
        < mainSrc.indexOf('level.levelInChapter >= 10', mainSrc.indexOf('function continueDirectly')));
    check('runtime quality applies profile effects and optional-detail density',
      /setMaxConcurrent\(Math\.max\(0, Math\.round\(2 \* profile\.effectsDensity\)\)\)/.test(mainSrc)
        && /state\.world\.setQuality\(profile\)/.test(mainSrc));
  }

  {
    const budget = effectsMod.createRingBudget({ maxConcurrent: 2 });
    check('quality can lower the rival feedback budget without suppressing player feedback',
      budget.tryClaim() && budget.tryClaim() && budget.maxConcurrent === 2
        && (budget.setMaxConcurrent(0), budget.maxConcurrent === 0 && !budget.tryClaim()));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
