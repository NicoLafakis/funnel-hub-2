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

WHITE = (1.0, 1.0, 1.0)          # tintable, full strength
CANOPY = (0.85, 0.85, 0.85)      # tintable, canopy body (tufts stay WHITE = lighter)
MID = (0.75, 0.75, 0.75)         # tintable, mid shade (lamp base)
DARK = (0.5, 0.5, 0.5)           # tintable, darker shade (person legs)

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


def box(dims, loc, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = (dims[0], dims[1], dims[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        apply_bevel(o, bevel)
    return o


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


BUILDERS = [
    build_tree_blob,
    build_tree_cone,
    build_tree_lollipop,
    build_person,
    build_streetlamp,
    build_car,
]


def main():
    for build in BUILDERS:
        clean_scene()
        prop = build()
        export_prop(prop, prop.name)
    print('PROP PACK DONE ->', OUT_DIR)


main()
