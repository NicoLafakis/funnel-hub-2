// Movement + camera input: a formal state machine (idle / key-steer /
// drag-target / orbit) with explicit enter AND exit transitions, per
// game-design §1. Lesson B4: V1 shipped mouse-drift because pointer.active
// was set on pointermove and never cleared — here, hover with no button down
// touches NOTHING (pointerMove for an untracked pointer id is a no-op), and
// every enter transition has a tested exit.
//
// OUTPUT FRAME CONTRACT: `move` is a normalized SCREEN-space intent vector
// {x, z}: x > 0 = screen right, z < 0 = "up-screen" = away from the camera
// (W). Convert to world velocity by rotating by the camera yaw — use the
// exported pure helper cameraRelativeMove(move, cameraYaw) or the bound
// input.moveVector(cameraYaw). World coordinates follow the B7 contract:
// origin (0,0) at world center, extents ±worldSize/2, ground plane y = 0.
//
// Control mapping (game-design §1 + tech-architecture §6):
//   - WASD / arrows          -> key-steer (camera-relative)
//   - Q / E                  -> 45° stepped camera yaw (keyboard-only orbit;
//                               emitted as an impulse, does not change state)
//   - mouse left-drag        -> drag-target: pointer raycast onto the ground
//                               plane yields a world target; the avatar walks
//                               straight to it and stops on arrival
//   - mouse right-drag       -> orbit (yaw + pitch)
//   - touch, left half       -> virtual stick (analog key-steer)
//   - touch, right half / 2nd finger -> orbit drag
//   - pinch (two touches)    -> camera pitch
//   Touch one-finger resolves to the tech-§6 halves scheme rather than the
//   desktop drag-target; the two docs conflict and §6 is the mobile-specific
//   control scheme, so it wins on touch.
//
// Structure: createInputMachine() is the PURE core (no DOM, all events fed
// in as plain objects) exported separately so scripts/logic-test.js can
// unit-test transitions headlessly. createInput() is the thin DOM-binding
// layer that wires window listeners to a machine. No browser-only API is
// touched at module top level.

export const INPUT_STATES = ['idle', 'key-steer', 'drag-target', 'orbit'];

// Release damping (game-design §1 acceptance: "releasing all input stops the
// avatar within 0.3s"): when intent drops to zero, the smoothed output's
// magnitude decays linearly at this rate, reaching exactly 0 in 0.25s. The
// game (avatar movement) applies the smoothed vector directly, so this IS
// the stop-damping the game applies.
export const RELEASE_RATE_PER_SEC = 4;   // 1 / 0.25s
const ATTACK_RATE_PER_SEC = 14;          // ramp-up toward a fresh intent

const ORBIT_YAW_PER_PX = 0.005;          // rad per pixel of orbit drag
const ORBIT_PITCH_PER_PX = 0.004;
const PINCH_PITCH_PER_PX = 0.003;        // rad per pixel of pinch spread change

const STICK_MAX_RADIUS_PX = 60;          // virtual-stick full deflection
const DRAG_ARRIVE_MIN = 6;               // world units; min arrival tolerance

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

function isMoveKey(key) {
  return MOVE_KEYS.indexOf(key) !== -1;
}

// Pure: camera-relative rotation (game-design §1: "velocity = input vector
// rotated by camera yaw. W = away from camera"). Camera yaw convention
// matches camera.js/avatar.js: view direction = (sin(yaw), 0, cos(yaw)).
// Screen-space intent (x = right, z = -1 away) maps to world as:
//   away  = -z  -> world (sin(yaw), cos(yaw))
//   right =  x  -> world (-cos(yaw), sin(yaw))  (right-handed, up = +Y)
export function cameraRelativeMove(move, cameraYaw) {
  if (!move) return { dx: 0, dz: 0 };
  const s = Math.sin(cameraYaw);
  const c = Math.cos(cameraYaw);
  const away = -move.z;
  return {
    dx: away * s - move.x * c,
    dz: away * c + move.x * s,
  };
}

// Inverse of cameraRelativeMove, used to fold a world-space drag-target
// direction back into screen-space intent so `move` has ONE output frame no
// matter which state produced it.
function worldDirToScreen(dx, dz, cameraYaw) {
  const s = Math.sin(cameraYaw);
  const c = Math.cos(cameraYaw);
  const away = dx * s + dz * c;
  const right = -dx * c + dz * s;
  return { x: right, z: -away };
}

// Pure: screen-space intent from the held move keys. Diagonals are
// normalized so they aren't faster than cardinal movement (same as V1).
export function axesFromKeys(keys) {
  let mx = 0;
  let mz = 0;
  if (keys['w'] || keys['arrowup']) mz -= 1;
  if (keys['s'] || keys['arrowdown']) mz += 1;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (mx === 0 && mz === 0) return null;
  const len = Math.hypot(mx, mz);
  return { x: mx / len, z: mz / len };
}

/**
 * The pure state-machine core.
 *
 * @param {{
 *   toGround?: (ndcX: number, ndcY: number) => ({x: number, z: number} | null),
 * }} [opts]
 *   toGround converts a pointer position in NDC (-1..1, y up) into a world
 *   ground-plane (y = 0) point. In the browser this is a raycast from the
 *   camera; in tests any stub works. Without it, drag-target never enters.
 *
 * Events (all plain objects, no DOM types):
 *   handleKeyDown(key) / handleKeyUp(key)
 *   pointerDown({id, x, y, button, pointerType, viewportW, viewportH})
 *   pointerMove({id, x, y})
 *   pointerUp(id)
 *   blur()
 * Per frame:
 *   update(dt, {avatarX, avatarZ, avatarRadius, cameraYaw})
 * Outputs:
 *   get state()           one of INPUT_STATES
 *   get move()            smoothed screen-space intent {x, z}, |move| <= 1
 *   consumeOrbit()        -> {yaw, pitch, steps} accumulated since last call,
 *                         and zeroes the accumulators (steps = Q/E presses)
 */
export function createInputMachine({ toGround = null } = {}) {
  let state = 'idle';
  // The movement state to restore when an orbit drag ends (orbit is a
  // temporary overlay: you may keep steering while orbiting).
  let resumeState = 'idle';

  const keys = Object.create(null);
  const pointers = new Map(); // id -> {button, pointerType, role, x, y, originX, originY}

  let dragPointerId = null;  // owns the drag-target state
  let stickPointerId = null; // owns the virtual stick
  let orbitPointerId = null; // primary orbit drag pointer
  let dragNDC = null;        // latest drag-target pointer pos, NDC
  let pinchPrevDist = 0;

  const orbitAccum = { yaw: 0, pitch: 0 };
  let orbitSteps = 0;

  // Smoothed output — the object identity is stable (zero-alloc reads).
  const smoothed = { x: 0, z: 0 };

  function anyMoveKeyDown() {
    return MOVE_KEYS.some((k) => keys[k]);
  }

  function movementState() {
    // The movement source that would be active if no orbit drag were in
    // progress. Keys beat pointer (V1 behavior, kept).
    if (anyMoveKeyDown() || stickPointerId !== null) return 'key-steer';
    if (dragPointerId !== null) return 'drag-target';
    return 'idle';
  }

  function enterOrbit() {
    if (state !== 'orbit') {
      resumeState = state;
      state = 'orbit';
    }
  }

  function exitOrbit() {
    state = resumeState === 'orbit' ? movementState() : resumeState;
    resumeState = 'idle';
  }

  function setMovementState(next) {
    if (state === 'orbit') {
      resumeState = next;
    } else {
      state = next;
    }
  }

  function handleKeyDown(key) {
    const k = String(key).toLowerCase();
    if (isMoveKey(k)) {
      keys[k] = true;
      // Keys override an in-progress drag-target (V1: keys beat pointer).
      // The drag pointer stays tracked but loses its role until re-pressed.
      if (dragPointerId !== null) {
        const rec = pointers.get(dragPointerId);
        if (rec) rec.role = 'ignored';
        dragPointerId = null;
        dragNDC = null;
      }
      setMovementState('key-steer');
      return;
    }
    if (k === 'q') orbitSteps -= 1; // stepped keyboard orbit: impulse only,
    if (k === 'e') orbitSteps += 1; // no state change (camera applies 45°/step)
  }

  function handleKeyUp(key) {
    const k = String(key).toLowerCase();
    if (!isMoveKey(k)) return;
    keys[k] = false;
    if (!anyMoveKeyDown() && stickPointerId === null) {
      setMovementState(movementState());
    }
  }

  function pointerDown({ id, x, y, button = 0, pointerType = 'mouse', viewportW = 1, viewportH = 1 }) {
    if (pointers.has(id)) return;
    const rec = { id, x, y, originX: x, originY: y, button, pointerType, role: null };

    if (pointerType === 'touch' || pointerType === 'pen') {
      const half = x < viewportW / 2 ? 'left' : 'right';
      if (pointers.size === 0) {
        rec.role = half === 'left' ? 'stick' : 'orbit';
      } else {
        // Second finger always orbits (game-design §1); the pair also
        // enables pinch-pitch (tech §6).
        rec.role = 'orbit';
        pinchPrevDist = 0; // re-seeded on the next pointerMove
      }
    } else if (button === 2) {
      rec.role = 'orbit';
    } else if (button === 0) {
      rec.role = anyMoveKeyDown() || stickPointerId !== null ? 'ignored' : 'drag';
    } else {
      rec.role = 'ignored';
    }

    pointers.set(id, rec);

    if (rec.role === 'orbit') {
      if (orbitPointerId === null) orbitPointerId = id;
      enterOrbit();
    } else if (rec.role === 'drag') {
      dragPointerId = id;
      dragNDC = { x: (x / viewportW) * 2 - 1, y: -((y / viewportH) * 2 - 1) };
      setMovementState('drag-target');
    } else if (rec.role === 'stick') {
      stickPointerId = id;
      setMovementState('key-steer');
    }
  }

  function pointerMove({ id, x, y, viewportW = 1, viewportH = 1 }) {
    const rec = pointers.get(id);
    // B4, structurally: a pointer that never went down (hover) has no record
    // and therefore can never steer, orbit, or set a target.
    if (!rec) return;
    const dx = x - rec.x;
    const dy = y - rec.y;
    rec.x = x;
    rec.y = y;

    if (rec.role === 'orbit') {
      orbitAccum.yaw += dx * ORBIT_YAW_PER_PX;
      orbitAccum.pitch += dy * ORBIT_PITCH_PER_PX;
      // Pinch: with two touches down, the change in their separation drives
      // camera pitch (tech §6), on top of the drag itself.
      if (pointers.size === 2) {
        let other = null;
        for (const p of pointers.values()) {
          if (p.id !== id) { other = p; break; }
        }
        if (other) {
          const dist = Math.hypot(x - other.x, y - other.y);
          if (pinchPrevDist > 0) {
            orbitAccum.pitch += (dist - pinchPrevDist) * PINCH_PITCH_PER_PX;
          }
          pinchPrevDist = dist;
        }
      }
    } else if (rec.role === 'drag') {
      dragNDC = { x: (x / viewportW) * 2 - 1, y: -((y / viewportH) * 2 - 1) };
    }
    // 'stick' movement is read from rec.x/rec.y in update(); 'ignored' does
    // nothing. Hover (no rec) already returned above.
  }

  function pointerUp(id) {
    const rec = pointers.get(id);
    if (!rec) return;
    pointers.delete(id);

    if (rec.role === 'orbit') {
      if (orbitPointerId === id) {
        orbitPointerId = null;
        // A second orbit-capable pointer (two-finger orbit) keeps orbit alive.
        let stillOrbiting = false;
        for (const p of pointers.values()) {
          if (p.role === 'orbit') { orbitPointerId = p.id; stillOrbiting = true; break; }
        }
        if (!stillOrbiting) {
          pinchPrevDist = 0;
          exitOrbit();
        }
      }
      return;
    }
    if (rec.role === 'stick' && stickPointerId === id) {
      stickPointerId = null;
      setMovementState(movementState());
      return;
    }
    if (rec.role === 'drag' && dragPointerId === id) {
      dragPointerId = null;
      dragNDC = null;
      setMovementState(movementState());
    }
  }

  // Dropped focus mid-drag/mid-key: drop EVERYTHING (B4's sibling failure —
  // input sticking on). State exits to idle; the smoothed output then decays
  // to zero in update() within 0.25s.
  function blur() {
    for (const k of Object.keys(keys)) keys[k] = false;
    pointers.clear();
    dragPointerId = null;
    stickPointerId = null;
    orbitPointerId = null;
    dragNDC = null;
    pinchPrevDist = 0;
    state = 'idle';
    resumeState = 'idle';
  }

  function computeIntent(ctx) {
    // Keys first (keys beat pointer), then the virtual stick.
    if (anyMoveKeyDown()) {
      return axesFromKeys(keys);
    }
    if (stickPointerId !== null) {
      const rec = pointers.get(stickPointerId);
      if (rec) {
        const sx = (rec.x - rec.originX) / STICK_MAX_RADIUS_PX;
        const sz = (rec.y - rec.originY) / STICK_MAX_RADIUS_PX;
        const mag = Math.hypot(sx, sz);
        if (mag < 0.12) return { x: 0, z: 0 }; // dead zone at stick center
        if (mag > 1) return { x: sx / mag, z: sz / mag };
        return { x: sx, z: sz };
      }
    }
    if (state === 'drag-target' && dragPointerId !== null && dragNDC && typeof toGround === 'function') {
      const target = toGround(dragNDC.x, dragNDC.y);
      if (target && typeof target.x === 'number' && typeof target.z === 'number') {
        const dx = target.x - (ctx.avatarX || 0);
        const dz = target.z - (ctx.avatarZ || 0);
        const dist = Math.hypot(dx, dz);
        const arrive = Math.max(DRAG_ARRIVE_MIN, (ctx.avatarRadius || 0) * 0.6);
        if (dist <= arrive) {
          // Arrived: the target is consumed and the machine exits to idle —
          // drag-to-move stops ON ARRIVAL (game-design §1), it never
          // re-targets on its own.
          dragNDC = null;
          const rec = pointers.get(dragPointerId);
          if (rec) rec.role = 'ignored';
          dragPointerId = null;
          setMovementState(movementState());
          return null;
        }
        // Fold the world-space direction into screen-space intent via the
        // camera yaw so `move` keeps a single output frame.
        return worldDirToScreen(dx / dist, dz / dist, ctx.cameraYaw || 0);
      }
    }
    return null;
  }

  function update(dt, ctx = {}) {
    const intent = computeIntent(ctx);
    if (intent) {
      const k = Math.min(1, ATTACK_RATE_PER_SEC * dt);
      smoothed.x += (intent.x - smoothed.x) * k;
      smoothed.z += (intent.z - smoothed.z) * k;
      const mag = Math.hypot(smoothed.x, smoothed.z);
      if (mag > 1) {
        smoothed.x /= mag;
        smoothed.z /= mag;
      }
    } else {
      // Linear magnitude decay: full deflection reaches exactly zero in
      // 1 / RELEASE_RATE_PER_SEC = 0.25s (< the 0.3s acceptance bound).
      const mag = Math.hypot(smoothed.x, smoothed.z);
      if (mag > 0) {
        const next = Math.max(0, mag - RELEASE_RATE_PER_SEC * dt);
        if (next === 0) {
          smoothed.x = 0;
          smoothed.z = 0;
        } else {
          const s = next / mag;
          smoothed.x *= s;
          smoothed.z *= s;
        }
      }
    }
  }

  function consumeOrbit() {
    const out = { yaw: orbitAccum.yaw, pitch: orbitAccum.pitch, steps: orbitSteps };
    orbitAccum.yaw = 0;
    orbitAccum.pitch = 0;
    orbitSteps = 0;
    return out;
  }

  return {
    handleKeyDown,
    handleKeyUp,
    pointerDown,
    pointerMove,
    pointerUp,
    blur,
    update,
    consumeOrbit,
    get state() { return state; },
    get move() { return smoothed; },
    get orbitSteps() { return orbitSteps; },
  };
}

/**
 * DOM-binding layer: wires real window listeners to a machine. Constructed
 * with no DOM access at module top level — everything happens inside this
 * factory, so a bare `import` of this file never throws in Node.
 *
 * @param {{
 *   screenToGround?: (ndcX: number, ndcY: number) => ({x, z} | null),
 *   canvas?: HTMLElement,  // gets a contextmenu suppressor for right-drag
 * }} [opts]
 */
export function createInput({ screenToGround = null, canvas = null } = {}) {
  const machine = createInputMachine({ toGround: screenToGround });

  function viewport() {
    return {
      w: typeof window !== 'undefined' ? window.innerWidth : 1,
      h: typeof window !== 'undefined' ? window.innerHeight : 1,
    };
  }

  function onKeyDown(e) {
    machine.handleKeyDown(e.key);
  }
  function onKeyUp(e) {
    machine.handleKeyUp(e.key);
  }
  function onPointerDown(e) {
    const { w, h } = viewport();
    machine.pointerDown({
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      pointerType: e.pointerType || 'mouse',
      viewportW: w,
      viewportH: h,
    });
  }
  function onPointerMove(e) {
    const { w, h } = viewport();
    machine.pointerMove({ id: e.pointerId, x: e.clientX, y: e.clientY, viewportW: w, viewportH: h });
  }
  function onPointerUp(e) {
    machine.pointerUp(e.pointerId);
  }
  function onBlur() {
    machine.blur();
  }
  function onContextMenu(e) {
    // Right-drag orbits; the context menu must not eat the gesture.
    e.preventDefault();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', onBlur);
    if (canvas && typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('contextmenu', onContextMenu);
    }
  }

  function dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onBlur);
      if (canvas && typeof canvas.removeEventListener === 'function') {
        canvas.removeEventListener('contextmenu', onContextMenu);
      }
    }
  }

  return {
    machine,
    update: (dt, ctx) => machine.update(dt, ctx),
    consumeOrbit: () => machine.consumeOrbit(),
    get state() { return machine.state; },
    get move() { return machine.move; },
    // World-space move vector for the avatar: screen-space intent rotated by
    // the camera yaw (game-design §1).
    moveVector(cameraYaw) { return cameraRelativeMove(machine.move, cameraYaw); },
    dispose,
  };
}
