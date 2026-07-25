# STATUS — Realistic level-1 city environments (2026-07-24) — DONE

Goal: actual city environment for level 1 (Harbor Metropolis / "Suburbs") —
accurately placed buildings/objects with realistic graphics via Leonardo.

## What shipped

- **Leonardo textures** in `assets/textures/`: 3 building facades (brick
  storefront / apartment grid / glass tower) + 4 ground surfaces (asphalt,
  sidewalk, grass, plaza pavers). Generated with `scripts/leonardo.js`
  (Lucid Origin), visually inspected; `facade-small` keeps white margins
  that are cropped at load via the manifest config in `textures.js`.
- **`src/content/textures.js`** — runtime loader (facade CanvasTextures with
  a trim-swatch corner at `TRIM_UV`, edge-cropped ground canvases, null
  fallback headless/missing files).
- **`src/content/propkit.js`** — merged instanced building geometry now
  carries UVs: facade side faces sample the facade image, roofs and trim
  parts sample the swatch; facade vertex colors go white when textured.
- **`src/content/groundtex.js`** — zones fill with the realistic repeating
  patterns (scaled by `TILE_WORLD`) and every street gets a dashed
  center-line marking; procedural tint fallback preserved.
- **`src/engine/instancing.js` / `src/main.js`** — textures threaded through
  (`createInstancedWorld({ textures })`, `bakeGroundTexture({ textures,
  size: 1024 })`, one boot-time `loadCityTextures` await).
- Docs: `.wiki/art-direction.md` §1 + `AGENTS.md` updated;
  `scripts/screenshot-city.cjs` added for visual checks (output `shots/`,
  gitignored).

Placement was already accurate by design (districts.js: buildings on block
corners/frontage facing streets, cars/buses in road lanes, trash/bikes on
sidewalks and park feasts) — this task added the realistic rendering layer
on top of the seeded layout, unchanged.

## Verification

- `npm test` — logic suite + 100-level invariants: GREEN.
- `npm run test:e2e` — boot smoke (3 viewports) + scripted flow: GREEN, 0 errors.
- `npm run build` — dist includes `assets/textures/`.
- Screenshots (`shots/l1-*.png`): all 3 building tiers render `map=YES
  uv=YES`; ground 1024px map with asphalt/markings/sidewalk/grass reads as a
  city; brick storefront facade confirmed clean up close.

## Notes for future sessions

- `src/content/propkit.js` has MIXED CRLF/LF endings — the Edit tool fails
  on multi-line `old_string`s there; use single-line anchors.
- `python` hangs on this machine — use `node -e`.
- Other metros reuse the same texture set; per-metro facade sets would be a
  follow-up (generate + extend `CITY_TEXTURE_MANIFEST`).
