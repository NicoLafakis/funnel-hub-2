# District Object Remediation â€” Visual Catalog Brief

> [Objective overview](00-overview.md) Â· [Technical design](design.md)

Production brief for a coherent low-poly catalog, not a photoreal conversion.
The art sequence is design brief â†’ geometry â†’ materials â†’ lighting/capture.

## World-wide grammar

- **Tonality:** playful, tactile, metropolitan.
- **Scale:** existing seven gameplay tiers remain sacred; no new object blurs
  the size reading between adjacent tiers.
- **Shape:** rounded clutter at tiers 0â€“1; stable rectangles for vehicles and
  buildings; one directional accent per family (awning, mast, handlebar, sign).
- **Materials:** painted metal, rubber, masonry, glass, timber, fabric only
  when roughness/value differences read from the gameplay camera.
- **Readability:** every asset passes black-silhouette and grayscale tests at
  thumbnail size. Fine texture detail never carries identity.
- **Production:** primitive builders have applied transforms, finite bounds,
  named materials, and cached merged geometry. Future mesh assets need local
  source, LOD plan, and documented triangle budget.

## Metro direction

| Metro | Visual families |
|---|---|
| Harbor Metropolis | row houses, harbor freight, bridge maintenance, promenade |
| Le Vieux Continent | planters, cafés, bakery delivery, mansard architecture |
| Old Fog Town | black cabs, rail fixtures, market carts, brick terraces |
| Neon District | vending, arcade, delivery bots, tuk-tuks, signs |
| Desert Spires | palms, luggage, golf carts, yachts, market stalls |
| Coliseum City | amphorae, scooters, market carts, stone facades |
| Carnival Coast | beach gear, food carts, parade floats, cable cars |
| Red Square Heights | plows, kiosks, tram units, panel blocks |
| Harbor Opera Bay | ferry gear, surf racks, harbor services, sail forms |
| Capital Prime | courier drones, data kiosks, campus shuttles, portal infrastructure |

## Required archetype record

1. One-sentence environmental function.
2. Gameplay kind.
3. 60/30/10 dominant/secondary/accent silhouette shapes.
4. Base material, palette role, roughness/metalness, and ground contrast.
5. Named primitive recipe or approved local mesh.
6. Triangle/group/LOD budget.
7. Non-color distinction and collection key.
8. Introduction district and planned return districts.

## Budgets and quality gates

| Tier | Role | LOD0 budget | Detail rule |
|---|---|---:|---|
| 0â€“1 | early, plentiful | <=250 tris | one clear accent |
| 2â€“3 | transport/set pieces | <=600 tris | wheels/windows/handles as silhouettes |
| 4 | neighborhood architecture | <=900 tris | roofline/facade rhythm |
| 5â€“6 | skyline support | <=1,500 tris | profile first; LOD if distant |

- Silhouette: distinguish at 100px in black.
- Value: visible against district ground in grayscale and does not steal the edible glow.
- Gameplay: footprint/render scale matches the assigned tier.
- Performance: merged/cached/material-shared and within budget.
- Culture: represent a place through use and systems, not shorthand stereotypes.
- Runtime: resolved `visualId` produces a distinct actual instanced geometry.
