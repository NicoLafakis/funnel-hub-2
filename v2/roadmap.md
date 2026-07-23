# V2 Roadmap

Four phases, each independently shippable and playable. Ordering principle:
fix what players touch first (controls/camera/look), then what makes it run
everywhere (perf), then what makes them stay (content/meta), then polish.
Estimates assume focused solo dev time.

## Phase 1 — Feel (2–3 weeks)

Controls, camera, floor, hero. The "would I recognize this as the same
game?" phase — answer: barely, and that's the point.

1. Input state machine + camera-relative steering + orbit (game-design §1).
2. Camera pitch/FOV/look-ahead + minimap (game-design §2).
3. District layout v1: street grid + zoned props + ground texture (art §1).
4. Hero: swirl shader, squash/bank, ground wake (art §2).
5. Edibility glow + desaturation (art §3).

**Exit:** 3 playtesters who saw V1 prefer V2 unprompted; B4-style
hands-off input regression test in E2E; spawn frame shows ≥5 edible props.

## Phase 2 — Performance & tooling (1–2 weeks)

1. InstancedMesh props + pooling + spatial hash (tech §1–2).
2. Seeded generation (tech §3).
3. CI: logic suite + E2E boot/flow on PR; visual regression goldens.
4. `npm run ship` deploy script with alias verification + live boot smoke.
5. Responsive overlays + touch controls + reduced-motion (tech §6, B9).

**Exit:** 60fps p95 on a 2021 phone at 400 props; CI green is required
to merge; a phone viewport can reach every button.

## Phase 3 — Content & meta (2–3 weeks)

1. Difficulty invariants + soak bot across all 100 levels (game-design §5).
2. Unlock cadence re-authoring (content §1) + per-metro prop variants (§2).
3. Shop as builds (mutually exclusive tiers, respec) + stars spend (§3).
4. Daily challenge + streaks (tech §3, content §3).
5. Rival archetypes Grazer/Bandit/Duelist + hoard piñata (game-design §4).
6. Onboarding beats (content §5).

**Exit:** invariant suite passes 100/100 in CI; a returning player has
3 things to do on any given day (daily, star hunt, album); tutorial
playtesters reach level 2 without asking a question.

## Phase 4 — Polish & live-ops (ongoing, 1 week + drips)

1. Metro signature visuals (art §4).
2. Chain-ping audio, vacuum snap, wedge wobble, crumbs (game-design §3).
3. Economy rebalance final pass against playtest data (content §4).
4. Prestige/NG+ if retention justifies it (content §3).

**Exit:** ship. Then one content drip per metro (a new district modifier)
as the zero-backend live-ops cadence.

## Explicitly out of scope for V2

- Multiplayer of any kind (bots already fake it convincingly enough).
- Monetization, ads, accounts, backend of any form.
- Engine swap (Unity/Unreal) or bundler adoption — reassess only if the
  module count doubles.
- New game modes beyond the daily challenge. V2's job is depth, not breadth.

## Risks

- **Instancing rework touches every system that reads `mesh.position`.**
  Mitigate with the spatial-hash refactor first — systems stop owning
  meshes entirely and query the hash.
- **District layout could hurt level variety** if the street generator is
  too regular. Mitigate: 3 layout archetypes (grid, radial, organic) seeded
  per district.
- **Scope:** Phases 1–2 alone are a shippable V2. If time runs short, ship
  them and cut Phase 3 to items 1+3 only — do not cut the invariant suite;
  it's the immune system.
