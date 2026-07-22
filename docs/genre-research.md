# HubHole — Genre Research Synthesis

*Distilled from three research deep-dives (hole.io / black-hole subgenre, hoard-and-stack hypercasual, theme & meta-progression design). Sources kept inline for key claims. This is a synthesis, not a dump — conclusions and design takeaways live in `redesign.md`.*

---

## 1. Market context

- The "Eat & Grow" subgenre grew **+900% YoY in Q1 2025**; top-10 hybridcasual titles did **$87M net IAP** in that quarter alone ([gamigion](https://www.gamigion.com/hole/)).
- **All in Hole (Homa, 2024)** is the current benchmark: $17.7M net IAP in Q1 2025 — 84% of the whole subgenre's revenue — **$250–300K/day IAP**, with 70–80% of revenue from IAP rather than ads ([gamigion](https://www.gamigion.com/hole/), [FriendlyGameDev](https://friendlygamedev.com/game-reviews/all-in-hole/)). Earlier reports had it at $50K+/day IAP *while still in soft launch* ([gamigion](https://www.gamigion.com/all-in-hole-by-homa-games-already-scaled-to-50k-a-day/)).
- **Hole.io (Voodoo, 2018)**: 350M+ lifetime downloads, resurged to **500K+ downloads/day, 10M+ installs in March 2025**; ported to Xbox/Switch/PS as a $5–10 premium bundle ([gamigion](https://www.gamigion.com/hole/), [Wikipedia](https://en.wikipedia.org/wiki/Hole.io), [Sensor Tower](https://app.sensortower.com/overview/1389111413?country=US)).
- **Attack Hole (Homa/Redline, 2023)**: 100M+ lifetime downloads; built in 5 months after testing **70+ prototypes** ([Homa](https://www.homagames.com/games/attack-hole-redline-games), [holegame.io](https://holegame.io/attack-hole)).
- **Brutal hit rate**: of 240+ Eat & Grow titles, **only 7 ever exceeded $100K/month** (~3%). The mechanic alone is not enough ([gamigion](https://www.gamigion.com/hole/)).
- Kill gates for hypercasual: D1 retention ≥35–40% (kill if <30%), CPI < ~$0.35, D7 ≥15–22% hybrid vs 8–12% pure hypercasual. Average hypercasual D1 is under 25% ([Theseus thesis](https://www.theseus.fi/bitstream/10024/907423/2/An_Le.pdf), [Gamesforum report](https://investgame.net/wp-content/uploads/2025/07/Gamesforum-Intelligence-Hypercasual-Gaming-Report.pdf)).
- **Relevant tailwind for us**: post-ATT, the genre is actively migrating to browser/instant games ([PocketGamer](https://www.pocketgamer.biz/ouaz-games-on-surviving-hypercasuals-collapse-and-the-rise-of-browser-games/)). An HTML5 hole game is riding a real trend, not a dead one.

**Takeaway:** the winners (All in Hole, Attack Hole) differentiated on *structure* — level goals, payoff events, meta — not on the swallow mechanic itself. Pure hole.io clones die.

---

## 2. Genre lineage

- **Katamari Damacy** — the ancestor: size-tiered consumption, comedic item escalation.
- **Donut County** (Ben Esposito, 2018) — story-driven hole game. Two ideas worth stealing:
  - Each level ends when you swallow the **capstone object** (the house with its resident) — a built-in finale beat.
  - The **Trashopedia**: a collectible catalog of everything swallowed, organized by location, with joke descriptions ([Trashopedia wiki](https://donutcounty.fandom.com/wiki/Trashopedia), [GQ](https://www.gq.com/story/the-weirdest-game-of-2018-wanted-you-to-be-nothing-at-all)).
- **Hole.io** infamously cloned the Donut County concept pre-launch, stripped the story, added timed PvP ([Variety](https://variety.com/2018/gaming/features/donut-county-hole-io-apple-1202866615/), [Engadget](https://www.engadget.com/2018-07-11-mobile-clones-app-store-google-play-indie-voodoo.html)).

---

## 3. Title-by-title

### Hole.io (Voodoo, 2018) — timed battle-royale sandbox
- Drag-to-move hole on a city map; swallow objects smaller than the hole to grow; bigger hole unlocks bigger object classes. Oversized objects **physically wedge in the rim** and block — readable "not yet / now!" feedback ([Wikipedia](https://en.wikipedia.org/wiki/Hole.io)).
- ~**2-minute** rounds: Classic (7 holes, points), Battle Royale (~20 holes, last standing), Solo Run (eat ~100% of the map in 2 min), Team vs Team. "Multiplayer" is famously mostly bots ([WriterParty](https://writerparty.com/party/hole-io-all-modes-guide-how-to-win-in-classic-battle-and-solo-modes/)).
- **Optimal play is a strict size-gated sweep**: park (people, fences, bollards) → parking lot (cars) → small buildings → towers → enemy holes. Clusters of small items are the pathing anchor ([WriterParty](https://writerparty.com/party/hole-io-all-modes-guide-how-to-win-in-classic-battle-and-solo-modes/)).
- Meta (per the console-port walkthrough, mechanically faithful): coins buy **skins, maps (City, Office, Jurassic, Pirates, Mall, Western), power-up upgrades (magnet/speed/shrink/size, 6 tiers each), and sticker packs (81 stickers, 9 packs)**; per-match challenges ("swallow 10 skyscrapers", 600 coins) are the economy driver ([TrueAchievements](https://www.trueachievements.com/game/Hole-io/walkthrough)).
- Monetization: ad-first, aggressive interstitials; historically almost no meta — survived on scale, added events/meta only in the 2025 relaunch ([gamigion](https://www.gamigion.com/hole/)).

### Attack Hole (Homa/Redline, 2023) — two-phase collect → boss fight
- Level-based, not PvP. **Phase 1**: timed scavenger sprint (~15–30s, upgradeable) swallowing weapons off the floor. **Phase 2**: auto-resolving **boss fight** where the collected arsenal is dumped on a giant enemy; total damage = firepower swallowed. Not enough ammo → fail ([iofreeonline](https://www.iofreeonline.com/IOS/game/Attack-Hole-Black-Hole-Games.html), [ifanzine](https://www.ifanzine.com/attack-hole-guide/)).
- **Key innovation: items are inventory, not points** — what you swallow is literally ammunition for the payoff fight.
- Growth ring fills as you eat; full rotation = size up, unlocking bigger weapon classes **mid-level** ([holegame.io](https://holegame.io/attack-hole)).
- Ammo is placed in **dense homogeneous piles/racks** — passing over one triggers the signature cascade: items rattle in at high frequency, machine-gun pickup cadence. Pile size telegraphs the required size tier.
- Economy: coins fund between-level upgrades of **Size > Timer > Power** (time itself is purchasable). Fail recovery: after repeated boss fails the game offers a **magnet** — adaptive pity mechanic and a natural rewarded-ad slot.
- Monetization cautionary tale: heavy ad density + VIP subscription $6.99/week; works despite review-bombing ([iofreeonline](https://www.iofreeonline.com/IOS/game/Attack-Hole-Black-Hole-Games.html)).

### All in Hole (Homa, 2024) — hybridcasual puzzle structure, the benchmark
- Level-based with explicit goals (collect quota of target items) plus **hazard items — bombs that instantly fail the level if swallowed** ([gamigion](https://www.gamigion.com/hole/), [FriendlyGameDev](https://friendlygamedev.com/game-reviews/all-in-hole/)).
- Onboarding masterclass (documented minute-by-minute): Bigger Hole, **Magnet** and **Compass** unlock in minutes 0–5; Time Freeze at 5–10; first LiveOps event ~min 10; Lightning/Chrono boosters 10–20; first real challenge at level 19; bonus stage at 20; teams at ~20; bombs at 30–40 min; tournaments 40–60; first fail ~min 45 → first upsell. **37 levels cleared, ~2 ads in hour one** ([gamigion](https://www.gamigion.com/hole/)).
- Meta: lives/energy, boosters, battle pass, level chests, daily rewards, win-streak helpers, teams/chat, tournaments. A Toon Blast/Royal Match meta bolted onto a hole core — "connecting the core to progression is where the real design work happens" ([gamigion](https://www.gamigion.com/all-in-hole-by-homa-games-already-scaled-to-50k-a-day/)).
- **First upsell lands at the first failure**, framed as a solution, not an interruption.

### Hole and Fill / Collect Master (Homa, 2023) — theme-as-container
- Each level is a **container to fill** (fridge, makeup case, stationery drawer); the map is littered with exactly the items that belong in it. Swallowing = sorting ([TopGames](https://www.topgames.com/Hole-And-Fill-Collect-Master), [App Store](https://apps.apple.com/us/app/hole-and-fill-food-hoarding/id6447110104)).
- Top complaint: **aggressive interstitials interrupting flow** — ad density kills the fantasy ([Marlvel](https://marlvel.ai/apps/hole-and-fill-food-hoarding)).

### Hoard Master / Arcade Hole (Rollic) — the sell-pad variant
- Hole swallows items into a visible hoard, then **sells the haul at a sell point**; earnings buy hole size/speed upgrades. Adds a "deliver your haul" beat ([updatestar](https://hoard-master.updatestar.com/), [Aptoide](https://arcade-hole.en.aptoide.com/app)).

### Crowd City (Voodoo, 2018)
- Same template, different body: 2-min rounds, recruit pedestrians, absorb smaller crowds. Confirms the Voodoo formula: **single-resource growth + size-asymmetry PvP + 2-min timer + bots** ([GamingonPhone](https://gamingonphone.com/guides/crowd-city-guide-how-to-make-the-biggest-crowd/)).

### Stack games (adjacent, for stack-payoff design)
- **Stacky Dash** (Supersonic): tiles vacuumed into a stack under you are **spent as bridge planks**; leftover stack → treasure chest. The greed hook ([Games.lol](https://games.lol/stacky-dash/)).
- **Cube Surfer** (Voodoo): the stack is your health/height; obstacles shave cubes one at a time; leftover stack climbs an **end-of-level multiplier staircase** ([GBHBL](https://www.gbhbl.com/game-review-cube-surfer-mobile-free-to-play/)).
- **Arcade idle** (Farm Land, Burger Please, My Mini Mart): comically tall stack on the avatar's back unloads **item-by-item into cash** at the sell point — never a lump sum. The stacking tower is both the satisfaction driver and the top-performing ad creative ([Udonis](https://www.blog.udonis.co/mobile-marketing/mobile-games/arcade-idle)).
- **My Perfect Hotel** (SayGames): 133M downloads; each new zone resets the economy with **its own colored currency**, deliberately invalidating stockpiled wealth and re-hooking the loop ([ARPU Brothers](https://arpubrothers.com/blog/my-perfect-hotel-arcade-idle-deconstruction/)).
- **Fill The Fridge** (Rollic): 84.7M downloads riding the TikTok restock/ASMR trend; item *recognizability at a glance* beats art quality ([AppMagic](https://appmagic.rocks/blog/games-inspired-by-social-media-trends-part-3)).

---

## 4. The stack-gobble mechanic — the genre's dopamine unit

The single most evidence-backed finding across all three reports:

1. **Items are never consumed one at a time in isolation.** They're grouped (grid, line, rack, pile of 5–20 identical items), consumed in a fast cascade (~0.1–0.3s per item), with pickup SFX pitch rising per successive intake.
2. **Stacks serve four roles at once**:
   - *Readability* — pile type/size telegraphs the required hole tier from a distance.
   - *Pacing* — a full-stack gobble is a burst of growth that carries you across a tier boundary.
   - *Juice* — cascading physics tumble-in + rapid pickup cadence + growth ticks.
   - *Routing* — clusters define an optimal size-ascending path = implicit soft gating without walls.
3. **The accumulated haul is cashed out in a second, bigger spectacle** — boss fight (Attack Hole), multiplier staircase (Cube Surfer), sell-pad coin fountain (arcade idle), filled container (Hole and Fill). "Gobble → spend" beats "gobble → number grows." This two-stage payoff is the key innovation over hole.io.
4. **Contrast is the audio dynamic**: tick-tick-tick of a stack vs. the heavy *thunk* + screen shake of a finally-unlocked large object.
5. **Showcase beat rule**: at least once per level, place one large dense same-item stack the player is *exactly* big enough to clear in one continuous sweep. Script camera/particles to peak there.

**Performance caveat**: mass-swallow moments spike active objects; stutter during the money moment drew real review complaints for Attack Hole on old devices ([iofreeonline](https://www.iofreeonline.com/IOS/game/Attack-Hole-Black-Hole-Games.html)). Pooled particles and capped object counts are mandatory on canvas.

---

## 5. Theme ↔ item mapping patterns

- **Theme = item taxonomy + map layout + objective, shipped as a set.** Reskin-only themes are the failed-clone pattern.
  - City (hole.io): open streets; parks = small-item clusters; car parks = mid clusters; skyscrapers = capstones.
  - War base (Attack Hole): bullets < pistols < rifles/grenades < heavy guns < artillery; items *are* the boss ammo.
  - Kitchen/pantry (Hole and Fill): groceries feeding shelves; the container is the goal.
  - Island-hopping (Stone Grass): mow an island 100% clean, travel to the next; density is the content.
- **4–6 size tiers per level**, visually distinct by silhouette and size step so "can I eat this?" reads at a glance. Strong silhouettes were Voodoo's own art-test criterion ([ArtStation](https://www.artstation.com/artwork/4N2JbW)).
- **Items must function in the objective** (ammo → boss DPS; food → filled shelves; people → cash) — this is what separates the winners from reskins.
- **Cluster zoning beats hard gates**: small-item "parks" at spawn, mid clusters adjacent, capstones at edges/center. Creates a learnable optimal route with zero tutorial text.
- **Telegraph the next unlock in-world**: one visible cluster of "too big" premium items from spawn; the return-sweep after growing is the best moment in these games.
- Everyday/relatable themes (food, money, office, farm) drive cheap UA and instant comprehension; ASMR-adjacent organizing fantasies (fridge restock) rode social trends to 80M+ downloads.

---

## 6. Level structure & pacing

- Two dominant structures: (a) hole.io's single open arena reused across modes, density-zoned by district; (b) Homa's discrete compact levels cleared in 15–60s.
- **Universal rhythm**: dense small-item clusters in the first 10–20s (guaranteed instant growth) → mid-tier sweeps → capstone/boss climax → reward screen → upgrade spend. All three Homa titles agree on the front-loaded feast.
- **End every level on a climax, never on "timer ran out"** — Donut County's capstone-object rule; Attack Hole's boss.
- Growth within a level is steep (hole.io: trash can → skyscraper in 2 min); between levels, persistent upgrades carry power.
- **Completion % as skill score**: hole.io Solo mode's "eat ~100% in 2 min" makes near-total consumption possible only with optimal routing — replayability for free.
- Hazards (bombs adjacent to goal items) arrive only after basics are learned (~level 20+ / 30–40 min in All in Hole) to convert mindless sweeping into precision routing.

---

## 7. Meta-progression & retention

- **Minimum viable economy (proven 3-track):** hole size, timer/speed, item value/income. Every hole clone uses it; don't invent more axes until retention data demands it.
- **The highest-leverage move:** wrap the hypercasual core in a casual meta — level map with nodes, boosters, fail states, win streaks, timed events (All in Hole took the same core from ad-revenue to $50K/day IAP).
- **Per-level challenges** ("eat 15 police cars" = 600 coins) — cheap to generate, drive replays, force engagement with themed item types.
- **Collection album** — hole.io's sticker packs (81 stickers) prove even shallow versions retain; Donut County's Trashopedia is the aspirational version and a natural fit for themed levels.
- **Unlock cadence**: one new system every 3–5 levels (magnet → compass → time-freeze → bonus stage → streak helper → hazards → tournaments).
- **Pity/recovery mechanic** (magnet offer after repeated fails) retains weak players.
- **Prestige/reset per world**: each new themed map re-colors the currency so wealth doesn't trivialize new content (My Perfect Hotel).
- **Time is a currency**: purchasable timer extensions (Attack Hole Timer upgrade) — the genre's cleanest monetization loop.
- **Live-ops lite**: rotating challenge sets and timed events on the level map are the highest-ROI retention layer after launch; architect levels to support reskinnable events.

---

## 8. Monetization patterns (reference — HubHole is currently free)

- Ad-first volume model (hole.io, Attack Hole): interstitials between levels, rewarded ads for extra time / revive / 3× coins; remove-ads IAP $4–10; weekly VIP subs.
- IAP-first hybrid (All in Hole): no ads for ~50 min, lives, boosters, battle pass; first upsell at first failure. Optimum ad/IAP mix ~70/30 ([AppMagic](https://appmagic.rocks/blog/hybridcasual-q1-2025/?hl=en)).
- Discipline rules: **interstitials only between levels, never mid-run** (Google Play policy and the #1 player complaint); rewarded ads appear *at friction points* (out of time → +15s; under-powered at boss → ammo pack); session 1 ≤1 interstitial; fail-offer bundles ("Turning Failure into Revenue", [AppMagic](https://appmagic.rocks/blog/fail-offers)).
- Web analog: rewarded-video-for-multiplier and between-level interstitials via ads.txt networks; "remove ads" IAP where portals support payments.

---

## 9. Game-feel / juice catalog (genre-wide)

Grounded in the reports plus juicy-design research ([INRIA juicy design study](https://inria.hal.science/hal-04144377v1/document)):

- **Vacuum/magnet pull** — the most-praised juice element in the genre: visible pull radius, items lean, slide and stream into the hole. Magnet upgrades are the most desirable power-up across titles.
- **Cascade intake** — rapid tick-tick-tick with rising pitch during stack consumption; cascading physics tumble.
- **Heavy thunk + screen shake** on tier-up-size items; contrast with the light ticks is the core audio dynamic.
- **Growth ding** on size-up; growth ring/bar around the rim doubles as progress UI.
- **Wedge feedback** — oversized objects visibly jam in the rim = readable fail state.
- **Suction trails** toward the hole; per-item tilt/wobble/slide physics ("objects getting sucked into the void provides a great sense of scale and power" — [iofreeonline](https://www.iofreeonline.com/IOS/game/Attack-Hole-Black-Hole-Games.html)).
- **Unload spectacle** — stack-to-cash conversion renders per-item coin bursts, never a lump sum.
- **Slow-mo + confetti on capstone/boss kill.**
- **Haptic taps per swallow** on mobile.
- **Juice discipline**: exaggerated *redundant* AV feedback on events, but keep baseline play visually clean — constant juice dulls it.

---

## 10. Consolidated takeaways (input to `redesign.md`)

1. Two-stage payoff: every level needs a functional item sink (boss, container, payout) — the single biggest lever over a pure hole.io clone.
2. Stacks as first-class objects: dense homogeneous piles, cascade intake, rising-pitch SFX, tier-crossing growth bursts.
3. Theme = items + layout + objective as a set; 4–6 silhouette-readable size tiers per level.
4. Three-act level pacing: spawn feast → mid-tier sweeps → capstone climax. End on climax, never on timeout.
5. Soft-gate via cluster zoning; telegraph the "too big" cluster from spawn for the return-sweep moment.
6. Minimal meta: 3 upgrade tracks (size / time-speed / magnet) + level-select map + stars + challenges + collection album; localStorage-class persistence suffices.
7. Magnet is the first and most-loved unlock; hazards only after mastery; pity mechanic after repeated fails.
8. Budget performance for mass-swallow: pooled particles, capped bodies — protect the money moment.
9. One scripted "clear the whole stack in one sweep" showcase beat per level.
10. Completion % per level = free replayability.
