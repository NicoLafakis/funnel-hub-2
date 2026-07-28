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
- Area 1 now owns a 234-type reference-led city catalog: all 48 assets from
  the two `chicago-loop-*` sheets are exclusive to Level 1, while 186 shared
  urban objects are distributed across Levels 2-10.

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
