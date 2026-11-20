import bpy
import math
import os
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE_DIR = os.path.join(ROOT, "assets", "darwin")
BLEND_PATH = os.path.join(SOURCE_DIR, "darwin-v8-mascot.blend")
FRAME_DIR = os.path.join(SOURCE_DIR, "renders")
os.makedirs(FRAME_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.curves, bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, color, roughness=0.36, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1)
        shader.inputs["Emission Strength"].default_value = emission_strength
    return mat


def rounded_box(name, location, dimensions, radius, mat, segments=8):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("Soft rounded edges", "BEVEL")
    bevel.width = radius
    bevel.segments = segments
    bevel.limit_method = "ANGLE"
    normal = obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    obj.data.materials.append(mat)
    return obj


def smooth_sphere(name, location, scale, mat, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def superellipsoid(name, location, scale, mat, exponent=0.6, lat_steps=64, lon_steps=128):
    """Convex, softly squared surface; unlike a beveled cube its face has no flat plane."""
    def spow(value):
        return math.copysign(abs(value) ** exponent, value)

    verts = []
    for i in range(lat_steps + 1):
        latitude = -math.pi / 2 + math.pi * i / lat_steps
        clat, slat = math.cos(latitude), math.sin(latitude)
        for j in range(lon_steps):
            longitude = 2 * math.pi * j / lon_steps
            verts.append((
                location[0] + scale[0] * spow(clat) * spow(math.cos(longitude)),
                location[1] + scale[1] * spow(clat) * spow(math.sin(longitude)),
                location[2] + scale[2] * spow(slat),
            ))
    faces = []
    for i in range(lat_steps):
        row, next_row = i * lon_steps, (i + 1) * lon_steps
        for j in range(lon_steps):
            nxt = (j + 1) % lon_steps
            faces.append((row + j, row + nxt, next_row + nxt, next_row + j))
    mesh = bpy.data.meshes.new(f"{name} surface mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    bpy.ops.object.shade_smooth()
    return obj


def pill_mesh(name, location, dimensions, radius, mat, bevel=0.025):
    """Soft, thick rounded panel for the inset display."""
    width, depth, height = dimensions
    corner = min(radius, width * 0.5 - 0.001, height * 0.5 - 0.001)
    steps = 12
    outline = []
    for cx, cz, start in (
        (width * 0.5 - corner, height * 0.5 - corner, 0),
        (-width * 0.5 + corner, height * 0.5 - corner, 90),
        (-width * 0.5 + corner, -height * 0.5 + corner, 180),
        (width * 0.5 - corner, -height * 0.5 + corner, 270),
    ):
        for i in range(steps + 1):
            angle = math.radians(start + 90 * i / steps)
            outline.append((cx + corner * math.cos(angle), cz + corner * math.sin(angle)))
    count = len(outline)
    yf, yb = location[1] - depth * 0.5, location[1] + depth * 0.5
    verts = [(x + location[0], yf, z + location[2]) for x, z in outline]
    verts += [(x + location[0], yb, z + location[2]) for x, z in outline]
    faces = [tuple(range(count)), tuple(range(count, 2 * count))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new(f"{name} rounded slab mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel_mod = obj.modifiers.new("Soft edge highlights", "BEVEL")
    bevel_mod.width = min(bevel, depth * 0.32)
    bevel_mod.segments = 4
    obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
    return obj


def cylinder_y(name, location, radius, depth, mat, vertices=80):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=(math.radians(90), 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    bevel = obj.modifiers.new("Soft disc edge", "BEVEL")
    bevel.width = min(depth * 0.28, radius * 0.12)
    bevel.segments = 5
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(mat)
    return obj


def torus_y(name, location, major_radius, minor_radius, mat):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=64,
        minor_segments=16,
        major_radius=major_radius,
        minor_radius=minor_radius,
        location=location,
        rotation=(math.radians(90), 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def rod_between(name, start, end, radius, mat, vertices=32):
    direction = Vector(end) - Vector(start)
    midpoint = (Vector(start) + Vector(end)) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bevel = obj.modifiers.new("Rounded stem", "BEVEL")
    bevel.width = radius * 0.65
    bevel.segments = 5
    obj.modifiers.new("Stem normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(mat)
    return obj


def curved_vein(name, points, radius, mat, parent=None):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coord in zip(spline.bezier_points, points):
        point.co = coord
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    return obj


def animate_location(obj, keys):
    for frame, location in keys:
        obj.location = location
        obj.keyframe_insert(data_path="location", frame=frame, group="Float and return")


def key_scale(obj, keys):
    for frame, factor in keys:
        obj.scale = (factor, factor, factor)
        obj.keyframe_insert(data_path="scale", frame=frame)


def animate_scale(obj, keys):
    for frame, scale in keys:
        obj.scale = scale
        obj.keyframe_insert(data_path="scale", frame=frame, group="Soft blink")


def animate_rotation(obj, keys):
    for frame, angle_y in keys:
        obj.rotation_euler[1] = math.radians(angle_y)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame, group="Sprout sway")


clear_scene()

cream = material("Warm ivory shell", (0.95, 0.83, 0.68), roughness=0.31, metallic=0.0)
cream_light = material("Raised porcelain bezel", (1.0, 0.91, 0.78), roughness=0.27)
screen_rim = material("Fine warm screen seam", (0.79, 0.67, 0.52), roughness=0.36)
forest = material("Deep forest display glass", (0.006, 0.042, 0.022), roughness=0.14, metallic=0.03)
green = material("Floating green ear pod", (0.075, 0.30, 0.13), roughness=0.28, metallic=0.0)
green_dark = material("Empty side-module recess", (0.012, 0.045, 0.024), roughness=0.5)
mint = material("Mint eyes", (0.39, 0.92, 0.50), roughness=0.24, emission=(0.15, 0.70, 0.31), emission_strength=0.4)
leaf_dark = material("Sprout leaf dark", (0.12, 0.38, 0.20), roughness=0.38)
leaf_light = material("Sprout leaf light", (0.31, 0.62, 0.25), roughness=0.37)
leaf_vein = material("Leaf vein", (0.25, 0.47, 0.22), roughness=0.4)
pod_highlight = material("Soft green pod sheen", (0.22, 0.47, 0.22), roughness=0.35)
display_glint = material("Soft curved visor reflection", (0.18, 0.33, 0.22), roughness=0.42, emission=(0.025, 0.08, 0.04), emission_strength=0.05)
stem_mat = material("Sprout stem", (0.18, 0.39, 0.20), roughness=0.4)
coral = material("Coral seed collar", (0.83, 0.38, 0.21), roughness=0.36)
target_mat = material("Target porcelain", (0.99, 0.98, 0.94), roughness=0.28)
target_green = material("Target mint", (0.35, 0.70, 0.40), roughness=0.3, emission=(0.18, 0.58, 0.28), emission_strength=0.12)
bg = material("Warm ivory backdrop", (0.96, 0.94, 0.89), roughness=0.86)
bg.node_tree.nodes.clear()
bg_output = bg.node_tree.nodes.new("ShaderNodeOutputMaterial")
bg_emission = bg.node_tree.nodes.new("ShaderNodeEmission")
bg_emission.inputs["Color"].default_value = (0.965, 0.935, 0.865, 1)
bg_emission.inputs["Strength"].default_value = 1.0
bg.node_tree.links.new(bg_emission.outputs["Emission"], bg_output.inputs["Surface"])

# Organic capsule shell, closer to the supplied hero image than a beveled box.
# The slight camera yaw exposes the shell's thickness while the eyes remain frontal.
head = superellipsoid("Darwin convex capsule shell", (0, 0.04, 1.58), (1.90, 0.98, 1.55), cream, exponent=0.57)
frame = superellipsoid("Sculpted porcelain visor bezel", (0, -0.80, 1.58), (1.55, 0.34, 1.30), cream_light, exponent=0.55)
screen_border = superellipsoid("Fine warm visor seam", (0, -1.015, 1.58), (1.36, 0.14, 1.14), screen_rim, exponent=0.55)
screen = superellipsoid("Convex forest glass visor", (0, -1.065, 1.58), (1.315, 0.095, 1.11), forest, exponent=0.55)

# Upright, calm mint eyes; the whole face stays exactly front-on.
eye_left = pill_mesh("Mint eye L", (-0.48, -1.20, 1.57), (0.43, 0.09, 0.92), 0.214, mint)
eye_right = pill_mesh("Mint eye R", (0.48, -1.20, 1.57), (0.43, 0.09, 0.92), 0.214, mint)

# Matching green hand modules sit on both sides. Their compact cream sockets
# stay attached to the shell; the left green module floats during the gesture.
module_x = -2.02
module_z = 1.50
for side, x in (("L", -2.02), ("R", 2.02)):
    smooth_sphere(f"{side} hand socket side volume", (x, 0.01, module_z), (0.36, 0.38, 0.53), cream, segments=64, rings=40)
    smooth_sphere(f"{side} hand socket porcelain lip", (x, -0.36, module_z), (0.27, 0.22, 0.42), cream_light, segments=64, rings=40)
    smooth_sphere(f"{side} hand socket recess", (x, -0.60, module_z), (0.16, 0.055, 0.25), green_dark, segments=48, rings=32)

pod = smooth_sphere("L floating green hand module", (module_x, -0.70, module_z), (0.18, 0.12, 0.28), green, segments=48, rings=32)
pod_glint = smooth_sphere("L hand module highlight", (module_x - 0.065, -0.812, module_z + 0.11), (0.02, 0.011, 0.05), pod_highlight, segments=24, rings=16)
right_pod = smooth_sphere("R seated green hand module", (2.02, -0.70, module_z), (0.18, 0.12, 0.28), green, segments=48, rings=32)
smooth_sphere("R hand module highlight", (2.02 + 0.065, -0.812, module_z + 0.11), (0.02, 0.011, 0.05), pod_highlight, segments=24, rings=16)

# Small sprout centered above the shell.
rod_between("Sprout stalk", (0, -0.15, 3.02), (0, -0.18, 3.78), 0.075, stem_mat)
smooth_sphere("Terracotta sprout base", (0, -0.18, 3.08), (0.48, 0.20, 0.16), coral)
leaf_left = smooth_sphere("Sprout leaf L", (-0.46, -0.20, 3.77), (0.73, 0.14, 0.42), leaf_dark, segments=64, rings=40)
leaf_left.rotation_euler[1] = math.radians(35)
leaf_right = smooth_sphere("Sprout leaf R", (0.46, -0.20, 3.85), (0.80, 0.14, 0.46), leaf_light, segments=64, rings=40)
leaf_right.rotation_euler[1] = math.radians(-35)
curved_vein("Left leaf curved vein", [(0.02, -0.139, 0.04), (-0.22, -0.133, 0.035), (-0.45, -0.109, 0.025), (-0.67, -0.057, 0.015)], 0.007, leaf_vein, parent=leaf_left)
curved_vein("Right leaf curved vein", [(-0.02, -0.139, 0.03), (0.25, -0.132, 0.04), (0.52, -0.106, 0.035), (0.74, -0.053, 0.02)], 0.007, leaf_vein, parent=leaf_right)
curved_vein("Visor curved glint", [(-1.05, -1.147, 2.16), (-0.93, -1.146, 2.31), (-0.73, -1.138, 2.46), (-0.56, -1.144, 2.50)], 0.026, display_glint)

# Nearby task token: the floating module reaches it, taps, then returns to its socket.
target = rounded_box("Touch target", (-3.0, -0.62, 1.96), (0.66, 0.13, 0.66), 0.18, target_mat, segments=16)
target_dot = smooth_sphere("Target mark", (-3.0, -0.73, 1.96), (0.12, 0.04, 0.12), target_green)
target_ring = torus_y("Target contact pulse", (-3.0, -0.77, 1.96), 0.20, 0.023, target_green)
for target_piece in (target, target_dot, target_ring):
    key_scale(target_piece, [(1, 0.001), (14, 0.001), (20, 1.0), (50, 1.0), (60, 0.001), (72, 0.001)])

# A flat emissive studio backdrop keeps the reference's warm ivory field while the model stays lit.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 1.6, 1.95), rotation=(math.radians(90), 0, 0))
backdrop = bpy.context.object
backdrop.name = "Ivory studio backdrop"
backdrop.data.materials.append(bg)

# Animation: lift away, float in a short arc, touch, pause, and glide back into the socket.
float_keys = [
    (1,  (module_x, -0.70, module_z)),
    (9,  (module_x, -0.70, module_z)),
    (15, (-2.12, -0.83, 1.43)),
    (22, (-2.25, -0.91, 1.62)),
    (29, (-2.55, -0.86, 1.83)),
    (34, (-2.74, -0.805, 1.96)),
    (38, (-2.72, -0.805, 1.96)),
    (46, (-2.50, -0.91, 1.80)),
    (54, (-2.02, -0.82, 1.60)),
    (61, (module_x, -0.70, module_z)),
    (72, (module_x, -0.70, module_z)),
]
animate_location(pod, float_keys)
animate_location(pod_glint, [(frame, (loc[0] - 0.065, loc[1] - 0.112, loc[2] + 0.11)) for frame, loc in float_keys])

# Keep the face and sprout steady so the side-module gesture reads cleanly.

# Contact pulse scales only the small target mark; the face and shell remain still.
key_scale(target_dot, [(1, 0.001), (14, 0.001), (20, 1.0), (32, 1.0), (34, 1.22), (37, 1.0), (50, 1.0), (60, 0.001), (72, 0.001)])
key_scale(target_ring, [(1, 0.001), (14, 0.001), (20, 0.88), (32, 0.88), (34, 1.25), (38, 0.9), (50, 0.9), (60, 0.001), (72, 0.001)])

# Keyframe insertion uses smooth Bézier handles by default; the rest at each end makes the loop calm.

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 72
scene.render.fps = 24
scene.render.resolution_x = 768
scene.render.resolution_y = 576
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = os.path.join(FRAME_DIR, "frame_")
scene.render.film_transparent = False
scene.render.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = 16
scene.render.image_settings.color_depth = "8"
scene.render.resolution_percentage = 100
scene.render.use_file_extension = True
scene.render.image_settings.color_mode = "RGB"

# Camera and soft studio lighting.
bpy.ops.object.camera_add(location=(0, -15, 2.18))
camera = bpy.context.object
camera.name = "Front orthographic camera"
camera.rotation_euler = (Vector((0, 0, 1.82)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 6.9
scene.camera = camera

def area_light(name, location, energy, size, color):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    direction = Vector((0, 0, 1.7)) - light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return light

area_light("Key softbox", (-4.5, -6.0, 7.0), 290, 4.2, (1.0, 0.86, 0.68))
area_light("Face fill", (3.7, -5.5, 4.0), 130, 3.6, (0.76, 0.91, 0.79))
area_light("Top rim", (0.0, 2.0, 5.7), 190, 3.0, (1.0, 0.87, 0.69))

world = bpy.data.worlds.new("Warm ivory studio") if not bpy.data.worlds else bpy.data.worlds[0]
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.96, 0.94, 0.89, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65

scene.view_settings.view_transform = "Standard"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = os.path.join(FRAME_DIR, "frame_")
scene.camera.data.lens = 50
scene.render.resolution_x = 768
scene.render.resolution_y = 576
scene.frame_set(1)

# Save the editable Blender project with its complete modeled animation.
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

# Render a still contact frame or the full loop to a PNG sequence.
render_mode = os.environ.get("DARWIN_RENDER", "0")
if render_mode in ("preview", "contact"):
    scene.frame_set(1 if render_mode == "preview" else 34)
    scene.render.filepath = os.path.join(FRAME_DIR, "darwin-v8-contact-preview.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered contact preview to {scene.render.filepath}")
elif render_mode == "1":
    for frame in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(frame)
        scene.render.filepath = os.path.join(FRAME_DIR, f"frame_{frame:04d}.png")
        bpy.ops.render.render(write_still=True)
    print(f"Rendered {scene.frame_end} frames to {FRAME_DIR}")
else:
    print(f"Saved Blender project to {BLEND_PATH}")
