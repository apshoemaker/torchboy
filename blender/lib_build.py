"""Shared bmesh helpers for the cavern-game asset builds.

Everything is built with bmesh rather than bpy.ops.mesh.primitive_* so the
scripts are deterministic and do not depend on operator context - they behave
identically in the GUI session and in `blender --background`.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler


def purge(collection_name):
    """Remove a collection and everything in it, so builds are idempotent."""
    col = bpy.data.collections.get(collection_name)
    if col:
        for ob in list(col.objects):
            data = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if data and data.users == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Armature):
                    bpy.data.armatures.remove(data)
        bpy.data.collections.remove(col)
    col = bpy.data.collections.new(collection_name)
    bpy.context.scene.collection.children.link(col)
    return col


def material(name, color, roughness=0.9, metallic=0.0, emission=None, emission_strength=0.0):
    """Create or update a Principled material. glTF reads base color/emission."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = (*color, 1.0)
    return mat


# ---------------------------------------------------------------- primitives
def bm_rbox(bm, size, loc=(0, 0, 0), bevel=0.06, segments=3, rot=None):
    """Rounded box - the stylised base shape for the whole character."""
    sx, sy, sz = (s / 2.0 for s in size)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.scale(bm, vec=(sx * 2, sy * 2, sz * 2), verts=verts)
    edges = list({e for v in verts for e in v.link_edges})
    bevel = min(bevel, min(sx, sy, sz) * 0.9)
    if bevel > 1e-5:
        res = bmesh.ops.bevel(bm, geom=verts + edges, offset=bevel,
                              segments=segments, profile=0.5, affect='EDGES')
        verts = [v for v in res["verts"]] + verts
    verts = list({v for v in verts if v.is_valid})
    if rot:
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0),
                         matrix=Euler(rot, 'XYZ').to_matrix())
    bmesh.ops.translate(bm, verts=verts, vec=loc)
    return verts


def bm_sphere(bm, radius, loc=(0, 0, 0), subdiv=2, scale=(1, 1, 1)):
    verts = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)["verts"]
    if scale != (1, 1, 1):
        bmesh.ops.scale(bm, vec=scale, verts=verts)
    bmesh.ops.translate(bm, verts=verts, vec=loc)
    return verts


def bm_cyl(bm, radius, depth, loc=(0, 0, 0), segments=10, rot=None, cap=True):
    verts = bmesh.ops.create_cone(
        bm, cap_ends=cap, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=depth)["verts"]
    if rot:
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0),
                         matrix=Euler(rot, 'XYZ').to_matrix())
    bmesh.ops.translate(bm, verts=verts, vec=loc)
    return verts


def bm_cone(bm, r1, r2, depth, loc=(0, 0, 0), segments=8, rot=None):
    verts = bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=r1, radius2=r2, depth=depth)["verts"]
    if rot:
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0),
                         matrix=Euler(rot, 'XYZ').to_matrix())
    bmesh.ops.translate(bm, verts=verts, vec=loc)
    return verts


# ---------------------------------------------------------------- assembly
class Part:
    """A bag of bmesh geometry tagged with a material and (optionally) a bone.

    Parts are accumulated into ONE bmesh, then baked into a single mesh with
    per-part material slots and vertex groups. Rigid per-part weighting suits a
    blocky stylised character and avoids automatic-weight flakiness headless.

    Bone and material assignment is written ONTO THE ELEMENTS at creation time -
    a deform layer for weights, BMFace.material_index for materials - never into
    side tables keyed by reference or index. Both of those fail here:

      * BMVert/BMFace references are invalidated when bmesh reallocates its
        element arrays as the mesh grows, so by the last part the first part's
        references are all dead;
      * indices are not stable either, because bmesh reuses slots freed by
        bevel's deletions and index_update() then renumbers everything.

    Getting this wrong is quiet and total: the mesh binds to glTF's
    `neutral_bone` and the character never deforms, however good the clips are.
    """

    def __init__(self):
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()
        self._bones = {}         # bone name -> deform group index
        self._mat_order = []

    def _bone_id(self, name):
        if name not in self._bones:
            self._bones[name] = len(self._bones)
        return self._bones[name]

    def _mat_id(self, name):
        if name not in self._mat_order:
            self._mat_order.append(name)
        return self._mat_order.index(name)

    def add(self, verts, mat, bone=None):
        slot = self._mat_id(mat)
        live = [v for v in verts if v.is_valid]
        for f in {f for v in live for f in v.link_faces if f.is_valid}:
            f.material_index = slot
        if bone is not None:
            bid = self._bone_id(bone)
            for v in live:
                v[self.deform][bid] = 1.0
        return verts

    def bake(self, name, collection, materials):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for mname in self._mat_order:
            me.materials.append(materials[mname])
        for p in me.polygons:
            p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        collection.objects.link(ob)
        # vertex groups are referenced positionally by the deform layer, so they
        # must be created in the same order the bone ids were handed out
        for bone, _ in sorted(self._bones.items(), key=lambda kv: kv[1]):
            ob.vertex_groups.new(name=bone)
        return ob


def bm_limb(bm, p0, p1, width, bevel=0.045, segments=2, taper=1.0):
    """A rounded box spanning p0 -> p1. Used for arms, legs and the torch shaft.

    to_track_quat does the orientation maths so limbs can be authored as pairs
    of world-space points instead of hand-derived Euler angles.
    """
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    length = d.length
    verts = bm_rbox(bm, (width, width, length), bevel=bevel, segments=segments)
    if taper != 1.0:
        for v in verts:
            t = (v.co.z + length / 2) / length          # 0 at p0, 1 at p1
            k = 1.0 + (taper - 1.0) * t
            v.co.x *= k
            v.co.y *= k
    quat = d.to_track_quat('Z', 'Y')
    bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=quat.to_matrix())
    bmesh.ops.translate(bm, verts=verts, vec=(p0 + p1) / 2)
    return verts


def bm_dome(bm, radius, loc=(0, 0, 0), cut=0.0, subdiv=3, scale=(1, 1, 1)):
    """An icosphere with everything below `cut` (relative to loc) sliced off.
    Used for hair sitting as a cap on a spherical skull."""
    verts = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)["verts"]
    if scale != (1, 1, 1):
        bmesh.ops.scale(bm, vec=scale, verts=verts)
    doomed = [v for v in verts if v.co.z < cut]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    verts = [v for v in verts if v.is_valid]
    bmesh.ops.translate(bm, verts=verts, vec=loc)
    return verts


def bm_uvdome(bm, radius, loc=(0, 0, 0), ring=4, u=24, v=12, scale=(1, 1, 1)):
    """A spherical cap with a CLEAN circular edge.

    Slicing an icosphere leaves a ragged zig-zag boundary, which reads as a
    jagged hairline. A UV sphere's vertices sit on fixed latitudes, so cutting
    exactly at ring `ring` (counted from the north pole) gives a clean rim.
    """
    verts = bmesh.ops.create_uvsphere(
        bm, u_segments=u, v_segments=v, radius=radius)["verts"]
    cut = radius * math.cos(math.pi * ring / v)
    doomed = [x for x in verts if x.co.z < cut - 1e-4]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    verts = [x for x in verts if x.is_valid]
    if scale != (1, 1, 1):
        bmesh.ops.scale(bm, vec=scale, verts=verts)
    bmesh.ops.translate(bm, verts=verts, vec=loc)
    return verts


def stash(obj, action):
    """Park an action in its own NLA track - the shape the glTF exporter wants
    in order to emit every action as a separate animation clip."""
    ad = obj.animation_data or obj.animation_data_create()
    track = ad.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, int(action.frame_range[0]), action)
    track.mute = True
    action.use_fake_user = True


def new_action(obj, name):
    """Start a fresh action on obj, handling Blender 4.4+ action slots."""
    ad = obj.animation_data or obj.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    if hasattr(ad, "action_slot"):
        slot = act.slots.new(id_type='OBJECT', name=obj.name) \
            if not len(act.slots) else act.slots[0]
        ad.action_slot = slot
    return act


def fcurves_of(action):
    """Blender 5.x moved F-Curves into slotted-action channelbags; 4.x kept
    action.fcurves. Support both so the build runs on either."""
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    out = []
    for layer in action.layers:
        for strip in layer.strips:
            for cb in getattr(strip, "channelbags", []):
                out.extend(cb.fcurves)
    return out


def drop_actions(names):
    """Remove actions left behind by a previous run so names stay clean."""
    for a in list(bpy.data.actions):
        base = a.name.split(".")[0]
        if base in names:
            a.use_fake_user = False
            bpy.data.actions.remove(a)
