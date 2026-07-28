# Current State

**Verified:** 2026-07-28 in the current 0006 implementation worktree
**Purpose:** concise operational truth; historical findings remain evidence, not current instructions.

## Product and runtime

- Flywheel V2 is a static Three.js r185 browser game with no bundler or backend.
- The live validation surface is `https://funnel-hub-umber.vercel.app`.
- The current hero is the extruded flywheel. Earlier sphere, vortex, and flat-wheel descriptions are historical.
- The city uses seeded district generation, instanced visual groups, procedural fallbacks, a v2 localStorage save, and the 100-level campaign.
- Current touch behavior follows ADR 0003: the first active touch moves from either side, the second touch orbits, and roles remain stable until release.
- The chase camera smoothly follows avatar heading while each continuous movement gesture retains its captured yaw basis, preventing camera/steering feedback.
- Level 1 is an authored Chicago Loop pilot: a fixed orthogonal block plan,
  eastern park edge, elevated rail cue, river edges, and instanced perimeter
  skyline replace the generic layout and dead horizon for that level only.
- Its render-only background now continues the city with 454 buildings, 1,138
  trees, 62 road strips, distance-softened materials, and an eastern lakefront.
  Its near ring is capped to low-rise infill; every taller simplified mass sits
  at least two context blocks behind the playable edge, preventing foreground
  occlusion without exposing an empty grid.
- Area 1 now owns a 234-type reference-led city catalog: all 48 assets from
  the two `chicago-loop-*` sheets are exclusive to Level 1. Its 24 icon assets
  are interactive and its 24 rail assets compose the authored context; 186
  shared urban objects are distributed across Levels 2-10.
- Reference-led building profiles include four-sided window bays, storefront
  bases, rooftop plant, and stepped tower crowns; chase heading uses a 0.16s
  critically damped angular spring for continuous left/right follow velocity.
- Signature Chicago profiles override that shared recipe where identity
  matters: Willis uses bundled-tube setbacks and twin antennas, Marina City
  uses paired balcony drums, CNA keeps its red slab, Tribune gets a taller
  historic crown, and the Chicago Theatre carries a projecting marquee.
- Chicago city-object bodies now participate in the existing procedural facade
  atlas (4×5, 6×10, or 8×18 bays by tier). Oversized geometry windows remain
  only as the missing-texture fallback, so live buildings gain finer facade
  rhythm while reducing triangles and retaining one instanced draw per ID.
- The approved target frame now owns the ground palette: charcoal asphalt and
  neutral concrete supersede the historical lavender-road reference palette.
- The Loop day mood uses a dedicated brighter ambient/hemisphere fill while
  retaining its directional key, keeping masonry readable inside dense street
  canyons without changing lighting on the other 99 levels.
- Level 1 uses 3.75× interactive tree density, weighted toward downtown
  sidewalks, to reproduce the target's continuous canopy without changing
  later Area 1 levels.
- Its elevated rail now includes steel supports, two station decks and
  canopies, and a three-car L train assembled on the authored route.
- The authored Level 1 budget preserves every tier's global mass product while
  rebalancing the visible composition from 102 vehicles/63 buildings to 74
  vehicles/114 buildings; later levels retain the global template.
- Level 1 orders those building sites by civic hierarchy: low-rise storefront
  runs frame the opening park, medium buildings step behind them, and large
  towers occupy the outer commercial skyline. Stable block sorting preserves
  contiguous frontage runs and seeded output.
- Chicago frontage slots use the small-building party-wall module instead of
  the campaign's widest-mega-tower pitch. Medium and large buildings still
  place first and reserve their full physical parcels through shared occupancy;
  small shops then close the remaining street wall at the denser cadence.
- Chicago civic modules appear once each; repeated block frontage draws from
  architectural profiles, including corrected Tribune Tower and historic
  storefront classifications.
- Chase framing uses the approved 55° pitch/FOV 40 lens at a 17.5r standoff,
  widened from 12r after live Loop frontage occluded too much of the grid.
- The Loop's civic plaza is a compact landmark court inside a developed host
  block; neither it nor the former duplicate plaza consumes a full block of
  dead concrete.
- Level 1 uses an authored Chicago material palette: brick, buff limestone,
  concrete, blue-green glass, and restrained landmark purple for buildings,
  with a separate realistic traffic palette. Building profiles add dark
  ground-floor glazing, entrance canopies, roof parapets, plant, and vents.

## Verified automated baseline

`npm test` on 2026-07-28 produced:

- 223 logic checks passed;
- deterministic duplicate summaries for all 100 levels;
- all nine documented gameplay invariants pass at 100/100;
- the final-transform placement audit reports zero all-kind intersections above 0.25 world units;
- maximum-build floor at 173/300, intentionally reported as debt rather than tuned green.

The nine gameplay invariants and hard placement gate are green, and `npm test` exits zero. The separate maximum-build floor remains visible as explicit non-gating balance debt.

## Active product debt

1. **Mobile validation:** a live-only multi-touch matrix and read-only touch bot now exist but remain unexecuted until this worktree is deployed with authorization; real-device iOS/Android evidence remains open.
2. **Physical validation:** all 543 registered prop geometries and 10 landmarks use generated final-geometry bounds in the legal-slot pass and all-kind gate.
3. **Balance debt:** maximum builds remain substantially below the intended duration floor.
4. **Mobile performance:** real-device phone/tablet frame time remains unmeasured; headless `requestAnimationFrame` figures are not valid performance evidence.
5. **Mobile UI:** Nico approved all seven named surfaces on 2026-07-28. The shorter title, pause/sound controls, safe areas, mobile typography, persisted quality selector, and direct Level Complete actions are implemented; live viewport and assistive-technology evidence remains open.

The implementation-ready plan for items 1–5 is [`0006-mobile-readiness-and-placement/00-overview.md`](0006-mobile-readiness-and-placement/00-overview.md).

## Closed defects that should not be reopened without new evidence

- Camera/avatar steering feedback loop and unbounded angle handling.
- False-failure messaging and capstone effective-radius mismatch.
- Ground depth precision, blend-mode rejection, shadow-frustum crawl, and horizon seam.
- Missing district visual identity and direct-predecessor novelty contract.

The numbered findings packages preserve the diagnosis and measurements for these closed defects.

## Documentation precedence

When statements disagree, use this order:

1. `AGENTS.md` for non-negotiable working constraints.
2. This page for verified current status.
3. `game-design.md`, `tech-architecture.md`, `art-direction.md`, and `content-and-meta.md` for active intent.
4. Accepted ADRs for durable decisions; proposed ADRs for intended changes not yet implemented.
5. Numbered remediation/findings packages for historical evidence and implementation records.

Code remains the authority for present mechanism. If it disagrees with active intent, update the implementation and documentation together.
