// Deterministic district-object audit used by remediation task 1/12.
// Prints one compact row per level and exits nonzero on any contract failure.
import * as THREE from 'three';
import { generateAllLevels } from '../src/data/levels.js';
import { generateDistrict } from '../src/content/districts.js';
import {
  VISUAL_ARCHETYPES, validateArchetypeCatalogs,
} from '../src/content/archetypes.js';
import { visualGeometryFingerprint } from '../src/content/propkit.js';

const catalogErrors = validateArchetypeCatalogs();
const rows = [];
let failed = catalogErrors.length > 0;
for (const level of generateAllLevels()) {
  const layout = generateDistrict(level);
  const visualIds = [...new Set(layout.props.map((p) => p.visualId))];
  const goldenIds = [...new Set(layout.props.filter((p) => p.golden).map((p) => p.visualId))];
  const groups = visualIds.length + goldenIds.length;
  const triangles = visualIds.reduce((sum, id) => {
    const descriptor = VISUAL_ARCHETYPES[id];
    return sum + visualGeometryFingerprint(id, descriptor.gameplayKind, THREE).triangles;
  }, 0);
  const novelty = layout.stats.novelty.ratio;
  if ((level.levelInChapter > 1 && novelty < 0.25) || groups > 24) failed = true;
  rows.push({
    level: level.n,
    metro: level.metro.id,
    district: level.levelInChapter,
    props: layout.props.length,
    visualIds: visualIds.length,
    groups,
    triangles,
    novelty: Number(novelty.toFixed(4)),
  });
}

console.table(rows);
console.log(JSON.stringify({
  archetypes: Object.keys(VISUAL_ARCHETYPES).length,
  catalogs: 100,
  minimumNovelty: Math.min(...rows.filter((row) => row.district > 1).map((row) => row.novelty)),
  maximumGroups: Math.max(...rows.map((row) => row.groups)),
  maximumActiveTriangles: Math.max(...rows.map((row) => row.triangles)),
  catalogErrors,
}, null, 2));
process.exitCode = failed ? 1 : 0;
