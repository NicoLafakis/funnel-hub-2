// Meta-progression, V2: the shop is a BUILD screen, not five linear tracks
// (content-and-meta.md §3, fixing design flaw D4 "meta is linear and
// consequence-free"). Each of the 5 tiers offers 2-3 mutually exclusive picks;
// buying one LOCKS the tier until a respec. Respec costs 10% of lifetime coins.
// Stars also buy things now: 3★ a district earns a metro token, and 10 tokens
// unlock that metro's skin + a permanent per-metro perk.
//
// No browser-only APIs — pure data + functions.
//
// ---------------------------------------------------------------------------
// LEGACY COMPAT LAYER (bottom of file): the V1 track-based exports
// (UPGRADE_TRACKS / UPGRADE_KEYS / cost / isMaxTier / applyUpgrades) are kept,
// unchanged in behavior, because the V1 main.js still imports them. They are
// DEPRECATED — V2 code should use BUILD_TIERS / buyBuildPick / applyBuilds /
// respec and the metro-token API below. Do not extend the legacy layer.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Builds — 5 tiers, mutually exclusive picks
// ---------------------------------------------------------------------------
//
// Economy derivation (content-and-meta.md §4):
//   coins per level = 50 + 25·stars + challengeBonus. A mid-skill run averages
//   ~2 stars ⇒ ~100-125 coins/level ⇒ ~11,000 lifetime coins over the 100-level
//   playthrough (dailies push it a bit higher). A full build (one pick per
//   tier) is priced at ~60% of that: 80 + 420 + 1020 + 1920 + 3160 = 6,600.
//   Tier 1 costs 80 so the FIRST pick is affordable immediately after level 1
//   (level-1 payout is 75 at 1★ / 100 at 2★ / 125 at 3★, plus first-eat
//   challenge bonuses) — the genre's most important juice timing.

export const BUILD_TIERS = [
  {
    tier: 1,
    price: 80,
    picks: [
      {
        id: 'wide-maw',
        name: 'Wide Maw',
        icon: '👄',
        description: '+15% eat radius. Bigger mouth, bigger dreams.',
        effects: { eatRadiusMultiplier: 1.15 },
      },
      {
        id: 'lingering-combo',
        name: 'Lingering Combo',
        icon: '🔥',
        description: '+0.5s combo window. Forgiveness, but for gluttony.',
        effects: { extraComboWindow: 0.5 },
      },
    ],
  },
  {
    tier: 2,
    price: 420,
    picks: [
      {
        id: 'greased-axle',
        name: 'Greased Axle',
        icon: '🛞',
        description: '+12% move speed. The streets fear a fast eater.',
        effects: { moveSpeedMultiplier: 1.12 },
      },
      {
        id: 'magnet-core',
        name: 'Magnet Core',
        icon: '🧲',
        description: '+20% attract radius. Snaccidents happen.',
        effects: { attractRadiusMultiplier: 1.2 },
      },
      {
        id: 'coin-siphon',
        name: 'Coin Siphon',
        icon: '🪙',
        description: '+25% coins from levels. Trickling DOWN, for once.',
        effects: { coinMultiplier: 1.25 },
      },
    ],
  },
  {
    tier: 3,
    price: 1020,
    picks: [
      {
        id: 'second-stomach',
        name: 'Second Stomach',
        icon: '🍽️',
        description: '+12% mass from everything you eat. Doctors hate it.',
        effects: { massGainMultiplier: 1.12 },
      },
      {
        id: 'overtime-clause',
        name: 'Overtime Clause',
        icon: '⏱️',
        description: '+8s on every clock. HR approved. Nobody asked HR.',
        effects: { extraSeconds: 8 },
      },
      {
        id: 'heavy-breakfast',
        name: 'Heavy Breakfast',
        icon: '🥯',
        description: '+150 starting mass per level. The most important meal.',
        effects: { extraStartMass: 150 },
      },
    ],
  },
  {
    tier: 4,
    price: 1920,
    picks: [
      {
        id: 'vacuum-throat',
        name: 'Vacuum Throat',
        icon: '🌪️',
        description: '+25% attract radius. Now certified in 40 states.',
        effects: { attractRadiusMultiplier: 1.25 },
      },
      {
        id: 'turbo-bearings',
        name: 'Turbo Bearings',
        icon: '⚡',
        description: '+15% move speed. Warranty void where prohibited.',
        effects: { moveSpeedMultiplier: 1.15 },
      },
      {
        id: 'golden-touch',
        name: 'Golden Touch',
        icon: '⭐',
        description: 'Goldens worth +50% mass. Midas, but a flywheel.',
        effects: { goldenMassMultiplier: 1.5 },
      },
    ],
  },
  {
    tier: 5,
    price: 3160,
    picks: [
      {
        id: 'event-horizon',
        name: 'Event Horizon',
        icon: '🕳️',
        description: '+25% eat radius. What goes in never comes out.',
        effects: { eatRadiusMultiplier: 1.25 },
      },
      {
        id: 'time-bandit',
        name: 'Time Bandit',
        icon: '🕰️',
        description: '+15s on every clock. Stealing time is a victimless crime.',
        effects: { extraSeconds: 15 },
      },
      {
        id: 'devourer',
        name: 'Devourer',
        icon: '👹',
        description: '+20% mass from everything. The prophecy mentioned this.',
        effects: { massGainMultiplier: 1.2 },
      },
    ],
  },
];

// Flat lookup: pick id -> { tier, price, pick }.
const PICK_INDEX = (() => {
  const idx = {};
  for (const t of BUILD_TIERS) {
    for (const p of t.picks) idx[p.id] = { tier: t.tier, price: t.price, pick: p };
  }
  return idx;
})();

export function getPick(pickId) {
  return PICK_INDEX[pickId] || null;
}

function buildsOf(saveData) {
  const b = saveData && saveData.builds;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}

// Attempts to buy `pickId` for its tier. Mutates saveData (coins, builds) on
// success ONLY. Returns { ok, reason?, price?, pick? } where reason is one of
// 'unknown-pick' | 'tier-locked' | 'insufficient-coins'.
export function buyBuildPick(saveData, pickId) {
  const entry = getPick(pickId);
  if (!entry) return { ok: false, reason: 'unknown-pick' };
  const builds = buildsOf(saveData);
  if (builds[String(entry.tier)]) return { ok: false, reason: 'tier-locked', pick: entry.pick };
  const coins = saveData && typeof saveData.coins === 'number' ? saveData.coins : 0;
  if (coins < entry.price) return { ok: false, reason: 'insufficient-coins', price: entry.price, pick: entry.pick };
  saveData.coins = coins - entry.price;
  if (!saveData.builds || typeof saveData.builds !== 'object' || Array.isArray(saveData.builds)) saveData.builds = {};
  saveData.builds[String(entry.tier)] = pickId;
  return { ok: true, price: entry.price, pick: entry.pick };
}

// Respec cost: 10% of LIFETIME coins (content-and-meta.md §3), rounded up.
export function respecCost(saveData) {
  const lifetime = saveData && typeof saveData.lifetimeCoins === 'number' ? saveData.lifetimeCoins : 0;
  return Math.ceil(lifetime * 0.10);
}

// Clears every tier pick and charges the respec cost. Mutates saveData on
// success only. Returns { ok, reason?, cost? } with reason 'insufficient-coins'
// | 'nothing-to-respec'.
export function respec(saveData) {
  const builds = buildsOf(saveData);
  if (Object.keys(builds).length === 0) return { ok: false, reason: 'nothing-to-respec' };
  const cost = respecCost(saveData);
  const coins = saveData && typeof saveData.coins === 'number' ? saveData.coins : 0;
  if (coins < cost) return { ok: false, reason: 'insufficient-coins', cost };
  saveData.coins = coins - cost;
  saveData.builds = {};
  return { ok: true, cost };
}

// Folds the player's locked build picks into level-start stats. Same output
// contract as the legacy applyUpgrades (extraStartMass / moveSpeedMultiplier /
// attractRadiusMultiplier / extraSeconds / massGainMultiplier / startMass /
// timeSeconds) plus the new build-only fields:
//   eatRadiusMultiplier  — multiplies the swallow size-gate/eat radius
//   extraComboWindow     — additive seconds on the combo window
//   coinMultiplier       — multiplies coin payouts
//   goldenMassMultiplier — multiplies golden-prop mass
// Multipliers from different tiers stack multiplicatively; additive fields sum.
export function applyBuilds(baseStats, buildState) {
  const base = baseStats && typeof baseStats === 'object' ? baseStats : {};
  const builds = buildState && typeof buildState === 'object' && !Array.isArray(buildState) ? buildState : {};

  let extraStartMass = 0;
  let moveSpeedMultiplier = 1;
  let attractRadiusMultiplier = 1;
  let extraSeconds = 0;
  let massGainMultiplier = 1;
  let eatRadiusMultiplier = 1;
  let extraComboWindow = 0;
  let coinMultiplier = 1;
  let goldenMassMultiplier = 1;

  for (const pickId of Object.values(builds)) {
    const entry = getPick(pickId);
    if (!entry) continue;
    const fx = entry.pick.effects || {};
    if (typeof fx.extraStartMass === 'number') extraStartMass += fx.extraStartMass;
    if (typeof fx.moveSpeedMultiplier === 'number') moveSpeedMultiplier *= fx.moveSpeedMultiplier;
    if (typeof fx.attractRadiusMultiplier === 'number') attractRadiusMultiplier *= fx.attractRadiusMultiplier;
    if (typeof fx.extraSeconds === 'number') extraSeconds += fx.extraSeconds;
    if (typeof fx.massGainMultiplier === 'number') massGainMultiplier *= fx.massGainMultiplier;
    if (typeof fx.eatRadiusMultiplier === 'number') eatRadiusMultiplier *= fx.eatRadiusMultiplier;
    if (typeof fx.extraComboWindow === 'number') extraComboWindow += fx.extraComboWindow;
    if (typeof fx.coinMultiplier === 'number') coinMultiplier *= fx.coinMultiplier;
    if (typeof fx.goldenMassMultiplier === 'number') goldenMassMultiplier *= fx.goldenMassMultiplier;
  }

  const baseStartMass = typeof base.startMass === 'number' ? base.startMass : 0;
  const baseTimeSeconds = typeof base.timeSeconds === 'number' ? base.timeSeconds : 0;

  return {
    ...base,
    extraStartMass,
    moveSpeedMultiplier,
    attractRadiusMultiplier,
    extraSeconds,
    massGainMultiplier,
    eatRadiusMultiplier,
    extraComboWindow,
    coinMultiplier,
    goldenMassMultiplier,
    startMass: baseStartMass + extraStartMass,
    timeSeconds: baseTimeSeconds + extraSeconds,
  };
}

// Plain view model for the build-shop UI (ui/overlays.js renderBuildShop), so
// the renderer stays dumb: no effect math, no save-shape spelunking.
export function buildShopViewModel(saveData) {
  const coins = saveData && typeof saveData.coins === 'number' ? saveData.coins : 0;
  const builds = buildsOf(saveData);
  const tiers = BUILD_TIERS.map((t) => ({
    tier: t.tier,
    price: t.price,
    lockedPickId: builds[String(t.tier)] || null,
    picks: t.picks.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      description: p.description,
      affordable: coins >= t.price,
    })),
  }));
  const hasBuild = Object.keys(builds).length > 0;
  const cost = respecCost(saveData);
  return {
    coins,
    tiers,
    respec: { cost, affordable: coins >= cost, hasBuild },
  };
}

// ---------------------------------------------------------------------------
// Metro tokens & perks — stars buy things (content-and-meta.md §3)
// ---------------------------------------------------------------------------
//
// 3★ a district -> 1 metro token. 10 tokens -> that metro's skin + a permanent
// per-metro perk. A metro has exactly 10 districts, so a metro's perk is its
// completionist capstone. Token grants are recorded per level in
// saveData.tokenClaims so re-rendering/re-loading never double-pays.

export const METRO_PERK_TOKEN_COST = 10;

// Keyed by metro id (src/data/metros.js METROS[].id — order/ids are a contract).
// `effects` are plain flags the engine/main loop consumes; every perk is
// readable-but-cheap, per the wiki's Old Fog Town example.
export const METRO_PERKS = {
  'harbor-metropolis': {
    metroId: 'harbor-metropolis',
    skinId: 'skin-sailor-spin',
    skinName: 'Sailor Spin',
    perkName: 'Harbor Instinct',
    description: 'Goldens always show on the minimap. The sea provides.',
    effects: { goldenSonar: true },
  },
  'vieux-continent': {
    metroId: 'vieux-continent',
    skinId: 'skin-baguette-wheel',
    skinName: 'Baguette Wheel',
    perkName: 'Cruastafarianism',
    description: 'Near-miss crumbs reach +50% farther. No crumb left behind.',
    effects: { crumbReachBonus: 0.5 },
  },
  'old-fog-town': {
    metroId: 'old-fog-town',
    skinId: 'skin-black-cab',
    skinName: 'Black Cab',
    perkName: 'Fog Whisperer',
    description: 'The fog shows prop silhouettes. It knew all along.',
    effects: { fogRevealsProps: true },
  },
  'neon-district': {
    metroId: 'neon-district',
    skinId: 'skin-neon-tuktuk',
    skinName: 'Neon Tuk-Tuk',
    perkName: 'Neon Rush',
    description: '+10% move speed during storms and night variants.',
    effects: { neonRushMultiplier: 1.1 },
  },
  'desert-spires': {
    metroId: 'desert-spires',
    skinId: 'skin-gold-plated',
    skinName: 'Gold Plated',
    perkName: 'Gold Rush',
    description: 'Goldens drop +10 extra coins. The souk approves.',
    effects: { goldenCoinBonus: 10 },
  },
  'coliseum-city': {
    metroId: 'coliseum-city',
    skinId: 'skin-gladiator',
    skinName: 'Gladiator',
    perkName: 'Arena Roar',
    description: 'Eating a rival pays +25% bonus mass. The crowd goes wild.',
    effects: { rivalBonusMultiplier: 1.25 },
  },
  'carnival-coast': {
    metroId: 'carnival-coast',
    skinId: 'skin-carnival',
    skinName: 'Carnival',
    perkName: 'Samba Chain',
    description: '+0.25s combo window. The beat never drops.',
    effects: { extraComboWindow: 0.25 },
  },
  'red-square-heights': {
    metroId: 'red-square-heights',
    skinId: 'skin-red-star',
    skinName: 'Red Star',
    perkName: 'Cold Start',
    description: '+100 starting mass per level. In Soviet heights, city eats you.',
    effects: { extraStartMass: 100 },
  },
  'harbor-opera-bay': {
    metroId: 'harbor-opera-bay',
    skinId: 'skin-opera-sails',
    skinName: 'Opera Sails',
    perkName: 'Encore',
    description: 'Second wind offers +20s instead of +15s. Bravissimo.',
    effects: { secondWindBonus: 5 },
  },
  'capital-prime': {
    metroId: 'capital-prime',
    skinId: 'skin-breeze-purple',
    skinName: 'Breeze Purple',
    perkName: 'Portal Sense',
    description: 'The landmark always shows on the minimap, with distance.',
    effects: { landmarkSonar: true },
  },
};

// Counts 3★ districts in a metro (0-based metroIndex owns levels m*10+1..m*10+10).
export function tokensEarnedForMetro(stars, metroIndex) {
  const s = stars && typeof stars === 'object' ? stars : {};
  let earned = 0;
  for (let j = 1; j <= 10; j += 1) {
    const n = metroIndex * 10 + j;
    const v = s[n] != null ? s[n] : s[String(n)];
    if (typeof v === 'number' && v >= 3) earned += 1;
  }
  return earned;
}

// Grants any unclaimed 3★ tokens into saveData.metroTokens, recording claims in
// saveData.tokenClaims. `metros` is the METROS array (only ids are read).
// Mutates saveData; returns the newly granted list [{ metroId, metroIndex, levelN }].
export function claimMetroTokens(saveData, metros) {
  if (!saveData || typeof saveData !== 'object') return [];
  if (!saveData.metroTokens || typeof saveData.metroTokens !== 'object' || Array.isArray(saveData.metroTokens)) saveData.metroTokens = {};
  if (!saveData.tokenClaims || typeof saveData.tokenClaims !== 'object' || Array.isArray(saveData.tokenClaims)) saveData.tokenClaims = {};
  const stars = saveData.stars && typeof saveData.stars === 'object' ? saveData.stars : {};
  const list = Array.isArray(metros) ? metros : [];
  const granted = [];
  list.forEach((metro, metroIndex) => {
    if (!metro || !metro.id) return;
    for (let j = 1; j <= 10; j += 1) {
      const levelN = metroIndex * 10 + j;
      const v = stars[levelN] != null ? stars[levelN] : stars[String(levelN)];
      if (typeof v === 'number' && v >= 3 && !saveData.tokenClaims[String(levelN)]) {
        saveData.tokenClaims[String(levelN)] = true;
        saveData.metroTokens[metro.id] = (typeof saveData.metroTokens[metro.id] === 'number' ? saveData.metroTokens[metro.id] : 0) + 1;
        granted.push({ metroId: metro.id, metroIndex, levelN });
      }
    }
  });
  return granted;
}

export function canUnlockMetroPerk(saveData, metroId) {
  const tokens = saveData && saveData.metroTokens && typeof saveData.metroTokens[metroId] === 'number'
    ? saveData.metroTokens[metroId]
    : 0;
  const already = !!(saveData && saveData.metroPerks && saveData.metroPerks[metroId]);
  return !!METRO_PERKS[metroId] && !already && tokens >= METRO_PERK_TOKEN_COST;
}

// Spends METRO_PERK_TOKEN_COST tokens to permanently unlock the metro's skin +
// perk. Mutates saveData on success only; returns { ok, reason?, perk? } with
// reason 'unknown-metro' | 'already-unlocked' | 'insufficient-tokens'.
export function unlockMetroPerk(saveData, metroId) {
  const perk = METRO_PERKS[metroId];
  if (!perk) return { ok: false, reason: 'unknown-metro' };
  if (!saveData || typeof saveData !== 'object') return { ok: false, reason: 'unknown-metro' };
  if (!saveData.metroPerks || typeof saveData.metroPerks !== 'object' || Array.isArray(saveData.metroPerks)) saveData.metroPerks = {};
  if (saveData.metroPerks[metroId]) return { ok: false, reason: 'already-unlocked', perk };
  const tokens = saveData.metroTokens && typeof saveData.metroTokens[metroId] === 'number' ? saveData.metroTokens[metroId] : 0;
  if (tokens < METRO_PERK_TOKEN_COST) return { ok: false, reason: 'insufficient-tokens', perk };
  if (!saveData.metroTokens || typeof saveData.metroTokens !== 'object' || Array.isArray(saveData.metroTokens)) saveData.metroTokens = {};
  saveData.metroTokens[metroId] = tokens - METRO_PERK_TOKEN_COST;
  saveData.metroPerks[metroId] = true;
  if (!Array.isArray(saveData.skins)) saveData.skins = [];
  if (!saveData.skins.includes(perk.skinId)) saveData.skins.push(perk.skinId);
  return { ok: true, perk };
}

// Merged effect flags across every unlocked metro perk. Later-unlocked perks
// win on key collisions (they can't collide today — each perk owns its flags).
export function perkEffects(saveData) {
  const out = {};
  const perks = saveData && saveData.metroPerks;
  if (!perks || typeof perks !== 'object') return out;
  for (const metroId of Object.keys(perks)) {
    if (!perks[metroId] || !METRO_PERKS[metroId]) continue;
    Object.assign(out, METRO_PERKS[metroId].effects);
  }
  return out;
}

// ---------------------------------------------------------------------------
// LEGACY COMPAT LAYER — V1 track-based API. DEPRECATED (see header). Kept so
// the V1 main.js shop flow and the V1 logic-suite assertions keep working
// until main.js is rewired to the build shop.
// ---------------------------------------------------------------------------

export const MAX_TIER = 5;

export const UPGRADE_TRACKS = {
  size: {
    key: 'size',
    label: 'Size',
    description: 'Extra starting mass carried into every level.',
    maxTier: MAX_TIER,
    perTier: 40, // +40 starting mass per tier
  },
  speed: {
    key: 'speed',
    label: 'Speed',
    description: 'Move-speed multiplier.',
    maxTier: MAX_TIER,
    perTier: 0.06, // +6% move speed per tier
  },
  magnet: {
    key: 'magnet',
    label: 'Magnet',
    description: 'Attract-radius multiplier.',
    maxTier: MAX_TIER,
    perTier: 0.15, // +15% attract radius per tier
  },
  time: {
    key: 'time',
    label: 'Time',
    description: 'Extra seconds added to the level clock.',
    maxTier: MAX_TIER,
    perTier: 5, // +5 seconds per tier
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    description: 'Mass-gain multiplier (starting-mass carryover growth).',
    maxTier: MAX_TIER,
    perTier: 0.05, // +5% mass gained from eaten objects per tier
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADE_TRACKS);

// DEPRECATED (legacy V1 curve): cost(trackKey, currentTier) = 100 * (currentTier + 1)^2.
export function cost(trackKey, currentTier) {
  if (!UPGRADE_TRACKS[trackKey]) {
    throw new Error(`Unknown upgrade track: ${trackKey}`);
  }
  const tier = Math.max(0, Math.floor(Number(currentTier) || 0));
  return 100 * (tier + 1) * (tier + 1);
}

function clampTier(value) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(MAX_TIER, Math.floor(n)));
}

// DEPRECATED (legacy V1 tracks).
export function isMaxTier(trackKey, currentTier) {
  if (!UPGRADE_TRACKS[trackKey]) {
    throw new Error(`Unknown upgrade track: ${trackKey}`);
  }
  return clampTier(currentTier) >= UPGRADE_TRACKS[trackKey].maxTier;
}

// DEPRECATED (legacy V1 tracks) — V2 uses applyBuilds() above. Combines a
// level's base gameplay stats with the player's persisted LEGACY upgrade tiers
// (the `upgrades` object from the save shape) into modifiedStats.
export function applyUpgrades(baseStats, upgradeState) {
  const base = baseStats && typeof baseStats === 'object' ? baseStats : {};
  const state = upgradeState && typeof upgradeState === 'object' ? upgradeState : {};

  const sizeTier = clampTier(state.size);
  const speedTier = clampTier(state.speed);
  const magnetTier = clampTier(state.magnet);
  const timeTier = clampTier(state.time);
  const growthTier = clampTier(state.growth);

  const extraStartMass = sizeTier * UPGRADE_TRACKS.size.perTier;
  const moveSpeedMultiplier = 1 + speedTier * UPGRADE_TRACKS.speed.perTier;
  const attractRadiusMultiplier = 1 + magnetTier * UPGRADE_TRACKS.magnet.perTier;
  const extraSeconds = timeTier * UPGRADE_TRACKS.time.perTier;
  const massGainMultiplier = 1 + growthTier * UPGRADE_TRACKS.growth.perTier;

  const baseStartMass = typeof base.startMass === 'number' ? base.startMass : 0;
  const baseTimeSeconds = typeof base.timeSeconds === 'number' ? base.timeSeconds : 0;

  return {
    ...base,
    extraStartMass,
    moveSpeedMultiplier,
    attractRadiusMultiplier,
    extraSeconds,
    massGainMultiplier,
    startMass: baseStartMass + extraStartMass,
    timeSeconds: baseTimeSeconds + extraSeconds,
  };
}
