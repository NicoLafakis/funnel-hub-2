// Flywheel 3D — real game bootstrap and flow.
//
// Wires together everything the prior implementation stages built: engine
// primitives (scene/avatar/camera/input), difficulty-curve data
// (formulas/metros/levels), content (propkit/landmarks), gameplay systems
// (audio/combo/achievements/swallow/rivals/storms), meta-progression
// (save/upgrades/collection/worldmap) and UI (overlays/HUD/shop).
//
// Flow: start screen -> world map -> level intro -> play -> done (+ optional
// shop) -> next level or back to world map -> ... -> win screen after level
// 100. Fail screen on timeout. M mutes. Konami code + 'unsub'/'breeze' typed
// easter eggs are ported from the original shipped 2D game (recovered via
// `git show 97c9024:index.html`), adapted to the 3D city setting.
//
// No browser-only API (document/window/localStorage) is touched at module
// top level — everything lives inside main(), invoked only under the
// `typeof document !== 'undefined'` guard at the bottom — so a bare dynamic
// import of this file never throws in Node.
import * as THREE from 'three';

import { createEngine } from './engine/scene.js';
import { createAvatar } from './engine/avatar.js';
import { createChaseCamera } from './engine/camera.js';
import { createInput } from './engine/input.js';

import { METROS } from './data/metros.js';
import { generateLevel, LEVEL_COUNT } from './data/levels.js';

import { createPropMesh, scaleForRadius, setPropTextures } from './content/propkit.js';
import { createLandmark } from './content/landmarks.js';
import { generateCityLayout } from './content/citylayout.js';

import { Audio } from './systems/audio.js';
import { createComboTracker, COMBO_TIERS } from './systems/combo.js';
import { createAchievementTracker, ACH } from './systems/achievements.js';
import { checkSwallow, DEFAULT_SIZE_GATE } from './systems/swallow.js';
import { createRival, updateRival, RIVAL_WARMUP_SECONDS } from './systems/rivals.js';
import { createStormController } from './systems/storms.js';

import { loadSave, saveSave } from './meta/save.js';
import { UPGRADE_TRACKS, UPGRADE_KEYS, cost as upgradeCost, applyUpgrades } from './meta/upgrades.js';
import { recordSighting, checkHoarderMilestone, getFlavorText } from './meta/collection.js';
import { renderWorldMap } from './meta/worldmap.js';

import { showOverlay, hideOverlay, renderShop, updateHUD } from './ui/overlays.js';

// ---------------------------------------------------------------------------
// Pure helpers (no DOM/THREE-instance-specific state) — safe at module scope.
// ---------------------------------------------------------------------------

// Fail-screen flavor lines — ported from the original shipped game's
// FAIL_LINES (`git show 97c9024:index.html`), reworded only where they named
// the retired CRM/records theme literally.
const FAIL_LINES = [
  'The city fought back. It had zoning laws.',
  'Retention rate: 100%. The streets retained themselves.',
  "Sync error 418: I'm a teapot, not a vacuum.",
  'The streets unionized. You were outvoted.',
  'Mass target missed. Management has been notified.',
];

// Konami code — EXACT sequence ported from the original (lowercased keys).
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

// A random point on the level's ground square, kept `margin` world-units
// clear of the outer edge so spawned props never sit half-outside the world.
function randomGroundPos(worldSize, margin) {
  const half = worldSize / 2 - margin;
  const safeHalf = Math.max(10, half);
  return {
    x: (Math.random() * 2 - 1) * safeHalf,
    z: (Math.random() * 2 - 1) * safeHalf,
  };
}

// Camera-relative steering: input.js produces screen-space axes (W = up),
// but the chase camera swings around behind the avatar's facing direction,
// so feeding those axes straight into avatar movement makes keys "drift"
// away from what they mean on screen (reported as sticky/friction-y
// diagonal movement). Rotate the input vector by the camera's current yaw
// so W is always "away from camera" and A/D are always screen-left/right.
// Pure math on a passed-in yaw so it stays headlessly testable.
export function rotateAxesByYaw(dx, dz, yaw) {
  if (dx === 0 && dz === 0) return { dx: 0, dz: 0 };
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // camera-forward on the XZ plane is (sin yaw, cos yaw); screen-right is
  // (cos yaw, -sin yaw).
  // screen-up vector is -dz (since W gives dz = -1).
  // world movement = dx * screen-right + (-dz) * camera-forward
  return {
    dx: dx * cos - dz * sin,
    dz: -dx * sin - dz * cos,
  };
}

// A random point in a ring around the world center (the avatar's spawn), used
// to seed a guaranteed "spawn feast" of small props in the opening view.
function randomRingPos(minR, maxR, margin) {
  const ang = Math.random() * Math.PI * 2;
  const r = minR + margin + Math.random() * Math.max(10, maxR - minR - margin);
  return { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
}

// Star rating + coin reward for a completed level. Stars scale with how much
// of the clock was left (a speed/skill signal); coins scale with level index
// (so later levels — which take far longer — pay out more) plus a modest
// bonus for overshoot mass, normalized back to base-mass terms so it doesn't
// explode at n=100's itemValueMultiplier scale.
function computeLevelRewards(level, finalMass, timeRemaining) {
  const timeFraction = level.time > 0 ? Math.max(0, Math.min(1, timeRemaining / level.time)) : 0;
  let stars = 1;
  if (timeFraction >= 0.25) stars = 2;
  if (timeFraction >= 0.5) stars = 3;

  const baseCoins = 20 + Math.round(level.n * 2.5);
  const overshoot = Math.max(0, finalMass - level.target);
  const normalizedOvershoot = overshoot / Math.max(1, level.itemValueMultiplier);
  const overshootCoins = Math.min(60, Math.round(normalizedOvershoot / 10));
  const coins = baseCoins + stars * 15 + overshootCoins;
  return { stars, coins };
}

function starGlyphs(count) {
  const c = Math.max(0, Math.min(3, count || 0));
  return '★'.repeat(c) + '☆'.repeat(3 - c);
}

// Disposes every geometry/material under `root` and detaches it from its
// parent — called before a level's content is torn down/replaced so a full
// 100-level playthrough doesn't leak GPU buffers.
function disposeObject3D(root) {
  if (!root) return;
  root.traverse((node) => {
    if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => { if (m && typeof m.dispose === 'function') m.dispose(); });
    }
  });
  if (root.parent) root.parent.remove(root);
}

export function main() {
  const canvasEl = document.getElementById('game');
  if (!canvasEl) return;

  // -------------------------------------------------------------------------
  // Bootstrap: engine/avatar/camera/input are created ONCE and reused across
  // every level; only the level's content (ground/props/rivals/landmark/
  // storm) is rebuilt per level.
  // -------------------------------------------------------------------------
  const engine = createEngine(canvasEl, THREE);
  const avatar = createAvatar(engine.scene, THREE);
  const chaseCamera = createChaseCamera(engine.camera, avatar, THREE);
  const input = createInput();
  // Scratch vector for the camera-relative steering math (see
  // rotateAxesByYaw) — allocated once, never per-frame.
  const camDirScratch = new THREE.Vector3();

  // PixelLab-generated texture maps (assets/textures/, see propkit.js's
  // setPropTextures contract). Registered once at bootstrap; every prop
  // built afterwards picks them up. sRGB so colors survive the renderer's
  // linear workflow; repeat wrapping so builders can tile them.
  const texLoader = new THREE.TextureLoader();
  function loadTexture(url) {
    const tex = texLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const asphaltTexture = loadTexture('assets/textures/asphalt.png');
  setPropTextures({
    apartment: loadTexture('assets/textures/facade-apartment.png'),
    office: loadTexture('assets/textures/facade-office.png'),
    concrete: loadTexture('assets/textures/facade-concrete.png'),
  });

  const state = {
    mode: 'start', // start | worldmap | intro | play | done | fail | win | shop
    saveData: loadSave(),
    achievementTracker: createAchievementTracker(),
    levelN: 1,
    level: null,
    modifiedStats: null,
    levelRoot: null,
    propObjects: [],
    rivals: [],
    comboTracker: createComboTracker(),
    stormCtl: null,
    timer: 0,
    capstoneEaten: false,
    fastAchieved: false,
    peakCombo: 0,
    stormEatenCount: 0,
    lastEatenKind: null,
    chaosTimer: 0,
    notifTimer: 8,
    tickWholeSecond: -1,
  };

  // Pre-seed the achievement tracker with whatever was already unlocked in a
  // previous session, silently (no toast/no re-save) — achievements persist
  // across reloads via saveData.achievements.
  (state.saveData.achievements || []).forEach((key) => state.achievementTracker.unlock(key));

  // ---------------------------------------------------------------------------
  // Small DOM helpers (banner / toast / notif) — the equivalents index.html's
  // original 2D game had inline. ui/overlays.js only owns overlay show/hide,
  // the HUD, and the shop, so these three small pieces of chrome are this
  // integration layer's job.
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

  // Unlocks `key` (if not already), toasts it, and persists it into the save
  // immediately so it survives a reload — matching the original's `achieve()`
  // but now durable, since this rewrite actually has a save file.
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

  // ---------------------------------------------------------------------------
  // Level content construction
  // ---------------------------------------------------------------------------
  function buildLevelWorld(level) {
    disposeObject3D(state.levelRoot);
    state.propObjects = [];
    state.rivals = [];

    const root = new THREE.Group();
    root.name = `level-${level.n}`;
    engine.scene.add(root);
    state.levelRoot = root;

    const metro = level.metro;
    engine.scene.background = new THREE.Color(metro.sky);
    engine.scene.fog = new THREE.Fog(new THREE.Color(metro.sky).getHex(), level.world * 0.18, level.world * 0.95);

    // Ground plane, sized to this level's world() footprint. The asphalt
    // texture (tiled ~every 28 world units so its grain matches prop scale)
    // multiplies with the metro's ground tint — a flat-colored plane read as
    // "nothing was there" at distance; the grain gives the eye surface to
    // hold onto, especially in the DOF-blurred background.
    const groundGeo = new THREE.PlaneGeometry(level.world, level.world);
    const groundMap = asphaltTexture.clone();
    groundMap.needsUpdate = true;
    groundMap.repeat.set(level.world / 28, level.world / 28);
    const groundMat = new THREE.MeshStandardMaterial({ color: metro.ground, map: groundMap, roughness: 0.95, metalness: 0.02 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    root.add(ground);

    // Level 1 gets an authored city (street grid, park, parking lot, plaza)
    // from src/content/citylayout.js instead of the generic scatter below.
    const cityLayout = level.n === 1 ? generateCityLayout(level) : null;

    // Street grid: without any visual reference on the ground, a flat-colored
    // plane gives zero sense of motion ("couldn't see the floor, looked like
    // nothing was there" — live player report). A subtle grid, tinted from
    // the metro's accent, restores speed/position readability. Cells ~110u,
    // matching the old 2D game's grid step. (Level 1's city layout renders
    // real roads/blocks instead, which serve the same purpose.)
    if (cityLayout) {
      // Block pads: sidewalk-tinted planes covering each block, so the ground
      // plane showing through between them reads as asphalt streets. Park /
      // lot / plaza blocks get their own surface colors.
      const PAD_COLORS = {
        park: '#4a7d44',
        lot: '#2f3840',
        plaza: '#7b858e',
        mixed: '#55606a',
        downtown: '#55606a',
        residential: '#5d6850',
      };
      for (const b of cityLayout.blocks) {
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(b.w, b.d),
          new THREE.MeshStandardMaterial({ color: PAD_COLORS[b.type] || '#55606a', roughness: 0.95, metalness: 0.02 })
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(b.x, 0.5, b.z);
        root.add(pad);
      }
      // Road center lines.
      for (const road of cityLayout.roads) {
        const line = new THREE.Mesh(
          road.axis === 'x' ? new THREE.PlaneGeometry(level.world, 1.4) : new THREE.PlaneGeometry(1.4, level.world),
          new THREE.MeshBasicMaterial({ color: '#c9b458' })
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(road.axis === 'x' ? 0 : road.at, 0.3, road.axis === 'x' ? road.at : 0);
        root.add(line);
      }
    } else {
      const grid = new THREE.GridHelper(level.world, Math.round(level.world / 110), metro.accent, metro.accent);
      grid.material.transparent = true;
      grid.material.opacity = 0.18;
      grid.material.depthWrite = false;
      grid.position.y = 0.5; // float just above the plane to avoid z-fighting
      root.add(grid);
    }

    const obstacleMeshes = [];
    const CITY_BUILDING_KINDS = ['building-small', 'building-medium', 'building-large', 'apartment', 'office'];

    // Props: spawn level.template scaled by level.itemValueMultiplier per
    // src/content/propkit.js's `kind` contract with src/data/levels.js.
    // Placement is zoned, not uniform-random: a chase camera sees only a small
    // cone of the world, so uniform scatter reads as an empty city. The two
    // smallest tiers put ~75% of their count in a tight "spawn feast" ring
    // (80-380u — roughly one prop every ~80 units) around the avatar's (0,0)
    // start so the first 10-15s guarantees visible growth; mid tiers get a
    // smaller share; everything else scatters as before. (An earlier 120-550
    // ring at 60% was too thin — blind drives from spawn regularly ate 0.)
    if (cityLayout) {
      // Authored placement: every template tier keeps its exact count/radius/
      // mass (the layout consumes level.template directly), positioned on the
      // street grid, plus the street-furniture kinds. `color` overrides the
      // metro accent for per-instance paint (cars/buses).
      for (const p of cityLayout.props) {
        const mesh = createPropMesh(p.kind, THREE, p.color || metro.accent);
        // Visual size matches the swallow radius so "fits your rim" reads on
        // screen (see propkit.js scaleForRadius).
        mesh.scale.setScalar(scaleForRadius(p.kind, p.radius));
        mesh.position.set(p.x, 0, p.z);
        mesh.rotation.y = p.rotY;
        root.add(mesh);
        if (CITY_BUILDING_KINDS.includes(p.kind)) {
          obstacleMeshes.push(mesh);
        }
        state.propObjects.push({
          object3D: mesh,
          position: mesh.position,
          radius: p.radius,
          mass: p.mass,
          kind: p.kind,
          golden: false,
        });
      }
    } else {
      level.template.forEach((tier) => {
        const nearShare = tier.tierIndex <= 1 ? 0.75 : tier.tierIndex <= 3 ? 0.3 : 0;
        for (let i = 0; i < tier.baseCount; i += 1) {
          const mesh = createPropMesh(tier.kind, THREE, metro.accent);
          const pos = Math.random() < nearShare
            ? randomRingPos(80, 380, tier.baseRadius * 1.3 + 20)
            : randomGroundPos(level.world, tier.baseRadius * 1.3 + 20);
          mesh.position.set(pos.x, 0, pos.z);
          mesh.rotation.y = Math.random() * Math.PI * 2;
          root.add(mesh);
          if (CITY_BUILDING_KINDS.includes(tier.kind)) {
            obstacleMeshes.push(mesh);
          }
          state.propObjects.push({
            object3D: mesh,
            position: mesh.position,
            radius: tier.baseRadius,
            mass: tier.baseMass,
            kind: tier.kind,
            golden: false,
          });
        }
      });
    }

    // Guaranteed opening bite: a small inner ring of tier-0 props right at
    // the spawn point, so ANY first move (even a blind one) eats within a
    // second. ~30 base mass — negligible against the level's 1427 budget,
    // but it eliminates the "0 mass after 10s" failure mode outright.
    {
      const biteTier = level.template[0];
      for (let i = 0; i < 10; i += 1) {
        const mesh = createPropMesh(biteTier.kind, THREE, metro.accent);
        if (cityLayout) mesh.scale.setScalar(scaleForRadius(biteTier.kind, biteTier.baseRadius));
        const pos = randomRingPos(50, 130, biteTier.baseRadius * 1.3 + 20);
        mesh.position.set(pos.x, 0, pos.z);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        root.add(mesh);
        state.propObjects.push({
          object3D: mesh,
          position: mesh.position,
          radius: biteTier.baseRadius,
          mass: biteTier.baseMass,
          kind: biteTier.kind,
          golden: false,
        });
      }
    }

    // Golden jackpot pickups — 1-2 per level, EXACT count logic ported from
    // the original (`1+(Math.random()<.5?1:0)`). Mass stays BASE (the 8x
    // bonus is applied at eat-time by swallow.js's GOLDEN_BONUS_MULTIPLIER),
    // recolored gold so they read as a jackpot from a distance.
    const midTiers = level.template.slice(1, -1);
    const nGold = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < nGold; i += 1) {
      const tier = midTiers[Math.floor(Math.random() * midTiers.length)];
      const mesh = createPropMesh(tier.kind, THREE, '#ffd54a');
      if (cityLayout) mesh.scale.setScalar(scaleForRadius(tier.kind, tier.baseRadius));
      const pos = randomGroundPos(level.world, tier.baseRadius * 1.3 + 20);
      mesh.position.set(pos.x, 0, pos.z);
      root.add(mesh);
      state.propObjects.push({
        object3D: mesh,
        position: mesh.position,
        radius: tier.baseRadius,
        mass: tier.baseMass,
        kind: tier.kind,
        golden: true,
      });
    }

    // Capstone: the metro's landmark, gated by this level's capstoneGate(n).
    // Every level within a metro spawns the SAME landmark model (per
    // src/data/levels.js's LEVEL_TEMPLATE comment: the capstone-candidate
    // tier's slot is what the real capstone substitutes for) — only the
    // metro's 10th/final level counts as "clearing the metro" for the
    // metroCleared achievement (see checkCapstoneEaten below).
    const landmark = createLandmark(metro.landmarkType, THREE, metro.accent);
    // Level 1's landmark anchors the city layout's plaza block; every other
    // level keeps the random placement.
    const capstonePos = cityLayout && cityLayout.plaza
      ? cityLayout.plaza
      : randomGroundPos(level.world, landmark.boundingRadius * 1.2 + 30);
    landmark.position.set(capstonePos.x, 0, capstonePos.z);
    root.add(landmark);
    obstacleMeshes.push(landmark);
    const capstoneTier = level.template[level.template.length - 1];
    state.propObjects.push({
      object3D: landmark,
      position: landmark.position,
      radius: landmark.boundingRadius,
      // A landmark is the level's boss eat — worth a hefty one-time bonus on
      // top of the largest regular tier's base mass.
      mass: capstoneTier.baseMass * 8,
      kind: metro.landmarkType,
      golden: false,
      isCapstone: true,
      capstoneGate: level.capstoneGate,
    });

    chaseCamera.setObstacles(obstacleMeshes);

    // Rivals. Spawn well away from the player's (0,0) start so they can't
    // camp the spawn-feast ring, give them a wander-only warmup so the
    // player gets the opening feast uncontested, and cap their radius
    // relative to the world so a fed rival can't grow map-covering huge.
    for (let i = 0; i < level.rivalCount; i += 1) {
      let pos = randomGroundPos(level.world, 200);
      for (let tries = 0; tries < 20 && Math.hypot(pos.x, pos.z) < level.world * 0.25; tries += 1) {
        pos = randomGroundPos(level.world, 200);
      }
      const rival = createRival({ x: pos.x, y: 0, z: pos.z }, THREE);
      rival.warmupTimer = RIVAL_WARMUP_SECONDS;
      rival.radiusCap = level.world * 0.15;
      rival.massDivisor = level.itemValueMultiplier;
      const rivalMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 16),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0x9b59b6 : 0xe74c3c,
          emissive: i % 2 ? 0x2a1638 : 0x330505,
          emissiveIntensity: 0.7,
          roughness: 0.4,
        })
      );
      rival.object3D.add(rivalMesh);
      root.add(rival.object3D);
      state.rivals.push(rival);
    }

    // Hazards (storms): src/systems/storms.js is deliberately scene-agnostic,
    // so this integration layer maps the level's scalar hazardDensity(n) onto
    // storms.js's concrete timing/count knobs, and supplies the spawn
    // callback that actually materializes objects into the world. Tutorial /
    // first-contest tiers have hazardDensity 0 — no storm controller at all.
    if (level.hazardDensity > 0) {
      state.stormCtl = createStormController({
        dropCount: Math.max(4, Math.round(6 + level.hazardDensity * 60)),
        intervalMin: Math.max(6, 16 - level.hazardDensity * 30),
        intervalJitter: 8,
        goldenChance: 0.06,
      });
    } else {
      state.stormCtl = null;
    }
  }

  function spawnStormDrop(event) {
    if (!state.level || !state.levelRoot) return;
    showBanner(event.bannerText, 1200);
    Audio.storm();
    const dropTier = state.level.template[0];
    for (let i = 0; i < event.count; i += 1) {
      const golden = !!event.goldenFlags[i];
      const mesh = createPropMesh(dropTier.kind, THREE, golden ? '#ffd54a' : state.level.metro.accent);
      const ax = avatar.position.x + (Math.random() - 0.5) * 500;
      const az = avatar.position.z + (Math.random() - 0.5) * 500;
      const half = state.level.world / 2 - 40;
      mesh.position.set(Math.max(-half, Math.min(half, ax)), 0, Math.max(-half, Math.min(half, az)));
      state.levelRoot.add(mesh);
      state.propObjects.push({
        object3D: mesh,
        position: mesh.position,
        radius: dropTier.baseRadius,
        mass: dropTier.baseMass,
        kind: dropTier.kind,
        golden,
        storm: true,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Screen flow
  // ---------------------------------------------------------------------------
  function openWorldMap() {
    state.mode = 'worldmap';
    hideOverlay('startScreen');
    hideOverlay('introScreen');
    hideOverlay('doneScreen');
    hideOverlay('failScreen');
    hideOverlay('winScreen');
    hideOverlay('shopScreen');
    hideOverlay('hud');
    const grid = document.getElementById('worldMapGrid');
    renderWorldMap(grid, METROS, state.saveData, onSelectLevel);
    showOverlay('worldMapScreen');
  }

  function onSelectLevel(n) {
    state.levelN = n;
    state.level = generateLevel(n);
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
    if (iconEl) iconEl.src = `assets/hubs/hub-${level.chapter}.png`;
    const badgeEl = document.getElementById('introBadge');
    if (badgeEl) badgeEl.textContent = `Level ${level.n} of ${LEVEL_COUNT} · ${metro.name}`;
    const titleEl = document.getElementById('introTitle');
    if (titleEl) titleEl.textContent = `${metro.name} — ${level.districtName}`;

    const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE;
    const descEl = document.getElementById('introDesc');
    if (descEl) {
      descEl.innerHTML = `${level.districtName}, ${metro.name}. 🎯 Target: <b>${level.target.toLocaleString()}</b> mass &nbsp;·&nbsp; ⏱ ${level.time}s`
        + (level.rivalCount > 0 ? `<br>🌀 ${level.rivalCount} rival flywheel${level.rivalCount > 1 ? 's' : ''} contesting this district.` : '')
        + (capstoneRequired ? `<br>🏙️ Grow big enough to swallow the district's landmark to finish.` : '');
    }
    const tipEl = document.getElementById('introTip');
    if (tipEl) tipEl.textContent = `💡 ${tierTip(level.tier)}`;

    showOverlay('introScreen');
    state.mode = 'intro';
  }

  function beginPlay() {
    Audio.init();
    const level = state.level;
    const upgradeState = state.saveData.upgrades;
    state.modifiedStats = applyUpgrades({ startMass: 0, timeSeconds: level.time }, upgradeState);

    buildLevelWorld(level);

    avatar.object3D.position.set(0, 0, 0);
    avatar.mass = state.modifiedStats.startMass;
    avatar.speedMultiplier = state.modifiedStats.moveSpeedMultiplier;
    avatar.radiusCap = level.world * 0.2;
    avatar.massDivisor = level.itemValueMultiplier;

    state.comboTracker = createComboTracker();
    state.timer = state.modifiedStats.timeSeconds;
    state.capstoneEaten = false;
    state.fastAchieved = false;
    state.peakCombo = 0;
    state.stormEatenCount = 0;
    state.lastEatenKind = null;
    state.chaosTimer = 0;
    state.notifTimer = 8 + Math.random() * 6;
    state.tickWholeSecond = -1;

    hideOverlay('introScreen');
    showOverlay('hud');
    state.mode = 'play';

    const hintEl = document.getElementById('sizehint');
    if (hintEl) {
      hintEl.textContent = level.rivalCount > 0
        ? '🌀 rival flywheels are stealing your food — eat THEM back!'
        : '🌀 swallow things smaller than your rim';
    }
  }

  function levelDone() {
    const level = state.level;
    state.mode = 'done';
    Audio.done();

    const { stars, coins } = computeLevelRewards(level, avatar.mass, state.timer);
    state.saveData.coins += coins;
    const prevStars = state.saveData.stars[level.n] || 0;
    state.saveData.stars[level.n] = Math.max(prevStars, stars);
    state.saveData.unlockedLevel = Math.max(state.saveData.unlockedLevel, Math.min(LEVEL_COUNT, level.n + 1));
    state.saveData.bestCombo = Math.max(state.saveData.bestCombo, state.peakCombo);
    saveSave(state.saveData);

    const titleEl = document.getElementById('doneTitle');
    if (titleEl) titleEl.textContent = `${level.metro.name} — ${level.districtName} swallowed!`;
    const descEl = document.getElementById('doneDesc');
    if (descEl) {
      descEl.innerHTML = `You consumed <b>${Math.floor(avatar.mass).toLocaleString()}</b> mass.`
        + `${state.peakCombo >= 10 ? ` Peak combo: <b>${state.peakCombo}</b>.` : ''}<br>`
        + `🪙 +${coins} coins &nbsp;·&nbsp; ${starGlyphs(stars)}`;
    }
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.textContent = level.n < LEVEL_COUNT ? 'CONTINUE →' : 'FINISH →';

    showOverlay('doneScreen');
    hideOverlay('hud');
  }

  function levelFail() {
    state.mode = 'fail';
    Audio.fail();
    const level = state.level;
    const line = FAIL_LINES[Math.floor(Math.random() * FAIL_LINES.length)];
    const descEl = document.getElementById('failDesc');
    if (descEl) {
      descEl.innerHTML = `Time ran out at <b>${Math.floor(avatar.mass).toLocaleString()}</b> / ${level.target.toLocaleString()} mass.`
        + `<br><span style="color:#8fa8b8;font-style:italic">${line}</span>`;
    }
    showOverlay('failScreen');
    hideOverlay('hud');
  }

  function openShop() {
    state.mode = 'shop';
    hideOverlay('doneScreen');
    const upgradeDefs = UPGRADE_KEYS.map((key) => {
      const track = UPGRADE_TRACKS[key];
      const icons = { size: '🔵', speed: '⚡', magnet: '🧲', time: '⏱', growth: '📈' };
      return {
        id: key,
        name: track.label,
        icon: icons[key] || '',
        description: track.description,
        maxTier: track.maxTier,
        costs: Array.from({ length: track.maxTier }, (_, i) => upgradeCost(key, i)),
      };
    });
    const container = document.getElementById('shopTracks');
    renderShop(container, upgradeDefs, state.saveData, onBuyUpgrade, onShopContinue);
    showOverlay('shopScreen');
  }

  function onBuyUpgrade(trackId) {
    const tier = state.saveData.upgrades[trackId] || 0;
    const track = UPGRADE_TRACKS[trackId];
    if (!track || tier >= track.maxTier) return;
    const price = upgradeCost(trackId, tier);
    if (state.saveData.coins < price) return;
    state.saveData.coins -= price;
    state.saveData.upgrades[trackId] = tier + 1;
    saveSave(state.saveData);
    openShop(); // re-render with the new balance/tier
  }

  function onShopContinue() {
    hideOverlay('shopScreen');
    const level = state.level;
    if (level.n >= LEVEL_COUNT) {
      showWinScreen();
    } else if (level.levelInChapter >= 10) {
      openWorldMap();
    } else {
      state.levelN = level.n + 1;
      state.level = generateLevel(state.levelN);
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
  }

  // ---------------------------------------------------------------------------
  // Easter eggs (ported from the original shipped 2D game, adapted to 3D) —
  // recovered via `git show 97c9024:index.html`.
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
    // "Gravity has left the chat": every currently-spawned prop gets a
    // random impulse for a few seconds — the 3D translation of the
    // original's `o.vx/o.vy = random * 260` physics-chaos scatter.
    state.chaosTimer = 3;
    for (const obj of state.propObjects) {
      obj.chaosVX = (Math.random() - 0.5) * 260;
      obj.chaosVZ = (Math.random() - 0.5) * 260;
    }
    showBanner('📭 UNSUBSCRIBED FROM PHYSICS', 1800);
    unlockAchievement('unsub');
    Audio.storm();
  }

  function triggerBreeze() {
    if (state.mode !== 'play' || !state.level || !state.levelRoot) return;
    // Summons a small cluster of themed "Breeze AI drone" props near the
    // avatar to eat — the city-setting equivalent of the original's "4 AI
    // bot" spawn, matching its spirit ("summon something extra to eat").
    for (let i = 0; i < 4; i += 1) {
      const mesh = createPropMesh('bike', THREE, '#7a5cff');
      mesh.scale.setScalar(1.3);
      const half = state.level.world / 2 - 60;
      const x = Math.max(-half, Math.min(half, avatar.position.x + (Math.random() - 0.5) * 500));
      const z = Math.max(-half, Math.min(half, avatar.position.z + (Math.random() - 0.5) * 500));
      mesh.position.set(x, 0, z);
      state.levelRoot.add(mesh);
      state.propObjects.push({
        object3D: mesh, position: mesh.position, radius: 22, mass: 20, kind: 'breeze-drone', golden: false,
      });
    }
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

    state.timer -= dt;
    if (state.timer <= 0) {
      state.timer = 0;
      updateHUD({ timer: 0 });
      if (avatar.mass >= level.target && (!(level.capstoneGate > DEFAULT_SIZE_GATE) || state.capstoneEaten)) {
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

    state.comboTracker.update(dt);

    if (state.stormCtl) {
      state.stormCtl.update(dt, spawnStormDrop);
    }

    // Chaos scatter (the 'unsub' egg): move impulsed props, bouncing off the
    // world bounds, then decay the impulse back toward rest.
    if (state.chaosTimer > 0) {
      state.chaosTimer -= dt;
      const half = level.world / 2;
      for (const obj of state.propObjects) {
        if (typeof obj.chaosVX !== 'number') continue;
        obj.position.x += obj.chaosVX * dt;
        obj.position.z += obj.chaosVZ * dt;
        if (obj.position.x < -half + 40 || obj.position.x > half - 40) obj.chaosVX *= -1;
        if (obj.position.z < -half + 40 || obj.position.z > half - 40) obj.chaosVZ *= -1;
        obj.chaosVX *= Math.pow(0.5, dt);
        obj.chaosVZ *= Math.pow(0.5, dt);
      }
    }

    // Movement — camera-relative (see rotateAxesByYaw): keys mean what they
    // show on screen no matter which way the chase cam has swung. Also fixes
    // pointer-drag steering, which was previously applied as raw world axes
    // and drifted off-screen-direction once the camera rotated.
    engine.camera.getWorldDirection(camDirScratch);
    const camYaw = Math.atan2(camDirScratch.x, camDirScratch.z);
    const steer = rotateAxesByYaw(input.dx, input.dz, camYaw);
    avatar.setMoveInput(steer.dx, steer.dz);
    avatar.update(dt);
    const r = avatar.radius();
    const half = level.world / 2;
    let minB = -half + r;
    let maxB = half - r;
    if (minB > maxB) { minB = 0; maxB = 0; }
    avatar.object3D.position.x = Math.max(minB, Math.min(maxB, avatar.object3D.position.x));
    avatar.object3D.position.z = Math.max(minB, Math.min(maxB, avatar.object3D.position.z));

    chaseCamera.update(dt);

    // Swallow. Combo count is read before/after (rather than checked with
    // exact-equality mid-loop like the original) because several objects can
    // be eaten within the same frame — an exact-equality check could jump
    // straight past a threshold (e.g. 9 -> 12) and never fire it. Comparing
    // the before/after count catches any threshold crossed within the frame.
    const comboCountBefore = state.comboTracker.count;
    const { eaten, massGained } = checkSwallow(
      avatar,
      state.propObjects,
      state.comboTracker,
      level.itemValueMultiplier,
      state.modifiedStats.attractRadiusMultiplier
    );
    if (eaten.length) {
      avatar.mass += massGained * state.modifiedStats.massGainMultiplier;
      const comboCountAfter = state.comboTracker.count;
      state.peakCombo = Math.max(state.peakCombo, comboCountAfter);

      if (comboCountBefore < 10 && comboCountAfter >= 10) unlockAchievement('combo10');
      if (comboCountBefore < 25 && comboCountAfter >= 25) unlockAchievement('combo25');

      let crossedTier = null;
      for (const [n, name] of COMBO_TIERS) { // highest-first: first crossed match wins
        if (comboCountBefore < n && comboCountAfter >= n) { crossedTier = [n, name]; break; }
      }
      if (crossedTier) {
        showBanner(`🔥 ${crossedTier[1]} — x${state.comboTracker.mult()} COMBO`, 1100);
      }

      for (const obj of eaten) {
        if (obj.object3D) disposeObject3D(obj.object3D);
        state.lastEatenKind = obj.kind;

        const { isNew } = recordSighting(state.saveData.collection, obj.kind);
        if (isNew && checkHoarderMilestone(state.saveData.collection)) {
          unlockAchievement('hoarder');
        }

        unlockAchievement('first');

        if (obj.golden) {
          unlockAchievement('gold');
          Audio.golden();
        } else {
          Audio.gulp(obj.radius);
        }

        if (obj.storm) {
          state.stormEatenCount += 1;
          if (state.stormEatenCount === 5) unlockAchievement('storm');
        }

        if (obj.isCapstone) {
          state.capstoneEaten = true;
          if (level.levelInChapter >= 10) unlockAchievement('metroCleared');
        }
      }

      saveSave(state.saveData);
    }

    if (!state.fastAchieved && avatar.mass >= level.target / 2 && state.timer >= level.time * 0.3) {
      state.fastAchieved = true;
      unlockAchievement('fast');
    }

    // Rivals.
    const raidAI = level.tier === 'master' || level.tier === 'capital-siege';
    for (const rival of state.rivals) {
      const events = updateRival(rival, state.propObjects, avatar, dt, {
        raidAI,
        worldSize: level.world,
        levelNumber: level.n,
        itemValueMultiplier: level.itemValueMultiplier,
      });
      for (const obj of events.ateProps) {
        if (obj.object3D) disposeObject3D(obj.object3D);
      }
      if (events.playerAteRival) {
        avatar.mass += events.bonus * state.modifiedStats.massGainMultiplier;
        Audio.rivalEat();
        unlockAchievement('rival');
        showBanner(`🌀 RIVAL ABSORBED — +${Math.round(events.bonus)}`, 1600);
      }
      if (events.respawned) {
        showBanner('😈 RIVAL RESPAWNED', 1100);
      }
    }

    // Win check (post swallow/rival, so an eat that crosses target this same
    // frame ends the level immediately rather than waiting a frame).
    const massReached = avatar.mass >= level.target;
    const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE;
    if (massReached && (!capstoneRequired || state.capstoneEaten)) {
      levelDone();
      return;
    }

    // Light "radio chatter" flavor ticker — the redesign plan's ask to keep
    // the comedy voice alive as environmental flavor, without a canvas-2D
    // floater system.
    state.notifTimer -= dt;
    if (state.notifTimer <= 0) {
      state.notifTimer = 9 + Math.random() * 8;
      showNotif(getFlavorText(state.lastEatenKind || 'billboard'));
    }

    updateHUD({
      levelName: `Level ${level.n} · ${level.districtName}`,
      timer: state.timer,
      mass: avatar.mass,
      target: level.target,
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
    // DOF focus rides the camera->avatar distance every frame (also outside
    // play mode, so menus over the scene keep a sensible focal plane).
    engine.setFocus(engine.camera.position.distanceTo(avatar.position));
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
}

if (typeof document !== 'undefined') {
  main();
}
