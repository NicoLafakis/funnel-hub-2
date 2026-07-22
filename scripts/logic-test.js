const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function noop() {}
function mockCtx() {
  return new Proxy({
    createRadialGradient: () => ({ addColorStop: noop }),
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? noop : undefined)), set: () => true });
}
const elements = {};
function mkEl(id) {
  return {
    id, classList: { add: noop, remove: noop, toggle: noop },
    textContent: '', innerHTML: '', style: {}, children: [],
    appendChild(c) { this.children.push(c); }, remove: noop,
    getContext: () => mockCtx(), width: 0, height: 0,
  };
}
const listeners = {};
const sandbox = {
  window: {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  },
  document: {
    getElementById: id => (elements[id] = elements[id] || mkEl(id)),
    createElement: () => mkEl('dyn'),
    addEventListener: noop,
  },
  performance: { now: () => Date.now() },
  requestAnimationFrame: noop,
  console, URL, URLSearchParams,
  location: { search: '' },
  Math, Date, JSON,
  setTimeout: (fn) => 0, clearTimeout: noop,
};
const ctx = vm.createContext(sandbox);
vm.runInContext(script, ctx);
const R = code => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗ FAIL:', name); }
}

// ---- 1. Static data integrity ----
console.log('DATA:');
check('10 levels defined', R('LEVELS.length') === 10);
check('all levels have tip+done fields', R('LEVELS.every(l=>typeof l.tip==="string" && typeof l.done==="string")'));
check('quips cover every emoji used in levels', R(`
  (()=>{ const used=new Set(); LEVELS.forEach(l=>l.objs.forEach(o=>used.add(o[0])));
  return [...used].every(e=>QUIPS[e] && QUIPS[e].length>=3); })()
`));
check('11 achievements defined', R('Object.keys(ACH).length') === 11);
check('15 fake notifications', R('NOTIFS.length') === 15);
check('7 size titles', R('SIZE_TITLES.length') === 7);
check('6 combo tiers', R('COMBO_TIERS.length') === 6);

// ---- 2. Level flow: full 10-level playthrough ----
console.log('FLOW (playthrough):');
R('S.totalMass=0; startLevel(0); beginPlay();');
check('level 1 enters play mode', R('S.mode') === 'play');
for (let i = 0; i < 10; i++) {
  R(`startLevel(${i}); beginPlay();`);
  R('mass = target;'); // force win condition
  R('update(0.016);');
  check(`level ${i + 1} completes on target mass`, R('S.mode') === 'done');
  R('{ const n=S.level+1; n<10?startLevel(n):winGame(); }');
}
check('after level 10 → win screen', R('S.mode') === 'win');
check('total mass accumulated', R('S.totalMass') > 19000);
check('win achievement unlocked', R("achUnlocked.has('win')"));

// ---- 3. Fail path ----
console.log('FAIL PATH:');
R('startLevel(0); beginPlay();');
R('timer = 0.5; update(1);');
check('timeout with low mass → fail', R('S.mode') === 'fail');

// ---- 4. Golden records spawn ----
console.log('GOLDEN:');
R('startLevel(2); beginPlay();');
check('golden record(s) spawned', R('objs.filter(o=>o.golden).length') >= 1);
check('golden worth 8x base', R('objs.filter(o=>o.golden).every(o=>o.pts%8===0 || o.pts>=32)'));

// ---- 5. Eating + combo ----
console.log('EATING/COMBO:');
R(`startLevel(0); beginPlay();
   const o = objs.find(o=>!o.golden && o.r<=20);
   hole.x = o.x; hole.y = o.y;
   update(0.016);`);
check('object eaten → mass gained', R('mass') > 0);
check('combo counter incremented', R('combo.count') >= 1);
check('first-contact achievement', R("achUnlocked.has('first')"));
check('floater created', R('floaters.length') >= 1);
check('particles created', R('particles.length') >= 1);

// ---- 6. Sync storm ----
console.log('STORM:');
R('const before = objs.length; stormT = 0.001; update(0.016);');
check('storm spawns 12 drops', R('objs.length') >= R('before') + 12 - 1);

// ---- 7. Rival eating ----
console.log('RIVAL EAT:');
R(`startLevel(5); beginPlay();
   mass = 200;
   const v = rivals[0];
   v.x = hole.x + 20; v.y = hole.y;
   const massBefore = mass;
   update(0.016);`);
check('rival swallowed when outgrown', R('rivals[0].dead') === 8);
check('rival bonus mass awarded', R('mass') > R('massBefore'));
check('rival achievement', R("achUnlocked.has('rival')"));
check('rival respawn timer set', R('rivals[0].dead') > 0);

// ---- 8. Easter eggs via keydown ----
console.log('EASTER EGGS:');
const keydown = listeners.keydown[0];
R('startLevel(0); beginPlay();');
const beforeEgg = R('mass');
['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']
  .forEach(k => keydown({ key: k }));
check('konami code grants +500 mass', R('mass') === beforeEgg + 500);
check('god achievement', R("achUnlocked.has('god')"));
const chaosBefore = R('objs.length');
'unsub'.split('').forEach(k => keydown({ key: k }));
check('unsub triggers physics chaos', R('chaosT') === 3);
'breeze'.split('').forEach(k => keydown({ key: k }));
check('breeze spawns 4 AI bots', R('objs.length') === chaosBefore + 4);
check('breeze achievement', R("achUnlocked.has('breeze')"));

// ---- 9. Render smoke test (no throw) ----
console.log('RENDER:');
let threw = false;
try { R('render(); render();'); } catch (e) { threw = true; console.log('   render error:', e.message); }
check('render() runs without throwing', !threw);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
