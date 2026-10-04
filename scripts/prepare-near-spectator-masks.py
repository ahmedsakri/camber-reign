"""Append the established source-atlas clothing mask without re-exporting GLBs.

Blender --background --python scripts/prepare-near-spectator-masks.py -- \
  --input /path/to/unmasked-crowd --output public/assets/crowd

This runs the same conservative full-near-mesh UV/color/torso rule used before
middle/far decimation. Selected fabric and some footwear are tinted; it does
not claim to recover source garment object labels. Original buffer bytes,
indices, positions, skinning, morph targets, images and materials are retained.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source_dir, output_dir = Path(args.input), Path(args.output)
output_dir.mkdir(parents=True, exist_ok=True)
sources = json.loads((source_dir / 'SOURCES.json').read_text())
exclusions = json.loads((Path(__file__).with_name('spectator-skin-exclusions.json')).read_text())['files']
records = []

def read_glb(data):
    assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 4)[0] == 2
    json_size = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + json_size])
    offset = 20 + json_size
    binary_size, kind = struct.unpack_from('<II', data, offset)
    assert kind == 0x004E4942 and offset + 8 + binary_size == len(data)
    return document, data[offset + 8:]

def values(document, binary, index):
    accessor = document['accessors'][index]
    assert accessor['componentType'] == 5126 and not accessor.get('sparse')
    width = {'VEC2': 2, 'VEC3': 3}[accessor['type']]
    view = document['bufferViews'][accessor['bufferView']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return np.ndarray((accessor['count'], width), dtype='<f4', buffer=binary,
                      offset=offset, strides=(view.get('byteStride', width * 4), 4))

for entry in sources['files']:
    filename = entry['file']
    name = filename.removeprefix('spectator-').removesuffix('.glb')
    original = (source_dir / filename).read_bytes()
    document, binary = read_glb(original)
    before = copy.deepcopy(document)
    targets = [(mesh, primitive) for mesh in document['meshes'] for primitive in mesh['primitives']
               if document['materials'][primitive['material']]['name'] == 'Skin_and_cloth_atlas']
    assert len(targets) == 1, 'Pinned wardrobe must have one atlas primitive'
    mesh, primitive = targets[0]
    assert '_CROWD_GARMENT' not in primitive['attributes'], 'Use an unmasked source snapshot'
    position = values(document, binary, primitive['attributes']['POSITION'])
    uv = values(document, binary, primitive['attributes']['TEXCOORD_0'])
    # All pinned body nodes/root transforms are identity; glTF Y is Blender Z.
    for node in document['nodes']:
        if node.get('mesh') == document['meshes'].index(mesh) or node.get('name') == 'Human.rig':
            assert not any(key in node for key in ['matrix', 'rotation', 'translation', 'scale'])
    material = document['materials'][primitive['material']]
    texture = document['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
    image = document['images'][texture['source']]
    view = document['bufferViews'][image['bufferView']]
    with tempfile.TemporaryDirectory() as temporary:
        path = Path(temporary) / ('atlas.jpg' if image['mimeType'] == 'image/jpeg' else 'atlas.png')
        path.write_bytes(binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']])
        atlas = bpy.data.images.load(str(path))
        atlas.colorspace_settings.name = 'sRGB'
        width, height = atlas.size[:]
        pixels = np.empty(width * height * 4, dtype=np.float32)
        atlas.pixels.foreach_get(pixels)
        pixels = pixels.reshape((height, width, 4))
        # Blender's image/UV origin is bottom-left; glTF UVs use top-left.
        x = np.clip((uv[:, 0] * width).astype(int), 0, width - 1)
        y = np.clip(((1 - uv[:, 1]) * height).astype(int), 0, height - 1)
        red, green, blue = pixels[y, x, :3].T
        cool = (blue > red * 1.10) & (blue > green * .97) & (blue > .014)
        torso = (np.abs(position[:, 0]) < .175) & (position[:, 1] > .93) & (position[:, 1] < 1.285)
        interior_shirt = torso if name in ['light-tee', 'striped-shirt', 'wine-blouse', 'olive-jacket'] else False
        mask = ((position[:, 1] < 1.36) & (cool | interior_shirt)).astype('<f4')
        bpy.data.images.remove(atlas)
    # Source-topology probes protect exposed neck/hand/face skin where atlas
    # texel bleed or the old torso heuristic would otherwise select it. Pinned
    # hashes prevent applying semantic vertex indices to a changed export.
    excluded = exclusions.get(filename)
    if excluded:
        assert hashlib.sha256(original).hexdigest() == excluded['sourceSha256']
        assert np.all(mask[excluded['vertices']] > 0)
        mask[excluded['vertices']] = 0
    assert np.isfinite(mask).all() and 0 < np.count_nonzero(mask) < len(mask)
    mask_bytes = mask.tobytes()
    document['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(mask_bytes), 'target': 34962})
    document['accessors'].append({'bufferView': len(document['bufferViews']) - 1, 'componentType': 5126,
                                  'count': len(mask), 'type': 'SCALAR', 'min': [0], 'max': [1]})
    primitive['attributes']['_CROWD_GARMENT'] = len(document['accessors']) - 1
    document['buffers'][0]['byteLength'] = len(binary) + len(mask_bytes)
    # Prove the only structure changes are this appended view/accessor/attribute.
    check = copy.deepcopy(document)
    check['bufferViews'].pop(); check['accessors'].pop()
    check['buffers'][0]['byteLength'] = before['buffers'][0]['byteLength']
    for target_mesh in check['meshes']:
        for target_primitive in target_mesh['primitives']:
            target_primitive['attributes'].pop('_CROWD_GARMENT', None)
    assert check == before
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    output = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary) + len(mask_bytes))
    output += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    output += struct.pack('<II', len(binary) + len(mask_bytes), 0x004E4942) + binary + mask_bytes
    _, resulting_binary = read_glb(output)
    assert resulting_binary[:len(binary)] == binary
    (output_dir / filename).write_bytes(output)
    records.append({'file': filename, 'sourceSha256': hashlib.sha256(original).hexdigest(),
                    'preservedBinaryBytes': len(binary), 'preservedBinarySha256': hashlib.sha256(binary).hexdigest(),
                    'maskVertices': len(mask), 'selectedVertices': int(np.count_nonzero(mask)), 'maskBytes': len(mask_bytes),
                    'excludedSkinVertices': len(excluded['vertices']) if excluded else 0})
    entry.update(bytes=len(output), sha256=hashlib.sha256(output).hexdigest())
    print('CAMBER_NEAR_MASK', filename, len(mask_bytes), 'mask bytes;', len(output), 'GLB bytes')

distance_corrections = []
for filename in ['spectator-wine-blouse-crowd.glb', 'spectator-wine-blouse-far.glb']:
    original = (source_dir / filename).read_bytes()
    rule = exclusions[filename]
    assert hashlib.sha256(original).hexdigest() == rule['sourceSha256']
    document, binary = read_glb(original)
    primitive = next(p for mesh in document['meshes'] for p in mesh['primitives']
                     if '_CROWD_GARMENT' in p['attributes'])
    accessor = document['accessors'][primitive['attributes']['_CROWD_GARMENT']]
    assert accessor['componentType'] == 5126 and accessor['type'] == 'SCALAR' and not accessor.get('sparse')
    view = document['bufferViews'][accessor['bufferView']]
    base = 28 + struct.unpack_from('<I', original, 12)[0] + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', 4)
    result = bytearray(original)
    restored = []
    permitted = set()
    for vertex in rule['vertices']:
        offset = base + vertex * stride
        assert 0 < struct.unpack_from('<f', original, offset)[0] <= 1
        restored.append({'vertex': vertex, 'byteOffset': offset, 'originalHex': original[offset:offset + 4].hex()})
        result[offset:offset + 4] = b'\0' * 4
        permitted.update(range(offset, offset + 4))
    assert all(a == b or i in permitted for i, (a, b) in enumerate(zip(original, result)))
    (output_dir / filename).write_bytes(result)
    entry = next(item for item in sources['mediumDistance']['files'] if item['file'] == filename)
    entry.update(bytes=len(result), sha256=hashlib.sha256(result).hexdigest())
    distance_corrections.append({'file': filename, 'sourceSha256': rule['sourceSha256'], 'changedVertices': len(restored), 'originalMaskValues': restored})
    print('CAMBER_NECKLINE_MASK', filename, len(restored), 'scalar values corrected; all other bytes unchanged')

sources['garmentMask'] = {
    'script': 'scripts/prepare-near-spectator-masks.py',
    'method': 'Existing full-near source-atlas UV/color and conservative torso mask, before distance decimation, with pinned source-topology skin exclusions; includes selected footwear. This is not a recovered source-object semantic label.',
    'skinExclusions': 'scripts/spectator-skin-exclusions.json; original head/neck/hand/eye components and source UV provenance, independently checked on the actual Blender masks',
    'preservation': 'Only one scalar attribute/accessor/buffer view appended per body. Original binary buffer is an identical prefix; all original geometry, indices, morphs, skinning, images, materials and nodes retained.',
    'files': records,
    'distanceNecklineCorrections': distance_corrections,
}
(output_dir / 'SOURCES.json').write_text(json.dumps(sources, indent=2) + '\n')
