"""Export the existing V8 Blender mascot as a web-friendly GLB asset.

Run with Blender in background mode. This loads the editable .blend and writes
the GLB without saving changes back to the source project.
"""
import bpy
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BLEND_PATH = os.path.join(ROOT, "assets", "darwin", "darwin-v8-mascot.blend")
GLB_PATH = os.path.join(ROOT, "public", "darwin", "darwin-v8-mascot.glb")

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
scene = bpy.context.scene
scene.frame_set(1)

excluded = {"Ivory studio backdrop"}
mascot_parts = [
    obj for obj in scene.objects
    if obj.type in {"MESH", "CURVE"} and obj.name not in excluded
]
bpy.ops.object.select_all(action="DESELECT")
for obj in mascot_parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects.get("Darwin convex capsule shell")

bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_frame_range=False,
    export_frame_step=1,
    export_apply=True,
)
print(f"Exported {len(mascot_parts)} mascot parts to {GLB_PATH}")
