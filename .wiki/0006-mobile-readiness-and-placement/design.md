# Mobile Readiness and Scale-Accurate Placement - Technical Design

> [Objective overview](00-overview.md) - [Requirements](requirements.md) - [Implementation plan](tasks.md)

## Approach

Deliver this as two parallel correctness lanes that meet at one mobile release
gate:

1. **Reach and control the game:** immediate Start ownership, fresh-save
   routing, first-touch movement, lifecycle-safe pause, real touch automation,
   and direct continuation.
2. **Trust what the game renders:** authoritative final footprints,
   constraint-based seeded placement, all-kind audit gates, adaptive rendering,
   and real-device frame validation.

The lanes share one rule: tests consume the same contracts as production but
do not define those contracts tautologically. Geometry declarations are checked
against built geometry; touch tests use browser events; performance release
claims come from physical devices.

## Architecture and data flow

### Startup and first session

```text
DOM available
  -> wire Start exactly once
  -> create required engine/input state
  -> launch optional texture/model promises in parallel
  -> Start tap latches one request
      -> fresh save: construct Level 1 and begin play (procedural art is valid)
      -> returning save: open world map / continue path
  -> optional assets resolve
      -> cache for later level builds; do not hot-swap active instances
  -> optional assets reject
      -> retain procedural fallback; record diagnostic only
```

Required initialization is separated from optional presentation. An enabled
Start button always has a handler. A small explicit transition latch prevents
double taps from producing duplicate levels or overlays.

Fresh-save detection is a pure helper over normalized save data. The default is
"no completed level/star record." This helper is unit-tested rather than
re-derived in the DOM handler.

### Touch ownership

Replace half-screen role assignment with explicit pointer owners:

```text
first non-UI pointer down  -> movePointerId
second pointer down        -> orbitPointerId
additional pointers        -> ignored unless retained pinch logic consumes them
pointer up/cancel          -> release only that pointer's role
blur/hide/orientation      -> clear all roles and pause/suspend safely
```

Roles never transfer implicitly. If movement lifts while orbit remains, the
orbit pointer stays orbit; the next new pointer may claim movement. This avoids
a thumb that was rotating the camera suddenly driving the avatar.

The pure state machine exposes a read-only diagnostic snapshot with pointer IDs
and roles. The DOM binding remains the only browser-event layer. UI controls
stop/consume their own pointer events so tapping Pause or Sound never becomes a
movement gesture.

### Physical geometry contract

Use two related bounds because complete visual geometry and ground occupancy
are not always the same thing:

- **visual bounds:** complete final local geometry, including roofs, signs,
  canopies, lamp arms, and other overhangs;
- **ground footprint:** the solid occupied X/Z rectangle at the object's base,
  with a local center offset, half-width/depth, forward axis, and optional
  placement clearance.

The canonical pure-data record is keyed by `visualId` with inheritance from the
gameplay kind when a variant does not change its ground footprint:

```js
{
  visualId,
  kind,
  anchor: { x, y, z },
  visualBounds: { minX, minY, minZ, maxX, maxY, maxZ },
  groundFootprint: { centerX, centerZ, halfWidth, halfDepth },
  forwardAxis: '+z',
  allowedZones: ['frontage'],
  clearance: { street: 24, neighbour: 0.5 }
}
```

`scripts/glb-to-js.js` / a companion no-dependency bounds generator writes a
committed pure-data table from final merged geometry. Procedural geometry is
the calibration target; Blender models are already normalized to that target.
A logic/geometry test rebuilds every visual and fails if the committed visual
bounds are stale. Ground footprints are inherited/overridden data because an
overhanging awning or lamp arm must not be treated as solid ground occupancy.

The world-space footprint function applies the exact render scale, `scaleMult`,
local center offset, position, and yaw. Rendering, placement, blob shadows, and
audits call this shared pure function. Gameplay radius remains the economy/eat
quantity and is never substituted for physical occupancy.

### Deterministic placement solver

Generation becomes structure -> capacity -> allocation -> validation:

1. Generate seeded streets and blocks.
2. Derive legal polygons/bands: lanes, sidewalks, frontage parcels, parks,
   plazas, spawn/camera reserve, landmark reserve, and world bounds.
3. Generate deterministic candidate slots sized for the requested object's
   footprint, not a generic point pool.
4. Reserve the landmark and gameplay-critical spawn feast.
5. Allocate constrained objects using seeded candidate order and the shared
   oriented-rectangle spatial index.
6. If a candidate fails, try the next legal candidate. If capacity is
   exhausted, deterministically subdivide/extend legal slots within the same
   zone and retry under a hard attempt bound.
7. Run final validation after mega scaling, bounds clamps, lane seating,
   re-facing, and any remaining repair operation.

Large/static infrastructure may be allocated first because it has fewer valid
sites, but order is not treated as an acceptance mechanism: prior measurement
showed smallest-first and largest-first inside the RNG spread. The solver
passes because every final constraint passes, not because an order happens to
produce a favorable sample.

Road clearance no longer outranks occupancy by accepting a collision. A valid
candidate must satisfy both. If no such candidate exists, capacity generation
continues or the build fails with a reproducible diagnostic. Exact prop budget,
mass, visual-ID selection, and RNG stream remain unchanged.

### Adaptive rendering

Refactor fixed renderer constants into a pure profile table:

| Setting | High | Medium | Low |
|---|---:|---:|---:|
| DPR cap | 2.0 | 1.5 | 1.0 |
| Shadow map | 2048 | 1024 | 512 or disabled after device validation |
| Shadow coverage | full | reduced | reduced |
| Particles/feedback | full | reduced | minimum readable cues |
| Decorative animation | full | reduced | reduced/off |
| Detail/culling | full | moderate | aggressive |

Do not remove objective, edibility, growth, or failure feedback in lower tiers.
Quality reductions target cost, not meaning.

`createEngine()` owns `setQuality(profile)`. Changing shadow size disposes the
old shadow target, applies the new size, and causes `followShadow()` to derive
texel size, snapping, bias, normal bias, and coverage from the active profile.
The 0005 ground-stability fix therefore remains an identity at every tier.

The performance monitor uses a bounded rolling frame-time buffer, ignores
startup warm-up, and can only downgrade one tier after sustained pressure. It
does not auto-upgrade in the same session and cannot oscillate during gameplay.
Manual mode disables automatic changes. Settings persist through the existing
save path.

### Pause, lifecycle, and flow

Add `paused` as an explicit mode/overlay transition or a dedicated pause flag
that prevents `updatePlay()` and timer mutation while allowing a lightweight
render of the frozen scene. UI animation may use real time; gameplay never
does. Page hiding/backgrounding enters safe suspension and clears all input.
Resume restarts the gameplay clock baseline so hidden elapsed time cannot leak
into the next `dt`.

Ordinary completion offers three explicit actions:

- Next Level -> next level directly;
- Upgrade -> existing build shop;
- World Map -> existing map.

Capstone/metro boundaries may still route to the larger progression moment.

## Alternatives considered

| Option | Advantages | Problems | Verdict |
|---|---|---|---|
| Keep left/right first-touch halves | No code change | Conflicts with one-handed use and external testing | Rejected |
| Fixed visible joystick as the primary fix | Strong affordance | Adds permanent UI and still requires camera-role communication | Deferred; first-touch ownership solves the core defect |
| Wire Start only after loading but visibly disable it | Smaller bootstrap refactor | Makes first session wait for assets already designed to be optional | Acceptable fallback, not preferred |
| Hand-maintain one kind-level footprint table | Simple | Variants and recipe overhangs drift from final geometry | Rejected |
| Use full mesh AABB as occupancy | Automatically exact visually | Treats lamp arms, awnings, and canopies as ground walls | Rejected; dual visual/ground bounds |
| Keep scatter then repair | Reuses current generator | Repairs create constraint conflicts and still leave 11.36% overlap | Rejected as primary placement architecture |
| Generic physics engine | Rich collision features | New dependency, runtime cost, and unnecessary nondeterminism | Rejected |
| Fixed 2048 shadows/DPR 2 on every device | Maximum fidelity | No thermal/budget adaptation | Rejected |
| User-selected quality only | Predictable | First session can still be unusable before settings are found | Rejected; auto default plus manual override |

## Cross-cutting concerns

- **Determinism:** no `Math.random()` in world generation; candidate extension
  uses the existing seeded streams with explicit stream ownership.
- **Performance:** OBB checks use the existing spatial grid; solver and frame
  buffers are bounded; no per-frame geometry/material creation.
- **Accessibility:** reduced motion survives all tiers; controls are named and
  44x44; zoom/text scaling and non-color state are tested.
- **Save compatibility:** additive settings normalize through v2; no new key.
- **Missing assets:** procedural fallback remains the normal valid path.
- **Frontend protection:** Nico approved the named HTML/CSS/UI surfaces on
  2026-07-28; future visual changes still require explicit approval.
- **Deployment:** no deployment or live alias change without explicit approval.
