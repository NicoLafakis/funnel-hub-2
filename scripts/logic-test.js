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
    let rivalZeroForTutorial = true;
    for (let n = 1; n <= 5; n += 1) if (rivalCount(n) !== 0) rivalZeroForTutorial = false;
    check('rivalCount(n) === 0 for n<=5', rivalZeroForTutorial);

    let rivalAtLeastOneFirstContest = true;
    for (let n = 6; n <= 10; n += 1) if (!(rivalCount(n) >= 1)) rivalAtLeastOneFirstContest = false;
    check('rivalCount(n) >= 1 for 6<=n<=10', rivalAtLeastOneFirstContest);

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
    check('14 achievement keys present', keys.length === 14);
    const expectedKeys = [
      'first', 'combo10', 'combo25', 'gold', 'rival', 'fast', 'storm', 'god', 'unsub', 'breeze', 'win',
      'metroCleared', 'centurion', 'hoarder',
    ];
    check('achievement keys match the expected 14 (11 original + metroCleared/centurion/hoarder)', expectedKeys.every((k) => keys.includes(k)));

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
      Audio.comboUp(4);
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
