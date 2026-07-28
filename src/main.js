// Flywheel 3D — real game bootstrap and flow (V2 wiring).
//
// Drives the V2 module stack: engine (scene/avatar/chase camera/input state
// machine/spatial hash/instanced prop world), content (seeded district
// layouts + baked ground textures + landmarks), data (levels/formulas/
// metros/seeds), systems (audio/combo/achievements/swallow controller +
// mercy tracker/rival archetypes/storm controller), meta (save v2/build
// shop/metro tokens/daily challenge/collection/world map) and UI (overlays/
// minimap).
//
// Flow: start screen -> world map (+ daily card) -> district intro -> play
// -> done (+ build shop) -> next level or world map -> ... -> win screen
// after level 100. Fail screen on timeout, with V2 mercy rules (second wind
// / pity magnet / heatmap). M mutes. Konami code + 'unsub'/'breeze' typed
// easter eggs are kept from the original shipped 2D game.
//
// Prop/roster bookkeeping: gameplay systems (swallow.js, rivals.js) own a
// single mutable `propObjects` array (they splice eaten props out and push
// piñata crumbs in). The instanced world keeps its OWN stable array of the
// same prop object references; `state.worldIndex` maps prop -> instance
// index so eats become world.setVisible(i, false) and mid-level spawns
// become world.add(...). The spatial hash mirrors the same roster for
// proximity/cluster queries; a second hash tracks only currently-edible
// props for the camera look-ahead and the minimap.
//
// No browser-only API (document/window/localStorage) is touched at module
// top level — everything lives inside main(), invoked only under the
// `typeof document !== 'undefined'` guard at the bottom — so a bare dynamic
// import of this file never throws in Node.
import * as THREE from 'three';

import { createEngine } from './engine/scene.js';
import { createAvatar, createHoleVisual, SKINS } from './engine/avatar.js';
import { createGrowthEffects, createRingBudget, RIVAL_RING } from './engine/effects.js';
import { createChaseCamera } from './engine/camera.js';
import { createInput } from './engine/input.js';
import { createSpatialHash } from './engine/spatialhash.js';
import { createInstancedWorld } from './engine/instancing.js';
import { createPool } from './engine/pools.js';

import { METROS } from './data/metros.js';
import { generateLevel, LEVEL_COUNT } from './data/levels.js';
import { mulberry32 } from './data/seeds.js';
import {
  rivalComposition, capstoneGateRadius, radiusFromMass, capProgressionAward,
  ELITE_GOLDEN_COIN_BONUS,
  PLAYER_BASE_SPEED, REACH_SWEEP_WIDTH, RIVAL_HOARD_SAFETY,
} from './data/formulas.js';

import * as propkit from './content/propkit.js';
import { createLandmark } from './content/landmarks.js';
import { generateDistrict } from './content/districts.js';
import {
  bakeGroundTexture, bakeGroundDetail, roadMarkingQuads, detailTileRepeat,
} from './content/groundtex.js';
import { loadCityTextures } from './content/textures.js';
import { loadModelKit } from './content/modelkit.js';
import { createMetroSignature } from './content/signatures.js';

import { Audio } from './systems/audio.js';
import { createComboTracker } from './systems/combo.js';
import { createAchievementTracker, ACH } from './systems/achievements.js';
import {
  createSwallowController, createMercyTracker, DEFAULT_SIZE_GATE,
} from './systems/swallow.js';
import { createRival, updateRival, RIVAL_WARMUP_SECONDS } from './systems/rivals.js';
// The win rule lives in ONE place (see systems/win.js and
// .wiki/0004-false-level-failure): the timer branch, the per-frame branch, the
// HUD chip, the mass bar and the fail copy all read from these, so a win
// condition can never again exist in the rules without existing in the UI.
import { evaluateWin, failReasonText, capstoneEffectiveRadius } from './systems/win.js';
import { createStormController } from './systems/storms.js';

import { loadSave, saveSave, logSeed } from './meta/save.js';
import {
  createAvailableMassLedger, starResult, levelReward,
} from './meta/progression.js';
import {
  buildShopViewModel, buyBuildPick, respec, applyBuilds, claimMetroTokens, perkEffects,
} from './meta/upgrades.js';
import {
  recordSighting, recordVariantSighting, checkHoarderMilestone, getFlavorText,
} from './meta/collection.js';
import { renderWorldMap, renderDailyCard } from './meta/worldmap.js';
import {
  getDailyStatus, recordDailyAttempt, recordDailyResult, dailyLevelSeed,
} from './meta/daily.js';

import {
  showOverlay, hideOverlay, updateHUD, renderBuildShop,
  initResponsiveFlags, isReducedMotion, applyIntroLine, showOneLiner,
  showOnboardingBeat, hideOnboarding, renderFailMercy,
  setDuelistTelegraph, setLockBadge, positionTutorialHand, setSizePill,
  spawnMassFloat, updateMassFloats, clearMassFloats,
  pokeScoreSparkle, updateScoreSparkle,
} from './ui/overlays.js';
import { createMinimap } from './ui/minimap.js';

// ---------------------------------------------------------------------------
// ATMOSPHERE CONSTANTS (0005 atmosphere pass). All world-relative, so a value
// here means the same thing on level 1 (world 2415) and level 100 (world 4800)
// instead of being a number that happens to look right on the level someone was
// staring at. Derivations live at their use sites in buildLevelWorld().
// ---------------------------------------------------------------------------
// FogExp2 density, expressed per world-width: density = this / level.world.
// 0.55 puts the fog factor at the map diagonal (1.414*world) at 54% on every
// level — hazy enough to read as air, far enough from 1.0 that the landmark
// keeps ~46% of its contrast from the worst corner on the map (art §4).
const FOG_DENSITY_PER_WORLD = 0.55;
// How far past the map edge the unlit haze band takes to reach full sky colour,
// as a fraction of world width. The lit ground skirt underneath only has to
// survive this far; past it every pixel is exactly the horizon colour — and as
// of the horizon-seam fix that is literally true rather than aspirational: the
// skirt's outer radius IS `world/2 + HAZE_RUN`, the same expression, not a
// separately-chosen number that happened to be near it. See buildLevelWorld().
const HAZE_RUN_WORLD = 0.35;
// The haze ring's radial vertex rings, split into the two jobs they do. The
// split is what makes the skirt rim un-missable rather than well-aimed:
//   RAMP   — rings spent on the alpha 0 -> 1 ramp. Because the ramp is keyed on
//            the SAME `hazeRun` the ring spacing is derived from, alpha reaches
//            exactly 1 ON a real vertex ring (k = RAMP/RAMP), not somewhere
//            between two of them where it would only be approximately 1.
//   MARGIN — rings of alpha-EXACTLY-1 haze kept OUTSIDE the skirt's rim, so the
//            rim is covered by a band with real width instead of by a boundary
//            it has to land on. One ring is 0.2*HAZE_RUN = 169u on level 1.
// Their sum is the geometry's phiSegments, so triangle count is unchanged from
// the 6 this shipped with (5 + 1) — this is a re-partition, not a subdivision.
const HAZE_RAMP_RINGS = 5;
const HAZE_MARGIN_RINGS = 1;
// Radius of the sky dome. It is depth-test-exempt and re-centred on the camera
// every frame, so this is not an occlusion distance — it only has to stay
// inside camera.far (12000, scene.js) with room for the camera's own height.
const SKY_DOME_RADIUS = 5000;

// ---------------------------------------------------------------------------
// Pure helpers (no DOM/THREE-instance-specific state) — safe at module scope.
// ---------------------------------------------------------------------------

// Fail-screen flavor lines — ported from the original shipped game's
// FAIL_LINES, reworded only where they named the retired CRM/records theme.
const FAIL_LINES = [
  'The city fought back. It had zoning laws.',
  'Retention rate: 100%. The streets retained themselves.',
  "Sync error 418: I'm a teapot, not a vacuum.",
  'The streets unionized. You were outvoted.',
  'Mass target missed. Management has been notified.',
];

// Konami code — EXACT sequence ported from the original (lowercased keys).
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

// Rival hole colors per archetype (game-design §4): you should read WHO is
// coming at you from across the district. Rivals wear the same ground-flush
// funnel + thick rim look as the player (engine/avatar.js createHoleVisual),
// with the archetype's signature hue as the bright rim over a dark throat.
const RIVAL_COLORS = {
  grazer: { rim: 0xe74c3c, colorA: 0x0c0405, colorB: 0x7a1f14, swirl: 1.0 },
  bandit: { rim: 0x9b59b6, colorA: 0x070410, colorB: 0x4a2a72, swirl: 0.9 },
  duelist: { rim: 0xff8c1a, colorA: 0x0d0603, colorB: 0x8a4a10, swirl: 1.1 },
};

// The cosmetic 1-15 "Size N" ladder (the HUD pill's readout). Pure, and the
// SINGLE definition of a size tier: the player's pill, the player's growth
// shockwave and every rival's growth ring all read from this one function, so
// the number the player sees and the beat they feel can never drift apart.
// Growth beats fire on an upward crossing of this value.
function sizeTierOf(radius, baseRadius, targetRadius) {
  const span = Math.max(1, (targetRadius || baseRadius) - baseRadius);
  return Math.max(1, Math.min(15, 1 + Math.floor(14 * (radius - baseRadius) / span)));
}

// Star rating for a completed level — scales with how much of the clock was
// left (a speed/skill signal), same thresholds as V1.
function starGlyphs(count) {
  const c = Math.max(0, Math.min(3, count || 0));
  return '★'.repeat(c) + '☆'.repeat(3 - c);
}

// Disposes every geometry/material/texture under `root` and detaches it from
// its parent — called before a level's content is torn down/replaced so a
// full 100-level playthrough doesn't leak GPU buffers.
// Average colour of the OUTER BAND of a baked ground canvas, as a CSS string
// THREE.Color parses. Used by the horizon skirt (0004 defect 4) so the plane
// that continues the world past the map edge is the colour the map actually
// ends on, rather than a hand-matched constant that drifts every time the bake
// or the exposure budget moves.
//
// Method: one drawImage downsample to 32x32 (the browser's own box filter does
// the averaging, so this never touches the full 1016-2016px bitmap per pixel),
// then mean the outermost ring of that grid — 124 samples. Cheap enough to run
// once per level build and completely independent of what groundtex chose to
// paint out there.
//
// Returns null with no DOM or no canvas, so every caller must have a fallback.
// Never called at module top level (headless discipline: the logic suite runs
// this file's imports in Node).
const GROUND_EDGE_SAMPLE = 32;
function sampleGroundEdgeColor(sourceCanvas) {
  if (!sourceCanvas || typeof document === 'undefined') return null;
  try {
    const n = GROUND_EDGE_SAMPLE;
    const small = document.createElement('canvas');
    small.width = n;
    small.height = n;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    if (!sctx) return null;
    sctx.drawImage(sourceCanvas, 0, 0, n, n);
    const { data } = sctx.getImageData(0, 0, n, n);
    let r = 0; let g = 0; let b = 0; let count = 0;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        if (i !== 0 && i !== n - 1 && j !== 0 && j !== n - 1) continue;
        const o = (j * n + i) * 4;
        r += data[o]; g += data[o + 1]; b += data[o + 2];
        count += 1;
      }
    }
    if (!count) return null;
    return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
  } catch (err) {
    // A tainted canvas would throw on getImageData. The bake is same-origin so
    // this cannot happen today; the caller's fallback covers it if it ever can.
    return null;
  }
}

function disposeObject3D(root) {
  if (!root) return;
  root.traverse((node) => {
    if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        if (!m) return;
        if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
        if (typeof m.dispose === 'function') m.dispose();
      });
    }
  });
  if (root.parent) root.parent.remove(root);
}

export async function main() {
  const canvasEl = document.getElementById('game');
  if (!canvasEl) return;

  initResponsiveFlags();

  // -------------------------------------------------------------------------
  // Bootstrap: engine/avatar/camera/input/minimap are created ONCE and reused
  // across every level; only the level's content (ground/instanced props/
  // landmark/rivals/storm) is rebuilt per level.
  // -------------------------------------------------------------------------
  const engine = createEngine(canvasEl, THREE);
  const avatar = createAvatar(engine.scene, THREE);

  // Realistic city surfaces (Leonardo-generated, textures.js): facade maps
  // for the three building tiers + ground zone patterns. Loaded once for the
  // whole session; null => procedural look (missing files / headless).
  let cityTextures = null;
  try {
    cityTextures = await loadCityTextures(THREE);
  } catch (e) {
    cityTextures = null;
  }

  // Blender prop pack (modelkit.js): authored low-poly trees/people/lamps/car
  // decoded into BufferGeometries and handed to propkit, which prefers them
  // over the procedural bakes (normalized to the same footprints). null =>
  // procedural props everywhere — the game boots identically without the files.
  try {
    propkit.setModelKit(await loadModelKit(THREE));
  } catch (e) {
    propkit.setModelKit(null);
  }

  // Per-level lighting mood (metro palette + night dimming) goes through
  // engine.setMood() — scene.js owns the fixtures; main never pokes light
  // intensities directly.

  // Camera look-ahead (game-design §2): the dominant EDIBLE cluster near the
  // player, from the edible-only hash. Returns null when nothing qualifies —
  // the camera's bias then decays to zero instead of yanking the view.
  function lookaheadProvider(x, z) {
    if (!state.edibleHash) return null;
    const clusters = state.edibleHash.queryClusters(x, z, 600, { minCount: 3 });
    return clusters.length ? clusters[0] : null;
  }
  const chaseCamera = createChaseCamera(engine.camera, avatar, THREE, {
    fov: 70,
    lookaheadProvider,
  });

  // Pointer drag-to-move: raycast from the engine camera onto the ground
  // plane (y = 0), per input.js's toGround contract.
  const groundRaycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundNdc = new THREE.Vector2();
  const groundHit = new THREE.Vector3();
  function screenToGround(ndcX, ndcY) {
    groundNdc.set(ndcX, ndcY);
    groundRaycaster.setFromCamera(groundNdc, engine.camera);
    const p = groundRaycaster.ray.intersectPlane(groundPlane, groundHit);
    return p ? { x: p.x, z: p.z } : null;
  }
  const input = createInput({ screenToGround, canvas: canvasEl });

  const minimap = createMinimap({ container: document.getElementById('minimap') });

  const state = {
    mode: 'start', // start | worldmap | intro | play | done | fail | win | shop
    saveData: loadSave(),
    achievementTracker: createAchievementTracker(),
    levelN: 1,
    level: null,
    layout: null,
    modifiedStats: null,
    perks: {},
    isDailyRun: false,
    dailyDate: null,
    levelRoot: null,
    world: null, // instanced prop world (rebuilt per level, metro-accented)
    propObjects: [],
    worldIndex: new Map(), // prop -> instanced-world index
    goldenProps: [],
    hash: null, // spatial hash: every live prop
    edibleHash: null, // spatial hash: only currently-edible props
    swallower: null,
    mercy: createMercyTracker(),
    rivals: [],
    comboTracker: createComboTracker(),
    stormCtl: null,
    vacuuming: new Set(),
    wobbling: new Set(),
    shockwaves: [],
    timer: 0,
    runCoins: 0,
    shieldRemaining: 0,
    capstoneEaten: false,
    // Written ONLY by the per-frame edibility pass, from the same comparison
    // the swallow itself uses — never recomputed at the read sites, or the
    // HUD chip and the actual swallow would disagree at the boundary.
    capstoneEdible: false,
    capstoneEdibleAnnounced: false,
    // 0 unless the L100 portal-protocol twist is active (metros.js
    // requiresComboCount), in which case the landmark stays sealed until the
    // peak combo reaches it.
    portalComboNeeded: 0,
    fastAchieved: false,
    peakCombo: 0,
    stormEatenCount: 0,
    lastEatenKind: null,
    chaosTimer: 0,
    notifTimer: 8,
    tickWholeSecond: -1,
    slowMo: 0,
    lockBadgeTimer: 0,
    telegraphTimer: 0,
    minimapTimer: 0,
    onboarding: null,
    // Wave-4: night variants, capstone twists, metro signatures, elite goldens.
    signature: null,
    night: false,
    // FogExp2 density (0005 atmosphere pass) — was { near, far } for the old
    // linear THREE.Fog. The two capstone twists that mutate fog scale this.
    baseFog: { density: 0 },
    // The sky dome, kept centred on the camera every frame (see the frame loop).
    sky: null,
    twist: null,
    twistState: null,
    valueMultiplier: 1,
    coinComboMultiplier: 1,
    rivalSpeedMultiplier: 1,
    targetRadius: 0,
    // Last Size-N tier the pill displayed. 0 means "not established yet", so
    // the first frame of a level sets the baseline WITHOUT firing a growth
    // beat (spawning at Size 1 is not a tier-up).
    sizeTier: 0,
    levelTime: 0,
    elitePulse: 0,
  };

  // Pre-seed the achievement tracker with whatever was already unlocked in a
  // previous session, silently — achievements persist via saveData.achievements.
  (state.saveData.achievements || []).forEach((key) => state.achievementTracker.unlock(key));

  // The swallow system sees the avatar THROUGH the build's eat-radius picks
  // ("Wide Maw" etc. grow the maw, i.e. BOTH the reach gate and the size
  // gate) while the avatar's true radius still drives visuals, rivals, and
  // the camera.
  const swallowAvatar = {
    radius: () => avatar.radius() * (state.modifiedStats ? state.modifiedStats.eatRadiusMultiplier : 1),
    position: avatar.position,
  };

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------------------
  // Small DOM helpers (banner / toast / notif).
  // ---------------------------------------------------------------------------
  let bannerTimeout = null;
  function showBanner(text, ms = 1400) {
    const el = document.getElementById('banner');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => el.classList.remove('show'), ms);
  }

  function showToast(html) {
    const container = document.getElementById('toasts');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = html;
    container.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3400);
    setTimeout(() => el.remove(), 3900);
  }

  function showNotif(text) {
    const container = document.getElementById('notifs');
    if (!container || container.children.length >= 3) return;
    const el = document.createElement('div');
    el.className = 'notif';
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4400);
    setTimeout(() => el.remove(), 4900);
  }

  // Virtual joystick visual (Hole.io-style white base + nub): renders the
  // input machine's touch-stick state each frame. Two divs, transform-only
  // updates; CSS gates visibility to coarse pointers AND an up HUD, so this
  // only ever toggles the .show class + moves transforms.
  const stickBaseEl = document.getElementById('stickBase');
  const stickNubEl = document.getElementById('stickNub');
  let stickVisualOn = false;
  function updateStickVisual() {
    if (!stickBaseEl) return;
    const s = input.stick;
    if (s) {
      if (!stickVisualOn) { stickBaseEl.classList.add('show'); stickVisualOn = true; }
      stickBaseEl.style.transform = `translate(${s.originX}px, ${s.originY}px) translate(-50%, -50%)`;
      if (stickNubEl) {
        stickNubEl.style.transform = `translate(-50%, -50%) translate(${s.dx}px, ${s.dy}px)`;
      }
    } else if (stickVisualOn) {
      stickBaseEl.classList.remove('show');
      stickVisualOn = false;
    }
  }

  // Unlocks `key` (if not already), toasts it, and persists it into the save.
  function unlockAchievement(key) {
    const entry = state.achievementTracker.unlock(key);
    if (entry) {
      if (!state.saveData.achievements.includes(key)) {
        state.saveData.achievements.push(key);
        saveSave(state.saveData);
      }
      showToast(`<b>ACHIEVEMENT</b><br>${entry[0]}<br><span style="color:#9fb4c4;font-size:12px">${entry[1]}</span>`);
      Audio.golden();
    }
    return entry;
  }

  // ART render scale for a gameplay prop. This is deliberately NOT
  // `radius / kindFootprintRadius(kind)` any more: that normalised every kind
  // to its GAMEPLAY radius, which is a difficulty quantity, and so gave every
  // kind a different units-per-metre (a bus came out narrower than a car).
  // propkit.kindRenderScale keeps the mesh metric-consistent while `radius`
  // — untouched — keeps driving the eat gate. See propkit.js
  // RENDER_SCALE_CORRECTION.
  function propBaseScale(kind, radius) {
    return propkit.kindRenderScale(kind, radius);
  }

  // ---------------------------------------------------------------------------
  // Mid-level prop spawns (piñata crumbs, storm drops, easter-egg props):
  // one funnel — gameplay roster + instanced world + spatial hash + swallow
  // registration all stay in lockstep.
  // ---------------------------------------------------------------------------
  function spawnProps(records) {
    if (!records.length || !state.world) return;
    const admitted = state.massLedger
      ? state.massLedger.admit(records, state.level.itemValueMultiplier * state.valueMultiplier)
      : records;
    if (!admitted.length) return;
    const firstIndex = state.world.add(admitted);
    admitted.forEach((prop, i) => {
      state.worldIndex.set(prop, firstIndex + i);
      state.propObjects.push(prop);
      state.hash.insert(prop);
      if (state.swallower) state.swallower.registerProp(prop);
      if (prop.golden) state.goldenProps.push(prop);
    });
  }

  // Removes a prop from every roster EXCEPT propObjects — the caller (swallow
  // splice, rival splice) owns that array. Hides the instance, drops the
  // hashes, clears animation/mercy tracking.
  function removePropRoster(prop) {
    const idx = state.worldIndex.get(prop);
    if (idx !== undefined && state.world) state.world.setVisible(idx, false);
    if (state.hash) state.hash.remove(prop);
    if (prop._edible && state.edibleHash) {
      state.edibleHash.remove(prop);
      prop._edible = false;
    }
    if (state.swallower) state.swallower.release(prop);
    state.vacuuming.delete(prop);
    state.wobbling.delete(prop);
    if (prop.golden) {
      const gi = state.goldenProps.indexOf(prop);
      if (gi !== -1) state.goldenProps.splice(gi, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Shockwave rings (rival piñata) — pooled expanding ground rings.
  // ---------------------------------------------------------------------------
  const shockwavePool = createPool({
    initialSize: 6,
    create: () => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffd54a, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      engine.scene.add(mesh);
      return { mesh, t: 0, radius: 10 };
    },
    reset: (s) => { s.mesh.visible = false; s.t = 0; },
  });

  function spawnShockwave(x, z, radius) {
    const s = shockwavePool.acquire();
    s.t = 0;
    s.radius = Math.max(10, radius || 10);
    s.mesh.position.set(x, 0.6, z);
    s.mesh.visible = true;
    state.shockwaves.push(s);
  }

  function updateShockwaves(dt) {
    for (let i = state.shockwaves.length - 1; i >= 0; i--) {
      const s = state.shockwaves[i];
      s.t += dt;
      const k = s.t / 0.6;
      if (k >= 1) {
        state.shockwaves.splice(i, 1);
        shockwavePool.release(s);
        continue;
      }
      const scale = s.radius * (0.2 + k * 1.4);
      s.mesh.scale.setScalar(scale);
      s.mesh.material.opacity = 0.7 * (1 - k);
    }
  }

  // ---------------------------------------------------------------------------
  // Level content construction
  // ---------------------------------------------------------------------------
  function buildLevelWorld(level, opts = {}) {
    disposeObject3D(state.levelRoot);
    if (state.world) { state.world.dispose(); state.world = null; }
    if (state.signature) { state.signature.dispose(); state.signature = null; }
    // The dome lives under levelRoot, which disposeObject3D() just tore down —
    // drop the handle with it so the frame loop can never chase a freed mesh.
    state.sky = null;
    setFrostVignette(false);
    state.propObjects = [];
    state.worldIndex = new Map();
    state.goldenProps = [];
    state.rivals = [];
    state.vacuuming = new Set();
    state.wobbling = new Set();
    for (const s of state.shockwaves) shockwavePool.release(s);
    state.shockwaves = [];

    const layout = generateDistrict(level, typeof opts.seed === 'number' ? { seed: opts.seed } : undefined);
    state.layout = layout;

    const metro = level.metro;
    // Night variants (L66+, content-and-meta §1): darker sky/fog, dimmed
    // lights; building window-glow is applied to the instanced world below.
    const night = !!(level.mechanics && level.mechanics.night);
    state.night = night;
    const skyColor = new THREE.Color(metro.sky);
    if (night) skyColor.multiplyScalar(0.28);
    // THE HORIZON PALETTE (0005 atmosphere pass). Three colours, one family:
    //   zenith   — the metro sky, pushed deeper. What is overhead.
    //   horizon  — the metro sky, lifted and desaturated. What the air looks
    //              like edge-on through a lot of it, and therefore ALSO the fog
    //              colour, the clear colour, and the colour the ground skirt has
    //              to resolve into. One value in three places is what makes the
    //              "world ends here" step disappear rather than move.
    // A real sky is brightest and least saturated at the horizon because you are
    // looking through the most air; that is the whole reason a flat clear colour
    // reads as a painted wall.
    const skyZenith = skyColor.clone().multiplyScalar(0.82);
    const skyHorizon = skyColor.clone().lerp(new THREE.Color(0xffffff), night ? 0.16 : 0.34);
    engine.scene.background = skyHorizon;
    // FOG: EXPONENTIAL-SQUARED, NOT LINEAR (0005 atmosphere pass).
    //
    // What was here: THREE.Fog with near = world*0.85 and far = world*2.0, i.e.
    // 2053u..4830u on level 1. Two problems, both visible.
    //   * A linear fog has an ONSET. Nothing is hazed at all until 2053u and
    //     then haze ramps linearly, which puts a soft ring on the ground at a
    //     fixed distance from the camera that slides as the camera moves. Air
    //     does not do that; it attenuates from the first metre.
    //   * far = world*2.0 is past the map's own diagonal (1.414*world), so
    //     nothing in the play area ever reached fog colour and the fade the
    //     horizon needed had to be faked by the skirt instead.
    // FogExp2 has no onset and no far plane: 1 - exp(-(d*z)^2). It also cannot
    // reach 1.0, which is not a rounding detail — it is a STRUCTURAL guarantee
    // of art-direction.md §4's hard constraint that the landmark is always
    // silhouette-visible. A linear fog can erase the goal by construction; this
    // one cannot, at any density, ever.
    //
    // Density is per-world, not absolute, so the ladder reads the same at both
    // ends: at d = FOG_DENSITY_PER_WORLD / world the fog factor at the map
    // diagonal is 1 - exp(-(0.55*1.414)^2) = 54% on EVERY level. Measured
    // against the constraint: the landmark viewed from the opposite corner of
    // the map — the worst case that exists — keeps 46% of its own contrast
    // against the sky. Inside the district it is nearly absent (4.6% at 1000u
    // on level 1), which is the "keeps the whole district crisp" decision from
    // 0003 preserved rather than traded away.
    const fogDensity = (night ? 2.2 : 1.0) * FOG_DENSITY_PER_WORLD / level.world;
    engine.scene.fog = new THREE.FogExp2(skyHorizon.getHex(), fogDensity);
    state.baseFog = { density: fogDensity };
    if (typeof engine.setMood === 'function') {
      engine.setMood({ sky: metro.sky, ground: metro.ground, night });
    }

    const root = new THREE.Group();
    root.name = `level-${level.n}`;
    engine.scene.add(root);
    state.levelRoot = root;

    // Ground: the seeded district layout baked into a real texture (streets,
    // curbs, zone tints — art §1). V1's flat color + debug GridHelper is dead.
    const groundGeo = new THREE.PlaneGeometry(level.world, level.world);
    // Asphalt/concrete/turf are all dielectrics: metalness is 0.0, not 0.02.
    // A non-zero metalness on a dielectric tints the specular by the base
    // colour and steals energy from the diffuse — invisible as a look, wrong
    // as physics, and it applies across the single largest surface in frame.
    const groundMat = new THREE.MeshStandardMaterial({ color: metro.ground, roughness: 0.93, metalness: 0.0 });
    const baked = bakeGroundTexture(layout, {
      metro,
      textures: cityTextures ? cityTextures.ground : null,
      // No fixed `size`: groundtex derives the canvas from level.world at a
      // CONSTANT world-space texel density (GROUND_TEXELS_PER_UNIT), so lane
      // paint and paving read identically on level 1 and level 100. The old
      // fixed 512/1024 bake stretched by up to 2x across the level ladder.
      //
      // Markings are drawn as GEOMETRY below instead of baked here — at this
      // density texture paint is a 1.2-texel line smeared over ~18 device
      // pixels. Leaving both on would double-draw a soft copy underneath.
      roadMarkings: false,
    });
    if (baked.canvas) {
      const tex = new THREE.CanvasTexture(baked.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      // The ground is viewed at a very grazing angle at the far end of the
      // map; 4x anisotropy was leaving the lane paint smeared out there, and
      // the sharper bake is wasted without it.
      //
      // NO HARDCODED CAP (0004 defect 2). This used to be min(8, max), and the
      // 8 was doing nothing but throwing away half the filtering the device was
      // offering: every WebGL2 target we care about reports 16 (measured 16 on
      // the live build, and 16 is the ceiling on Adreno / Mali / Apple GPUs
      // too). Anisotropic taps are only spent where the sampling footprint is
      // actually anisotropic — i.e. the far, grazing third of the ground — so
      // this is not a full-screen 16x cost, and the ground is the ONE surface
      // in the game where grazing minification dominates the frame. Whatever
      // the device reports is the right answer; do not re-cap it.
      tex.anisotropy = engine.renderer.capabilities.getMaxAnisotropy();
      groundMat.map = tex;
      groundMat.color.set('#ffffff');
    }
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    // The street plane is what every cast shadow lands on (scene.js sun).
    ground.receiveShadow = true;

    // DETAIL PASS — the fix for "textures are stretched".
    //
    // The layout map above is one texture over the whole world, so it tops out
    // at 0.55 texels per world unit. Measured at the real gameplay camera on a
    // mid-range phone, one of those texels covers a 14.7 x 14.7 DEVICE PIXEL
    // block: the ground is magnified ~15x past its own resolution, and linear
    // magnification of a 15x-too-coarse texture is exactly the smeared look
    // that was reported. Raising the bake cannot fix it — a whole-world
    // texture at 1 texel per device pixel would be 19,459px square, 1.41 GB.
    //
    // So high-frequency surface goes on a SECOND plane carrying a small
    // seamless tile repeated at a fixed world size: 512px over 32 world units
    // = 16 texels/unit, 29x the layout map and ~2 texels per device pixel,
    // for 1.0MB that does not grow with level size. MultiplyBlending, so the
    // tile modulates the lit ground beneath it rather than replacing it.
    //
    // Deliberately NOT done with onBeforeCompile: a shader injection cannot be
    // compile-tested without a GPU, and this pass is being authored blind. A
    // second plane uses only documented core API, and its failure mode is
    // visible-and-recoverable rather than a blank screen.
    const detailCanvas = bakeGroundDetail({ seed: layout.seed });
    if (detailCanvas) {
      const dtex = new THREE.CanvasTexture(detailCanvas);
      // COLOUR SPACE — sRGB, and the old NoColorSpace tag was wrong (0004
      // defect 2d). The reflex "a multiplier is data, so tag it NoColorSpace"
      // is right for maps a shader consumes in linear working space (roughness,
      // metalness, normals). This map is not one of those. It is a
      // MeshBasicMaterial's ONLY input, so it becomes the fragment's output
      // colour, and it is then multiplied against the FRAMEBUFFER, which holds
      // display-referred sRGB-encoded values (outputColorSpace = srgb, no sRGB
      // framebuffer in play). The multiply therefore happens in sRGB space, so
      // the number that has to land in the framebuffer is the authored one.
      //
      // Walk the two tags through the pipeline for the tile's DETAIL_FLOOR of
      // 0.78 (groundtex.js authors the grain to bottom out at x0.78):
      //   NoColorSpace: 0.78 sampled raw -> shader output 0.78 -> encoded to
      //     sRGB on write -> 0.90 lands in the framebuffer. The darkest grain
      //     multiplies by 0.90, not 0.78: HALF the authored contrast, silently.
      //   SRGBColorSpace: 0.78 decoded to linear 0.573 -> shader output 0.573
      //     -> encoded back -> 0.78 lands in the framebuffer. Exact round trip,
      //     which is what a display-space multiplier wants.
      // groundtex.js's DETAIL_FLOOR / DETAIL_GAMMA calibration (mean ~x0.95)
      // is written against the authored numbers, so sRGB is the tag that makes
      // that calibration true rather than aspirational.
      dtex.colorSpace = THREE.SRGBColorSpace;
      dtex.wrapS = THREE.RepeatWrapping;
      dtex.wrapT = THREE.RepeatWrapping;
      // Whole-number repeats: a fractional count cuts the last tile mid-pattern
      // against the plane edge, which is the one place this tile is not
      // seamless. See groundtex.js detailTileRepeat() for the <=1.2%
      // effective-tile-size price and why it is acceptable.
      const reps = detailTileRepeat(level.world);
      dtex.repeat.set(reps, reps);
      // Whatever the device offers — see the layout map above for why the old
      // min(8, ...) cap was pure loss.
      dtex.anisotropy = engine.renderer.capabilities.getMaxAnisotropy();
      const detailMat = new THREE.MeshBasicMaterial({
        map: dtex,
        blending: THREE.MultiplyBlending,
        // PREMULTIPLIED ALPHA IS LOAD-BEARING. DO NOT REMOVE (0004 defect 1).
        //
        // three.js will not emit a multiply blend equation for a material whose
        // premultipliedAlpha is false. WebGLState.setBlending() has two
        // switch blocks — one for premultipliedAlpha true, one for false — and
        // the false block has NO MultiplyBlending case at all. It logs
        //   "THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true"
        // and RETURNS WITHOUT SETTING gl.blendFunc, leaving whatever the last
        // material set — in practice NormalBlending's SRC_ALPHA /
        // ONE_MINUS_SRC_ALPHA. This tile's alpha is 255 everywhere, so under
        // NormalBlending it does not modulate the ground, it REPLACES it: a
        // near-white opaque plane over the entire city, at 100% grain contrast
        // instead of ~10%. That is both the "ground blown out white" report and
        // most of the "spastic" crawl, from one missing boolean.
        // (node_modules/three/src/renderers/webgl/WebGLState.js:670-696, r185.)
        //
        // Measured on the live build before the fix: 545 of that error in a
        // single 453-frame run, ~127/second.
        //
        // The failure is SILENT in the sense that nothing throws and nothing
        // goes black — you just get a wrong, plausible-looking frame plus
        // console spam. Anyone adding another MultiplyBlending or
        // SubtractiveBlending material must set this too. (AdditiveBlending is
        // NOT affected: the non-premultiplied block does have an additive case,
        // SRC_ALPHA / ONE, so the three additive materials in landmarks.js,
        // signatures.js and the shockwave pool are correct as they stand.)
        premultipliedAlpha: true,
        transparent: true,
        depthWrite: false,
        fog: false,
        // GROUND-STACK DEPTH LADDER, rung 1 of 3 (0004 defect 3c). The three
        // ground layers are separated by WORLD units — ground 0.00, this grain
        // 0.05, lane paint 0.08, blob shadow decals 0.15 — and world units are
        // the wrong currency for depth, for exactly the reason spelled out at
        // avatar.js DISC_DEPTH_BIAS: the chase camera stands off at 12*radius,
        // so the depth quantum at the ground grows quadratically as the hole
        // grows. Before scene.js fixed near/far the quantum was 2.51 world
        // units at fog near and the ENTIRE stack collapsed into one value; the
        // order held only because this plane does not write depth and the
        // opaque paint happened to be created first, i.e. by luck. Even after
        // the near fix the quantum reaches 0.069u at the far ground corner,
        // which is larger than this plane's own 0.05 lead over the ground.
        //
        // polygonOffset is denominated in quanta AT THE FRAGMENT'S OWN DEPTH,
        // so it is distance- and radius-independent by construction. The
        // ladder, all negative (= toward the eye) and all strictly inside the
        // budget avatar.js reserves for the mouth (disc -2, collar -6):
        //
        //     ground plane        0   (main.js groundMat)
        //     ground detail      -1   (here)
        //     road markings      -2   (paintMat below)
        //     blob shadow decals -3   (instancing.js shadowMat)
        //
        // The rungs only break TIES; the geometric Y offsets still carry the
        // ordering at close range, which is why the mouth disc's 0.22-unit
        // lead over the paint is never at risk from the paint's matching -2.
        //
        // TRAP: if renderer reversedDepthBuffer is ever enabled, EVERY sign in
        // this ladder must flip. Reversed-Z makes larger window z mean nearer,
        // and three passes polygonOffsetFactor/Units straight to gl.polygonOffset
        // with no compensation (WebGLState.js:860-878).
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        // This map is a multiplier against already-tone-mapped framebuffer
        // content, so it must not be tone-mapped itself. A no-op today
        // (renderer.toneMapping is NoToneMapping) and cheap insurance for the
        // moment the lighting pass turns tone mapping on.
        toneMapped: false,
      });
      const detail = new THREE.Mesh(new THREE.PlaneGeometry(level.world, level.world), detailMat);
      detail.rotation.x = -Math.PI / 2;
      detail.position.y = 0.05; // ground 0 < detail 0.05 < blob shadows 0.15
      // Both this and the blob decals are transparent, so both land in the
      // transparent pass; renderOrder is what puts the grain UNDER the decals
      // (blob shadows are -1) instead of multiplying them.
      detail.renderOrder = -2;
      detail.receiveShadow = false;
      detail.castShadow = false;
      detail.name = 'ground-detail';
      root.add(detail);
    }

    // ROAD MARKINGS AS GEOMETRY — the second half of the sharpness fix.
    //
    // Geometry has no texel size, so lane paint is pixel-sharp at any zoom
    // instead of being a 1.2-texel line smeared across ~18 device pixels.
    // Every quad merges into ONE BufferGeometry, so the entire marking set
    // across every street costs a single draw call.
    //
    // Y-ORDER, and what actually enforces it. Paint sits at 0.08, ABOVE the
    // detail plane at 0.05. Paint is opaque so it draws in the opaque pass and
    // writes depth; the detail plane is transparent and depth-TESTS (depthWrite
    // off, depthTest on), so its fragments fail behind the paint and the grain
    // never muddies the paint. Where there is no paint the detail sits above
    // bare ground and passes. Blob shadows stay above everything at 0.15.
    //
    // That paragraph used to end there, and as written it was FALSE (0004
    // defect 3): 0.03 world units of separation is not a depth difference the
    // buffer could resolve at gameplay range — the whole stack quantised to one
    // value, and the order survived on draw-order luck. It is true now, for two
    // reasons that both had to be added: scene.js's near/far fix (0.081 -> 0.0004
    // world units of depth resolution at the avatar) and the explicit
    // polygonOffset ladder on the three materials, which is what makes the
    // ordering hold at ANY distance rather than at close range only.
    const quads = roadMarkingQuads(layout);
    if (quads.length) {
      const positions = new Float32Array(quads.length * 4 * 3);
      const colors = new Float32Array(quads.length * 4 * 3);
      const indices = new Uint32Array(quads.length * 6);
      const PAINT_Y = 0.08;
      quads.forEach((q, qi) => {
        const c = Math.cos(q.rotY);
        const s = Math.sin(q.rotY);
        const hw = q.w / 2;
        const hd = q.d / 2;
        // tone -1 is a manhole plate (dark), otherwise white paint at `tone`.
        const v = q.tone < 0 ? 0.30 : q.tone;
        const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
        corners.forEach(([lx, lz], ci) => {
          const i = (qi * 4 + ci) * 3;
          positions[i] = q.x + c * lx + s * lz;
          positions[i + 1] = PAINT_Y;
          positions[i + 2] = q.z - s * lx + c * lz;
          colors[i] = v;
          colors[i + 1] = v;
          colors[i + 2] = q.tone < 0 ? v * 1.02 : v;
        });
        const o = qi * 6;
        const b = qi * 4;
        indices[o] = b; indices[o + 1] = b + 2; indices[o + 2] = b + 1;
        indices[o + 3] = b; indices[o + 4] = b + 3; indices[o + 5] = b + 2;
      });
      const paintGeo = new THREE.BufferGeometry();
      paintGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      paintGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      paintGeo.setIndex(new THREE.BufferAttribute(indices, 1));
      paintGeo.computeVertexNormals();
      // Lit, not unlit: road paint is a dielectric on the road surface and has
      // to sit in the same light as the asphalt under it, or it glows at night.
      const paintMat = new THREE.MeshStandardMaterial({
        roughness: 0.9, metalness: 0.0, vertexColors: true,
        // GROUND-STACK DEPTH LADDER, rung 2 of 3. See the block comment above
        // detailMat for the whole ladder and why world-unit Y offsets are the
        // wrong currency.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const paint = new THREE.Mesh(paintGeo, paintMat);
      paint.receiveShadow = true;
      paint.castShadow = false;
      paint.name = 'road-markings';
      root.add(paint);
    }
    root.add(ground);

    // HORIZON SKIRT — the world must not end in a visible slab edge (0004
    // defect 4, `09-far.png`: the 2415-unit ground plane terminating in a hard
    // line with buildings overhanging into raw sky-blue).
    //
    // WHY THE EDGE IS REACHABLE AT ALL. The chase camera's shallowest pitch is
    // 35 degrees (camera.js PITCH_MIN) and its vertical FOV is 70 (main.js
    // passes fov: 70), so the TOP ray of the frame sits at 35 - 35 = 0 degrees:
    // dead level with the horizon. At the default 55-degree pitch the top ray
    // is 20 degrees down and reaches the ground ~2.75x the camera height away;
    // at 35 degrees it never reaches the ground at all. Fog does not start
    // until world*0.85 (2053u on level 1), so the first thing the player sees
    // out there is an unfogged, fully-lit cliff.
    //
    // WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. Under the "premium
    // stylized" direction (art-direction.md: Monument Valley / Donut County
    // polish on a flat-cartoon read) the answer is cheap and flat, not a
    // photoreal skybox and not a cubemap. This is ONE flat ring, unlit-adjacent
    // and untextured, that continues the ground outward and lets the EXISTING
    // fog dissolve it:
    //
    //   * Its colour is MEASURED off the baked ground, not authored. Two
    //     earlier attempts and what each measured:
    //       1. a hand-picked tint from the zone palette — A/B'd against the
    //          live build it landed ~40% darker than the lit, textured ground
    //          it was meant to continue, replacing the hard slab edge with an
    //          equally hard TONE edge. A constant also has to be re-matched
    //          every time the lighting or GROUND_ALBEDO_SCALE moves, and the
    //          lighting pass is about to move all three lights.
    //       2. sharing groundMat with UVs clamped to the map's border texels
    //          (the classic clamped-ground-extension trick). Tone matched
    //          perfectly — and streaked the border's roads, kerbs and lane
    //          paint radially outward as hard lines all the way to the rim.
    //          Worse than the void it replaced.
    //     What actually works is the average of the map's OUTER BAND, taken
    //     from the bake itself: the ground is downsampled to 32x32 with one
    //     drawImage and the outermost ring of that grid is averaged (124
    //     pixels, one time, at level build). That is by definition the colour
    //     the ground reads as where it ends, it needs no palette assumption, it
    //     tracks any future change to the bake for free, and because it goes on
    //     a MeshStandardMaterial with the ground's roughness/metalness and the
    //     same +Y normal it is lit identically — so the join matches under
    //     whatever the lighting pass does next.
    //   * Flat, so 64x1 segments / 128 triangles is enough. Fog is a per-vertex
    //     view depth interpolated per-fragment, and view depth is linear across
    //     a flat quad, so a single radial band fogs exactly as smoothly as
    //     twenty-four would.
    //   * Radii: inner 0.48*world. The ring is a polygon, so its true inradius
    //     is 0.48*world*cos(pi/64) = 0.4794*world, still inside the square's
    //     0.5*world inscribed circle — no gap can open at the axis mid-points
    //     where the square's edge comes closest to the centre, and the corners
    //     at 0.707*world are covered with room to spare. The OUTER radius is
    //     `skirtOuter`, derived below — it is not a number chosen here. It ran
    //     to half + fogFar (6037u on level 1) originally, then to
    //     half + 1.25*HAZE_RUN (2264u), and is now half + HAZE_RUN (2053u).
    //     Every pixel past that was being lit-shaded and then painted over by
    //     the haze; see THE SEAM THAT WAS LEFT, below, for why 1.25 was not
    //     merely wasteful but actively wrong.
    //   * y = -2, i.e. UNDER the opaque ground plane, so the overlap is
    //     occluded by depth rather than by ordering. 2 units is 29x the depth
    //     increment at the far ground corner under the new near/far, so it
    //     cannot z-fight; and a 2-unit step seen from 200-1800 units of camera
    //     height at 2000+ units of range is far under a pixel.
    //   * receiveShadow/castShadow off: the shadow camera never covers it and
    //     it has nothing to occlude.
    //
    // THE RESIDUAL THAT IS NOW FIXED, and what the measurement said. The first
    // pass shipped this skirt out to `world/2 + fogFar` and left a note that
    // between the map edge and fog near it "reads as a stretched continuation
    // of the ground's border rather than as haze". An adversarial verification
    // pass on the live build put numbers on how bad that was: the ground->skirt
    // join improved from a 271.6 channel step to 49.0, but the skirt->sky
    // boundary became a NEW hard step of 202.9 ([58,167,254] against
    // [117,129,151]), and near the map edge the skirt filled 40-50% of the frame
    // as flat grey. The hard edge had been relocated, not removed — a blue void
    // traded for a grey one, ~25% better on the thing a player actually reads as
    // "the world ends here".
    //
    // Why fog could never have fixed it, which is worth writing down because it
    // is the trap: standing at the play bound the player is ~26 world units from
    // the map edge, so the skirt starts AT THEIR FEET. No fog curve reaches a
    // surface at zero distance. The skirt has to resolve into the sky by its own
    // colour, and fog is only what handles the part that is genuinely far away.
    //
    // So the horizon is now three cooperating pieces, all sharing one colour:
    //   1. this skirt        — LIT, continues the ground's tone past the edge
    //   2. the haze band     — UNLIT, alpha 0 -> 1 in skyHorizon over HAZE_RUN
    //   3. the sky dome      — UNLIT, skyHorizon at and below the horizon line,
    //                          ramping to skyZenith overhead
    // Because (2) saturates at exactly the colour (3) paints at the horizon,
    // and scene.fog is that same colour, there is no step anywhere: ground to
    // skirt is a tone match, skirt to haze is an alpha ramp from that tone, haze
    // to sky is the identical colour on both sides.
    //
    // The skirt also gets SHORTER as a direct consequence: it used to run to
    // world/2 + fogFar (6037u on level 1) and now stops where the haze band is
    // fully opaque, because every pixel beyond that was being shaded by a full
    // MeshStandardMaterial and then completely covered. That is the one part of
    // this change that is a straight performance win on the surface the
    // verification pass measured at 40-50% of frame.
    //
    // THE SEAM THAT WAS LEFT, AND WHY IT WAS A CONSTRUCTION BUG (2026-07-28,
    // adversarial verification of 4377c82; art-direction.md §1). The three-layer
    // scheme above was right and the numbers wired into it were not. As shipped:
    //
    //   skirt outer radius   = half + 1.25*HAZE_RUN   (2264.06u on level 1)
    //   haze outer radius    = half + 1.20*HAZE_RUN   (2221.80u)
    //   haze alpha reaches 1 = half + HAZE_RUN/1.2    (~1911.9u, and not on a
    //                                                  vertex ring, so "1" there
    //                                                  was interpolation luck)
    //
    // The skirt therefore stuck out 42.26 world units PAST the ring that was
    // supposed to be painting over it. Past the haze's own rim there is no haze
    // at all, so those 42 units were bare lit skirt against bare sky. Seen from
    // the play bound at the minimum 35-degree pitch that annulus subtends 0.37
    // degrees, which at fov 70 over 900px is 4.2px: measured live as a 3-4px
    // dark hairline arcing across the sky, adjacent channel-sum deltas
    // 151/203/153/154/157 across five columns, line [131,135,152] against sky
    // [163,203,255]. The same rim is the faint circle around the map at r=483.
    //
    // Note what kind of failure that is. The join itself was excellent — 1-3
    // channel-sum through the whole ground->skirt->haze->sky ramp against a ~15
    // target. Nothing was mis-tinted. TWO INDEPENDENTLY-CHOSEN CONSTANTS, 1.25
    // and 1.2, simply had to be ordered and were not, and nothing in the code
    // said they had to be. That is the class of bug this block now removes:
    // fixing 1.25 to 1.15 would have made the picture right and left the trap
    // armed for the next person to change HAZE_RUN_WORLD, the ring count, the
    // pitch clamp or the world size.
    //
    // So the radii are DERIVED, once, here, and the invariant is an identity
    // rather than an inequality that happens to hold:
    //
    //   hazeFull   — the radius at which the haze's alpha ramp completes. Lands
    //                exactly on vertex ring HAZE_RAMP_RINGS because the ramp is
    //                keyed on the same hazeRun the ring spacing comes from, so
    //                alpha there is exactly 1, not 0.9976.
    //   skirtOuter — literally `hazeFull`, the same binding. The skirt cannot
    //                end anywhere the haze has not already saturated, because
    //                there is no second expression that could disagree.
    //   hazeOuter  — hazeFull plus HAZE_MARGIN_RINGS of alpha-1 haze, so the
    //                covering band has width (169u on level 1) and the skirt rim
    //                is interior to it rather than coincident with its edge.
    //
    // Two further guarantees fall out for free, both worth stating because they
    // are why this needs no epsilon:
    //   * Both rings are 64-gons built by RingGeometry with the same thetaStart
    //     and thetaSegments, so the skirt's rim polygon and the haze's alpha-1
    //     ring polygon are the SAME polygon, vertex for vertex. The polygonal
    //     inradius that the old 1.25 was nominally margin against cancels out.
    //   * The haze sits at y = -1 and the skirt at y = -2. From any eye above
    //     both — every eye this camera can have — the higher surface at equal
    //     radius projects ABOVE the lower one, so even the coincident case fails
    //     in the safe direction. The margin ring is belt to that braces.
    //
    // And past hazeOuter there is nothing left to seam: alpha-1 haze is drawn
    // over the sky dome, which is exactly skyHorizon at and below the horizon
    // line, which is exactly scene.background and exactly scene.fog's colour.
    // The ONE-COLOUR principle 4377c82 established is what terminates the stack;
    // this block just stops the geometry from stepping outside its protection.
    //
    // NOT a gameplay change: nothing reads any of these three meshes. None is in
    // state.propObjects, none is in either spatial hash, none is a camera
    // obstacle, and the play bounds (layout.world) are untouched.
    const hazeRun = level.world * HAZE_RUN_WORLD;
    const hazeInner = level.world / 2;
    const hazeStep = hazeRun / HAZE_RAMP_RINGS;
    const hazeFull = hazeInner + hazeRun;
    const hazeOuter = hazeFull + hazeStep * HAZE_MARGIN_RINGS;
    const skirtOuter = hazeFull;
    const skirtGeo = new THREE.RingGeometry(level.world * 0.48, skirtOuter, 64, 1);
    const skirtMat = new THREE.MeshStandardMaterial({
      // Fallback is the raw metro ground colour, which is exactly what
      // groundMat itself falls back to when the bake produced no canvas
      // (headless / no DOM), so the two still agree in that path.
      color: sampleGroundEdgeColor(baked.canvas) || metro.ground,
      roughness: 0.93,
      metalness: 0.0,
    });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = -2;
    skirt.receiveShadow = false;
    skirt.castShadow = false;
    skirt.name = 'horizon-skirt';
    root.add(skirt);

    // HAZE BAND — the piece that turns the skirt from a slab into distance.
    //
    // An UNLIT ring lying just above the skirt, coloured skyHorizon throughout,
    // whose vertex ALPHA runs 0 at the map edge to 1 by the end of HAZE_RUN.
    // Alpha, not a colour lerp, is what makes this robust: it blends from
    // whatever the lit skirt beneath it actually renders as, so it stays correct
    // under any future change to the light rig, to GROUND_ALBEDO_SCALE, or to
    // the metro palette, with no constant to re-match. That is exactly the trap
    // the first pass's own comment recorded from its two failed attempts at a
    // hand-picked skirt tint.
    //
    // It sits at y = -1, i.e. between the skirt (-2) and the ground plane (0),
    // so the opaque ground occludes it by depth over the play area and it only
    // exists past the edge. renderOrder 1 puts it after the blob decals (-1) and
    // the grain plane (-2) in the transparent pass, which it is nowhere near
    // geometrically but which costs nothing to state.
    //
    // fog:false on purpose. Fogging the haze would apply the horizon colour
    // twice to the same pixels, and it is already exactly that colour.
    //
    // Radii and ring count come from the derived block above the skirt — this
    // mesh deliberately computes none of its own, because the whole seam defect
    // was two meshes computing their own and disagreeing.
    const hazeGeo = new THREE.RingGeometry(
      hazeInner, hazeOuter, 64, HAZE_RAMP_RINGS + HAZE_MARGIN_RINGS,
    );
    {
      const pos = hazeGeo.attributes.position;
      const col = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i += 1) {
        const rad = Math.hypot(pos.getX(i), pos.getY(i)); // pre-rotation, XY plane
        // Normalised position across the RAMP — not across the geometry. Keying
        // on hazeRun is what puts alpha exactly 1 on the vertex ring at hazeFull
        // (k = 1 there by definition), which is the ring the skirt's rim sits
        // on. The old form multiplied by 1.2 to normalise across the geometry
        // instead, which saturated the ramp early, between two vertex rings, and
        // is why "fully opaque" was a place the skirt could be measured against
        // but not a place it was built against.
        // smoothstep after that, so the onset is gradual rather than a visible
        // start line at the map edge.
        const k = Math.max(0, Math.min(1, (rad - hazeInner) / hazeRun));
        const a = k * k * (3 - 2 * k);
        col[i * 4] = skyHorizon.r;
        col[i * 4 + 1] = skyHorizon.g;
        col[i * 4 + 2] = skyHorizon.b;
        col[i * 4 + 3] = a;
      }
      hazeGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    }
    const hazeMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const haze = new THREE.Mesh(hazeGeo, hazeMat);
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = -1;
    haze.renderOrder = 1;
    haze.receiveShadow = false;
    haze.castShadow = false;
    haze.name = 'horizon-haze';
    root.add(haze);

    // SKY DOME — the horizon line, and the reason the sky stops reading as a
    // painted wall.
    //
    // The first pass costed a full-screen gradient background pass and rejected
    // it as "replacing a free glClear with real mobile bandwidth". That costing
    // was right about a full-screen textured pass and wrong about the cheapest
    // way to get the read. This is geometry, not a post pass: an open-bottomed
    // sphere with a two-stop VERTEX-COLOUR ramp on a MeshBasicMaterial — the
    // cheapest fragment shader three can emit, one interpolated colour, no
    // lighting, no texture fetch, no fog. It draws only where sky is actually
    // visible, which at the default 55-degree camera pitch is close to zero
    // pixels and at the 35-degree minimum pitch is a band across the top.
    //
    // Construction notes, each load-bearing:
    //   * thetaLength 0.62*PI takes the dome from the zenith to 21.6 degrees
    //     BELOW the horizon, so there is no rim to see over even when the
    //     camera pitches to its 35-degree minimum.
    //   * The ramp is keyed on max(0, y)/radius, so EVERYTHING at or below the
    //     horizon line is exactly skyHorizon — the same value the haze band
    //     saturates to and the same value scene.fog uses. The gradient only
    //     exists above the horizon, which is both physically right and what
    //     makes the horizon a clean line instead of a smudge.
    //   * depthTest AND depthWrite off with renderOrder -1000: it is a
    //     background, painted first, overwritten by everything. This also means
    //     SKY_DOME_RADIUS is not an occlusion budget — nothing can ever be
    //     hidden by it — so it only has to stay inside camera.far.
    //   * It is re-centred on the camera every frame (see the frame loop), so
    //     the gradient never skews as the camera climbs with the hole. A dome
    //     pinned to the world would tip its horizon as the camera rose 200 ->
    //     1800 units.
    //   * fog:false — fogging the sky toward the fog colour, which IS the sky
    //     colour, is a no-op that costs a per-fragment mix.
    const skyGeo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
    {
      const pos = skyGeo.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i += 1) {
        const t = Math.max(0, pos.getY(i)) / SKY_DOME_RADIUS;
        // sqrt bias: most of the visible sky in a 35-55 degree chase view sits
        // in the bottom third of the dome, so a linear ramp spends its gradient
        // where nobody is looking.
        c.copy(skyHorizon).lerp(skyZenith, Math.sqrt(t));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      skyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    }));
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    sky.name = 'sky-dome';
    root.add(sky);
    state.sky = sky;

    // Props: the district layout's seeded placements, turned into the runtime
    // prop-object contract (live fields the instanced world reads per frame:
    // position / rotationY / tiltX / tiltZ / scale / scaleY). Render scale is
    // an ART quantity (propkit.kindRenderScale) and is bounded to +-25% of
    // the gameplay-normalized scale, so the 1.35x tier step stays sacred and
    // legible while the city keeps ONE units-per-metre.
    const worldProps = [];
    const buildings = []; // fed to metro signatures (roofs, facade signs)
    for (const rec of layout.props) {
      const radius = rec.radius * (rec.scaleMult || 1);
      const baseScale = propBaseScale(rec.kind, radius);
      const prop = {
        position: new THREE.Vector3(rec.x, 0, rec.z),
        radius,
        // What the mesh OCCUPIES, as opposed to what it EATS at. Contact
        // shadows and any footprint query want this, not `radius`.
        footprintRadius: baseScale * propkit.kindFootprintRadius(rec.kind),
        mass: rec.mass,
        kind: rec.kind,
        visualId: rec.visualId,
        collectionKey: rec.collectionKey,
        materialVariant: rec.materialVariant || 'default',
        golden: !!rec.golden,
        elite: !!rec.elite,
        variant: rec.variant || null,
        rotationY: rec.rotY || 0,
        scale: baseScale,
        baseScale,
        scaleY: baseScale,
        tiltX: 0,
        tiltZ: 0,
        moving: rec.moving || null,
        spawnFeast: !!rec.spawnFeast,
        _edible: false,
      };
      state.propObjects.push(prop);
      worldProps.push(prop);
      if (prop.golden) state.goldenProps.push(prop);
      if (rec.kind.startsWith('building')) {
        buildings.push({
          x: rec.x, z: rec.z, rotY: rec.rotY || 0,
          radius, height: propkit.kindHeight(rec.kind) * baseScale,
        });
      }
    }

    state.world = createInstancedWorld({
      scene: engine.scene, propkit, accent: metro.accent, textures: cityTextures,
      seed: layout.seed,
    });
    state.world.set(worldProps);
    worldProps.forEach((p, i) => state.worldIndex.set(p, i));
    // Night variant: emissive window-glow on the building kinds (cheap — no
    // bloom, just a warm material emissive on those groups).
    if (night) state.world.setBuildingGlow('#ffd9a0', 0.4);

    // Capstone landmark on the district's largest plaza (districts.js picks
    // the spot) — its own mesh, NOT instanced; gated by capstoneGate(n) and,
    // from L61, by the landmark shield (eat N props to de-shield).
    const landmark = createLandmark(metro.landmarkType, THREE, metro.accent);
    // THE GATE IS THE ECONOMY VALUE AT EVERY METRO, and the mesh is scaled to
    // match it. The spawn used to take max(geometry, economy): mega-spire's
    // 73.6u bounding radius won that max on L41-L50, so its size gate did not
    // open until the player was at 101.6% of the target the HUD advertises —
    // an unwinnable-at-target level (.wiki/0004 §4.3). Making the drawn thing
    // the measured thing means the number on screen is always a sufficient
    // goal, and every other metro is untouched (their geometry is already
    // under the economy radius).
    const capstoneSize = capstoneEffectiveRadius(
      landmark.boundingRadius, capstoneGateRadius(level),
    );
    const gateRadius = capstoneSize.radius;
    if (capstoneSize.meshScale !== 1) {
      landmark.scale.multiplyScalar(capstoneSize.meshScale);
      landmark.boundingRadius = gateRadius;
    }
    landmark.position.set(layout.landmark.x, 0, layout.landmark.z);
    landmark.rotation.y = layout.landmark.rotY || 0;
    root.add(landmark);
    const capstoneTier = level.template[level.template.length - 1];
    state.shieldRemaining = level.mechanics && level.mechanics.landmarkShield ? level.mechanics.landmarkShield : 0;
    state.propObjects.push({
      object3D: landmark,
      position: landmark.position,
      // The economy-derived gate radius (see the mesh scaling above). The raw
      // bounding radius is smaller than a tier-6 building on most metros,
      // which would make the boss eat edible in the opening seconds.
      radius: gateRadius,
      // A landmark is the level's boss eat — a hefty one-time bonus on top of
      // the largest regular tier's base mass.
      mass: capstoneTier.baseMass * 8,
      kind: metro.landmarkType,
      golden: false,
      isCapstone: true,
      // A shielded landmark is never edible: gate fraction 0 fails every
      // size check until the shield breaks (see the eat loop).
      capstoneGate: state.shieldRemaining > 0 ? 0 : level.capstoneGate,
    });
    state.massLedger = createAvailableMassLedger(
      level,
      state.propObjects,
      level.itemValueMultiplier * state.valueMultiplier,
    );

    chaseCamera.setObstacles([landmark]);

    // Proximity structures: one hash for everything (swallow scans, rival
    // targeting), one for currently-edible props only (camera look-ahead,
    // minimap clusters). Edibility membership is maintained in updatePlay.
    state.hash = createSpatialHash({ cellSize: 100 });
    state.edibleHash = createSpatialHash({ cellSize: 100 });
    for (const p of state.propObjects) state.hash.insert(p);

    // The eat loop: contact eating (exact V1 gates) + vacuum snap + wedge
    // wobble + near-miss crumbs.
    state.swallower = createSwallowController({
      spatialHash: state.hash,
      onVacuumStart: () => { Audio.vacuumWhoosh(); },
      onWedgeWobble: (obj) => {
        Audio.wedgeThunk();
        state.wobbling.add(obj);
        pinLockBadge(obj);
      },
    });

    // Rivals, one per the level's authored archetype composition (Grazer /
    // Duelist / Bandit). Kept away from the player's spawn so they can't camp
    // the opening feast; warmup keeps the first seconds uncontested.
    const comp = (level.mechanics && Array.isArray(level.mechanics.rivals) && level.mechanics.rivals.length)
      ? level.mechanics.rivals
      : rivalComposition(level.n);
    // Starvation safety (game-design §5 invariant 3): a rival's total hoard
    // is capped at what the player could have swept by minute 1 — the same
    // corridor model as formulas.reachableBaseMass, at t=60s.
    const reachFraction = Math.min(1, (PLAYER_BASE_SPEED * 60 * REACH_SWEEP_WIDTH) / (level.world * level.world));
    const hoardCap = RIVAL_HOARD_SAFETY * reachFraction * (layout.stats.totalBaseMass || 0)
      * level.itemValueMultiplier * level.progression.ordinaryMassFraction / Math.max(1, comp.length);
    const rivalSpawnRng = mulberry32((layout.seed ^ 0xD1B54A35) >>> 0);
    comp.forEach((archetype, i) => {
      // Spawn in the forward semicircle (+Z). A rival behind spawn can grow
      // during warmup directly inside the initial chase-camera sightline.
      // Its own seeded stream keeps placement deterministic without consuming
      // district prop RNG or changing any rival gameplay values.
      const angle = -Math.PI / 2 + rivalSpawnRng() * Math.PI;
      const dist = level.world * (0.3 + rivalSpawnRng() * 0.15);
      const half = level.world / 2 - 200;
      const pos = {
        x: Math.max(-half, Math.min(half, Math.cos(angle) * dist)),
        y: 0,
        z: Math.max(-half, Math.min(half, Math.sin(angle) * dist)),
      };
      const rival = createRival(pos, THREE, archetype);
      rival.warmupTimer = RIVAL_WARMUP_SECONDS;
      rival.radiusCap = level.world * 0.15;
      rival.massDivisor = level.itemValueMultiplier;
      rival.hoardCap = hoardCap;
      const colors = RIVAL_COLORS[archetype] || RIVAL_COLORS.grazer;
      // Same ground-flush flywheel as the player (art §2). The
      // group lives unscaled inside rival.object3D, which rivals.js scales
      // to the rival's world radius — exactly the avatar's convention, so
      // the hole fills the same footprint the old sphere did.
      rival.holeVisual = createHoleVisual(THREE, { ...colors, ringOpacity: 0.95 });
      rival.object3D.add(rival.holeVisual.group);
      // Rival growth rings (art §5): opponent threat state readable at a
      // glance. RIVAL_RING is subordinate to the player's mark on opacity,
      // reach AND duration at once, and every rival shares ONE budget so the
      // worst case is bounded. Like holeVisual, the group goes in UNSCALED —
      // rivals.js scales object3D to the rival's world radius, so local 1.0 is
      // that rival's aperture and the mark is screen-invariant.
      rival.growth = createGrowthEffects(THREE, {
        color: colors.rim,
        profile: RIVAL_RING,
        budget: rivalRingBudget,
      });
      // NOTE: reduced motion is NOT propagated here — buildLevelWorld runs
      // BEFORE startLevel sets avatar.reducedMotion, so reading it now would
      // pick up the previous level's value. startLevel pushes it to every
      // rival immediately after it sets the avatar's.
      rival.object3D.add(rival.growth.group);
      // Last Size tier this rival displayed. 0 = not yet established, so a
      // rival's first measured frame never fires a mark (same rule the player
      // uses for spawning at Size 1).
      rival.sizeTier = 0;
      root.add(rival.object3D);
      state.rivals.push(rival);
    });

    // Storms (L11+; hazard cargo L36+, surges L56+). V1's hazardDensity ->
    // timing/count mapping kept; V2 flags mapped straight from the level def.
    if (level.mechanics && level.mechanics.storms) {
      state.stormCtl = createStormController({
        dropCount: Math.max(4, Math.round(6 + level.hazardDensity * 60)),
        intervalMin: Math.max(6, 16 - level.hazardDensity * 30),
        intervalJitter: 8,
        goldenChance: 0.06,
        hazardCargo: !!level.mechanics.hazardDrops,
        surges: !!level.mechanics.stormSurges,
      });
    } else {
      state.stormCtl = null;
    }

    // Metro signature (art §4): one cheap visual per metro, data-driven from
    // metro.signature. Red Square Heights' lens-frost half is a CSS overlay
    // (DOM stays in main, not in content/).
    state.signature = createMetroSignature(metro, {
      THREE,
      scene: engine.scene,
      root,
      level,
      layout,
      world: state.world,
      buildings,
      createPool,
      propkit,
      reducedMotion: isReducedMotion(),
    });
    if (metro.signature && metro.signature.type === 'snow-dust') {
      setFrostVignette(true, metro.signature.params.intensity);
    }
  }

  // Red Square Heights' lens frost (art §4): a fixed radial-gradient overlay
  // while a snow-dust metro level is up. Static — not motion — so it stays
  // under prefers-reduced-motion.
  function setFrostVignette(on, intensity = 0.5) {
    let el = document.getElementById('frostVignette');
    if (!on) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'frostVignette';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;'
        + 'background:radial-gradient(ellipse at center, transparent 52%, rgba(210,230,245,0.4) 100%);';
      document.body.appendChild(el);
    }
    el.style.opacity = Math.min(1, intensity);
  }

  function spawnStormDrop(event) {
    if (!state.level || !state.layout) return;
    showBanner(event.bannerText, 1200);
    Audio.storm();
    const dropTier = state.level.template[0];
    const records = [];
    const half = state.level.world / 2 - 40;
    for (let i = 0; i < event.count; i += 1) {
      const golden = !!event.goldenFlags[i];
      const hazard = !!(event.hazardFlags && event.hazardFlags[i]);
      const ax = avatar.position.x + (Math.random() - 0.5) * 500;
      const az = avatar.position.z + (Math.random() - 0.5) * 500;
      const baseScale = propBaseScale(dropTier.kind, dropTier.baseRadius);
      records.push({
        position: new THREE.Vector3(
          Math.max(-half, Math.min(half, ax)), 0, Math.max(-half, Math.min(half, az))
        ),
        radius: dropTier.baseRadius,
        mass: dropTier.baseMass,
        kind: dropTier.kind,
        golden,
        hazard, // hazard cargo is never vacuumed (swallow.js skips it)
        storm: true,
        rotationY: Math.random() * Math.PI * 2,
        scale: baseScale,
        baseScale,
        scaleY: baseScale,
        tiltX: 0,
        tiltZ: 0,
        _edible: false,
      });
    }
    spawnProps(records);
  }

  // Projects a prop's world position to CSS pixels and pins the wedge-wobble
  // lock badge over it for a second (game-design §3's "not yet" read).
  const lockBadgeVec = new THREE.Vector3();
  const tutHandVec = new THREE.Vector3();
  const sizePillVec = new THREE.Vector3();
  // Separate scratch vector for the "+N" float projection — see the comment at
  // its use site for why it must not share sizePillVec.
  const massFloatVec = new THREE.Vector3();
  // Shared rival-growth-ring budget (effects.js). ONE per run, consulted by
  // every rival's effects instance, so the worst case is a constant no matter
  // how many rivals the level spawns. See createRingBudget's header.
  const rivalRingBudget = createRingBudget({ maxConcurrent: 2, playerLockoutSeconds: 0.35 });

  // Beat-1 cleanup: the pulse writes instance colors outside edibilityState,
  // so the edibility tint is force re-applied to every spawn-feast prop when
  // the beat ends (overlays.js's beat transition releases the hand itself).
  function endTutorialPulse() {
    if (!state.world) return;
    for (const obj of state.propObjects) {
      if (!obj.spawnFeast) continue;
      const idx = state.worldIndex.get(obj);
      if (idx !== undefined) state.world.setEdibility(idx, !!obj._edible, true);
    }
  }

  function pinLockBadge(obj) {
    lockBadgeVec.set(obj.position.x, (obj.position.y || 0) + obj.radius, obj.position.z);
    lockBadgeVec.project(engine.camera);
    if (lockBadgeVec.z > 1) return; // behind the camera
    setLockBadge({
      x: (lockBadgeVec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-lockBadgeVec.y * 0.5 + 0.5) * window.innerHeight,
    });
    state.lockBadgeTimer = 1;
  }

  // ---------------------------------------------------------------------------
  // Screen flow
  // ---------------------------------------------------------------------------
  function openWorldMap() {
    state.mode = 'worldmap';
    state.isDailyRun = false;
    hideOverlay('startScreen');
    hideOverlay('introScreen');
    hideOverlay('doneScreen');
    hideOverlay('failScreen');
    hideOverlay('winScreen');
    hideOverlay('shopScreen');
    hideOverlay('hud');
    hideOverlay('minimap');
    const grid = document.getElementById('worldMapGrid');
    renderWorldMap(grid, METROS, state.saveData, onSelectLevel);
    renderDailyCard(grid, getDailyStatus(state.saveData, todayStr()), onPlayDaily);
    showOverlay('worldMapScreen');
  }

  function onSelectLevel(n) {
    state.levelN = n;
    state.level = generateLevel(n);
    state.isDailyRun = false;
    state.mercy = createMercyTracker(); // fail streak is per-level
    logSeed(state.saveData, {
      seed: state.level.seed, levelN: n, date: todayStr(), kind: 'level',
    });
    saveSave(state.saveData);
    showLevelIntro();
  }

  function onPlayDaily() {
    const today = todayStr();
    const result = recordDailyAttempt(state.saveData, today);
    if (!result.ok) return;
    // The daily replays the player's frontier level def under the day's seed —
    // same city for everyone, zero backend.
    state.levelN = Math.max(1, state.saveData.unlockedLevel);
    state.level = generateLevel(state.levelN);
    state.isDailyRun = true;
    state.dailyDate = today;
    state.mercy = createMercyTracker();
    logSeed(state.saveData, {
      seed: dailyLevelSeed(today), levelN: state.levelN, date: today, kind: 'daily',
    });
    saveSave(state.saveData);
    showLevelIntro();
  }

  function tierTip(tier) {
    switch (tier) {
      case 'tutorial': return 'Swallow anything smaller than your rim. That is the whole game.';
      case 'first-contest': return 'A rival flywheel wants your food — outgrow it, then eat it back.';
      case 'escalation': return 'Hazards incoming: watch for falling cargo drops.';
      case 'expert': return 'Real routing skill required. Plan your route between rivals and hazards.';
      case 'master': return 'This rival plays dirty — it raids clusters, not just wanders. Watch your back.';
      default: return 'The finale. Eat everything. Then eat the Portal.';
    }
  }

  function showLevelIntro() {
    const level = state.level;
    const metro = level.metro;
    hideOverlay('worldMapScreen');
    hideOverlay('doneScreen');
    hideOverlay('failScreen');
    hideOverlay('shopScreen');
    hideOverlay('winScreen');

    const iconEl = document.getElementById('introIcon');
    if (iconEl) iconEl.src = `assets/hubs/${metro.id}.png`;
    const badgeEl = document.getElementById('introBadge');
    if (badgeEl) {
      badgeEl.textContent = state.isDailyRun
        ? `📅 Daily Swallow · ${state.dailyDate} · ${metro.name}`
        : `Level ${level.n} of ${LEVEL_COUNT} · ${metro.name}`;
    }
    const titleEl = document.getElementById('introTitle');
    if (titleEl) titleEl.textContent = `${metro.name} — ${level.districtName}`;

    const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE || level.isCapstone;
    const descEl = document.getElementById('introDesc');
    if (descEl) {
      const rivalCount = (level.mechanics.rivals || []).length;
      descEl.innerHTML = `${level.districtName}, ${metro.name}. 🎯 Target: <b>${level.target.toLocaleString()}</b> mass &nbsp;·&nbsp; ⏱ ${level.time}s`
        + (rivalCount > 0 ? `<br>🌀 ${rivalCount} rival flywheel${rivalCount > 1 ? 's' : ''} contesting this district.` : '')
        + (capstoneRequired ? `<br>🏙️ Grow big enough to swallow the district's landmark to finish.` : '');
    }
    // Capstone districts lead with their twist description as the one line
    // (content-and-meta §1/§5); other levels show the unlock line, if any.
    applyIntroLine(level.isCapstone && level.capstoneTwist
      ? { ...level, introLine: level.capstoneTwist.description }
      : level);
    const tipEl = document.getElementById('introTip');
    if (tipEl) tipEl.textContent = `💡 ${tierTip(level.tier)}`;

    showOverlay('introScreen');
    state.mode = 'intro';
  }

  function beginPlay() {
    Audio.init();
    const level = state.level;
    state.perks = perkEffects(state.saveData);

    // V2 meta: mutually exclusive build picks (applyBuilds), plus unlocked
    // metro-perk flags folded into the same modified-stats object.
    const stats = applyBuilds({
      startMass: 0,
      timeSeconds: level.time,
      itemValueMultiplier: level.itemValueMultiplier,
    }, state.saveData.builds);
    if (state.perks.extraStartMass) {
      stats.extraStartMass += state.perks.extraStartMass;
      stats.startMass += state.perks.extraStartMass * level.itemValueMultiplier;
    }
    if (state.perks.extraComboWindow) stats.extraComboWindow += state.perks.extraComboWindow;
    if (state.perks.neonRushMultiplier && level.mechanics.night) {
      stats.moveSpeedMultiplier *= state.perks.neonRushMultiplier;
    }
    state.modifiedStats = stats;

    const twist = level.isCapstone && level.capstoneTwist ? level.capstoneTwist : null;
    state.twist = twist;
    state.twistState = twist ? { fired: false, stormT: 0 } : null;
    const tp = twist ? twist.params || {} : {};
    state.valueMultiplier = typeof tp.valueMultiplier === 'number' ? tp.valueMultiplier : 1;
    state.coinComboMultiplier = typeof tp.coinComboMultiplier === 'number' ? tp.coinComboMultiplier : 1;
    state.rivalSpeedMultiplier = typeof tp.rivalSpeedMultiplier === 'number' ? tp.rivalSpeedMultiplier : 1;

    buildLevelWorld(level, {
      seed: state.isDailyRun ? dailyLevelSeed(state.dailyDate) : undefined,
    });

    avatar.object3D.position.set(0, 0, 0);
    avatar.object3D.rotation.y = 0;
    avatar.mass = stats.startMass;
    avatar.speedMultiplier = stats.moveSpeedMultiplier;
    avatar.radiusCap = level.world * 0.2;
    avatar.massDivisor = level.itemValueMultiplier;
    avatar.reducedMotion = isReducedMotion();
    // Rivals were built by buildLevelWorld above, before the line that sets
    // the avatar's flag — push the authoritative value to their growth rings
    // here so a reduced-motion player never gets a travelling rival mark.
    for (const rival of state.rivals) {
      if (rival.growth) rival.growth.setReducedMotion(avatar.reducedMotion);
    }
    avatar.setSkin(SKINS[state.saveData.activeSkin] ? state.saveData.activeSkin : 'void');

    state.comboTracker = createComboTracker({
      onTierUp: (tierIndex, threshold, name) => {
        Audio.chainPing(tierIndex);
        showBanner(`🔥 ${name} — x${state.comboTracker.mult()} COMBO`, 1100);
        // Carnival Coast's signature: confetti burst on every tier-up.
        if (state.signature && typeof state.signature.burst === 'function') {
          state.signature.burst(avatar.position.x, avatar.position.z);
        }
      },
    });
    // Build/perk combo-window picks: combo.js owns the base 2.2s window, so
    // the extension is topped up right after each eat refreshes it.
    if (stats.extraComboWindow > 0) {
      const tracker = state.comboTracker;
      const baseOnEat = tracker.onEat;
      tracker.onEat = () => {
        const n = baseOnEat();
        tracker.t += stats.extraComboWindow;
        return n;
      };
    }

    state.timer = stats.timeSeconds;
    state.runCoins = 0;
    state.capstoneEaten = false;
    state.capstoneEdible = false;
    state.capstoneEdibleAnnounced = false;
    state.portalComboNeeded = 0;
    state.fastAchieved = false;
    state.peakCombo = 0;
    state.stormEatenCount = 0;
    state.goldensEaten = 0;
    state.rivalsEaten = 0;
    state.usedSecondWind = false;
    state.lastEatenKind = null;
    state.chaosTimer = 0;
    state.notifTimer = 8 + Math.random() * 6;
    state.tickWholeSecond = -1;
    state.slowMo = 0;
    state.lockBadgeTimer = 0;
    state.telegraphTimer = 0;
    state.minimapTimer = 0;
    state.levelTime = stats.timeSeconds;
    state.targetRadius = radiusFromMass(level.target / level.itemValueMultiplier);
    state.sizeTier = 0;
    // A run that ended mid-float/mid-ring must not bleed into the next one.
    clearMassFloats();
    rivalRingBudget.reset();
    state.elitePulse = 0;
    setDuelistTelegraph(null);
    setLockBadge(null);

    // Capstone twist (content-and-meta §1): the authored twist on each
    // metro's 10th district. Static effects apply here; time/mass-driven
    // effects run in updatePlay off state.twistState.
    if (twist) showOneLiner(`🌪 ${twist.description}`, 3200);
    if (typeof tp.speedMultiplier === 'number') {
      avatar.speedMultiplier *= tp.speedMultiplier; // deep-freeze
    }
    if (twist && twist.id === 'portal-protocol') {
      // The Portal only opens for a peak combo: gate 0 until peakCombo hits
      // requiresComboCount (checked per frame in updatePlay).
      state.portalComboNeeded = tp.requiresComboCount || 25;
      for (const p of state.propObjects) {
        if (p.isCapstone) p.capstoneGate = 0;
      }
    }
    if (twist && twist.id === 'street-parade') {
      // One long moving feast crossing the district (props drive a straight
      // lane and wrap — handled in the traffic pass of updatePlay).
      const paradeTier = level.template[1];
      const half = level.world / 2;
      const records = [];
      for (let i = 0; i < (tp.paradePropCount || 20); i += 1) {
        const baseScale = propBaseScale(paradeTier.kind, paradeTier.baseRadius);
        records.push({
          position: new THREE.Vector3(-half + (i / (tp.paradePropCount || 20)) * level.world, 0, -half * 0.4),
          radius: paradeTier.baseRadius,
          mass: paradeTier.baseMass,
          kind: paradeTier.kind,
          golden: false,
          rotationY: Math.PI / 2,
          scale: baseScale,
          baseScale,
          scaleY: baseScale,
          tiltX: 0,
          tiltZ: 0,
          moving: { parade: true, direction: 1, speed: 60 },
          _edible: false,
        });
      }
      spawnProps(records);
    }

    // Mercy rules: after 3 fails the pity magnet (folded into the swallow
    // reach below) and the minimap heatmap switch on for this attempt.
    minimap.setHeatmap(state.mercy.heatmapUnlocked ? heatmapProps() : null);

    // Level-1 onboarding beats (content §5): pointer hand -> free roam ->
    // landmark tease. One line at a time, never a modal.
    state.onboarding = level.n === 1 && !state.isDailyRun ? { t: 0, beat: 1 } : null;
    if (state.onboarding) showOnboardingBeat(1);
    else hideOnboarding();

    if ((level.mechanics.rivals || []).length > 0) {
      showOneLiner('It eats too. Out-grow it. 🌀', 2600);
    }

    hideOverlay('introScreen');
    showOverlay('hud');
    showOverlay('minimap');
    state.mode = 'play';

    const hintEl = document.getElementById('sizehint');
    if (hintEl) {
      hintEl.textContent = (level.mechanics.rivals || []).length > 0
        ? '🌀 rival flywheels are stealing your food — eat THEM back!'
        : '🌀 swallow things smaller than your rim';
    }
  }

  // The remaining-mass density the mercy heatmap draws (game-design §6).
  function heatmapProps() {
    const out = [];
    for (const p of state.propObjects) {
      if (p.hazard || p.isCapstone) continue;
      out.push({ x: p.position.x, z: p.position.z, mass: p.mass });
    }
    return out;
  }

  function levelDone() {
    const level = state.level;
    state.mode = 'done';
    Audio.done();
    hideOnboarding();

    const stars = starResult(level, {
      completed: true,
      completionFraction: state.levelTime > 0
        ? (state.levelTime - state.timer) / state.levelTime
        : 1,
      capstoneEaten: state.capstoneEaten,
      rivalsEaten: state.rivalsEaten,
      peakCombo: state.peakCombo,
      goldensEaten: state.goldensEaten,
      usedSecondWind: state.usedSecondWind,
    }).stars;
    // V2 economy (content-and-meta §4): flat-in-n payout, NOT V1's
    // mass-scaled one; build coin picks multiply it.
    const settlement = levelReward(level, { stars }, state.saveData);
    const coins = Math.round(settlement.coins * state.modifiedStats.coinMultiplier);
    state.saveData.coins += coins;
    state.saveData.lifetimeCoins += coins;
    const prevStars = state.saveData.stars[level.n] || 0;
    state.saveData.stars[level.n] = Math.max(prevStars, stars);
    state.saveData.unlockedLevel = Math.max(state.saveData.unlockedLevel, Math.min(LEVEL_COUNT, level.n + 1));
    state.saveData.bestCombo = Math.max(state.saveData.bestCombo, state.peakCombo);

    // Stars buy things now: 3★ districts pay metro tokens (idempotent).
    const granted = claimMetroTokens(state.saveData, METROS);
    for (const g of granted) {
      showToast(`<b>METRO TOKEN</b><br>🎟 ${METROS[g.metroIndex].name} — 3★ district bonus`);
    }

    if (state.isDailyRun) {
      recordDailyResult(state.saveData, state.dailyDate, { won: true });
    }
    state.mercy.resetFails();
    saveSave(state.saveData);

    const titleEl = document.getElementById('doneTitle');
    if (titleEl) titleEl.textContent = `${level.metro.name} — ${level.districtName} swallowed!`;
    const descEl = document.getElementById('doneDesc');
    if (descEl) {
      descEl.innerHTML = `You consumed <b>${Math.floor(avatar.mass).toLocaleString()}</b> mass.`
        + `${state.peakCombo >= 10 ? ` Peak combo: <b>${state.peakCombo}</b>.` : ''}<br>`
        + `🪙 +${coins} coins${state.runCoins > 0 ? ` (+${state.runCoins} from goldens)` : ''} &nbsp;·&nbsp; ${starGlyphs(stars)}`;
    }
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.textContent = level.n < LEVEL_COUNT ? 'CONTINUE →' : 'FINISH →';

    showOverlay('doneScreen');
    hideOverlay('hud');
    hideOverlay('minimap');
  }

  // The plain snapshot systems/win.js evaluates. Assembled here so the rule
  // itself stays pure and Node-testable; every surface that talks about
  // winning takes `evaluateWin(runSnapshot(), state.level)`.
  function runSnapshot() {
    return {
      mass: avatar.mass,
      capstoneEaten: state.capstoneEaten,
      capstoneEdible: state.capstoneEdible,
      shieldRemaining: state.shieldRemaining,
      peakCombo: state.peakCombo,
      portalComboNeeded: state.portalComboNeeded,
    };
  }

  function levelFail(win) {
    state.mode = 'fail';
    Audio.fail();
    hideOnboarding();
    const level = state.level;
    state.mercy.recordFail();

    if (state.isDailyRun) {
      recordDailyResult(state.saveData, state.dailyDate, { won: false });
      saveSave(state.saveData);
    }

    const line = FAIL_LINES[Math.floor(Math.random() * FAIL_LINES.length)];
    const descEl = document.getElementById('failDesc');
    if (descEl) {
      // The loss NAMES ITS OWN CAUSE. This used to be one unconditional
      // sentence blaming the mass, which on a landmark loss printed a number
      // ABOVE the target as the reason for failing — bug 0004. The copy is
      // now derived from the same evaluation the win check ran.
      const evaluated = win || evaluateWin(runSnapshot(), level);
      descEl.innerHTML = failReasonText(evaluated, {
        mass: avatar.mass,
        target: level.target,
        shieldRemaining: state.shieldRemaining,
        peakCombo: state.peakCombo,
        portalComboNeeded: state.portalComboNeeded,
      })
        + `<br><span style="color:#8fa8b8;font-style:italic">${line}</span>`;
    }
    // Mercy rules (game-design §6): first fail offers a free second wind;
    // fail #3 notes the pity magnet + heatmap for the next attempt.
    renderFailMercy({
      failCount: state.mercy.fails,
      secondWindAvailable: state.mercy.secondWindAvailable,
      heatmapActive: state.mercy.heatmapUnlocked,
      pityMagnetActive: state.mercy.pityMagnetActive,
    }, {
      onSecondWind: acceptSecondWind,
    });
    showOverlay('failScreen');
    hideOverlay('hud');
    hideOverlay('minimap');
  }

  function acceptSecondWind() {
    // Opera Bay's Encore perk tops the offer up (+5s).
    const seconds = state.mercy.consumeSecondWind() + (state.perks.secondWindBonus || 0);
    if (seconds <= 0) return;
    state.usedSecondWind = true;
    state.timer += seconds;
    unlockAchievement('secondWind');
    showBanner(`🌬️ SECOND WIND — +${seconds}s`, 1400);
    hideOverlay('failScreen');
    showOverlay('hud');
    showOverlay('minimap');
    state.mode = 'play';
  }

  function openShop() {
    state.mode = 'shop';
    hideOverlay('doneScreen');
    renderBuildShop(document.getElementById('shopTracks'), buildShopViewModel(state.saveData), {
      onPick: onBuyPick,
      onRespec: onRespec,
      onContinue: onShopContinue,
    });
    showOverlay('shopScreen');
  }

  function onBuyPick(pickId) {
    const result = buyBuildPick(state.saveData, pickId);
    if (!result.ok) {
      showBanner(result.reason === 'insufficient-coins' ? '🪙 NOT ENOUGH COINS' : '🔒 TIER ALREADY LOCKED', 1100);
      return;
    }
    saveSave(state.saveData);
    Audio.golden();
    openShop(); // re-render with the new balance/lock
  }

  function onRespec() {
    const result = respec(state.saveData);
    if (!result.ok) return;
    saveSave(state.saveData);
    showBanner('🔁 BUILD RESPECCED', 1100);
    openShop();
  }

  function onShopContinue() {
    hideOverlay('shopScreen');
    const level = state.level;
    if (state.isDailyRun) {
      openWorldMap();
    } else if (level.n >= LEVEL_COUNT) {
      showWinScreen();
    } else if (level.levelInChapter >= 10) {
      openWorldMap();
    } else {
      state.levelN = level.n + 1;
      state.level = generateLevel(state.levelN);
      state.mercy = createMercyTracker();
      showLevelIntro();
    }
  }

  function showWinScreen() {
    state.mode = 'win';
    Audio.win();
    unlockAchievement('win');
    unlockAchievement('centurion');

    const totalStars = Object.values(state.saveData.stars).reduce((a, b) => a + b, 0);
    const scoreEl = document.getElementById('finalScore');
    if (scoreEl) scoreEl.textContent = `Total stars: ${totalStars} · Coins: ${state.saveData.coins.toLocaleString()}`;
    const achEl = document.getElementById('achCount');
    if (achEl) achEl.innerHTML = `Achievements unlocked: <b>${state.achievementTracker.all().size}</b> / ${Object.keys(ACH).length}`;

    showOverlay('winScreen');
    hideOverlay('hud');
    hideOverlay('minimap');
  }

  // ---------------------------------------------------------------------------
  // Easter eggs (ported from the original shipped 2D game, adapted to 3D).
  // ---------------------------------------------------------------------------
  let konamiIdx = 0;
  let wordBuf = '';

  function triggerGodMode() {
    if (state.mode !== 'play') return;
    avatar.mass += 500;
    showBanner('👾 GOD MODE — +500 MASS', 1800);
    unlockAchievement('god');
    Audio.god();
  }

  function triggerUnsub() {
    if (state.mode !== 'play') return;
    // "Gravity has left the chat": every currently-spawned prop gets a random
    // impulse for a few seconds.
    state.chaosTimer = 3;
    for (const obj of state.propObjects) {
      if (obj.isCapstone) continue;
      obj.chaosVX = (Math.random() - 0.5) * 260;
      obj.chaosVZ = (Math.random() - 0.5) * 260;
    }
    showBanner('📭 UNSUBSCRIBED FROM PHYSICS', 1800);
    unlockAchievement('unsub');
    Audio.storm();
  }

  function triggerBreeze() {
    if (state.mode !== 'play' || !state.level) return;
    // Summons a small cluster of "Breeze AI drone" props near the avatar.
    const half = state.level.world / 2 - 60;
    const records = [];
    for (let i = 0; i < 4; i += 1) {
      const x = Math.max(-half, Math.min(half, avatar.position.x + (Math.random() - 0.5) * 500));
      const z = Math.max(-half, Math.min(half, avatar.position.z + (Math.random() - 0.5) * 500));
      const baseScale = propBaseScale('breeze-drone', 22);
      records.push({
        position: new THREE.Vector3(x, 0, z),
        radius: 22,
        mass: 20,
        kind: 'breeze-drone',
        golden: false,
        rotationY: Math.random() * Math.PI * 2,
        scale: baseScale,
        baseScale,
        scaleY: baseScale,
        tiltX: 0,
        tiltZ: 0,
        _edible: false,
      });
    }
    spawnProps(records);
    showBanner('🤖 BREEZE OVERCLOCK — FRESH AGENTS', 1800);
    unlockAchievement('breeze');
    Audio.god();
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();

    if (k === 'm') {
      Audio.muted = !Audio.muted;
      showToast(Audio.muted ? '🔇 <b>Muted.</b> The flywheel judges you silently.' : '🔊 <b>Sound on.</b> Let them hear it.');
      return;
    }

    if (k === KONAMI[konamiIdx]) {
      konamiIdx += 1;
      if (konamiIdx === KONAMI.length) {
        konamiIdx = 0;
        triggerGodMode();
      }
    } else {
      konamiIdx = k === KONAMI[0] ? 1 : 0;
    }

    if (/^[a-z]$/.test(k)) {
      wordBuf = (wordBuf + k).slice(-16);
      if (wordBuf.endsWith('unsub')) {
        wordBuf = '';
        triggerUnsub();
      }
      if (wordBuf.endsWith('breeze')) {
        wordBuf = '';
        triggerBreeze();
      }
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // ---------------------------------------------------------------------------
  // Per-frame gameplay update (only runs while state.mode === 'play')
  // ---------------------------------------------------------------------------
  function updatePlay(dt) {
    const level = state.level;
    const reducedMotion = avatar.reducedMotion;

    // Piñata slow-mo (game-design §4): 0.4s at 30% timescale, skipped under
    // reduced motion. The timer runs on REAL dt so slow-mo ends on schedule.
    if (state.slowMo > 0) state.slowMo -= dt;
    const gdt = (state.slowMo > 0 && !reducedMotion) ? dt * 0.3 : dt;

    state.timer -= gdt;
    if (state.timer <= 0) {
      state.timer = 0;
      updateHUD({ timer: 0 });
      const win = evaluateWin(runSnapshot(), level);
      if (win.won) {
        levelDone();
      } else {
        levelFail(win);
      }
      return;
    }

    const wholeSecond = Math.ceil(state.timer);
    if (wholeSecond <= 10 && wholeSecond !== state.tickWholeSecond) {
      state.tickWholeSecond = wholeSecond;
      Audio.tick();
    }

    state.comboTracker.update(gdt);

    if (state.stormCtl) {
      state.stormCtl.update(gdt, spawnStormDrop);
    }

    // Capstone twists — the time/mass-driven effects (content-and-meta §1).
    const progress = state.levelTime > 0 ? 1 - state.timer / state.levelTime : 0;
    if (state.twist && state.twistState) {
      const tw = state.twist;
      const ts = state.twistState;
      if (tw.id === 'fog-closes-in') {
        // The fog closes in as you grow, as mass approaches target.
        //
        // FOG IS FogExp2 NOW (0005 atmosphere pass), so this scales DENSITY
        // rather than pulling a near plane in. `fogNearFactor` is kept as the
        // twist's authored parameter — it is level data, and rewriting content
        // to match a rendering change is how content and code drift apart — and
        // is reinterpreted here: the old rule multiplied the near distance by
        // `nearFactor` at full progress, so the equivalent is to DIVIDE the
        // density's length scale by the same factor. Default 0.6 => x1.67
        // density at target, which is very close to the old effect's strength.
        const f = Math.min(1, avatar.mass / level.target);
        const nearFactor = typeof tw.params.fogNearFactor === 'number' ? tw.params.fogNearFactor : 0.6;
        engine.scene.fog.density = state.baseFog.density / (1 - (1 - nearFactor) * f);
      } else if (tw.id === 'sandstorm') {
        // A sandstorm sweeps the plaza at half-time: dense fog for ~10s.
        // The old linear form pulled near to 0.35x and far to 0.55x, an ~2.6x
        // effective tightening; matched here as a straight density multiplier.
        if (!ts.fired && progress >= (tw.params.atTimeFraction || 0.5)) {
          ts.fired = true;
          ts.stormT = 10;
          showBanner('🌪 SANDSTORM', 1600);
          Audio.storm();
        }
        if (ts.stormT > 0) {
          ts.stormT -= gdt;
          engine.scene.fog.density = state.baseFog.density * 2.6;
          if (ts.stormT <= 0) {
            engine.scene.fog.density = state.baseFog.density;
          }
        }
      } else if (tw.id === 'cafe-rush') {
        // Café rush: the sidewalk crowds respawn once, mid-level.
        if (!ts.fired && progress >= 0.5) {
          ts.fired = true;
          const frac = tw.params.respawnFraction || 0.3;
          const small = state.layout.props.filter((p) => p.tierIndex <= 1).length;
          const count = Math.max(4, Math.round(small * frac));
          const dropTier = level.template[0];
          const bound = level.world / 2 - 60;
          const records = [];
          for (let i = 0; i < count; i += 1) {
            const baseScale = propBaseScale(dropTier.kind, dropTier.baseRadius);
            records.push({
              position: new THREE.Vector3((Math.random() * 2 - 1) * bound, 0, (Math.random() * 2 - 1) * bound),
              radius: dropTier.baseRadius,
              mass: dropTier.baseMass,
              kind: dropTier.kind,
              golden: false,
              rotationY: Math.random() * Math.PI * 2,
              scale: baseScale,
              baseScale,
              scaleY: baseScale,
              tiltX: 0,
              tiltZ: 0,
              _edible: false,
            });
          }
          spawnProps(records);
          showBanner('☕ CAFÉ RUSH — THE SIDEWALKS REFILL', 1600);
        }
      } else if (tw.id === 'portal-protocol') {
        // The Portal only opens for a peak combo.
        const need = tw.params.requiresComboCount || 25;
        if (state.peakCombo >= need) {
          for (const p of state.propObjects) {
            if (p.isCapstone && p.capstoneGate === 0) {
              p.capstoneGate = level.capstoneGate;
              showBanner('🌀 THE PORTAL OPENS', 1600);
            }
          }
        }
      }
    }

    // Chaos scatter (the 'unsub' egg).
    if (state.chaosTimer > 0) {
      state.chaosTimer -= gdt;
      const half = level.world / 2;
      for (const obj of state.propObjects) {
        if (typeof obj.chaosVX !== 'number') continue;
        obj.position.x += obj.chaosVX * gdt;
        obj.position.z += obj.chaosVZ * gdt;
        if (obj.position.x < -half + 40 || obj.position.x > half - 40) obj.chaosVX *= -1;
        if (obj.position.z < -half + 40 || obj.position.z > half - 40) obj.chaosVZ *= -1;
        obj.chaosVX *= Math.pow(0.5, gdt);
        obj.chaosVZ *= Math.pow(0.5, gdt);
        state.hash.update(obj);
        if (obj._edible) state.edibleHash.update(obj);
      }
    }

    // Input -> orbit -> movement, in input.js's contracted order.
    input.update(dt, {
      avatarX: avatar.position.x,
      avatarZ: avatar.position.z,
      avatarRadius: avatar.radius(),
      cameraYaw: chaseCamera.yaw,
    });
    const orb = input.consumeOrbit();
    chaseCamera.orbitBy(orb.yaw, orb.pitch);
    chaseCamera.stepOrbit(orb.steps);
    const mv = input.moveVector(chaseCamera.yaw);
    avatar.setMoveInput(mv.dx, mv.dz);
    updateStickVisual();

    avatar.update(gdt);
    const r = avatar.radius();
    // Keep the sun's orthographic shadow box centred on the player and sized
    // to roughly what the camera can see (camera.js frames ~12r of standoff).
    // A single box spanning the whole 2400-4800u world would quantise the
    // shadows to mush; following the avatar keeps them crisp as the hole grows.
    engine.followShadow(avatar.position.x, avatar.position.z, r * 14);
    // Keep the sky dome centred on the eye — it is a background, not scenery.
    // The camera climbs from ~180u of height at spawn to ~1800u at the largest
    // radius the game reaches, which is 36% of the dome's radius: a world-pinned
    // dome would visibly tip its horizon over a run. Copying the camera position
    // costs three float writes and makes the gradient invariant.
    if (state.sky) state.sky.position.copy(engine.camera.position);
    // Tide twists shrink the playable water-line as the clock runs down:
    // rising-tide floods every edge; high-tide only advances from the south.
    let half = level.world / 2;
    let maxZ = half;
    if (state.twist && state.twist.id === 'rising-tide') {
      half *= 1 - (state.twist.params.shrinkFraction || 0.15) * progress;
    } else if (state.twist && state.twist.id === 'high-tide') {
      maxZ = half * (1 - (state.twist.params.floodFraction || 0.2) * progress);
    }
    let minB = -half + r;
    let maxB = half - r;
    if (minB > maxB) { minB = 0; maxB = 0; }
    let minBz = minB;
    let maxBz = Math.min(maxB, maxZ - r);
    if (minBz > maxBz) { minBz = 0; maxBz = 0; }
    avatar.object3D.position.x = Math.max(minB, Math.min(maxB, avatar.object3D.position.x));
    avatar.object3D.position.z = Math.max(minBz, Math.min(maxBz, avatar.object3D.position.z));

    // Moving traffic (L21+): road props drive their street's lane, wrapping
    // at the street ends. Layout owns the lane/street; this only animates.
    // Carnival Coast's parade props drive a straight eastbound lane instead.
    for (const obj of state.propObjects) {
      if (!obj.moving) continue;
      if (obj.moving.parade) {
        const bound = level.world / 2;
        obj.position.x += obj.moving.direction * obj.moving.speed * gdt;
        if (obj.position.x > bound) obj.position.x = -bound;
        state.hash.update(obj);
        if (obj._edible) state.edibleHash.update(obj);
        continue;
      }
      const st = state.layout.streets[obj.moving.streetIndex];
      if (!st) continue;
      const c = Math.cos(st.rotY);
      const s = Math.sin(st.rotY);
      // districts.js rect convention: local +X maps to world (cos, -sin).
      const dirX = c * obj.moving.direction;
      const dirZ = -s * obj.moving.direction;
      obj.position.x += dirX * obj.moving.speed * gdt;
      obj.position.z += dirZ * obj.moving.speed * gdt;
      const dx = obj.position.x - st.x;
      const dz = obj.position.z - st.z;
      const lx = c * dx - s * dz; // inverse of rectPoint (see groundtex.js)
      if (lx > st.w / 2) {
        obj.position.x -= dirX * st.w;
        obj.position.z -= dirZ * st.w;
      } else if (lx < -st.w / 2) {
        obj.position.x += dirX * st.w;
        obj.position.z += dirZ * st.w;
      }
      state.hash.update(obj);
      if (obj._edible) state.edibleHash.update(obj);
    }

    chaseCamera.update(gdt);

    // The eat loop. Combo count is read before/after (rather than exact-
    // equality mid-loop) because several objects can be eaten within the same
    // frame — a threshold crossed inside the frame is still caught.
    // ivmEff: capstone-twist value multipliers (Neon 2x, deep-freeze 1.25x)
    // fold into the level's itemValueMultiplier for everything eaten.
    const ivmEff = level.itemValueMultiplier * state.valueMultiplier;
    const comboCountBefore = state.comboTracker.count;
    const reachMultiplier = state.modifiedStats.attractRadiusMultiplier * state.mercy.magnetMultiplier;
    const res = state.swallower.update(
      gdt, swallowAvatar, state.propObjects, state.comboTracker,
      ivmEff, reachMultiplier, level.target, level.progression.ordinaryMassFraction
    );

    for (const obj of res.vacuumStarted) state.vacuuming.add(obj);
    for (const obj of res.nearMissed) state.vacuuming.add(obj);

    if (res.eaten.length) {
      let goldenBonusMass = 0;
      let goldenPerkCoins = 0;
      let eliteBonusCoins = 0;
      // "+N" float aggregation (art §5). ONE float per frame carrying the
      // frame's TOTAL award at the CENTROID of everything eaten this frame —
      // never one per prop. A 12-prop cluster is a single big number, which is
      // both more readable and the entire reason this is not spam. Accumulated
      // in plain locals; nothing here allocates.
      let floatSumX = 0;
      let floatSumZ = 0;
      let floatGolden = false;
      for (const obj of res.eaten) {
        floatSumX += obj.position.x;
        floatSumZ += obj.position.z;
        if (obj.golden) floatGolden = true;
        removePropRoster(obj);
        avatar.onEat();
        state.lastEatenKind = obj.kind;

        const collectionKey = obj.collectionKey || obj.visualId || obj.kind;
        const { collection, isNew } = recordSighting(state.saveData.collection, collectionKey);
        state.saveData.collection = collection;
        if (obj.visualId || (obj.variant && obj.variant.name)) {
          const v = recordVariantSighting(
            state.saveData.collectionVariants,
            level.metro.id,
            obj.visualId || obj.variant.name,
          );
          state.saveData.collectionVariants = v.collectionVariants;
        }
        if (isNew && checkHoarderMilestone(state.saveData.collection)) {
          unlockAchievement('hoarder');
        }

        unlockAchievement('first');

        if (obj.golden) {
          state.goldensEaten += 1;
          unlockAchievement('gold');
          Audio.golden();
          // Golden Touch build pick: +50% golden mass on top of the 8x.
          if (state.modifiedStats.goldenMassMultiplier > 1) {
            goldenBonusMass += obj.mass * ivmEff * 8
              * (state.modifiedStats.goldenMassMultiplier - 1);
          }
          // Desert Spires' Gold Rush perk: goldens drop extra coins.
          if (state.perks.goldenCoinBonus) goldenPerkCoins += state.perks.goldenCoinBonus;
          // Elite goldens (L71+): swallow.js pays the full capped elite mass;
          // coin settlement tops the regular +10 up to +25 here.
          if (obj.elite) {
            eliteBonusCoins += ELITE_GOLDEN_COIN_BONUS - 10;
          }
        } else {
          Audio.gulp(obj.radius, state.comboTracker.count);
        }

        if (obj.storm) {
          state.stormEatenCount += 1;
          if (state.stormEatenCount === 5) unlockAchievement('storm');
        }

        if (obj.isCapstone) {
          state.capstoneEaten = true;
          if (level.levelInChapter >= 10) unlockAchievement('metroCleared');
        } else if (state.shieldRemaining > 0) {
          // Landmark shield (L61+): every non-capstone eat cracks it further.
          state.shieldRemaining -= 1;
          if (state.shieldRemaining === 0) {
            for (const p of state.propObjects) {
              if (p.isCapstone) p.capstoneGate = level.capstoneGate;
            }
            showBanner('🛡️ LANDMARK SHIELD DOWN', 1400);
          }
        }
      }

      // Mass + coins. res.coinsGained already carries the +10/golden V2
      // bonus (formulas.GOLDEN_COIN_BONUS via swallow.js); Coliseum City's
      // roaring-crowd twist doubles combo coin payouts.
      const massAwarded = capProgressionAward(
        res.massGained * state.modifiedStats.massGainMultiplier + goldenBonusMass,
        level.target,
      );
      avatar.mass += massAwarded;

      // The aggregated float + the score-bar sheen, both fed by the SAME
      // frame-level award, so the number that floats is exactly the number the
      // bar just moved by. Projected through the same camera the size pill
      // uses; `massFloatVec` is preallocated at outer scope (no per-eat
      // allocation). `sizePillVec` is deliberately NOT reused — it is written
      // later in the same frame and sharing it would corrupt the pill.
      if (massAwarded > 0) {
        const n = res.eaten.length;
        massFloatVec.set(floatSumX / n, 0, floatSumZ / n).project(engine.camera);
        if (massFloatVec.z < 1) {
          spawnMassFloat({
            x: (massFloatVec.x * 0.5 + 0.5) * window.innerWidth,
            y: (-massFloatVec.y * 0.5 + 0.5) * window.innerHeight,
            amount: massAwarded,
            golden: floatGolden,
          });
        }
        pokeScoreSparkle();
      }
      const coinsNow = Math.round((res.coinsGained + goldenPerkCoins + eliteBonusCoins) * state.coinComboMultiplier);
      if (coinsNow > 0) {
        state.runCoins += coinsNow;
        state.saveData.coins += coinsNow;
        state.saveData.lifetimeCoins += coinsNow;
      }

      const comboCountAfter = state.comboTracker.count;
      state.peakCombo = Math.max(state.peakCombo, comboCountAfter);
      if (comboCountBefore < 10 && comboCountAfter >= 10) unlockAchievement('combo10');
      if (comboCountBefore < 25 && comboCountAfter >= 25) unlockAchievement('combo25');

      saveSave(state.saveData);
    }

    if (!state.fastAchieved && avatar.mass >= level.target / 2 && state.timer >= level.time * 0.3) {
      state.fastAchieved = true;
      unlockAchievement('fast');
    }

    // Edibility + animation state pass over the live roster: tint instances
    // (edible glow vs desaturated too-big), maintain the edible-only hash,
    // and map vacuum lean / wedge wobble onto the instanced transform fields.
    const swallowR = swallowAvatar.radius();
    for (const obj of state.propObjects) {
      const idx = state.worldIndex.get(obj);
      const gate = obj.isCapstone && typeof obj.capstoneGate === 'number' ? obj.capstoneGate : DEFAULT_SIZE_GATE;
      const edible = !obj.hazard && obj.radius <= swallowR * gate;
      if (obj.isCapstone) {
        // SINGLE SOURCE OF TRUTH for "can the landmark go down right now":
        // the HUD chip reads this, and it is the same comparison the swallow
        // makes one line above. Recomputing it anywhere else would let the
        // chip promise an eat the swallow then refuses (bug 0004's shape).
        state.capstoneEdible = edible;
        if (edible && !state.capstoneEdibleAnnounced) {
          state.capstoneEdibleAnnounced = true;
          showBanner('🏙️ THE LANDMARK IS EDIBLE — TAKE IT DOWN', 1600);
          Audio.grow();
        }
      }
      if (idx === undefined) continue; // the landmark is not instanced

      state.world.setEdibility(idx, edible);
      if (edible && !obj._edible) {
        obj._edible = true;
        state.edibleHash.insert(obj);
      } else if (!edible && obj._edible) {
        obj._edible = false;
        state.edibleHash.remove(obj);
      }
    }
    for (const obj of state.vacuuming) {
      const st = state.swallower.getVacuumState(obj);
      if (!st) {
        obj.tiltX = 0;
        obj.tiltZ = 0;
        obj.scale = obj.baseScale;
        obj.scaleY = obj.baseScale;
        state.vacuuming.delete(obj);
      } else {
        // Lean toward the maw (tilt around the axis perpendicular to the
        // pull) + a light squash as it accelerates in.
        obj.tiltX = st.lean * st.dirZ;
        obj.tiltZ = -st.lean * st.dirX;
        obj.scale = obj.baseScale * (1 - 0.3 * st.progress);
        obj.scaleY = obj.baseScale * (1 - 0.45 * st.progress);
        state.hash.update(obj);
        if (obj._edible) state.edibleHash.update(obj);
      }
    }
    for (const obj of state.wobbling) {
      const st = state.swallower.getWobbleState(obj);
      if (!st) {
        obj.tiltZ = 0;
        state.wobbling.delete(obj);
      } else {
        obj.tiltZ = st.angle;
      }
    }

    // Elite goldens (L71+): a warmer, brighter pulse than regular gold so the
    // jackpot-within-the-jackpot reads from across the district.
    if (state.goldenProps.some((g) => g.elite)) {
      state.elitePulse += gdt;
      const k = 0.5 + 0.5 * Math.sin(state.elitePulse * 5);
      for (const obj of state.goldenProps) {
        if (!obj.elite) continue;
        const idx = state.worldIndex.get(obj);
        if (idx !== undefined) state.world.pulseInstance(idx, k, '#ffab2e');
      }
    }

    // Rivals.
    for (const rival of state.rivals) {
      const events = updateRival(rival, state.propObjects, avatar, gdt, {
        archetype: rival.archetype,
        worldSize: level.world,
        levelNumber: level.n,
        itemValueMultiplier: ivmEff,
        spatialHash: state.hash,
        hoardCap: rival.hoardCap,
        speedMultiplier: state.rivalSpeedMultiplier,
      });
      // Animate the hole (swirl + rim pulse + ground-flush heights). The
      // radius passed is the scale rivals.js just applied, so a dead rival
      // mid-respawn keeps its last footprint instead of snapping to base.
      const rivalRadius = Math.max(1, rival.object3D.scale.x);
      rival.holeVisual.update(gdt, rivalRadius);
      // Rival growth beat, on the SAME ladder as the player's (sizeTierOf), so
      // "that rival just got a size bigger" means exactly what it means for
      // you. Upward crossings only — a rival shrinking after a piñata is not a
      // threat signal. A dead rival mid-respawn holds its last footprint
      // (rivals.js), so its tier does not churn while it is gone.
      const rivalTier = sizeTierOf(rivalRadius, radiusFromMass(0), state.targetRadius);
      if (rival.sizeTier && rivalTier > rival.sizeTier) rival.growth.onTierUp();
      rival.sizeTier = rivalTier;
      rival.growth.update(gdt, rivalRadius);
      for (const obj of events.ateProps) {
        removePropRoster(obj);
      }
      if (events.telegraph) {
        // World-space approach direction -> screen-edge angle (0 = up,
        // positive clockwise), relative to the camera's view yaw.
        setDuelistTelegraph(chaseCamera.yaw - Math.atan2(events.telegraph.dx, events.telegraph.dz));
        state.telegraphTimer = 0.6;
      }
      if (events.pinata) {
        // Crumbs are already in propObjects (rivals.js pushed them) — attach
        // them to the instanced world + swallow registry via the same funnel.
        const rawCrumbs = events.pinata.crumbs;
        const crumbs = state.massLedger
          ? state.massLedger.admit(rawCrumbs, ivmEff)
          : rawCrumbs;
        if (crumbs.length !== rawCrumbs.length) {
          const admitted = new Set(crumbs);
          for (let i = state.propObjects.length - 1; i >= 0; i -= 1) {
            const prop = state.propObjects[i];
            if (prop.crumb && rawCrumbs.includes(prop) && !admitted.has(prop)) {
              state.propObjects.splice(i, 1);
            }
          }
        }
        for (const crumb of crumbs) {
          const crumbScale = propBaseScale(crumb.kind, crumb.radius);
          crumb.rotationY = Math.random() * Math.PI * 2;
          crumb.scale = crumbScale;
          crumb.baseScale = crumbScale;
          crumb.scaleY = crumbScale;
          crumb.tiltX = 0;
          crumb.tiltZ = 0;
          crumb._edible = false;
        }
        // spawnProps pushes into propObjects — crumbs are already there, so
        // do the roster wiring inline for them instead of double-pushing.
        const firstIndex = state.world.add(crumbs);
        crumbs.forEach((crumb, i) => {
          state.worldIndex.set(crumb, firstIndex + i);
          state.hash.insert(crumb);
          state.swallower.registerProp(crumb);
        });
        if (!reducedMotion) state.slowMo = events.pinata.slowMoSeconds;
        Audio.pinataBurst();
      }
      if (events.shockwave) {
        spawnShockwave(events.shockwave.x, events.shockwave.z, events.shockwave.radius);
      }
      if (events.playerAteRival) {
        state.rivalsEaten += 1;
        const bonus = capProgressionAward(
          events.bonus * state.modifiedStats.massGainMultiplier
            * (state.perks.rivalBonusMultiplier || 1),
          level.target,
        );
        avatar.mass += bonus;
        Audio.rivalEat();
        unlockAchievement('rival');
        if (rival.archetype === 'duelist') unlockAchievement('duelist');
        showBanner(`🌀 RIVAL ABSORBED — +${Math.round(bonus)}`, 1600);
      }
      if (events.respawned) {
        showBanner('😈 RIVAL RESPAWNED', 1100);
      }
    }
    if (state.telegraphTimer > 0) {
      state.telegraphTimer -= dt;
      if (state.telegraphTimer <= 0) setDuelistTelegraph(null);
    }
    if (state.lockBadgeTimer > 0) {
      state.lockBadgeTimer -= dt;
      if (state.lockBadgeTimer <= 0) setLockBadge(null);
    }

    updateShockwaves(gdt);

    // Onboarding beats (level 1 only). Beat 1: the spawn-feast edible props
    // PULSE (instance-color path) and the pointer hand rides the nearest one
    // (its world position projected to screen each frame), not the avatar.
    if (state.onboarding) {
      state.onboarding.t += gdt;
      const ob = state.onboarding;
      if (ob.beat === 1) {
        ob.pulse = (ob.pulse || 0) + gdt;
        const k = 0.5 + 0.5 * Math.sin(ob.pulse * 6);
        let nearest = null;
        let nearestDistSq = Infinity;
        for (const obj of state.propObjects) {
          if (!obj.spawnFeast || !obj._edible) continue;
          const idx = state.worldIndex.get(obj);
          if (idx !== undefined) state.world.pulseInstance(idx, k);
          const dx = obj.position.x - avatar.position.x;
          const dz = obj.position.z - avatar.position.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < nearestDistSq) { nearestDistSq = dSq; nearest = obj; }
        }
        if (nearest) {
          tutHandVec.set(
            nearest.position.x,
            (nearest.position.y || 0) + nearest.radius * 1.6,
            nearest.position.z
          ).project(engine.camera);
          if (tutHandVec.z < 1) {
            positionTutorialHand({
              x: (tutHandVec.x * 0.5 + 0.5) * window.innerWidth,
              y: (-tutHandVec.y * 0.5 + 0.5) * window.innerHeight,
            });
          }
        }
        if (ob.t >= 10) { ob.beat = 2; endTutorialPulse(); showOnboardingBeat(2); }
      } else if (ob.beat === 2 && ob.t >= 14) { ob.beat = 3; showOnboardingBeat(3); }
      else if (ob.beat === 3 && ob.t >= 18) { state.onboarding = null; hideOnboarding(); }
    }

    // Win check (post swallow/rival, so an eat that crosses target this same
    // frame ends the level immediately).
    const win = evaluateWin(runSnapshot(), level);
    if (win.won) {
      levelDone();
      return;
    }

    // Light "radio chatter" flavor ticker.
    state.notifTimer -= gdt;
    if (state.notifTimer <= 0) {
      state.notifTimer = 9 + Math.random() * 8;
      showNotif(getFlavorText(state.lastEatenKind || 'billboard'));
    }

    // Minimap at ~10Hz: edible clusters, goldens, rivals, landmark, player.
    state.minimapTimer -= dt;
    if (state.minimapTimer <= 0) {
      state.minimapTimer = 0.1;
      minimap.update({
        player: { x: avatar.position.x, z: avatar.position.z },
        clusters: state.edibleHash.queryClusters(avatar.position.x, avatar.position.z, level.world, { minCount: 4 }),
        goldens: state.goldenProps.map((g) => ({ x: g.position.x, z: g.position.z })),
        rivals: state.rivals.filter((rv) => rv.deadTimer <= 0).map((rv) => ({ x: rv.position.x, z: rv.position.z })),
        landmark: state.layout ? { x: state.layout.landmark.x, z: state.layout.landmark.z } : null,
        worldSize: level.world,
      });
      if (state.mercy.heatmapUnlocked) minimap.setHeatmap(heatmapProps());
    }

    // Metro signature animation (fog banks parting, sand/snow drift,
    // confetti decay — the static signatures no-op here).
    if (state.signature) {
      state.signature.update(gdt, {
        avatarX: avatar.position.x,
        avatarZ: avatar.position.z,
        avatarRadius: r,
        targetRadius: state.targetRadius,
      });
    }

    // Hole.io-style "Size N" pill riding under the player hole: same
    // world→screen projection pattern as pinLockBadge — project the avatar
    // ground center, then estimate the on-screen rim radius by projecting a
    // point one radius away, and pin the pill just below the rim. The size
    // tier is a cosmetic 1-15 readout of growth toward this level's target
    // radius (radiusFromMass(0) is the level-invariant starting radius).
    sizePillVec.set(avatar.position.x, 0, avatar.position.z).project(engine.camera);
    if (sizePillVec.z < 1) {
      const centerPx = (sizePillVec.x * 0.5 + 0.5) * window.innerWidth;
      const centerPy = (-sizePillVec.y * 0.5 + 0.5) * window.innerHeight;
      sizePillVec.set(avatar.position.x + r, 0, avatar.position.z).project(engine.camera);
      const rimPx = Math.abs((sizePillVec.x * 0.5 + 0.5) * window.innerWidth - centerPx);
      const size = sizeTierOf(r, radiusFromMass(0), state.targetRadius);
      // THE GROWTH BEAT. The Size readout was already the game's own ladder of
      // "you got bigger" — it just changed silently. Every upward crossing now
      // fires the avatar's growth shockwave, punches the pill, and plays the
      // long-unused Audio.grow(). Downward crossings (mercy/twist radius caps)
      // deliberately do not fire; shrinking is not a reward.
      let punch = false;
      if (state.sizeTier && size > state.sizeTier) {
        avatar.onGrow();
        Audio.grow();
        // Claim the quiet window: for the next 0.35s no rival ring may fire.
        // The player's tier-up and a rival's are driven by the same feeding
        // spike and so tend to coincide; this is what guarantees the player's
        // own beat is never crowded on the frame it matters most.
        rivalRingBudget.notifyPlayerTierUp();
        punch = true;
      }
      state.sizeTier = size;
      setSizePill({ x: centerPx, y: centerPy + rimPx + 10, size, visible: true, punch });
    } else {
      setSizePill({ visible: false });
    }

    // HUD-layer event effects. All three are driven on the REAL frame dt, not
    // the slow-mo-scaled gdt: the HUD is chrome the player reads, and slowing
    // a "+N" down with a piñata slow-mo would leave numbers hanging on screen.
    updateMassFloats(dt, reducedMotion);
    updateScoreSparkle(dt);
    // The budget's lockout is WORLD time (gdt), not chrome time: it exists to
    // protect the player's growth ring, which also runs on gdt, so under
    // slow-mo the two must stretch together or the lockout would expire early.
    rivalRingBudget.update(gdt);

    updateHUD({
      levelName: state.isDailyRun ? `📅 Daily · ${level.districtName}` : `Level ${level.n} · ${level.districtName}`,
      timer: state.timer,
      mass: avatar.mass,
      target: level.target,
      coins: state.runCoins,
      // ONE producer for the capstone surfaces: the chip text, the chip tone
      // and the mass bar's gated state all come from this same evaluation, so
      // the bar can never read "done" on a level that cannot yet be won.
      capstone: {
        required: win.capstoneRequired,
        met: win.capstoneMet,
        eaten: state.capstoneEaten,
        blocker: win.capstoneBlocker,
        shieldRemaining: state.shieldRemaining,
        comboNeeded: state.portalComboNeeded,
        comboBest: state.peakCombo,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  function frame() {
    const dt = Math.min(0.05, engine.clock.getDelta());
    if (state.mode === 'play') {
      updatePlay(dt);
    }
    // The instanced world keeps animating behind overlays (done/fail/shop)
    // so the city stays alive under the chrome.
    if (state.world) {
      state.world.update(dt, engine.camera);
    }
    engine.render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Static button wiring
  // ---------------------------------------------------------------------------
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      Audio.init();
      openWorldMap();
    });
  }
  const goBtn = document.getElementById('goBtn');
  if (goBtn) goBtn.addEventListener('click', beginPlay);

  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      hideOverlay('doneScreen');
      openShop();
    });
  }

  const retryBtn = document.getElementById('retryBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      hideOverlay('failScreen');
      showLevelIntro();
    });
  }

  const againBtn = document.getElementById('againBtn');
  if (againBtn) {
    againBtn.addEventListener('click', () => {
      hideOverlay('winScreen');
      openWorldMap();
    });
  }

  requestAnimationFrame(frame);

  // Debug/verification handle (used by the headless smoke scripts; harmless
  // in production — no behavior hangs off it).
  window.__fw = { engine, avatar, chaseCamera, state };
}

if (typeof document !== 'undefined') {
  main();
}
