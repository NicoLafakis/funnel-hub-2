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
import { bakeGroundTexture } from './content/groundtex.js';
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
} from './ui/overlays.js';
import { createMinimap } from './ui/minimap.js';

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

// Star rating for a completed level — scales with how much of the clock was
// left (a speed/skill signal), same thresholds as V1.
function starGlyphs(count) {
  const c = Math.max(0, Math.min(3, count || 0));
  return '★'.repeat(c) + '☆'.repeat(3 - c);
}

// Disposes every geometry/material/texture under `root` and detaches it from
// its parent — called before a level's content is torn down/replaced so a
// full 100-level playthrough doesn't leak GPU buffers.
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
    baseFog: { near: 0, far: 0 },
    twist: null,
    twistState: null,
    valueMultiplier: 1,
    coinComboMultiplier: 1,
    rivalSpeedMultiplier: 1,
    targetRadius: 0,
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

  // Render scale for a gameplay prop: normalize the prop kit's small raw
  // geometry up to the prop's gameplay radius (see buildLevelWorld).
  function propBaseScale(kind, radius) {
    return radius / propkit.kindFootprintRadius(kind);
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
    engine.scene.background = skyColor;
    const fogNear = level.world * (night ? 0.12 : 0.18);
    const fogFar = level.world * (night ? 0.7 : 0.95);
    engine.scene.fog = new THREE.Fog(skyColor.getHex(), fogNear, fogFar);
    state.baseFog = { near: fogNear, far: fogFar };
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
    const groundMat = new THREE.MeshStandardMaterial({ color: metro.ground, roughness: 0.95, metalness: 0.02 });
    const baked = bakeGroundTexture(layout, {
      metro,
      textures: cityTextures ? cityTextures.ground : null,
      // Higher bake resolution when realistic surfaces + road markings are
      // in play — at 512 the dashed center lines alias away.
      size: cityTextures && cityTextures.ground ? 1024 : 512,
    });
    if (baked.canvas) {
      const tex = new THREE.CanvasTexture(baked.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      groundMat.map = tex;
      groundMat.color.set('#ffffff');
    }
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    root.add(ground);

    // Props: the district layout's seeded placements, turned into the runtime
    // prop-object contract (live fields the instanced world reads per frame:
    // position / rotationY / tiltX / tiltZ / scale / scaleY). Render scale is
    // normalized to the GAMEPLAY radius (propkit's raw dimensions are 1-45u —
    // dust motes next to a 26u-radius avatar; the 1.35x tier step stays
    // sacred because TIER_RADII itself steps 1.35x).
    const worldProps = [];
    const buildings = []; // fed to metro signatures (roofs, facade signs)
    for (const rec of layout.props) {
      const radius = rec.radius * (rec.scaleMult || 1);
      const baseScale = radius / propkit.kindFootprintRadius(rec.kind);
      const prop = {
        position: new THREE.Vector3(rec.x, 0, rec.z),
        radius,
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
    landmark.position.set(layout.landmark.x, 0, layout.landmark.z);
    landmark.rotation.y = layout.landmark.rotY || 0;
    root.add(landmark);
    const capstoneTier = level.template[level.template.length - 1];
    state.shieldRemaining = level.mechanics && level.mechanics.landmarkShield ? level.mechanics.landmarkShield : 0;
    state.propObjects.push({
      object3D: landmark,
      position: landmark.position,
      // Effective gate radius = max(geometry, economy-derived). The raw
      // bounding radius is smaller than a tier-6 building, which made the
      // boss eat edible in the opening seconds (see capstoneGateRadius).
      radius: Math.max(landmark.boundingRadius, capstoneGateRadius(level)),
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
      // Same ground-flush funnel + thick rim as the player (art §2). The
      // group lives unscaled inside rival.object3D, which rivals.js scales
      // to the rival's world radius — exactly the avatar's convention, so
      // the hole fills the same footprint the old sphere did.
      rival.holeVisual = createHoleVisual(THREE, { ...colors, ringOpacity: 0.95 });
      rival.object3D.add(rival.holeVisual.group);
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

  function levelFail() {
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
      descEl.innerHTML = `Time ran out at <b>${Math.floor(avatar.mass).toLocaleString()}</b> / ${level.target.toLocaleString()} mass.`
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
      const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE || level.isCapstone;
      if (avatar.mass >= level.target && (!capstoneRequired || state.capstoneEaten)) {
        levelDone();
      } else {
        levelFail();
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
        // The fog closes in as you grow: near plane pulls toward
        // fogNearFactor of its base as mass approaches target.
        const f = Math.min(1, avatar.mass / level.target);
        const nearFactor = typeof tw.params.fogNearFactor === 'number' ? tw.params.fogNearFactor : 0.6;
        engine.scene.fog.near = state.baseFog.near * (1 - (1 - nearFactor) * f);
        engine.scene.fog.far = state.baseFog.far * (1 - 0.15 * f);
      } else if (tw.id === 'sandstorm') {
        // A sandstorm sweeps the plaza at half-time: dense fog for ~10s.
        if (!ts.fired && progress >= (tw.params.atTimeFraction || 0.5)) {
          ts.fired = true;
          ts.stormT = 10;
          showBanner('🌪 SANDSTORM', 1600);
          Audio.storm();
        }
        if (ts.stormT > 0) {
          ts.stormT -= gdt;
          engine.scene.fog.near = state.baseFog.near * 0.35;
          engine.scene.fog.far = state.baseFog.far * 0.55;
          if (ts.stormT <= 0) {
            engine.scene.fog.near = state.baseFog.near;
            engine.scene.fog.far = state.baseFog.far;
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
      for (const obj of res.eaten) {
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
      avatar.mass += capProgressionAward(
        res.massGained * state.modifiedStats.massGainMultiplier + goldenBonusMass,
        level.target,
      );
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
      if (idx === undefined) continue; // the landmark is not instanced
      const gate = obj.isCapstone && typeof obj.capstoneGate === 'number' ? obj.capstoneGate : DEFAULT_SIZE_GATE;
      const edible = !obj.hazard && obj.radius <= swallowR * gate;
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
      rival.holeVisual.update(gdt, Math.max(1, rival.object3D.scale.x));
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
    const massReached = avatar.mass >= level.target;
    const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE || level.isCapstone;
    if (massReached && (!capstoneRequired || state.capstoneEaten)) {
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
      const baseRadius = radiusFromMass(0);
      const span = Math.max(1, (state.targetRadius || baseRadius) - baseRadius);
      const size = Math.max(1, Math.min(15, 1 + Math.floor(14 * (r - baseRadius) / span)));
      setSizePill({ x: centerPx, y: centerPy + rimPx + 10, size, visible: true });
    } else {
      setSizePill({ visible: false });
    }

    updateHUD({
      levelName: state.isDailyRun ? `📅 Daily · ${level.districtName}` : `Level ${level.n} · ${level.districtName}`,
      timer: state.timer,
      mass: avatar.mass,
      target: level.target,
      coins: state.runCoins,
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
