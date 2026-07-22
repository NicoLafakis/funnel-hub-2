# HubHole — Redesign & Expansion Proposal

*Internal design doc. Companion to `docs/genre-research.md` (cited throughout as GR §n). Where research supports a claim, it's marked; where it's my call, I own it.*
*Current implementation references use the section/function names in `index.html` (1074 lines, single file).*

---

## 1. North star

**HubHole becomes a level-based "gobble-and-cash-out" arcade game: each level is a themed place stuffed with satisfying stacks of themed junk; you vacuum it up stack by stack, grow through 4–6 size tiers, and spend your haul on a spectacular end-of-level payoff. Between levels, a light meta (upgrades, level map, collections, stars) makes "one more level" the default answer.**

Today the game is a competent hole.io-flavored sandbox: uniform random scatter, mass target, timer. The research is unambiguous that scatter + points is the *failed-clone* pattern (GR §1: 7/240 breakout rate). The winners add three things we currently lack: **stacks** (the genre's dopamine unit), a **payoff event** (items-as-ammunition → boss/payout), and a **meta loop** (upgrades + progression). Those are the three pillars of this redesign. Everything we already have — combos, rivals, storms, golden records, achievements, comedy — survives and gets remapped onto them (§8).

---

## 2. Thematic directions

Three candidates. Each ships theme = item taxonomy + map layout + objective **as a set** — the research's core theme rule (GR §5). Item tables use the same shape as today's `LEVELS` entries: `[emoji, radius, mass, count]`, tiers ascending.

### Option A — "Archipelago" (island-hopping worlds) ★ RECOMMENDED

A hole opens in a tropical archipelago and eats its way from beach towel to volcano island. Island-hopping gives a natural world-map meta (Stone Grass proved "clear an island 100%, sail to the next" — GR §6) and fresh, instantly readable item sets per island. Worlds: each world = 3–4 levels on one island group with its own capstone.

| Level setting | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 | Tier 6 (capstone) |
|---|---|---|---|---|---|---|
| 1. Sunny Beach | 🐚 shell | 🩴 flipflop | 🍹 drink | 🏖️ umbrella | 🏄 surfboard | 🛥️ yacht |
| 2. Tiki Village | 🥥 coconut | 🌺 flower | 🥁 drum | 🗿 tiki | 🛖 hut | 🌋 idol shrine |
| 3. Pirate Cove | 🪙 coin | 🍾 bottle | 🗡️ cutlass | ⚓ anchor | 💰 chest | 🏴‍☠️ galleon |
| 4. Jungle Ruins | 🍌 banana | 🐸 frog | 🦜 parrot | 🧱 relic | 🛕 temple | 🐆 jaguar idol |
| 5. Volcano Finale | 🪨 rock | 🔥 ember | 🌋 boulder | 🐉 lava beast | 🏔️ peak | 🌋 THE VOLCANO |

- **Stacks**: beach-towel rows of shells, coin piles in the cove, banana bunches — every set has obvious pile formations.
- **Payoff sink**: each island ends by feeding the haul to the island's capstone (e.g. the volcano demands N mass of offerings, then erupts = level-win spectacle). Attack-Hole-proven structure, no weapons theme required.
- **Why it wins**: research favors bright, everyday, relatable themes with glance-readable items (GR §5); islands give built-in world-map progression and prestige-per-island resets (GR §7); it's ASMR-adjacent and screenshot-friendly; zero IP risk. It also fits the user's stated draw to "island" settings.

### Option B — "City Eats City" (hole.io's home turf, done better)

Evolve the classic city into distinct districts-as-levels, each with its own capstone building you must grow big enough to swallow (Donut County's capstone rule, GR §2).

| Level setting | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 | Tier 6 (capstone) |
|---|---|---|---|---|---|---|
| 1. Suburbia | 🗑️ bin | 📮 mailbox | 🚲 bike | 🚗 car | 🏠 house | 🏫 school |
| 2. Downtown | 🚶 pedestrian | 🚦 light | 🚕 taxi | 🚚 truck | 🏢 office | 🏙️ tower |
| 3. Funfair | 🎈 balloon | 🎯 booth | 🎠 horse | 🎡 gondola | 🎢 coaster | 🎪 big top |

- **Pros**: the genre's most proven theme; stacks = parked-car rows, crowd clusters; capstone = swallow-the-landmark moment.
- **Cons**: it's hole.io's exact visual territory — the failed-clone risk the research warns about (GR §1, §10). Differentiation must come entirely from structure.

### Option C — "HubSpot CRM" (current theme, evolved)

Keep the 10-Hub structure but convert every hub from scatter to stack-based layout and add payoff sinks. Example remaps:

| Hub | Tiers (small → capstone) | Stack formation | Payoff sink |
|---|---|---|---|
| Sales Hub | 💬 📅 📞 🤝 💰 📈 → 🏆 | deal pipelines = rows of 💰 | Feed the 🏆 President's Club trophy case |
| Commerce Hub | 🧾 💳 🛒 📦 🔁 💵 → 🏦 | cash stacks of 💵 | Crack the 🏦 vault (mass check) |
| Breeze AI (finale) | ✨ 🧠 🤖 🌐 → 🏙️ | agent swarms of 🤖 | Boss: the Portal Instance fights back |

- **Pros**: all current content (QUIPS, NOTIFS, LEVELS, art assets) stays usable; the comedy database is a real asset — per-object quips are exactly Donut County's Trashopedia charm.
- **Cons**: CRM iconography is weak for glance-readable tiers and weak for a broad audience; research shows everyday/physical themes outperform abstract ones (GR §5). The user has said they're not married to this theme — treat that as permission, not instruction.

**Recommendation: Option A (Archipelago)**, with Option C's voice and jokes ported over (the Trashopedia-style collection, §5, is where the comedy survives). Option A is the best match for the user's stated interests (island settings, stacks), the strongest meta fit (island map = saga map for free), and the cleanest break from the clone-risk zone. If the owner wants to keep the CRM gag, Option C is a legitimate second choice and the cheapest to ship — but it's a defensible-content decision, not a genre-optimal one.

*The rest of this doc is written theme-agnostic; tables above plug straight into `LEVELS`.*

---

## 3. Core mechanics changes

### 3.1 Stacks (the headline feature)

**Placement.** Replace uniform scatter (`spawnObj` positions fully random today) with cluster generation in `buildLevel`:

- Each level defines **3–6 stack clusters** plus light ambient singles (~20% of items).
- Stack shapes: `pile` (dense disc of 8–16 same-tier items), `row` (line of 6–10), `grid` (4×4). One line of code change in data: `stacks:[{tier:1, shape:'pile', n:12, x,y}, ...]` per level, generated procedurally with a minimum separation from spawn and from other clusters.
- Composition is homogeneous (same emoji per stack) — that's what makes the gobble read (GR §4).
- **Showcase rule (from GR §4/§10):** every level places exactly one "hero stack" the player is *exactly* big enough to clear ~40% through the level — script it so a full clear crosses a size tier.

**Rendering.** Stacks render as tidy formations (slight jitter + bob, reusing `o.wob`). Items in a stack get a subtle darker ground shadow ring so piles read as piles from a distance. Add a size-tier badge language: items too big for the player render slightly desaturated/darkened; edible items get the existing teal glow ring — extends today's `o.r<=hr*0.78` glow (index.html:925) from per-item to per-stack silhouette readability.

**Eating — the cascade.** Current swallow is a distance check per item (index.html:774). Add:

1. **Vacuum attract radius** (`attractR = r * 1.9`, upgradeable): edible items within the radius get pulled toward the hole (`o.vx/vy` lerp toward hole, force falls off with distance). Items lean/tilt toward the hole while being pulled — reuse `o.spin`.
2. **Rapid multi-eat**: cap intake at ~14 items/sec with a 60–80ms stagger so a stack rattles in *clack-clack-clack* rather than vanishing in one frame. Implement as a small intake queue drained in `update`.
3. **Escalating pitch ladder**: consecutive eats within 0.4s raise gulp pitch one semitone each (reset on gap) — modify `AudioSys.gulp` to take a step index. This is the genre's signature sound moment (GR §9).
4. **Stack-clear bonus**: clearing a full stack in ≤2.5s fires `banner("STACK CLEARED!")`, a shockwave, and +25% mass on that stack. This replaces some of today's reliance on the generic combo system for the dopamine peak.

### 3.2 Size-tiered object classes

Formalize what `LEVELS.objs` already implies: tiers 1–6 per level with strict radius steps (~1.4× per tier, current data already roughly follows this). Add to each level a `tierGate` rule: item edible iff `o.r <= holeR()*0.78` (unchanged formula), but make the *ladder visible*: a growth progress ring around the hole rim showing distance to next tier ("eat 3 more to unlock 🏖️"). Research: the fill-ring → size-up → "now I can eat THAT" beat is the in-level progression engine (GR §3, §6).

### 3.3 Area gating by hole size

Soft gating via cluster zoning (research-preferred over walls, GR §5):

- Spawn area seeded with tier-1–2 stacks (the guaranteed 10–15s feast — all three reports agree).
- Mid tiers clustered a screen away; the hero stack visible from mid-map.
- Capstone + one "too big" premium cluster placed at the far edge, visible early, deliberately un-edible at spawn. The return-sweep after growing is the best moment in these games — design for it (GR §4).
- Optional hard-gate later: bridges/gaps between island zones that require tier ≥ N to cross. Defer to Phase 3.

### 3.4 Level pacing structure (three-act, 75–90s)

Today's `target`/`time` model stays, restructured:

1. **Act 1 (0–15s):** spawn feast — 3 small stacks within one screen. Guaranteed visible growth.
2. **Act 2 (15–55s):** mid-tier sweeps, rival interference (where enabled), sync storm mid-level, hero stack moment ~60% mark.
3. **Act 3 (55–end):** capstone unlock + payoff event (§3.5). Win condition becomes **capstone consumed** (Donut County rule) rather than bare mass target; mass target remains as the gate to *be able* to eat the capstone. This directly fixes "timer ran out" being the dominant level ending (GR §6: end on climax, never timeout).
4. **Completion %** tracked (mass eaten / mass spawned) → 1–3 stars per level (≥60/85/100%). Free replayability (GR §6).

### 3.5 Boss / finale moments (the payoff)

Research-backed: Attack Hole's items-as-ammunition boss is "the single best idea in the genre" (GR §3, §10). Two implementations, both scoped to canvas-feasible:

- **Per-level payoff (Phase 2):** the capstone is a "boss object" with a mass-price displayed over it (e.g. 🌋 500). When eaten, it triggers a 3–4s spectacle: slow-mo, screen shake, particle storm, banner, mass fountain of floaters. Cheap, high value.
- **Per-world boss (Phase 3):** on each world's final level, mass eaten in the level = damage dealt to an animated boss (volcano idol / kraken / portal instance). Auto-resolving 15–20s fight after the collect timer: your haul fires at the boss; insufficient haul = fail + pity magnet offer. This is the Attack Hole loop transplanted; it's the biggest swing in the roadmap and fully optional per world.

### 3.6 Golden / jackpot items evolution

Golden records (today: 1–2 per level, 8× value, `buildLevel` index.html:459-466) become:

- **Golden tier-variants**: one stack per level contains a golden item; eating it converts the *rest of the stack* to golden (double value) for 5s — a mini-frenzy.
- Keep the roaming 8× solo golden as-is; it's good.
- New: **jackpot stack** — a rare golden pile worth a star-rating boost; appears on replay runs to keep completionists hunting.

### 3.7 Hazards (Phase 3, only after mastery)

Bombs 💣 interleaved into stacks from level ~6+: swallowing one costs mass + combo reset (not instant fail — All in Hole's instant-fail bombs are tuned for monetized revives we don't have). Placement adjacent to goal stacks converts late-game sweeping into precision routing (GR §6). Explicitly deferred: don't ship before players have mastered stacks.

---

## 4. Meta-progression (single-file scoped)

**Confirmed against code: there is currently NO persistence — no localStorage usage anywhere in `index.html`.** All state (`S`, `achUnlocked`, `S.totalMass`) resets per session. Adding `localStorage` is safe, small (~40 lines), and unlocks the whole meta layer.

Persist a single JSON blob `hubhole.save.v1`:

```json
{ "coins": 0, "stars": {"1":3}, "upgrades": {"size":1,"speed":1,"magnet":0},
  "unlocked": 4, "collection": {"🐚": 12}, "ach": ["first"], "bestCombo": 21 }
```

- **Currency — coins**: earned per level (mass/10 + star bonus + stack-clear bonuses). Spent in a between-levels **Shop overlay**.
- **Upgrade tracks (the proven 3, GR §7)** — 5 tiers each, linear cost:
  1. **Bigger Maw** — start each level +N mass (faster Act 1).
  2. **Swift Current** — +8% move speed per tier (touches the movement block, index.html:748-762).
  3. **Magnet Core** — +15% attract radius per tier (tier 0 = attract radius barely larger than rim; first unlock is the most-loved juice in the genre, GR §9).
- **Level-select map**: a simple world-map overlay (canvas or DOM grid of nodes; stars shown per node; next node pulses). Unlocks linearly. This is the All in Hole saga-map pattern at HTML5 scale.
- **Collection album ("Hoard-o-pedia")**: every item type ever eaten is logged with a count and a one-line joke — Donut County's Trashopedia (GR §2) and the natural home for the existing `QUIPS` database. One scrollable overlay; entries unlock on first eat. Cheap, beloved, uses content we already wrote.
- **Per-level challenges**: 2 per level ("clear 5 stacks", "eat the golden item", "finish with 20s left") → bonus coins. Cheap retention engine (GR §7).
- **Skins**: hole rim color/vortex style purchasable with coins (recolor `drawHole` rim + arm hue — 3-line change per skin). Defer most skins to Phase 3.
- **Prestige-lite**: per-world coin "re-coloring" (shells on island 1, doubloons in the cove…) is the My Perfect Hotel trick (GR §7) — *optional*, only if worlds ship; skip for v1.
- **No monetization** in scope: HubHole is a free web toy. The ad/IAP patterns in GR §8 are documented for future portal deals only; the design principle worth stealing regardless is *relief at friction* (pity magnet after 3 fails on a level — auto-granted, no ad).

---

## 5. Game-feel / juice upgrade list

Grounded in GR §9. Current juice (shockwaves, particles, shake, spaghettify falls, vortex) is already good — keep it. Add, in priority order:

1. **Vacuum lean + stream**: items in attract radius tilt toward hole and accelerate in with a suction trail (short alpha line). The most-praised juice in the genre; currently absent.
2. **Cascade cadence**: intake stagger (§3.1) + rising semitone gulp ladder. Audio is half the mechanic (GR §4).
3. **Tier-up pop**: crossing a size tier → growth ding (`AudioSys.grow` exists — actually fire it on tier-up, today it fires per big item), rim flash, brief zoom pulse on the camera.
4. **Heavy thunk**: new `AudioSys.thunk` (low noise burst + sub sine) + shake scaled by `o.r` for tier ≥4 items. Contrast vs. light ticks is the core audio dynamic.
5. **Stack-clear celebration**: shockwave + confetti burst + `STACK CLEARED` floater with the stack's emoji.
6. **Capstone slow-mo**: on capstone eat, 0.6s of `dt*0.25` slow-mo + max shake + shock ring. Climax punctuation (GR §9).
7. **Wedge feedback**: when the player overlaps a too-big item, it visibly bumps/rocks and shows a small "🔒 grow more" floater once per few seconds. Readable "not yet" (GR §3).
8. **Coin fountain on level end**: mass→coins conversion renders as per-item flying coin floaters on the done screen, not a lump sum (GR §9).
9. **Growth ring HUD**: ring around the rim filling to next tier (§3.2) doubles as progress UI.
10. **Juice discipline**: baseline play stays clean; all the above fires on events only. Constant juice dulls (GR §9).
11. **Perf guardrails for the money moment**: particle pool already capped at 320 (`burst`, index.html:532); keep falls ≤40 concurrent (drain queue rate-limit does this); skip suction trails beyond 60 active pulls; cap shake. Stutter during mass-swallow killed reviews for Attack Hole (GR §4) — protect the cascade.

---

## 6. What to KEEP (current features → redesign mapping)

| Current feature (code ref) | Fate in redesign |
|---|---|
| Combo system + tiers (`comboMult`, `COMBO_TIERS`, index.html:436,332) | **Keep**, re-tuned: pitch ladder + stack-clears feed combo; combo tiers get per-theme names. |
| Golden records (`buildLevel` golden block, :459) | **Keep + evolve** per §3.6. |
| Sync storms (`stormT` block, :715-731) | **Keep** — rebranded per theme (e.g. "cargo drop"); now drops a pre-formed *stack* from the sky = storm IS a stack event. Storm Chaser achievement unchanged. |
| Rival holes (`rivals`, :803-839) | **Keep**, one change: rivals also raid stacks (they vacuum clusters), making them a real routing threat, and rival-eat bonus scales with rival mass, not just level. |
| 11 achievements (`ACH`, :333) | **Keep all 11**, persist to localStorage (today they reset per session — `achUnlocked` is in-memory only). Add: "Full Stack" (clear a hero stack in one sweep), "Hoarder" (50 album entries), "Perfect Island" (3★ a level). |
| Easter eggs: Konami, `unsub`, `breeze` (:595-637) | **Keep verbatim**; `breeze` summons become theme-appropriate spawns. |
| Comedy: `QUIPS`, `NOTIFS`, `FAIL_LINES`, size titles | **Keep all**, move per-object quips into the Hoard-o-pedia album as entry flavor text; retheme NOTIFS per world. This is the Option-C voice surviving inside Option A. |
| Vortex hole rendering (`drawHole`, :1013) | **Keep**; add skin hooks (rim hue, arm count/hue). |
| Spaghettify fall animation (`falls`, :936-944) | **Keep**; it now runs through the intake queue so cascades stagger. |
| Sprite caches, vignette cache, parallax bg | **Keep** — perf work already done; stacks reuse `badgeSprite`. |
| `?autostart=N` dev hook (:1070) | **Keep**; extend with `?save=reset` and `?level=N&coins=999` for playtesting. |
| `npm test` logic suite (`scripts/logic-test.js`) | **Keep + extend**: add checks for stack placement (min separation, hero stack exists), intake queue cap, save/load round-trip. |

---

## 7. Phased implementation roadmap

Tasks reference actual `index.html` sections/functions. Each phase is shippable on its own.

### Phase 1 — Stacks & feel (highest impact / lowest risk; no persistence, no theme change)

1. **Cluster spawner**: rewrite the spawn loop in `buildLevel` (:448) to generate stacks from a new per-level `stacks` spec (auto-generated from `objs` tiers if absent: 3 piles + 2 rows of tier-1/2, 1 pile of tier-3, hero stack rule §3.1). Add min-separation placement with retry.
2. **Vacuum attract**: in the player-swallow loop (:764), add attract radius pull + lean for edible items.
3. **Intake queue**: replace direct `falls.push` with a queue drained at ~14/s in `update`; stagger cadence.
4. **Pitch ladder**: `AudioSys.gulp(size, step)` semitone ramp; reset on 0.4s gap.
5. **Stack-clear detection**: tag stack members with `stackId`; on last member eaten within window → banner + shock + bonus.
6. **Wedge feedback** for too-big items (:773 area): bump + lock floater.
7. **Tier-up pop**: detect `holeR()` crossing tier thresholds; fire `grow()` + rim flash.
8. Extend `scripts/logic-test.js` for stack placement + queue caps.

*Exit criteria: clearing a stack feels like the research clips — rattle cascade, rising pitch, growth jump. 60fps with 3 stacks cascading simultaneously.*

### Phase 2 — Structure & meta (persistence, stars, shop, map, capstones)

1. **Save system**: `loadSave()/saveSave()` + `hubhole.save.v1` blob; wire `achUnlocked`, coins, stars, upgrades, collection.
2. **Capstone object**: per-level `capstone` def (emoji, radius, mass-price); placement at far edge; slow-mo eat spectacle; win condition becomes capstone-eaten (mass target retained as its price).
3. **Stars & completion %**: track spawned vs eaten mass; 1–3 stars; shown on `doneScreen`.
4. **Shop overlay**: 3 upgrade tracks (maw/speed/magnet) between levels; hook speed into movement (:748), maw into `buildLevel` starting mass, magnet into attract radius.
5. **Level-select map overlay** with node stars; replace linear `nextBtn` flow (:682).
6. **Hoard-o-pedia overlay**: collection log fed from eat events, flavor text from `QUIPS`.
7. **Per-level challenges** (2 per level) + pity magnet after 3 consecutive fails.
8. **Golden stack frenzy** (§3.6).
9. **Coin fountain** animation on done screen.

*Exit criteria: a returning player has visible progress (stars, album, upgrades); every level ends on a climax.*

### Phase 3 — Expansion (theme worlds, bosses, hazards — the big swings)

1. **Theme retheme** (if Option A approved): new `WORLDS` data (worlds × levels), new `LEVELS` entries per §2 table, per-level palette already supported (`bg`/`grid`/`dark`), new hub icons via `scripts/leonardo.js` pipeline.
2. **World bosses**: mass-as-damage finale per world (§3.5); 15–20s auto-fight; fail → pity offer.
3. **Hazards** 💣 in stacks from level 6+.
4. **Skins shop** (rim/vortex recolors via `drawHole` params).
5. **Rival stack-raiding** AI upgrade (:810-824 retarget logic prefers stacks).
6. **Live-ops lite**: rotating daily challenge (seeded RNG per date) — the architected-for-later retention layer (GR §7).
7. Optional: area gating v2 (size-gated bridges between zones).

### Phase order rationale

Phase 1 first because stacks + vacuum are the genre's proven dopamine core and touch only spawn/eat/audio — no UI, no persistence, no content rewrite; if nothing else ships, this alone transforms the game. Phase 2 adds retention (the research's highest-leverage meta move) while the theme is still CRM, so content work isn't double-done. Phase 3 is where the drastic retheme and boss fights land — by then the structure they plug into is proven.

---

## 8. Success metrics & playtest evaluation

No analytics backend; evaluate by structured playtest. Use `?autostart=N` and new `?save=reset`.

**Observable heuristics (playtester watch-list):**

- *The giggle test*: does the tester laugh or go "oooh" the first time they clear a full stack? If not, the cascade/juice isn't there yet. This is the genre's money moment — iterate until it lands.
- *Route emergence*: by level 3, does the tester naturally do small-stacks-first → hero-stack → capstone routing without instruction? If they're wandering, cluster zoning is wrong.
- *Return-sweep moment*: does the tester notice the "too big" cluster early and go back for it? If not, telegraphing (desaturation + lock floater) needs work.
- *Climax check*: does every level end with a visible event (capstone spectacle) rather than a fizzle? Timeout endings should be <30% of wins.
- *One-more-level*: at session end, ask "did you want to keep going, and why?" The answer should cite stars, the album, or an upgrade — i.e., the meta. If it cites nothing, Phase 2 failed.

**Numeric targets (from `npm test`-style harness + manual runs):**

- 60fps sustained with 3 simultaneous stack cascades (research: stutter in the money moment is fatal, GR §4).
- Act 1 feast: ≥2 size-tier gains in the first 15s of every level.
- Completion %: first-time win rate per level 60–80% (fail = friction for pity magnet, not churn); 3★ rate <20% (stars must mean something).
- Combo: hero-stack clear should reliably push combo ≥15 (a `DATA DEVOURER`+ banner moment per level).
- Save integrity: kill tab mid-level → reload → stars/coins/album intact.

**A/B questions to resolve in playtest before Phase 3:**

- Capstone win vs. mass-target win: which feels better? (Prediction: capstone, decisively — GR §6.)
- Attract radius default: too-strong magnet flattens routing skill; tune until Act 2 still requires deliberate pathing.
- Timer length: current 70–90s vs. Homa's 15–60s. Keep ours; our levels are bigger. Revisit only if Act 2 sags.
