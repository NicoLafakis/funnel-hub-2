# PRD 0002: District Object Remediation

> [Objective overview](00-overview.md) Â· [Technical design](design.md) Â· [Visual catalog brief](art-bible.md) Â· [Implementation plan](tasks.md)

- **Status:** Implemented; FR-011 live evidence pending deployment authorization
- **Priority:** P0 visual-content correction
- **Owner surface:** `src/content/propkit.js`, `src/content/districts.js`, `src/engine/instancing.js`, `src/data/levels.js`, `src/data/metros.js`, `src/meta/collection.js`, tests
- **Migration:** additive content data; retain existing variant sightings and normalize unknown IDs defensively
- **Companion ADR:** [0002 â€” Visual ID and novelty contract](adr/0002-visual-id-and-novelty-contract.md)

## 1. Problem and goal

Every campaign level draws from seven fixed visual kinds. One metro reskin only
covers 3.0â€“7.9% of placements and the instanced runtime fails to render it.
District identity is chiefly palette/global effect, not object vocabulary.

Make each district visibly advance through themed, recognizable low-poly
families without altering proven gameplay mass, radius, or progression rules.

## 2. Load-bearing invariant

Every non-initial district resolves at least 25% of its initial placed props to
`visualId`s absent from the preceding district. No `visualId` can render as
another archetype because of instancing. Dynamic props are outside the initial
layout novelty ratio but remain visually resolvable.

## 3. Goals

1. Render every authored variant/archetype in the real instanced world.
2. Keep gameplay tier independent from art identity, mass, radius, and gates.
3. Give every metro a 28â€“35-archetype low-poly catalog and ten-district reveal schedule.
4. Guarantee >=25% immediate-predecessor novelty for districts 2â€“10.
5. Preserve seeds, the progression suite, and the 60fps 2021-mid-range-phone target.
6. Ensure collection entries correspond to visible geometry.
7. Test object variety in logic tests and visual regressions.

## 4. Non-goals

- Photoreal assets/textures or a new art direction.
- Changes to economy, target mass, tier radius, camera, controls, or progression.
- Runtime third-party downloads, new npm dependencies, new UI flows, ads, or monetization.
- One hundred bespoke layouts; selection remains seeded data and placement remains procedural.

## 5. Personas and user stories

- As a player, I want visible objects to tell me whether I am in a harbor,
  market, beach, civic plaza, or industrial district before I read text.
- As a progressing player, I want each district to show enough new objects
  that advancement feels tangible.
- As a completionist, I want every collection entry to match something seen.
- As a content author, I want to add archetypes in data, not game logic.
- As a performance owner, I want new variety without draw calls scaling by placement count.

## 6. Functional requirements

- **FR-001:** Props carry independent gameplay kind and `visualId`; legacy
  `kind` remains a compatibility alias during migration.
- **FR-002:** Every `visualId` declares valid gameplay kind, recipe/local
  source, palette/material role, footprint, height, and silhouette metadata.
- **FR-003:** Every metro declares a catalog for all ten districts and each
  archetype's first-introduction district.
- **FR-004:** Districts 2â€“10 contain >=25% props whose visual IDs are absent
  from the direct predecessor.
- **FR-005:** Renderer batches by visual geometry, material variant, and
  golden state; distinct variants never collapse into the base geometry.
- **FR-006:** Golden, elite, moving, mega, storm, rival-crumb, parade, and
  capstone mechanics retain current gameplay behavior with visual fallbacks.
- **FR-007:** Collection writes use stable visual keys that can render.
- **FR-008:** Unknown/retired save/catalog keys resolve safely without a throw.
- **FR-009:** Catalog selection remains seeded and byte-identical.
- **FR-010:** Initial rendering stays inside declared group/triangle/allocation budgets.
- **FR-011:** Live capture set proves district 1/5/10 catalog changes per metro.
- **FR-012:** New families differ by silhouette/value/role, not hue alone.

## 7. Data model and compatibility

```js
visualArchetype = {
  id: 'harbor_forklift', gameplayKind: 'car', family: 'industrial_vehicle',
  recipe: 'forklift', materialRole: 'harbor_industrial', footprint: 2.1,
  height: 1.8, introducedAt: 7, collectionKey: 'harbor_forklift'
}
districtCatalog = { metroId: 'harbor-metropolis', district: 7, visualMix: [...] }
```

Existing `collectionVariants` remain valid. A normalizer maps current display
names to permanent IDs; unknown entries remain preserved as legacy data but
never become rendering input.

## 8. Surfaces and UX

No UI redesign is authorized. Existing world/map/result/collection surfaces
consume stable values. New tutorial copy, catalog browser UI, or gallery layout
requires separate explicit frontend approval.

## 9. Interface contract

```js
resolveVisualArchetype(visualId)
catalogForDistrict(level)
noveltyReport(currentProps, previousProps)
createInstancedPropField(visualId, ...)
normalizeCollectionVisualKey(key)
```

`generateDistrict()` stays the initial-prop producer; dynamics continue via
`spawnProps()` and the mass ledger.

## 10. Security and access control

N/A: static offline game. The registry must never interpret arbitrary asset
paths from save data.

## 11. Data integrity and write path

Content IDs are immutable once shipped. Existing save normalization remains the
only migration path. Collection writes extend `recordVariantSighting()` and
remain idempotent.

## 12. Testing strategy

Logic tests cover registry/catalog validity, novelty, determinism, fallback,
and renderer keys. Existing 100-level tests protect gameplay. Visual captures
run against an explicitly deployed URL only; never localhost.

## 13. Observability and logging

No new telemetry service. Test reports print per-level archetype counts,
novelty, groups, triangle estimate, and unresolved IDs.

## 14. Error handling and player feedback

Unknown IDs resolve to visible `fallback_<kind>` content and report a test/dev
warning. Gameplay continues. Collection writes skip unresolvable keys rather
than creating a false sighting.

## 15. Performance and cost

- Preserve 60fps on a 2021-era mid-range phone.
- Standard district: <=24 opaque instanced prop groups plus blob shadows.
- Non-landmark archetypes: <=1,500 LOD0 triangles; large buildings require
  LOD/silhouette handling when visible at distance.
- No geometry/material construction or allocation in frame updates.
- No dependencies, services, or runtime network cost.

## 16. Accessibility

New families differ by silhouette, value, and placement role, not color alone.
Edibility tint remains supplemental. Reduced motion suppresses nonessential
animated accessories/effects.

## 17. Phases

1. Lock registry/catalog/novelty/renderer-key contract.
2. Repair instancing in a Harbor vertical slice.
3. Complete all ten Harbor districts.
4. Produce remaining catalogs in two-metro batches with gates after each.
5. Migrate collection keys and complete campaign/live verification.

## 18. Reuse â€” do not fork

Reuse `generateDistrict()`, `generateLevel()`, merged-geometry cache,
`createInstancedWorld()`, `spawnProps()`, mass ledger,
`recordVariantSighting()`, save normalization, and existing test scripts. Do
not create a second renderer, roster, generator, or asset loader.

## 19. Acceptance criteria

- [ ] **AC-001 / FR-001â€“002:** all placed props resolve a valid visual ID and
  gameplay kind; runtime geometry is keyed by visual ID.
- [ ] **AC-002 / FR-003â€“004:** all 100 catalogs validate and districts 2â€“10
  meet >=25% predecessor novelty.
- [ ] **AC-003 / FR-005:** a variant's merged geometry differs from its base
  and appears as a distinct runtime group.
- [ ] **AC-004 / FR-006:** current dynamic/mass mechanics stay green in full tests.
- [ ] **AC-005 / FR-007â€“008:** legacy keys normalize safely and visible content
  is the only collectible content.
- [ ] **AC-006 / FR-009:** duplicate generation is byte-identical across 100 levels.
- [ ] **AC-007 / FR-010:** group, triangle, allocation, and frame-time budgets pass.
- [ ] **AC-008 / FR-011â€“012:** live captures show distinct 1/5/10 district sets
  and pass silhouette/value review.
- [ ] **AC-009:** art direction, content/meta docs, and implementation agree.

## 20. Dependencies and integration points

### Automated acceptance status

AC-001 through AC-006, AC-008, and AC-009 are implemented and evidenced by the
logic/invariant suites plus production review. AC-007's group, triangle, and
allocation gates pass (12 groups and 360 triangles observed at maximum).
Production headless timing is recorded as a regression proxy; physical
target-device frame-time sampling remains external calibration.

No external dependency. Requires current vendored Three.js and an explicitly
deployed URL for human/visual verification. Catalog production waits for
approval of the visual catalog brief.

## 21. Open questions

1. Recommended initial asset path: procedural recipes first, with an optional
   pre-vetted local GLB supplement later.
2. Recommended novelty denominator: initial placed props excluding landmark/dynamic spawns.
3. Recommended cadence: district 1 establishes, 2â€“9 introduce families, 10 recombines.
4. Recommended v1 scale: 30 archetypes per metro.

## 22. Companion ADR

[ADR 0002](adr/0002-visual-id-and-novelty-contract.md) records the decision.

## Implementation estimate

Large. Registry/vertical slice are medium technical work; ten full metro
catalogs are content-heavy and should be phased.
