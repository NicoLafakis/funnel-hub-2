// World-map level-select UI.
//
// Renders the 10 metro cards (Harbor Metropolis .. Capital Prime, from
// src/data/metros.js) into the #worldMapGrid container that index.html's
// #worldMapScreen overlay already provides. Each metro card expands into its
// 10 level nodes. Global level numbering follows the exact scheme already
// established in src/data/formulas.js / src/data/levels.js: metro at array
// index `i` (0-based) owns global levels `i*10 + 1 .. i*10 + 10`
// (chapterOf(n) = i+1, levelInChapterOf(n) = 1..10).
//
// No browser API is touched at module top level -- only inside the exported
// renderWorldMap() function -- so a bare dynamic import of this file never
// throws outside a browser (per the engine's Node-testability contract).
//
// ---------------------------------------------------------------------------
// SAVE-DATA CONTRACT (assumed): at the time this module was written,
// src/meta/save.js had not yet landed on disk (parallel work-in-progress),
// so this module is coded defensively against the shape implied by the task
// brief rather than against a concrete file. Reconcile with the real
// src/meta/save.js once it lands if its shape differs from the below.
//
//   saveData.unlockedLevel : number
//     Highest GLOBAL level (1..100) unlocked/playable so far. A level `n` is
//     considered unlocked iff `n <= unlockedLevel` (defaults to 1 -- level 1
//     only -- if unlockedLevel is missing/not a number). A metro is unlocked
//     iff its first level (i*10+1) is unlocked.
//
//   saveData.stars : optional, per-level star count (0-3), tolerated in
//     EITHER shape so this module works regardless of which the real
//     save.js picks:
//       - an object keyed by level number, numeric or string key:
//           { 1: 3, 2: 2, '13': 1, ... }
//       - a 0-indexed array: stars[levelNumber - 1]
//     A level with stars > 0 is rendered as completed (`.levelnode.done`).
// ---------------------------------------------------------------------------

function getStars(saveData, levelNumber) {
  const stars = saveData && saveData.stars;
  if (!stars) return 0;
  if (Array.isArray(stars)) {
    const v = stars[levelNumber - 1];
    return typeof v === 'number' ? v : 0;
  }
  if (typeof stars === 'object') {
    if (typeof stars[levelNumber] === 'number') return stars[levelNumber];
    const key = String(levelNumber);
    if (typeof stars[key] === 'number') return stars[key];
  }
  return 0;
}

function unlockedThreshold(saveData) {
  const u = saveData && saveData.unlockedLevel;
  return typeof u === 'number' && u > 0 ? u : 1;
}

function isLevelUnlocked(saveData, levelNumber) {
  return levelNumber <= unlockedThreshold(saveData);
}

function starGlyphs(count) {
  const c = Math.max(0, Math.min(3, count || 0));
  return '★'.repeat(c) + '☆'.repeat(3 - c);
}

// Injects worldmap-specific styling once per document. Kept out of
// index.html (this module owns its own presentation) and relies only on the
// CSS custom properties index.html's :root already defines (--orange,
// --coral, --teal, --gold, --navy2), so colors stay consistent with the rest
// of the game's chrome without duplicating literal hex values here.
function ensureStyles(doc) {
  const STYLE_ID = 'worldmap-injected-styles';
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .metro-card{flex:0 0 auto;width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);
      border-radius:14px;margin-bottom:10px;overflow:hidden;text-align:left;}
    .metro-card.locked{opacity:.45;}
    .metro-header{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;
      background:transparent;border:none;border-left:4px solid rgba(255,255,255,.25);color:#fff;
      padding:12px 16px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;
      transition:background .12s;}
    .metro-header:hover:not(:disabled){background:rgba(255,255,255,.06);}
    .metro-header:disabled{cursor:not-allowed;}
    .metro-name{letter-spacing:.3px;}
    .metro-meta{font-size:12.5px;font-weight:600;color:var(--gold,#f5c26b);white-space:nowrap;}
    .metro-levels{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:4px 14px 14px;}
    @media (min-width:480px){.metro-levels{grid-template-columns:repeat(10,minmax(0,1fr));}}
    .metro-levels .levelnode{flex-direction:column;gap:2px;font-size:13px;}
    .metro-levels .levelnode .lvl-stars{font-size:8px;letter-spacing:1px;color:var(--gold,#f5c26b);}
    .metro-levels .levelnode.locked .lvl-stars{color:rgba(255,255,255,.4);}
    .metro-tokens{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:99px;
      background:rgba(0,164,189,.18);border:1px solid var(--teal,#00a4bd);color:#7fd9e8;font-size:11px;}
    .metro-tokens.perked{background:rgba(245,194,107,.18);border-color:var(--gold,#f5c26b);color:var(--gold,#f5c26b);}
    .daily-card{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;
      background:linear-gradient(135deg,rgba(0,164,189,.16),rgba(122,92,255,.14));
      border:1px solid var(--teal,#00a4bd);border-radius:14px;margin-bottom:12px;padding:12px 16px;
      color:#fff;text-align:left;}
    .daily-card.locked{opacity:.5;}
    .daily-info{display:flex;flex-direction:column;gap:2px;min-width:0;}
    .daily-title{font-weight:800;font-size:14.5px;letter-spacing:.4px;}
    .daily-sub{font-size:12px;color:#9fb4c4;}
    .daily-sub b{color:var(--gold,#f5c26b);}
    .daily-play{flex:0 0 auto;min-height:44px;background:linear-gradient(135deg,var(--teal,#00a4bd),#7a5cff);
      color:#fff;border:none;padding:10px 20px;font-size:13px;font-weight:800;border-radius:999px;
      cursor:pointer;white-space:nowrap;transition:transform .12s,opacity .12s;}
    .daily-play:hover:not(:disabled){transform:scale(1.05);}
    .daily-play:disabled{opacity:.4;cursor:not-allowed;background:rgba(255,255,255,.15);}
  `;
  doc.head.appendChild(style);
}

/**
 * Render the world map into `container` (expected: the #worldMapGrid element).
 *
 * @param {HTMLElement} container
 * @param {Array} metros - METROS array shape from src/data/metros.js.
 * @param {object} saveData - see save-data contract above.
 * @param {(levelNumber:number)=>void} onSelectLevel - called with the GLOBAL
 *   level number (1-100) when an unlocked level node is clicked.
 */
export function renderWorldMap(container, metros, saveData, onSelectLevel) {
  if (!container) return;
  const doc = container.ownerDocument || document;
  ensureStyles(doc);

  container.innerHTML = '';
  // The base CSS on #worldMapGrid lays out a flat 10-col grid of .levelnode
  // squares (that's the right layout for the *inner* per-metro level strip,
  // reused below) -- but this outer container instead needs to stack metro
  // cards as full-width rows, so override just that one property inline.
  container.style.gridTemplateColumns = '1fr';
  container.style.gap = '0px';

  metros.forEach((metro, metroIndex) => {
    const firstLevel = metroIndex * 10 + 1;
    const lastLevel = metroIndex * 10 + 10;
    const metroUnlocked = isLevelUnlocked(saveData, firstLevel);

    let totalStars = 0;
    let completedCount = 0;
    for (let lvl = firstLevel; lvl <= lastLevel; lvl++) {
      const s = getStars(saveData, lvl);
      totalStars += s;
      if (s > 0) completedCount += 1;
    }

    const card = doc.createElement('div');
    card.className = 'metro-card' + (metroUnlocked ? '' : ' locked');
    card.dataset.metroId = metro.id;

    // V2 (content-and-meta.md §3): 3★ districts pay metro tokens; 10 tokens
    // unlock the metro's perk. Surface both on the card header — stars doing
    // nothing was flaw D4. Defensive reads: older saves have neither field.
    const tokens = saveData && saveData.metroTokens && typeof saveData.metroTokens[metro.id] === 'number'
      ? saveData.metroTokens[metro.id]
      : 0;
    const perkUnlocked = !!(saveData && saveData.metroPerks && saveData.metroPerks[metro.id]);
    const tokenBadge = metroUnlocked
      ? ` <span class="metro-tokens${perkUnlocked ? ' perked' : ''}" title="Metro tokens — 3★ a district to earn one; 10 unlock this metro's skin + perk">${perkUnlocked ? '🏅' : '🎟'} ${perkUnlocked ? 'PERK' : `${tokens}/10`}</span>`
      : '';

    const header = doc.createElement('button');
    header.type = 'button';
    header.className = 'metro-header';
    header.disabled = !metroUnlocked;
    header.style.borderLeftColor = metro.accent || 'rgba(255,255,255,.25)';
    // Metro hub tile art (assets/hubs/<metro.id>.png) as the header backdrop,
    // dimmed so the name/meta text stays readable (B8: art + CSS land together).
    header.style.backgroundImage = `linear-gradient(rgba(16,24,32,.78), rgba(16,24,32,.86)), url('assets/hubs/${metro.id}.png')`;
    header.style.backgroundSize = 'cover';
    header.style.backgroundPosition = 'center';
    header.innerHTML = `
      <span class="metro-name">${metroUnlocked ? '' : '🔒 '}${metro.name}</span>
      <span class="metro-meta">${metroUnlocked ? `${completedCount}/10 · ${totalStars}⭐${tokenBadge} <span class="chev">▾</span>` : 'LOCKED'}</span>
    `;
    card.appendChild(header);

    const levelsWrap = doc.createElement('div');
    levelsWrap.className = 'metro-levels';
    // Auto-expand the first metro the player can actually play (the one
    // containing their next unplayed level): the accordion is otherwise
    // undiscoverable — live player report: "not sure how you clicked into
    // the first level, maybe you have to use enter?".
    const nextLevel = (saveData && saveData.unlockedLevel) || 1;
    const startOpen = metroUnlocked && nextLevel >= firstLevel && nextLevel <= lastLevel;
    levelsWrap.style.display = startOpen ? 'grid' : 'none';
    card.appendChild(levelsWrap);

    if (metroUnlocked) {
      header.addEventListener('click', () => {
        const isOpen = levelsWrap.style.display !== 'none';
        // Accordion feel: collapse any other open metro card in this render.
        container.querySelectorAll('.metro-levels').forEach((el) => { el.style.display = 'none'; });
        levelsWrap.style.display = isOpen ? 'none' : 'grid';
      });

      const districts = Array.isArray(metro.districts) ? metro.districts : [];
      for (let j = 1; j <= 10; j++) {
        const levelNumber = firstLevel + j - 1;
        const unlocked = isLevelUnlocked(saveData, levelNumber);
        const stars = getStars(saveData, levelNumber);
        const completed = stars > 0;

        const node = doc.createElement('div');
        node.className = 'levelnode' + (unlocked ? '' : ' locked') + (completed ? ' done' : '');
        const districtName = districts[j - 1] || `Level ${j}`;
        node.title = unlocked ? `${districtName} — ${starGlyphs(stars)}` : `${districtName} (locked)`;
        node.innerHTML = `<span class="lvl-num">${j}</span><span class="lvl-stars">${unlocked ? starGlyphs(stars) : ''}</span>`;

        if (unlocked && typeof onSelectLevel === 'function') {
          node.addEventListener('click', () => onSelectLevel(levelNumber));
        }
        levelsWrap.appendChild(node);
      }
    }

    container.appendChild(card);
  });
}

/**
 * Renders the daily-challenge card (content-and-meta.md §3) and inserts it at
 * the TOP of `container` (the #worldMapGrid element, same as renderWorldMap).
 * Call before renderWorldMap, or after — it always re-pins itself first.
 *
 * @param {HTMLElement} container
 * @param {object} dailyStatus - getDailyStatus() shape from src/meta/daily.js:
 *   { unlocked, date, streak, bestStreak, attemptsLeft, canAttempt }.
 * @param {()=>void} onPlayDaily - called when the play button is clicked.
 */
export function renderDailyCard(container, dailyStatus, onPlayDaily) {
  if (!container) return;
  const doc = container.ownerDocument || document;
  ensureStyles(doc);

  // Idempotent: a re-render replaces the previous card rather than stacking.
  const stale = container.querySelector('.daily-card');
  if (stale) stale.remove();

  const status = dailyStatus && typeof dailyStatus === 'object' ? dailyStatus : {};
  const unlocked = !!status.unlocked;
  const attemptsLeft = typeof status.attemptsLeft === 'number' ? status.attemptsLeft : 3;
  const streak = typeof status.streak === 'number' ? status.streak : 0;

  const card = doc.createElement('div');
  card.className = 'daily-card' + (unlocked ? '' : ' locked');

  const info = doc.createElement('div');
  info.className = 'daily-info';
  info.innerHTML = unlocked
    ? `<span class="daily-title">📅 DAILY SWALLOW — ${status.date || 'today'}</span>
       <span class="daily-sub">Same city for everyone, today only. 🔥 streak <b>${streak}</b> · 🎯 attempts left <b>${attemptsLeft}</b></span>`
    : `<span class="daily-title">📅 DAILY SWALLOW</span>
       <span class="daily-sub">Unlocks at level 31. One city. One day. Everyone.</span>`;
  card.appendChild(info);

  const playBtn = doc.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'daily-play';
  playBtn.textContent = unlocked ? (attemptsLeft > 0 ? 'PLAY DAILY' : 'OUT OF ATTEMPTS') : '🔒 LOCKED';
  playBtn.disabled = !unlocked || attemptsLeft <= 0;
  if (!playBtn.disabled && typeof onPlayDaily === 'function') {
    playBtn.addEventListener('click', () => onPlayDaily());
  }
  card.appendChild(playBtn);

  container.insertBefore(card, container.firstChild);
}
