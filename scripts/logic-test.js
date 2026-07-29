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
  const citylayoutMod = await import('../src/content/citylayout.js');
  const metropropsMod = await import('../src/content/metroprops.js');
  const artManifestMod = await import('../src/content/artmanifest.js');
  const collectionMod = await import('../src/meta/collection.js');
  const debrisMod = await import('../src/systems/debris.js');
  const audioMod = await import('../src/systems/audio.js');
  const comboMod = await import('../src/systems/combo.js');
  const achMod = await import('../src/systems/achievements.js');
  const swallowMod = await import('../src/systems/swallow.js');
  const saveMod = await import('../src/meta/save.js');
  const upgradesMod = await import('../src/meta/upgrades.js');
  const skinsMod = await import('../src/meta/skins.js');
  const avatarMod = await import('../src/engine/avatar.js');
  const sceneMod = await import('../src/engine/scene.js');
  const mainMod = await import('../src/main.js');
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

    // id/name/landmarkType are a hard contract (src/content/landmarks.js
    // switches on landmarkType by exact string, src/meta/worldmap.js and the
    // save file key off chapter order). Pin the exact triples IN ORDER so any
    // rename or reorder fails here rather than silently at runtime.
    const CONTRACT = [
      ['harbor-metropolis', 'Harbor Metropolis', 'liberty-statue'],
      ['vieux-continent', 'Le Vieux Continent', 'lattice-tower'],
      ['old-fog-town', 'Old Fog Town', 'clock-tower'],
      ['neon-district', 'Neon District', 'sky-tower'],
      ['desert-spires', 'Desert Spires', 'mega-spire'],
      ['coliseum-city', 'Coliseum City', 'amphitheater'],
      ['carnival-coast', 'Carnival Coast', 'mountain-statue'],
      ['red-square-heights', 'Red Square Heights', 'onion-palace'],
      ['harbor-opera-bay', 'Harbor Opera Bay', 'sail-opera'],
      ['capital-prime', 'Capital Prime', 'portal-tower'],
    ];
    check(
      'metro id/name/landmarkType triples are unchanged and in the contracted order',
      METROS.length === CONTRACT.length
        && CONTRACT.every(([id, name, lt], i) => (
          METROS[i].id === id && METROS[i].name === name && METROS[i].landmarkType === lt
        ))
    );
  }

  // ---------------------------------------------------------------------
  console.log('ATMOSPHERE (per-metro sky/fog/light/bloom):');
  {
    const { atmosphereFor, DEFAULT_ATMOSPHERE } = metrosMod;
    const HEX = /^#[0-9a-fA-F]{6}$/;

    check('every metro declares an atmosphere block', METROS.every((m) => m.atmosphere && typeof m.atmosphere === 'object'));

    const resolved = METROS.map((m) => atmosphereFor(m));

    // Full structural validity of the resolved form — this is what
    // engine.applyAtmosphere() consumes without any further branching, so every
    // field must be concrete.
    function directionValid(d) {
      return d && Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.z)
        && Math.hypot(d.x, d.y, d.z) > 0;
    }
    function lightValid(l) {
      return l && HEX.test(l.color) && Number.isFinite(l.intensity) && l.intensity >= 0 && directionValid(l.direction);
    }
    check(
      'atmosphereFor() resolves every metro to concrete sky/fog/ambient/sun/fill/bloom values',
      resolved.every((a) => (
        typeof a.timeOfDay === 'string' && a.timeOfDay.length > 0
        && typeof a.label === 'string' && a.label.length > 0
        && HEX.test(a.sky)
        && HEX.test(a.fog.color)
        && Number.isFinite(a.fog.near) && Number.isFinite(a.fog.far) && a.fog.far > a.fog.near && a.fog.near >= 0
        && HEX.test(a.ambient.color) && Number.isFinite(a.ambient.intensity) && a.ambient.intensity >= 0
        && lightValid(a.sun) && lightValid(a.fill)
        && Number.isFinite(a.bloom.strength) && a.bloom.strength >= 0
        && a.bloom.radius >= 0 && a.bloom.radius <= 1
        && a.bloom.threshold >= 0 && a.bloom.threshold <= 1
      ))
    );

    // The whole point of the feature: no two metros may look alike.
    check('all 10 metros have distinct sky colors', new Set(resolved.map((a) => a.sky)).size === 10);
    check(
      'all 10 metros have a distinct lighting signature (sun color+intensity+ambient intensity)',
      new Set(resolved.map((a) => `${a.sun.color}|${a.sun.intensity}|${a.ambient.color}|${a.ambient.intensity}`)).size === 10
    );

    // Authored-intent checks: the specific places/times the metros are meant to
    // read as. Relative luminance of the sky, 0..1.
    function lum(hex) {
      const n = parseInt(hex.slice(1), 16);
      return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    }
    const by = Object.fromEntries(METROS.map((m, i) => [m.id, resolved[i]]));

    check(
      'Neon District reads as night: near-black sky, weak sun, hard bloom',
      by['neon-district'].timeOfDay === 'night'
        && lum(by['neon-district'].sky) < 0.1
        && by['neon-district'].sun.intensity < 0.4
        && by['neon-district'].bloom.strength > 1
        && by['neon-district'].fill.intensity > 0
    );
    check(
      'Capital Prime reads as sci-fi dusk: dark violet sky, cyan rim light, hard bloom, dense haze',
      by['capital-prime'].timeOfDay === 'dusk'
        && lum(by['capital-prime'].sky) < 0.15
        && by['capital-prime'].fill.intensity > 0
        && by['capital-prime'].bloom.strength > 1
        && by['capital-prime'].fog.far < 0.7
    );
    check(
      'Old Fog Town reads as overcast: heaviest fog, sun barely present, near-zero bloom',
      by['old-fog-town'].timeOfDay === 'overcast'
        && by['old-fog-town'].sun.intensity < 0.25
        && by['old-fog-town'].ambient.intensity > 0.8
        && by['old-fog-town'].fog.far === Math.min(...resolved.map((a) => a.fog.far))
        && by['old-fog-town'].bloom.strength < 0.2
    );
    check(
      'Desert Spires reads as high noon: brightest, whitest, most overhead sun',
      by['desert-spires'].sun.intensity === Math.max(...resolved.map((a) => a.sun.intensity))
        && by['desert-spires'].sun.color === '#ffffff'
        && by['desert-spires'].sun.direction.y / Math.hypot(
          by['desert-spires'].sun.direction.x,
          by['desert-spires'].sun.direction.y,
          by['desert-spires'].sun.direction.z
        ) > 0.95
    );
    check(
      'Le Vieux Continent reads as golden hour: lowest sun angle in the game',
      by['vieux-continent'].timeOfDay === 'golden-hour'
        && resolved.every((a) => {
          const d = a.sun.direction;
          const gy = by['vieux-continent'].sun.direction;
          const norm = (v) => v.y / Math.hypot(v.x, v.y, v.z);
          return norm(gy) <= norm(d) + 1e-9;
        })
    );
    check(
      'Harbor Opera Bay reads as clear high-key morning: clearest air (fog starts latest)',
      by['harbor-opera-bay'].fog.near === Math.max(...resolved.map((a) => a.fog.near))
        && by['harbor-opera-bay'].sun.direction.x < 0
    );
    check(
      'night/dusk metros bloom hard while overcast metros barely bloom',
      Math.min(by['neon-district'].bloom.strength, by['capital-prime'].bloom.strength)
        > Math.max(by['old-fog-town'].bloom.strength, by['red-square-heights'].bloom.strength)
    );

    // Fog must agree with the sky — a mismatched fog color is the classic tell.
    // Allow a small deliberate nudge (each channel within 40/255).
    check(
      'every metro fog color stays visually locked to its sky color',
      resolved.every((a) => {
        const s = parseInt(a.sky.slice(1), 16);
        const f = parseInt(a.fog.color.slice(1), 16);
        return [16, 8, 0].every((sh) => Math.abs(((s >> sh) & 255) - ((f >> sh) & 255)) <= 40);
      })
    );

    // Defaults: a metro with no atmosphere data must render exactly as the game
    // did before atmospheres existed.
    {
      const bare = atmosphereFor({ sky: '#123456' });
      check(
        'a metro with no atmosphere block falls back to the pre-atmosphere render',
        bare.sky === '#123456'
          && bare.fog.color === '#123456' // fog defaults to the sky color
          && bare.fog.near === 0.18 && bare.fog.far === 0.95
          && bare.ambient.color === '#ffffff' && bare.ambient.intensity === 0.55
          && bare.sun.color === '#ffffff' && bare.sun.intensity === 0.9
          && bare.sun.direction.x === 120 && bare.sun.direction.y === 220 && bare.sun.direction.z === 80
          && bare.fill.intensity === 0
          && bare.bloom.strength === 0 // bloom chain fully off
      );
      check('DEFAULT_ATMOSPHERE is exported for reference', !!DEFAULT_ATMOSPHERE && DEFAULT_ATMOSPHERE.ambient.intensity === 0.55);
      check(
        'atmosphereFor() tolerates garbage input without throwing or emitting NaN',
        (() => {
          const junk = atmosphereFor({ atmosphere: { sky: 42, fog: { near: 'x', far: null }, sun: { intensity: -5, direction: { x: 0, y: 0, z: 0 } }, bloom: { radius: 99 } } });
          return junk.sky === '#8fb8d9'
            && junk.fog.near === 0.18 && junk.fog.far === 0.95
            && junk.sun.intensity === 0
            && Math.hypot(junk.sun.direction.x, junk.sun.direction.y, junk.sun.direction.z) > 0
            && junk.bloom.radius === 1;
        })()
      );
      check(
        'a fog range with far <= near is repaired rather than passed through',
        atmosphereFor({ atmosphere: { fog: { near: 0.8, far: 0.2 } } }).fog.far > 0.8
      );
    }
  }

  // ---------------------------------------------------------------------
  console.log('SELECTIVE BLOOM (emissive marking, no GL context):');
  {
    const { BLOOM_LAYER, BLOOM_EMISSIVE_MIN, markBloomEmissive } = sceneMod;

    check('BLOOM_LAYER is a real, non-default three.js layer', BLOOM_LAYER === 1);

    function onBloomLayer(node) {
      return node.layers.isEnabled(BLOOM_LAYER);
    }
    function countOnBloomLayer(root) {
      let n = 0;
      root.traverse((node) => { if (node.isMesh && onBloomLayer(node)) n += 1; });
      return n;
    }

    // The avatar: emissive purple core + additive-blended rim shell. Both must
    // glow, in every metro, and it must still render normally (layer 0 intact).
    const fakeScene = { add() {} };
    const av = avatarMod.createAvatar(fakeScene, THREE);
    const avMarked = markBloomEmissive(av.object3D, THREE);
    check('avatar core + additive rim are both marked for bloom', avMarked === 2);
    check(
      'bloom marking is additive — marked meshes still render on the default layer',
      (() => {
        let ok = true;
        av.object3D.traverse((n) => { if (n.isMesh && !n.layers.isEnabled(0)) ok = false; });
        return ok;
      })()
    );

    // The "don't turn white buildings into blobs" line, measured against real
    // content rather than a mock.
    const trash = propkit.createPropMesh('trash', THREE, '#8fb8d9');
    check('a plain non-emissive prop (trash) is not marked at all', markBloomEmissive(trash, THREE) === 0);

    const streetlight = propkit.createPropMesh('streetlight', THREE, '#8fb8d9');
    markBloomEmissive(streetlight, THREE);
    check('a streetlight marks its lamp head only, not its pole/arm', countOnBloomLayer(streetlight) === 1);

    const office = propkit.createPropMesh('office', THREE, '#8fb8d9');
    const officeMeshes = (() => { let n = 0; office.traverse((x) => { if (x.isMesh) n += 1; }); return n; })();
    markBloomEmissive(office, THREE);
    const officeBloomed = countOnBloomLayer(office);
    check(
      'an office tower glows only at its rooftop beacon — its lit window bands stay out of the bloom buffer',
      officeBloomed >= 1 && officeBloomed < officeMeshes && officeBloomed <= 2
    );

    const portal = landmarks.createLandmark('portal-tower', THREE, '#7a5cff');
    check('the Capital Prime portal landmark has emissive geometry that blooms', markBloomEmissive(portal, THREE) > 0);

    // Threshold calibration: window bands (0.12-0.25) out, signage (>=0.6) in.
    {
      function meshWith(matOpts) {
        return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(matOpts));
      }
      const windowBand = meshWith({ color: 0x8899aa, emissive: 0xffe9a8, emissiveIntensity: 0.25 });
      const neonSign = meshWith({ color: 0xff2e93, emissive: 0xff2e93, emissiveIntensity: 1.2 });
      const blackEmissive = meshWith({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 3 });
      check('a lit window band (emissiveIntensity 0.25) is NOT marked', markBloomEmissive(windowBand, THREE) === 0);
      check('a neon sign (emissiveIntensity 1.2) IS marked', markBloomEmissive(neonSign, THREE) === 1);
      check('a black emissive at high intensity is NOT marked (nothing to glow)', markBloomEmissive(blackEmissive, THREE) === 0);
      check('BLOOM_EMISSIVE_MIN sits between the window band and the sign', BLOOM_EMISSIVE_MIN > 0.25 && BLOOM_EMISSIVE_MIN < 1.2);

      // Explicit opt-in/opt-out escape hatch, so content modules can force the
      // decision without depending on the heuristic.
      const forcedIn = meshWith({ color: 0x222222 });
      forcedIn.userData.bloom = true;
      const forcedOut = meshWith({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
      forcedOut.userData.bloom = false;
      check('userData.bloom === true forces a non-emissive mesh into the bloom buffer', markBloomEmissive(forcedIn, THREE) === 1);
      check('userData.bloom === false keeps a bright emissive mesh out of the bloom buffer', markBloomEmissive(forcedOut, THREE) === 0);
    }

    check(
      'markBloomEmissive is a safe no-op on null/garbage roots',
      markBloomEmissive(null, THREE) === 0 && markBloomEmissive({}, THREE) === 0
    );
    check('markBloomEmissive works without a THREE instance (additive constant fallback)', markBloomEmissive(propkit.createPropMesh('streetlight', THREE, '#fff')) === 1);
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
  console.log('SKINS (registry integrity, unlock conditions, persistence):');
  {
    const {
      SKINS, SKIN_IDS, DEFAULT_SKIN_ID, SKIN_UNLOCK_TYPES, MILESTONE_METRICS,
      getSkin, hasSkin, skinPrice, progressSnapshot, isUnlockSatisfied,
      normalizeOwnedSkins, resolveEquippedSkinId, evaluateSkinUnlocks, describeUnlock,
    } = skinsMod;
    const { BLOOM_EMISSIVE_MIN } = sceneMod;

    function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
    function validShell(s) {
      return !!s && isFiniteNum(s.radius) && s.radius > 0
        && isFiniteNum(s.widthSegments) && s.widthSegments >= 3
        && isFiniteNum(s.heightSegments) && s.heightSegments >= 2
        && isFiniteNum(s.color) && isFiniteNum(s.opacity)
        && typeof s.wireframe === 'boolean' && typeof s.additive === 'boolean'
        && isFiniteNum(s.spinY) && isFiniteNum(s.spinX);
    }

    let registryValid = true;
    for (const id of SKIN_IDS) {
      const s = SKINS[id];
      const coreOk = !!s.core && isFiniteNum(s.core.color) && isFiniteNum(s.core.emissive)
        && isFiniteNum(s.core.emissiveIntensity) && isFiniteNum(s.core.roughness)
        && isFiniteNum(s.core.metalness) && isFiniteNum(s.core.widthSegments) && isFiniteNum(s.core.heightSegments);
      const metaOk = s.id === id && typeof s.name === 'string' && s.name.length > 0
        && typeof s.description === 'string' && s.description.length > 0
        && typeof s.icon === 'string' && s.icon.length > 0
        && !!s.unlock && SKIN_UNLOCK_TYPES.includes(s.unlock.type);
      const coronaOk = s.corona === null || validShell(s.corona);
      if (!(coreOk && metaOk && validShell(s.rim) && coronaOk)) registryValid = false;
    }
    check(`every skin (${SKIN_IDS.length}) has a complete, well-typed core/rim/corona recipe and a valid unlock`, registryValid);

    check(
      'the default skin exists, is keyed DEFAULT_SKIN_ID, and unlocks by type "default"',
      hasSkin(DEFAULT_SKIN_ID) && SKINS[DEFAULT_SKIN_ID].unlock.type === 'default'
        && SKIN_IDS.filter((id) => SKINS[id].unlock.type === 'default').length === 1
    );

    const byType = (t) => SKIN_IDS.filter((id) => SKINS[id].unlock.type === t);
    check(
      'all three earn-routes are represented (coins / achievement / milestone)',
      byType('coins').length >= 1 && byType('achievement').length >= 1 && byType('milestone').length >= 1
    );

    check(
      'every achievement-unlocked skin names a real key in systems/achievements.js ACH',
      byType('achievement').every((id) => Object.prototype.hasOwnProperty.call(achMod.ACH, SKINS[id].unlock.achievementId))
    );
    check(
      'every milestone-unlocked skin uses a known metric and a positive threshold',
      byType('milestone').every((id) => MILESTONE_METRICS.includes(SKINS[id].unlock.metric) && SKINS[id].unlock.threshold > 0)
    );

    // Priced against src/meta/upgrades.js's 100/400/900/1600/2500 curve: a skin
    // must cost at least the cheapest upgrade tier and no more than the dearest,
    // so it reads as a real trade rather than free confetti or an unreachable wall.
    const minUpgradeCost = upgradesMod.cost('size', 0);
    const maxUpgradeCost = upgradesMod.cost('size', upgradesMod.MAX_TIER - 1);
    check(
      `coin-priced skins sit inside the upgrade-track cost band (${minUpgradeCost}-${maxUpgradeCost})`,
      byType('coins').every((id) => skinPrice(id) >= minUpgradeCost && skinPrice(id) <= maxUpgradeCost)
        && byType('coins').every((id) => skinPrice(id) != null)
    );
    check('skinPrice() is null for every non-coin skin', SKIN_IDS.every((id) => (SKINS[id].unlock.type === 'coins') === (skinPrice(id) != null)));

    // Resolver: this is the whole legacy/corrupt-save safety net.
    check(
      'getSkin() falls back to the default skin for unknown / missing / corrupt ids',
      getSkin('nope-not-a-skin').id === DEFAULT_SKIN_ID
        && getSkin(undefined).id === DEFAULT_SKIN_ID
        && getSkin(null).id === DEFAULT_SKIN_ID
        && getSkin(42).id === DEFAULT_SKIN_ID
        && getSkin({}).id === DEFAULT_SKIN_ID
        && getSkin('void').id === 'void'
    );

    // Bloom authoring (src/engine/scene.js selective-bloom rules).
    const voidSkin = SKINS.void;
    check(
      'Void is authored BELOW the bloom threshold and non-additive, so it genuinely never blooms',
      voidSkin.core.emissiveIntensity < BLOOM_EMISSIVE_MIN && voidSkin.rim.additive === false && voidSkin.corona === null
    );
    check(
      'Supernova is authored well above the bloom threshold and is the brightest core in the set',
      SKINS.supernova.core.emissiveIntensity >= BLOOM_EMISSIVE_MIN * 2
        && SKIN_IDS.every((id) => SKINS[id].core.emissiveIntensity <= SKINS.supernova.core.emissiveIntensity)
    );
    check(
      'every non-Void skin still reaches the bloom buffer (bright core or additive rim)',
      SKIN_IDS.filter((id) => id !== 'void')
        .every((id) => SKINS[id].core.emissiveIntensity >= BLOOM_EMISSIVE_MIN || SKINS[id].rim.additive)
    );

    // Gameplay-size guard: the core sphere's radius is a constant in avatar.js,
    // NOT a skin field, so no skin can make the avatar look bigger or smaller
    // than the radius it actually swallows with.
    check(
      'no skin recipe exposes a core radius (avatar core size is not skinnable)',
      SKIN_IDS.every((id) => !('radius' in SKINS[id].core))
    );

    // --- unlock-condition evaluation ---
    const sampleSave = {
      coins: 500,
      stars: { 1: 3, 2: 2, 3: 0 },
      collection: { trash: {}, bike: {}, car: {} },
      achievements: ['first', 'combo25'],
      bestCombo: 27,
    };
    const snap = progressSnapshot(sampleSave);
    check(
      'progressSnapshot() derives stars/levels/collection/combo from a save shape',
      snap.totalStars === 5 && snap.levelsCleared === 2 && snap.collectionEntries === 3 && snap.bestCombo === 27
    );
    check('progressSnapshot() survives a null/garbage save without throwing', progressSnapshot(null).totalStars === 0 && progressSnapshot(7).collectionEntries === 0);

    const voidId = byType('achievement')[0];
    const voidAch = SKINS[voidId].unlock.achievementId;
    check(
      'an achievement-unlocked skin flips from locked to unlocked exactly when its achievement lands',
      isUnlockSatisfied(voidId, progressSnapshot({ achievements: [] })) === false
        && isUnlockSatisfied(voidId, progressSnapshot({ achievements: [voidAch] })) === true
    );

    const mileId = byType('milestone')[0];
    const mileUnlock = SKINS[mileId].unlock;
    check(
      'a milestone-unlocked skin flips exactly at its threshold, not before',
      isUnlockSatisfied(mileId, { [mileUnlock.metric]: mileUnlock.threshold - 1 }) === false
        && isUnlockSatisfied(mileId, { [mileUnlock.metric]: mileUnlock.threshold }) === true
    );

    check(
      'evaluateSkinUnlocks() never auto-grants a coin-priced skin, however far progress goes',
      (() => {
        const maxed = { achievements: Object.keys(achMod.ACH), stars: {}, collection: {}, bestCombo: 999 };
        for (let i = 0; i < 200; i += 1) { maxed.stars[i] = 3; maxed.collection[`k${i}`] = {}; }
        const { owned } = evaluateSkinUnlocks(maxed, [DEFAULT_SKIN_ID]);
        return byType('coins').every((id) => !owned.includes(id)) && byType('achievement').every((id) => owned.includes(id));
      })()
    );
    check(
      'evaluateSkinUnlocks() is idempotent (a second pass reports nothing new)',
      (() => {
        const save = { achievements: [voidAch] };
        const first = evaluateSkinUnlocks(save, [DEFAULT_SKIN_ID]);
        const second = evaluateSkinUnlocks(save, first.owned);
        return first.newlyUnlocked.length === 1 && second.newlyUnlocked.length === 0;
      })()
    );

    check(
      'normalizeOwnedSkins() drops junk + duplicates and always keeps the default skin',
      (() => {
        const out = normalizeOwnedSkins(['void', 'void', 'not-real', 42, null, 'supernova']);
        return out[0] === DEFAULT_SKIN_ID && out.length === 3 && out.includes('void') && out.includes('supernova');
      })() && normalizeOwnedSkins(null).length === 1 && normalizeOwnedSkins('nope')[0] === DEFAULT_SKIN_ID
    );
    check(
      'resolveEquippedSkinId() refuses unknown and unowned ids, falling back to the default',
      resolveEquippedSkinId('supernova', ['default', 'supernova']) === 'supernova'
        && resolveEquippedSkinId('supernova', ['default']) === DEFAULT_SKIN_ID
        && resolveEquippedSkinId('ghost-skin', ['default', 'ghost-skin']) === DEFAULT_SKIN_ID
        && resolveEquippedSkinId(undefined, undefined) === DEFAULT_SKIN_ID
    );
    check(
      'describeUnlock() tells a locked skin\'s story (price / achievement / live milestone progress)',
      describeUnlock(byType('coins')[0]).includes(String(skinPrice(byType('coins')[0])))
        && describeUnlock(voidId).length > 0
        && describeUnlock(mileId, { [mileUnlock.metric]: 4 }).includes(`4/${mileUnlock.threshold}`)
    );

    // --- persistence (in-memory fallback: localStorage was removed above) ---
    const fresh = saveMod.defaultSave();
    check(
      'a brand-new save owns exactly the default skin and has it equipped',
      Array.isArray(fresh.ownedSkins) && fresh.ownedSkins.length === 1
        && fresh.ownedSkins[0] === DEFAULT_SKIN_ID && fresh.equippedSkin === DEFAULT_SKIN_ID
    );

    // A save written BEFORE this change: no ownedSkins/equippedSkin keys at all.
    const legacy = saveMod.saveSave({
      coins: 3210,
      stars: { 5: 3, 6: 2 },
      upgrades: { size: 4, speed: 2, magnet: 1, time: 3, growth: 5 },
      unlockedLevel: 37,
      collection: { trash: { count: 9, firstSeenAt: 1 } },
      achievements: ['first', 'gold'],
      bestCombo: 18,
    });
    const legacyLoaded = saveMod.loadSave();
    check(
      'a legacy (pre-skins) save loads with ALL its progress intact — nothing wiped',
      legacyLoaded.coins === 3210 && legacyLoaded.unlockedLevel === 37 && legacyLoaded.upgrades.growth === 5
        && legacyLoaded.stars['5'] === 3 && legacyLoaded.collection.trash.count === 9
        && legacyLoaded.achievements.includes('gold') && legacyLoaded.bestCombo === 18
    );
    check(
      'a legacy save ends up owning + wearing the default skin (no undefined, no crash)',
      legacy.equippedSkin === DEFAULT_SKIN_ID && legacyLoaded.equippedSkin === DEFAULT_SKIN_ID
        && legacyLoaded.ownedSkins.length === 1 && legacyLoaded.ownedSkins[0] === DEFAULT_SKIN_ID
        && getSkin(legacyLoaded.equippedSkin).id === DEFAULT_SKIN_ID
    );

    const corrupt = saveMod.saveSave({ coins: 5, ownedSkins: 'supernova', equippedSkin: 99 });
    check(
      'a corrupt skins block normalizes to the default skin without losing the rest of the save',
      corrupt.coins === 5 && corrupt.equippedSkin === DEFAULT_SKIN_ID
        && corrupt.ownedSkins.length === 1 && corrupt.ownedSkins[0] === DEFAULT_SKIN_ID
    );

    const withSkins = saveMod.loadSave();
    withSkins.ownedSkins = ['default', 'supernova', 'void'];
    withSkins.equippedSkin = 'supernova';
    saveMod.saveSave(withSkins);
    const reloadedSkins = saveMod.loadSave();
    check(
      'owned-skins set and equipped skin round-trip through save/load',
      reloadedSkins.equippedSkin === 'supernova'
        && reloadedSkins.ownedSkins.length === 3
        && reloadedSkins.ownedSkins.includes('void')
        && resolveEquippedSkinId(reloadedSkins.equippedSkin, reloadedSkins.ownedSkins) === 'supernova'
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
  console.log('CITY LAYOUT (level-1 authored city):');
  {
    const { generateCityLayout } = citylayoutMod;
    const level1 = generateLevel(1);
    const layout = generateCityLayout(level1);

    // Determinism: same level in -> byte-identical layout out.
    const again = generateCityLayout(generateLevel(1));
    check('generateCityLayout is deterministic (seeded, reproducible)', JSON.stringify(layout) === JSON.stringify(again));

    // Gameplay contract: the template's 7 tiers keep their exact counts —
    // building-medium spawns as 'apartment' meshes, building-large as
    // 'office' meshes (the layout's skin swap, per its header comment).
    const counts = {};
    layout.props.forEach((p) => { counts[p.kind] = (counts[p.kind] || 0) + 1; });
    const expectedCounts = {
      trash: 126, bike: 90, car: 60, bus: 42, 'building-small': 27, apartment: 15, office: 9,
    };
    check(
      'template tier counts preserved (building-medium->apartment, building-large->office)',
      Object.entries(expectedCounts).every(([k, c]) => counts[k] === c)
    );

    // Template mass preserved through the skin swap.
    const TEMPLATE_DERIVED = ['trash', 'bike', 'car', 'bus', 'building-small', 'apartment', 'office'];
    const layoutMass = layout.props
      .filter((p) => TEMPLATE_DERIVED.includes(p.kind))
      .reduce((sum, p) => sum + p.mass, 0);
    check('template base mass fully preserved in the layout', layoutMass === levelsMod.LEVEL_TEMPLATE_MASS_SUM);

    // Every prop finite, in-bounds, and with positive swallow stats.
    const half = level1.world / 2;
    check(
      'every laid-out prop is finite, in world bounds, with positive radius/mass',
      layout.props.every((p) => (
        Number.isFinite(p.x) && Number.isFinite(p.z)
        && Math.abs(p.x) <= half && Math.abs(p.z) <= half
        && p.radius > 0 && p.mass > 0
      ))
    );

    // The street furniture the level-1 city exists for is actually present.
    check(
      'street furniture kinds all present (tree/streetlight/bench/mailbox/hydrant/speed-bump)',
      ['tree', 'streetlight', 'bench', 'mailbox', 'hydrant', 'speed-bump'].every((k) => (counts[k] || 0) > 0)
    );

    // Buildings stand inside blocks, never on the roads.
    check(
      'every building stands inside a block rectangle (never on a road)',
      layout.props
        .filter((p) => ['building-small', 'apartment', 'office'].includes(p.kind))
        .every((p) => layout.blocks.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1))
    );

    // The new kinds build into valid meshes (same validity bar as the
    // template-kind check in SCENE GRAPH above).
    function isFiniteBox2(obj) {
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return false;
      const size = new THREE.Vector3();
      box.getSize(size);
      return Number.isFinite(size.x) && Number.isFinite(size.y) && Number.isFinite(size.z);
    }
    let cityMeshesValid = true;
    for (const kind of ['tree', 'streetlight', 'bench', 'mailbox', 'hydrant', 'speed-bump', 'apartment', 'office']) {
      const mesh = propkit.createPropMesh(kind, THREE, '#8fb8d9');
      let hasMesh = false;
      mesh.traverse((node) => { if (node.isMesh) hasMesh = true; });
      if (!(mesh instanceof THREE.Object3D) || !hasMesh || !isFiniteBox2(mesh)) cityMeshesValid = false;
    }
    check('createPropMesh returns valid meshes for all 8 city-layout kinds', cityMeshesValid);
  }

  // ---------------------------------------------------------------------
  console.log('METRO PROP VARIANTS (metro-first resolution, generic fallback):');
  {
    const { METRO_PROP_VARIANTS, hasMetroVariant, metroVariantKinds, createMetroVariantMesh } = metropropsMod;
    const { createPropMesh, SCALE_MODE, propKinds } = propkit;

    const metroIds = METROS.map((m) => m.id);
    const registeredIds = Object.keys(METRO_PROP_VARIANTS);
    const knownKinds = new Set(propKinds());

    check(
      'every registered variant metro id is a real metro from src/data/metros.js',
      registeredIds.every((id) => metroIds.includes(id))
    );
    check(
      'all 10 metros author variants (no metro is left generic)',
      metroIds.every((id) => metroVariantKinds(id).length > 0)
    );
    check(
      'every metro authors at least 3 distinct prop slots',
      metroIds.every((id) => metroVariantKinds(id).length >= 3)
    );
    check(
      'every variant slot is a real propkit kind (no typo silently dropping a variant)',
      registeredIds.every((id) => metroVariantKinds(id).every((k) => knownKinds.has(k)))
    );

    // Bounding box of a built prop, used for the scale-parity checks below.
    function sizeOf(obj) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      if (b.isEmpty()) return null;
      const s = new THREE.Vector3();
      b.getSize(s);
      return Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z) ? s : null;
    }
    // The dimension propkit's scaleForRadius() actually keys the prop's
    // on-screen size off (footprint for everything but poles).
    function scaleBasis(kind, size) {
      return SCALE_MODE[kind] === 'height' ? size.y : Math.max(size.x, size.z);
    }

    let allVariantsValid = true;
    let allScalesMatch = true;
    let allAspectsSane = true;
    let variantCount = 0;
    const scaleReport = [];
    for (const id of registeredIds) {
      for (const kind of metroVariantKinds(id)) {
        variantCount += 1;
        const variant = createPropMesh(kind, THREE, '#8fb8d9', id);
        let hasMesh = false;
        variant.traverse((n) => { if (n.isMesh) hasMesh = true; });
        const vSize = sizeOf(variant);
        if (!(variant instanceof THREE.Object3D) || !hasMesh || !vSize) {
          allVariantsValid = false;
          continue;
        }
        const generic = createPropMesh(kind, THREE, '#8fb8d9');
        const gSize = sizeOf(generic);
        const ratio = scaleBasis(kind, vSize) / scaleBasis(kind, gSize);
        if (!(ratio >= 0.65 && ratio <= 1.45)) {
          allScalesMatch = false;
          scaleReport.push(`${id}/${kind}:${ratio.toFixed(2)}`);
        }
        // Silhouette freedom is fine (a cypress is tall, a manhole is flat),
        // but a prop many times taller than it is wide is an authoring bug.
        if (vSize.y / Math.max(0.0001, Math.max(vSize.x, vSize.z)) > 8) {
          allAspectsSane = false;
          scaleReport.push(`${id}/${kind}:aspect`);
        }
      }
    }
    check(`${variantCount} authored metro variants all build a valid, finite, mesh-bearing Object3D`, allVariantsValid);
    check(
      `every variant renders at the same on-screen size as the prop it replaces (scale basis within 0.65-1.45x)${scaleReport.length ? ` [${scaleReport.join(' ')}]` : ''}`,
      allScalesMatch
    );
    check('no variant has an absurd height:footprint aspect (<= 8:1)', allAspectsSane);

    // ---- The fallback path: adding a variant for one metro must never change
    // the other nine, and an unknown metro must behave exactly like no metro.
    function shapeOf(obj) {
      const parts = [];
      obj.traverse((n) => { if (n.isMesh) parts.push(n.geometry.type); });
      return parts.join(',');
    }
    const genericBench = createPropMesh('bench', THREE, '#8fb8d9');

    check(
      'a metro with NO variant for a slot falls back to the exact generic prop',
      !hasMetroVariant('neon-district', 'bench')
        && shapeOf(createPropMesh('bench', THREE, '#8fb8d9', 'neon-district')) === shapeOf(genericBench)
    );
    check(
      'an unknown metro id falls back to the generic prop rather than throwing',
      shapeOf(createPropMesh('bench', THREE, '#8fb8d9', 'atlantis')) === shapeOf(genericBench)
        && shapeOf(createPropMesh('car', THREE, '#8fb8d9', 'atlantis')) === shapeOf(createPropMesh('car', THREE, '#8fb8d9'))
    );
    check(
      'the 3-argument createPropMesh signature is unchanged (no metro arg = generic prop)',
      propKinds().every((k) => shapeOf(createPropMesh(k, THREE, '#8fb8d9'))
        === shapeOf(createPropMesh(k, THREE, '#8fb8d9', undefined)))
    );
    check(
      'a metro variant IS actually different geometry from the generic prop it replaces',
      shapeOf(createPropMesh('car', THREE, '#8fb8d9', 'harbor-metropolis')) !== shapeOf(createPropMesh('car', THREE, '#8fb8d9'))
        && shapeOf(createPropMesh('tree', THREE, '#8fb8d9', 'desert-spires')) !== shapeOf(createPropMesh('tree', THREE, '#8fb8d9'))
    );
    check(
      'hasMetroVariant / metroVariantKinds agree with the registry',
      hasMetroVariant('neon-district', 'trash') === true
        && hasMetroVariant('neon-district', 'office') === false
        && hasMetroVariant('atlantis', 'trash') === false
        && metroVariantKinds('atlantis').length === 0
    );

    // A builder that throws must cost that prop its flavor, not take the level
    // build down — createPropMesh has to fall through to the generic prop.
    {
      METRO_PROP_VARIANTS['test-broken-metro'] = { bench: [() => { throw new Error('boom'); }] };
      let threw = false;
      let fellBack = false;
      try {
        fellBack = shapeOf(createPropMesh('bench', THREE, '#8fb8d9', 'test-broken-metro')) === shapeOf(genericBench);
      } catch (e) {
        threw = true;
      }
      delete METRO_PROP_VARIANTS['test-broken-metro'];
      check('a throwing variant builder falls back to the generic prop instead of crashing', !threw && fellBack);
    }
    check(
      'createMetroVariantMesh returns null (the fall-through signal) for unknown metro/kind or missing ctx',
      createMetroVariantMesh('atlantis', 'trash', THREE, {}) === null
        && createMetroVariantMesh('neon-district', 'office', THREE, {}) === null
        && createMetroVariantMesh('neon-district', 'trash', THREE, null) === null
    );

    // Glow: the night metros' variants must land in the selective-bloom buffer
    // (scene.js markBloomEmissive), the overcast metro's mostly must not.
    {
      const { markBloomEmissive } = sceneMod;
      const neonSign = createPropMesh('streetlight', THREE, '#ff2e93', 'neon-district');
      const holoPylon = createPropMesh('building-small', THREE, '#7a5cff', 'capital-prime');
      const stoneBench = createPropMesh('bench', THREE, '#c1440e', 'coliseum-city');
      check(
        'neon/sci-fi variants (signboard pole, holo ad pylon) glow via the bloom pass',
        markBloomEmissive(neonSign, THREE) >= 3 && markBloomEmissive(holoPylon, THREE) >= 3
      );
      check('a daylight stone variant (Roman bench) stays out of the bloom buffer', markBloomEmissive(stoneBench, THREE) === 0);
    }

    // The economy is untouched: swallow radius/mass come from the level
    // template and city layout, neither of which knows a metro variant exists.
    check(
      'variants cannot move the tier/mass economy (template + layout mass identical for every metro)',
      (() => {
        const sums = METROS.map((m, i) => {
          const lvl = generateLevel(i * 10 + 1);
          return lvl.template.reduce((s, t) => s + t.baseMass * t.baseCount, 0);
        });
        return new Set(sums).size === 1 && sums[0] === levelsMod.LEVEL_TEMPLATE_MASS_SUM;
      })()
    );
  }

  // ---------------------------------------------------------------------
  console.log('DEBRIS (pooled destruction FX, no GL context):');
  {
    const {
      createDebrisSystem, isDebrisWorthy, samplePropPalette,
      DEBRIS_TIER_MIN, DEFAULT_CAPACITY, MAX_PARTICLES_PER_BURST,
    } = debrisMod;

    check(
      'isDebrisWorthy fires for tier-5+ structures and capstones only',
      isDebrisWorthy({ kind: 'building-medium' })
        && isDebrisWorthy({ kind: 'building-large' })
        && isDebrisWorthy({ kind: 'apartment' })
        && isDebrisWorthy({ kind: 'office' })
        && isDebrisWorthy({ kind: 'liberty-statue', isCapstone: true })
        && isDebrisWorthy({ kind: 'anything', tierIndex: DEBRIS_TIER_MIN })
        && !isDebrisWorthy({ kind: 'trash' })
        && !isDebrisWorthy({ kind: 'car' })
        && !isDebrisWorthy({ kind: 'building-small' })
        && !isDebrisWorthy(null)
    );

    // Particle color must come from the swallowed prop's OWN materials.
    {
      const brick = propkit.createPropMesh('apartment', THREE, '#8fb8d9');
      const glass = propkit.createPropMesh('office', THREE, '#8fb8d9');
      const brickPalette = samplePropPalette(brick);
      const glassPalette = samplePropPalette(glass);
      check(
        'debris color is sampled from the prop: brick shatters warm, glass shatters cool',
        brickPalette.length > 0 && glassPalette.length > 0
          && brickPalette[0].r > brickPalette[0].b
          && glassPalette[0].b > glassPalette[0].r
      );
      check(
        'a shiny source is flagged glint (glass shards read brighter than matte brick)',
        glassPalette[0].glint === true && brickPalette[0].glint === false
      );
      check(
        'samplePropPalette dedupes shared materials, respects its cap, and is safe on garbage',
        samplePropPalette(brick, 2).length === 2
          && samplePropPalette(null).length === 0
          && samplePropPalette({}).length === 0
      );
    }

    // Deterministic RNG so particle behavior checks are reproducible.
    let seed = 7;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const parent = new THREE.Group();
    const sys = createDebrisSystem(THREE, { parent, capacity: 64, random: rng });
    const pool = sys.object3D;
    const matrixBytes = pool.instanceMatrix.array.length;

    check('debris pool attaches to its parent as a single InstancedMesh', pool.parent === parent && pool.isInstancedMesh === true);
    check('debris pool starts empty', sys.activeCount === 0 && pool.count === 0);

    const tower = propkit.createPropMesh('office', THREE, '#8fb8d9');
    const spawned = sys.burst({ object3D: tower, position: { x: 100, y: 0, z: -40 }, radius: 90 });
    check(
      'a big-structure swallow spawns a capped burst of live particles',
      spawned > 0 && spawned <= MAX_PARTICLES_PER_BURST && sys.activeCount === spawned
    );
    sys.update(0.016);
    check('update() compacts live particles into the instance buffer', pool.count === sys.activeCount && pool.count > 0);

    // Cap + recycling: 40 bursts is far more than the pool holds.
    for (let i = 0; i < 40; i += 1) {
      sys.burst({ object3D: tower, position: { x: i * 5, y: 0, z: 0 }, radius: 90, count: MAX_PARTICLES_PER_BURST });
    }
    check(
      'a long combo chain never exceeds the hard particle cap',
      sys.activeCount <= sys.capacity && pool.count <= sys.capacity
    );
    check('the pool is saturated (recycling, not dropping, once full)', sys.activeCount === sys.capacity);
    check(
      'no unbounded growth: particle records and GPU buffers are the same size after 40 bursts',
      sys.particles.length === sys.capacity && pool.instanceMatrix.array.length === matrixBytes
    );
    check(
      'the newest burst survives saturation (oldest particles are the ones recycled)',
      (() => {
        // Every particle now belongs to one of the last bursts; a FIFO ring
        // guarantees the most recent burst's spawn origin is represented.
        const lastX = 39 * 5;
        return sys.particles.some((p) => p.active && Math.abs(p.x - lastX) < 90);
      })()
    );

    // Physics: gravity pulls everything down, nothing sinks through the road,
    // and the pool fully drains — it can't silently leak live particles.
    let sank = false;
    for (let i = 0; i < 40; i += 1) {
      sys.update(0.05);
      for (const p of sys.particles) if (p.active && p.y < -0.001) sank = true;
    }
    check('debris falls under gravity and never sinks below the ground plane', !sank);
    check('every particle expires — the pool fully drains back to empty', sys.activeCount === 0 && pool.count === 0);

    // Reuse after draining: no allocation, same buffers.
    sys.burst({ object3D: tower, position: { x: 0, y: 0, z: 0 }, radius: 66 });
    check(
      'a drained pool is immediately reusable with the same buffers',
      sys.activeCount > 0 && pool.instanceMatrix.array.length === matrixBytes
    );

    // clear(): level teardown parks rubble without releasing anything.
    sys.clear();
    check('clear() parks all rubble but keeps the pool usable (level teardown path)', sys.activeCount === 0 && pool.count === 0);
    check('the pool still bursts after a clear() (nothing was disposed)', sys.burst({ position: { x: 0, y: 0, z: 0 }, radius: 48 }) > 0);

    check(
      'burst() tolerates a missing mesh / garbage source without throwing or spawning junk',
      sys.burst({ position: { x: 0, y: 0, z: 0 }, radius: 20 }) > 0
        && sys.burst({ position: { x: NaN, y: 0, z: 0 } }) === 0
        && sys.burst(null) === 0
    );

    // dispose(): full teardown, idempotent, inert afterwards.
    {
      let geoDisposed = false;
      let matDisposed = false;
      pool.geometry.addEventListener('dispose', () => { geoDisposed = true; });
      pool.material.addEventListener('dispose', () => { matDisposed = true; });
      sys.dispose();
      check(
        'dispose() releases geometry + material and detaches the pool (no leak across levels)',
        geoDisposed && matDisposed && pool.parent === null && sys.disposed === true
      );
      let threw = false;
      try {
        sys.dispose();
        sys.update(0.016);
        sys.burst({ position: { x: 0, y: 0, z: 0 }, radius: 40 });
      } catch (e) { threw = true; }
      check('dispose() is idempotent and the system is inert afterwards', !threw && sys.activeCount === 0);
    }

    check('DEFAULT_CAPACITY is a real ceiling, not unlimited', Number.isFinite(DEFAULT_CAPACITY) && DEFAULT_CAPACITY > 0);
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
  console.log('AVATAR SKINS (apply/swap without leaks, zero gameplay effect):');
  {
    const { SKINS, SKIN_IDS, DEFAULT_SKIN_ID } = skinsMod;
    const { markBloomEmissive, BLOOM_LAYER } = sceneMod;
    const fakeScene = { add() {} };
    const meshesOf = (av) => av.object3D.children.filter((c) => c.isMesh);

    // 1. The default skin must be BYTE-IDENTICAL to the pre-skins avatar.
    {
      const av = avatarMod.createAvatar(fakeScene, THREE);
      const [core, rim] = meshesOf(av);
      const okCore = core.material.isMeshStandardMaterial
        && core.material.color.getHex() === 0x120018
        && core.material.emissive.getHex() === 0x3a0a5c
        && core.material.emissiveIntensity === 0.85
        && core.material.roughness === 0.35
        && core.material.metalness === 0.15
        && core.geometry.parameters.radius === 1
        && core.geometry.parameters.widthSegments === 32
        && core.geometry.parameters.heightSegments === 24;
      const okRim = rim.material.isMeshBasicMaterial
        && rim.material.color.getHex() === 0x00a4bd
        && rim.material.wireframe === true
        && rim.material.transparent === true
        && rim.material.opacity === 0.55
        && rim.material.blending === THREE.AdditiveBlending
        && rim.material.depthWrite === false
        && rim.geometry.parameters.radius === 1.08
        && rim.geometry.parameters.widthSegments === 16
        && rim.geometry.parameters.heightSegments === 12;
      check('a brand-new avatar wears the default skin, byte-identical to the pre-skins look', okCore && okRim);
      check('the default skin stays allocation-identical to before: exactly 2 meshes', meshesOf(av).length === 2 && av.skinId === DEFAULT_SKIN_ID);
    }

    // 2. Swapping actually changes appearance, and reuses materials rather than
    //    replacing them (no material leak across a swap).
    {
      const av = avatarMod.createAvatar(fakeScene, THREE);
      const [core, rim] = meshesOf(av);
      const coreMat = core.material;
      const rimMat = rim.material;
      const beforeCore = coreMat.color.getHex();
      av.applySkin('supernova');
      check(
        'applySkin() restyles the avatar in place — same material instances, new values',
        core.material === coreMat && rim.material === rimMat
          && coreMat.color.getHex() !== beforeCore
          && coreMat.emissiveIntensity === SKINS.supernova.core.emissiveIntensity
          && rimMat.opacity === SKINS.supernova.rim.opacity
          && av.skinId === 'supernova'
      );
    }

    // 3. Geometry is only rebuilt when the tessellation actually changes, and
    //    the outgoing geometry is disposed when it is.
    {
      const av = avatarMod.createAvatar(fakeScene, THREE);
      const [core, rim] = meshesOf(av);
      const oldRimGeo = rim.geometry;
      const oldCoreGeo = core.geometry;
      let rimGeoDisposed = false;
      oldRimGeo.dispose = () => { rimGeoDisposed = true; };
      // 'cyber' shares the default's 32x24 core but changes the rim entirely.
      av.applySkin('cyber');
      check(
        'a skin swap disposes the replaced rim geometry and rebuilds it to the new spec',
        rimGeoDisposed && rim.geometry !== oldRimGeo
          && rim.geometry.parameters.radius === SKINS.cyber.rim.radius
          && rim.geometry.parameters.widthSegments === SKINS.cyber.rim.widthSegments
      );
      check(
        'a skin sharing the default core tessellation reuses the core geometry (zero allocation)',
        core.geometry === oldCoreGeo
      );
    }

    // 4. The optional corona layer: allocated lazily, disposed on the way out.
    {
      const av = avatarMod.createAvatar(fakeScene, THREE);
      check('default skin declares no corona, so no third mesh exists', meshesOf(av).length === 2);
      av.applySkin('supernova');
      const corona = meshesOf(av)[2];
      let coronaGeoDisposed = false;
      let coronaMatDisposed = false;
      check('a corona-bearing skin adds exactly one extra mesh', meshesOf(av).length === 3 && !!corona);
      corona.geometry.dispose = () => { coronaGeoDisposed = true; };
      corona.material.dispose = () => { coronaMatDisposed = true; };
      av.applySkin(DEFAULT_SKIN_ID);
      check(
        'swapping back to a corona-less skin removes AND disposes the corona (geometry + material)',
        meshesOf(av).length === 2 && coronaGeoDisposed && coronaMatDisposed
          && !av.object3D.children.includes(corona)
      );
    }

    // 5. THE INVARIANT: a skin is appearance only. Every gameplay number the
    //    avatar contract exposes must be identical under every skin.
    {
      const reference = avatarMod.createAvatar(fakeScene, THREE);
      reference.mass = 940;
      reference.massDivisor = 4;
      reference.radiusCap = 300;
      reference.speedMultiplier = 1.3;
      reference.setMoveInput(0.7, -0.4);
      reference.update(0.1);
      reference.update(0.1);

      let allIdentical = true;
      const offenders = [];
      for (const id of SKIN_IDS) {
        const av = avatarMod.createAvatar(fakeScene, THREE, { skin: id });
        av.mass = 940;
        av.massDivisor = 4;
        av.radiusCap = 300;
        av.speedMultiplier = 1.3;
        av.setMoveInput(0.7, -0.4);
        av.update(0.1);
        av.update(0.1);
        const same = av.radius() === reference.radius()
          && av.mass === reference.mass
          && av.massDivisor === reference.massDivisor
          && av.radiusCap === reference.radiusCap
          && av.speedMultiplier === reference.speedMultiplier
          && av.position.x === reference.position.x
          && av.position.z === reference.position.z
          && av.object3D.scale.x === reference.object3D.scale.x;
        if (!same) { allIdentical = false; offenders.push(id); }
      }
      check(`no skin alters a gameplay number (radius/mass/caps/speed/displacement/scale) [${SKIN_IDS.length} skins checked]`, allIdentical);
      if (offenders.length) console.log('   offending skins:', offenders.join(', '));

      // Same check across a RUNTIME swap, not just at construction.
      const swapped = avatarMod.createAvatar(fakeScene, THREE);
      swapped.mass = 940;
      swapped.massDivisor = 4;
      swapped.radiusCap = 300;
      swapped.speedMultiplier = 1.3;
      swapped.setMoveInput(0.7, -0.4);
      swapped.update(0.1);
      swapped.applySkin('void');
      swapped.applySkin('aurora');
      swapped.update(0.1);
      check(
        'swapping skins mid-run leaves position, scale and radius exactly where they were',
        swapped.radius() === reference.radius()
          && swapped.position.x === reference.position.x
          && swapped.position.z === reference.position.z
          && swapped.object3D.scale.x === reference.object3D.scale.x
      );
    }

    // 6. Bloom: the whole point of authoring intensities against
    //    BLOOM_EMISSIVE_MIN. applySkin resets render layers, so a swap AWAY
    //    from a glowing skin actually stops the glow.
    {
      const av = avatarMod.createAvatar(fakeScene, THREE, { skin: 'supernova' });
      check('Supernova marks all three of its layers for bloom', markBloomEmissive(av.object3D, THREE) === 3);
      av.applySkin('void');
      check(
        'equipping Void clears every bloom-layer flag and marks nothing new — it truly does not glow',
        markBloomEmissive(av.object3D, THREE) === 0
          && meshesOf(av).every((m) => !m.layers.isEnabled(BLOOM_LAYER) && m.layers.isEnabled(0))
      );
      av.applySkin(DEFAULT_SKIN_ID);
      check(
        'equipping a glowing skin again restores bloom marking (core + additive rim)',
        markBloomEmissive(av.object3D, THREE) === 2
      );
    }
  }

  // ---------------------------------------------------------------------
  console.log('STEERING (camera-relative input rotation):');
  {
    const { rotateAxesByYaw } = mainMod;
    const wAt0 = rotateAxesByYaw(0, -1, 0); // W key when camera looking +Z
    const dAt0 = rotateAxesByYaw(1, 0, 0);  // D key when camera looking +Z
    const aAt0 = rotateAxesByYaw(-1, 0, 0); // A key when camera looking +Z
    const sAt0 = rotateAxesByYaw(0, 1, 0);  // S key when camera looking +Z
    check('W key at yaw 0 maps to forward (+Z direction)', approxEqual(wAt0.dx, 0) && approxEqual(wAt0.dz, 1));
    check('D key at yaw 0 maps to right (+X direction)', approxEqual(dAt0.dx, 1) && approxEqual(dAt0.dz, 0));
    check('A key at yaw 0 maps to left (-X direction)', approxEqual(aAt0.dx, -1) && approxEqual(aAt0.dz, 0));
    check('S key at yaw 0 maps to backward (-Z direction)', approxEqual(sAt0.dx, 0) && approxEqual(sAt0.dz, -1));

    const wAt90 = rotateAxesByYaw(0, -1, Math.PI / 2); // W key when camera looking +X
    check('W key at 90deg yaw maps to forward (+X direction)', approxEqual(wAt90.dx, 1) && approxEqual(wAt90.dz, 0));
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
  console.log('ART MANIFEST (generated per-metro textures + UI icons):');
  {
    const fs = require('fs');
    const path = require('path');
    const root = path.resolve(__dirname, '..');
    const { TEXTURE_SLOTS, resolveMetroTextureSet, metroArtPath, iconPath } = artManifestMod;
    const { CITY_QUIPS } = collectionMod;
    const { ACH } = achMod;
    const { UPGRADE_KEYS } = upgradesMod;

    // 1. The manifest parses and its slot list matches the resolver's contract.
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'art-manifest.json'), 'utf8'));
    } catch (e) { /* checks below fail loudly */ }
    check(
      'art-manifest.json parses and textureSlots matches TEXTURE_SLOTS exactly',
      !!manifest && JSON.stringify(manifest.textureSlots) === JSON.stringify(TEXTURE_SLOTS)
    );

    const metroIds = METROS.map((m) => m.id);
    const manifestMetroIds = manifest ? Object.keys(manifest.metros || {}) : [];

    // 2. Every metro id in the manifest is a real metros.js id (no orphans).
    check(
      'every manifest metro id exists in METROS',
      manifestMetroIds.length > 0 && manifestMetroIds.every((id) => metroIds.includes(id))
    );

    // 3. Every referenced metro texture file exists on disk and is non-empty —
    // THE invariant that makes the fallback rule safe (a listed path is always
    // loadable, so only ABSENT entries ever need the generic fallback).
    {
      let allExist = manifestMetroIds.length > 0;
      for (const id of manifestMetroIds) {
        for (const slot of Object.keys(manifest.metros[id])) {
          const p = manifest.metros[id][slot];
          const abs = path.join(root, p);
          if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
            allExist = false;
            console.log('   missing/empty texture:', p);
          }
        }
      }
      check('every manifest metro texture path is a non-empty file on disk', allExist);
    }

    // 4-6. Icon ids match their registries exactly (same keys, both ways) —
    // upgrades vs UPGRADE_TRACKS, achievements vs ACH, collection vs CITY_QUIPS.
    const icons = (manifest && manifest.icons) || {};
    const sameSet = (a, b) => a.length === b.length && a.every((k) => b.includes(k));
    check('icons.upgrades ids match UPGRADE_TRACKS keys exactly', sameSet(Object.keys(icons.upgrades || {}), UPGRADE_KEYS));
    check('icons.achievements ids match ACH keys exactly', sameSet(Object.keys(icons.achievements || {}), Object.keys(ACH)));
    check('icons.collection ids match CITY_QUIPS keys exactly', sameSet(Object.keys(icons.collection || {}), Object.keys(CITY_QUIPS)));

    // 7. Every referenced icon file exists on disk and is non-empty.
    {
      let allExist = true;
      for (const cat of Object.keys(icons)) {
        for (const id of Object.keys(icons[cat])) {
          const abs = path.join(root, icons[cat][id]);
          if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
            allExist = false;
            console.log('   missing/empty icon:', icons[cat][id]);
          }
        }
      }
      check('every manifest icon path is a non-empty file on disk', allExist);
    }

    // 8-13. Resolution + fallback rules (the pure function main.js builds
    // levels with). GENERICS mirrors main.js's fallback path table in shape.
    const GENERICS = {
      apartment: 'g/apartment.png', office: 'g/office.png', concrete: 'g/concrete.png',
      storefront: 'g/storefront.png', groundPlane: 'g/asphalt.png', sidewalk: 'g/sidewalk.png',
    };
    const firstMetro = manifestMetroIds[0];
    const full = resolveMetroTextureSet(manifest, firstMetro, GENERICS);
    check(
      'a manifest metro resolves all five slots to its own paths, flagged metro:true',
      !!firstMetro
        && full.apartment.metro && full.apartment.path === metroArtPath(manifest, firstMetro, 'facade-apartment')
        && full.office.metro && full.office.path === metroArtPath(manifest, firstMetro, 'facade-office')
        && full.storefront.metro && full.storefront.path === metroArtPath(manifest, firstMetro, 'facade-storefront')
        && full.groundPlane.metro && full.groundPlane.path === metroArtPath(manifest, firstMetro, 'street')
        && full.sidewalk.metro && full.sidewalk.path === metroArtPath(manifest, firstMetro, 'sidewalk')
    );
    check(
      'the concrete role always stays generic (no per-metro concrete slot exists)',
      full.concrete.metro === false && full.concrete.path === GENERICS.concrete
    );
    const unknown = resolveMetroTextureSet(manifest, 'no-such-metro', GENERICS);
    check(
      'an unknown metro id falls back to the generic path on every role',
      Object.keys(unknown).every((k) => unknown[k].metro === false && unknown[k].path === GENERICS[k === 'groundPlane' ? 'groundPlane' : k])
    );
    const noManifest = resolveMetroTextureSet(null, firstMetro, GENERICS);
    check(
      'a null manifest (fetch failed / not yet loaded) falls back to generics on every role',
      Object.keys(noManifest).every((k) => noManifest[k].metro === false)
    );
    const partial = resolveMetroTextureSet(
      { metros: { 'partial-town': { street: 'm/street.png' } } }, 'partial-town', GENERICS
    );
    check(
      'a metro with only some slots resolves per-slot (listed slot metro, missing slots generic)',
      partial.groundPlane.metro && partial.groundPlane.path === 'm/street.png'
        && !partial.sidewalk.metro && partial.sidewalk.path === GENERICS.sidewalk
        && !partial.apartment.metro && partial.apartment.path === GENERICS.apartment
    );
    check(
      'iconPath returns the manifest path for a known id and null for unknown id/category/null manifest',
      iconPath(manifest, 'upgrades', 'size') === ((icons.upgrades || {}).size || null)
        && iconPath(manifest, 'upgrades', 'size') !== null
        && iconPath(manifest, 'upgrades', 'nope') === null
        && iconPath(manifest, 'no-such-category', 'size') === null
        && iconPath(null, 'upgrades', 'size') === null
    );
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
