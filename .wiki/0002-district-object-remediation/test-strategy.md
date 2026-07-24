# District Object Remediation â€” Test Strategy

> [Requirements](requirements.md) Â· [Technical design](design.md)

## Test matrix

| Criterion | Level | Evidence |
|---|---|---|
| AC-001 | unit | valid gameplay kind/visual ID/dimensions for each placed prop |
| AC-002 | unit | all 100 catalogs reach >=25% predecessor novelty |
| AC-003 | integration | merged geometry differs; renderer groups separately |
| AC-004 | full suite | existing logic and 100-level progression bounds remain green |
| AC-005 | unit | legacy keys normalize; unknown keys fallback/skip safely |
| AC-006 | unit | duplicate generation summaries are byte-identical |
| AC-007 | unit + live | group/triangle/allocation budgets and live frame samples |
| AC-008 | live visual | district 1/5/10 matrix, silhouette/value review |
| AC-009 | docs | code/data/wiki contract review |

## Required deterministic checks

1. Registry IDs are unique, stable-format strings with known gameplay kinds
   and valid recipe builders.
2. Each metro has ten catalogs and each active gameplay tier has a valid mix.
3. Districts 2â€“10 report `novelty >= 0.25` against their direct predecessor.
4. Every selected visual ID resolves to finite merged geometry.
5. Intendedly different base/variant pairs have different geometry fingerprints.
6. Instancing groups by visual ID, while identical IDs still batch.
7. All 100 levels produce byte-identical visual-ID summaries on duplicate run.
8. Dynamic sources resolve an explicit visual ID or `fallback_<kind>` without
   losing mass/radius/special flags.
9. Save/collection normalization is idempotent and preserves legacy progress.
10. The current progress simulator ignores visual identity; all existing
    progression invariants pass unchanged.

## Performance gates

- Assert <=24 initial opaque prop groups plus blob shadow group.
- Calculate active merged-geometry triangle totals and enforce catalog budgets.
- Assert `world.update()` creates no geometry/materials.
- On a deployed build, record median and p95 frame time on target mobile
  hardware for district 1/5/10. Do not test via localhost.

## Visual validation

With an explicitly deployed URL, capture district 1, 5, and 10 in every metro
at fixed camera framing. For each matrix row verify:

- At least three new families are legible relative to the prior sampled district.
- New objects pass thumbnail silhouette/grayscale value review.
- A former variant (black cab, harbor bike, etc.) visibly differs from its base.
- Nothing floats, clips, disappears, or has invalid bounds.

Live verification requires explicit deployment authorization.
