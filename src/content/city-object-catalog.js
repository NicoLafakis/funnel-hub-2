// Reference-led city object catalog. Pure data: no THREE, DOM, or randomness.
// Physical dimensions are metres; propkit converts them through the canonical
// WORLD_UNITS_PER_METRE contract. `gameplayKind` remains an economy tier only.

const CHICAGO_RAIL = `
straight elevated track segment|curved elevated track segment|90-degree loop corner track|elevated switch junction track|elevated track over street intersection|elevated rail river bridge segment|loop station platform wabash|loop station platform quincy|elevated station stair entrance|elevated platform canopy module|steel support column cluster|under-the-el street segment|cta train car|cta train cab|two-car l train set|signal gantry module|track maintenance catwalk|elevated rail power utility box|downtown bus shelter|chicago alley service lane|chicago riverwalk stair access|bascule bridge approach|state street streetscape segment|chicago flag banner pole`;

const CHICAGO_ICONS = `
willis tower|chicago board of trade building|harold washington library center|rookery building|monadnock building|chicago theatre|palmer house|cna center big red|marina city tower pair|wrigley building|tribune tower|merchandise mart|daley plaza with picasso|federal plaza with flamingo|crown fountain|cloud gate the bean|buckingham fountain|chicago river bridge module|art deco office mid-rise|historic loop corner storefront row|chicago parking garage|l station entrance pavilion|chicago riverwalk plaza|michigan avenue bridgehouse`;

const BUILDINGS = `
corner shop|row retail building|townhouse row|low-rise apartment|mid-rise apartment|brick office block|modern glass office tower|tall purple skyscraper|teal skyscraper|parking garage|hotel|mixed-use building|warehouse service building|fire station|police station|hospital clinic|city park module|bus depot transit station`;

const STREET = `
compact car|sedan|pickup truck|delivery van|city bus|ambulance|police car|trash can|recycling bin|dumpster|utility box|mailbox|park bench|street lamp|traffic light|stop sign|parking meter|fire hydrant|bus stop shelter|bike rack|newspaper stand|planter box|bollard|pedestrian signal|street tree|shrub|hedge module|fence module|crosswalk tile|road corner tile`;

const PARKING_SERVICE = `
parking space module|disabled parking space|ev charging station|parking gate arm|pay kiosk|shopping cart corral|shopping cart cluster|wheel stop parking curb|speed bump|security camera pole|parking-lot light pole|directional sign|dumpster enclosure|pallet stack|loading dock ramp|concrete barrier|jersey barrier|orange traffic cone set|folding barricade|portable sign board|maintenance shed|car wash vacuum station|gas pump island|fuel canopy module`;

const CIVIC_PARK = `
bronze statue|war memorial obelisk|civic monument plaza|fountain monument|gazebo pavilion|memorial bench|decorative arch|clock tower monument|flagpole cluster|sculpture garden piece|playground swing set|playground slide tower|picnic table set|dog park module|baseball diamond module|bleachers module|dugout module|soccer field module|soccer goal set|scoreboard sign|tennis court module|concession stand kiosk|stadium entrance gate|grandstand small arena`;

const ROADS = `
straight road tile|road corner tile variant|t-intersection tile|4-way intersection tile|diagonal road tile|one-way street tile|avenue median tile|bus lane tile|bike lane tile|alley tile|parallel parking lane tile|loading zone tile|straight sidewalk tile|sidewalk corner tile|plaza paver tile|crosswalk variant tile|traffic island module|roundabout module|bridge segment|bridge approach|retaining wall module|stair access module|tunnel portal|cul-de-sac module`;

const COMMUNITY = `
elementary school|public library|city hall|courthouse|museum|supermarket|gas station|construction site module|water tower|electrical substation|cell tower|billboard structure|playground module|sports court module|surface parking lot|farmers market plaza|small church community hall|stadium arena`;

const PEOPLE = `
office worker|businesswoman|construction worker|police officer|firefighter|paramedic|delivery courier|sanitation worker|jogger|cyclist|parent with stroller|elderly person with cane|student child|tourist with camera|street vendor|barista shop clerk|maintenance worker|security guard|dog walker|skateboarder|couple strolling|seated park visitor|customer queue pair|sidewalk crowd cluster`;

const SHOPS = `
bakery|coffee shop cafe|bookstore|florist|pharmacy|barber shop|pet shop|hardware store|boutique clothing store|bike shop|record store|arcade game shop|ice cream stand|deli sandwich shop|parking garage storefront|picnic table with umbrella|outdoor cafe patio|food truck|newsstand kiosk|atm kiosk|public restroom module|visitor information booth|flower planter plaza piece|small fountain plaza`;

function entries(text) {
  return text.trim().split('|').map((name) => name.trim());
}

const PROFILE_DIMENSIONS = Object.freeze({
  clutter: [0.8, 1.1, 0.8], person: [0.75, 1.75, 0.65], furniture: [1.8, 1.1, 0.8],
  pole: [0.45, 4.8, 0.45], vehicle: [4.6, 1.7, 1.9], largeVehicle: [11.5, 3.3, 2.7],
  shop: [12, 9, 12], lowrise: [20, 18, 20], midrise: [25, 42, 25], tower: [32, 120, 32],
  module: [18, 5, 18], transit: [24, 9, 12], rail: [24, 7, 12], landmark: [28, 28, 28],
});

function classify(name) {
  if (/worker|officer|firefighter|paramedic|courier|jogger|cyclist|person|student|tourist|vendor|clerk|guard|walker|skateboarder|couple|visitor|queue|crowd|businesswoman/.test(name)) return ['person', 'trash'];
  if (/car|sedan|truck|van|ambulance/.test(name) && !/car wash|parking/.test(name)) return ['vehicle', 'car'];
  if (/bus|train|transit/.test(name)) return ['largeVehicle', 'bus'];
  if (/willis|skyscraper|office tower|tower pair|cna center|tribune tower/.test(name)) return ['tower', 'building-large'];
  if (/building|mid-rise|apartment|hotel|merchandise mart|palmer house|library center|rookery|monadnock|theatre|garage|school|library|city hall|courthouse|museum|supermarket|station|hospital|warehouse|church|arena|office block/.test(name)) return ['midrise', 'building-medium'];
  if (/shop|storefront row|townhouse|bakery|bookstore|florist|pharmacy|barber|hardware|boutique|arcade|deli|kiosk|stand|shed|bridgehouse|pavilion|fire station|police station/.test(name)) return ['shop', 'building-small'];
  if (/track|rail|platform|under-the-el|catwalk/.test(name)) return ['rail', 'building-small'];
  if (/plaza|park|field|court|diamond|roundabout|road|street|lane|sidewalk|crosswalk|bridge|approach|parking space|loading zone|alley|retaining wall|tunnel|cul-de-sac|construction site|surface parking/.test(name)) return ['module', 'building-small'];
  if (/statue|memorial|monument|fountain|arch|bean|picasso|flamingo|cloud gate|water tower|substation|cell tower|billboard|grandstand/.test(name)) return ['landmark', 'building-medium'];
  if (/lamp|light|signal|sign|meter|hydrant|bollard|flagpole|camera pole|utility box|mailbox/.test(name)) return ['pole', 'trash'];
  if (/bench|rack|planter|shrub|hedge|fence|barrier|barricade|pallet|dumpster|table|goal|cart|canopy|shelter/.test(name)) return ['furniture', 'bike'];
  return ['clutter', 'trash'];
}

function slug(name) {
  return name.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const SHEETS = [
  ['chicago', 'rail', CHICAGO_RAIL], ['chicago', 'icon', CHICAGO_ICONS],
  ['shared', 'building', BUILDINGS], ['shared', 'street', STREET],
  ['shared', 'service', PARKING_SERVICE], ['shared', 'park', CIVIC_PARK],
  ['shared', 'road', ROADS], ['shared', 'community', COMMUNITY],
  ['shared', 'people', PEOPLE], ['shared', 'shop', SHOPS],
];

export const CITY_OBJECTS = Object.freeze(SHEETS.flatMap(([scope, sheet, text]) => entries(text).map((name, index) => {
  const [profile, gameplayKind] = classify(name);
  const [widthM, heightM, depthM] = PROFILE_DIMENSIONS[profile];
  return Object.freeze({
    id: `cityobj_${scope}_${slug(name)}`,
    name,
    scope,
    cityId: scope === 'chicago' ? 'chicago' : null,
    sheet,
    referenceIndex: index + 1,
    profile,
    gameplayKind,
    widthM,
    heightM,
    depthM,
  });
})));

export const CITY_OBJECT_BY_ID = Object.freeze(Object.fromEntries(CITY_OBJECTS.map((object) => [object.id, object])));
export const SHARED_CITY_OBJECTS = Object.freeze(CITY_OBJECTS.filter((object) => object.scope === 'shared'));
export const CHICAGO_CITY_OBJECTS = Object.freeze(CITY_OBJECTS.filter((object) => object.cityId === 'chicago'));

export function cityObjectMix(cityId, gameplayKind) {
  return CITY_OBJECTS.filter((object) => object.gameplayKind === gameplayKind
    && (object.scope === 'shared' || object.cityId === cityId)).map((object) => object.id);
}
