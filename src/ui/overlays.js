// Overlay / HUD / shop wiring for index.html's existing DOM.
//
// Three exports:
//   - showOverlay(id) / hideOverlay(id) -- generic show/hide helpers that
//     toggle the SAME `.hidden` class index.html's CSS already defines for
//     every `.overlay` screen (#startScreen/#introScreen/#doneScreen/
//     #failScreen/#winScreen/#worldMapScreen/#shopScreen). No parallel
//     show/hide mechanism is invented here.
//   - renderShop(container, upgradeDefs, saveData, onBuy, onContinue) --
//     populates the shop's 5 upgrade tracks and wires its buy/continue flow.
//   - updateHUD(state) -- writes live run state into the existing HUD pills.
//
// No browser API is touched at module top level -- only inside these
// exported functions -- so a bare dynamic import of this file never throws
// outside a browser (per the engine's Node-testability contract).

// ---------------------------------------------------------------------------
// showOverlay / hideOverlay
// ---------------------------------------------------------------------------

export function showOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
}

export function hideOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// renderShop
// ---------------------------------------------------------------------------
//
// UPGRADE-DEFS CONTRACT (assumed): at the time this module was written,
// src/meta/upgrades.js had not yet landed on disk (parallel work-in-progress),
// so this module is coded defensively against the shape implied by the task
// brief (5 upgrade tracks: Size, Speed, Magnet, Time Extension, Growth Rate)
// rather than against a concrete file. Reconcile with the real
// src/meta/upgrades.js once it lands if its shape differs from the below.
//
//   Each entry of the `upgradeDefs` array is expected to look like:
//     {
//       id: 'size',            // stable key, matches saveData.upgrades[id]
//       name: 'Size',          // display label
//       icon: '🔵',            // optional emoji glyph shown before the name
//       description: '...',    // optional one-line blurb
//       maxTier: 5,            // number of purchasable tiers (tier pips)
//       costs: [100,250,500,900,1500],  // cost to buy tier i+1 (0-indexed)
//     }
//   Also tolerated in place of `costs`:
//     - `tiers: [{cost, ...}, ...]` (an object per tier, `.cost` read off it)
//     - `costForTier(nextTier)` -- a function, nextTier is 1-based
//
//   saveData.upgrades : object keyed by track id -> current purchased tier
//     (0 = not purchased yet), e.g. `{ size: 2, speed: 0, magnet: 1, ... }`.
//   saveData.coins : number -- current coin balance, used to enable/disable
//     buy buttons and to render #coinBalance.
//
//   onBuy(trackId) is called when a track's buy button is clicked (only ever
//   enabled when affordable and not already maxed) -- the caller owns
//   deducting coins / persisting saveData / re-invoking renderShop to refresh.
//   onContinue() is called when #shopContinueBtn is clicked.

function trackMaxTier(track) {
  if (Array.isArray(track.tiers)) return track.tiers.length;
  if (Array.isArray(track.costs)) return track.costs.length;
  return typeof track.maxTier === 'number' ? track.maxTier : 0;
}

function trackCostForTier(track, tierNumber) {
  // tierNumber is 1-based: the cost to go from (tierNumber-1) -> tierNumber.
  if (Array.isArray(track.tiers)) {
    const entry = track.tiers[tierNumber - 1];
    if (entry == null) return null;
    return typeof entry === 'object' ? entry.cost : entry;
  }
  if (Array.isArray(track.costs)) {
    const c = track.costs[tierNumber - 1];
    return typeof c === 'number' ? c : null;
  }
  if (typeof track.costForTier === 'function') return track.costForTier(tierNumber);
  return null;
}

function currentTierOf(saveData, trackId) {
  const upgrades = saveData && saveData.upgrades;
  if (!upgrades || typeof upgrades[trackId] !== 'number') return 0;
  return upgrades[trackId];
}

function ensureShopStyles(doc) {
  const STYLE_ID = 'shop-injected-styles';
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .shoptrack-info{display:flex;flex-direction:column;gap:2px;text-align:left;min-width:0;}
    .shoptrack-name{color:#fff;font-weight:700;font-size:14.5px;}
    .shoptrack-desc{color:#9fb4c2;font-size:12px;}
    .shoptrack-pips{display:flex;gap:4px;margin-top:4px;}
    .tier-pip{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.18);
      border:1px solid rgba(255,255,255,.3);}
    .tier-pip.filled{background:var(--gold,#f5c26b);border-color:var(--gold,#f5c26b);}
    .shoptrack-buy{flex:0 0 auto;background:linear-gradient(135deg,var(--orange,#ff5c35),var(--coral,#ff7a59));
      color:#fff;border:none;padding:9px 18px;font-size:13px;font-weight:800;border-radius:999px;
      cursor:pointer;white-space:nowrap;transition:transform .12s,opacity .12s;}
    .shoptrack-buy:hover:not(:disabled){transform:scale(1.05);}
    .shoptrack-buy:disabled{opacity:.4;cursor:not-allowed;background:rgba(255,255,255,.15);}
  `;
  doc.head.appendChild(style);
}

/**
 * @param {HTMLElement} container - expected: the #shopTracks element. The
 *   #coinBalance and #shopContinueBtn siblings are looked up on
 *   container.ownerDocument directly since they live outside `container`.
 * @param {Array} upgradeDefs - see contract above.
 * @param {object} saveData - see contract above.
 * @param {(trackId:string)=>void} onBuy
 * @param {()=>void} onContinue
 */
export function renderShop(container, upgradeDefs, saveData, onBuy, onContinue) {
  if (!container) return;
  const doc = container.ownerDocument || document;
  ensureShopStyles(doc);

  const coins = (saveData && typeof saveData.coins === 'number') ? saveData.coins : 0;

  const coinBalanceEl = doc.getElementById('coinBalance');
  if (coinBalanceEl) coinBalanceEl.textContent = `🪙 ${coins}`;

  container.innerHTML = '';
  (upgradeDefs || []).forEach((track) => {
    const maxTier = trackMaxTier(track);
    const tier = currentTierOf(saveData, track.id);
    const maxed = maxTier > 0 && tier >= maxTier;
    const nextCost = maxed ? null : trackCostForTier(track, tier + 1);
    const affordable = !maxed && typeof nextCost === 'number' && coins >= nextCost;

    const row = doc.createElement('div');
    row.className = 'shoptrack';
    row.dataset.trackId = track.id;

    const info = doc.createElement('div');
    info.className = 'shoptrack-info';
    info.innerHTML = `
      <span class="shoptrack-name">${track.icon ? `${track.icon} ` : ''}${track.name || track.id}</span>
      ${track.description ? `<span class="shoptrack-desc">${track.description}</span>` : ''}
      <span class="shoptrack-pips">${Array.from({ length: maxTier }, (_, i) => (
        `<span class="tier-pip${i < tier ? ' filled' : ''}"></span>`
      )).join('')}</span>
    `;
    row.appendChild(info);

    const buyBtn = doc.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'shoptrack-buy';
    if (maxed) {
      buyBtn.textContent = 'MAXED';
      buyBtn.disabled = true;
    } else if (typeof nextCost === 'number') {
      buyBtn.textContent = `🪙 ${nextCost}`;
      buyBtn.disabled = !affordable;
    } else {
      buyBtn.textContent = 'BUY';
      buyBtn.disabled = true;
    }
    if (!buyBtn.disabled && typeof onBuy === 'function') {
      buyBtn.addEventListener('click', () => onBuy(track.id));
    }
    row.appendChild(buyBtn);

    container.appendChild(row);
  });

  const continueBtn = doc.getElementById('shopContinueBtn');
  if (continueBtn) {
    // Re-rendering the shop (e.g. after a purchase) must not accumulate
    // duplicate click listeners on this button, since it lives outside
    // `container` and is therefore never cleared by container.innerHTML.
    // Cloning strips any previously-attached listeners in one shot.
    const freshBtn = continueBtn.cloneNode(true);
    continueBtn.replaceWith(freshBtn);
    if (typeof onContinue === 'function') {
      freshBtn.addEventListener('click', () => onContinue());
    }
  }
}

// ---------------------------------------------------------------------------
// updateHUD
// ---------------------------------------------------------------------------
//
// `state` fields (all optional -- only the fields present are written, so
// partial per-frame updates are safe):
//   levelName : string  -- display text for #levelTag, e.g. "Level 23 · Tech
//                           Quarter" (caller formats the full label; this
//                           function does not compose it from parts).
//   timer     : number  -- seconds remaining. Rendered as "⏱ {seconds}"
//                           (matches the original "⏱ 60" convention) and
//                           toggles the existing `#timer.warn` CSS class
//                           (pulsing red) once <= 10s remain.
//   mass      : number  -- current avatar mass.
//   target    : number  -- this level's target mass (formulas.js `target(n)`).
//                           Combined with `mass` to render #score as
//                           "Mass <b>X</b> / Y" (the original convention) and
//                           to drive #scorefill's width as a percentage.
//   coins     : number  -- coins collected so far this run. There is no
//                           dedicated in-run coin readout in the current HUD
//                           markup, so this reuses #sizehint (the one
//                           remaining HUD pill) to surface it; #sizehint
//                           keeps its default swallow-hint text whenever
//                           `coins` is not provided.
export function updateHUD(state = {}) {
  const levelTagEl = document.getElementById('levelTag');
  const timerEl = document.getElementById('timer');
  const scoreEl = document.getElementById('score');
  const scorefillEl = document.getElementById('scorefill');
  const sizehintEl = document.getElementById('sizehint');

  if (levelTagEl && state.levelName != null) {
    levelTagEl.textContent = state.levelName;
  }

  if (timerEl && state.timer != null) {
    const secs = Math.max(0, Math.ceil(state.timer));
    timerEl.textContent = `⏱ ${secs}`;
    timerEl.classList.toggle('warn', secs <= 10);
  }

  const hasMass = state.mass != null;
  const hasTarget = state.target != null;
  if (scoreEl && (hasMass || hasTarget)) {
    const mass = hasMass ? Math.floor(state.mass) : 0;
    const target = hasTarget ? state.target : 0;
    scoreEl.innerHTML = `Mass <b>${mass}</b> / ${target}`;
  }
  if (scorefillEl && hasTarget && state.target > 0) {
    const mass = hasMass ? state.mass : 0;
    const pct = Math.max(0, Math.min(100, (mass / state.target) * 100));
    scorefillEl.style.width = `${pct}%`;
  }

  if (sizehintEl && state.coins != null) {
    sizehintEl.textContent = `🪙 ${state.coins} collected`;
  }
}
