// Uniform-grid spatial hash — the single source of truth for proximity
// (tech-architecture §2). Swallow checks, rival targeting, cluster scoring,
// vacuum pulls, minimap dots, and the camera look-ahead all query this one
// structure instead of scanning the prop array per agent.
//
// COORDINATE CONTRACT (lesson B7): the world is a square centered on the
// origin (0, 0) with extents ±worldSize/2 on both axes; x and z are world
// units, y is ignored (ground-plane proximity only). Items are the same prop
// objects the rest of the game uses: each must expose `position: {x, z}`
// (a THREE.Vector3 or any plain object with numeric x/z).
//
// Mechanism: items are bucketed into a Map keyed by integer cell coordinates.
// A radius query visits only the cells the query circle overlaps, so cost is
// O(cells overlapped + items found) instead of O(all props). Moved props are
// re-inserted incrementally via update(), which only touches the Map when the
// item actually crossed a cell boundary.
//
// Pure JS — no THREE, no DOM — so a bare `import` never throws in Node and
// every behavior is headless-testable.

const DEFAULT_CELL_SIZE = 100;

export function createSpatialHash({ cellSize = DEFAULT_CELL_SIZE, clusterCellSize = 0 } = {}) {
  const cell = cellSize > 0 ? cellSize : DEFAULT_CELL_SIZE;
  // Clusters are bucketed on a coarser grid than proximity cells so a
  // "cluster" means "a few city blocks' worth", not "one hash cell".
  const clusterCell = clusterCellSize > 0 ? clusterCellSize : cell * 3;

  const cells = new Map();    // cellKey -> Set<item>
  const itemCell = new Map(); // item -> cellKey (for O(1) remove/update)

  function keyFor(x, z) {
    return `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  }

  function insert(item) {
    const key = keyFor(item.position.x, item.position.z);
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = new Set();
      cells.set(key, bucket);
    }
    bucket.add(item);
    itemCell.set(item, key);
  }

  function remove(item) {
    const key = itemCell.get(item);
    if (key === undefined) return false;
    const bucket = cells.get(key);
    if (bucket) {
      bucket.delete(item);
      if (bucket.size === 0) cells.delete(key);
    }
    itemCell.delete(item);
    return true;
  }

  // Re-bucket an item whose position changed. Cheap no-op when the item is
  // still inside its previous cell — this is what makes per-frame incremental
  // maintenance viable (tech §2: "only moved props re-insert").
  function update(item) {
    const key = keyFor(item.position.x, item.position.z);
    if (itemCell.get(item) === key) return false;
    remove(item);
    insert(item);
    return true;
  }

  // Allocation-free radius query: fills `out` with every item whose position
  // lies within r of (x, z) and returns the count written. `out` is cleared
  // first (length = 0, not re-created).
  function queryInto(x, z, r, out) {
    out.length = 0;
    const rSq = r * r;
    const minCX = Math.floor((x - r) / cell);
    const maxCX = Math.floor((x + r) / cell);
    const minCZ = Math.floor((z - r) / cell);
    const maxCZ = Math.floor((z + r) / cell);
    for (let cx = minCX; cx <= maxCX; cx += 1) {
      for (let cz = minCZ; cz <= maxCZ; cz += 1) {
        const bucket = cells.get(`${cx},${cz}`);
        if (!bucket) continue;
        for (const item of bucket) {
          const dx = item.position.x - x;
          const dz = item.position.z - z;
          if (dx * dx + dz * dz <= rSq) out.push(item);
        }
      }
    }
    return out.length;
  }

  // Convenience wrapper around queryInto for call sites that don't keep a
  // scratch array. Hot per-frame call sites should prefer queryInto.
  function query(x, z, r) {
    const out = [];
    queryInto(x, z, r, out);
    return out;
  }

  // Cluster scoring, shared by the camera look-ahead compass and the rival
  // raid-AI (game-design §2 "edge look-ahead" / §4 Bandit archetype): items
  // within r of (x, z) are bucketed onto the coarse cluster grid; each bucket
  // that holds at least `minCount` items is returned with its item centroid,
  // item count, and summed mass, sorted highest-score first. Score defaults
  // to count; pass `scoreBy: 'mass'` to rank by summed mass instead.
  function queryClusters(x, z, r, { minCount = 3, scoreBy = 'count' } = {}) {
    const buckets = new Map(); // coarseKey -> {sx, sz, count, mass}
    const rSq = r * r;
    const minCX = Math.floor((x - r) / cell);
    const maxCX = Math.floor((x + r) / cell);
    const minCZ = Math.floor((z - r) / cell);
    const maxCZ = Math.floor((z + r) / cell);
    for (let cx = minCX; cx <= maxCX; cx += 1) {
      for (let cz = minCZ; cz <= maxCZ; cz += 1) {
        const bucket = cells.get(`${cx},${cz}`);
        if (!bucket) continue;
        for (const item of bucket) {
          const dx = item.position.x - x;
          const dz = item.position.z - z;
          if (dx * dx + dz * dz > rSq) continue;
          const ckey = `${Math.floor(item.position.x / clusterCell)},${Math.floor(item.position.z / clusterCell)}`;
          let agg = buckets.get(ckey);
          if (!agg) {
            agg = { sx: 0, sz: 0, count: 0, mass: 0 };
            buckets.set(ckey, agg);
          }
          agg.sx += item.position.x;
          agg.sz += item.position.z;
          agg.count += 1;
          agg.mass += typeof item.mass === 'number' ? item.mass : 0;
        }
      }
    }
    const clusters = [];
    for (const agg of buckets.values()) {
      if (agg.count < minCount) continue;
      clusters.push({
        x: agg.sx / agg.count,
        z: agg.sz / agg.count,
        count: agg.count,
        mass: agg.mass,
        score: scoreBy === 'mass' ? agg.mass : agg.count,
      });
    }
    clusters.sort((a, b) => b.score - a.score);
    return clusters;
  }

  function clear() {
    cells.clear();
    itemCell.clear();
  }

  return {
    insert,
    remove,
    update,
    query,
    queryInto,
    queryClusters,
    clear,
    get size() { return itemCell.size; },
    get cellSize() { return cell; },
  };
}
