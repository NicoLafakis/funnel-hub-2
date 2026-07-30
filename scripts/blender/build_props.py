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
#     lamp pole). 1.0 = full tint, lower = darker shade. NOTE: values ABOVE 1.0
#     do NOT survive — the glTF exporter clamps COLOR_0 to [0,1] — so a
#     "lighter than the tint" step is impossible; build the ladder downward
#     from 1.0 instead (see WALL_LIGHT / WALL / WALL_DARK below).
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
WINDOW = srgb('#a8c4d4')         # fixed, glazing (light sky-reflecting glass)
TRIM = srgb('#72777a')           # fixed, roof plant / canopies (== PALETTE_TRIM_TINT; lifted 0011 task 7 from #5f6b7a)
DOOR_GLASS = srgb('#7190a1')     # fixed, ground-floor glazing (== PALETTE_GLASS_TINT; lifted 0011 task 7 from #38495e — propkit.js liftAuthoredBand remaps old bakes until this is regenerated on a Blender machine)
ROOF = srgb('#8b93a2')           # fixed, roof deck — a distinct slate value
AWNING = srgb('#e2725b')         # fixed, shopfront awning pop (Hole.io refs)
BEACON = srgb('#ff3b30')         # fixed, mast-tip aviation light (matches propkit)
WOOD = srgb('#8a6a4a')           # fixed, cedar water-tower tanks

WHITE = (1.0, 1.0, 1.0)          # tintable, full strength
CANOPY = (0.85, 0.85, 0.85)      # tintable, canopy body (tufts stay WHITE = lighter)
MID = (0.75, 0.75, 0.75)         # tintable, mid shade (lamp base)
DARK = (0.5, 0.5, 0.5)           # tintable, darker shade (person legs)

# Three-step tintable ladder for the buildings. COLOR_0 clamps at 1.0, so the
# LIGHTEST step is the full metro accent and the facade sits below it — that is
# what makes cornices/ledges/parapets read as pale trim over a coloured wall,
# the way the Hole.io references do.
WALL_LIGHT = (1.0, 1.0, 1.0)     # tintable, cornices / floor ledges / parapets
WALL = (0.86, 0.86, 0.86)        # tintable, main facade
WALL_DARK = (0.62, 0.62, 0.62)   # tintable, recessed ground floor / podium

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


def box(dims, loc, bevel=0.0, rot_x=0.0, rot_y=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = (dims[0], dims[1], dims[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rot_x or rot_y:
        o.rotation_euler = (math.radians(rot_x), math.radians(rot_y), 0)
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
    # Archetype variants share their tier's box: tiers are rescaled at runtime
    # onto the procedural bounding boxes, so consistency with the base three is
    # what keeps gameplay radii identical across a district.
    'building_small_brownstone': (7.14, 7.16, 11.00),
    'building_small_storefront': (7.14, 7.16, 11.00),
    'building_small_warehouse': (7.14, 7.16, 11.00),
    'building_small_rowhouse': (7.14, 7.16, 11.00),
    'building_medium_loft': (11.22, 11.22, 35.83),
    'building_medium_deco': (11.22, 11.22, 35.83),
    'building_medium_office': (11.22, 11.22, 35.83),
    'building_medium_hotel': (11.22, 11.22, 35.83),
    'building_large_slab': (15.30, 15.30, 62.49),
    'building_large_setback': (15.30, 15.30, 62.49),
    'building_large_curtain': (15.30, 15.30, 62.49),
    'building_large_cornice': (15.30, 15.30, 62.49),
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


def parapet_ring(outer, thickness, z_bottom, z_top, color=None):
    """Roof parapet as FOUR perimeter slabs, not one solid box. A solid cap
    would bury the ROOF-coloured deck inside it and leave the deck's top face
    coplanar with the cap's — the ring keeps the roof colour and the roof plant
    visible from the game's high camera, exactly like the Hole.io references."""
    if color is None:
        color = WALL_LIGHT
    half = outer / 2
    inner = half - thickness
    h = z_top - z_bottom
    z = (z_top + z_bottom) / 2
    return [
        (box((outer, thickness, h), (0, half - thickness / 2, z)), color),
        (box((outer, thickness, h), (0, -(half - thickness / 2), z)), color),
        (box((thickness, inner * 2, h), (half - thickness / 2, 0, z)), color),
        (box((thickness, inner * 2, h), (-(half - thickness / 2), 0, z)), color),
    ]


# --- Roof-furniture kit -------------------------------------------------------
# The camera looks DOWN at rooftops most of the time, so these are the
# highest-value parts in the pack. Everything takes the roof-deck top z and
# builds upward; keep silhouettes chunky (they read at 60+ m camera distance).

def parapet_with_cap(outer, thickness, z_bottom, z_top, overhang=0.18):
    """Parapet ring plus a slightly wider cap ring on top — the cap overhang
    is what makes the roofline read as a finished cornice from above."""
    return (parapet_ring(outer, thickness, z_bottom, z_top)
            + parapet_ring(outer + overhang * 2, thickness + overhang,
                           z_top, z_top + 0.16))


def ac_unit(x, y, z, w=1.40, d=1.10, h=0.60):
    """Rooftop AC condenser: TRIM body with a dark fan grille on top."""
    return [
        (box((w, d, h), (x, y, z + h / 2)), TRIM),
        (box((w * 0.72, d * 0.72, 0.12), (x, y, z + h + 0.05)), WALL_DARK),
    ]


def vent_pipe(x, y, z, h=0.90, r=0.16):
    return [(cyl(r, h, (x, y, z + h / 2), vertices=6), TRIM)]


def mushroom_vent(x, y, z, h=0.55, r=0.30):
    return [
        (cyl(r * 0.5, h, (x, y, z + h / 2), vertices=6), TRIM),
        (cone(r, r * 0.35, r * 0.9, (x, y, z + h + r * 0.4), vertices=8), TRIM),
    ]


def water_tower(x, y, z, r=1.05, tank_h=1.80, leg_h=1.30):
    """Classic cedar rooftop tank on legs — the single most valuable roof
    silhouette for brick/older archetypes under a top-down camera."""
    parts = []
    for dx in (-r * 0.6, r * 0.6):
        for dy in (-r * 0.6, r * 0.6):
            parts.append((box((0.20, 0.20, leg_h), (x + dx, y + dy, z + leg_h / 2)), TRIM))
    parts.append((box((r * 1.7, r * 1.7, 0.16), (x, y, z + leg_h + 0.08)), TRIM))
    parts.append((cyl(r, tank_h, (x, y, z + leg_h + 0.16 + tank_h / 2), vertices=10), WOOD))
    parts.append((cone(r * 1.08, 0.0, r * 0.95,
                       (x, y, z + leg_h + 0.16 + tank_h + r * 0.45), vertices=10), WALL_DARK))
    return parts


def penthouse(x, y, z, w, d, h):
    """Elevator/stair penthouse with a glazed clerestory band and roof cap."""
    return [
        (box((w, d, h), (x, y, z + h / 2)), WALL),
        (box((w * 1.03, d * 1.03, h * 0.42), (x, y, z + h * 0.60)), WINDOW),
        (box((w * 1.06, d * 1.06, 0.18), (x, y, z + h + 0.09)), ROOF),
    ]


def chimney(x, y, z, h=2.20, w=0.62):
    return [
        (box((w, w, h), (x, y, z + h / 2)), WALL_DARK),
        (box((w * 1.35, w * 1.35, 0.24), (x, y, z + h + 0.12)), WALL_LIGHT),
    ]


def flag_pole(x, y, z, h=5.0):
    return [
        (cyl(0.09, h, (x, y, z + h / 2), vertices=6), TRIM),
        (box((0.90, 0.06, 0.55), (x + 0.48, y, z + h - 0.45)), AWNING),
        (sphere(0.14, (x, y, z + h + 0.08), segments=6, rings=4), TRIM),
    ]


def punched_row(w, z, h, n, y, win_w=0.90, win_h=None):
    """A row of n punched WINDOW slabs on one facade at depth y (front or
    back). Slightly proud of the wall so the grid reads at glancing angles."""
    win_h = win_h or h
    span = w * 0.8
    step = span / (n - 1) if n > 1 else 0.0
    parts = []
    for i in range(n):
        x = -span / 2 + i * step
        parts.append((box((win_w, 0.14, win_h), (x, y, z)), WINDOW))
    return parts


def build_building_small():
    """Tier 4 — squat 3-storey corner shophouse. Silhouette cue: WIDE and
    ledge-heavy, with a glazed shopfront under a proud awning and a single
    chunky parapet. No mast — this tier has to read as the bottom rung of the
    three-building ladder at a glance.

    The body is deliberately narrower (5.80) than the tier's nominal 7: every
    protrusion — cornices at 6.90, then the awning at 7.16 — has to fit inside
    the SAME bounding box, and the awning only reads if it out-projects the
    cornice above it instead of hiding under its overhang."""
    parts = [
        (box((6.20, 6.20, 3.30), (0, 0, 1.65)), WALL_DARK),
        (box((6.32, 6.32, 2.00), (0, 0, 1.80)), WINDOW),
        (box((1.50, 0.26, 2.45), (-1.65, 3.22, 1.225)), DOOR_GLASS),
        (box((2.00, 0.50, 0.22), (-1.65, 3.30, 0.11)), WALL_LIGHT),
        # Awning: tilted slab, the single proudest part at y = 3.58.
        (box((4.20, 0.70, 0.24), (0.55, 3.21, 2.90), rot_x=-20.0), AWNING),
        (box((6.90, 6.90, 0.44), (0, 0, 3.42)), WALL_LIGHT),
        (box((5.80, 5.80, 6.50), (0, 0, 6.65)), WALL),
        (box((2.40, 0.20, 0.66), (0.35, 2.98, 4.10)), TRIM),
        (box((5.95, 5.95, 1.75), (0, 0, 5.35)), WINDOW),
    ]
    parts += window_mullions(3.05, 5.35, 1.75, thickness=0.34, offset=1.55)
    parts += [
        (box((6.60, 6.60, 0.30), (0, 0, 6.45)), WALL_LIGHT),
        (box((5.95, 5.95, 1.75), (0, 0, 7.90)), WINDOW),
    ]
    parts += window_mullions(3.05, 7.90, 1.75, thickness=0.34, offset=1.55)
    parts += [(box((6.30, 6.30, 0.40), (0, 0, 9.96)), ROOF)]
    parts += parapet_with_cap(6.90, 0.40, 9.70, 10.62)
    parts += ac_unit(1.20, -1.05, 10.16)
    parts += ac_unit(2.00, 1.60, 10.16, 1.00, 0.85, 0.50)
    parts += penthouse(-1.20, 1.00, 10.16, 1.90, 1.70, 0.90)
    parts += vent_pipe(-0.10, -1.85, 10.16, 0.78)
    parts += mushroom_vent(-2.10, -1.70, 10.16)
    prop = finish_prop(parts, 'building_small')
    return fit_to_box(prop, *BUILDING_BOXES['building_small'])


def build_building_medium():
    """Tier 5 — mid-rise block. Silhouette cue: HORIZONTAL — five ribbon-window
    floors separated by proud ledges over a dark glazed podium, then ONE setback
    carrying a water tank / AC / stair housing and a short mast."""
    parts = [
        (box((10.60, 10.60, 24.00), (0, 0, 12.00)), WALL),
        (box((10.75, 10.75, 3.80), (0, 0, 1.90)), WALL_DARK),
        (box((10.90, 10.90, 2.30), (0, 0, 1.95)), WINDOW),
        (box((2.40, 0.28, 3.00), (0, 5.47, 1.50)), DOOR_GLASS),
        (box((3.80, 0.70, 0.34), (0, 5.26, 3.30)), TRIM),
        (box((11.22, 11.22, 0.62), (0, 0, 4.01)), WALL_LIGHT),
    ]
    for i in range(5):
        base = 4.32 + i * 3.82
        parts.append((box((10.90, 10.90, 2.30), (0, 0, base + 1.35)), WINDOW))
        parts.append((box((11.08, 11.08, 0.36), (0, 0, base + 3.60)), WALL_LIGHT))
        parts += window_mullions(5.52, base + 1.35, 2.30, thickness=0.42, offset=2.70)
    parts += [
        (box((11.22, 11.22, 1.10), (0, 0, 23.85)), WALL_LIGHT),
        (box((7.30, 7.30, 4.60), (0, 0, 26.30)), WALL),
        (box((7.45, 7.45, 2.40), (0, 0, 26.30)), WINDOW),
        (box((7.10, 7.10, 0.36), (0, 0, 28.70)), ROOF),
    ]
    parts += parapet_with_cap(7.70, 0.36, 28.40, 29.28)
    parts += water_tower(2.00, -1.60, 28.88, r=0.95, tank_h=1.60, leg_h=1.10)
    parts += ac_unit(-2.20, 1.60, 28.88, 1.90, 1.50, 0.95)
    parts += penthouse(-1.90, -2.00, 28.88, 2.30, 2.10, 1.40)
    parts += vent_pipe(0.60, 2.60, 28.88, 1.00)
    parts += [
        (cyl(0.34, 6.00, (0, 0, 32.28), vertices=6), TRIM),
        (sphere(0.55, (0, 0, 35.28), segments=6, rings=3), BEACON),
    ]
    prop = finish_prop(parts, 'building_medium')
    return fit_to_box(prop, *BUILDING_BOXES['building_medium'])


def build_building_large():
    """Tier 6 — curtain-wall tower. Silhouette cue: VERTICAL — four corner
    pilasters running the full shaft, sparse spandrel ledges, and a TWO-step
    tapering crown under a long mast, so it never reads as a taller medium."""
    parts = [
        (box((14.90, 14.90, 6.20), (0, 0, 3.10)), WALL_DARK),
        (box((15.05, 15.05, 3.80), (0, 0, 2.70)), WINDOW),
        (box((3.40, 0.30, 4.20), (0, 7.50, 2.10)), DOOR_GLASS),
        (box((5.20, 0.70, 0.50), (0, 7.30, 4.85)), TRIM),
        (box((15.30, 15.30, 0.75), (0, 0, 6.32)), WALL_LIGHT),
        (box((14.10, 14.10, 35.10), (0, 0, 23.75)), WALL),
        (box((14.35, 14.35, 33.00), (0, 0, 23.60)), WINDOW),
    ]
    for sx in (-6.60, 6.60):
        for sy in (-6.60, 6.60):
            parts.append((box((1.60, 1.60, 34.60), (sx, sy, 23.60)), WALL))
    for i in range(5):
        parts.append((box((14.50, 14.50, 0.42), (0, 0, 11.00 + i * 5.80)), WALL_LIGHT))
    parts += [
        (box((15.30, 15.30, 0.90), (0, 0, 41.30)), WALL_LIGHT),
        (box((11.60, 11.60, 5.20), (0, 0, 43.90)), WALL),
        (box((11.75, 11.75, 3.00), (0, 0, 43.70)), WINDOW),
        (box((12.10, 12.10, 0.60), (0, 0, 46.30)), WALL_LIGHT),
        (box((8.40, 8.40, 4.00), (0, 0, 48.50)), WALL),
        (box((8.55, 8.55, 2.40), (0, 0, 48.50)), WINDOW),
        (box((8.20, 8.20, 0.40), (0, 0, 50.62)), ROOF),
    ]
    parts += parapet_with_cap(12.10, 0.36, 46.10, 46.90)
    parts += ac_unit(4.60, 4.60, 46.60, 1.60, 1.30, 0.70)
    parts += ac_unit(-4.60, -4.60, 46.60, 1.40, 1.15, 0.60)
    parts += vent_pipe(-4.60, 4.40, 46.60, 1.00)
    parts += parapet_with_cap(8.90, 0.40, 50.30, 51.24)
    parts += ac_unit(2.20, -1.80, 50.82, 2.30, 1.80, 1.10)
    parts += penthouse(-2.00, 1.70, 50.82, 2.60, 2.30, 1.70)
    parts += vent_pipe(2.60, 2.40, 50.82, 1.10)
    parts += [
        (cyl(0.42, 10.50, (0, 0, 56.49), vertices=6), TRIM),
        (sphere(0.75, (0, 0, 61.74), segments=6, rings=3), BEACON),
    ]
    prop = finish_prop(parts, 'building_large')
    return fit_to_box(prop, *BUILDING_BOXES['building_large'])


# --- Building archetype variants ----------------------------------------------
# Same tier boxes, same color contract (WALL*/WHITE = tintable facade ladder;
# WINDOW/TRIM/DOOR_GLASS/ROOF/AWNING/WOOD/BEACON = fixed). Each archetype gets
# a distinct top-down signature: roof furniture and roofline first, cornices
# and setbacks second, street-level read third.

def build_building_small_brownstone():
    """Chicago brownstone walk-up: raised basement + stoop, two proud bay
    windows per upper floor, a two-step cornice, and a chimney cluster."""
    parts = [
        (box((5.60, 5.60, 1.10), (0, 0, 0.55)), WALL_DARK),      # raised basement
        (box((5.60, 5.60, 8.30), (0, 0, 5.25)), WALL),           # body, z 1.10..9.40
        # Stoop: three steps up to the raised entrance on the +Y front.
        (box((1.60, 0.55, 0.36), (-1.50, 3.08, 0.18)), WALL_LIGHT),
        (box((1.60, 0.55, 0.72), (-1.50, 2.85, 0.36)), WALL_LIGHT),
        (box((1.60, 0.60, 1.10), (-1.50, 2.60, 0.55)), WALL_LIGHT),
        (box((1.10, 0.16, 2.10), (-1.50, 2.86, 2.15)), DOOR_GLASS),
        (box((1.40, 0.24, 0.26), (-1.50, 2.90, 3.32)), WALL_LIGHT),  # door lintel
    ]
    # Bay windows: two proud bays per upper floor on the front, glazed faces.
    for fi in range(2):
        z = 3.40 + fi * 3.00
        for bx in (-1.45, 1.45):
            parts.append((box((1.70, 0.55, 2.40), (bx, 2.98, z)), WALL))
            parts.append((box((1.50, 0.12, 1.90), (bx, 3.26, z)), WINDOW))
            parts.append((box((1.80, 0.62, 0.22), (bx, 2.99, z + 1.30)), WALL_LIGHT))
    # Side/rear floor bands + basement windows.
    parts.append((box((5.68, 5.68, 0.55), (0, 0, 0.60)), WINDOW))
    for fi in range(3):
        parts.append((box((5.70, 5.70, 1.20), (0, 0, 2.40 + fi * 2.60)), WINDOW))
    # Two-step cornice + roof deck.
    parts += [
        (box((6.30, 6.30, 0.50), (0, 0, 9.55)), WALL_LIGHT),
        (box((5.95, 5.95, 0.35), (0, 0, 9.95)), WALL_LIGHT),
        (box((5.60, 5.60, 0.30), (0, 0, 10.05)), ROOF),
    ]
    # Chimney cluster + a vent (the brownstone roof signature).
    parts += chimney(-1.80, -1.80, 10.20, h=2.20)
    parts += chimney(1.80, -1.60, 10.20, h=1.70)
    parts += chimney(0.20, 1.80, 10.20, h=1.95, w=0.50)
    parts += vent_pipe(2.10, 1.20, 10.20, 0.80)
    prop = finish_prop(parts, 'building_small_brownstone')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_small_storefront():
    """Corner storefront: glazed shopfront band with two awnings and a sign
    band, punched windows above, parapet with cap, small AC plant."""
    parts = [
        (box((6.40, 6.40, 3.40), (0, 0, 1.70)), WALL_DARK),
        (box((6.55, 6.55, 2.20), (0, 0, 1.75)), WINDOW),          # recessed shopfront
        (box((1.30, 0.20, 2.60), (-1.90, 3.24, 1.30)), DOOR_GLASS),
        (box((1.30, 0.20, 2.60), (1.90, 3.24, 1.30)), DOOR_GLASS),
        (box((2.60, 0.75, 0.20), (-1.90, 3.30, 2.95), rot_x=-18.0), AWNING),
        (box((2.60, 0.75, 0.20), (1.90, 3.30, 2.95), rot_x=-18.0), AWNING),
        (box((6.70, 6.70, 0.55), (0, 0, 3.72)), TRIM),            # sign band
        (box((6.10, 6.10, 5.40), (0, 0, 6.72)), WALL),            # upper floors
    ]
    for fi in range(2):
        z = 5.45 + fi * 2.60
        parts += punched_row(6.10, z, 1.50, 4, 3.09, win_w=1.00)
        parts.append((box((6.20, 6.20, 1.30), (0, 0, z)), WINDOW))  # side/rear band
    parts += [
        (box((6.80, 6.80, 0.45), (0, 0, 9.62)), WALL_LIGHT),      # cornice
        (box((6.10, 6.10, 0.30), (0, 0, 9.92)), ROOF),
    ]
    parts += parapet_with_cap(6.80, 0.36, 9.75, 10.45)
    parts += ac_unit(1.60, -1.40, 10.07)
    parts += ac_unit(-1.70, 1.30, 10.07, 1.10, 0.90, 0.50)
    parts += vent_pipe(0.20, -2.10, 10.07, 0.75)
    prop = finish_prop(parts, 'building_small_storefront')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_small_warehouse():
    """Brick loft/warehouse: flat front with loading dock + door, two tall
    bands with mullions, and a three-tooth sawtooth roof with rear vents."""
    parts = [
        (box((6.60, 6.60, 8.60), (0, 0, 4.30)), WALL),            # tall brick body
        (box((6.72, 6.72, 2.00), (0, 0, 3.20)), WINDOW),
        (box((6.72, 6.72, 2.00), (0, 0, 6.20)), WINDOW),
    ]
    parts += window_mullions(3.44, 3.20, 2.00, thickness=0.40, offset=1.70)
    parts += window_mullions(3.44, 6.20, 2.00, thickness=0.40, offset=1.70)
    parts += [
        # Loading dock + door on the front.
        (box((3.20, 0.70, 0.80), (0.80, 3.55, 0.40)), WALL_DARK),
        (box((2.40, 0.18, 3.00), (0.80, 3.34, 2.30)), TRIM),
        (box((2.80, 0.26, 0.30), (0.80, 3.36, 3.95)), WALL_LIGHT),
        (box((1.10, 0.16, 2.20), (-2.20, 3.34, 1.10)), DOOR_GLASS),  # side door
        (box((6.80, 6.80, 0.40), (0, 0, 8.72)), WALL_LIGHT),      # top band
        # Flat rear strip carries the roof deck + vents.
        (box((6.60, 1.30, 0.24), (0, 2.65, 8.98)), ROOF),
    ]
    # Sawtooth roof: three sloped slabs (rot about Y) + vertical glazing at
    # each tooth's high edge. Teeth span y -3.30..2.00, leaving the rear strip.
    for i in range(3):
        x = -2.20 + i * 2.20
        parts.append((box((2.45, 5.30, 0.24), (x, -0.65, 9.75), rot_y=24.0), WALL_LIGHT))
        parts.append((box((0.20, 5.30, 1.00), (x + 1.05, -0.65, 9.55)), WINDOW))
    for x in (-2.00, 0.00, 2.00):
        parts += mushroom_vent(x, 2.65, 9.10)
    prop = finish_prop(parts, 'building_small_warehouse')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_small_rowhouse():
    """Narrow rowhouse pair: two bodies at different heights with a party wall
    rising between them — the stepped party-wall silhouette — plus chimneys."""
    parts = [
        (box((3.30, 5.60, 8.60), (-1.70, 0, 4.30)), WALL),
        (box((3.30, 5.60, 9.80), (1.70, 0, 4.90)), WALL),
        (box((0.35, 5.60, 10.40), (0.0, 0, 5.20)), WALL_DARK),    # party wall
    ]
    for cx, top in ((-1.70, 8.60), (1.70, 9.80)):
        for fi in range(2):
            parts.append((box((3.42, 5.70, 1.10), (cx, 0, 3.20 + fi * 2.40)), WINDOW))
        parts += [
            (box((1.00, 0.16, 2.20), (cx - 0.80, 2.84, 1.10)), DOOR_GLASS),
            (box((0.90, 0.50, 0.30), (cx - 0.80, 3.02, 0.15)), WALL_LIGHT),  # stoop
            (box((1.10, 0.14, 1.30), (cx + 0.90, 2.83, 1.50)), WINDOW),      # parlour win
            (box((3.60, 5.90, 0.42), (cx, 0, top + 0.21)), WALL_LIGHT),      # cornice
            (box((3.30, 5.60, 0.24), (cx, 0, top + 0.54)), ROOF),
        ]
        parts += chimney(cx + 0.90, -1.80, top + 0.66, h=1.80)
        parts += chimney(cx - 1.00, 1.60, top + 0.66, h=1.40, w=0.50)
    prop = finish_prop(parts, 'building_small_rowhouse')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_medium_loft():
    """Brick loft (Rookery/Monadnock feel): punched window grid with pier
    relief, strong two-step cornice, water tower + penthouse on the roof."""
    parts = [
        (box((10.40, 10.40, 3.60), (0, 0, 1.80)), WALL_DARK),
        (box((10.55, 10.55, 2.20), (0, 0, 1.85)), WINDOW),
        (box((2.20, 0.26, 2.80), (0, 5.24, 1.40)), DOOR_GLASS),
        (box((10.90, 10.90, 0.60), (0, 0, 3.90)), WALL_LIGHT),    # base cornice
        (box((10.20, 10.20, 25.20), (0, 0, 16.80)), WALL),        # body to 29.40
    ]
    for fi in range(8):
        z = 5.60 + fi * 3.00
        parts += punched_row(10.20, z, 1.70, 5, 5.14, win_w=1.15)
        parts += punched_row(10.20, z, 1.70, 5, -5.14, win_w=1.15)
        parts.append((box((10.30, 10.30, 1.30), (0, 0, z)), WINDOW))  # side band
    # Pier relief: thin vertical piers between window columns, front/back.
    for x in (-3.06, 0.0, 3.06):
        parts.append((box((0.40, 0.20, 24.20), (x, 5.16, 16.80)), WALL_DARK))
        parts.append((box((0.40, 0.20, 24.20), (x, -5.16, 16.80)), WALL_DARK))
    # Strong cornice: two stacked proud slabs + roof deck.
    parts += [
        (box((10.90, 10.90, 0.70), (0, 0, 29.75)), WALL_LIGHT),
        (box((10.60, 10.60, 0.45), (0, 0, 30.30)), WALL_LIGHT),
        (box((10.20, 10.20, 0.30), (0, 0, 30.65)), ROOF),
    ]
    parts += water_tower(2.60, -2.40, 30.80, r=1.15, tank_h=2.00, leg_h=1.50)
    parts += penthouse(-2.60, 2.20, 30.80, 2.60, 2.20, 1.60)
    parts += ac_unit(2.40, 2.60, 30.80)
    parts += vent_pipe(-0.20, -3.60, 30.80, 1.20)
    parts += mushroom_vent(-3.40, -1.00, 30.80)
    prop = finish_prop(parts, 'building_medium_loft')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_medium_deco():
    """Art-deco mid-rise: vertical pier emphasis, two stepped setbacks near
    the top, crown bands + pyramid fin, sparse roof plant."""
    parts = [
        (box((10.60, 10.60, 3.40), (0, 0, 1.70)), WALL_DARK),
        (box((10.75, 10.75, 2.10), (0, 0, 1.75)), WINDOW),
        (box((2.40, 0.26, 2.80), (0, 5.41, 1.40)), DOOR_GLASS),
        (box((3.40, 0.50, 0.40), (0, 5.30, 3.10)), WALL_LIGHT),   # entry canopy
        (box((10.20, 10.20, 21.60), (0, 0, 14.40)), WALL),        # shaft to 25.20
    ]
    # Vertical piers running the full shaft on all four faces.
    for c in (-4.20, -2.10, 0.0, 2.10, 4.20):
        parts.append((box((0.55, 0.30, 21.60), (c, 5.16, 14.40)), WALL_LIGHT))
        parts.append((box((0.55, 0.30, 21.60), (c, -5.16, 14.40)), WALL_LIGHT))
        parts.append((box((0.30, 0.55, 21.60), (5.16, c, 14.40)), WALL_LIGHT))
        parts.append((box((0.30, 0.55, 21.60), (-5.16, c, 14.40)), WALL_LIGHT))
    for fi in range(6):
        parts.append((box((10.30, 10.30, 1.80), (0, 0, 6.00 + fi * 3.20)), WINDOW))
    # Setbacks + crown.
    parts += [
        (box((11.00, 11.00, 0.80), (0, 0, 25.60)), WALL_LIGHT),   # crown band 1
        (box((8.20, 8.20, 4.20), (0, 0, 27.90)), WALL),           # setback 1
        (box((8.35, 8.35, 2.20), (0, 0, 27.70)), WINDOW),
        (box((8.70, 8.70, 0.55), (0, 0, 30.20)), WALL_LIGHT),     # crown band 2
        (box((5.60, 5.60, 3.00), (0, 0, 31.95)), WALL),           # setback 2
        (box((5.75, 5.75, 1.60), (0, 0, 31.80)), WINDOW),
        (box((6.00, 6.00, 0.50), (0, 0, 33.65)), WALL_LIGHT),     # crown
        (cone(1.20, 0.30, 1.60, (0, 0, 34.70), vertices=4), WALL_LIGHT),  # fin
    ]
    # Sparse plant on the first setback terrace.
    parts += ac_unit(4.50, 4.50, 26.00, 1.00, 0.85, 0.50)
    parts += vent_pipe(-4.50, -4.50, 26.00, 0.80)
    prop = finish_prop(parts, 'building_medium_deco')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_medium_office():
    """Postwar office block: geometry ribbon-window banding (glass band +
    proud ledge per floor), parapet with cap, and a six-unit roof AC farm."""
    parts = [
        (box((10.60, 10.60, 3.20), (0, 0, 1.60)), WALL_DARK),
        (box((10.75, 10.75, 2.00), (0, 0, 1.65)), WINDOW),
        (box((2.40, 0.26, 2.60), (0, 5.41, 1.30)), DOOR_GLASS),
        (box((11.00, 11.00, 0.55), (0, 0, 3.48)), WALL_LIGHT),
        (box((10.30, 10.30, 26.60), (0, 0, 16.90)), WALL),        # slab to 30.20
    ]
    for fi in range(9):
        z = 5.20 + fi * 2.80
        parts.append((box((10.55, 10.55, 1.70), (0, 0, z)), WINDOW))
        parts.append((box((10.75, 10.75, 0.30), (0, 0, z + 1.25)), WALL_LIGHT))
    parts.append((box((10.30, 10.30, 0.30), (0, 0, 30.35)), ROOF))
    parts += parapet_with_cap(10.80, 0.40, 30.10, 31.00)
    # AC farm: 2x3 condenser grid + vents.
    for ix in (-3.00, 0.0, 3.00):
        for iy in (-2.60, 1.00):
            parts += ac_unit(ix, iy, 30.50, 1.50, 1.20, 0.65)
    parts += vent_pipe(3.20, 3.40, 30.50, 1.10)
    parts += mushroom_vent(-3.20, 3.40, 30.50)
    prop = finish_prop(parts, 'building_medium_office')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_medium_hotel():
    """Hotel mid-rise: regular punched grid with balcony strips on the front,
    entrance canopy, penthouse + water tower on the roof."""
    parts = [
        (box((10.40, 10.40, 3.60), (0, 0, 1.80)), WALL_DARK),
        (box((10.55, 10.55, 2.20), (0, 0, 1.85)), WINDOW),
        (box((2.60, 0.26, 2.90), (0, 5.24, 1.45)), DOOR_GLASS),
        (box((4.20, 1.10, 0.35), (0, 5.60, 3.20)), TRIM),         # entry canopy
        (box((10.80, 10.80, 0.55), (0, 0, 3.90)), WALL_LIGHT),
        (box((10.00, 10.00, 25.20), (0, 0, 16.80)), WALL),        # body to 29.40
    ]
    for fi in range(7):
        z = 5.60 + fi * 3.40
        parts += punched_row(10.00, z, 1.80, 6, 5.04, win_w=1.00)
        parts.append((box((9.20, 0.55, 0.18), (0, 5.20, z - 1.15)), WALL_LIGHT))  # balcony
        parts.append((box((10.10, 10.10, 1.40), (0, 0, z)), WINDOW))  # side/rear band
    parts += [
        (box((10.70, 10.70, 0.70), (0, 0, 29.75)), WALL_LIGHT),   # cornice
        (box((10.00, 10.00, 0.30), (0, 0, 30.25)), ROOF),
    ]
    parts += parapet_ring(10.70, 0.38, 29.95, 30.75)
    parts += penthouse(-2.40, 1.80, 30.40, 2.80, 2.40, 1.80)
    parts += water_tower(2.60, -2.20, 30.40, r=1.05, tank_h=1.90, leg_h=1.40)
    parts += ac_unit(2.60, 2.80, 30.40, 1.20, 1.00, 0.55)
    prop = finish_prop(parts, 'building_medium_hotel')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_large_slab():
    """Modernist slab tower (Mies feel): clean curtain mass with an expressed
    mullion grid of shallow ribs, and a rooftop mechanical screen."""
    parts = [
        (box((14.60, 14.60, 5.60), (0, 0, 2.80)), WALL_DARK),
        (box((14.75, 14.75, 3.40), (0, 0, 2.60)), WINDOW),
        (box((3.20, 0.28, 3.80), (0, 7.32, 1.90)), DOOR_GLASS),
        (box((15.10, 15.10, 0.70), (0, 0, 5.85)), WALL_LIGHT),
        (box((13.55, 13.55, 44.00), (0, 0, 28.20)), WALL),        # core
        (box((13.80, 13.80, 44.00), (0, 0, 28.20)), WINDOW),      # glass skin
    ]
    # Expressed mullions: shallow vertical ribs, 7 per face.
    for i in range(7):
        c = -6.00 + i * 2.00
        parts.append((box((0.32, 0.26, 44.00), (c, 6.95, 28.20)), WALL))
        parts.append((box((0.32, 0.26, 44.00), (c, -6.95, 28.20)), WALL))
        parts.append((box((0.26, 0.32, 44.00), (6.95, c, 28.20)), WALL))
        parts.append((box((0.26, 0.32, 44.00), (-6.95, c, 28.20)), WALL))
    # Spandrel lines.
    for i in range(8):
        parts.append((box((13.95, 13.95, 0.30), (0, 0, 9.00 + i * 5.40)), WALL))
    # Rooftop mechanical screen (a tall dark parapet ring hides the plant).
    parts.append((box((13.80, 13.80, 0.35), (0, 0, 50.35)), ROOF))
    parts += parapet_ring(13.00, 0.50, 50.50, 53.00, WALL_DARK)
    parts += parapet_ring(13.30, 0.60, 53.00, 53.18, WALL_LIGHT)  # screen cap
    prop = finish_prop(parts, 'building_large_slab')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_large_setback():
    """Setback skyscraper (Board of Trade feel): ribbed shaft, two massing
    setbacks, crown with pyramid cap, terrace plant, and a flag pole."""
    parts = [
        (box((14.80, 14.80, 5.00), (0, 0, 2.50)), WALL_DARK),
        (box((14.95, 14.95, 3.00), (0, 0, 2.40)), WINDOW),
        (box((3.40, 0.28, 4.00), (0, 7.44, 2.00)), DOOR_GLASS),
        (box((15.30, 15.30, 0.80), (0, 0, 5.40)), WALL_LIGHT),
        (box((13.60, 13.60, 24.00), (0, 0, 17.80)), WALL),        # shaft to 29.80
    ]
    # Vertical ribs on the shaft.
    for i in range(5):
        c = -5.40 + i * 2.70
        parts.append((box((0.50, 0.30, 24.00), (c, 6.85, 17.80)), WALL_LIGHT))
        parts.append((box((0.50, 0.30, 24.00), (c, -6.85, 17.80)), WALL_LIGHT))
        parts.append((box((0.30, 0.50, 24.00), (6.85, c, 17.80)), WALL_LIGHT))
        parts.append((box((0.30, 0.50, 24.00), (-6.85, c, 17.80)), WALL_LIGHT))
    for fi in range(6):
        parts.append((box((13.75, 13.75, 2.20), (0, 0, 8.40 + fi * 3.70)), WINDOW))
    # Setback 1, setback 2, crown.
    parts += [
        (box((14.20, 14.20, 0.90), (0, 0, 30.25)), WALL_LIGHT),
        (box((10.40, 10.40, 12.00), (0, 0, 36.70)), WALL),
        (box((10.55, 10.55, 9.60), (0, 0, 36.50)), WINDOW),
        (box((10.90, 10.90, 0.70), (0, 0, 43.00)), WALL_LIGHT),
        (box((7.40, 7.40, 8.00), (0, 0, 47.30)), WALL),
        (box((7.55, 7.55, 6.00), (0, 0, 47.20)), WINDOW),
        (box((7.90, 7.90, 0.60), (0, 0, 51.55)), WALL_LIGHT),
        (box((5.20, 5.20, 3.20), (0, 0, 53.45)), WALL),
        (box((5.60, 5.60, 0.55), (0, 0, 55.30)), WALL_LIGHT),
        (cone(2.20, 0.40, 2.40, (0, 0, 56.80), vertices=4), WALL_LIGHT),
    ]
    # Terrace plant on both setbacks.
    parts += ac_unit(5.60, 4.60, 30.70, 1.40, 1.10, 0.60)
    parts += ac_unit(-5.60, -4.60, 30.70, 1.40, 1.10, 0.60)
    parts += vent_pipe(4.60, -5.60, 30.70, 1.00)
    parts += ac_unit(4.40, 4.40, 43.35, 1.00, 0.90, 0.55)
    parts += flag_pole(0, 0, 55.57, h=5.50)
    prop = finish_prop(parts, 'building_large_setback')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_large_curtain():
    """Glass curtain tower: smooth glass mass with a dense vertical fin
    rhythm, thin roof cap, minimal roof plant."""
    parts = [
        (box((14.40, 14.40, 4.60), (0, 0, 2.30)), WALL_DARK),
        (box((14.55, 14.55, 2.80), (0, 0, 2.20)), WINDOW),
        (box((3.00, 0.26, 3.60), (0, 7.24, 1.80)), DOOR_GLASS),
        (box((13.40, 13.40, 48.00), (0, 0, 28.60)), WALL),        # core
        (box((13.70, 13.70, 48.00), (0, 0, 28.60)), WINDOW),      # glass skin
    ]
    # Vertical fins, 9 per face.
    for i in range(9):
        c = -6.40 + i * 1.60
        parts.append((box((0.24, 0.30, 48.00), (c, 6.92, 28.60)), WALL_LIGHT))
        parts.append((box((0.24, 0.30, 48.00), (c, -6.92, 28.60)), WALL_LIGHT))
        parts.append((box((0.30, 0.24, 48.00), (6.92, c, 28.60)), WALL_LIGHT))
        parts.append((box((0.30, 0.24, 48.00), (-6.92, c, 28.60)), WALL_LIGHT))
    parts += [
        (box((13.90, 13.90, 0.50), (0, 0, 52.85)), WALL_LIGHT),   # thin cap
        (box((13.40, 13.40, 0.30), (0, 0, 53.20)), ROOF),
    ]
    parts += penthouse(-3.00, -2.60, 53.35, 3.20, 2.60, 1.80)
    parts += ac_unit(3.20, 2.80, 53.35, 1.30, 1.10, 0.60)
    parts += vent_pipe(3.40, -3.20, 53.35, 0.90)
    prop = finish_prop(parts, 'building_large_curtain')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


def build_building_large_cornice():
    """Masonry high-rise with cornice: punched grid shaft, strong horizontal
    cornice bands at two heights, and two water towers on the roof."""
    parts = [
        (box((14.60, 14.60, 5.20), (0, 0, 2.60)), WALL_DARK),
        (box((14.75, 14.75, 3.20), (0, 0, 2.50)), WINDOW),
        (box((3.20, 0.28, 4.00), (0, 7.34, 2.00)), DOOR_GLASS),
        (box((15.30, 15.30, 0.90), (0, 0, 5.65)), WALL_LIGHT),    # base cornice
        (box((13.80, 13.80, 42.00), (0, 0, 27.10)), WALL),        # shaft to 48.10
    ]
    for fi in range(11):
        z = 7.80 + fi * 3.65
        parts += punched_row(13.80, z, 1.90, 6, 6.94, win_w=1.30)
        parts += punched_row(13.80, z, 1.90, 6, -6.94, win_w=1.30)
        parts.append((box((13.90, 13.90, 1.50), (0, 0, z)), WINDOW))  # side band
    # Cornice bands at two heights + roof deck.
    parts += [
        (box((14.60, 14.60, 0.80), (0, 0, 28.00)), WALL_LIGHT),   # mid cornice
        (box((14.90, 14.90, 1.00), (0, 0, 48.55)), WALL_LIGHT),   # crown cornice
        (box((14.20, 14.20, 0.60), (0, 0, 49.35)), WALL_LIGHT),
        (box((13.80, 13.80, 0.35), (0, 0, 49.80)), ROOF),
    ]
    parts += parapet_ring(14.60, 0.42, 49.60, 50.50)
    parts += water_tower(-3.60, -3.00, 49.98, r=1.25, tank_h=2.20, leg_h=1.60)
    parts += water_tower(3.40, 2.80, 49.98, r=1.05, tank_h=1.90, leg_h=1.40)
    parts += ac_unit(3.60, -3.40, 49.98, 1.40, 1.20, 0.60)
    parts += vent_pipe(-0.50, 3.80, 49.98, 1.20)
    parts += mushroom_vent(-3.80, 3.60, 49.98)
    prop = finish_prop(parts, 'building_large_cornice')
    return fit_to_box(prop, *BUILDING_BOXES[prop.name])


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
    build_building_small_brownstone,
    build_building_small_storefront,
    build_building_small_warehouse,
    build_building_small_rowhouse,
    build_building_medium_loft,
    build_building_medium_deco,
    build_building_medium_office,
    build_building_medium_hotel,
    build_building_large_slab,
    build_building_large_setback,
    build_building_large_curtain,
    build_building_large_cornice,
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
