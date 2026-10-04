"""Derive lightweight CC0 crowd geometry from the shipped MakeHuman adults.

Blender --background --python scripts/prepare-medium-spectators.py -- public/assets/crowd
Texture-free GLBs share the already loaded near-person atlases at runtime. This
does not introduce another art source or another copy of the image downloads.
Prepare the near masks with scripts/prepare-near-spectator-masks.py first.
Run scripts/bake-crowd-motion.mjs afterwards to rebuild the small bone palettes.
"""
import bpy
import os
import re
import sys

directory = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
for name in ['blue-shirt', 'light-tee', 'striped-shirt', 'olive-jacket', 'wine-blouse', 'sport']:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, 'spectator-' + name + '.glb'))
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = obj
        if obj.data.shape_keys:
            obj.shape_key_clear()
        count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        body = any('Skin_and_cloth_atlas' in m.name for m in obj.data.materials)
        target = 1950 if body else 500
        if body and not obj.data.attributes.get('_CROWD_GARMENT'):
            raise ValueError('Prepare the source-derived near garment masks before distance decimation')
        if count > target:
            mod = obj.modifiers.new('Medium-distance silhouette', 'DECIMATE')
            mod.ratio = target / count
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
        # These IDs let the runtime reuse each original skin/garment/hair map.
        for material in obj.data.materials:
            material.name = re.sub(r'\.\d{3}$', '', material.name)
            for node in list(material.node_tree.nodes):
                if node.type == 'TEX_IMAGE':
                    material.node_tree.nodes.remove(node)
    bpy.ops.export_scene.gltf(filepath=os.path.join(directory, 'spectator-' + name + '-crowd.glb'),
                              export_format='GLB', export_apply=False,
                              export_animations=False, export_materials='EXPORT', export_attributes=True)
    print('CAMBER_MEDIUM_DONE', name)
    # The third tier still uses a coherent fitted human, not independently
    # scaled head/limb primitives. Its 770-triangle budget is for driving views.
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = obj
        count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        target = 620 if any('Skin_and_cloth_atlas' in m.name for m in obj.data.materials) else 150
        if count > target:
            mod = obj.modifiers.new('Distant human silhouette', 'DECIMATE')
            mod.ratio = target / count
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.export_scene.gltf(filepath=os.path.join(directory, 'spectator-' + name + '-far.glb'),
                              export_format='GLB', export_apply=False,
                              export_animations=False, export_materials='EXPORT', export_attributes=True)
    print('CAMBER_FAR_DONE', name)
