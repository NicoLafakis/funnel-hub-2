# District Object Remediation â€” Technical Design

> [Objective overview](00-overview.md) Â· [Requirements](requirements.md) Â· [Visual catalog brief](art-bible.md) Â· [Implementation plan](tasks.md)

## Approach

Decouple what a prop does from what it looks like. The existing gameplay kind
continues to own mass, edible radius, placement class, and dynamic-system
compatibility. `visualId` selects a deterministic low-poly geometry recipe and
material role. District catalogs determine which visual IDs fill each gameplay
tier and schedule their introductions.

Initial implementation uses procedural Three.js recipes because the app already
has cached merged primitive geometry and static deployment. Future local GLB
assets may implement the same registry contract after approval; remote assets
are excluded.

## Data flow

```text
metro + district catalog + level seed
  -> generateDistrict(level)
  -> { kind, mass, radius, visualId, collectionKey }
  -> noveltyReport(current, predecessor)
  -> main.buildLevelWorld()
  -> createInstancedWorld.set()
  -> group visualId | materialVariant | golden
  -> cached merged propkit geometry
```

## Registry and catalog model

Create pure `src/content/archetypes.js`, never importing Three.js. `propkit.js`
accepts a resolved descriptor and constructs/caches geometry.

```js
export const VISUAL_ARCHETYPES = {
  harbor_forklift: {
    id: 'harbor_forklift', gameplayKind: 'car',
    family: 'industrial_vehicle', recipe: 'forklift',
    materialRole: 'harbor_industrial', collectionKey: 'harbor_forklift',
    footprint: 2.1, height: 1.8, silhouette: 'forks and upright mast',
  },
};
export const DISTRICT_CATALOGS = {
  'harbor-metropolis': { 7: { mixes: { car: ['harbor_forklift'] }, introduces: ['harbor_forklift'] } },
};
```

IDs use lowercase underscores and are immutable once shipped. A catalog may
only reference an archetype whose `gameplayKind` matches its allocated tier.

### Selection rules

1. Copy existing level-template count, radius, and mass exactly.
2. Resolve the district's allowed IDs per gameplay kind.
3. Use existing seeded RNG to choose IDs per placement.
4. Reserve enough slots from `introduces` for >=25% novelty against predecessor.
5. Preserve golden/elite/moving/mega/spawn-feast/capstone special flags.
6. Emit `visualId`, `collectionKey`, and legacy-compatible variant aliases.

The novelty denominator is initial `layout.props`, including spawn feast but
excluding the landmark and dynamic spawns. A family may return after a gap;
"new" only means absent from the direct predecessor.

## Renderer contract

Replace `kind|golden` with `visualId|materialVariant|golden`. `materialVariant`
allows golden overlay or an intentional palette role without a unique material
per prop. Each group constructs cached merged geometry only at level build,
then reuses the existing matrix, edibility, pulse, hide, and wobble paths.

Variants are complete recipe geometries, not post-instancing accessories. That
makes a black cab, tuk-tuk, surf bike, or future forklift a distinct group that
cannot silently collapse into a base car/bike.

`fallback_<kind>` descriptors protect old dynamic props and malformed content.

## Catalog composition and reveal

Target 30 archetypes per metro:

| Category | Count | Purpose |
|---|---:|---|
| Street clutter, tier 0 | 6 | early food and district activity |
| Micro transport, tier 1 | 4 | early mobility identity |
| Vehicles, tier 2 | 5 | recognizable route choices |
| Heavy transport, tier 3 | 3 | late-route set pieces |
| Small architecture, tier 4 | 5 | neighborhood identity |
| Skyline architecture, tiers 5/6 | 4 | skyline escalation |
| Set dressing | 3 | local focal clusters |

| District | Purpose |
|---|---|
| 1 | establish 8â€“10 core archetypes |
| 2 | neighborhood-specific clutter |
| 3 | transport family |
| 4 | commercial/civic family |
| 5 | architecture step-up |
| 6 | local landmark satellites |
| 7 | industrial/coastal/cultural family |
| 8 | heavy-route and skyline family |
| 9 | premium promenade/approach family |
| 10 | capstone ensemble recombining strongest earlier families |

## Harbor vertical slice

| District | New families |
|---|---|
| 1 Suburbs | bins, mailbox, scooter, hatchback, row house |
| 2 Row Houses | planter, stoop, delivery bike, brownstone |
| 3 Midtown | hydrant, taxi, delivery van, office block |
| 4 Downtown | kiosk, sedan, city bus, glass midrise |
| 5 Financial | bollard, executive car, glass tower |
| 6 Bridge | cones, barriers, maintenance truck, pylon |
| 7 Piers | rope coils, crates, forklift, warehouse |
| 8 Warehouse | pallets, containers, flatbed, loading shed |
| 9 Promenade | bench, food cart, tour bus, civic facade |
| 10 Plaza | flags, monument satellites, security vehicle, plaza ensemble |

## Save/collection compatibility

Add `normalizeCollectionVisualKey()` to existing save/collection flow. It maps
old display names, e.g. `Wharf Bike`, to permanent IDs, e.g.
`harbor_wharf_bike`. Unknown values are preserved in a legacy bucket for
diagnostics but never reach renderer input.

## Alternatives considered

| Option | Verdict | Reason |
|---|---|---|
| Palette/accessory-only reskins | reject | inadequate novelty; currently invisible at runtime |
| Separate non-instanced renderer | reject | duplicates world lifecycle and threatens mobile performance |
| Visual ID in existing renderer | choose | deterministic, cacheable, data-driven, future compatible |
| Bespoke models/layouts per level | reject | unsustainable, undermines seeded content system |
| Runtime remote assets | reject | conflicts with static/offline/no-dependency architecture |

## Cross-cutting constraints

- Instancing per visual group; cache merged geometry; no new per-frame work.
- No `Math.random()` in selection/generation.
- New content must distinguish through silhouette/value before hue.
- Resolve only registered IDs; never paths from saves.
- Use static ES modules and vendored Three.js only.
- UI/catalog-browser work is outside this plan pending explicit approval.
