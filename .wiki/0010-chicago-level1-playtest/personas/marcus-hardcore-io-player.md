# Playtest Report — Marcus "Marathon" Velez, hardcore .io/arcade player

**Level:** Level 1 — The Loop · Chicago (Flywheel V2)
**Session:** scripted driver, 1440×900, real GPU, quality profile "high"
**Evidence:** `shots/playtest/metrics.json` + screenshots 01–13

## Executive Summary

**Score: 2.5 / 5.0 — Not ranked-ready. Fix the frame rate and the camera getting swallowed by skyscrapers, then call me back.**

Look, the bones are here. Inputs stop inside spec (238ms after keyup, spec is 300ms), diagonals are properly normalized (0.984 ratio — nobody nerfed my W+D), Q/E orbit steps are a clean ±44.5°, and I can mash A/D like I'm plinking in Street Fighter without a single error or NaN. The spawn area hands me a buffet of clearly-highlighted food, and the combo banner has real juice.

But two things would make me close the tab inside a minute: **31 fps at spawn** on a real GPU, and a camera that keeps driving face-first into giant black monolith buildings that eat the entire screen. In hole.io I live and die on reading the board mid-motion. Here, half the screenshots are me staring at a purple rooftop or a void-black tower with my avatar somewhere behind it. That's not a camera, that's a blindfold.

## Scores by Area

| Area | Score (1–5) | One-liner |
|---|---|---|
| Control Responsiveness | 3.5 | Stops in-spec, diagonals clean, mash-proof; first-move latency inflated by low fps |
| Camera & Game Feel | 2.0 | Orbit steps precise, but occlusion is rampant and orbit→W direction is ambiguous |
| Visual Readability in Motion | 2.0 | Great edible highlighting at spawn; unreadable once the dark towers show up |
| Performance | 2.0 | 31 fps avg at spawn, p95 35.5ms — arcade games need 60, full stop |
| HUD / Routing Info | 3.5 | Timer, mass, minimap, combo banner all present; dual counters and minimap dot legibility hold it back |

## What Worked

- **Stop discipline:** 237.8ms stop after W release (spec ≤300ms), 242.1ms on ArrowUp — WASD/arrows are at parity, no favoritism. `metrics.json → controls.wHold / arrowUp`.
- **Normalized diagonals:** diagonal-vs-cardinal ratio 0.984. No free speed tech, no diagonal tax. Correct call.
- **Opposing keys cancel exactly:** W+S drift = 0. Key-mash A/D stops dead, zero new errors, no NaN. The input layer is solid engineering.
- **Orbit step precision:** +44.5° / −44.6° against a 45° spec. Sub-degree error is fine.
- **Spawn food readability:** `04-spawn.png` shows ~12+ colored props (blue/purple/teal gems, yellow cubes) within one screen of spawn — clears the "≥5 edible props" bar easily, plus the pointing-hand "Eat the highlighted props!" prompt. Good first 5 seconds.
- **Eat feedback has juice:** `07-eating.png` — "🔥 DATA DEVOURER — x3 COMBO" banner, Mass 42 → 60, Size 4 pop. The "Too big — grow first" toast (`05-moving.png`) tells me *why* I can't eat something instead of silently failing. That's the right instinct.
- **Zero console errors, all facade/ground textures wired** (`metrics.json → graphics.wiring`, 630 props, ground map present).

## Issues Found

### P0 — Frame rate is half of what an arcade game needs
- **Impact:** Every input, every camera correction, every read on the board runs through a 32ms mud puddle. In hole.io/agar.io at 60+ fps this is the difference between dodging a rival rim and getting swallowed.
- **Repro:** boot Level 1, stand at spawn. `metrics.json → graphics.perfSpawn`: **avg 32.16ms/frame (~31 fps), p95 35.5ms, sustained 30.7 fps** — at dpr 1, 1440×900, quality "high", 656 visible instances / 641 props.
- **Expected:** 60fps floor at this resolution on a real GPU, or the adaptive quality system visibly stepping down to hit it.
- **Actual:** quality stays pinned at "high" and eats the 31fps. Only 3 long frames, so it's not hitching — it's a *sustained* budget overage.
- **Evidence:** `metrics.json → graphics.perfSpawn` (avgMs 32.16, p95Ms 35.5, fps 31.1). Knock-on effect: W first-move latency is **96.9ms** — that's ~3 whole frames at 31fps. At 60fps the same logic would read ~50ms. The controls aren't lazy; the render loop is.

### P0 — Camera drives into skyscrapers; avatar fully occluded for whole seconds
- **Impact:** I'm routing blind in a game about routing. I can't see food, I can't see my own rim edge, and if a rival existed in these frames I couldn't see them either. This is a rage-quit trigger for a competitive player.
- **Repro:** move through the downtown blocks / orbit 180°. `08-building-large.png` — the entire frame is a flat **purple rooftop** with two black silhouettes; my avatar is *somewhere* under it (only the "Size 4" chip visible). `09-vista.png`, `10-ground-detail.png`, `11-full-hud.png` — a **void-black monolith tower** sits dead-center in front of the camera, avatar ring half-buried behind it. `06-after-orbit-180-w.png` — foreground is a wall of untextured box-tops hiding the street.
- **Expected:** occlusion fade/cutaway on geometry between camera and avatar, or camera collision that pulls in; occluding buildings should never render as opaque black walls.
- **Actual:** opaque, near-black towers between camera and avatar with no fade.
- **Evidence:** screenshots above; spec's own 55° pitch / 17.5r standoff can't be delivering a readable view in these blocks. Also suspicious: these foreground towers look *untextured* (flat black/purple) while `metrics.json` claims every facade map is wired — either the night lighting crushes them to black or the tall-tier material path differs from the small/medium tiers in `08-building-medium.png` / `08-building-small.png`, which read fine.

### P1 — Orbit 180° → W movement direction is ambiguous mid-recenter
- **Impact:** The spec says "orbit 180° then W = avatar moves toward screen bottom." Measured **dot with camera-forward = 0.569** — that's ~55° off-axis, neither away nor toward. The cause per the driver notes: movement basis is frozen at gesture start while the chase cam auto-recenters behind me after ~2s. What that *feels* like: I orbit, press W expecting "down-screen," and for a second the avatar slides off at a diagonal while the camera swings. In a chase moment that's a missed dodge that isn't my fault — the worst kind of death.
- **Repro:** orbit 180°, immediately hold W, sample displacement vs camera forward within the recenter window.
- **Expected:** dot ≈ −1.0 (or a re-basis on the first movement frame after an orbit so W is always "away from camera *now*").
- **Actual:** dot 0.569, moved 266.69u in the ambiguous direction (`metrics.json → controls.orbit180ThenW`).
- **Evidence:** `06-after-orbit-180-w.png` + `metrics.json`. Caveat: the scripted driver samples positions, it can't feel the gesture — a human hand test should confirm how disorienting the recenter swing actually is before prioritizing.

### P1 — Scene is too dark where it matters
- **Impact:** Even when the camera isn't buried, `05-moving.png` and `07-eating.png` are dim; the purple tower in `07-eating.png` eats the entire left third of the screen as a lightless mass. Dark-on-dark kills prop silhouette reading at speed, especially at 31fps where you get fewer looks per second.
- **Repro:** any downtown frame. Compare `04-spawn.png` (readable, colorful props on green) with `08-building-large.png` (black/purple void).
- **Expected:** rim/edge highlight or min-brightness floor on gameplay-relevant geometry; edible props should pop at a glance like they do at spawn.
- **Actual:** large geometry renders as near-black shapes with no edge language.
- **Evidence:** `07-eating.png`, `08-building-large.png`, `09-vista.png`.

### P2 — HUD has two counters that disagree in spirit
- **Impact:** top-left bar says "**0 collected**" while top-right says "**Mass 8 / 1.00k**" (`04-spawn.png`, `13-hud-strip.png`). Two progress numbers, zero explanation of the difference. I've eaten things (Mass 42→60 in `07-eating.png`) while "0 collected" sits at 0 in later shots (`11-full-hud.png` still "0 collected" at Mass 67). Either the bar is broken or it tracks something else — either way I'm ignoring it, which means it's screen clutter.
- **Expected:** one primary progression readout, or a labeled distinction.
- **Actual:** "0 collected" static across the whole session in every screenshot.
- **Evidence:** `13-hud-strip.png`, `11-full-hud.png` vs `metrics.json → eating.grew = true`.

### P2 — Minimap dots don't carry routing information
- **Impact:** `12-minimap.png` (96×96, spec-compliant size) shows a uniform grid of teal dots, one orange dot, and my blue square. At 96px I can't tell edible vs threat vs golden at a glance, there's no legend, and no rival dots are visible in any shot. Spec calls for edible/golden/rival distinction — maybe the color coding technically exists, but if I can't parse it mid-sprint it doesn't exist.
- **Expected:** size/shape/brightness tiers I can read peripherally; rivals should be unmistakable (big, warm, pulsing).
- **Actual:** confetti.
- **Evidence:** `12-minimap.png`; minimap present in all gameplay shots bottom-right.

### P2 — Stop distance is in-spec but the decel tail deserves a hand check
- **Impact:** 238ms stop from 352 u/s ≈ a ~40u coast. Within the 300ms spec, but on a tighter board that coast is the difference between kissing a "too big" building and clipping it. Can't judge the *curve* from position samples alone — the driver can't feel whether it's a crisp linear brake or a floaty ease-out. Flag for human hand test.
- **Evidence:** `metrics.json → controls.wHold.stopAfterReleaseMs = 237.8`.

## Disqualifiers Triggered

**None hard-triggered.** Stop time ≤0.3s: pass (238/242ms). Spawn food ≥5: pass. Minimap 96px: pass. Zero errors: pass. But two *soft* disqualifiers for the competitive audience specifically: sustained 31fps (P0) and the camera occlusion (P0) would each independently make me uninstall an .io game. The orbit-180 spec item is **indeterminate** — dot 0.569 fails "toward screen bottom" but the frozen-basis explanation means it needs a human feel test before I call it a violation.

## Recommendations

1. **Get to 60fps before anything else.** Either fix the frame budget at "high" (656 instances / 641 props is the prime suspect — instance culling, shadow map 2048, or facade texture cost) or make the adaptive quality actually adapt: if sustained < 50fps for 2s, step down. Ship the step-down this week, optimize after.
2. **Occlusion handling for camera-blocking geometry:** fade, cutaway, or camera pull-in. Non-negotiable for a game about reading the board.
3. **Fix the black monoliths:** whether it's lighting or a missing material path on the tall tier, no gameplay-space building should ever render as a void.
4. **Re-basis movement on first input after an orbit** (or slow the auto-recenter while movement keys are held) so W always means "away from the camera I'm looking through right now." Then re-run the orbit-180 probe expecting dot ≈ −1.
5. **Reconcile the HUD counters** — kill or label "collected."
6. **Minimap:** make rivals/golden visually loud; add a legend or make the coding self-evident.
7. **Human hand test** for decel curve feel and orbit→W disorientation; the scripted driver genuinely cannot judge either, and I'm not going to pretend it can.

## Would You Keep Playing?

**Maybe.** Conditions: 60fps sustained at spawn *and* mid-city, and occlusion fade on the towers. Do those two and the clean input layer + combo juice underneath is a game I'd actually grind. Ship it as-is and I'm back on hole.io inside five minutes — I don't fight my camera *and* my opponents.
