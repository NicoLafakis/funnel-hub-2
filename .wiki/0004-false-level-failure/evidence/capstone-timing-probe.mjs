import * as THREE from 'three';
import { createLandmark } from '../../../src/content/landmarks.js';
import { generateLevel } from '../../../src/data/levels.js';
import { simulateLevel } from '../../../scripts/soak-bot.js';
import { formatCompact } from '../../../src/ui/format.js';
const rows=[];
for (const n of [10,20,25,41,45,50,55,61,75,91,100]) {
  const lv = generateLevel(n);
  const lr = createLandmark(lv.metro.landmarkType, THREE, lv.metro.accent).boundingRadius;
  const r = simulateLevel(n, { landmarkRadius: lr });
  rows.push({n, lm: lv.metro.landmarkType, capEdible: r.capstoneEdibleTime, won: r.completionTime, time: r.time,
    gapS: (r.completionTime!=null && r.capstoneEdibleTime!=null)? +(r.completionTime-r.capstoneEdibleTime).toFixed(1):null});
}
console.table(rows);
// display-collision window: largest mass < target that formats identically
for (const n of [1,10,25,41,50,75,100]) {
  const t = generateLevel(n).target;
  let lo=0, hi=t;
  // find smallest m with same string as t
  let m=t; while(m>0 && formatCompact(m-1)===formatCompact(t)) m-=1;
  console.log(`n=${n} target=${t} (${formatCompact(t)}) reads-as-target from mass ${m} => shortfall up to ${( (t-m)/t*100).toFixed(2)}%`);
}
