/* The declarative art spec for Flywheel: every texture and icon we want PixelLab
   to generate, with its prompt, size, transparency, and destination path.

   Kept separate from the batch runner so the runner stays generic and the
   prompts stay reviewable/editable in one place. Pure data + pure functions —
   no network, no fs.

   Metro ids/colors mirror src/data/metros.js. Icon ids mirror
   src/meta/upgrades.js (UPGRADE_TRACKS), src/systems/achievements.js (ACH), and
   src/meta/collection.js (CITY_QUIPS) exactly — these keys are the contract the
   wiring agent looks assets up by.
*/

const TEXTURE_SIZE = 64;
const ICON_SIZE = 32;

// The 5 texture slots every metro gets.
const TEXTURE_SLOTS = ['street', 'sidewalk', 'facade-apartment', 'facade-office', 'facade-storefront'];

// Ground textures repeat many times across the level plane, so wrapping matters
// far more here than on a facade (which repeats once or twice per building
// face). The wording below is deliberately blunt about edge continuity — it
// measurably lowers the seam score in scripts/check-tileability.js.
const GROUND_SUFFIX =
  'Seamless tileable repeating pattern, top-down orthographic view straight down, ' +
  'uniform all-over pattern with no focal object and no single centered feature, ' +
  'even density across the whole square, flat even lighting, no shadows, no ' +
  'vignette, no text, no letters, no border and no frame. The pattern must ' +
  'continue past every edge: the left edge continues into the right edge and the ' +
  'top edge continues into the bottom edge, so copies placed side by side show no ' +
  'seam. Game ground texture.';

const FACADE_SUFFIX =
  'Seamless tileable pixel art building wall texture, flat straight-on side elevation, ' +
  'no perspective, no sky, no ground, no text, no letters, no border frame, edges must ' +
  'wrap so the texture tiles seamlessly in both directions. Game facade texture.';

// Per-metro art direction. `palette` is a plain-English restatement of the
// accent/ground/sky hex triple in src/data/metros.js so the prompt carries the
// same color story as the engine's per-metro tinting.
const METRO_ART = {
  'harbor-metropolis': {
    palette: 'steel blue accents (#4a90d9), cool slate-grey ground (#3c4a58), hazy pale blue sky (#8fb8d9)',
    street: 'Grey New-York-style asphalt avenue surface with cast-iron manhole covers, painted crosswalk stripes, tar-patched cracks and steam grating',
    sidewalk: 'Weathered pale concrete sidewalk slabs with expansion joints, a cellar hatch and scattered chewing-gum spots, classic American big-city pavement',
    'facade-apartment': 'Red-brown brownstone brick apartment wall with sash windows, black wrought-iron fire escape ladders and stone lintels',
    'facade-office': 'Blue-tinted corporate glass curtain wall with slim steel mullions in a tight rectangular grid, reflective skyscraper cladding',
    'facade-storefront': 'Street-level Manhattan shopfront wall with big plate-glass display windows, striped canvas awnings and a roll-down security shutter',
  },
  'vieux-continent': {
    palette: 'warm gold accents (#c9a66b), olive-brown ground (#5a5248), soft pale grey-blue sky (#cdd9e0)',
    street: 'Parisian cobblestone street of rounded grey granite setts laid in fan patterns, damp between the joints',
    sidewalk: 'Cream limestone Parisian pavement slabs with a granite kerb strip and a metal tree grate',
    'facade-apartment': 'Cream Haussmannian limestone apartment wall with tall french windows, black wrought-iron balcony railings and carved stone banding',
    'facade-office': 'Cream limestone office wall with arched windows, zinc mansard roof panel band and ornate stone cornice detail',
    'facade-storefront': 'Parisian ground-floor shopfront wall painted deep green with gold lettering panels, small-pane windows and a scalloped awning',
  },
  'old-fog-town': {
    palette: 'cold pewter accents (#8a9ba8), dark slate ground (#454f57), fog-grey sky (#9aa8ad)',
    street: 'Wet dark tarmac London road glistening with rain, painted white lane dashes, a cast-iron drain grate and puddle reflections',
    sidewalk: 'Grey rain-slick paving flagstones with mossy joints and a granite kerb, damp London pavement',
    'facade-apartment': 'Soot-stained red brick Victorian terrace wall with white sash windows, a painted lintel course and a downpipe',
    'facade-office': 'Portland stone office wall, pale grey ashlar blocks with tall regular windows and a carved string course',
    'facade-storefront': 'Traditional London shopfront wall in glossy dark green paint with gold-framed windows, hanging pub-style bracket and small panes',
  },
  'neon-district': {
    palette: 'hot magenta accents (#ff2e93), near-black indigo ground (#1a1830), deep purple night sky (#160a2e)',
    street: 'Rain-slick black asphalt Tokyo backstreet reflecting pink and cyan neon glow in wet streaks, faded white markings',
    sidewalk: 'Dark wet concrete pavement tiles with tactile yellow guidance strips and neon reflections pooling in the seams',
    'facade-apartment': 'Cramped dark concrete apartment wall crusted with air-conditioning units, cable bundles, laundry rails and small glowing windows',
    'facade-office': 'Black glass tower wall drowned in glowing magenta and cyan neon signage strips and holographic light panels',
    'facade-storefront': 'Cyberpunk street-level shopfront wall packed with glowing neon sign boxes, lit vending machines and noodle-bar lantern glow',
  },
  'desert-spires': {
    palette: 'bright gold accents (#f0c419), sand-brown ground (#8a6d3b), pale wheat sky (#f5deb3)',
    street: 'Pale sun-bleached asphalt boulevard dusted with fine desert sand drifts and faint tyre tracks',
    sidewalk: 'Cream sandstone paving slabs with a decorative geometric inlay border, sand blown into the joints',
    'facade-apartment': 'Warm sandstone residential wall with recessed arched windows and carved mashrabiya lattice screens',
    'facade-office': 'Gold-tinted mirrored glass tower wall with polished steel fins, gleaming under desert sun',
    'facade-storefront': 'Gold souk shopfront wall with brass-framed display windows, ornate arabesque metal screens and hanging lanterns',
  },
  'coliseum-city': {
    palette: 'burnt terracotta accents (#c1440e), tan earth ground (#a67c52), warm cream sky (#f2d9a0)',
    street: 'Ancient Roman travertine paving of irregular fitted limestone blocks worn smooth by centuries, dusty joints',
    sidewalk: 'Pale travertine footpath slabs with a raised stone kerb and scattered gravel',
    'facade-apartment': 'Ochre and burnt-sienna stucco wall, cracked and sun-faded, with green wooden shutters and terracotta roof tile band',
    'facade-office': 'White marble colonnade wall with fluted pilasters, carved capitals and a classical entablature frieze',
    'facade-storefront': 'Rustic Roman street-level shop wall in warm ochre plaster with an arched stone doorway, awning and hanging vines',
  },
  'carnival-coast': {
    palette: 'vivid green accents (#2ecc71), tropical green ground (#3a7d44), bright turquoise sky (#7fd9e8)',
    street: 'Portuguese calcada mosaic pavement in black and white wave pattern, small hand-set stones, Copacabana promenade',
    sidewalk: 'Black-and-white Portuguese wave mosaic sidewalk of tiny cubed stones, tropical beachfront paving',
    'facade-apartment': 'Favela hillside wall of stacked unfinished concrete blocks painted in mismatched bright pinks, yellows and blues, exposed rebar and small windows',
    'facade-office': 'Modernist beachfront tower wall in white concrete with turquoise glass balconies and sun-shading louvres',
    'facade-storefront': 'Colorful beachfront shop wall in azulejo tile patterns with a striped awning, surfboard racks and painted signage panels',
  },
  'red-square-heights': {
    palette: 'deep crimson accents (#c0392b), cold grey ground (#4a4a4a), pale overcast sky (#d8dee2)',
    street: 'Grey precast concrete slab roadway with wide expansion gaps, road salt streaks and patches of packed snow grit',
    sidewalk: 'Grey concrete pavement panels, chipped edges and frost cracks, Soviet-era municipal paving',
    'facade-apartment': 'Soviet panel-block khrushchyovka wall, grey prefabricated concrete panels with visible seams and rows of identical small windows',
    'facade-office': 'Monumental stalinist stone office wall in grey granite with tall recessed windows, star relief medallions and heavy cornices',
    'facade-storefront': 'Street-level wall in deep red painted stucco with white plaster trim, arched windows and an old enamel sign panel',
  },
  'harbor-opera-bay': {
    palette: 'bright teal accents (#00a4bd), deep harbor blue ground (#2e5266), pale sky blue (#bfe6f0)',
    street: 'Light grey concrete harbor roadway with pale aggregate, painted teal cycle lane and gull-bleached patches',
    sidewalk: 'Weathered timber boardwalk planks with bolt heads and gaps, sun-silvered harbourside decking',
    'facade-apartment': 'Warm honey Sydney sandstone block wall with white-framed sash windows and a wrought-iron lace balcony rail',
    'facade-office': 'Crisp white sail-modern tower wall of white ribbed panels and clear glass bands, bright coastal architecture',
    'facade-storefront': 'Harbourside shop wall in white weatherboard with teal trim, awning, wide windows and a surf-shack counter shutter',
  },
  'capital-prime': {
    palette: 'electric violet accents (#7a5cff), near-black navy ground (#20263a), midnight blue sky (#0d1120)',
    street: 'Dark tech-grid paving of matte black hexagonal plates seamed with faintly glowing violet circuit lines',
    sidewalk: 'Dark polished composite walkway panels with inset violet light strips along the seams, sci-fi city pavement',
    'facade-apartment': 'Dark habitation block wall of matte charcoal panels with softly glowing violet window slots and thin data conduits',
    'facade-office': 'Violet-lit smart-glass tower wall, dark mirrored panels with pulsing purple data-stream light seams',
    'facade-storefront': 'Futuristic storefront wall of dark panels behind floating holographic display frames glowing violet and cyan',
  },
};

const ICON_SUFFIX =
  'Single centered pixel art game icon on a fully transparent background, ' +
  'bold readable silhouette, clean dark outline, saturated colors, no text, ' +
  'no letters, no background scenery, no frame.';

const UPGRADE_ICONS = {
  size: 'A glowing blue sphere swelling outward with four radiating expansion arrows around it, size power-up',
  speed: 'A bright yellow lightning bolt over a swept motion-blur chevron trail, speed power-up',
  magnet: 'A classic red horseshoe magnet with grey poles and an electric arc between them, attraction power-up',
  time: 'A golden pocket stopwatch with a small green plus sign beside it, extra-time power-up',
  growth: 'A green upward arrow sprouting leaves from a seed, growth multiplier power-up',
};

const ACHIEVEMENT_ICONS = {
  first: 'A gold first-place medal on a ribbon with a single engraved notch',
  combo10: 'A blazing orange fireball burst with a curled flame tail, combo streak badge',
  combo25: 'A white-hot comet with a long fiery tail streaking diagonally',
  gold: 'A sparkling golden five-pointed star with radiating glints',
  rival: 'Two swirling spiral vortices, a large blue one devouring a small red one',
  fast: 'A winged running shoe with sharp speed lines behind it',
  storm: 'A dark storm cloud with a lightning bolt and glowing droplets falling',
  god: 'A green retro arcade alien face beside a small game controller, cheat-code badge',
  unsub: 'A closed blue mailbox floating weightlessly with a crossed-out envelope',
  breeze: 'A friendly rounded robot head with glowing eyes and a swirl of wind curling around it',
  win: 'A golden trophy cup with a tiny city skyline silhouette engraved on its bowl',
  metroCleared: 'A dark city skyline silhouette stamped with a big green checkmark',
  centurion: 'A bold gold laurel wreath encircling three glowing coins stacked in a triangle',
  hoarder: 'An open collector album book with colorful sticker stamps on its pages',
};

const COLLECTION_ICONS = {
  trash: 'An overflowing grey metal city trash can with a crumpled bag and banana peel on top',
  bike: 'A city bicycle seen from the side, blue frame with a basket',
  car: 'A small red sedan car in three-quarter view',
  bus: 'A yellow-and-white city bus seen from the side with passenger windows',
  billboard: 'A rectangular roadside billboard on two steel posts with a blank colored panel',
  'building-small': 'A small two-story shop building with an awning and a door',
  'building-medium': 'A mid-rise office block about six stories tall with rows of windows',
  'building-large': 'A tall glass skyscraper tower tapering slightly toward the top',
  tree: 'A leafy round-canopy street tree with a brown trunk',
  streetlight: 'A tall curved street lamp post with a glowing warm lamp head',
  bench: 'A wooden park bench with black iron legs, side view',
  mailbox: 'A blue rounded street mailbox on a post with a mail slot',
  hydrant: 'A red fire hydrant with two side valve caps',
  'speed-bump': 'A yellow-and-black striped speed bump ridge on a strip of grey asphalt',
  apartment: 'A red brick apartment building with a black zigzag fire escape',
  office: 'A blue glass office building with a grid of reflective windows',
  'liberty-statue': 'A green-patina robed statue holding up a flaming torch, standing on a stone pedestal',
  'lattice-tower': 'A tall brown iron lattice tower with an arched base and a pointed top',
  'clock-tower': 'A gothic stone clock tower with a golden clock face and a spired roof',
  'sky-tower': 'A slender white-and-orange broadcast tower with an observation pod and antenna mast',
  'mega-spire': 'An enormous tapering silver spire skyscraper with stepped setbacks and a needle tip',
  amphitheater: 'An ancient stone amphitheater ring with tiered arched openings, partly ruined',
  'mountain-statue': 'A white robed statue with arms outstretched wide, standing on a rocky peak',
  'onion-palace': 'A colorful cathedral with striped red, blue and gold onion domes',
  'sail-opera': 'A white opera house of overlapping sail-shell roofs on a waterfront base',
  'portal-tower': 'A dark violet sci-fi tower crowned with a glowing purple portal ring',
};

const ICON_CATEGORIES = {
  upgrades: UPGRADE_ICONS,
  achievements: ACHIEVEMENT_ICONS,
  collection: COLLECTION_ICONS,
};

// Builds the full flat job list: one entry per asset we intend to generate.
// Each job: { category, metro?, slot?, id?, key, prompt, width, height,
//             transparent, relPath }
function buildJobs() {
  const jobs = [];

  for (const [metroId, art] of Object.entries(METRO_ART)) {
    for (const slot of TEXTURE_SLOTS) {
      const isGround = slot === 'street' || slot === 'sidewalk';
      jobs.push({
        category: 'texture',
        metro: metroId,
        slot,
        key: `texture/${metroId}/${slot}`,
        prompt: `${art[slot]}. Color palette: ${art.palette}. ${isGround ? GROUND_SUFFIX : FACADE_SUFFIX}`,
        width: TEXTURE_SIZE,
        height: TEXTURE_SIZE,
        transparent: false,
        relPath: `assets/textures/metro/${metroId}/${slot}.png`,
      });
    }
  }

  for (const [category, icons] of Object.entries(ICON_CATEGORIES)) {
    for (const [id, desc] of Object.entries(icons)) {
      jobs.push({
        category: 'icon',
        iconCategory: category,
        id,
        key: `icon/${category}/${id}`,
        prompt: `${desc}. ${ICON_SUFFIX}`,
        width: ICON_SIZE,
        height: ICON_SIZE,
        transparent: true,
        relPath: `assets/icons/${category}/${id}.png`,
      });
    }
  }

  return jobs;
}

module.exports = {
  TEXTURE_SIZE,
  ICON_SIZE,
  TEXTURE_SLOTS,
  METRO_ART,
  ICON_CATEGORIES,
  buildJobs,
};
