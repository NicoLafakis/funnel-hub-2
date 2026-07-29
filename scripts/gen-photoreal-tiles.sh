#!/usr/bin/env bash
# Batch-generate the missing photoreal tiles from .wiki/texture-map-manifest.md
# via PixelLab (scripts/pixellab.js, key in .pixellab). ~1 generation per tile.
# Ground/roof/water are "high top-down"; facades are "side" elevations.
set -u
cd "$(dirname "$0")/.."
OUT=assets/textures/photoreal

gen() { # gen <outfile> <view> <prompt>
  local file="$1" view="$2" prompt="$3"
  if [ -s "$OUT/$file" ]; then echo "SKIP $file (exists)"; return; fi
  echo "GEN  $file"
  node scripts/pixellab.js gen "$prompt" 400 400 "$OUT/$file" --view "$view" || echo "FAIL $file"
}

TOP="high top-down"
SIDE="side"

# --- ground & water (top-down) ---
gen ground-asphalt-worn.png "$TOP" "seamless tileable top-down texture, dark gray worn asphalt road with subtle patches and tar seam repairs, fine grain, photorealistic, uniform flat lighting, no road markings, no shadows, no objects"
gen ground-promenade.png "$TOP" "seamless tileable top-down texture, warm beige stone avenue promenade paving, large rectangular pavers with thin joints, photorealistic, uniform flat lighting, no shadows, no objects"
gen ground-park-path.png "$TOP" "seamless tileable top-down texture, light tan crushed gravel park path, fine sandy grain, photorealistic, uniform flat lighting, no shadows, no plants, no objects"
gen water-river.png "$TOP" "seamless tileable top-down texture, dark teal-green urban river water with gentle ripple highlights, photorealistic, uniform lighting, no waves, no boats, no objects"
gen water-lake.png "$TOP" "seamless tileable top-down texture, calm deep blue lake water with subtle ripple texture, photorealistic, uniform lighting, no waves, no boats, no objects"

# --- roofs (top-down) ---
gen roof-gravel.png "$TOP" "seamless tileable top-down texture, flat tar and gravel rooftop, gray-brown aggregate with two small metal HVAC vents, photorealistic, uniform flat lighting, no shadows"
gen roof-concrete.png "$TOP" "seamless tileable top-down texture, light gray concrete flat rooftop with expansion joint grid lines and one small metal vent, photorealistic, uniform flat lighting, no shadows"
gen roof-dark.png "$TOP" "seamless tileable top-down texture, dark charcoal rubber membrane flat rooftop with subtle seams and one small metal vent, photorealistic, uniform flat lighting, no shadows"
gen roof-green.png "$TOP" "seamless tileable top-down texture, extensive green sedum living roof, low succulent plants in organic patches, photorealistic, uniform flat lighting, no shadows"

# --- facades (side elevations, edge-to-edge) ---
gen facade-small-brick-brown.png "$SIDE" "straight-on flat architectural elevation of a Chicago brown brick two-storey storefront facade, ground floor shopfront with dark awning band, three windows above, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-small-limestone.png "$SIDE" "straight-on flat architectural elevation of a buff limestone two-storey storefront facade with terra-cotta cornice, ground floor shopfront, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-small-painted.png "$SIDE" "straight-on flat architectural elevation of a painted sage-green two-storey storefront facade with striped canvas awnings over ground floor shop windows, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-small-ironspot.png "$SIDE" "straight-on flat architectural elevation of a dark iron-spot brown-black brick three-storey storefront facade with stone base and ground floor shopfront, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-medium-brick-loft.png "$SIDE" "straight-on flat architectural elevation of a red brick warehouse loft building facade, regular grid of large industrial windows with stone sills, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-medium-limestone.png "$SIDE" "straight-on flat architectural elevation of a buff limestone mid-rise office building facade, regular grid of punched windows with spandrel panels, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-medium-brick-bay.png "$SIDE" "straight-on flat architectural elevation of a red brick mid-rise apartment building facade with repeating bay windows, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-large-glass-dark.png "$SIDE" "straight-on flat architectural elevation of a dark smoked black glass skyscraper curtain wall facade, regular mullion grid, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-large-concrete-glass.png "$SIDE" "straight-on flat architectural elevation of a buff concrete framed skyscraper facade with horizontal blue glass window bands, regular grid, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"
gen facade-large-violet.png "$SIDE" "straight-on flat architectural elevation of a violet purple glass skyscraper curtain wall facade, regular mullion grid with reflective panels, fills the whole frame edge to edge, no margins, photorealistic, flat even lighting"

echo "DONE"
