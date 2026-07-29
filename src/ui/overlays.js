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
//   - renderSkins(container, skinDefs, onBuy, onEquip) -- populates the shop's
//     avatar-skin rows, reusing the SAME .shoptrack row idiom as the upgrade
//     tracks (no second design language is introduced).
//   - renderCollection(container, entries) -- populates the Skyline-opedia
//     album grid (icon cards; locked entries dim to a silhouette).
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
    /* Skin rows reuse .shoptrack wholesale; these are the only two additions --
       the equip action (teal, so "own it" reads differently from "buy it") and
       the two-tone swatch that previews the skin's core + rim colors. */
    .shoptrack-buy.equip{background:linear-gradient(135deg,var(--teal,#00a4bd),#7fd9e8);color:#0b1a20;}
    .shoptrack-buy.equipped{background:rgba(0,164,189,.22);border:1px solid var(--teal,#00a4bd);color:#7fd9e8;opacity:1;}
    .skin-swatch{flex:0 0 auto;width:26px;height:26px;border-radius:50%;margin-right:10px;
      box-shadow:0 0 10px rgba(0,0,0,.5) inset;}
    .shoptrack.skinrow{align-items:center;}
    .shoptrack.skinrow.locked .shoptrack-name{color:#9fb4c2;}
    .shoptrack.skinrow.locked .skin-swatch{filter:grayscale(.75);opacity:.55;}
    .shoptrack-unlock{color:#7fd9e8;font-size:11.5px;font-style:italic;}
    /* Generated pixel-art icons (32x32 PNGs from assets/icons/) — rendered at
       an integer-ish size with nearest-neighbor scaling so the pixels stay
       crisp instead of smearing. */
    .shopicon{width:24px;height:24px;image-rendering:pixelated;vertical-align:-6px;margin-right:6px;}
    /* Skyline-opedia collection cards. Locked entries dim the icon to a
       silhouette — same locked-state idiom as the skin rows above. */
    .opedia-card{display:flex;flex-direction:column;align-items:center;gap:4px;
      background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
      border-radius:12px;padding:12px 8px;text-align:center;}
    .opedia-icon{width:48px;height:48px;image-rendering:pixelated;}
    span.opedia-icon{font-size:34px;line-height:48px;}
    .opedia-name{color:#fff;font-weight:700;font-size:12.5px;}
    .opedia-count{color:var(--gold,#f5c26b);font-size:11.5px;font-weight:700;}
    .opedia-flavor{color:#9fb4c2;font-size:10.5px;font-style:italic;line-height:1.3;}
    .opedia-card.locked .opedia-icon{filter:grayscale(1) brightness(.35);opacity:.6;}
    .opedia-card.locked .opedia-name,.opedia-card.locked .opedia-count{color:#5a7184;}
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
    // Generated pixel-art icon (track.iconSrc) takes precedence; the emoji
    // glyph stays as the no-manifest fallback so a missing icon renders
    // exactly what rendered before (never a broken-image glyph).
    const glyph = track.iconSrc
      ? `<img class="shopicon" src="${track.iconSrc}" alt="">`
      : (track.icon ? `${track.icon} ` : '');
    info.innerHTML = `
      <span class="shoptrack-name">${glyph}${track.name || track.id}</span>
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
// renderSkins
// ---------------------------------------------------------------------------
//
// Avatar vortex skins (src/meta/skins.js), rendered into the shop with the
// EXACT same row idiom as the upgrade tracks above -- `.shoptrack` +
// `.shoptrack-info` + `.shoptrack-buy`, same gold/orange/teal palette, same
// pill button. The only two additions are `.skin-swatch` (a two-tone dot
// previewing the skin's core and rim colors) and the teal equip button, both
// styled in ensureShopStyles alongside the rest.
//
// This function is deliberately dumb: it renders prepared rows and reports
// clicks. Ownership, affordability and unlock evaluation all live in the meta
// layer, exactly as `renderShop` leaves coin deduction to its caller.
//
//   Each entry of `skinDefs`:
//     {
//       id:          'supernova',        // stable skin id
//       name:        'Supernova',
//       icon:        '☀️',               // optional glyph before the name
//       description: '...',              // one-line blurb
//       coreColor:   '#fff2cc',          // swatch center  (CSS color string)
//       rimColor:    '#ffc247',          // swatch ring    (CSS color string)
//       owned:       false,
//       equipped:    false,
//       price:       1200,               // number, or null if not coin-bought
//       affordable:  true,               // caller compares price vs coins
//       unlockText:  '🏆 Earn ...'       // HOW it unlocks; shown while locked
//     }
//
//   onBuy(skinId)   -- only wired on an unowned, affordable, coin-priced row.
//   onEquip(skinId) -- only wired on an owned, not-currently-equipped row.
//
// The caller owns deducting coins / persisting / re-invoking renderSkins.
export function renderSkins(container, skinDefs, onBuy, onEquip) {
  if (!container) return;
  const doc = container.ownerDocument || document;
  ensureShopStyles(doc);

  container.innerHTML = '';
  (skinDefs || []).forEach((skin) => {
    const owned = !!skin.owned;
    const equipped = !!skin.equipped;
    const price = typeof skin.price === 'number' ? skin.price : null;

    const row = doc.createElement('div');
    row.className = `shoptrack skinrow${owned ? '' : ' locked'}`;
    row.dataset.skinId = skin.id;

    const swatch = doc.createElement('span');
    swatch.className = 'skin-swatch';
    // Core color at the center fading into the rim color at the edge -- the
    // same read the actual avatar gives from the chase camera.
    swatch.style.background = `radial-gradient(circle at 38% 34%, ${skin.coreColor || '#888'} 0%, ${skin.coreColor || '#888'} 42%, ${skin.rimColor || '#ccc'} 100%)`;
    row.appendChild(swatch);

    const info = doc.createElement('div');
    info.className = 'shoptrack-info';
    info.innerHTML = `
      <span class="shoptrack-name">${skin.icon ? `${skin.icon} ` : ''}${skin.name || skin.id}</span>
      ${skin.description ? `<span class="shoptrack-desc">${skin.description}</span>` : ''}
      ${!owned && skin.unlockText ? `<span class="shoptrack-unlock">${skin.unlockText}</span>` : ''}
    `;
    row.appendChild(info);

    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'shoptrack-buy';
    if (equipped) {
      btn.textContent = 'EQUIPPED';
      btn.classList.add('equipped');
      btn.disabled = true;
    } else if (owned) {
      btn.textContent = 'EQUIP';
      btn.classList.add('equip');
      if (typeof onEquip === 'function') {
        btn.addEventListener('click', () => onEquip(skin.id));
      }
    } else if (price != null) {
      btn.textContent = `🪙 ${price}`;
      btn.disabled = !skin.affordable;
      if (!btn.disabled && typeof onBuy === 'function') {
        btn.addEventListener('click', () => onBuy(skin.id));
      }
    } else {
      // Achievement / milestone skin: there is nothing to click, and the
      // unlock line above already says exactly what earns it.
      btn.textContent = '🔒 LOCKED';
      btn.disabled = true;
    }
    row.appendChild(btn);

    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// renderCollection
// ---------------------------------------------------------------------------
//
// Skyline-opedia album cards (one per collection registry entry). Like
// renderShop/renderSkins this is deliberately dumb: the caller (main.js)
// prepares fully-resolved entries; this renders them.
//
//   Each entry of `entries`:
//     {
//       id:       'building-large',   // collection kind key
//       name:     'Building Large',   // display label (shown when unlocked)
//       unlocked: true,               // ever swallowed at least one
//       count:    12,                 // total swallowed (unlocked only)
//       iconSrc:  'assets/icons/collection/building-large.png' | null,
//       flavor:   '...'               // album quip line (unlocked only)
//     }
//
// Locked entries show the icon dimmed to a silhouette and '???' for the name
// (the shop's locked-row idiom); a null iconSrc falls back to a glyph, so a
// missing icon can never render a broken image.
export function renderCollection(container, entries) {
  if (!container) return;
  const doc = container.ownerDocument || document;
  ensureShopStyles(doc);

  container.innerHTML = '';
  (entries || []).forEach((entry) => {
    const unlocked = !!entry.unlocked;
    const card = doc.createElement('div');
    card.className = `opedia-card${unlocked ? '' : ' locked'}`;
    card.dataset.entryId = entry.id;
    const iconHtml = entry.iconSrc
      ? `<img class="opedia-icon" src="${entry.iconSrc}" alt="">`
      : `<span class="opedia-icon">${unlocked ? '🌀' : '❔'}</span>`;
    card.innerHTML = `
      ${iconHtml}
      <span class="opedia-name">${unlocked ? (entry.name || entry.id) : '???'}</span>
      <span class="opedia-count">${unlocked ? `×${entry.count || 0}` : 'Not yet swallowed'}</span>
      ${unlocked && entry.flavor ? `<span class="opedia-flavor">${entry.flavor}</span>` : ''}
    `;
    container.appendChild(card);
  });
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
