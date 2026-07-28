# Flywheel V2 — Design Wiki

Flywheel V2 is a static Three.js third-person city-eater game. This wiki is
the source of truth for design intent; code is the source of truth for current
mechanism. When they disagree, update both in the same change.

## Start here

1. [`../AGENTS.md`](../AGENTS.md) — non-negotiable repository rules and commands.
2. [`current-state.md`](current-state.md) — verified build status, open debt, and documentation precedence.
3. [`lessons-from-v1.md`](lessons-from-v1.md) — failure modes B1–B9 and design lessons D1–D4.
4. [`0006-mobile-readiness-and-placement/00-overview.md`](0006-mobile-readiness-and-placement/00-overview.md) — proposed next update and its execution order.

Agents touching boot, camera, input, economy, respawns, or world coordinates
must reread the matching V1 lesson before editing.

## Active design intent

- [`game-design.md`](game-design.md) — controls, camera, eating, rivals, difficulty, and failure behavior.
- [`art-direction.md`](art-direction.md) — current premium-stylized visual direction, district construction, hero, materials, and readability.
- [`tech-architecture.md`](tech-architecture.md) — module boundaries, rendering, generation, testing, responsive behavior, and save architecture.
- [`content-and-meta.md`](content-and-meta.md) — campaign cadence, district identity, builds, stars/tokens, daily play, economy, and onboarding.
- [`roadmap.md`](roadmap.md) — completed baseline, active blockers, and proposed Phase 5.

## Current proposed update: 0006

The external mobile review and placement findings are consolidated into one
Tier 2 package:

- [`00-overview.md`](0006-mobile-readiness-and-placement/00-overview.md)
- [`requirements.md`](0006-mobile-readiness-and-placement/requirements.md)
- [`design.md`](0006-mobile-readiness-and-placement/design.md)
- [`test-strategy.md`](0006-mobile-readiness-and-placement/test-strategy.md)
- [`tasks.md`](0006-mobile-readiness-and-placement/tasks.md)
- [`ADR 0003 — first active touch owns movement`](0006-mobile-readiness-and-placement/adr/0003-first-touch-owns-movement.md)
- [`ADR 0004 — final physical bounds drive placement`](0006-mobile-readiness-and-placement/adr/0004-physical-bounds-drive-placement.md)
- [External mobile-upgrade handoff](external-test-runs/Testing-01-Flywheel%20Mobile%20Upgrade%20Handoff.pdf)

Status: implementation complete pending live and real-device release evidence.
Touch ownership, non-blocking optional assets, fresh-save routing, legal-slot
placement, runtime quality tiers, diagnostics, and the approved mobile UI are
implemented in the current worktree. No deployment is implied by this plan.

## Implemented remediation records

These packages document decisions and acceptance evidence that are now in the
baseline. Read them when changing the covered behavior; they are not a queue
of still-open tasks.

- [`0001-level-progression-remediation/00-overview.md`](0001-level-progression-remediation/00-overview.md) — target-normalized progression, objective stars, rewards, and save-compatible settlement.
- [`0002-district-object-remediation/00-overview.md`](0002-district-object-remediation/00-overview.md) — permanent visual IDs, 300 metro archetypes, collection normalization, and novelty validation.
- [`0007-chicago-loop-authored-city/00-findings.md`](0007-chicago-loop-authored-city/00-findings.md) — actual-vs-target visual comparison and the Level 1 authored Chicago Loop pilot, including faux horizon context.

## Historical investigations

These are evidence archives. Their top-level status and final consolidated
sections supersede earlier hypotheses and measurements inside the same file.
Do not treat a mid-document proposal as current intent without checking the
active design docs and `current-state.md`.

- [`economy-balance-audit.md`](economy-balance-audit.md) — before-state and remediation record for runaway combo/progression scaling.
- [`0003-hole-feel-and-visual-fidelity/00-findings.md`](0003-hole-feel-and-visual-fidelity/00-findings.md) — steering, camera, city fidelity, invariant instrumentation, and placement history. Current placement debt moved to plan 0006.
- [`0004-false-level-failure/00-findings.md`](0004-false-level-failure/00-findings.md) — closed failure-copy and capstone-gate defect; fixed in `9c1f460`.
- [`0005-ground-rendering-defect/00-findings.md`](0005-ground-rendering-defect/00-findings.md) — closed depth, blend, shadow-crawl, atmosphere, and horizon-seam investigation; remaining performance questions are summarized in `current-state.md`.

## Working agreements

- Documentation records one of three things explicitly: current intent,
  proposed change, or historical evidence.
- Accepted ADRs are not rewritten; supersede them with a new ADR.
- Every mechanic change ships with its acceptance evidence.
- Generated-world changes remain seeded and preserve deterministic output.
- Browser journeys use an explicitly authorized live URL, never localhost.
- Frontend look-and-feel changes require Nico's explicit approval for each
  affected element, and deployment requires an explicit “push it” or “go live.”
