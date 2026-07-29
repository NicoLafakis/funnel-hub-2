# Playtest Report — Dez Whitaker (Keyboard-Only Accessibility)

**Persona:** Desmond "Dez" Whitaker, 52. Mild right-hand motor tremor, early
presbyopia. Keyboard-only player (Civ, XCOM, older CRPGs). Mouse is a last
resort, and small click targets are a genuine barrier for me, not a
preference.
**Session:** Level 1 — The Loop · Chicago, Flywheel V2. Scripted session,
1440×900 viewport, ~31 fps average.
**Evidence:** `shots/playtest/metrics.json` + screenshots `01-title` through
`13-hud-strip` (HUD text verified via full-resolution crops).

---

## Executive Summary

**Overall: 2.8 / 5.0 — Verdict: A genuinely keyboard-friendly game hiding
behind a mouse-only front door.**

Here's the frustrating part: once I was *in* the level, this is one of the
more comfortable action games I've played with keys in years. WASD *and*
arrow keys both work identically, diagonals are normalized (measured ratio
0.984 — no speed cheat for wobble), mashing keys stops clean with zero
errors, and the camera is a smooth damped spring with no sway and no
flashing. Somebody on this team thought about hands like mine.

Then I look at the rest of it. The title screen, the world map, and the
level intro are three screens of mouse clicks — "SPIN IT UP", level nodes,
"DIVE IN" — with not one visible focus ring, keyboard hint, or selection
highlight in any screenshot. There's no options screen, no remapping, and
the only settings in the save data are `soundMuted` and `qualityMode`. And
half the HUD text is sized for someone with younger eyes than mine.

Fix the menu keyboard path and add a real options screen and this jumps a
full point and a half. The hard part — the moment-to-moment play — is
already right.

## Scores by Area

| Area | Score (1–5) | Notes |
|---|---|---|
| Keyboard-Only Completeness | 2.5 | Gameplay: excellent, 5/5. Menus: no visible keyboard access in any shot — needs live verification, evidence points to mouse-only |
| Text & Contrast Readability | 3.0 | Headlines/banners/toasts good; HUD counters ~13px; secondary menu text small and low-contrast; no text-size option |
| Input Forgiveness | 4.5 | Digital keys, normalized diagonals, clean opposite-key cancel, forgiving release damping; 75s level timer is the one unfriendly element |
| Motion Comfort | 4.0 | Critically-damped chase cam, no sway/flashing; auto-recenter is forced motion; dark scene; 31 fps on test machine |
| Options/Remapping | 1.0 | Nothing. No options screen visible anywhere; save schema holds only `soundMuted` + `qualityMode` |

## What Worked

- **Full dual keyboard movement.** WASD and arrow keys measured identical
  (peak speeds 352.6 vs 357.2 — within noise). Left-hand-only or
  right-hand-only players are both covered (`metrics.json: controls.wHold`,
  `controls.arrowUp`).
- **Tremor-tolerant movement.** Time-to-first-move 70–97ms, release stop
  ~240ms of damped glide, diagonals normalized to 0.984 of cardinal speed,
  and W+S cancel with *zero* measured drift
  (`metrics.json: oppositeKeysCancelDrift: 0`). A sloppy key release doesn't
  punish you.
- **Key-mash safe.** Scripted mashing produced no new errors and no NaNs
  (`metrics.json: keyMash`). My tremor double-taps won't break anything.
- **Q/E camera orbit in discrete 45° steps** (measured 44.5°/−44.6°).
  Predictable, keyboard-driven, no mouse-drag orbit required.
- **Camera is gentle.** Critically-damped spring (0.16s), high 55° pitch,
  no bob, no shake, no flash effects in any still. Across 13 screenshots I
  found nothing that would bother a motion-sensitive player.
- **Headline text is genuinely readable.** "DATA DEVOURER — x3 COMBO"
  (`07-eating.png`), "Eat the highlighted props!" (`04-spawn.png` crop),
  and the intro screen body text (`03-intro.png` crop) are bold, decently
  sized, and high-contrast white-on-dark. Whoever styled the toasts did
  right by old eyes.
- **HUD pills are high contrast.** White pills with dark text ("Mass 8 /
  1.00k", "0 collected") read cleanly against the dark city
  (`04-spawn.png`, `13-hud-strip.png`).
- **Eating loop works and reads clearly** — mass grew 42 → 60 in the
  session, with clear "Too big — grow first" feedback when a target is out
  of reach (`metrics.json: eating`, `05-moving.png`).

## Issues Found

### P0 — Menus show no keyboard access (potential hard blocker)

- **Impact:** If the boot funnel is truly mouse-only, I cannot start the
  game without picking up the mouse three separate times: "SPIN IT UP"
  (`01-title.png`), a level node on the world map (`02-worldmap.png`), and
  "DIVE IN" (`03-intro.png`). With a tremor, these aren't minor asks —
  they're the difference between "plays keyboard-only" and "doesn't."
- **Repro:** Boot the game; attempt to navigate title → world map → level
  intro using Tab/arrow keys/Enter only. The scripted session used mouse
  clicks for all three steps.
- **Expected:** Visible focus ring and full keyboard traversal (Tab/arrows
  + Enter/Space) on every menu screen, matching the excellent in-level
  keyboard support.
- **Actual:** No focus indicator, selection highlight, or keyboard hint is
  visible in `01-title.png`, `02-worldmap.png`, or `03-intro.png`. Whether
  Tab/Enter actually work is **needs live verification** — stills can't
  show tab order — but there is zero visible affordance, which is itself a
  defect even if the wiring exists.
- **Evidence:** `01-title.png`, `02-worldmap.png`, `03-intro.png`.

### P1 — No options screen, no remapping, no visible pause shortcut

- **Impact:** I can't rebind keys, can't scale text, can't adjust camera
  behavior, can't touch audio beyond a mute toggle. For accessibility this
  is the difference between "configured for me" and "take it or leave it."
- **Repro:** Inspect all 13 screenshots for any settings/options entry
  point; check save schema.
- **Expected:** An options screen (reachable by keyboard, e.g. Esc) with at
  minimum: key remapping, text/UI scale, camera sensitivity/auto-recenter
  toggle, volume sliders.
- **Actual:** No options UI in any shot. Pause (⏸) and sound buttons exist
  top-right (`13-hud-strip.png`) but are small circular mouse targets
  (~36px); no keyboard shortcut for pause is hinted anywhere — whether Esc
  or P pauses is **needs live verification**. Save data settings:
  `soundMuted`, `qualityMode` only.
- **Evidence:** `13-hud-strip.png`, all menu shots; known save schema.

### P1 — HUD counter text too small for presbyopia, no scaling option

- **Impact:** The numbers I'm asked to track under a 75-second timer —
  "Mass 67 / 1.00k", the countdown, "0 collected" — render at roughly
  13–14px in 1440×900 (`04-spawn.png` native-res crops). I can read them
  leaning in, but mid-game glance-reading is exactly where presbyopia
  bites. The "Size 2/3/4" pill is similarly small.
- **Repro:** View `04-spawn.png` / `13-hud-strip.png` at 100% scale; check
  HUD pill font sizes.
- **Expected:** 16px+ minimum for tracked gameplay numbers at 1080p-class
  viewports, or a UI scale option (see P1 above).
- **Actual:** ~13–14px counters; contrast is fine (white pill, dark text),
  size is not. Combo banner and toasts prove the team *can* do big text —
  the persistent HUD didn't get the same treatment.
- **Evidence:** `04-spawn.png` (native crops of top-left/top-right HUD),
  `13-hud-strip.png`, `07-eating.png` crop of "Logged. And gone." toast.

### P2 — Secondary menu text small and low-contrast

- **Impact:** World map supporting text — "Unlocks at level 31. One city.
  One day. Everyone.", the "LOCKED" labels, node numbers 3–10 — is small
  gray/muted text on dark navy. Below comfortable contrast for aging eyes.
- **Repro:** `02-worldmap.png` native crop of the DAILY SWALLOW row and
  locked city rows.
- **Expected:** WCAG AA-ish contrast (4.5:1) for body text even in
  secondary/locked states; locked items can be dimmed via icon/border, not
  just faint text.
- **Actual:** Muted gray-blue text on dark navy; readable when leaned in,
  straining at arm's length.
- **Evidence:** `02-worldmap.png` (native crop), `01-title.png` footer
  disclaimer line (very small, very dim).

### P2 — No on-screen keyboard control hints; spawn hint is a pointer hand

- **Impact:** At spawn, the guidance icon above the player is a 👆
  pointing hand (`04-spawn.png`) — a mouse/touch affordance. A keyboard
  player gets no visible "WASD / arrows to move, Q/E to orbit" onboarding.
  I only know the bindings because the session notes told me.
- **Repro:** Start level 1 fresh; inspect tutorial hints.
- **Expected:** Keyboard-first hint chips at spawn (e.g. "WASD or ←↑→↓ to
  roll · Q/E to look").
- **Actual:** Pointer-hand gesture hint; toast says "Eat the highlighted
  props!" but never says *how to move*. Whether other hints appear later is
  **needs live verification**.
- **Evidence:** `04-spawn.png`.

### P2 — 75-second level timer with no visible accommodation

- **Impact:** The target is 1,000 mass in 75s (`03-intro.png`), with the
  countdown shrinking in the top-right through the session (71 → 41 across
  shots). Time pressure plus imprecise input is a known accessibility
  squeeze; there's no visible option to extend or relax it.
- **Repro:** Read intro screen target/timer; observe countdown in
  `04-spawn.png` → `11-full-hud.png`.
- **Expected:** At minimum an option (untimed/relaxed mode) or generous
  retry framing. This may be core design — flagging, not demanding.
- **Actual:** Fixed countdown, no accommodation visible.
- **Evidence:** `03-intro.png` (native crop: "Target: 1,000 mass · 75s"),
  HUD timer across `04`–`11`.

### P2 — Movement direction ambiguous immediately after a 180° orbit

- **Impact:** After orbiting the camera 180° with Q/E, pressing W moved the
  player with a dot product of 0.569 against camera forward
  (`metrics.json: orbit180ThenW`) — i.e., movement is heading-relative, not
  camera-relative, while the camera auto-recenters behind you. For a beat,
  "forward" isn't where you're looking. Momentary disorientation for
  players who rely on predictable camera-move coupling.
- **Repro:** Orbit 180° via Q/E, press W immediately
  (`06-after-orbit-180-w.png` shows the resulting view).
- **Expected:** Either camera-relative movement, or a clearer snap/heading
  indicator during recenter.
- **Actual:** Hybrid behavior; the auto-recenter resolves it in a second or
  two, and the spring is smooth — minor, but worth noting.
- **Evidence:** `metrics.json: orbit180ThenW`, `06-after-orbit-180-w.png`.

## Disqualifiers Triggered

**None confirmed in gameplay.** Movement, camera, and eating are fully
keyboard-driven with no mouse dependency measured. One *potential*
disqualifier — mouse-only menus (P0) — is flagged **needs live
verification**: if Tab/Enter genuinely cannot traverse title → world map →
DIVE IN, that is a hard disqualifier for a keyboard-only player, and this
report's verdict drops to "would not keep playing."

## Recommendations

1. **Keyboard-traverse the boot funnel** (P0): real focus rings, Tab/arrow
   navigation, Enter/Space to activate on title, world map, and intro.
   Three screens, one pattern, huge payoff.
2. **Esc opens a pause/options menu** with volume, quality, and a "Controls"
   tab listing — and eventually rebinding — every key (P1).
3. **UI scale option or +2–3px on persistent HUD counters**; the toast/banner
   style is already correct, extend it (P1).
4. **Raise secondary/locked menu text contrast**; dim with icons, not faint
   text (P2).
5. **Keyboard-first control hints at spawn** alongside (or instead of) the
   pointer hand (P2).
6. **Consider a relaxed/untimed mode toggle** for players with motor
   impairments (P2).
7. **Make movement camera-relative, or signal heading during
   auto-recenter** (P2).

## Would You Keep Playing?

**Maybe — conditional yes.** If a quick live check shows Tab/Enter actually
traverse the menus (even without visible focus), I'd keep playing happily
and just squint at the HUD; the in-level experience is the most
keyboard-comfortable action game I've touched in a while. If the menus are
truly mouse-only, I'm out until that's fixed — I didn't spend twenty years
remapping CRPGs to crawl back to a mouse for a Start button. Fix the front
door and the options screen, and I'll eat Chicago all night.
