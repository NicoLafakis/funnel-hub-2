// Screen-space corner minimap (game-design.md §2): a ~96px canvas-2D overlay
// showing dots for edible clusters, gold for goldens, red for rivals, and the
// landmark icon — the single biggest fix for "couldn't see anything" that
// doesn't touch the camera at all.
//
// Mercy rule (game-design.md §6): after 3 fails on a level, the minimap
// unlocks a HEATMAP of remaining mass for that attempt. This module only
// exposes setHeatmap(props) — overlays/main decide WHEN to call it.
//
// COORDINATE CONTRACT (lesson B7 — written down, per the lesson): all input
// positions are WORLD coordinates in the centered-origin system the 3D world
// uses: x/z in [-worldSize/2, +worldSize/2], origin at world center. The map
// is north-up and static (world -z is up on the canvas).
//
// No DOM is touched at module top level — only inside createMinimap() — so a
// bare dynamic import of this file never throws outside a browser.

const DEFAULT_SIZE = 96;
// Heatmap grid resolution (cells per side). Coarse on purpose: it's a "where
// is the food" hint, not a radar.
const HEAT_CELLS = 16;

export function createMinimap({ container, size = DEFAULT_SIZE } = {}) {
  if (!container) {
    // Return a harmless no-op handle rather than throwing — the minimap is a
    // nicety, never a reason to kill a run.
    return { update() {}, setHeatmap() {}, destroy() {} };
  }
  const doc = container.ownerDocument || document;
  const px = Math.max(48, Math.floor(size));

  const canvas = doc.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  canvas.className = 'minimap-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Heatmap state: null = off; array of {x, z, mass} = on (recomputed per draw).
  let heatmapProps = null;

  function toMap(x, z, worldSize) {
    const w = worldSize > 0 ? worldSize : 1;
    return {
      mx: ((x / w) + 0.5) * px,
      my: ((z / w) + 0.5) * px,
    };
  }

  function clampToEdge(mx, my, margin) {
    return {
      mx: Math.max(margin, Math.min(px - margin, mx)),
      my: Math.max(margin, Math.min(px - margin, my)),
    };
  }

  function drawHeatmap(worldSize) {
    if (!heatmapProps || !heatmapProps.length || !ctx) return;
    const cell = px / HEAT_CELLS;
    const massAt = new Float64Array(HEAT_CELLS * HEAT_CELLS);
    let maxMass = 0;
    for (const p of heatmapProps) {
      if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
      const { mx, my } = toMap(p.x, p.z, worldSize);
      const cx = Math.max(0, Math.min(HEAT_CELLS - 1, Math.floor(mx / cell)));
      const cy = Math.max(0, Math.min(HEAT_CELLS - 1, Math.floor(my / cell)));
      const i = cy * HEAT_CELLS + cx;
      massAt[i] += typeof p.mass === 'number' ? p.mass : 1;
      if (massAt[i] > maxMass) maxMass = massAt[i];
    }
    if (maxMass <= 0) return;
    for (let cy = 0; cy < HEAT_CELLS; cy += 1) {
      for (let cx = 0; cx < HEAT_CELLS; cx += 1) {
        const m = massAt[cy * HEAT_CELLS + cx];
        if (m <= 0) continue;
        const a = 0.12 + 0.5 * (m / maxMass);
        ctx.fillStyle = `rgba(255, 122, 89, ${a.toFixed(3)})`;
        ctx.fillRect(cx * cell, cy * cell, cell, cell);
      }
    }
  }

  function draw({ player, clusters, goldens, rivals, landmark, worldSize } = {}) {
    if (!ctx) return;
    const w = worldSize > 0 ? worldSize : 1;
    ctx.clearRect(0, 0, px, px);

    // Plate.
    ctx.fillStyle = 'rgba(16, 24, 32, 0.72)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, px, px, 12);
    else ctx.rect(0, 0, px, px);
    ctx.fill();

    drawHeatmap(w);

    const dot = (x, z, r, color) => {
      const { mx, my } = toMap(x, z, w);
      if (mx < -2 || mx > px + 2 || my < -2 || my > px + 2) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    };

    // Edible clusters — plain pale dots.
    if (Array.isArray(clusters)) {
      for (const c of clusters) {
        if (c && typeof c.x === 'number' && typeof c.z === 'number') dot(c.x, c.z, 1.6, 'rgba(127, 217, 232, 0.85)');
      }
    }
    // Goldens — gold, slightly bigger.
    if (Array.isArray(goldens)) {
      for (const g of goldens) {
        if (g && typeof g.x === 'number' && typeof g.z === 'number') dot(g.x, g.z, 2.4, '#f5c26b');
      }
    }
    // Rivals — red, biggest dot. You want to see these.
    if (Array.isArray(rivals)) {
      for (const r of rivals) {
        if (r && typeof r.x === 'number' && typeof r.z === 'number') dot(r.x, r.z, 3, '#ff5c5c');
      }
    }

    // Landmark — always visible, clamped to the map edge if it would clip.
    if (landmark && typeof landmark.x === 'number' && typeof landmark.z === 'number') {
      const raw = toMap(landmark.x, landmark.z, w);
      const { mx, my } = clampToEdge(raw.mx, raw.my, 8);
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏙️', mx, my);
    }

    // Player — white dot with a dark ring, drawn last (on top).
    if (player && typeof player.x === 'number' && typeof player.z === 'number') {
      const { mx, my } = toMap(player.x, player.z, w);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(16, 24, 32, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  let lastArgs = null;
  return {
    // Per-frame (or throttled) redraw. All fields optional; missing lists draw
    // as empty. See the coordinate contract in the header.
    update(args) {
      lastArgs = args || null;
      draw(lastArgs || {});
    },
    // Mercy-rule heatmap (game-design §6): pass the remaining edible props as
    // [{x, z, mass}] to show remaining-mass density; pass null to turn it off.
    setHeatmap(props) {
      heatmapProps = Array.isArray(props) ? props : null;
      if (lastArgs) draw(lastArgs);
    },
    destroy() {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      heatmapProps = null;
      lastArgs = null;
    },
  };
}
