// Generic object pool (tech-architecture §1: "Object pooling everywhere:
// props, particles, floaters, rival crumbs. Zero allocations in the frame
// loop"). A pool owns a free-list of pre-created objects; acquire() pops one
// (creating only when the free-list is empty, which after preallocation
// should never happen in the frame loop) and release() resets it and pushes
// it back. No per-acquire/release allocation: the free-list is a plain array
// used as a stack and the active set is a Set (add/delete don't allocate).
//
// Pure JS — no THREE, no DOM — so a bare `import` of this file never throws
// in Node and every behavior is headless-testable.

/**
 * @param {{
 *   create: () => object,          // factory for a fresh pooled object
 *   reset?: (obj: object) => void, // called on release() to restore defaults
 *   initialSize?: number,          // pre-created objects at construction
 * }} opts
 */
export function createPool({ create, reset = null, initialSize = 0 } = {}) {
  if (typeof create !== 'function') {
    throw new Error('createPool requires a create() factory');
  }

  const freeList = [];
  const active = new Set();
  let total = 0;

  function preallocate(n) {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    for (let i = 0; i < count; i += 1) {
      freeList.push(create());
      total += 1;
    }
  }

  preallocate(initialSize);

  function acquire() {
    let obj;
    if (freeList.length > 0) {
      obj = freeList.pop();
    } else {
      // Free-list exhausted: grow by one. After correct preallocation this
      // path is cold-start-only, never per-frame.
      obj = create();
      total += 1;
    }
    active.add(obj);
    return obj;
  }

  function release(obj) {
    // Releasing an object this pool doesn't currently own is a no-op (rather
    // than a throw) so double-release bugs degrade to silence instead of
    // crashing the frame loop; the active-set guard also keeps foreign
    // objects out of the free-list.
    if (!active.delete(obj)) return;
    if (reset) reset(obj);
    freeList.push(obj);
  }

  // Returns every live object to the free-list. Used on level teardown.
  function releaseAll() {
    for (const obj of active) {
      if (reset) reset(obj);
      freeList.push(obj);
    }
    active.clear();
  }

  return {
    acquire,
    release,
    releaseAll,
    preallocate,
    get size() { return total; },       // total objects ever created
    get activeCount() { return active.size; },
    get freeCount() { return freeList.length; },
  };
}
