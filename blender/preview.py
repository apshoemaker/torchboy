"""Three-quarter preview render of whichever collection is named in PREVIEW_COL.
Used to eyeball assets from the CLI without switching to the Blender window."""
import bpy, math, os
from mathutils import Vector

COL = globals().get("PREVIEW_COL", "TorchBoy")
OUTPATH = globals().get("PREVIEW_OUT", "/tmp/preview.png")
ORTHO = globals().get("PREVIEW_ORTHO", 2.4)
CAMLOC = globals().get("PREVIEW_CAMLOC", (2.6, -3.2, 2.4))
AIM = Vector(globals().get("PREVIEW_AIM", (0, 0, 0.8)))
RES = globals().get("PREVIEW_RES", (620, 720))

scene = bpy.context.scene
target = bpy.data.collections.get(COL)
for ob in scene.objects:
    keep = ob.name.startswith("prev_") or ob.name == "PreviewCam"
    ob.hide_render = not (keep or (target and target in ob.users_collection))

cam = bpy.data.objects.get("PreviewCam")
if not cam:
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'
cam.data.ortho_scale = ORTHO
cam.location = CAMLOC
cam.rotation_euler = (AIM - Vector(CAMLOC)).to_track_quat('-Z', 'Y').to_euler()
cam.hide_render = False
scene.camera = cam

# modest energies: over-lighting flattens albedo and hides the real palette
for n, loc, e, sz in (("key", (3, -4, 5), 110, 5), ("fill", (-4, -2, 2), 22, 6),
                      ("rim", (0, 4.5, 3), 48, 4)):
    lo = bpy.data.objects.get("prev_" + n)
    if not lo:
        lo = bpy.data.objects.new("prev_" + n, bpy.data.lights.new("prev_" + n, 'AREA'))
        scene.collection.objects.link(lo)
    lo.data.energy, lo.data.size = e, sz
    lo.location = loc
    lo.rotation_euler = (AIM - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    lo.hide_render = False

scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = OUTPATH
if not scene.world:
    scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.055, 0.06, 0.08, 1)
scene.view_settings.view_transform = ('Khronos PBR Neutral' if 'Khronos PBR Neutral' in [e.identifier for e in type(scene.view_settings).bl_rna.properties['view_transform'].enum_items] else 'Standard')
bpy.ops.render.render(write_still=True)
result = {"rendered": OUTPATH}
