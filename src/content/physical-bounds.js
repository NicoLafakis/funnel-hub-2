// Authoritative pure-data placement contract. Visual IDs inherit the measured
// gameplay-kind volume unless a future recipe changes its solid ground
// footprint, in which case the override belongs here and must pass parity.
import { VISUAL_ARCHETYPES, resolveVisualArchetype } from './archetypes.js';
import { WORLD_UNITS_PER_METRE, kindFootprint, kindHeight } from './propkit.js';
import { GENERATED_LANDMARK_BOUNDS, GENERATED_PHYSICAL_BOUNDS } from './physical-bounds.generated.js';

const ZONES_BY_KIND = Object.freeze({
  trash: ['sidewalk', 'parcel', 'plaza'], bike: ['sidewalk', 'parcel'],
  car: ['road'], bus: ['road'],
  'building-small': ['parcel'], 'building-medium': ['parcel'], 'building-large': ['parcel'],
  tree: ['sidewalk', 'park', 'plaza'], person: ['sidewalk', 'park', 'plaza'], streetlamp: ['sidewalk'],
});

function inheritedBounds(descriptor) {
  const kind = descriptor.gameplayKind;
  const footprint = kindFootprint(kind);
  const measured = GENERATED_PHYSICAL_BOUNDS[descriptor.id];
  const width = measured ? measured.maxX - measured.minX : footprint.w;
  const depth = measured ? measured.maxZ - measured.minZ : footprint.d;
  const height = measured ? measured.maxY - measured.minY : kindHeight(kind);
  return Object.freeze({
    visualId: descriptor.id,
    kind,
    width,
    depth,
    height,
    baseAnchor: Object.freeze({
      x: measured ? (measured.minX + measured.maxX) / 2 : 0,
      y: measured ? measured.minY : 0,
      z: measured ? (measured.minZ + measured.maxZ) / 2 : 0,
    }),
    forwardAxis: '+z',
    allowedZones: Object.freeze([...(ZONES_BY_KIND[kind] || ['parcel'])]),
    clearanceMetres: kind.startsWith('building') ? 0.5 : 0.1,
    worldUnitsPerMetre: WORLD_UNITS_PER_METRE,
  });
}

export const PHYSICAL_BOUNDS = Object.freeze(Object.fromEntries(
  Object.values(VISUAL_ARCHETYPES).map((descriptor) => [descriptor.id, inheritedBounds(descriptor)]),
));

export function physicalBoundsFor(visualId, kind) {
  const descriptor = resolveVisualArchetype(visualId, kind);
  return PHYSICAL_BOUNDS[descriptor.id] || inheritedBounds(descriptor);
}

export function renderedGroundFootprint(visualId, kind, renderScale = 1, yaw = 0) {
  const bounds = physicalBoundsFor(visualId, kind);
  const scale = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
  return {
    width: bounds.width * scale,
    depth: bounds.depth * scale,
    yaw: Number.isFinite(yaw) ? yaw : 0,
  };
}

export function landmarkBoundsFor(landmarkType) {
  const measured = GENERATED_LANDMARK_BOUNDS[landmarkType];
  if (!measured) return null;
  return {
    landmarkType,
    width: measured.maxX - measured.minX,
    depth: measured.maxZ - measured.minZ,
    height: measured.maxY - measured.minY,
    boundingRadius: measured.boundingRadius,
    baseAnchor: { x: (measured.minX + measured.maxX) / 2, y: measured.minY, z: (measured.minZ + measured.maxZ) / 2 },
    forwardAxis: '+z',
    allowedZones: ['landmark-plaza'],
  };
}
