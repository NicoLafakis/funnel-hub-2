# Texture Map Manifest — Level 1 (Chicago Loop) photoreal pass

Goal: close the gap between the current flat look and
`assets/references/target-in_game-graphics-city.png` (dense, realistically
surfaced city). The parked set in `assets/textures/photoreal/` (7 tiles) is a
start, not a set. This is the full shopping list.

Generation: `node scripts/leonardo.js gen "<prompt>" 512 512 <out>` (key in
`.leonardo-key`, never print it). All tiles **512×512, seamless, top-down for
ground / straight-on elevation for facades, no watermark margins** (the
loader crops edges; edge-to-edge art needs no crop). Save as real PNGs — the
current parked files are JPEGs with a `.png` extension (works in browsers,
breaks tooling assumptions).

Consumption points (what code change each class needs):

- **Ground tiles** → `src/content/groundtex.js` pattern map (`TILE_WORLD`,
  `fillZone`). Already wired; adding a zone = one manifest entry.
- **Facades** → `src/content/textures.js` manifest → propkit instanced
  building material. One map per instanced group today; variants need
  per-group selection (groups are keyed by `visualId`, so variant assignment
  is seeded per identity — no instancing rework, just a map picker).
- **Roof tiles** → NEW. Roof faces currently sample the white trim swatch
  (TRIM_UV). The chase camera looks down, so roofs are ~30% of frame; mapping
  top faces to a roof texture is the single biggest win after facades.
  Requires a second material or UV region in propkit's merged building
  geometry.
- **Water** → NEW. Chicago river/lakefront context is render-only flat
  geometry today; a repeating water tile + slight opacity is enough.

## A. Ground tiles (seamless, top-down)

| # | File | Zone / use | Tile world | Status |
|---|------|-----------|-----------|--------|
| A1 | `ground-asphalt.png` | `asphalt` carriageways | 72u | HAVE (photoreal/asphalt.png) |
| A2 | `ground-asphalt-worn.png` | avenue/arterial variant w/ patches | 72u | TODO |
| A3 | `ground-sidewalk.png` | `curb` kerb rings | 54u | HAVE (photoreal/sidewalk.png) |
| A4 | `ground-pavement.png` | `pavement` open block ground (largest area!) | 96u | TODO — today flat fill, no pattern at all |
| A5 | `ground-promenade.png` | `promenade` warm avenue paving | 96u | TODO |
| A6 | `ground-plaza.png` | `plaza` civic pavers | 110u | HAVE (photoreal/plaza.png) |
| A7 | `ground-grass.png` | `grass` parks | 140u | HAVE (photoreal/grass.png) |
| A8 | `ground-park-path.png` | park path network (replaces painted sand strokes) | 96u | TODO |
| A9 | `ground-parking-lot.png` | asphalt w/ baked stall lines, for pocket lots | 72u | TODO (layout has no lots yet — pair with a districts.js change or defer) |

## B. Facade tiles (straight-on elevation, windows edge-to-edge, no margins)

Small tier (storefront street wall — the target's defining feature, 160
instances on Level 1). Each needs a shopfront band at the bottom:

| # | File | Look | Status |
|---|------|------|--------|
| B1 | `facade-small-brick-red.png` | red brick, 2-3 storey, dark shopfront | HAVE (photoreal/facade-small.png, needs margin crop) |
| B2 | `facade-small-brick-brown.png` | brown/Chicago common brick, awning band | TODO |
| B3 | `facade-small-limestone.png` | buff limestone, terra-cotta cornice | TODO |
| B4 | `facade-small-painted.png` | painted storefront (sage/teal), canvas awnings | TODO |
| B5 | `facade-small-ironspot.png` | dark iron-spot brick, stone base | TODO |

Medium tier (mid-rise step-behind):

| # | File | Look | Status |
|---|------|------|--------|
| B6 | `facade-medium-concrete.png` | concrete balcony grid | HAVE (photoreal/facade-medium.png) |
| B7 | `facade-medium-brick-loft.png` | warehouse loft, large industrial bays | TODO |
| B8 | `facade-medium-limestone.png` | buff office block, punched windows | TODO |
| B9 | `facade-medium-brick-bay.png` | brick apartment w/ bay windows | TODO |

Large tier (outer skyline):

| # | File | Look | Status |
|---|------|------|--------|
| B10 | `facade-large-glass-blue.png` | blue-green glass curtain grid | HAVE (photoreal/facade-large.png) |
| B11 | `facade-large-glass-dark.png` | smoked/black glass (Willis read) | TODO |
| B12 | `facade-large-concrete-glass.png` | buff concrete frame + glass bands | TODO |
| B13 | `facade-large-violet.png` | violet/purple glass landmark tower (target's signature) | TODO |

Aspect note: face h/w is 1.57/2.18/2.80 by tier (textures.js header). Loader
should tile/crop per tier so windows stay square in world units — do NOT
stretch a square tile 0..1.

## C. Roof tiles (seamless, top-down)

| # | File | Use | Status |
|---|------|-----|--------|
| C1 | `roof-gravel.png` | tar-and-gravel w/ HVAC specks, low-rise default | TODO |
| C2 | `roof-concrete.png` | light concrete w/ expansion joints, mid-rise | TODO |
| C3 | `roof-dark.png` | dark membrane, tower default | TODO |
| C4 | `roof-green.png` | sedum/green roof accent (park-adjacent blocks) | TODO (optional) |

## D. Water & specials

| # | File | Use | Status |
|---|------|-----|--------|
| D1 | `water-river.png` | Chicago river edges (context), subtle ripple | TODO |
| D2 | `water-lake.png` | eastern lakefront, calmer/bluer | TODO (can share D1 tinted) |

## Deliberately NOT on the list

- Normal/roughness maps — the pipeline is albedo-only MeshStandardMaterial;
  lighting carries depth. Don't add maps the renderer can't use.
- Tree/vehicle/prop textures — those are geometry (Blender kit + instanced
  bakes), they read fine.
- Night/emissive facade variants — emissive tint already exists; skip.
- Crosswalks/lane paint — separate geometry already, crisper than any bake.

## Totals

9 ground + 13 facades + 4 roofs + 2 water = **28 tiles** (4 ground + 3
facades already exist → **21 to generate**, ~21 Leonardo gens at 512²).
