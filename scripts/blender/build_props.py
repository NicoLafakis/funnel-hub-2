# Flywheel V2 — Blender prop pack builder (headless).
#
# Authors the low-poly, flat-shaded street props as REAL meshes (replacing the
# primitive-only procedural bakes in src/content/propkit.js) and exports each
# as assets/models/<name>.glb. The runtime never loads glTF — scripts/
# glb-to-js.js converts these into plain JS data modules that src/content/
# modelkit.js decodes into BufferGeometry.
#
# Color contract (propkit.js merged-geometry vertexColors x instanceColor):
#   - Every vertex carries a LINEAR float color (this script converts the
#     sRGB palette itself) exported as COLOR_0.
#   - GREYSCALE colors (r == g == b) mark TINTABLE verts: propkit multiplies
#     them by the archetype tint at bake time (tree canopy / person shirt /
#     lamp pole). White = full tint, 0.5 = darker shade, 1.18 = lighter.
#   - Non-greyscale colors are FIXED (trunk brown, skin, lamp head, car
#     glass/wheels/trim) and ship unchanged.
#   - The car body bakes WHITE: 'car' is a PALETTE_BASE_KIND, so the seeded
#     per-instance pastel palette (instancing.js) supplies the body hue.
#
# Usage (from the repo root, idempotent — overwrites the .glb files):
#   "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" \
#     -b --factory-startup --python scripts/blender/build_props.py
# Optional `-- <out_dir>` after the script path overrides assets/models.

import math
import os
import sys

import bpy

# --- Paths -------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
OUT_DIR = os.path.join(REPO_ROOT, 'assets', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if argv:
    OUT_DIR = os.path.abspath(argv[0])
os.makedirs(OUT_DIR, exist_ok=True)

# --- Palette (sRGB hex -> linear floats; matches propkit's THREE.Color) ------
def srgb(hex_str):
    c = int(hex_str.lstrip('#'), 16)

    def f(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f((c >> 16) & 255), f((c >> 8) & 255), f(c & 255))

TRUNK = srgb('#8a5a3b')
SKIN = srgb('#f2c89b')
HAIR = srgb('#5b3a24')
LAMP_HEAD = srgb('#fff3c4')
CAR_GLASS = srgb('#a8c4d4')
CAR_WHEEL = srgb('#141414')
CAR_TRIM = srgb('#5f6b7a')

# Building-only fixed colors. Deliberately the same swatches propkit's
# procedural bake uses (PALETTE_GLASS_TINT / PALETTE_TRIM_TINT) so a Blender
# building and a procedural one read as the same city under any metro accent.
WINDOW = srgb('#a8c4d4')         # fixed, glazing (== PALETTE_GLASS_TINT)
TRIM = srgb('#5f6b7a')           # fixed, roof plant / canopies (== PALETTE_TRIM_TINT)
DOOR_GLASS = srgb('#38495e')     # fixed, dark ground-floor entrance glass
ROOF = srgb('#8b93a2')           # fixed, roof deck — a distinct slate value
AWNING = srgb('#e2725b')         # fixed, shopfront awning pop (Hole.io refs)
BEACON = srgb('#ff3b30')         # fixed, mast-tip aviation light (matches propkit)

WHITE = (1.0, 1.0, 1.0)          # tintable, full strength
CANOPY = (0.85, 0.85, 0.85)      # tintable, canopy body (tufts stay WHITE = lighter)
MID = (0.75, 0.75, 0.75)         # tintable, mid shade (lamp base)
DARK = (0.5, 0.5, 0.5)           # tintable, darker shade (person legs)

WALL = WHITE                     # tintable, main facade (full metro accent)
WALL_DARK = (0.72, 0.72, 0.72)   # tintable, recessed ground floor / podium
WALL_LIGHT = (1.18, 1.18, 1.18)  # tintable, cornices / floor ledges / parapets

# --- Mesh helpers -------------------------------------------------------------
def clean_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for block in list(datablocks):
            datablocks.remove(block)


def apply_bevel(obj, width, segments=2):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('bev', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    bpy.ops.object.modifier_apply(modifier=mod.name)


def box(dims, loc, bevel=0.0, rot_x=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = (dims[0], dims[1], dims[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rot_x:
        o.rotation_euler = (math.radians(rot_x), 0, 0)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    if bevel:
        apply_bevel(o, bevel)
    return o


def cyl(r, depth, loc, vertices=8):
    """Upright (Z-axis) cylinder — water tanks, rooftop masts, vent pipes."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=r, depth=depth, location=loc)
    return bpy.context.active_object


def cone(r1, r2, depth, loc, vertices=8, bevel=0.0):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.active_object
    if bevel:
        apply_bevel(o, bevel)
    return o


def sphere(r, loc, scale=(1, 1, 1), segments=10, rings=7):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    if scale != (1, 1, 1):
        o.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o


def wheel(r, width, loc):
    # Cylinder with its axis along X (Blender Z-up: rotate 90 deg about Y).
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=10, radius=r, depth=width, location=loc, rotation=(0, math.pi / 2, 0))
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return o


def arc_tube(center, radius, tube_r, a_start, a_end, steps=10, sides=6, loc_end=None):
    """Quarter-arc tube in the XZ plane (the street lamp's curved arm).
    Angles in degrees; P(a) = center + radius * (cos a, 0, sin a)."""
    verts = []
    faces = []
    for i in range(steps + 1):
        a = math.radians(a_start + (a_end - a_start) * i / steps)
        px = center[0] + radius * math.cos(a)
        pz = center[2] + radius * math.sin(a)
        # Cross-section ring in the plane normal to the arc tangent.
        # Tangent T = (-sin a, 0, cos a); ring basis: radial (cos a,0,sin a) x Y.
        for j in range(sides):
            t = 2 * math.pi * j / sides
            rx = math.cos(t) * math.cos(a)
            rz = math.cos(t) * math.sin(a)
            ry = math.sin(t)
            verts.append((px + tube_r * rx, center[1] + tube_r * ry, pz + tube_r * rz))
    for i in range(steps):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j + 1) % sides
            c = (i + 1) * sides + (j + 1) % sides
            d = (i + 1) * sides + j
            faces.append((a, b, c, d))
    # End caps.
    verts.append((center[0] + radius * math.cos(math.radians(a_start)), center[1],
                  center[2] + radius * math.sin(math.radians(a_start))))
    verts.append((center[0] + radius * math.cos(math.radians(a_end)), center[1],
                  center[2] + radius * math.sin(math.radians(a_end))))
    cap0 = len(verts) - 2
    cap1 = len(verts) - 1
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(steps * sides + j for j in range(sides)))
    mesh = bpy.data.meshes.new('arc_tube')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new('arc_tube', mesh)
    bpy.context.collection.objects.link(o)
    return o


def set_color(obj, rgb):
    mesh = obj.data
    attr = mesh.color_attributes.get('Col')
    if attr is None:
        attr = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    n = len(mesh.vertices)
    attr.data.foreach_set('color', [rgb[0], rgb[1], rgb[2], 1.0] * n)


def finish_prop(parts_with_colors, name):
    for obj, rgb in parts_with_colors:
        set_color(obj, rgb)
    bpy.ops.object.select_all(action='DESELECT')
    for obj, _ in parts_with_colors:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts_with_colors[0][0]
    bpy.ops.object.join()
    prop = bpy.context.active_object
    prop.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for poly in prop.data.polygons:
        poly.use_smooth = False
    return prop


def fit_to_box(obj, w, d, h):
    """Snap the finished prop's bounding box to EXACTLY (w, d, h) — Blender
    X=width, Y=depth, Z=height — centered on X/Y with its base at z=0.

    propkit's bakeModelPart() rescales every authored model per-axis onto the
    procedural build's bounding box, so gameplay radii never move. Landing on
    that box here makes the runtime remap a no-op, which is the only way an
    authored silhouette survives the swap undistorted."""
    mesh = obj.data
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    sx = w / max(1e-6, max(xs) - min(xs))
    sy = d / max(1e-6, max(ys) - min(ys))
    sz = h / max(1e-6, max(zs) - min(zs))
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    obj.scale = (sx, sy, sz)
    obj.location = (-cx * sx, -cy * sy, -min(zs) * sz)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    return obj


def export_prop(obj, name):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    path = os.path.join(OUT_DIR, name + '.glb')
    kwargs = dict(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials='NONE',
        check_existing=False,
    )
    try:
        bpy.ops.export_scene.gltf(
            **kwargs,
            export_vertex_color='ACTIVE',
            export_all_vertex_colors=False,
            export_active_vertex_color_when_no_material=True,
        )
    except TypeError:
        # Older/newer exporter with different color kwargs — defaults export
        # the active color attribute on material-less meshes in 5.x.
        bpy.ops.export_scene.gltf(**kwargs)
    print('EXPORTED', path)


# --- Prop builders (Blender Z-up; exporter converts to glTF +Y up) ------------
# Silhouettes mirror propkit.js's procedural builds (same footprints/heights),
# with bevels, more segments, and better proportions.

def build_tree_blob():
    return finish_prop([
        (cone(0.3, 0.2, 1.1, (0, 0, 0.55), vertices=8, bevel=0.04), TRUNK),
        (sphere(1.15, (0, 0, 1.95), scale=(1, 1, 0.85), segments=12, rings=8), CANOPY),
        (sphere(0.72, (0.55, -0.25, 2.4), segments=9, rings=6), WHITE),
    ], 'tree_blob')


def build_tree_cone():
    return finish_prop([
        (cone(0.28, 0.18, 0.9, (0, 0, 0.45), vertices=8, bevel=0.03), TRUNK),
        (cone(1.3, 0.0, 1.5, (0, 0, 1.55), vertices=10), CANOPY),
        (cone(0.95, 0.0, 1.2, (0, 0, 2.3), vertices=10), CANOPY),
        (cone(0.58, 0.0, 1.0, (0, 0, 2.95), vertices=9), WHITE),
    ], 'tree_cone')


def build_tree_lollipop():
    return finish_prop([
        (cone(0.22, 0.14, 1.8, (0, 0, 0.9), vertices=8, bevel=0.03), TRUNK),
        (sphere(0.95, (0, 0, 2.45), segments=12, rings=8), CANOPY),
        (sphere(0.52, (0.42, -0.2, 2.85), segments=9, rings=6), WHITE),
    ], 'tree_lollipop')


def build_person():
    return finish_prop([
        (box((0.13, 0.2, 0.26), (-0.085, 0, 0.13), bevel=0.03), DARK),
        (box((0.13, 0.2, 0.26), (0.085, 0, 0.13), bevel=0.03), DARK),
        (box((0.42, 0.26, 0.32), (0, 0, 0.42), bevel=0.07), WHITE),
        (box((0.11, 0.13, 0.26), (-0.27, 0, 0.44), bevel=0.04), WHITE),
        (box((0.11, 0.13, 0.26), (0.27, 0, 0.44), bevel=0.04), WHITE),
        (sphere(0.16, (0, 0, 0.66), segments=10, rings=7), SKIN),
        (sphere(0.165, (0, -0.015, 0.7), scale=(1, 1, 0.72), segments=10, rings=6), HAIR),
    ], 'person')


def build_streetlamp():
    return finish_prop([
        (cone(0.22, 0.16, 0.32, (0, 0, 0.16), vertices=10, bevel=0.02), MID),
        (cone(0.12, 0.085, 2.3, (0, 0, 1.45), vertices=10, bevel=0.015), WHITE),
        (arc_tube((0.45, 0, 2.4), 0.45, 0.06, 180, 90, steps=10, sides=6), WHITE),
        (box((0.35, 0.12, 0.12), (0.62, 0, 2.85), bevel=0.03), WHITE),
        (cone(0.22, 0.12, 0.3, (0.78, 0, 2.72), vertices=10), LAMP_HEAD),
        (sphere(0.09, (0.78, 0, 2.58), segments=8, rings=6), LAMP_HEAD),
    ], 'streetlamp')


def build_car():
    return finish_prop([
        (box((2.0, 4.2, 0.82), (0, 0, 0.8), bevel=0.14), WHITE),
        (box((1.64, 1.9, 0.72), (0, -0.15, 1.52), bevel=0.12), CAR_GLASS),
        (box((2.02, 0.22, 0.22), (0, 2.05, 0.55), bevel=0.05), CAR_TRIM),
        (box((2.02, 0.22, 0.22), (0, -2.05, 0.55), bevel=0.05), CAR_TRIM),
        (box((0.3, 0.08, 0.16), (-0.62, 2.12, 0.85), bevel=0.03), LAMP_HEAD),
        (box((0.3, 0.08, 0.16), (0.62, 2.12, 0.85), bevel=0.03), LAMP_HEAD),
        (wheel(0.39, 0.36, (1.0, 1.34, 0.39)), CAR_WHEEL),
        (wheel(0.39, 0.36, (-1.0, 1.34, 0.39)), CAR_WHEEL),
        (wheel(0.39, 0.36, (1.0, -1.34, 0.39)), CAR_WHEEL),
        (wheel(0.39, 0.36, (-1.0, -1.34, 0.39)), CAR_WHEEL),
    ], 'car')


# --- Buildings ---------------------------------------------------------------
# Art target: assets/references/holeio — geometry + flat colour, no textures.
# Per-floor window bands broken by mullions, chunky cornices/floor ledges, a
# recessed glazed ground floor with an entrance, a parapet with a distinct roof
# deck colour, and roof plant (AC units, water tank, stair housing, mast).
#
# TARGET BOXES below are the *procedural* bounding boxes propkit builds for
# each tier (buildBuilding + DIMENSIONS), including the parts that overshoot
# the nominal w/h/d: the window bands flare the footprint to w*1.02, the door
# proudness adds 0.09 on +z (small tier only), and on the tiered mid/large the
# setback + antenna + beacon carry the top well past `h`:
#   small   w7  h11  -> 7.14 x 7.16 x 11.00
#   medium  w11 h24  -> 11.22 x 11.22 x 35.83   (h + 0.22h setback + 0.25h mast + beacon)
#   large   w15 h42  -> 15.30 x 15.30 x 62.49
# Each builder ends in fit_to_box() so the exported mesh matches byte-for-byte
# and the runtime normalization introduces zero distortion.

BUILDING_BOXES = {
    'building_small': (7.14, 7.16, 11.00),
    'building_medium': (11.22, 11.22, 35.83),
    'building_large': (15.30, 15.30, 62.49),
}


def window_mullions(half, z, height, thickness=0.36, offset=1.65):
    """Four thin slabs that split a wrap-around window band into three windows
    per face. Each slab is thin on one axis and OVERSHOOTS the band on the
    other, so it only surfaces on the two faces it is meant to divide — three
    windows on all four elevations for 4 boxes instead of 12."""
    return [
        (box((thickness, half * 2, height), (-offset, 0, z)), WALL),
        (box((thickness, half * 2, height), (offset, 0, z)), WALL),
        (box((half * 2, thickness, height), (0, -offset, z)), WALL),
        (box((half * 2, thickness, height), (0, offset, z)), WALL),
    ]


def build_building_small():
    """Tier 4 — squat 3-storey corner shophouse. Silhouette cue: WIDE, with a
    recessed glazed shopfront under a striped-awning overhang and a single
    chunky parapet. No mast: this tier must read as the "small" rung."""
    parts = [
        (box((6.30, 6.30, 9.90), (0, 0, 4.95)), WALL),
        # Recessed glazed ground floor — the upper floors overhang it.
        (box((5.90, 5.90, 3.40), (0, 0, 1.70)), WALL_DARK),
        (box((6.05, 6.05, 2.10), (0, 0, 1.95)), WINDOW),
        (box((1.40, 0.22, 2.60), (-1.75, 3.02, 1.30)), DOOR_GLASS),
        (box((1.90, 0.55, 0.22), (-1.75, 3.20, 0.11)), WALL_LIGHT),
        # Awning: tilted slab reaching exactly to the cornice line (y 3.575).
        (box((4.40, 0.66, 0.26), (0.55, 3.22, 3.18), rot_x=-22.0), AWNING),
        (box((2.60, 0.16, 0.70), (0.40, 3.20, 4.10)), TRIM),
        (box((7.14, 7.16, 0.36), (0, 0, 3.58)), WALL_LIGHT),
        (box((6.45, 6.45, 1.80), (0, 0, 5.35)), WINDOW),
    ]
    parts += window_mullions(3.30, 5.35, 1.80)
    parts += [
        (box((7.00, 7.00, 0.30), (0, 0, 6.42)), WALL_LIGHT),
        (box((6.45, 6.45, 1.80), (0, 0, 7.90)), WINDOW),
    ]
    parts += window_mullions(3.30, 7.90, 1.80)
    parts += [
        (box((7.14, 7.16, 0.72), (0, 0, 10.04)), WALL_LIGHT),
        (box((6.40, 6.40, 0.30), (0, 0, 9.83)), ROOF),
        (box((1.50, 1.20, 0.70), (1.50, -1.30, 10.33)), TRIM),
        (box((1.10, 0.90, 0.12), (1.50, -1.30, 10.74)), WALL_DARK),
        (box((2.00, 1.80, 1.02), (-1.40, 1.10, 10.49)), WALL),
        (cyl(0.18, 0.85, (-0.30, -2.10, 10.40), vertices=6), TRIM),
    ]
    prop = finish_prop(parts, 'building_small')
    return fit_to_box(prop, *BUILDING_BOXES['building_small'])


def build_building_medium():
    """Tier 5 — mid-rise block. Silhouette cue: HORIZONTAL — five strongly
    ledged floors over a tall glazed podium, one setback crowned with a water
    tank on a stand, then a short mast."""
    parts = [
        (box((10.60, 10.60, 24.00), (0, 0, 12.00)), WALL),
        (box((10.95, 10.95, 3.80), (0, 0, 1.90)), WALL_DARK),
        (box((11.10, 11.10, 2.30), (0, 0, 1.95)), WINDOW),
        (box((2.40, 0.24, 3.00), (0, 5.48, 1.50)), DOOR_GLASS),
        (box((3.80, 0.80, 0.34), (0, 5.20, 3.30)), TRIM),
        (box((11.22, 11.22, 0.52), (0, 0, 4.06)), WALL_LIGHT),
    ]
    for i in range(5):
        base = 4.32 + i * 3.82
        parts.append((box((10.90, 10.90, 2.30), (0, 0, base + 1.35)), WINDOW))
        parts.append((box((11.08, 11.08, 0.36), (0, 0, base + 3.60)), WALL_LIGHT))
    parts += [
        (box((11.22, 11.22, 1.10), (0, 0, 23.85)), WALL_LIGHT),
        (box((7.30, 7.30, 5.28), (0, 0, 26.64)), WALL),
        (box((7.45, 7.45, 2.40), (0, 0, 26.40)), WINDOW),
        (box((7.70, 7.70, 0.76), (0, 0, 28.90)), WALL_LIGHT),
        (box((7.00, 7.00, 0.30), (0, 0, 28.67)), ROOF),
        (box((1.80, 1.80, 0.60), (2.10, -1.70, 29.12)), WALL_DARK),
        (cyl(1.00, 1.70, (2.10, -1.70, 30.27), vertices=8), TRIM),
        (box((1.90, 1.50, 0.95), (-2.30, 1.70, 29.30)), TRIM),
        (box((2.30, 2.10, 1.40), (-2.00, -2.10, 29.52)), WALL),
        (box((1.10, 1.10, 0.50), (0, 0, 29.53)), TRIM),
        (cyl(0.34, 6.00, (0, 0, 32.28), vertices=6), TRIM),
        (sphere(0.55, (0, 0, 35.28), segments=6, rings=3), BEACON),
    ]
    prop = finish_prop(parts, 'building_medium')
    return fit_to_box(prop, *BUILDING_BOXES['building_medium'])


def build_building_large():
    """Tier 6 — curtain-wall tower. Silhouette cue: VERTICAL — four corner
    pilasters running the full shaft, sparse spandrel ledges, a TWO-step
    tapering crown and a long mast, so it never reads as a taller medium."""
    parts = [
        (box((14.90, 14.90, 6.20), (0, 0, 3.10)), WALL_DARK),
        (box((15.05, 15.05, 3.80), (0, 0, 2.70)), WINDOW),
        (box((3.40, 0.30, 4.20), (0, 7.42, 2.10)), DOOR_GLASS),
        (box((5.20, 1.20, 0.50), (0, 7.05, 4.85)), TRIM),
        (box((15.30, 15.30, 0.75), (0, 0, 6.32)), WALL_LIGHT),
        (box((14.10, 14.10, 35.10), (0, 0, 23.75)), WALL),
        (box((14.35, 14.35, 33.00), (0, 0, 23.60)), WINDOW),
    ]
    for sx in (-6.60, 6.60):
        for sy in (-6.60, 6.60):
            parts.append((box((1.60, 1.60, 34.60), (sx, sy, 23.60)), WALL))
    for i in range(6):
        parts.append((box((14.50, 14.50, 0.40), (0, 0, 10.50 + i * 5.60)), WALL_LIGHT))
    parts += [
        (box((15.30, 15.30, 0.90), (0, 0, 41.30)), WALL_LIGHT),
        (box((11.60, 11.60, 5.20), (0, 0, 43.90)), WALL),
        (box((11.75, 11.75, 3.00), (0, 0, 43.70)), WINDOW),
        (box((12.10, 12.10, 0.60), (0, 0, 46.30)), WALL_LIGHT),
        (box((8.40, 8.40, 4.74), (0, 0, 48.87)), WALL),
        (box((8.55, 8.55, 2.60), (0, 0, 48.60)), WINDOW),
        (box((8.90, 8.90, 0.80), (0, 0, 50.84)), WALL_LIGHT),
        (box((8.10, 8.10, 0.32), (0, 0, 50.60)), ROOF),
        (box((2.30, 1.80, 1.10), (2.30, -1.90, 51.31)), TRIM),
        (box((2.60, 2.30, 1.70), (-2.10, 1.70, 51.61)), WALL),
        (box((1.40, 1.40, 0.70), (0, 0, 51.59)), TRIM),
        (cyl(0.42, 10.50, (0, 0, 56.49), vertices=6), TRIM),
        (sphere(0.75, (0, 0, 61.74), segments=6, rings=3), BEACON),
    ]
    prop = finish_prop(parts, 'building_large')
    return fit_to_box(prop, *BUILDING_BOXES['building_large'])


BUILDERS = [
    build_tree_blob,
    build_tree_cone,
    build_tree_lollipop,
    build_person,
    build_streetlamp,
    build_car,
    build_building_small,
    build_building_medium,
    build_building_large,
]


def main():
    for build in BUILDERS:
        clean_scene()
        prop = build()
        export_prop(prop, prop.name)
    print('PROP PACK DONE ->', OUT_DIR)


# Works both ways: `blender -b --factory-startup --python <this>` (package.json
# "models") sets __name__ to '__main__', and so does running it directly under
# a bpy-as-a-python-module venv: `/path/to/venv/bin/python <this>`.
if __name__ == '__main__':
    main()
