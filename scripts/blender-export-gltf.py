"""Headless Blender export: imports FBX/OBJ/DAE and writes a GLB with animations.

Usage: blender --background --python scripts/blender-export-gltf.py -- <input> <output.glb>
"""
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
src, dst = argv[0], argv[1]
ext = os.path.splitext(src)[1].lower()

bpy.ops.wm.read_factory_settings(use_empty=True)

if ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath=src)
elif ext == ".obj":
    bpy.ops.wm.obj_import(filepath=src)
elif ext == ".dae":
    bpy.ops.wm.collada_import(filepath=src)
else:
    raise SystemExit(f"Unsupported format: {ext}")

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_animations=True,
    export_apply=False,
    export_yup=True,
)
