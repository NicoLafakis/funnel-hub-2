# V2 Art Direction

Why V1 looks empty and what replaces it. The live diagnosis (D1, D3):
props scattered on a flat colored plane, a ball for a hero, and a grid
band-aid for motion readability. The game has 10 beautiful metro identities
on paper (Harbor Metropolis, Neon District, Desert Spires…) that are
invisible in play.

## 1. Districts, not scatter

The single biggest visual upgrade. **Levels get procedural district layouts
instead of uniform scatter:**

- **Street grid** per level (2–4 blocks visible at once): roads as dark
  strips on the ground plane with curbs, so the world has *places* — a
  plaza, an avenue, a park. Generated from a seeded RNG (same seed ⇒ same
  district, which also enables the daily challenge, see content-and-meta).
- **Zoned prop placement:** trash/bikes along sidewalks, cars/buses on
  roads, buildings on block corners facing streets, parks = dense small-prop
  clusters (the feast), the landmark on the largest plaza. Placement reads
  from the layout, not from `Math.random()`.
- **Ground gets a texture**, not a color: procedural asphalt/plaza/grass
  tinting per block via a canvas-generated texture (no image assets needed —
  64×64 noise + tint, cheap). The V1 grid overlay dies with this; real
  streets do its job.

**Acceptance:** a screenshot of any level is identifiable as "a city
district" (not "objects on a plane") by someone who has never seen the
game. Motion readability without the debug grid.

## 2. The hero — a flywheel, not a ball

**V1:** purple sphere + wireframe shell. "It was a ball" (D3, direct
player quote).

**V2:**
- **Form:** keep the sphere silhouette (it reads at any size) but make it a
  *vortex*: an emissive swirl shader on the core (rotating spiral UV, 20
  lines of GLSL — V1 deferred this as "nice-to-have"), rim energy ring
  lying flat on the ground like a suction disc, and a debris stream of the
  last-eaten props orbiting briefly before being absorbed.
- **Motion:** squash-and-stretch on eats (2% scale pop, 80ms), banking into
  turns (roll ±10° from lateral velocity), a ground wake (darkened trail +
  dust puffs at speed) so movement reads on the floor.
- **Identity skins** stay (V1 has 5) but get material differences (matte /
  metallic / emissive), not just rim recolors.

**Acceptance:** 3-playtester squint test: "what is the player character?"
answers "a vortex/whirlpool," not "a ball."

## 3. Readability rules (the HUD-free layer)

- **Edible glow:** edible props get a subtle edge tint in the metro accent;
  too-big props are desaturated 30%. *(Implemented via per-instance color on
  the instanced prop meshes — a true fresnel isn't possible per-instance;
  the tint reads the same at gameplay distance.)* The size gate becomes
  learnable without a tutorial (V1 has zero edibility signaling — you
  learn by bumping).
- **Tier silhouettes:** the 7 tiers already have distinct silhouettes;
  enforce a 1.35× size step in the prop kit and keep it sacred.
- **Fog with intent:** V1 fog is a flat fade. V2 fog color = metro sky,
  density low enough that the *landmark is always silhouette-visible*
  (it's the goal — never hide the goal).

## 4. Metro identity that survives contact

Each metro gets **one signature visual beyond palette** (cheap, one per
metro, reused across its 10 districts):

| Metro | Signature |
|---|---|
| Harbor Metropolis | bridge silhouette on the horizon |
| Le Vieux Continent | mansard rooftops (roof kit variant) |
| Old Fog Town | real local fog banks that part as you grow |
| Neon District | emissive signs on buildings (bloom-free) |
| Desert Spires | sand drift particles at ground level |
| Coliseum City | travertine (warm) prop tinting |
| Carnival Coast | confetti bursts on tier-ups |
| Red Square Heights | snow dust + breath-fog on the lens |
| Harbor Opera Bay | water plane at the map edge with reflections faked by skybox |
| Capital Prime | the Portal Tower visible from *every* district (god-ray) |

## 5. Motion & juice budget

Everything animates or it ships broken-feeling: prop tumble-in on eat
(0.25s), shadow blob under every prop (cheap decal, not shadow maps at
this scale), one-point lighting (sun + hemisphere; no per-prop dynamic
lights). Juice discipline per V1: effects fire on events, baseline play
stays clean.
