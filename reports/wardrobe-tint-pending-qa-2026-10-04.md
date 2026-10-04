# Wardrobe tint continuity — local implementation, pending renderer QA

Status: **implemented locally, not released**. Browser navigation remains blocked by the unavailable admin-policy verification service. No alternate browser/technology was used to bypass it. Actual shader compilation, appearance and tier-transition review remain pending.

## Runtime behavior and ownership

`src/spectator-clothing.js` owns the existing eight phase-selected fabric multipliers. Middle/far instance colors and near-slot uniforms now use the same helper and linear color conversion. The nearby shader reads the GLB's `_CROWD_GARMENT` scalar and multiplies only selected fabric/footwear. It does not use a whole-material color to recolor skin/eyes.

`createTexturedSpectator` clones only the masked body material after rig validation. One persistent uniform belongs to each fixed slot and updates on every assigned profile, including late readiness after reassignment. Original geometry, morph attributes, atlases, hair and eyebrow materials remain shared and library-owned. Slot disposal releases its material clone once; library disposal releases the shared geometry/materials/textures. All tint values share one program cache key, so changing a shade does not request a new shader program.

The previous reactive cheering implementation is preserved. No new triangles, draw calls, images, motion palettes or per-person rendering objects. Six mobile/ten desktop owned body-material clones follow the existing near-slot cap. The new shared mask buffers total **209,680 bytes**. GLB container growth is **210,736 bytes** across the six near assets; their combined size is **8,796,628 bytes**. Per-frame tint updates reuse each slot's Color/uniform object.

## Exact asset changes

All six near GLBs gain one scalar mask accessor/buffer view on the existing body primitive. Every original binary byte is an identical prefix of the output. The authoring script also asserts that the only JSON changes are the appended accessor/view/attribute and updated buffer length. Geometry positions, normals, UVs, indices, weights, skeletons, morph targets, images, materials and node transforms are retained.

The established source-atlas/UV and conservative torso rule was reused. Independent original-topology skin probes exclude atlas bleed and the old wine neckline mistake. This is a source-derived mask, not a claim that semantic garment object labels were recovered. Existing selected-footwear tint remains consistent across tiers.

| Near asset | New mask bytes | Protected skin selections cleared |
|---|---:|---:|
| spectator-blue-shirt.glb | 36,452 | 2 hand vertices |
| spectator-light-tee.glb | 34,440 | 0 |
| spectator-striped-shirt.glb | 34,404 | 0 |
| spectator-olive-jacket.glb | 36,084 | 1 hand vertex |
| spectator-wine-blouse.glb | 35,400 | 36 neckline + 2 hand vertices |
| spectator-sport.glb | 32,900 | 6 head/hand vertices |

The wine distance assets receive only scalar-mask corrections: **12 vertices** in `spectator-wine-blouse-crowd.glb`, **7 vertices** in `spectator-wine-blouse-far.glb`. Source UV triangles distinguish skin from neighboring blouse cloth and catch tiny interpolation residuals. A broad coordinate box was rejected because it removed 45 tinted blouse vertices and missed distance skin. No other middle/far asset changes; no motion files change.

`SOURCES.json` records all sizes/hashes, original near buffer lengths/hashes, exclusion counts, and original wine mask bytes. Restoring only those named distance scalar bytes reproduces each original complete GLB SHA-256. The common cache key is now `2026-10-04-garment-mask-v1` for all24 crowd requests.

## Reproduction and verification

`scripts/prepare-near-spectator-masks.py` runs under Blender, reads the original unmasked GLBs/manifest and original wine distance GLBs, samples the embedded source atlas, applies the pinned exclusions from `scripts/spectator-skin-exclusions.json`, and appends the masks without a GLB re-export. Exclusion source hashes prevent applying vertex IDs to changed topology. Original inputs for this run are under `/Users/ahmedsakri/Documents/Personal/Games/camber-reign-asset-sources/crowd-tint-upgrade/before/`. `prepare-medium-spectators.py` now requires and inherits prepared near masks before decimation instead of recreating the faulty heuristic.

Executed:

- `node --test tests/crowd.test.js tests/medium-spectator.test.js tests/realistic-spectator.test.js`: **35/35 passed**.
- All **24/24** crowd file sizes and SHA-256 hashes match `SOURCES.json`.
- `git diff --check`: clean.
- Independent read-only review found no functional, ownership or pinned-source reproducibility blocker.

Tests cover all eight tints on all six wardrobes in all three tiers, 25,425 original head/neck/hand/eye vertex probes, untouched neighboring wine blouse vertices, exact source-derived wine distance neckline probes, original binary preservation, shared-vs-owned resources, independent slots, reassignment, late readiness, pause/reduced motion, reactive timing, grounding, loading/disposal and fixed budgets.

## Pending release gate

Use the actual renderer to inspect near↔middle clothing transitions in standing and seated crowds, all six wardrobes, all eight shades, phone gestures, alpha hair, skin/eyes and the exposed wine neckline. Confirm no shader errors, source geometry/morph appearance changes, global color sharing or pooling flicker. Review desktop and representative phone layouts, then run the combined build/release checks. Near↔middle pose continuity remains a separate existing limitation. No renderer appearance, physical-phone performance or release claim is made by these Node/asset checks.
