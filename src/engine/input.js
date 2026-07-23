// Movement input: polls WASD/arrow keys plus pointer-drag (mirroring the old
// game's approach — keys override pointer input when active) and exposes
// normalized -1..1 `dx`/`dz` axes. Convention: dx > 0 is world +X (right),
// dz > 0 is world +Z; W/ArrowUp drives dz negative (three.js's default
// "forward" is -Z), S/ArrowDown drives dz positive, A/ArrowLeft drives dx
// negative, D/ArrowRight drives dx positive.
//
// Testability: handleKeyDown/handleKeyUp are exported as pure functions
// separate from the real window.addEventListener registration, so a later
// test stage can call them directly with a plain keys-map, no window/DOM
// needed. Deviation from the literal `handleKeyDown(key)` single-arg spec
// text: a single-argument function cannot be pure (it would have to mutate
// module-level state as a side effect). Instead these take the current keys
// map as their first argument and return a new keys map
// (`handleKeyDown(keys, key) -> newKeys`), which IS pure/deterministic and
// still fully decouples the key-state transition from any window/event
// plumbing. createInput() below is the (impure, real) consumer that owns a
// keys map and calls these on real keydown/keyup events.
//
// No browser-only API (window) is touched at module top level — only inside
// createInput() — so a bare `import` of this file never throws in Node.

export function handleKeyDown(keys, key) {
  const next = { ...keys };
  next[key.toLowerCase()] = true;
  return next;
}

export function handleKeyUp(keys, key) {
  const next = { ...keys };
  next[key.toLowerCase()] = false;
  return next;
}

// Pure: given a keys map, compute the {dx, dz} axis pair from WASD/arrows.
// Diagonal input is normalized so it isn't faster than cardinal movement
// (same as the old game: `const l=Math.hypot(mx,my); hole.x+=mx/l*...`).
export function axesFromKeys(keys) {
  let mx = 0;
  let mz = 0;
  if (keys['w'] || keys['arrowup']) mz -= 1;
  if (keys['s'] || keys['arrowdown']) mz += 1;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (mx === 0 && mz === 0) return null;
  const len = Math.hypot(mx, mz);
  return { dx: mx / len, dz: mz / len };
}

// Pure: given a pointer screen position and viewport size, compute the
// {dx, dz} axis pair as a screen-center-relative direction, magnitude capped
// at 1. This is the decoupled equivalent of the old game's pointer-follow
// (`wx = cam.x - W/2 + pointer.x; ...`) — that formula is "camera position +
// screen-space offset from center", which is approximately "screen-space
// offset from center" whenever the camera is following the avatar (as the
// chase camera here does), so this stays faithful without input.js needing
// to know about the camera or world position.
export function axesFromPointer(pointerX, pointerY, viewportW, viewportH) {
  const cx = viewportW / 2;
  const cy = viewportH / 2;
  const ddx = pointerX - cx;
  const ddy = pointerY - cy;
  const d = Math.hypot(ddx, ddy);
  const DEAD_ZONE = 2;
  if (d <= DEAD_ZONE) return { dx: 0, dz: 0 };
  const range = Math.max(1, Math.min(viewportW, viewportH) / 2);
  const mag = Math.min(1, d / range);
  return { dx: (ddx / d) * mag, dz: (ddy / d) * mag };
}

export function createInput() {
  let keys = {};
  const pointer = { x: 0, y: 0, active: false };
  let dx = 0;
  let dz = 0;

  function recompute() {
    const fromKeys = axesFromKeys(keys);
    if (fromKeys) {
      dx = fromKeys.dx;
      dz = fromKeys.dz;
      return;
    }
    if (pointer.active && typeof window !== 'undefined') {
      const a = axesFromPointer(pointer.x, pointer.y, window.innerWidth, window.innerHeight);
      dx = a.dx;
      dz = a.dz;
      return;
    }
    dx = 0;
    dz = 0;
  }

  function onKeyDown(e) {
    keys = handleKeyDown(keys, e.key);
    recompute();
  }
  function onKeyUp(e) {
    keys = handleKeyUp(keys, e.key);
    recompute();
  }
  function onPointerMove(e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    recompute();
  }
  function onPointerDown(e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    recompute();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
  }

  function dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
    }
  }

  return {
    get dx() { return dx; },
    get dz() { return dz; },
    dispose,
  };
}
