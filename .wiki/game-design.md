# V2 Game Design

How the game plays. Ordered by player impact. Each section: what V1 does,
what changes in V2, why (lesson refs from `lessons-from-v1.md`), and the
acceptance test.

## 1. Controls — camera-relative twin-stick, not screen-relative pointing

**V1:** WASD/arrows move in *world* axes (W = world −Z), drag steers toward
the cursor's offset from screen center. Two bugs shipped here (B4 drift),
and the feel complaint ("sliding around") is partly this: when the chase
camera swings, your keys no longer match the screen.

**V2:**
- **Move input is camera-relative.** W always means "away from camera,"
  A/D strafe relative to the view. The avatar's velocity is input vector
  rotated by camera yaw.
- **Movement captures a stable camera basis at gesture start.** W/stick-up is
  resolved through that yaw until the keys or movement touch are released.
  The camera may turn behind the avatar without changing a direction the
  player is already holding.

  *Amended 2026-07-28.* Directly recomputing movement from a heading-following
  camera every frame remains forbidden. The 2026-07-27 implementation paired camera-relative
  movement with §2's chase camera that yawed to the avatar's heading. Those
  two are jointly unshippable: heading feeds camera yaw feeds the world
  move direction feeds heading, and any lateral input diverges — measured at
  −540°/s of camera slew plus a 15 Hz snap-back cycle (2394° of rotation and
  85 direction reversals per 3s of held input). That was the shipped
  "steering fights you left/right, feels like rolling a ball" report. V1
  avoided it only because, as this doc already noted, "the camera yaw was
  nearly static" — that static yaw was load-bearing and V2 removed it
  without removing the dependency. The replacement freezes the movement basis
  for each continuous gesture, breaking that dependency while restoring the
  requested chase-camera turn. Full analysis and the original regression probe:
  `0003-hole-feel-and-visual-fidelity/00-findings.md` §1,
  `scripts/motion-probe.mjs`.
- **Camera orbit:** right-drag (mouse) or second-finger drag (touch) orbits
  yaw ±120° and pitch 35°–65°. Q/E rotate 45° stepped for keyboard-only
  players. Manual orbit temporarily offsets the heading-follow camera and
  auto-recenters behind the avatar after 2s of movement without orbit input.
- **Drag-to-move (mouse) stays**, but it sets a *world-space target* (raycast
  the pointer onto the ground plane) rather than a screen-center direction —
  the avatar pathfinds straight to it and stops on arrival. Fixes the
  "always driving toward the edge" class of bug structurally (B4).
  *Current implementation:* touch uses left-half movement and right-half
  orbit, with pinch pitch; one-finger drag-target remains mouse-only. The
  external mobile review found this makes a first touch on the right fail to
  move. Proposed ADR 0003 supersedes the intended mapping: first active
  non-UI touch owns movement and the second owns orbit. Until implemented,
  the current left/right behavior remains mechanism, not target design.
- Input layer gets a formal state machine (`idle / key-steer / drag-target /
  orbit`) with enter+exit transitions and unit tests for each.

**Why:** B4, and "sliding around, couldn't tell where I was going."
**Acceptance:** hover never moves the avatar (B4 regression test in E2E);
releasing all input stops the avatar within 0.3s; orbiting 180° then
pressing W moves the avatar toward the screen bottom.

## 2. Camera — see the meal, not the ball

**V1:** fixed yaw chase cam, distance ∝ radius (2.6r back / 1.5r up after
the live fix — B2). The ball still dominates center-frame; food is visible
only in a narrow forward cone (D2).

**V2:**
- **Smoothed heading follow.** The camera turns through the shortest arc toward
  the avatar's facing direction, keeping its eye behind the player. It never
  changes framing distance, pitch, or FOV merely because the player turns.
  Section 1's gesture-stable movement basis prevents the historical feedback
  loop between heading and camera-relative input. The follow is a
  velocity-bearing critically damped angular spring (0.16s smooth time), so a
  left/right reversal preserves angular velocity continuity while catching
  the avatar more promptly than the former first-order exponential lag.
- **High pitch (55°), long lens (FOV 40), long standoff (17.5r).** *Amended
  2026-07-27*: the original 40° / FOV 70 / 4r put the hole at ~85% of the
  frame width at spawn against the reference's ~23%, which inverted this
  section's own goal. A high pitch with a narrow FOV at distance is what
  gives the genre its flat toy-city read; a wide FOV up close reads as a
  fisheye at the player's feet. Orbit pitch range moves to 35°–65° to match.
  Genre reference: hole.io shows far more floor than avatar for a reason —
  the food *is* the game. Live Loop comparison moved the standoff from 12r to
  17.5r so dense frontage reads as a city grid instead of foreground walls
  and the central park occupies the same vertical share as the target frame.
- **Size-adaptive lag:** camera damping decreases as radius grows so big
  avatars don't feel like steering a blimp through molasses.
- **Edge look-ahead:** camera biases ~15% toward the dominant nearby edible
  cluster (a soft "meal compass"), computed from the same spatial hash the
  rivals use. Subtle; never yanks.
- **Screen-space minimap** (corner, 96px): dots for edible clusters, gold
  for goldens, red for rivals, 🏙️ for the landmark. This is the single
  biggest fix for "couldn't see anything" that doesn't touch the camera at
  all. Canvas 2D overlay, ~40 lines.

**Why:** B2, D2, and the repeated live complaint of emptiness.
**Acceptance:** at spawn on level 1, ≥5 edible props visible in frame;
minimap shows the landmark at all times; a 90° player turn causes the camera
to settle behind that heading without curving a continuously held direction.

## 3. The eat loop — keep, then add texture

**V1:** contact + size-gate eating, combo multiplier ×5, golden 8× pickups,
rush-hour drops, rivals, capstone landmark. This core is good (kept per
lessons-from-v1 "what V1 got right").

**V2 additions (cheap, high texture):**
- **Vacuum snap:** edible props within 1.6r accelerate in over ~150ms with a
  lean-in tilt. V1 props vanish on contact with zero anticipation; the
  genre's best juice is the slurp. (This was Phase-1 of the old 2D redesign
  and never made it into the 3D version.)
- **Chain ping:** combo tier-ups get a rising semitone tick (the 2D game's
  pitch ladder, also never ported).
- **Wedge wobble:** too-big props rock when pushed and show a lock badge
  once per few seconds. Readable "not yet" without a HUD word.
- **Near-miss crumbs:** eating 90% of a visible cluster auto-vacuums the
  stragglers. Kills the "one last trash can" chore.

**Acceptance:** clearing a 10-prop cluster takes ≤2s and raises gulp pitch
audibly per eat; too-big props never silently block.

## 4. Rivals — from tax to gameplay

**V1:** rivals eat props, you can eat them when bigger; two famine bugs
(B5) patched with warmup + spawn distance. They're a nuisance timer, not a
character.

**V2:**
- **Named rivals with personalities** (3 archetypes): *Grazer* (wanders,
  easy prey), *Bandit* (raid-AI, targets your nearest cluster), *Duelist*
  (hunts *you* when bigger, flees when smaller — cat-and-mouse both ways).
  One archetype per level, introduced on the intro card.
- **Rival telegraphs:** direction indicator at screen edge when a bigger
  Duelist is off-screen and approaching.
- **Eat-a-rival payoff becomes an event:** slow-mo 0.4s, shockwave, its
  *entire hoard* scatters as edible crumbs before the bonus applies. Turns
  the best moment into a piñata.
- Keep the B5 fixes (warmup, spawn distance, radius normalization).

**Acceptance:** Duelist levels produce at least one flee-or-fight decision
per level in playtesting; no level is mathematically starvable (automated
soak: rivals confined, player must still reach target with 20% time left).

## 5. Difficulty model — derive, don't port

**V1:** quadratic everything (target, values = 1000n²); radius
post-normalization is level-invariant; difficulty spikes come from rival
count and capstone gate. B3 and B6 both came from scaling formulas that
were never re-derived.

**V2 progression invariants (remediated 2026-07-24):**
1. Base timer is 75–120 seconds.
2. Avatar radius at target is at most 25% of world width.
3. Rival hoard at minute one never exceeds player-reachable mass.
4. A required capstone is edible by 90% of the timer.
5. The no-upgrade bot completes every level.
6. No-upgrade completion lands at 55–80% of the base timer.
7. Completion consumes 45–70% of the 2× target route budget.
8. No swallow frame or rival award exceeds 15% of target.
9. Initial and dynamically spawned progression mass stays within the
   8× target available-mass budget.

The same inputs must also produce byte-identical summaries across all 100
levels. Maximum growth and utility builds must complete no earlier than 25% of
their extended timer and must retain the 15% event cap. Combo never multiplies
growth mass.

**Acceptance:** all nine invariants and the full determinism pass run in CI.
Invariants 1–9 are release gates; the maximum-build floor remains separately
reported debt until the builds are retuned rather than normalized to the
current failure. As of the 0006 implementation worktree on 2026-07-28, all
nine gameplay invariants pass 100/100; see `current-state.md`.

**Correction (2026-07-27):** the maximum-build ceiling above described "5
sampled levels, 100/100" — actually a sampling artefact. Run over the full
100 levels it fails 31/300 (walked bot) to 120/300 (competent-play model)
combinations, worst 4.8%, concentrated in the utility build. This gate is
now deliberately left RED as known debt (owner `src/meta/upgrades.js`), not
misrepresented as a passing gate, until the builds are retuned. See
`0003-hole-feel-and-visual-fidelity/00-findings.md` §13–§16 for the full
derivation and why the floor was not lowered to paper over it. Also: a
required capstone being "edible by 90% of the timer" (invariant 4) is
necessary but not sufficient for completion — `0004-false-level-failure/
00-findings.md` found 91 of 100 levels require the landmark be actually
swallowed as a second win condition alongside mass, not merely edible.

## 6. Death/fail texture

**V1:** only the timer kills you.

**V2:** keep it that way (no hazards-for-hazards'-sake), but add **mercy
rules**: first fail on a level → +15s "second wind" offer (free, once);
3 fails → pity magnet tier for that attempt (V1 has this), plus the
minimap unlocks a "heatmap" of remaining mass for that attempt. Failing
should teach, not just sting.
