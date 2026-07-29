// Unlockable avatar vortex skins.
//
// Pure data + resolvers, exactly like src/meta/upgrades.js and
// src/meta/collection.js: no THREE import, no browser-only API anywhere (not
// even inside functions), so a bare `import()` of this file is safe headlessly
// under plain Node.
//
// A skin is a COMPLETE VISUAL RECIPE for the player avatar
// (src/engine/avatar.js) and nothing else. It cannot touch a gameplay number:
// the avatar's radius()/mass/speed math never reads a skin field, and the core
// sphere's authored radius is deliberately NOT a skin field (see CORE_RADIUS in
// avatar.js) so no skin can make the avatar look bigger or smaller than the
// radius it actually swallows with. A test pins that.
//
// RECIPE SHAPE
//   core   : the solid MeshStandardMaterial body.
//     { color, emissive, emissiveIntensity, roughness, metalness,
//       widthSegments, heightSegments }
//   rim    : the shell over the core (MeshBasicMaterial, always transparent
//            and depthWrite:false — it is a glow layer, not a surface).
//     { radius, widthSegments, heightSegments, color, opacity, wireframe,
//       additive, spinY, spinX }
//   corona : OPTIONAL third layer, same shape as `rim` plus nothing else. null
//            for most skins; a skin that declares one gets an extra mesh
//            allocated lazily, and skins without one stay allocation-identical
//            to the pre-skins avatar (two meshes, two materials, two
//            geometries).
//
// BLOOM (src/engine/scene.js markBloomEmissive / BLOOM_EMISSIVE_MIN = 0.6)
// Emissive intensities here are authored deliberately AGAINST that threshold
// rather than forced with the `userData.bloom` escape hatch, so each skin's
// glow tier is legible from the numbers themselves:
//   - `additive: true` on a rim/corona blooms unconditionally (rule 3).
//   - a core blooms iff emissiveIntensity >= 0.6 (rule 4).
//   Void is the deliberate floor: core 0.35 (below the line) AND a
//   normal-blended rim, so it is the one skin that produces zero bloom in any
//   metro. Supernova is the deliberate ceiling at 2.4.

export const DEFAULT_SKIN_ID = 'default';

// Every unlock condition is one of these. `default` is owned from the first
// frame of a brand-new save; the other three are the three unlock economies
// the meta layer already has (coins from the shop, achievements from
// src/systems/achievements.js, progress milestones from the save itself).
export const SKIN_UNLOCK_TYPES = ['default', 'coins', 'achievement', 'milestone'];

// Progress metrics a `milestone` unlock may be measured against. Each maps to
// one field of the save shape (src/meta/save.js) — see progressSnapshot().
export const MILESTONE_METRICS = ['collectionEntries', 'totalStars', 'levelsCleared', 'bestCombo'];

// Human labels for milestone metrics, used by describeUnlock() so the shop can
// tell the player HOW a locked skin is earned rather than just that it is
// locked.
const METRIC_LABELS = {
  collectionEntries: 'Skyline-opedia entries',
  totalStars: 'total stars',
  levelsCleared: 'levels cleared',
  bestCombo: 'best combo',
};

// Coin prices are set against src/meta/upgrades.js's cost curve
// (100 / 400 / 900 / 1600 / 2500 per upgrade tier) so a skin reads as a real
// trade against a mid upgrade tier rather than free confetti or an
// unreachable trophy: Cyber Cyan ~ tier 2, Golden Surge ~ tier 3, Supernova
// between tier 3 and tier 4.
export const SKINS = {
  default: {
    id: 'default',
    name: 'Dark Matter',
    icon: '🌀',
    description: 'The original vortex. Purple singularity, cyan cage.',
    unlock: { type: 'default' },
    core: {
      color: 0x120018,
      emissive: 0x3a0a5c,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.15,
      widthSegments: 32,
      heightSegments: 24,
    },
    rim: {
      radius: 1.08,
      widthSegments: 16,
      heightSegments: 12,
      color: 0x00a4bd,
      opacity: 0.55,
      wireframe: true,
      additive: true,
      spinY: 1.1,
      spinX: 0.6,
    },
    corona: null,
  },

  cyber: {
    id: 'cyber',
    name: 'Cyber Cyan',
    icon: '💠',
    description: 'Electric, hard-edged, a high-frequency lattice spun on one axis.',
    unlock: { type: 'coins', price: 450 },
    core: {
      color: 0x03131b,
      emissive: 0x00e5ff,
      emissiveIntensity: 1.35,
      roughness: 0.12,
      metalness: 0.65,
      widthSegments: 32,
      heightSegments: 24,
    },
    rim: {
      radius: 1.06,
      widthSegments: 32,
      heightSegments: 24,
      color: 0x66fff2,
      opacity: 0.5,
      wireframe: true,
      additive: true,
      spinY: 1.45,
      spinX: 0.12,
    },
    corona: null,
  },

  golden: {
    id: 'golden',
    name: 'Golden Surge',
    icon: '🥇',
    description: 'Molten gold. Warm, heavy, and slow to turn.',
    unlock: { type: 'coins', price: 750 },
    core: {
      color: 0x5c3403,
      emissive: 0xffae1a,
      emissiveIntensity: 1.25,
      roughness: 0.26,
      metalness: 0.92,
      widthSegments: 32,
      heightSegments: 24,
    },
    rim: {
      radius: 1.1,
      widthSegments: 18,
      heightSegments: 13,
      color: 0xffd76a,
      opacity: 0.6,
      wireframe: true,
      additive: true,
      spinY: 0.68,
      spinX: 0.3,
    },
    corona: {
      radius: 1.24,
      widthSegments: 20,
      heightSegments: 15,
      color: 0xff9a2e,
      opacity: 0.13,
      wireframe: false,
      additive: true,
      spinY: -0.22,
      spinX: 0.1,
    },
  },

  supernova: {
    id: 'supernova',
    name: 'Supernova',
    icon: '☀️',
    description: 'White-hot core inside a gold corona. Blinding in every city.',
    unlock: { type: 'coins', price: 1200 },
    core: {
      color: 0xfff2cc,
      emissive: 0xff7a18,
      emissiveIntensity: 2.4,
      roughness: 0.18,
      metalness: 0.05,
      widthSegments: 32,
      heightSegments: 24,
    },
    rim: {
      radius: 1.12,
      widthSegments: 20,
      heightSegments: 14,
      color: 0xffc247,
      opacity: 0.75,
      wireframe: true,
      additive: true,
      spinY: 1.7,
      spinX: 0.95,
    },
    corona: {
      radius: 1.32,
      widthSegments: 26,
      heightSegments: 20,
      color: 0xff5a12,
      opacity: 0.2,
      wireframe: false,
      additive: true,
      spinY: -0.5,
      spinX: 0.25,
    },
  },

  void: {
    id: 'void',
    name: 'Void',
    icon: '🕳️',
    description: 'Matte black, barely lit, a thin dead rim. It does not glow. That is the point.',
    unlock: {
      type: 'achievement',
      achievementId: 'combo25',
      label: 'Earn ☄️ Extinction-Level Snacking (25 combo)',
    },
    core: {
      color: 0x050506,
      emissive: 0x160f1c,
      // Deliberately BELOW scene.js's BLOOM_EMISSIVE_MIN (0.6) — this is the
      // one skin that contributes nothing at all to the bloom buffer.
      emissiveIntensity: 0.35,
      roughness: 0.96,
      metalness: 0,
      widthSegments: 32,
      heightSegments: 24,
    },
    rim: {
      radius: 1.05,
      widthSegments: 12,
      heightSegments: 9,
      color: 0x2b303b,
      opacity: 0.34,
      wireframe: true,
      // Normal-blended, not additive — the other half of "never blooms".
      additive: false,
      spinY: 0.45,
      spinX: 0.2,
    },
    corona: null,
  },

  glacier: {
    id: 'glacier',
    name: 'Glacier Drift',
    icon: '❄️',
    description: 'A pale ice body — the only bright core in the set — inside a coarse crystal facet cage.',
    unlock: { type: 'milestone', metric: 'collectionEntries', threshold: 30 },
    core: {
      color: 0xcfe9f5,
      emissive: 0x2ea8d6,
      emissiveIntensity: 0.72,
      roughness: 0.05,
      metalness: 0.35,
      widthSegments: 24,
      heightSegments: 18,
    },
    rim: {
      // 8x6 segments: big flat facets rather than a fine mesh, so the
      // silhouette reads as cut crystal instead of a wire sphere.
      radius: 1.15,
      widthSegments: 8,
      heightSegments: 6,
      color: 0x9fe8ff,
      opacity: 0.45,
      wireframe: true,
      additive: true,
      spinY: 0.5,
      spinX: 0.5,
    },
    corona: null,
  },

  aurora: {
    id: 'aurora',
    name: 'Aurora Veil',
    icon: '🔮',
    description: 'A soft solid glow bubble instead of a cage, wrapped in a sparse counter-spinning lattice.',
    unlock: { type: 'milestone', metric: 'totalStars', threshold: 60 },
    core: {
      color: 0x1b0a2e,
      emissive: 0x8a2be2,
      emissiveIntensity: 1.05,
      roughness: 0.4,
      metalness: 0.2,
      widthSegments: 32,
      heightSegments: 24,
    },
    rim: {
      // wireframe:false — a translucent SOLID shell, so the silhouette is a
      // glowing bubble rather than the wire cage every other skin wears.
      radius: 1.16,
      widthSegments: 24,
      heightSegments: 18,
      color: 0x7a5cff,
      opacity: 0.22,
      wireframe: false,
      additive: true,
      spinY: 0.35,
      spinX: 0.15,
    },
    corona: {
      radius: 1.34,
      widthSegments: 6,
      heightSegments: 4,
      color: 0x54ffd2,
      opacity: 0.38,
      wireframe: true,
      additive: true,
      spinY: -0.8,
      spinX: 0.4,
    },
  },
};

export const SKIN_IDS = Object.keys(SKINS);

// True only for an id that names a real skin in the registry.
export function hasSkin(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SKINS, id);
}

// Resolver. NEVER returns null/undefined: an unknown, missing, corrupt or
// future-version id resolves to the default skin, which is what makes a legacy
// or hand-edited save load into the original look instead of crashing the
// avatar builder.
export function getSkin(id) {
  if (hasSkin(id)) return SKINS[id];
  if (id && typeof id === 'object' && hasSkin(id.id)) return SKINS[id.id];
  return SKINS[DEFAULT_SKIN_ID];
}

// Coin price of a skin, or null if it is not bought with coins.
export function skinPrice(id) {
  const skin = getSkin(id);
  return skin.unlock.type === 'coins' ? skin.unlock.price : null;
}

// Reduces a save object (src/meta/save.js shape) to the scalar progress
// metrics a `milestone` unlock is measured against. Defensive: any missing or
// wrong-typed field reads as 0, never throws.
export function progressSnapshot(saveData) {
  const save = saveData && typeof saveData === 'object' ? saveData : {};

  const collection = save.collection && typeof save.collection === 'object' && !Array.isArray(save.collection)
    ? save.collection
    : {};
  const stars = save.stars && typeof save.stars === 'object' && !Array.isArray(save.stars) ? save.stars : {};

  let totalStars = 0;
  let levelsCleared = 0;
  for (const key of Object.keys(stars)) {
    const s = stars[key];
    if (typeof s === 'number' && Number.isFinite(s) && s > 0) {
      totalStars += s;
      levelsCleared += 1;
    }
  }

  return {
    achievements: Array.isArray(save.achievements) ? save.achievements.filter((a) => typeof a === 'string') : [],
    collectionEntries: Object.keys(collection).length,
    totalStars,
    levelsCleared,
    bestCombo: typeof save.bestCombo === 'number' && Number.isFinite(save.bestCombo) ? save.bestCombo : 0,
  };
}

// Current value of the metric a milestone-unlocked skin is measured against
// (0 for anything else), so the shop can render "12 / 30" progress.
export function milestoneProgress(id, progress) {
  const skin = getSkin(id);
  if (skin.unlock.type !== 'milestone') return 0;
  const p = progress && typeof progress === 'object' ? progress : {};
  const v = p[skin.unlock.metric];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// Is this skin's unlock CONDITION satisfied by the given progress snapshot?
//
// Only `default` (always), `achievement` and `milestone` can be satisfied by
// progress. A `coins` skin is never auto-satisfied — it is bought, which is an
// ownership change the caller records, not a condition this function can see.
export function isUnlockSatisfied(id, progress) {
  const skin = getSkin(id);
  const p = progress && typeof progress === 'object' ? progress : {};
  switch (skin.unlock.type) {
    case 'default':
      return true;
    case 'achievement':
      return Array.isArray(p.achievements) && p.achievements.includes(skin.unlock.achievementId);
    case 'milestone':
      return milestoneProgress(id, p) >= skin.unlock.threshold;
    default:
      return false;
  }
}

// Sanitizes a persisted owned-skins list: strings only, known ids only,
// de-duplicated, and always containing the default skin. Returns a NEW array
// (never the input), so a caller can trust it without cloning.
export function normalizeOwnedSkins(list) {
  const out = [DEFAULT_SKIN_ID];
  if (Array.isArray(list)) {
    for (const id of list) {
      if (hasSkin(id) && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

// The skin id that should actually be equipped: the requested one if it is
// both real and owned, otherwise the default. This is the last line of defence
// behind save.js's normalizer — a save that predates skins, or one hand-edited
// to equip something unowned, lands on the original look.
export function resolveEquippedSkinId(equippedId, ownedIds) {
  const owned = normalizeOwnedSkins(ownedIds);
  return hasSkin(equippedId) && owned.includes(equippedId) ? equippedId : DEFAULT_SKIN_ID;
}

// Given a save's progress and its currently-owned list, returns the owned list
// it SHOULD have (achievement/milestone skins whose conditions are now met,
// folded in) plus which ids were newly added — so a caller can persist once and
// toast exactly the new ones.
export function evaluateSkinUnlocks(saveData, ownedIds) {
  const progress = progressSnapshot(saveData);
  const owned = normalizeOwnedSkins(ownedIds);
  const newlyUnlocked = [];
  for (const id of SKIN_IDS) {
    if (owned.includes(id)) continue;
    const type = SKINS[id].unlock.type;
    if (type !== 'achievement' && type !== 'milestone') continue;
    if (isUnlockSatisfied(id, progress)) {
      owned.push(id);
      newlyUnlocked.push(id);
    }
  }
  return { owned, newlyUnlocked };
}

// One-line "how do I get this" string for the shop's locked rows. Includes
// live progress for milestone unlocks so a locked skin reads as a goal with a
// distance, not a wall.
export function describeUnlock(id, progress) {
  const skin = getSkin(id);
  const unlock = skin.unlock;
  switch (unlock.type) {
    case 'default':
      return 'Yours from the start.';
    case 'coins':
      return `Buy for 🪙 ${unlock.price}.`;
    case 'achievement':
      return `🏆 ${unlock.label || `Earn the ${unlock.achievementId} achievement`}`;
    case 'milestone': {
      const have = milestoneProgress(id, progress);
      const metric = METRIC_LABELS[unlock.metric] || unlock.metric;
      return `📈 Reach ${unlock.threshold} ${metric} (${Math.min(have, unlock.threshold)}/${unlock.threshold})`;
    }
    default:
      return 'Locked.';
  }
}
