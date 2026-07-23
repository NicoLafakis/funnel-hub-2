# Flywheel V2 — Design Documentation

This directory holds the **version-2 upgrade plan** for Flywheel (live at
[funnel-hub.vercel.app](https://funnel-hub.vercel.app)): everything I would
change if building the game over again, given the direction V1 was already
heading — a 3D, 3rd-person, 100-level city eater with light meta-progression.

This is a documentation-only package. No code. It is written to be
implementable: every proposal cites the V1 evidence that motivates it and
ends with concrete acceptance criteria.

## Reading order

1. [`lessons-from-v1.md`](lessons-from-v1.md) — the factual basis. Nine bugs
   and four design flaws V1 shipped, how they were found, and what each one
   teaches. V2 proposals are traced back to these lessons; read this first.
2. [`game-design.md`](game-design.md) — controls, camera, game feel, core
   loop changes, difficulty model.
3. [`art-direction.md`](art-direction.md) — why V1 looks "empty" and the
   visual identity that fixes it.
4. [`tech-architecture.md`](tech-architecture.md) — engine structure,
   performance budget, rendering, tooling, testing.
5. [`content-and-meta.md`](content-and-meta.md) — the 100-level curve,
   districts-as-content, meta-progression 2.0, retention.
6. [`roadmap.md`](roadmap.md) — phased implementation plan with per-phase
   exit criteria and effort estimates.

## The one-paragraph version

V1 proved the concept works (people will chase a growing vortex ball around a
city and eat it) but shipped as a tech demo that survived contact with
players only after nine live fixes. V2 keeps the skeleton — Three.js, chase
camera, 10 metros × 10 districts, eat-grow-capstone loop, coins/stars/shop —
and rebuilds the four things players actually touch: **how it steers**
(twin-stick-style camera-relative controls), **how it looks** (real city
districts instead of scatter props on a colored plane), **how it performs**
(instanced rendering, object pooling, 60fps on mid phones), and **how it
retains** (district identity, daily seed, meaningful upgrade choices instead
of linear stat tracks).
