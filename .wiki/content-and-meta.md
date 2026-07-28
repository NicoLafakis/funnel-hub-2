# V2 Content & Meta-Progression

## 1. The 100-level curve, re-authored

Each metro now contains two five-level arcs: teach, reinforce, pressure,
combine, test. Unlocks make mechanics available for authored combinations;
they no longer force every mechanic into every later district. Normal clocks
repeat 75/80/85/90/95 seconds. Seed-calibrated ordinary-mass coefficients in
`formulas.js` keep the no-upgrade route inside 55–80% of the clock.

V1's curve is one formula (1000n²) with per-tier knobs — mathematically
clean, emotionally flat. Levels blur together because nothing *new* happens
after level 21 except bigger numbers. V2 keeps the skeleton (10 metros ×
10 districts, same target curve) but authors **beats** onto it:

- **Unlock cadence:** something mechanical arrives every 3–5 levels, not
  every 10–20. Current empties get filled: goldens (L1), rivals (L6),
  storms (L11), Duelist rival (L16), moving props (traffic! cars/buses
  drive the roads, L21), mega-props (L26), daily unlock (L31), hazard
  cargo drops (L36), rival pairs (L41), double goldens (L46), Bandit
  rival (L51), storm surges (L56), landmark shields (eat N props to
  de-shield, L61), night variants (L66), elite goldens (L71), triple
  rivals (L76), traffic rush (L81), shielded clusters (L86), Bandit+Duelist
  (L91), everything-at-once crescendo (L96–100).
- **Each metro's 10th district** stays the landmark-gated capstone event,
  but adds a small authored twist (Old Fog Town: fog closes in; Neon
  District: everything's worth 2× but rivals are faster).

## 2. Districts with identity (content, not just layout)

Per district, one line of flavor already exists (`districtName`). V2 also
ships 30 immutable visual archetypes per metro through a ten-district reveal
schedule. Gameplay keeps the same seven mass/radius tiers, while at least 25%
of each district's initial placements use visual IDs absent from its direct
predecessor. Procedural silhouette cues are real merged geometry, not palette
or accessory flags that disappear under instancing. The Skyline-opedia uses
the same stable IDs, so every collectible entry corresponds to visible content.

**City-first catalog update (2026-07-28):** the former seven-archetype Level 1
baseline is superseded for Area 1. Both `chicago-loop-*` reference sheets are
exclusive to Level 1, where all 48 types appear. The remaining 186 shared city
objects are distributed across Levels 2-10. Gameplay tiers remain stable;
city and neighborhood selection now determine what those tiers look like.
Other areas retain their 30-archetype schedules until their researched city
catalogs are authored. See `0008-city-object-library/00-overview.md`.

## 3. Meta 2.0 — choices, not tracks

V1: five linear stat tracks you buy in order (D4 — consequence-free).

- **Upgrade tracks become mutually exclusive picks at each tier** ("wide
  maw +15% eat radius" *or* "combo window +0.5s" — you lock one per tier).
  Respec costs 10% of lifetime coins. Now the shop is a build screen, and
  replays have texture.
- **Stars buy things.** 3★ a district → metro token; 10 tokens → that
  metro's skin + a permanent per-metro perk (e.g. Old Fog Town: fog shows
  prop silhouettes). Implemented in the v2 meta/save model; D4's original
  "stars do nothing" state is historical.
- **Skyline-opedia 2.0:** entries unlock per metro prop variant (§2) with
  the existing joke flavor text; completing a metro page = small coin
  bounty + a gallery card. Collection completion is the completionist loop.
- **Daily challenge** (seeded, tech §3): one level per day, same layout
  for everyone, 3 attempts, streak counter in the save. The zero-backend
  retention engine.
- **Prestige (v2.1, optional):** finishing Capital Prime unlocks
  "New Game+" — curve ×1.5, cosmetics carry, stars re-earnable. Only if
  retention data (from playtest, not analytics — this game has none) says
  people finish and want more.

## 4. Economy rebalance

- Campaign settlement is progression-aware: first clear pays full star value,
  improved stars pay only the milestone difference, and replay pays 20%.
  Existing saves infer claims from saved stars.
- Stars are objective-aware: completion supplies one star and every district
  declares two mastery conditions using existing mechanics.

- Coin payout per level flattens (current mass/10 explodes with n²):
  coins = `50 + 25·stars + challenges`, so a level is worth ~75–150 at any
  n. Shop prices re-derived so a full build costs ~60% of a full playthrough.
- The V1 "first purchase takes 2 levels" grind inverts: first upgrade
  affordable after level 1 (the genre's most important juice timing).
- Golden records: keep 8× but goldens also drop +10 coins each — they're
  the money run's target, not just mass.

## 5. Onboarding (first 5 minutes)

V1 dumps you into a world map with a chevron. V2:
- Level 1 *is* the tutorial, staged in three beats: (1) 10s "eat the
  highlighted props" with a pointer hand, (2) free roam, (3) landmark
  tease ("grow to eat THAT" with a camera cut). No text walls.
- First rival (L6) gets a 2s camera pan to the rival with "It eats too.
  Out-grow it." One line, then play.
- Every new mechanic (§1 cadence) gets exactly one intro line on its
  district card, never a modal.
