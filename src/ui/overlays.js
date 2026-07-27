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

import { formatCompact, formatGain } from './format.js';

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
      border:1.5px solid rgba(28,39,51,.55);}
    .tier-pip.filled{background:var(--gold,#f5c26b);border-color:#1c2733;}
    .shoptrack-buy{flex:0 0 auto;background:linear-gradient(180deg,var(--coral,#ff7a59),var(--orange,#ff5c35));
      color:#fff;border:2.5px solid #1c2733;box-shadow:0 3px 0 rgba(28,39,51,.35);padding:9px 18px;
      font-size:13px;font-weight:800;letter-spacing:.3px;border-radius:999px;
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
    // Both sides go through the SHARED compact formatter (format.js). Mass
    // reaches 10,000,000 by level 100, and `Mass 1234500 / 10000000` cannot
    // be read at a glance while steering. Abbreviating only ONE of the pair —
    // or abbreviating the "+N" float but not this — would be worse than either
    // choice made consistently, which is the whole reason the formatter is
    // shared rather than local to the float. formatCompact TRUNCATES, so this
    // readout can never show a target reached one frame before it is.
    const mass = formatCompact(hasMass ? state.mass : 0);
    const target = formatCompact(hasTarget ? state.target : 0);
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

// ---------------------------------------------------------------------------
// V2 additions (content-and-meta.md §3/§5, game-design.md §6, tech §6)
// ---------------------------------------------------------------------------
//
//   - renderBuildShop(container, viewModel, handlers) — the V2 shop: mutually
//     exclusive build picks per tier + respec. `viewModel` comes from
//     src/meta/upgrades.js buildShopViewModel(saveData); this renderer stays
//     dumb (no effect math, no save spelunking).
//   - initResponsiveFlags() / isReducedMotion() — prefers-reduced-motion
//     surfaced as a `data-reduced-motion` attribute on <html> (CSS media
//     query in index.html kills animations; main.js reads the same attribute
//     to skip screen shake / slow-mo / debris streams).
//   - applyIntroLine(levelDef) — the one-line mechanic intro on the district
//     card (never a modal). Defensive read of levelDef.introLine.
//   - showOneLiner(text, ms) — a single non-modal line (first-rival intro,
//     onboarding beats' text).
//   - showOnboardingBeat(beat) / hideOnboarding() — level-1 staged tutorial UI.
//   - renderFailMercy(failInfo, handlers) — mercy rules on the fail screen:
//     first fail offers a free +15s "second wind"; 3+ fails note the pity
//     magnet + heatmap unlock.
//   - setDuelistTelegraph(angle | null) — screen-edge direction indicator for
//     an approaching bigger Duelist (game-design §4).
//   - setLockBadge({x, y} | null) — wedge-wobble "not yet" lock badge
//     (game-design §3), positioned in CSS pixels.
//   - setSizePill({x, y, size, visible}) — the Hole.io-style "Size N" pill
//     pinned under the player hole, positioned in CSS pixels.

function ensureV2Styles(doc) {
  const STYLE_ID = 'overlays-v2-injected-styles';
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .buildtier{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
      border-radius:12px;padding:10px 14px;text-align:left;}
    .buildtier.locked{border-color:rgba(245,194,107,.45);}
    .buildtier-head{display:flex;justify-content:space-between;align-items:center;gap:8px;
      color:#fff;font-weight:800;font-size:13px;letter-spacing:.5px;text-transform:uppercase;}
    .buildtier-price{color:var(--gold,#f5c26b);font-size:12.5px;}
    .buildtier-locktag{color:var(--gold,#f5c26b);font-size:11.5px;}
    .buildtier-picks{display:flex;flex-direction:column;gap:8px;margin-top:8px;}
    .buildpick{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;text-align:left;
      background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.16);border-radius:12px;
      color:#fff;padding:9px 12px;font-family:inherit;cursor:pointer;transition:background .12s,border-color .12s;}
    .buildpick:hover:not(:disabled){background:rgba(0,164,189,.2);}
    .buildpick:disabled{opacity:.45;cursor:not-allowed;}
    .buildpick.picked{border-color:#1c2733;background:rgba(245,194,107,.16);opacity:1;}
    .buildpick-icon{font-size:18px;flex:0 0 auto;}
    .buildpick-text{display:flex;flex-direction:column;gap:1px;min-width:0;}
    .buildpick-name{font-weight:700;font-size:13.5px;}
    .buildpick-desc{color:#9fb4c2;font-size:12px;line-height:1.3;}
    #respecBtn{margin-top:12px;min-height:44px;background:transparent;color:#7fd9e8;
      border:2.5px solid var(--teal,#00a4bd);padding:9px 22px;font-size:13px;font-weight:700;
      border-radius:999px;cursor:pointer;transition:background .12s,opacity .12s;}
    #respecBtn:hover:not(:disabled){background:rgba(0,164,189,.15);}
    #respecBtn:disabled{opacity:.35;cursor:not-allowed;}
    .mercy-box{display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:16px;}
    #secondWindBtn{margin-top:0;background:linear-gradient(135deg,var(--teal,#00a4bd),#2ecc71);}
    #mercyNote{color:#7fd9e8;font-size:13px;max-width:420px;line-height:1.45;}
    #mercyNote b{color:var(--gold,#f5c26b);}
  `;
  doc.head.appendChild(style);
}

/**
 * Renders the V2 build shop into `container` (expected: #shopTracks). Sibling
 * elements #coinBalance, #respecBtn and #shopContinueBtn are looked up on
 * container.ownerDocument.
 *
 * @param {HTMLElement} container
 * @param {object} viewModel - buildShopViewModel(saveData) from
 *   src/meta/upgrades.js: { coins, tiers: [{ tier, price, lockedPickId,
 *   picks: [{ id, name, icon, description, affordable }] }],
 *   respec: { cost, affordable, hasBuild } }.
 * @param {object} handlers - { onPick(pickId), onRespec(), onContinue() }.
 *   The caller owns mutating the save, persisting, and re-invoking
 *   renderBuildShop to refresh.
 */
export function renderBuildShop(container, viewModel, handlers = {}) {
  if (!container) return;
  const doc = container.ownerDocument || document;
  ensureV2Styles(doc);

  const vm = viewModel && typeof viewModel === 'object' ? viewModel : {};
  const coins = typeof vm.coins === 'number' ? vm.coins : 0;
  const { onPick, onRespec, onContinue } = handlers;

  const coinBalanceEl = doc.getElementById('coinBalance');
  if (coinBalanceEl) coinBalanceEl.textContent = `🪙 ${coins}`;

  container.innerHTML = '';
  (Array.isArray(vm.tiers) ? vm.tiers : []).forEach((tier) => {
    const card = doc.createElement('div');
    card.className = 'buildtier' + (tier.lockedPickId ? ' locked' : '');

    const head = doc.createElement('div');
    head.className = 'buildtier-head';
    head.innerHTML = tier.lockedPickId
      ? `<span>Tier ${tier.tier}</span><span class="buildtier-locktag">🔒 LOCKED IN</span>`
      : `<span>Tier ${tier.tier}</span><span class="buildtier-price">🪙 ${tier.price} — pick one</span>`;
    card.appendChild(head);

    const picksWrap = doc.createElement('div');
    picksWrap.className = 'buildtier-picks';
    (Array.isArray(tier.picks) ? tier.picks : []).forEach((pick) => {
      const isPicked = tier.lockedPickId === pick.id;
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'buildpick' + (isPicked ? ' picked' : '');
      btn.disabled = tier.lockedPickId ? !isPicked : !pick.affordable;
      btn.innerHTML = `
        <span class="buildpick-icon">${pick.icon || ''}</span>
        <span class="buildpick-text">
          <span class="buildpick-name">${pick.name || pick.id}${isPicked ? ' ✓' : ''}</span>
          <span class="buildpick-desc">${pick.description || ''}</span>
        </span>
      `;
      if (!tier.lockedPickId && pick.affordable && typeof onPick === 'function') {
        btn.addEventListener('click', () => onPick(pick.id));
      }
      picksWrap.appendChild(btn);
    });
    card.appendChild(picksWrap);
    container.appendChild(card);
  });

  // Respec button (static element in index.html's #shopScreen) — clone-wire it
  // like the continue button so re-renders never stack listeners.
  const respecBtn = doc.getElementById('respecBtn');
  if (respecBtn) {
    const fresh = respecBtn.cloneNode(true);
    respecBtn.replaceWith(fresh);
    const respec = vm.respec && typeof vm.respec === 'object' ? vm.respec : {};
    fresh.style.display = respec.hasBuild ? '' : 'none';
    fresh.textContent = `🔁 RESPEC — 🪙 ${typeof respec.cost === 'number' ? respec.cost : 0} (10% of lifetime coins)`;
    fresh.disabled = !respec.hasBuild || !respec.affordable;
    if (!fresh.disabled && typeof onRespec === 'function') {
      fresh.addEventListener('click', () => onRespec());
    }
  }

  const continueBtn = doc.getElementById('shopContinueBtn');
  if (continueBtn) {
    const freshBtn = continueBtn.cloneNode(true);
    continueBtn.replaceWith(freshBtn);
    if (typeof onContinue === 'function') {
      freshBtn.addEventListener('click', () => onContinue());
    }
  }
}

// ---------------------------------------------------------------------------
// prefers-reduced-motion (tech-architecture.md §6)
// ---------------------------------------------------------------------------

function reducedMotionQuery() {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia('(prefers-reduced-motion: reduce)');
  } catch (e) {
    return null;
  }
}

export function isReducedMotion() {
  const mq = reducedMotionQuery();
  return !!(mq && mq.matches);
}

// Sets `data-reduced-motion="true"|"false"` on <html> and keeps it in sync.
// CSS in index.html honors both the attribute and the raw media query;
// main.js reads the same attribute to skip screen shake / slow-mo / debris.
// Call once at boot. Safe to call repeatedly.
export function initResponsiveFlags() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const apply = () => {
    document.documentElement.dataset.reducedMotion = isReducedMotion() ? 'true' : 'false';
  };
  apply();
  const mq = reducedMotionQuery();
  if (mq && typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', apply);
  } else if (mq && typeof mq.addListener === 'function') {
    mq.addListener(apply);
  }
}

// ---------------------------------------------------------------------------
// Onboarding & one-liners (content-and-meta.md §5 — never a modal)
// ---------------------------------------------------------------------------

// The one-line mechanic intro on the district card: consumes the level def's
// `introLine` field when present (defensive read — V1 level defs don't have
// it), writing into #introLine inside #introScreen. Hides the element when
// there's nothing to say.
export function applyIntroLine(levelDef) {
  const el = document.getElementById('introLine');
  if (!el) return;
  const line = levelDef && typeof levelDef.introLine === 'string' ? levelDef.introLine.trim() : '';
  if (line) {
    el.textContent = `🆕 ${line}`;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

// A single transient line, centered low on screen — used for the first-rival
// intro ("It eats too. Out-grow it.") and any other one-beat message that must
// never be a modal. Returns nothing; safe to call with any text.
export function showOneLiner(text, ms = 2200) {
  const el = document.getElementById('oneLiner');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showOneLiner._t);
  showOneLiner._t = setTimeout(() => el.classList.remove('show'), ms);
}

// Level-1 staged tutorial beats (content-and-meta.md §5):
//   1 — pointer hand + "eat the highlighted props" (main.js hides it after 10s)
//   2 — free roam line
//   3 — landmark tease: "grow to eat THAT" (main.js owns the camera cut)
// Unknown beats are ignored. hideOnboarding() clears everything.
//
// positionTutorialHand(pos|null): during beat 1, main.js projects the nearest
// highlighted edible prop's world position to screen each frame and pins the
// hand over it (CSS pixels). Pass null to release the hand back to its
// stylesheet position. The CSS pointBob animation keeps the bobbing motion at
// whatever point the hand is pinned to.
export function positionTutorialHand(pos) {
  const el = document.getElementById('tutHand');
  if (!el) return;
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
    el.style.left = '';
    el.style.top = '';
    el.style.bottom = '';
    return;
  }
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.style.bottom = 'auto';
}

export function showOnboardingBeat(beat) {
  const hand = document.getElementById('tutHand');
  const line = document.getElementById('oneLiner');
  if (beat === 1) {
    if (hand) hand.classList.add('show');
    showOneLiner('👆 Eat the highlighted props!', 10000);
  } else if (beat === 2) {
    if (hand) hand.classList.remove('show');
    positionTutorialHand(null);
    showOneLiner('Free roam — the city is your buffet.', 3000);
  } else if (beat === 3) {
    if (hand) hand.classList.remove('show');
    positionTutorialHand(null);
    showOneLiner('Grow to eat THAT 🏙️', 3000);
  } else if (line) {
    // unknown beat: say nothing rather than say something wrong
  }
}

export function hideOnboarding() {
  const hand = document.getElementById('tutHand');
  if (hand) hand.classList.remove('show');
  positionTutorialHand(null);
  const el = document.getElementById('oneLiner');
  if (el) el.classList.remove('show');
  clearTimeout(showOneLiner._t);
}

// ---------------------------------------------------------------------------
// Mercy rules UI (game-design.md §6)
// ---------------------------------------------------------------------------
//
// @param {object} failInfo - { failCount, secondWindAvailable, heatmapActive,
//   pityMagnetActive }. failCount is this level's consecutive fail count
//   BEFORE this fail (or total fails — caller's convention; only thresholds 1
//   and >=3 are read here).
// @param {object} handlers - { onSecondWind() } — wired to the second-wind
//   button when offered.
export function renderFailMercy(failInfo = {}, handlers = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;
  ensureV2Styles(doc);
  const windBtn = doc.getElementById('secondWindBtn');
  const note = doc.getElementById('mercyNote');
  const failCount = typeof failInfo.failCount === 'number' ? failInfo.failCount : 0;

  if (windBtn) {
    const fresh = windBtn.cloneNode(true);
    windBtn.replaceWith(fresh);
    const offer = !!failInfo.secondWindAvailable;
    fresh.classList.toggle('hidden', !offer);
    if (offer && typeof handlers.onSecondWind === 'function') {
      fresh.addEventListener('click', () => handlers.onSecondWind());
    }
  }

  if (note) {
    if (failCount >= 3) {
      note.innerHTML = `🧲 <b>Pity magnet engaged</b> for your next attempt — and the minimap's <b>heatmap</b> now shows where the remaining food is. The city feels bad. A little.`;
      note.classList.remove('hidden');
    } else if (failCount >= 1 && failInfo.secondWindAvailable) {
      note.innerHTML = `First one's free. Take the <b>+15s second wind</b> — no judgment. Well. Some judgment.`;
      note.classList.remove('hidden');
    } else {
      note.textContent = '';
      note.classList.add('hidden');
    }
  }
}

// ---------------------------------------------------------------------------
// Duelist telegraph & wedge-wobble lock badge
// ---------------------------------------------------------------------------

// Screen-edge direction indicator for an off-screen approaching Duelist
// (game-design.md §4). `angle` is a SCREEN-SPACE angle in radians: 0 = up,
// positive = clockwise (main.js converts the world-space direction). Pass
// null/undefined to hide.
export function setDuelistTelegraph(angle) {
  const el = document.getElementById('telegraph');
  if (!el) return;
  if (typeof angle !== 'number' || !Number.isFinite(angle)) {
    el.classList.remove('show');
    return;
  }
  el.style.transform = `translate(-50%, -50%) rotate(${angle}rad) translateY(-36vh)`;
  el.classList.add('show');
}

// Wedge-wobble lock badge (game-design.md §3): a small "🔒 too big" badge
// pinned over a too-big prop. `pos` is {x, y} in CSS pixels (main.js projects
// the prop's screen position); pass null to hide.
export function setLockBadge(pos) {
  const el = document.getElementById('lockBadge');
  if (!el) return;
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
    el.classList.remove('show');
    return;
  }
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.classList.add('show');
}

// ---------------------------------------------------------------------------
// Mass floats ("+N" rising off the bite) and the score-bar sparkle
// ---------------------------------------------------------------------------
//
// Both are HUD-layer, which is the whole reason they are allowed: the
// reference (assets/references/holeio/) keeps consumption feedback either
// inside the aperture or in the HUD and never sprays it across the world, and
// that containment — not the effect count — is why it never reads as noise.
//
// THE AGGREGATION RULE (load-bearing, do not relax): main.js emits AT MOST ONE
// float per frame, carrying the frame's TOTAL mass gain at the centroid of
// everything eaten that frame. A 12-prop cluster is therefore one big number,
// not twelve small ones fighting each other. Per-prop floats are exactly the
// spam this rule exists to prevent.
//
// Animation is driven in JS, NOT CSS, on purpose. index.html carries a global
// `html[data-reduced-motion="true"] * { animation:none; transition:none }`
// rule, so a CSS-animated float would appear under reduced motion and then
// never leave. Driving it here means the float works identically in both
// modes and the reduced-motion variant is an explicit decision rather than an
// accident of a stylesheet.

const MASS_FLOAT_SECONDS = 0.75;
const MASS_FLOAT_RISE_PX = 46;
const MASS_FLOAT_POOL = 6; // ~5 frames of overlap at 0.75s; never all in use

let massFloatPool = null;   // lazily built on first use (no DOM at import)
const massFloatLive = [];

function ensureMassFloatPool() {
  if (massFloatPool) return massFloatPool;
  const host = document.getElementById('massFloats');
  if (!host) return null;
  massFloatPool = { host, free: [] };
  for (let i = 0; i < MASS_FLOAT_POOL; i += 1) {
    const el = document.createElement('div');
    el.className = 'massfloat';
    el.style.opacity = '0';
    host.appendChild(el);
    massFloatPool.free.push(el);
  }
  return massFloatPool;
}

/**
 * One aggregated "+N" at a screen position.
 * @param {{x:number, y:number, amount:number, golden?:boolean}} opts
 */
export function spawnMassFloat(opts = {}) {
  const { x, y, amount } = opts;
  if (typeof x !== 'number' || typeof y !== 'number') return;
  if (!(amount > 0)) return;
  const pool = ensureMassFloatPool();
  if (!pool) return;
  // Pool exhausted: drop the float rather than allocate. Six concurrent
  // floats already means six frames inside 0.75s produced eats, which the
  // aggregation rule makes rare; dropping is right because the NEWEST number
  // is the one worth showing and stealing an in-flight one would flicker.
  if (pool.free.length === 0) return;
  const el = pool.free.pop();
  // Abbreviated via the SHARED formatter, not a local one — the HUD score
  // readout uses the same function, so the float and the bar can never
  // disagree about how the same quantity reads (format.js header).
  el.textContent = formatGain(amount);
  el.classList.toggle('golden', !!opts.golden);
  massFloatLive.push({ el, x, y, t: 0 });
}

/**
 * Per-frame float animation. `reducedMotion` removes the RISE only — the
 * number still appears and still fades, because the "+N" is the readable
 * confirmation of what a bite was worth, not decoration.
 */
export function updateMassFloats(dt, reducedMotion = false) {
  if (massFloatLive.length === 0) return;
  const pool = massFloatPool;
  for (let i = massFloatLive.length - 1; i >= 0; i -= 1) {
    const f = massFloatLive[i];
    f.t += dt;
    const p = f.t / MASS_FLOAT_SECONDS;
    if (p >= 1) {
      f.el.style.opacity = '0';
      if (pool) pool.free.push(f.el);
      massFloatLive[i] = massFloatLive[massFloatLive.length - 1];
      massFloatLive.pop();
      continue;
    }
    // Ease-out rise, and a fade weighted to the back half so the number is
    // fully readable for the first ~300ms before it starts leaving.
    const rise = reducedMotion ? 0 : MASS_FLOAT_RISE_PX * (1 - (1 - p) * (1 - p));
    f.el.style.transform = `translate(-50%, ${-rise}px)`;
    f.el.style.left = `${f.x}px`;
    f.el.style.top = `${f.y}px`;
    f.el.style.opacity = `${Math.min(1, 2.6 * (1 - p))}`;
  }
}

// Returns every live float to the pool (level teardown).
export function clearMassFloats() {
  for (const f of massFloatLive) {
    f.el.style.opacity = '0';
    if (massFloatPool) massFloatPool.free.push(f.el);
  }
  massFloatLive.length = 0;
}

// Score-bar sparkle: a travelling sheen on #scorefill while mass is coming in.
// Held by a short decaying timer rather than toggled per eat, so continuous
// feeding keeps the bar alive (reference behaviour — the bar sparkles WHILE it
// fills) instead of restarting the animation every frame, which would look
// frozen. Purely a class toggle; the animation itself is CSS and is therefore
// correctly suppressed by the global reduced-motion rule, while the bar keeps
// filling normally.
let scoreSparkTimer = 0;
let scoreSparkOn = false;
export function pokeScoreSparkle(seconds = 0.35) {
  scoreSparkTimer = Math.max(scoreSparkTimer, seconds);
}
export function updateScoreSparkle(dt) {
  if (scoreSparkTimer > 0) scoreSparkTimer = Math.max(0, scoreSparkTimer - dt);
  const on = scoreSparkTimer > 0;
  // Write classList ONLY on an edge. Setting it every frame would restart the
  // CSS animation each frame and the sheen would appear frozen at its first
  // keyframe — the classic "why isn't my animation moving" bug.
  if (on === scoreSparkOn) return;
  scoreSparkOn = on;
  const el = document.getElementById('scorefill');
  if (el) el.classList.toggle('spark', on);
}

// ---------------------------------------------------------------------------
// Size pill (Hole.io "Size N" readout under the player hole)
// ---------------------------------------------------------------------------

// Pins the blue "Size N" pill at {x, y} in CSS pixels (main.js projects the
// avatar's rim each frame, same pattern as setLockBadge). Pass
// {visible:false} — or no position — to hide. Visibility is additionally
// gated in CSS on the HUD being up (#hud.hidden ~ #sizePill), so nothing
// needs to call this when leaving play mode.
export function setSizePill(opts = {}) {
  const el = document.getElementById('sizePill');
  if (!el) return;
  const { x, y, size, visible } = opts;
  if (!visible || typeof x !== 'number' || typeof y !== 'number') {
    el.classList.remove('show');
    return;
  }
  if (typeof size === 'number') el.textContent = `Size ${size}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.classList.add('show');
  // `punch: true` on the frame the size tier goes UP: a one-shot scale/glow
  // kick on the number that just changed, so the readout announces itself
  // instead of silently swapping a digit. The class must be removed and
  // reflowed before re-adding or a second tier-up within the animation window
  // would not restart it (standard CSS-animation restart dance). A pill kick
  // is not vestibular motion, so it is NOT gated on reduced motion — it is
  // the readable half of the growth beat (tech-architecture §6).
  if (opts.punch) {
    el.classList.remove('punch');
    void el.offsetWidth; // force reflow: restarts the animation
    el.classList.add('punch');
  }
}
