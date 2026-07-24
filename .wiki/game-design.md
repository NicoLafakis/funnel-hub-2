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
  rotated by camera yaw. This is how every 3rd-person game since 1998 works;
  V1 skipped it because the camera yaw was nearly static. Once the camera
  can orbit (below), it's mandatory.
- **Camera orbit:** right-drag (mouse) or second-finger drag (touch) orbits
  yaw ±120° and pitch 15°–55°. Q/E rotate 45° stepped for keyboard-only
  players. Auto-recenter behind the avatar after 2s of movement with no
  orbit input.
- **Drag-to-move (mouse) stays**, but it sets a *world-space target* (raycast
  the pointer onto the ground plane) rather than a screen-center direction —
  the avatar pathfinds straight to it and stops on arrival. Fixes the
  "always driving toward the edge" class of bug structurally (B4).
  *Resolved in V2 implementation:* on touch devices the tech-arch §6 scheme
  wins instead — left half = virtual stick, right half = orbit, pinch =
  pitch — so one-finger drag-target is mouse-only (documented in
  `src/engine/input.js`).
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
- **Higher default pitch (~40°) and slightly wider FOV (65→70)**, pushing
  the avatar to the lower third. Genre reference: hole.io shows far more
  floor than avatar for a reason — the food *is* the game.
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
minimap shows the landmark at all times.

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

**V2:** one page of invariants every system must satisfy, enforced by tests:
1. Reachable mass in 60% of timer ≥ 1.5× target at every level (simulated
   greedy-bot run, not vibes).
2. Avatar radius at 100% target ≤ 0.25× world width.
3. Rival hoard at minute 1 ≤ player's reachable mass by then.
4. Capstone edible radius reachable by 90% of timer with ≤ combo ×2.
5. Every level completable by the scripted bot *without* upgrades (upgrades
   are style/speed, not a gate).

**Acceptance:** the five invariants run in CI against all 100 levels on
every PR. A level that fails blocks merge.

## 6. Death/fail texture

**V1:** only the timer kills you.

**V2:** keep it that way (no hazards-for-hazards'-sake), but add **mercy
rules**: first fail on a level → +15s "second wind" offer (free, once);
3 fails → pity magnet tier for that attempt (V1 has this), plus the
minimap unlocks a "heatmap" of remaining mass for that attempt. Failing
should teach, not just sting.
