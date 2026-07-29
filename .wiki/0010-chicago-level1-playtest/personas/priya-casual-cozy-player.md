# Playtest Report — Priya Raman (Casual Cozy Player)

**Game:** Flywheel V2 · Level 1 "The Loop — Chicago"
**Setup:** Laptop, keyboard + trackpad, 1440×900
**Evidence:** `shots/playtest/metrics.json` + 15 screenshots (`01-title` through `13-hud-strip`)

---

## Executive Summary

**Overall: 3.3 / 5.0 — Verdict: Charming shell, mumbly first minute.**

Okay, real talk: the title screen made me smile before I even clicked anything. That glowing wheel, the big friendly coral "SPIN IT UP" button, and the tiny legal line at the bottom — *"Not affiliated with HubSpot, Inc. · All records were harmed"* (`01-title.png`) — that's exactly my kind of humor. I felt like I was in good hands.

Then the game dropped me straight into a city at night with a hand pointing at some props saying "Eat the highlighted props!" (`04-spawn.png`) and… I mostly figured it out, because I've played hole.io on my phone. But here's the thing: the single best sentence in the whole game — *"Swallow anything smaller than your rim. That is the whole game."* — is on the intro card (`03-intro.png`), and I learned that card **only shows up on later visits**. On my actual first boot I never saw it. The game hides its own best teacher from brand-new players. That, plus a HUD that talks in spreadsheet ("Mass 8 / 1.00k"), a "0 collected" counter that never moved even while I was clearly eating things, and some genuinely murky street-level moments between the tall buildings (`08-building-large.png`, `09-vista.png`), kept me from falling in love. I'd play another level, but I'd be relying on hole.io muscle memory, not on anything this game taught me.

## Scores by Area

| Area | Score (1–5) | Note |
|---|---|---|
| First-Minute Clarity | 3 | Coach mark works, but no "how to move" prompt, no stated goal on fresh boot |
| Visual Charm & Beauty | 3 | Title screen 5/5; park spawn cheerful; street level between towers is dark and murky |
| Readability (text/contrast) | 3.5 | HUD pills are legible; "1.00k" is jargon; minimap is nearly unreadable |
| Feedback & Delight | 4.5 | Combo banners, toasts, "+1" floaters, "grow first" hints — genuinely delightful |
| Onboarding/Teaching | 2.5 | Best explanatory line skipped on first boot; Q/E camera never mentioned; timer unexplained |

## What Worked

- **The title screen is the best first impression I've had in a web game in ages.** Gradient wordmark, glowing wheel, one big button, one joke (`01-title.png`). No menu maze. I clicked "SPIN IT UP" without a shred of hesitation.
- **The spawn moment is close to perfect.** Green park, colorful little props, a pointing hand, "Eat the highlighted props!", a friendly blue ring around my hole, and a "Size 2" label (`04-spawn.png`). I knew what *I* was and roughly what to do within about three seconds.
- **Edible vs. decorative reads instantly in the park.** Bright, saturated props (cyan, purple, yellow) against gray buildings and green grass (`04-spawn.png`, `08-building-small.png`). I never once tried to eat a tree and felt dumb.
- **Eating feedback is a little party.** "🔥 DATA DEVOURER — x3 COMBO" banner, a toast saying "Logged. And gone.", floating "+1"s (`07-eating.png`, `06-after-orbit-180-w.png`). The comedy voice lands — it made me want to keep the combo alive.
- **The "no" feedback is gentle, not punishing.** "Too big — grow first" and "Grow to eat THAT 🌌" (`05-moving.png`, `08-building-medium.png`) tell me why something didn't work *and* what to do about it. I never felt stupid, which is my #1 dealbreaker in games.
- **Movement feels fine on keyboard.** Metrics show ~97ms to first move, clean stops, no drift, no errors (`metrics.json`). WASD and arrows both working is a kindness.
- **The intro card (when it exists) is a gem.** "Target: 1,000 mass · 75s", "Gold records glint. Eat one for 8× mass." (`03-intro.png`) — clear goal, clear timer, one fun tip. This should be every new player's first screen.

## Issues Found

### P1 — The core rule and the goal are hidden from first-time players

- **Impact:** High. A brand-new player who hasn't played hole.io gets a coach mark about *what* to eat but never learns the *rule* (smaller than your rim), the *goal* (1,000 mass), or the *timer* (75s) — all of which exist on an intro card they don't see.
- **Repro:** Fresh boot → press Start → dropped straight into Level 1 (`freshBootRoute: "straight-to-level-1"` in `metrics.json`). Intro card `03-intro.png` and world map `02-worldmap.png` only appear on later visits.
- **Expected:** First-time players see the intro card once — "Swallow anything smaller than your rim. That is the whole game." plus target and timer — before the clock starts.
- **Actual:** Straight into gameplay; the clearest sentence in the game is withheld from exactly the people who need it.
- **Evidence:** `metrics.json` (`freshBootRoute`), `03-intro.png`, `04-spawn.png`.

### P1 — "0 collected" never increments, even while eating

- **Impact:** High for a cozy player. My progress bar is my warm fuzzy. I ate enough to trigger an x3 combo and grow from Mass 8 to Mass 67, and the big counter top-left said "0 collected" the *entire time*. That reads as either a bug or as the game silently judging me.
- **Repro:** Play Level 1, eat props. Observe the "collected" pill in every gameplay screenshot.
- **Expected:** The counter increments as I eat, or is removed/renamed if it tracks something else.
- **Actual:** "0 collected" in `04-spawn.png`, `05-moving.png`, `06-after-orbit-180-w.png`, `07-eating.png`, all three `08-building-*.png`, `09-vista.png`, `10-ground-detail.png`, `11-full-hud.png`, `13-hud-strip.png` — while `metrics.json` shows mass growing 42→60 during the eating probe and the combo banner firing.
- **Evidence:** All gameplay screenshots listed above; `metrics.json` `eating` block.

### P1 — Camera rotation (Q/E) and movement keys are never taught

- **Impact:** Medium-high. I move with WASD by instinct, but the camera is half the control scheme in a 3D game. Nothing anywhere — not on the title screen, intro card, coach marks, or HUD — mentions Q/E, or even WASD. The one instruction I get ("Eat the highlighted props!") tells me the verb but not the controls.
- **Repro:** Fresh boot → read every overlay in `04-spawn.png` and `05-moving.png`. No control hints anywhere.
- **Expected:** A first-session hint line like "WASD to move · Q/E to spin the camera" under or after the coach mark.
- **Actual:** Silent. `metrics.json` proves Q/E rotates exactly 45° per press (`orbitStepE_deg: 44.5`) — a real, tuned feature that players will only find by mashing.
- **Evidence:** `04-spawn.png`, `05-moving.png`, `03-intro.png`; `metrics.json` `controls`.

### P2 — The HUD speaks spreadsheet: "Mass 8 / 1.00k", "Size 2", "0 collected"

- **Impact:** Medium. Three different numbers, three different vocabularies, none introduced. Is "Mass" the same thing as "Size"? Why "1.00k" instead of "1,000"? I'm a Candy Crush player — give me one big number that goes up and a star at the end.
- **Repro:** Read HUD in `04-spawn.png` ("Mass 8 / 1.00k", "Size 2" near player) and `13-hud-strip.png`.
- **Expected:** One progress readout ("8 / 1,000 eaten" or a filling bar), with "Size" explained or unified.
- **Actual:** "Mass 8 / 1.00k" — the ".00k" formatting is programmer-speak, and Mass vs. Size vs. collected is never reconciled.
- **Evidence:** `04-spawn.png`, `13-hud-strip.png`, `11-full-hud.png`.

### P2 — Street level between towers is murky and slightly scary

- **Impact:** Medium. Up high or in the park the city is cute (`04-spawn.png`, `08-building-small.png`). Down between the big buildings it turns into dark walls of purple and black filling half my screen — I couldn't tell where I could go, and the charm evaporates exactly when a new player is still learning the camera.
- **Repro:** Walk toward the large towers; see `08-building-large.png` (a giant unlit purple slab dominating the frame), `09-vista.png`, `10-ground-detail.png`, `11-full-hud.png`.
- **Expected:** Tall buildings stay readable silhouettes with some facade light or rim lighting at street level.
- **Actual:** Near-black and flat-purple masses; the "photoreal facades" that loaded fine (per `metrics.json` wiring, all `map=YES`) are invisible in the dark.
- **Evidence:** `08-building-large.png`, `09-vista.png`, `10-ground-detail.png`.

### P2 — The timer starts ticking with no explanation of stakes

- **Impact:** Medium-low but personal. A countdown at 71 seconds is already running in my *spawn* screenshot (`04-spawn.png`). I don't know what happens at zero — do I lose? Get one star? For a cozy player, an unexplained ticking clock is low-grade anxiety from second one.
- **Repro:** Fresh boot → watch the timer pill: 71 → 60 → 52 → 47 → 41 across `04`–`11`.
- **Expected:** On first boot, say "You have 75 seconds — eat as much as you can!" and what the reward/fail state is.
- **Actual:** Silent countdown. The 75s target only appears on the intro card fresh players skip.
- **Evidence:** `04-spawn.png` (71s), `05-moving.png` (60s), `11-full-hud.png` (41s), `03-intro.png` (75s target).

### P2 — Minimap is decorative, not informative

- **Impact:** Low-medium. It's a tiny dark square of cyan dots (`12-minimap.png`). I can't tell which dot is me, which way I'm facing, or where food clusters are. In hole.io-likes the minimap is how you plan your route; here it's confetti.
- **Repro:** Glance at bottom-right in any gameplay shot; close-up in `12-minimap.png`.
- **Expected:** Clear player marker with facing, and distinguishable prop/building zones.
- **Actual:** 96×96 field of near-identical dots.
- **Evidence:** `12-minimap.png`, bottom-right of `04-spawn.png`.

### P2 — Naming whiplash: "Harbor Metropolis" vs "The Loop · Chicago"

- **Impact:** Low but confusing. The world map says I'm in "Harbor Metropolis" (`02-worldmap.png`), the intro card mashes both ("Harbor Metropolis — The Loop · Chicago"), and my HUD banner says "LEVEL 1 - THE LOOP - CHICAGO" (`13-hud-strip.png`). Am I in a harbor or in Chicago? (Also, the intro card calls it "The Loop · Chicago, Harbor Metropolis" twice in one line.) `metrics.json` even records `levelLabel: null`, which suggests the game itself isn't sure.
- **Repro:** Compare `02-worldmap.png`, `03-intro.png`, `13-hud-strip.png`.
- **Expected:** One city name, one level name, used consistently.
- **Actual:** Two names interleaved everywhere.
- **Evidence:** `02-worldmap.png`, `03-intro.png`, `13-hud-strip.png`, `metrics.json` (`levelLabel: null`).

### P3 — Minor observations

- **31 fps average** on the test machine (`metrics.json`, `perfSpawn.fps: 31.1`). Playable, but on a cozy laptop the camera swings will feel a touch heavy. Not a dealbreaker.
- `metrics.json` shows `diagonal.stopAfterReleaseMs: null` — after a diagonal key release the driver never recorded a full stop. In-game I couldn't confirm a drift bug visually, but it's worth a look.
- "DATA DEVOURER" is fun but meaningless to me — combo names themed to what I'm actually eating (records? data?) only land after I understand the joke. Keep it, just know the first one flew over my head.

## Disqualifiers Triggered

**None.** No crashes, zero console errors (`metrics.json: "errors": []`), all textures loaded, controls respond and stop cleanly, nothing made me feel stupid. Every issue above is polish/onboarding, not a broken game.

## Recommendations

1. **Show the intro card on first boot too.** One screen — rule, goal, timer, one tip — then "DIVE IN". Highest-impact, cheapest fix. (`03-intro.png` already exists; just route fresh players through it.)
2. **Fix or remove "0 collected".** A cozy player's trust lives in that counter. If it tracks something other than eating, rename it; if it's broken, this alone justifies a patch.
3. **Add one controls line to the first-session coach mark:** "WASD / arrows to move · Q/E to spin the camera." Fifteen characters of empathy.
4. **Humanize the mass readout:** "8 / 1,000" with a filling bar; reconcile "Mass" vs "Size" into one word.
5. **Lift street-level lighting near towers** — rim light, window glow, anything — so `08-building-large.png` stops looking like a void. The facades are loaded; let us see them.
6. **Say what the timer means** on first play: 75 seconds, what happens at zero, what a star costs.
7. **Give the minimap a player arrow** and drop the dot noise; or shrink its visual priority until it earns its space.
8. **Pick one name** for the city/level and use it in the world map, intro card, and HUD.

## Would You Keep Playing?

**Maybe — leaning yes, with conditions.** If the intro card shows on first boot and the "collected" counter actually moves, I'd happily put this in my weeknight rotation — the eating feels good, the jokes land, and the title screen promises a game made by people with taste. But as it stands, my first session ended with me having fun *despite* the onboarding, not because of it, and staring at "0 collected" after an x3 combo left a little splinter of "did I do that wrong?" that a cozy game should never leave behind. Fix those two things and it's a yes.
