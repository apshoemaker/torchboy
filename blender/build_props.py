"""Pickups and markers, exported as props.glb.

These are separate from cavern.glb because the game CLONES them per grid tile
and animates them (bobbing, spinning, consuming). Baking them into the level
mesh would make them static and unpickable.

Root object names are the contract with src/game/Props.js:
    Prop_Fuel  Prop_Treasure  Prop_StairsDown  Prop_StairsUp  Prop_Exit
"""
import bpy, bmesh, os, sys, math
from mathutils import Vector, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_build as L
import importlib; importlib.reload(L)

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def emit(bm, name, col, mats, mapping):
    """mapping: list of (verts, material-name)."""
    order, face_mat = [], {}
    bm.faces.ensure_lookup_table()
    for verts, mname in mapping:
        if mname not in order:
            order.append(mname)
        for v in verts:
            if not v.is_valid:
                continue
            for f in v.link_faces:
                face_mat[f.index] = order.index(mname)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in order:
        me.materials.append(mats[m])
    for f in me.polygons:
        f.material_index = face_mat.get(f.index, 0)
        f.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


def build():
    col = L.purge("Props")
    M = {
        "glass":  L.material("pr_glass", (0.30, 0.22, 0.12), 0.25),
        "oil":    L.material("pr_oil", (1.0, 0.52, 0.12), 0.30,
                             emission=(1.0, 0.46, 0.10), emission_strength=4.0),
        "cork":   L.material("pr_cork", (0.32, 0.22, 0.13), 0.95),
        "iron":   L.material("pr_iron", (0.16, 0.15, 0.16), 0.55, metallic=0.85),
        "wood":   L.material("pr_wood", (0.22, 0.14, 0.09), 0.92),
        "gold":   L.material("pr_gold", (1.0, 0.78, 0.30), 0.30, metallic=0.9,
                             emission=(1.0, 0.72, 0.24), emission_strength=2.2),
        "stone":  L.material("pr_stone", (0.115, 0.108, 0.120), 0.95),
        "sky":    L.material("pr_sky", (0.55, 0.80, 1.0), 0.1,
                             emission=(0.62, 0.86, 1.0), emission_strength=5.0),
    }
    made = []

    # ---------------------------------------------------------- fuel flask
    bm = bmesh.new()
    m = []
    # the BODY is the glowing oil - a pickup sealed inside an opaque shell is
    # invisible in a dark cave, which defeats the point of hiding it
    m.append((L.bm_sphere(bm, 0.17, (0, 0, 0.17), subdiv=2, scale=(1, 1, 0.95)), "oil"))
    m.append((L.bm_cyl(bm, 0.062, 0.16, (0, 0, 0.34), segments=8), "glass"))
    m.append((L.bm_cyl(bm, 0.070, 0.06, (0, 0, 0.43), segments=8), "cork"))
    for a in (0.0, math.pi / 2):                       # iron straps over the glass
        m.append((L.bm_rbox(bm, (0.40, 0.035, 0.055), (0, 0, 0.17),
                            bevel=0.012, rot=(0, 0, a)), "iron"))
    m.append((L.bm_cyl(bm, 0.185, 0.035, (0, 0, 0.055), segments=10), "iron"))
    made.append(emit(bm, "Prop_Fuel", col, M, m))

    # ---------------------------------------------------------- treasure
    bm = bmesh.new()
    m = []
    m.append((L.bm_rbox(bm, (0.62, 0.42, 0.34), (0, 0, 0.17), bevel=0.03), "wood"))
    m.append((L.bm_rbox(bm, (0.66, 0.46, 0.06), (0, 0, 0.355), bevel=0.02), "iron"))
    m.append((L.bm_rbox(bm, (0.50, 0.30, 0.10), (0, 0, 0.40), bevel=0.02), "gold"))
    for sx in (-1, 1):
        m.append((L.bm_rbox(bm, (0.05, 0.46, 0.36), (0.26 * sx, 0, 0.18), bevel=0.012), "iron"))
    made.append(emit(bm, "Prop_Treasure", col, M, m))

    # ---------------------------------------------------------- stairs down
    # a stepped shaft: the hole is what makes the level below readable
    bm = bmesh.new()
    m = []
    for i in range(6):
        d = -0.22 * i
        m.append((L.bm_rbox(bm, (1.55, 0.30, 0.20), (0, 0.62 - i * 0.30, d), bevel=0.02), "stone"))
    for sx in (-1, 1):
        m.append((L.bm_rbox(bm, (0.22, 2.0, 1.5), (0.87 * sx, -0.15, -0.5), bevel=0.03), "stone"))
    made.append(emit(bm, "Prop_StairsDown", col, M, m))

    # ---------------------------------------------------------- stairs up
    bm = bmesh.new()
    m = []
    for i in range(5):
        m.append((L.bm_rbox(bm, (1.55, 0.30, 0.20), (0, -0.55 + i * 0.30, 0.22 * i), bevel=0.02), "stone"))
    made.append(emit(bm, "Prop_StairsUp", col, M, m))

    # ---------------------------------------------------------- the way out
    bm = bmesh.new()
    m = []
    for sx in (-1, 1):                                    # arch legs
        m.append((L.bm_rbox(bm, (0.30, 0.34, 2.1), (0.72 * sx, 0, 1.05), bevel=0.04), "stone"))
    m.append((L.bm_rbox(bm, (1.85, 0.34, 0.30), (0, 0, 2.25), bevel=0.04), "stone"))
    m.append((L.bm_rbox(bm, (1.20, 0.10, 1.95), (0, 0, 1.05), bevel=0.02), "sky"))  # daylight
    made.append(emit(bm, "Prop_Exit", col, M, m))

    return col, made


def export(col):
    out = os.path.join(ROOT, "public", "models")
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "props.glb")
    bpy.ops.object.select_all(action='DESELECT')
    for ob in col.objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_animations=False,
        export_materials='EXPORT', export_cameras=False, export_lights=False)
    return path, os.path.getsize(path)


col, made = build()
path, size = export(col)
result = {"props": [o.name for o in made],
          "tris": {o.name: len(o.data.polygons) for o in made},
          "glb": path, "kb": round(size / 1024)}
