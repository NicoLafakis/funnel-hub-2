import * as THREE from 'three';
import { createLandmark } from '../../../src/content/landmarks.js';
import { generateLevel } from '../../../src/data/levels.js';
import { capstoneGateRadius, radiusFromMass } from '../../../src/data/formulas.js';
const types = ['liberty-statue','lattice-tower','clock-tower','sky-tower','mega-spire','amphitheater','mountain-statue','onion-palace','sail-opera','portal-tower'];
const br = {};
for (const t of types) { br[t] = createLandmark(t, THREE, '#ffffff').boundingRadius; }
console.log(br);
const rows = [];
for (let n=1;n<=100;n++){
  const lv = generateLevel(n);
  const lmR = br[lv.metro?.landmarkType] ?? null;
  const eff = Math.max(lmR, capstoneGateRadius(lv));
  const gate = lv.capstoneGate;
  const needR = eff/gate;
  const needBase = ((needR-26)/1.9)**2;
  const baseTarget = lv.target/lv.itemValueMultiplier;
  const req = lv.capstoneGate > 0.78 || lv.isCapstone;
  rows.push({n, lm: lv.metro?.landmarkType, gate, lmR: +lmR?.toFixed(1), eff:+eff.toFixed(1), needBase:+needBase.toFixed(0), baseTarget, ratio:+(needBase/baseTarget).toFixed(2), capstoneRequired:req, cap: lv.world*0.2});
}
console.table(rows.filter(r=>r.ratio>1||r.n<25));
