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
  const groundtexMod = await import('../src/content/groundtex.js');
  const audioMod = await import('../src/systems/audio.js');
  const comboMod = await import('../src/systems/combo.js');
  const achMod = await import('../src/systems/achievements.js');
  const swallowMod = await import('../src/systems/swallow.js');
  const saveMod = await import('../src/meta/save.js');
  const upgradesMod = await import('../src/meta/upgrades.js');
  const avatarMod = await import('../src/engine/avatar.js');
  const THREE = await import('three');

  const {
    target, chapterOf, levelInChapterOf, timeSeconds, worldSize, rivalCount, capstoneGate, itemValueMultiplier,
    coinsForLevel, rivalEatBonus, reachableMassFraction, LEVEL_ONE_MIN_PAYOUT,
    GOLDEN_MASS_MULTIPLIER, GOLDEN_COIN_BONUS, radiusFromMass,
  } = formulas;
  const { METROS } = metrosMod;
  const { generateAllLevels, generateLevel } = levelsMod;

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

  // 2. timeSeconds strictly increasing; worldSize non-decreasing, n=1..100.
  {
    let timeStrictlyIncreasing = true;
    let worldNonDecreasing = true;
    let prevTime = -Infinity;
    let prevWorld = -Infinity;
    for (let n = 1; n <= 100; n += 1) {
      const t = timeSeconds(n);
      const w = worldSize(n);
      if (!(t > prevTime)) timeStrictlyIncreasing = false;
      if (!(w >= prevWorld)) worldNonDecreasing = false;
      prevTime = t;
      prevWorld = w;
    }
    check('timeSeconds(n) strictly increasing across n=1..100', timeStrictlyIncreasing);
    check('worldSize(n) non-decreasing across n=1..100', worldNonDecreasing);
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
      const reachable = reachableMassFraction(n) * d.stats.totalBaseMass;
      reach.push(`n=${n}:${(reachable / 1000).toFixed(2)}x`);
      if (reachable < 1.5 * 1000) invariant1 = false;
    }
    check(`invariant 1: reachable base mass >= 1.5x target at n in {${sampleNs.join(',')}} [${reach.join(' ')}]`, invariant1);

    // game-design.md §2 acceptance: >=5 edible props at spawn on level 1
    // (avatar r=26, size gate 0.78 => edible radius <= 20.28).
    const d1 = generateDistrict(generateLevel(1));
    const edibleAtSpawn = d1.props.filter((p) => Math.hypot(p.x, p.z) <= 130 && p.radius <= 26 * 0.78).length;
    check('level 1 spawn area shows >=5 edible props', edibleAtSpawn >= 5);

    // Goldens are seeded into the descriptor (1 base, 2 from L46).
    check('golden props are placed per the cadence (L1: 1, L46: 2)',
      d1.props.filter((p) => p.golden).length === 1
        && generateDistrict(generateLevel(46)).props.filter((p) => p.golden).length === 2);

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

    // massGained: edibleClose contributes 10*5*1=50; goldenObj contributes 10*5*1*8=400.
    const expectedMass1 = 10 * 5 * 1 + 10 * 5 * 1 * GOLDEN_BONUS_MULTIPLIER;
    check('massGained matches mass*itemValueMultiplier*comboMult, doubled 8x for golden', approxEqual(result1.massGained, expectedMass1));

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
    check('mult() is read exactly once per checkSwallow call, not once per eaten object', comboMultReads === 1);
    check('all objects eaten within one call use that single start-of-frame multiplier', approxEqual(resultMulti.massGained, (4 + 6 + 8) * 3));

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

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
