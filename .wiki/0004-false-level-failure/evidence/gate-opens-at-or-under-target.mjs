// PRE-FIX BASELINE for the regression assertion in .wiki/0004 §9, test 1:
// "for every level, the mass at which the capstone size gate opens must be
// <= level.target". Read-only; no game state is touched.
//
// Run from this directory:  node gate-opens-at-or-under-target.mjs
// Exit code 1 while the defect is present, 0 once it is fixed.
import * as THREE from 'three';
import { createLandmark } from '../../../src/content/landmarks.js';
import { generateLevel } from '../../../src/data/levels.js';
import { capstoneGateRadius, radiusFromMass } from '../../../src/data/formulas.js';
// The spawn rule itself, imported rather than restated. This probe originally
// hardcoded `Math.max(boundingRadius, capstoneGateRadius(level))` — a COPY of
// the defective spawn — which meant it measured its own copy and could not
// observe the fix. Calling the real function keeps it honest in both
// directions: it went red before 9.4 and would go red again if geometry were
// ever allowed to raise the gate.
import { capstoneEffectiveRadius } from '../../../src/systems/win.js';

const brByType = {};
const failures = [];
for (let n = 1; n <= 100; n += 1) {
  const lv = generateLevel(n);
  const type = lv.metro.landmarkType;
  if (brByType[type] === undefined) {
    brByType[type] = createLandmark(type, THREE, lv.metro.accent).boundingRadius;
  }
  // Effective gate radius as main.js spawns it.
  const effRadius = capstoneEffectiveRadius(brByType[type], capstoneGateRadius(lv)).radius;
  // Gate opens when avatar radius >= effRadius / capstoneGate (swallow.js:123-126).
  const openRadius = effRadius / lv.capstoneGate;
  // Invert radiusFromMass: r = 26 + 1.9*sqrt(baseMass).
  const openBaseMass = ((openRadius - 26) / 1.9) ** 2;
  const baseTarget = lv.target / lv.itemValueMultiplier;
  if (openBaseMass > baseTarget) {
    failures.push({ n, landmark: type, openBaseMass: +openBaseMass.toFixed(1), baseTarget,
      ratio: +(openBaseMass / baseTarget).toFixed(4) });
  }
}
console.table(failures);
console.log(failures.length === 0
  ? 'PASS: capstone gate opens at or under target on all 100 levels'
  : `FAIL: ${failures.length}/100 levels need more than target mass to open the capstone gate`);
process.exit(failures.length === 0 ? 0 : 1);
