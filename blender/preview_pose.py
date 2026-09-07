"""Render the rig at a given frame of a given action - used to check that
bone rotations move the way the animation intends (brow tilt sign, etc)."""
import bpy, os
rig = bpy.data.objects["TorchBoyRig"]
act_name = globals().get("POSE_ACTION", "Walk")
frame = globals().get("POSE_FRAME", 7)
ad = rig.animation_data
act = bpy.data.actions[act_name]
ad.action = act
if hasattr(ad, "action_slot") and len(act.slots):
    ad.action_slot = act.slots[0]
bpy.context.scene.frame_set(frame)
bpy.context.view_layer.update()
