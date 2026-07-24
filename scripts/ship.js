// Pre-deploy checklist (tech-architecture.md §5: "pre-deploy checklist becomes
// a script"). Runs the full gate in order and prints a checklist result:
//   1. logic suite     (scripts/logic-test.js)
//   2. invariant suite (scripts/invariant-test.js — game-design §5, 100 levels)
//   3. build           (scripts/build.js -> dist/)
//   4. dist/ contents  — the B1 tripwire: index.html plus BOTH vendored three
//                        files (three.core.js + three.module.js)
//
// DEFAULT IS SAFE: this script performs NO network mutations. Only when
// VERCEL=1 is explicitly set in the environment does it attempt the deploy
// step (`vercel deploy --prod`), and it says so loudly either way.
//
// Exit code 0 = every step passed; 1 = a step failed (the checklist shows
// which). Later steps are skipped after a failure — a red test suite never
// produces a "built" illusion.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const steps = [];
function record(name, ok, detail = '') {
  steps.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗ FAIL:'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function runNode(scriptRel) {
  const res = spawnSync(process.execPath, [path.join(root, scriptRel)], {
    cwd: root,
    stdio: 'inherit',
  });
  return res.status === 0;
}

console.log('SHIP CHECKLIST (Flywheel V2 pre-deploy)\n');

// 1-2. Test tiers.
if (!record('logic suite (scripts/logic-test.js)', runNode('scripts/logic-test.js'))) bail();
if (!record('invariant suite (scripts/invariant-test.js, 100 levels)', runNode('scripts/invariant-test.js'))) bail();

// 3. Build.
if (!record('build (scripts/build.js)', runNode('scripts/build.js'))) bail();

// 4. dist/ contents — B1: both vendored three files must ship.
const requiredDist = [
  'index.html',
  path.join('assets', 'vendor', 'three.core.js'),
  path.join('assets', 'vendor', 'three.module.js'),
];
const missing = requiredDist.filter((rel) => !fs.existsSync(path.join(dist, rel)));
record('dist/ contents (B1: index.html + vendored three.core.js + three.module.js)', missing.length === 0,
  missing.length ? `missing: ${missing.join(', ')}` : `${requiredDist.length} required files present`);
if (missing.length) bail();

// 5. Deploy — opt-in only.
if (process.env.VERCEL === '1') {
  console.log('\nVERCEL=1 set — running the deploy step (network mutation, explicitly requested):');
  const res = spawnSync('npx', ['vercel', 'deploy', '--prod', '--yes'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  record('vercel deploy --prod', res.status === 0);
  if (res.status !== 0) bail();
} else {
  console.log('\nVERCEL not set — deploy step SKIPPED (no network mutations).');
  console.log('The dist/ directory is ready for a static deploy; run with VERCEL=1 to deploy via vercel --prod.');
}

console.log(`\nRESULT: SHIP CHECKLIST PASSED (${steps.filter((s) => s.ok).length}/${steps.length} steps)`);
process.exit(0);

function bail() {
  console.log(`\nRESULT: SHIP CHECKLIST FAILED (${steps.filter((s) => !s.ok).length} failing step(s)) — do NOT deploy`);
  process.exit(1);
}
