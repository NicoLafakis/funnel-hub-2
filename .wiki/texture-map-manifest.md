# Texture Map Manifest — Level 1 (Chicago Loop) photoreal pass

Goal: close the gap between the current flat look and
`assets/references/target-in_game-graphics-city.png` (dense, realistically
surfaced city). The parked set in `assets/textures/photoreal/` (7 tiles) was a
start, not a set. This is the full shopping list; statuses updated 2026-07-28
after the PixelLab generation batch.

Generation: `node scripts/pixellab.js gen "<prompt>" 400 400 <out> --view
"high top-down"|side` (key in `.pixellab`, gitignored; never print it).
Batch script: `scripts/gen-photoreal-tiles.sh` (skips existing files).
Leonardo remains available (`scripts/leonardo.js`). All tiles **400² or
512², seamless, top-down for ground / straight-on elevation for facades**.
Generator elevations arrive on a white background — the loader auto-trims
near-white margins (`autoTrimFacade` in textures.js), so "edge to edge"
failures get a texture-worded regen ("full-frame architectural texture, no
building silhouette, no sky, no trees"), not a manual crop.

Consumption points (what code change each class needed):

- **Ground tiles** → `src/content/groundtex.js` pattern map (`TILE_WORLD`,
  `fillZone`; wash at quarter strength when a pattern fills). Park paths are
  pattern strokes through grass blocks.
- **Facades** → `src/content/textures.js` manifest → propkit instanced
  building material. Variants load as an ARRAY per tier; instancing.js picks
  one per group by stable key hash — zero extra draw calls against the
  60-opaque-group ceiling.
- **Roof tiles** → appended as a strip beside each facade canvas
  (`bakePhotorealFacade`); propkit maps roof faces by world position
  (`facadeRegion` UV split, 32u tile).
- **Water** → `src/content/city-context.js` planes (96u repeat), canvases
  passed from main.js.

## A. Ground tiles (seamless, top-down)

| # | File | Zone / use | Tile world | Status |
|---|------|-----------|-----------|--------|
| A1 | `asphalt.png` | `asphalt` carriageways | 72u | HAVE |
| A2 | `ground-asphalt-worn.png` | avenue variant | 72u | DROPPED — 2 gens, both directional streaks; A1 reused |
| A3 | `sidewalk.png` | `curb` kerb rings | 54u | HAVE |
| A4 | `ground-pavement.png` | `pavement` open block ground | 96u | GENERATED, wired |
| A5 | `ground-promenade.png` | `promenade` warm avenue paving | 96u | GENERATED, wired |
| A6 | `plaza.png` | `plaza` civic pavers | 110u | HAVE |
| A7 | `grass.png` | `grass` parks | 140u | HAVE |
| A8 | `ground-park-path.png` | park path strokes | 48u | GENERATED, wired |
| A9 | ~~`ground-parking-lot.png`~~ | stall-lined lot surface | — | DONE as geometry (`parkingStallQuads`) — paint lines are sub-texel in the bake |

## B. Facade tiles (straight-on elevation, auto-trimmed by the loader)

Small tier (storefront street wall; fit: cover):

| # | File | Look | Status |
|---|------|------|--------|
| B1 | `facade-small.png` | red brick storefront | HAVE (base) |
| B2 | `facade-small-brick-brown.png` | brown brick, dark awning band | GENERATED |
| B3 | `facade-small-limestone.png` | buff limestone, terra-cotta cornice | GENERATED |
| B4 | `facade-small-painted.png` | sage green, striped awnings | GENERATED |
| B5 | `facade-small-ironspot.png` | dark iron-spot brick, stone base | GENERATED |

Medium tier (copies: 2 tiling):

| # | File | Look | Status |
|---|------|------|--------|
| B6 | `facade-medium.png` | concrete balcony grid | HAVE (base) |
| B7 | `facade-medium-brick-loft.png` | warehouse loft, industrial bays | GENERATED |
| B8 | `facade-medium-limestone.png` | buff office, punched windows | GENERATED |
| B9 | `facade-medium-brick-bay.png` | brick apartment w/ bays | GENERATED |

Large tier (copies: 3 tiling):

| # | File | Look | Status |
|---|------|------|--------|
| B10 | `facade-large.png` | blue-green glass curtain grid | HAVE (base) |
| B11 | `facade-large-glass-dark.png` | smoked black glass | GENERATED (2nd attempt — 1st was a tower illustration) |
| B12 | `facade-large-concrete-glass.png` | concrete frame + blue glass bands | GENERATED |
| B13 | `facade-large-violet.png` | violet glass landmark tower | GENERATED (2nd attempt — 1st had trees/skyline) |

## C. Roof tiles (seamless, top-down; strip-appended per tier)

| # | File | Use | Status |
|---|------|-----|--------|
| C1 | `roof-gravel.png` | small tier default | GENERATED, wired |
| C2 | `roof-concrete.png` | medium tier default | GENERATED, wired |
| C3 | `roof-dark.png` | large tier default | GENERATED, wired |
| C4 | `roof-green.png` | sedum accent on the sage-painted storefront variant | GENERATED, wired (per-variant roof override) |

## D. Water & specials

| # | File | Use | Status |
|---|------|-----|--------|
| D1 | `water-river.png` | Chicago river context planes | GENERATED, wired |
| D2 | `water-lake.png` | lakefront context plane | GENERATED, wired |

## Deliberately NOT on the list

- Normal/roughness maps — the pipeline is albedo-only MeshStandardMaterial.
- Tree/vehicle/prop textures — those are geometry and read fine.
- Night/emissive facade variants — emissive tint already exists.
- Crosswalks/lane paint — separate geometry already, crisper than any bake.

## Known remaining gaps

- Per-instance (not per-visual-ID) facade variety is impossible without
  splitting instanced groups; the 60-group ceiling forbids it.
- Pixellab asphalt prompts produce directional streaks; stick with the
  parked asphalt.png or try Leonardo for road variants.
