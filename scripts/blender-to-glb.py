import bpy
import os
import sys

args = sys.argv
src = args[args.index("--") + 1]
dst = args[args.index("--") + 2]
ext = src.lower()

if ext.endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
else:
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    except Exception:
        try:
            bpy.ops.wm.read_homefile(use_empty=True)
        except Exception:
            pass
    if ext.endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=src)
    elif ext.endswith(".obj"):
        try:
            bpy.ops.wm.obj_import(filepath=src)
        except Exception:
            bpy.ops.import_scene.obj(filepath=src)
    elif ext.endswith(".stl"):
        try:
            bpy.ops.wm.stl_import(filepath=src)
        except Exception:
            bpy.ops.import_mesh.stl(filepath=src)
    elif ext.endswith(".gltf") or ext.endswith(".glb"):
        bpy.ops.import_scene.gltf(filepath=src)
    elif ext.endswith(".abc"):
        bpy.ops.wm.alembic_import(filepath=src)
    else:
        raise SystemExit(2)

import os

try:
    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_cameras=False,
        export_lights=False,
    )
except Exception:
    raise

if not os.path.isfile(dst) or os.path.getsize(dst) < 16:
    raise SystemExit("GLB не записался")

