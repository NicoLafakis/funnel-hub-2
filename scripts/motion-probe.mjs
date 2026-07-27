// Motion probe: reproduces the hole's steering feel headlessly, with no GPU
// and no browser, by running the EXACT production coupling between
// input.js -> camera.js -> avatar.js.
//
// Why this exists: the live complaint is "the hole fights you when you turn
// left/right and feels like rolling a ball rather than pushing a hole along
// the ground". That is not a subjective art problem — it is a closed control
// loop, and this script measures it. See
// `.wiki/0003-hole-feel-and-visual-fidelity/00-findings.md` §1.
//
// STATUS: both defects are FIXED. This script is kept as the demonstrator and
// the manual regression check — it runs the broken configuration side by side
// with the shipping one so the difference stays visible and measurable.
//
// The loop that used to close (src/main.js ~1432-1439 each frame):
//   cameraYaw = avatar.object3D.rotation.y + orbitYaw   (old camera.js `get yaw`)
//   worldDir  = cameraRelativeMove(screenIntent, cameraYaw)
//   facing    = atan2(worldDir.x, worldDir.z)           (avatar.js update)
//   rotation.y += (facing - rotation.y) * min(1, dt*6)  (avatar.js update)
// Camera yaw was a function of the avatar's heading and the avatar's heading
// a function of camera yaw. Any input with a lateral component drove it.
//
// Fixes: camera.js now exposes a fixed BASE_YAW (the loop cannot close), and
// avatar.js damps through shortestAngleTo() (the atan2 wrap can no longer
// snap). The logic suite asserts both; this prints the numbers.
//
// Run: node scripts/motion-probe.mjs

import { cameraRelativeMove, createInputMachine } from '../src/engine/input.js';
import { shortestAngleTo } from '../src/engine/avatar.js';

// avatar.js constants, mirrored (not imported — avatar.js needs a THREE scene).
const BASE_SPEED = 340;
const SPAWN_RADIUS = 26;          // radius() at spawn mass
const FACING_DAMP_RATE = 6;       // avatar.js: Math.min(1, dt * 6)
const DT = 1 / 60;
const FRAMES = 180;               // 3 seconds

const DEG = 180 / Math.PI;

function growthDrag(r) {
  return 60 / Math.max(60, r);
}

// One simulated run. `coupled = true` reproduces the OLD broken behaviour
// (camera yaw tracks avatar facing, raw un-normalised angle damp).
// `coupled = false` is the shipping fixed-world-yaw camera every Hole.io
// reference screenshot shows (assets/references/holeio/), damped through
// shortestAngleTo() exactly as avatar.js does.
function run({ keys, coupled, fixedYaw = 0, frames = FRAMES, trace = 0 }) {
  const machine = createInputMachine({});
  keys.forEach((k) => machine.handleKeyDown(k));

  let rotY = coupled ? 0 : fixedYaw;
  let x = 0;
  let z = 0;
  let yawTravel = 0;   // total |camera rotation| — the "fighting" metric
  let reversals = 0;   // sign flips of camera angular velocity — the judder
  let prevDelta = 0;
  const rows = [];

  for (let i = 0; i < frames; i += 1) {
    const cameraYaw = coupled ? rotY : fixedYaw;
    machine.update(DT, { cameraYaw });
    const mv = cameraRelativeMove(machine.move, cameraYaw);
    const len = Math.hypot(mv.dx, mv.dz);
    if (len > 0.0001) {
      const nx = mv.dx / len;
      const nz = mv.dz / len;
      const speed = BASE_SPEED * Math.min(1, len) * growthDrag(SPAWN_RADIUS);
      x += nx * speed * DT;
      z += nz * speed * DT;
      const facing = Math.atan2(nx, nz);
      const before = rotY;
      // coupled = the old raw difference (wraps); fixed = shortestAngleTo.
      const diff = coupled ? (facing - rotY) : shortestAngleTo(rotY, facing);
      rotY += diff * Math.min(1, DT * FACING_DAMP_RATE);
      const delta = rotY - before;
      yawTravel += Math.abs(delta);
      if (prevDelta !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) reversals += 1;
      prevDelta = delta;
      if (trace && i < trace) {
        rows.push(`      f${String(i).padStart(2)}  camYaw ${(before * DEG).toFixed(1).padStart(7)}°`
          + `  facingTarget ${(facing * DEG).toFixed(1).padStart(7)}°`
          + `  step ${(delta * DEG).toFixed(2).padStart(7)}°`);
      }
    }
  }

  return {
    x, z,
    distance: Math.hypot(x, z),
    heading: Math.atan2(x, z) * DEG,
    yawTravel: yawTravel * DEG,
    reversals,
    rows,
  };
}

// A perfectly straight 3s run at spawn speed. Every direction should hit this.
const IDEAL = BASE_SPEED * growthDrag(SPAWN_RADIUS) * (FRAMES * DT);

const CASES = [
  ['forward   (W)', ['w']],
  ['right     (D)', ['d']],
  ['left      (A)', ['a']],
  ['fwd+right (WD)', ['w', 'd']],
];

function report(title, coupled) {
  console.log(`\n${title}`);
  console.log('  input           distance   straightness   camera rotated   direction reversals');
  console.log('  ' + '-'.repeat(80));
  for (const [label, keys] of CASES) {
    const r = run({ keys, coupled });
    const straight = `${((r.distance / IDEAL) * 100).toFixed(1)}%`;
    console.log(`  ${label.padEnd(15)} ${r.distance.toFixed(0).padStart(6)}u`
      + `   ${straight.padStart(10)}`
      + `   ${r.yawTravel.toFixed(0).padStart(11)}°`
      + `   ${String(r.reversals).padStart(14)}`);
  }
}

console.log('Hole motion probe — 3s of held input from a standing start at spawn size.');
console.log(`A straight run covers ${IDEAL.toFixed(0)}u. "camera rotated" is total absolute yaw`);
console.log('travel over the run; "reversals" counts sign flips of camera angular velocity');
console.log('(each one is a visible snap back against the direction you are steering).');

report('BEFORE (the bug) — camera yaw = avatar facing + orbit, raw angle damp:', true);
report('AFTER (shipping) — camera.js BASE_YAW fixed + shortestAngleTo damp:', false);

// The wrap: atan2 returns (-PI, PI] but rotation.y is unbounded and the
// difference is never normalized, so once the loop drives yaw past -180deg
// the damp term inverts and snaps the camera forward instead of back.
console.log('\nFirst 16 frames of BEFORE "hold right (D)" — the angle-wrap snap:');
const traced = run({ keys: ['d'], coupled: true, frames: 16, trace: 16 });
traced.rows.forEach((r) => console.log(r));
console.log('\n  Frames 0-10 rotate the camera a constant -9.00°/frame (= -540°/s): holding a');
console.log('  lateral key carves a circle instead of strafing. At frame 11 atan2 wraps from');
console.log('  -180° to +171°, the un-normalised `facing - rotation.y` becomes +270° instead');
console.log('  of -9°, and the camera snaps +27° the wrong way. From there it locks into a');
console.log('  period-4 limit cycle (-72° -> -81° -> -90° -> -99° -> snap) at 15 Hz.');
