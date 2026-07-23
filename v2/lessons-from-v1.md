# Lessons from V1

Every V2 proposal traces to something on this list. V1 shipped on 2026-07-22,
was live-tested the next day (scripted Playwright playthroughs plus a human
session), and needed nine fixes before it was genuinely playable. Sources:
commit history (`de9df67`…`912d816`) and `STATUS.md`.

## Shipped bugs (found by live testing, not by the test suite)

| # | Bug | Symptom | Root cause | Lesson |
|---|-----|---------|-----------|--------|
| B1 | `three.core.js` not vendored | Game never booted | r185 split build; vendor script copied one of two files | **A boot smoke test on the real deployed URL is non-negotiable.** The 53-check headless suite passed while the game was a white page. |
| B2 | Chase camera inside the avatar | Screen filled by the inside of a purple sphere | Camera offset constants (~12u) were an order of magnitude smaller than the avatar radius (~35u) | **Camera math must be derived from the framed object's size, never absolute constants.** Also: screenshot early, screenshot often. |
| B3 | Rival bonus `(150+50n)·n²` | One rival eat = instant win on level 100 (5.15× the level target) | A formula ported from a 10-level game into a 100-level n² economy | **Every ported formula must be re-derived against the new economy's invariants, not scaled until it "stays relevant."** |
| B4 | Mouse drift | Hovering steered the avatar forever | `pointer.active` set on `pointermove`, never cleared | Input state machines need explicit enter *and* exit transitions, tested for "hands off" behavior. |
| B5 | Level famine | 0 mass on levels 21+ | Rivals beelined the spawn-feast ring, stripped it, camped it un-eatably large | Any resource concentration will be contested by every agent that pathfinds by value. **Design the race, don't discover it.** |
| B6 | Snowball pacing | Levels self-completed in seconds (10.6M mass vs 1.68M target) | Radius grew from n²-scaled mass; worlds grew ~2× | **Normalize every progression axis by the economy's scaling factor** (V1 fix: radius from base mass). |
| B7 | Rival respawns off-map | Respawned rivals teleported outside the world | 2D `0..world` coordinates in a ±world/2 3D world | Coordinate-system ports need a written contract (origin, extents, units) at the top of the module. |
| B8 | World-map accordion had no CSS | Level tiles "invisible"; a player thought you needed Enter to start | Styles covered a flat grid; the accordion structure shipped unstyled | **UI without a visual regression check isn't done.** |
| B9 | Start screen unreachable at 800×450 | Button outside viewport, page unscrollable | Overlays are fixed, centered, unscrollable | Mobile viewport is a first-class surface, not an afterthought. |

## Design flaws (not crashes — wrong choices)

- **D1 — Empty-world feel.** Uniform random prop scatter over a huge plane.
  Even after the "feast ring" fix, the city is props-on-a-colored-plane, not
  a place. A flat ground color gives zero motion parallax. *Fixed partially
  with a grid; the real fix is district layout (see art-direction.md).*
- **D2 — Content budget tuned for a top-down game.** ~1.43× target total
  mass works when you see whole neighborhoods; the chase camera sees a cone.
  Level 1 was literally unwinnable until counts were tripled.
- **D3 — The avatar is a sphere with a wireframe shell.** It reads as "a
  ball," not as a flywheel/vortex character. No squash, no tilt-through-turns
  that reads at distance, no wake/trail on the ground.
- **D4 — Meta is linear and consequence-free.** Five upgrade tracks, all
  "more of a stat," bought in order, no builds, no trade-offs. Stars exist
  but nothing asks for them.

## What V1 got right (keep)

- The eat-grow-capstone loop with a priced landmark finale per district.
- The 10 metros × 10 districts structure with per-metro palettes/landmarks.
- The comedy voice (flavor notifications, achievement text, Skyline-opedia).
- localStorage meta with zero backend. It fits the game and the hosting.
- The headless logic suite (53 checks) — worth keeping and extending, but it
  must be paired with browser E2E (see tech-architecture.md).
