# HubHole — City / 3rd-Person / 100-Level Transformation Plan

*Proposal, not shipped work. Nothing in this document exists in `index.html` yet. Supersedes the theme direction in `docs/redesign.md` §2 (Options A/B/C) and its Phase 3 "theme retheme" — replaces it with a city-and-landmarks direction, true 3D, per this session's brief. The mechanical work in that doc's Phase 1 (stacks, vacuum, cascade) and Phase 2 (meta-progression) is NOT superseded — it's a load-bearing prerequisite folded into this plan (§6). Companion: `docs/genre-research.md`, cited throughout as GR §n.*

*Fidelity decision (confirmed with Nico, 2026-07-22): true 3D via Three.js with a real chase camera, not a 2D isometric reskin. This is a full engine rewrite, not a retheme — flagged explicitly, not hidden.*

---

## 0. What this replaces, and why

Today's game is a top-down 2D canvas hole.io clone: a flat colored grid, camera locked directly overhead, and CRM-themed emoji (👤📇🏢🗄️) scattered uniformly at random, floating in place with no environment around them. That's the "bubbles floating around meaninglessly" the setting review needs to fix — there's no place, nothing for the eye or the fiction to anchor to.

This plan replaces it with a true 3D, 3rd-person game: a chase camera behind a visible rolling entity, moving through real 3D city streets, across **10 distinct metros × 10 levels each = 100 levels**, each metro capped by a landmark the player grows big enough to swallow. Score targets scale quadratically exactly as specified.

---

## 1. Player & camera

- **The avatar.** The formless "hole" doesn't have a front/back, so a chase camera needs something to frame. Keep the vortex identity (it's already the brand — `logo-mark.png`, `hero-vortex.png`, the favicon) but give it a body: a swirling dark-matter orb, "The Devourer," rendered with a simple refraction/distortion shader, that flattens and stretches slightly under acceleration and turning so it reads as a rolling, physical thing from behind rather than a static hole-in-the-ground. No new mascot to design from scratch — this is a natural evolution of existing art, not a replacement of it.
- **Camera.** Classic 3rd-person chase rig: positioned behind-and-above the avatar, spring-following position and yaw toward the direction of travel (GTA/3D-platformer standard), with a raycast against building geometry so it pulls in rather than clipping through walls. Slight height/FOV increase as the avatar grows, so bigger = camera pulls back = more map visible (this also solves the current `zoom` logic at `index.html:875`, which already does something similar in 2D).
- **Controls.** Keep it simple — this is a hypercasual browser game, not an action-adventure controller scheme. WASD/arrows move avatar-relative-to-camera-facing (strafe/forward/back), pointer-drag as today's alternate input, camera auto-orients so no explicit "look" control is required. No jump/combat inputs — only movement, exactly like today.

---

## 2. World structure: 10 metros × 10 levels = 100

Ten stylized, non-literal homages to real cities (silhouette-recognizable landmarks, not exact licensed architectural reproductions — the same convention every game in this genre uses, hole.io included). Each metro = one art/asset budget item (palette, prop-kit recolor, skybox, one landmark model) reused across its 10 levels via districts, which is what makes 100 levels tractable to actually build (§5).

| # | Metro (stylized) | Districts (10 levels each) | Capstone landmark (level-10 boss) |
|---|---|---|---|
| 1 | Harbor Metropolis *(NYC-flavored)* | Suburbs → Downtown → Financial District → Harbor | Liberty Statue |
| 2 | Le Vieux Continent *(Paris-flavored)* | Old Town → Boulevards → Left Bank → Grand Avenue | Iron Lattice Tower |
| 3 | Old Fog Town *(London-flavored)* | Suburbs → City → Riverside → Parliament Row | Great Clock Tower |
| 4 | Neon District *(Tokyo-flavored)* | Backstreets → Shopping Ward → Tech Quarter → Neon Core | Sky Tower |
| 5 | Desert Spires *(Dubai-flavored)* | Outskirts → Marina → Financial Souk → Spire District | Mega Spire |
| 6 | Coliseum City *(Rome-flavored)* | Suburbs → Old Quarter → Forum → Amphitheater District | Grand Amphitheater |
| 7 | Carnival Coast *(Rio-flavored)* | Favela Edge → Beachfront → Downtown → Mountain District | Mountain Statue |
| 8 | Red Square Heights *(Moscow-flavored)* | Outskirts → Boulevard Ring → Old Town → Palace Square | Onion-Domed Palace |
| 9 | Harbor Opera Bay *(Sydney-flavored)* | Suburbs → Harbor Bridge District → CBD → Opera Point | Sail Opera House |
| 10 | Capital Prime *(fictional mega-capital, finale)* | Outer Ring → Mid-City → Government Quarter → Corporate Core | The Grand Portal Tower *(ties back to the Breeze-AI/"eat the whole platform" gag from the current finale)* |

**Keeping the CRM satire alive:** the comedy voice and brand jokes (`QUIPS`, `NOTIFS`, hub names) don't need to die with the emoji-object theme — they move into the environment as billboards, ad panels, radio-chatter floaters, and NPC office-worker one-liners ("Breeze AI" billboards, "Deals Closed Here" banners, a "HubSpot Tower" cameo building in Capital Prime). This is exactly the ask: cities *filled with advertising*, and the advertising is where the existing joke database gets to live on.

---

## 3. Difficulty math — turning "1k, 4k, 9k…" into an actual playable curve

**The score formula, exactly as specified:**

```
target(n) = 1000 × n²
```

| n | 1 | 2 | 3 | 6 | 7 | 10 | 20 | 50 | 75 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|
| target | 1,000 | 4,000 | 9,000 | 36,000 | 49,000 | 100,000 | 400,000 | 2,500,000 | 5,625,000 | 10,000,000 |

**The insight that makes level 100 completable, not absurd:** if the number of *objects* to eat also grew 10,000× by level 100, the game would be unplayable. It doesn't have to — only the *value* of objects needs to scale. Each level keeps roughly the same object-count/tier shape as today's levels (~120–150 objects, same 6–7 tier ladder), and every object's mass value is multiplied by a level scalar:

```
itemMass(tier, n) = baseMassForTier(tier) × n²
```

Because `target(n)` and every item's value scale by the same `n²`, **the number of objects a player must eat per level stays roughly constant across all 100 levels** — a level-100 skyscraper is just worth ~10,000× a level-1 trash can, not "10,000 trash cans." This is the direct answer to "not entirely sure how to calculate it": the quadratic formula sets the *target*, a matching per-item multiplier keeps the *pace* sane, and difficulty comes from everything else below — which is where "especially difficult after 6" actually lives.

**Round length grows every level, as asked** (`time(n)` — seconds per level):

```
time(n) = 60 + 6n
```

| n | 1 | 6 | 7 | 10 | 20 | 50 | 100 |
|---|---|---|---|---|---|---|---|
| time (s) | 66 | 96 | 102 | 120 | 180 | 360 | 660 |

**World size grows per metro, mildly within it** (bigger city footprint per later chapter, slight growth as you go downtown within one):

```
world(n) = 2400 + 250×(chapter(n)-1) + 15×levelInChapter(n)
chapter(n) = ceil(n/10)        // 1..10
levelInChapter(n) = n - 10×(chapter(n)-1)   // 1..10
```

**Where the actual difficulty comes from** (since object count per level stays flat, these are the real levers — tuned in explicit tiers, with the hard jump exactly at level 6→7 as requested):

| Tier | Levels | Rivals | Hazards | Capstone gate (min size to eat it) | Feel |
|---|---|---|---|---|---|
| Tutorial | 1–5 | 0 | none | — | Learn the systems |
| First Contest | 6–10 | 1 *(matches today's existing level-6 rival beat)* | none | 78% | First real threat |
| Escalation | 11–20 | 1–2 | introduced, light | 80% | Genuinely difficult begins |
| Expert | 21–50 | 2 | moderate | 85% | Real routing skill required |
| Master | 51–99 | 3, raid-AI (actively contest stacks, not just wander) | heavy | 92% | Brutal |
| **Capital Siege (100)** | 100 | 3 elite | full set | 95% | Hand-authored finale boss, the "level 4 of Donkey Kong" of the game |

All constants above (the `+6n`, `+250`/`+15`, the tier boundaries) are a **starting point for playtesting**, not final — but the mechanism (quadratic target + matching item-value scalar + independently-tuned world/timer/rival/hazard/gate curves) is the actual design, and it's what should get built and then tuned, not re-derived later.

---

## 4. Engine & rendering architecture

- **Three.js**, loaded via a vendored ES module + `<script type="importmap">` (npm-installed, copied into `assets/vendor/` by the build script) rather than a full bundler — keeps the project's existing "no build step to break" philosophy (`AGENTS.md`) as intact as a real 3D engine allows. A bundler (Vite) is a legitimate alternative if the frontend specialist implementing this wants proper hot-reload/dev-server ergonomics — it's free/open-source either way (rule 4), so this is implementation-time judgment, not a blocker now.
- **Scene composition:** instanced meshes for city props (hundreds of trash cans/cars/lamp posts/small buildings per level need to be one draw call per prop type, not one mesh each), a small shared prop-kit (~6–10 generic building/vehicle/street-furniture models) recolored per metro rather than modeled per metro, and exactly **10 unique landmark models** (one per capstone — the single largest bespoke-art line item in the whole plan).
- **Look:** low-poly, flat-shaded/toon aesthetic. This isn't a fidelity compromise — GR §5 is explicit that glance-readable silhouettes beat detailed art in this genre, and it's what keeps a 100-level asset budget tractable.
- **Swallow mechanic in 3D:** same distance-check logic as today's `objs.forEach` swallow loop (`index.html:766-800`), projected onto the XZ plane, plus a height/tier gate so a tall prop (bus, small building) additionally requires the avatar be "tall enough" — a direct 3D translation of the existing `o.r <= r*0.78` rule, not a new mechanic.
- **No physics engine.** Arcade-style distance/radius checks only, exactly like today — adding Cannon.js/Rapier would be scope creep with no gameplay payoff (this genre has never used real physics for the swallow check).

---

## 5. Content & asset pipeline

This is the part that makes "100 levels" achievable rather than a headcount fantasy:

- **10 metros, not 100 bespoke worlds.** Each metro is one palette + one prop-kit recolor + one skybox + one landmark. The 10 levels inside a metro vary by *district* (a different corner of the same city, using the same asset set) plus the formula-driven difficulty knobs from §3 — not by unique hand-built content. This tradeoff is deliberate and should be visible to Nico now, not discovered later: levels 41–49 will feel like "the same city, harder," not 49 individually designed levels.
- **Asset sourcing:** use the project's existing 3D pipeline (the `3d-blender`/`3d-web-assets`/`3d-environment` skills, and the Blender MCP tools already available in this session — Poly Haven for free textures/HDRIs, Sketchfab search for CC-licensed reference models, Hyper3D/Hunyuan3D generation for anything bespoke) to produce the avatar rig, the shared prop-kit, the 10 landmarks, and 10 skybox/lighting presets.
- **Landmark naming:** using real city/landmark names and recognizable-but-stylized silhouettes (Eiffel Tower, Big Ben, Statue of Liberty, etc.) is standard practice in this genre — hole.io's own map roster does the same. Flagged as a minor consideration, not a blocker.

---

## 6. Mandatory meta-progression (no longer optional)

`docs/redesign.md` Phase 2 (persistence, upgrades, level map, stars, collection album) was previously "proposed, not committed." **At 100 levels with quadratic targets, it's no longer optional** — there is no way for a player's raw skill alone to carry them from level 1 to level 100 without upgrades compounding underneath them. This plan makes it a hard prerequisite, not a nice-to-have:

- **`localStorage` save** (there is currently zero persistence anywhere in `index.html` — confirmed in `STATUS.md`), coins earned per level, and a world map (10 metro nodes → 10 level nodes each) replacing today's linear level list.
- **Upgrade tracks:** the proven three (Size, Speed, Magnet/attract-radius) from `redesign.md` §4, plus two new ones this scale demands — **Time Extension** (spend coins to add seconds) and **Growth Rate** (starting-mass carry-over between levels) — both directly load-bearing against the quadratic curve in §3.
- **Stars, per-level challenges, and the "Skyline-opedia"** — the existing `QUIPS` comedy database's new home, now cataloging city objects and billboards instead of CRM records, exactly as `redesign.md` §4 already designed for the Hoard-o-pedia.
- **Pity-assist:** after repeated fails on one level (genre-standard, GR §7), a small time or magnet bonus — necessary given how hard tiers 4–5 (§3) are meant to be, so "very difficult" doesn't tip into "unfair."

---

## 7. What's kept vs. retired

| Current system | Fate |
|---|---|
| Combo system, golden records, sync storms, rival holes, 11 achievements, comedy DB, Konami/`unsub`/`breeze` easter eggs, `?autostart=N` | **Kept**, remapped onto city objects/3D space per `redesign.md` §6 (still the correct mapping, theme-agnostic) |
| CRM/Hub emoji object taxonomy | **Retired** as the literal swallow-objects; **survives** as billboard/ad flavor text (§2) |
| Flat 2D canvas grid, top-down camera, single-`<script>` `index.html` | **Retired.** This is the actual rewrite — flagged up front, not discovered mid-project |
| `npm test` / `scripts/logic-test.js` | **Kept, heavily extended** (§8) |

---

## 8. Testing & tooling changes

- `scripts/logic-test.js` currently regex-extracts a single `<script>` tag — that assumption breaks once the engine is real ES modules. The suite needs to become module-import-based instead of regex-extraction-based.
- New headless checks needed: `target(n) = 1000n²` holds for all 100 levels; `time`/`world` formulas are monotonic; all 10 chapters have exactly 10 levels and one capstone; save/load round-trips; per-item-value × count sums land within a sane band of `target(n)` per level (the §3 pacing invariant).
- **Real WebGL rendering can't be headlessly regression-tested the way the current render smoke-test works.** Recommend keeping `npm test` to pure data/logic (fast, deterministic, CI-friendly) and doing visual verification as a separate manual gate via the `browser-playwright` skill against the live deployed preview URL (per the standing rule — never localhost).
- `AGENTS.md`'s current architecture description ("single `index.html` file... no framework, no bundler") will be factually wrong post-implementation — update it as part of Phase 0, not before (no point documenting a future state as if it already exists).

---

## 9. Phased roadmap

1. **Phase 0 — Engine foundation.** Stand up Three.js, import-map vendoring, basic 3rd-person camera + avatar movement in one placeholder city block; port the swallow mechanic to 3D. *Exit: avatar moves through a simple 3D block city with the right camera feel and can eat placeholder props.*
2. **Phase 1 — First metro, real formulas.** Build the prop-kit/landmark asset pipeline; ship Harbor Metropolis (levels 1–10) fully realized, with `target`/`time`/`world`/tier formulas parametrized by level index (not hardcoded per level like today).
3. **Phase 2 — Meta-progression.** Persistence, currency, all 5 upgrade tracks, world map UI, stars, Skyline-opedia. Required before more metros ship — 100 levels are unplayable without it (§6).
4. **Phase 3 — Scale to 10 metros / 100 levels.** Apply the parametrized formulas + per-metro art across all 10 cities; author the remaining 9 landmark capstones; wire the full rival/hazard tier table.
5. **Phase 4 — Juice, polish, regression.** Comedy remap into billboards/album, achievement expansion, easter-egg porting, perf passes (instancing/LOD/draw-call budget), full extended `npm test`, and a manual playtest pass against both the existing heuristics in `genre-research.md` §8 and one new one: *does level 100 feel like an earned capstone, or just a bigger number?*

Each phase is independently shippable, matching `redesign.md`'s own phasing philosophy.

---

## 10. Risks & open items flagged for Nico

- **This is a full rewrite, not a reskin** — the old single-file simplicity is gone; a new "how do I add a level" workflow needs its own short doc once Phase 1 ships.
- **100 levels ≠ 100 bespoke designs** — the content budget only works because 90 of the 100 levels are formula-driven district variants inside 10 authored metros (§5). That's a deliberate scope decision, stated here so it's a known tradeoff, not a surprise at level 43.
- **Exact difficulty constants in §3 need playtesting** — the mechanism is sound (quadratic target, matching item-value scalar, independently tiered world/timer/rival/hazard/gate curves); the specific numbers are a first pass.
- **Implementation should route through the standing delegation rule** once this plan is approved — 3D/frontend work to the relevant specialist agents/skills, not hand-built inline.
