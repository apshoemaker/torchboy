"""Builds TORCHBOY: a small boy with an enormous head, carrying a lit torch.

Run inside Blender. Produces one skinned mesh + armature with three clips
(Idle / Walk / Gather) and exports public/models/torchboy.glb.

Conventions that the browser side depends on:
  * the character FACES -Y in Blender, which becomes +Z after the glTF
    Y-up conversion - so three.js can aim him with atan2(dx, dz).
  * a bone named `flame` sits at the torch tip; the game attaches its
    PointLight to that node, so the light follows the animation for free.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_build as L
import importlib; importlib.reload(L)

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    "..", "public", "models"))

# ------------------------------------------------------------------ proportions
HEAD_C   = Vector((0, 0, 1.00))          # head centre - the whole silhouette
BROW_Z   = 0.128                         # brow height above head centre
HEAD_R   = 0.37                          # a true sphere, absurd next to the body
SHOULDER = 0.56
HIP_Z    = 0.30
HAND_R   = Vector((-0.46, -0.17, 0.33))  # torch hand, held out and forward
HAND_L   = Vector(( 0.40, -0.06, 0.28))
SH_R     = Vector((-0.20, 0, SHOULDER))
SH_L     = Vector(( 0.20, 0, SHOULDER))

TORCH_DIR = Vector((-0.34, -0.36, 1.0)).normalized()
TORCH_LEN = 0.52
TIP       = HAND_R + TORCH_DIR * TORCH_LEN
FLAME_C   = TIP + TORCH_DIR * 0.07

MATS = {
    "skin":   ((0.86, 0.60, 0.44), 0.70),
    "hair":   ((0.055, 0.035, 0.028), 0.88),
    "shirt":  ((0.13, 0.31, 0.30), 0.88),
    "pants":  ((0.10, 0.09, 0.13), 0.90),
    "boot":   ((0.055, 0.048, 0.055), 0.70),
    "eye":    ((0.02, 0.02, 0.03), 0.30),
    "wood":   ((0.20, 0.12, 0.07), 0.95),
    "wrap":   ((0.36, 0.27, 0.17), 0.95),
}


def build():
    col = L.purge("TorchBoy")
    mats = {n: L.material(f"tb_{n}", c, r) for n, (c, r) in MATS.items()}
    mats["ember"] = L.material("tb_ember", (1.0, 0.55, 0.18), 0.4,
                               emission=(1.0, 0.48, 0.14), emission_strength=6.0)

    P = L.Part()
    bm = P.bm

    # -------------------------------------------------------------- the head
    # a true sphere - the whole silhouette is this ball balanced on a small body
    P.add(L.bm_sphere(bm, HEAD_R, HEAD_C, subdiv=3), "skin", "head")

    # hair: a mohawk - a row of tapered spikes along the crest of the skull,
    # leaning back, tallest in the middle.
    SPIKES = 8
    for k in range(SPIKES):
        u = k / (SPIKES - 1)                       # 0 = brow, 1 = nape
        a = -0.80 + u * 1.75                       # angle along the crest
        d = Vector((0, -math.sin(a), math.cos(a)))
        lean = (d + Vector((0, 0.30, 0))).normalized()
        hgt = 0.10 + 0.27 * math.sin(math.pi * u) ** 0.7
        base = HEAD_C + d * (HEAD_R - 0.03)
        P.add(L.bm_limb(bm, base, base + lean * (0.06 + hgt), 0.115, taper=0.10),
              "hair", "head")

    # eyes on their OWN bones so the game can blink and widen them: a face that
    # never blinks reads as a prop, not a character
    for sx, bone in ((-1, "eye.R"), (1, "eye.L")):
        P.add(L.bm_sphere(bm, 0.052, HEAD_C + Vector((0.150 * sx, -0.315, 0.02)),
                          subdiv=2, scale=(1.0, 0.60, 1.15)), "eye", bone)

    # eyebrows: separate objects on their own bones so they can act
    for sx, bone in ((-1, "brow.R"), (1, "brow.L")):
        P.add(L.bm_rbox(bm, (0.125, 0.048, 0.032),
                        HEAD_C + Vector((0.150 * sx, -0.310, BROW_Z)),
                        bevel=0.013, segments=2), "hair", bone)

    # ears, flat discs on the equator
    for sx in (-1, 1):
        P.add(L.bm_sphere(bm, 0.085, HEAD_C + Vector((HEAD_R * 0.94 * sx, 0.01, -0.03)),
                          subdiv=2, scale=(0.42, 0.85, 1.1)), "skin", "head")

    # -------------------------------------------------------------- the body
    P.add(L.bm_rbox(bm, (0.34, 0.24, 0.30), (0, 0, 0.46), bevel=0.07), "shirt", "spine")
    P.add(L.bm_rbox(bm, (0.30, 0.22, 0.14), (0, 0, HIP_Z + 0.02), bevel=0.05), "pants", "hips")
    P.add(L.bm_limb(bm, (0, 0, 0.60), (0, 0, 0.66), 0.15), "skin", "head")  # neck

    # arms - modelled already in pose, so the rest pose reads as "carrying"
    P.add(L.bm_limb(bm, SH_R, HAND_R, 0.115, taper=0.8), "shirt", "arm.R")
    P.add(L.bm_limb(bm, SH_L, HAND_L, 0.115, taper=0.8), "shirt", "arm.L")
    P.add(L.bm_sphere(bm, 0.085, HAND_R, subdiv=2), "skin", "arm.R")
    P.add(L.bm_sphere(bm, 0.085, HAND_L, subdiv=2), "skin", "arm.L")

    # legs + boots
    for sx, bone in ((-1, "leg.R"), (1, "leg.L")):
        hip = Vector((0.105 * sx, 0, HIP_Z))
        foot = Vector((0.115 * sx, 0, 0.055))
        P.add(L.bm_limb(bm, hip, foot, 0.135, taper=0.85), "pants", bone)
        P.add(L.bm_rbox(bm, (0.16, 0.25, 0.11), (0.115 * sx, -0.035, 0.055),
                        bevel=0.045), "boot", bone)

    # -------------------------------------------------------------- the torch
    P.add(L.bm_limb(bm, HAND_R - TORCH_DIR * 0.09, TIP, 0.055, taper=1.35),
          "wood", "torch")
    P.add(L.bm_limb(bm, TIP - TORCH_DIR * 0.13, TIP - TORCH_DIR * 0.04, 0.10),
          "wrap", "torch")
    # ember at the tip: small, emissive, and the anchor for the game's light
    P.add(L.bm_sphere(bm, 0.075, FLAME_C, subdiv=2, scale=(1.0, 1.0, 1.35)),
          "ember", "flame")

    mesh_ob = P.bake("TorchBoyMesh", col, mats)

    # -------------------------------------------------------------- armature
    arm_data = bpy.data.armatures.new("TorchBoyRig")
    rig = bpy.data.objects.new("TorchBoyRig", arm_data)
    col.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    bone("root",  (0, 0, 0),          (0, 0, 0.14))
    bone("hips",  (0, 0, HIP_Z),      (0, 0, 0.44), "root")
    bone("spine", (0, 0, 0.44),       (0, 0, 0.62), "hips", True)
    bone("head",  (0, 0, 0.62),       (0, 0, 1.36), "spine", True)
    bone("leg.R", (-0.105, 0, HIP_Z), (-0.115, 0, 0.02), "hips")
    bone("leg.L", ( 0.105, 0, HIP_Z), ( 0.115, 0, 0.02), "hips")
    for sx, nm in ((-1, "brow.R"), (1, "brow.L")):
        bh = HEAD_C + Vector((0.150 * sx, -0.310, BROW_Z))
        bone(nm, bh, bh + Vector((0, 0, 0.07)), "head")
    # eye bones sit AT the eye centre and point up, so local-Y scale squashes
    # the eye about its own middle - that is the blink
    for sx, nm in ((-1, "eye.R"), (1, "eye.L")):
        eh = HEAD_C + Vector((0.150 * sx, -0.315, 0.02))
        bone(nm, eh, eh + Vector((0, 0, 0.06)), "head")
    bone("arm.R", SH_R, HAND_R, "spine")
    bone("arm.L", SH_L, HAND_L, "spine")
    bone("torch", HAND_R, TIP, "arm.R", True)
    bone("flame", TIP, TIP + TORCH_DIR * 0.14, "torch", True)
    bpy.ops.object.mode_set(mode='OBJECT')

    mesh_ob.parent = rig
    mod = mesh_ob.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
    return rig, mesh_ob, col


# ------------------------------------------------------------------ animation
# Clips are BAKED BY SAMPLING continuous functions, not by hand-placing a few
# keyframes and trusting Bezier handles. Sampling gives genuinely fluid motion
# with no handle overshoot and no flat spots at the extremes, and the loop is
# seamless by construction because every term is periodic over the cycle.
#
# Axis note, learned the hard way: a bone's LOCAL Y runs along the bone. Every
# bone here is authored pointing +Z (world up), so pose-space location (0, y, 0)
# moves it VERTICALLY and (0, 0, z) moves it forward/back. An earlier version
# bobbed the root on local Z and pushed him back and forth instead of up.
TAU = math.pi * 2


def key(rig, frame, poses):
    """poses: {bone: (rot_xyz | None, loc | None)}"""
    for name, (rot, loc) in poses.items():
        pb = rig.pose.bones.get(name)
        if pb is None:
            continue
        if rot is not None:
            pb.rotation_euler = rot
            pb.keyframe_insert("rotation_euler", frame=frame)
        if loc is not None:
            pb.location = loc
            pb.keyframe_insert("location", frame=frame)


def sample_action(rig, name, frames, fn, step=1, loop=True):
    """Bake fn(t) for t in [0,1] across `frames`, one key every `step` frames."""
    act = L.new_action(rig, name)
    f = 1
    while f <= frames + (1 if loop else 0):
        key(rig, f, fn(min(1.0, (f - 1) / float(frames))))
        f += step
    if loop:
        key(rig, frames + 1, fn(0.0))       # close the cycle exactly
    for fc in L.fcurves_of(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'     # the curve is already smooth
    L.stash(rig, act)
    return act


def idle_pose(t):
    """Breathing, a slow weight shift, and a heavy head that drifts and lags."""
    a = TAU * t
    breath = math.sin(a)
    shift = math.sin(a - 0.7)          # weight rocks foot to foot, behind breath
    drift = math.sin(2 * a + 1.1)
    look = math.sin(a + 2.0)
    return {
        "root":  ((0, 0, 0), (0.022 * shift, 0.030 * breath, 0)),
        "hips":  ((0.025 * breath, 0, 0.070 * shift), None),
        "spine": ((-0.055 * breath, 0, -0.040 * shift), None),
        # the head is most of his silhouette, so it carries the idle
        "head":  ((0.060 * breath + 0.035 * drift, 0.135 * look, 0.060 * shift), None),
        "arm.R": ((0.070 * breath, 0, 0.030 * drift), None),
        "arm.L": ((-0.095 * breath, 0, 0.045 * shift), None),
        "torch": ((0.080 * drift, 0, 0.040 * breath), None),
        "leg.R": ((0.030 * shift, 0, 0), None),
        "leg.L": ((-0.030 * shift, 0, 0), None),
        "brow.L": ((0, 0, -0.060 * drift), (0, 0.007 * breath, 0)),
        "brow.R": ((0, 0, 0.060 * drift), (0, 0.007 * breath, 0)),
    }


def walk_pose(t):
    """Two steps per cycle. The head lags the body - it is heavy."""
    a = TAU * t
    stride = math.sin(a)               # +1 = right leg forward
    bob = -math.cos(2 * a)             # two rises per cycle, low at contact
    lag = math.sin(a - 0.9)            # heavy-head delay
    return {
        "root":  ((0, 0, 0), (0.030 * stride, 0.070 * (bob * 0.5 + 0.5), 0)),
        "hips":  ((0.030, 0, -0.085 * stride), None),
        "spine": ((0.070, 0, 0.105 * stride), None),
        "head":  ((-0.105 * (bob * 0.5 + 0.5) + 0.05, 0.090 * lag, -0.075 * lag), None),
        # A longer stride buys ground per cycle, which is what stops the feet
        # sliding. sin() saturates past ~1.2rad, so this is close to the most a
        # 0.28-long leg can cover.
        "leg.R": ((1.020 * stride, 0, 0), None),
        "leg.L": ((-1.020 * stride, 0, 0), None),
        "arm.R": ((-0.130 * stride, 0, 0), None),   # braced: the torch stays up
        "arm.L": ((0.660 * stride, 0, 0), None),
        "torch": ((0.090 * lag, 0, 0), None),
        # set determined, bobbing with the stride and cocked slightly off-phase
        "brow.L": ((0, 0, 0.150 + 0.070 * stride), (0, 0.011 * bob, 0)),
        "brow.R": ((0, 0, -0.150 + 0.070 * stride), (0, 0.011 * bob, 0)),
    }


def gather_pose(t):
    """Crouch, reach down, straighten. Kept short - it locks player control."""
    e = math.sin(math.pi * min(1.0, t * 1.15)) ** 0.8      # 0 -> 1 -> 0
    reach = math.sin(math.pi * min(1.0, max(0.0, (t - 0.15) / 0.7)))
    return {
        "root":  ((0, 0, 0), (0, -0.10 * e, 0)),
        "hips":  ((0.22 * e, 0, 0), None),
        "spine": ((0.34 * e, 0, 0), None),
        "head":  ((0.40 * e, 0, 0), None),
        "arm.R": ((0.95 * e + 0.30 * reach, 0, -0.35 * e), None),
        "arm.L": ((0.60 * e, 0, 0.32 * e), None),
        "torch": ((0.20 * e, 0, 0), None),
        "leg.R": ((0.26 * e, 0, 0), None),
        "leg.L": ((0.26 * e, 0, 0), None),
        "brow.L": ((0, 0, 0.34 * e), (0, -0.012 * e, 0)),
        "brow.R": ((0, 0, -0.34 * e), (0, -0.012 * e, 0)),
    }


def animate(rig):
    if rig.animation_data:
        rig.animation_data.action = None
        for t in list(rig.animation_data.nla_tracks):
            rig.animation_data.nla_tracks.remove(t)
    L.drop_actions({"Idle", "Walk", "Refuel", "Gather"})

    sample_action(rig, "Idle", 120, idle_pose, step=2)
    sample_action(rig, "Walk", 24, walk_pose, step=1)
    sample_action(rig, "Gather", 30, gather_pose, step=1, loop=False)
    rig.animation_data.action = None


def export(col):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "torchboy.glb")
    for ob in bpy.context.scene.objects:
        ob.select_set(ob.users_collection and col in ob.users_collection)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
        export_animations=True, export_animation_mode='ACTIONS',
        export_bake_animation=True, export_optimize_animation_size=False,
        export_def_bones=False, export_rest_position_armature=True,
        export_materials='EXPORT', export_cameras=False, export_lights=False,
    )
    return path, os.path.getsize(path)


rig, mesh_ob, col = build()
animate(rig)
path, size = export(col)
result = {
    "verts": len(mesh_ob.data.vertices),
    "tris": len(mesh_ob.data.loop_triangles) or sum(len(p.vertices) - 2 for p in mesh_ob.data.polygons),
    "bones": [b.name for b in rig.data.bones],
    "actions": [a.name for a in bpy.data.actions],
    "glb": path, "bytes": size,
}
