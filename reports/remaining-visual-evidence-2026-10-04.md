# Remaining visual evidence — 4 October 2026

Reference build: deployed `872570a`. This review uses the real Norway gameplay capture `pine-game-desktop.png`, not a concept image. The checked viewport was 1280×800, displayed in an exact-size local frame to work around unreliable browser captures. It does not establish physical-phone performance.

## What the current image still shows

- The nearer Norwegian range reads as a large, fairly uniform grey wall against a much more detailed photographic background. Replacing the older isolated cones was useful, but the camera-facing slopes and their integration with the valley are still too simple to claim realistic scenery completion.
- The road, cars, bridge and roadside structures are actual geometry. The visible bridge approach lacks the grounded slope variation and roadside density that would make the transition to the valley convincing.
- Source-derived young pines preserve recognizable branching and needle shapes. Their sparse silhouettes cannot serve as evidence of a mature, botanically exact forest.
- Road and barrier textures are readable in the actual race. More small texture changes alone will not solve the disparity between detailed surfaces and simplified large landforms.

## Next environment pass

Prioritize the Norway camera-facing landform and its foothill transition before another generic texture pass. Inspect `fjordMassifGeometry` in `src/terrain-landscape.js` and its placement/material in `src/mountain-venue.js`. Compare the same starting-grid and bridge-approach camera poses before and after any change. A stronger result should have irregular buttresses and drainage shapes that remain recognizable from the driving camera, with grounded vegetation and restrained contrast against the existing backdrop.

Preserve the full driving and recovery envelope. Do not alter track physics, route positions, or accident recovery to accommodate decorative scenery. Keep the documented destination draw/triangle ceiling and check all affected terrain intersections. No environment implementation or improvement beyond the reference build is claimed here.

## Crowd continuity findings

The pending motion work addresses a verified behavior gap: distance-rendered spectators ignore the live passing-car reaction while nearby rigs respond. Reusing each baked clip's own closed rest/cheer/recovery sequence avoids cross-gesture matrix blends that can distort limbs. This needs a moving renderer comparison before release; a still image cannot prove the change works.

A separate detail-level transition changes clothing colour. Medium/far meshes have a garment-only mask and phase-based fabric multiplier; near assets currently lack that mask and retain the original unmodified material. A correct follow-up requires the original mask-authoring rules on near topology, shared tint selection, and an owned per-slot material uniform. Tinting the entire body material would also recolour skin and eyes and is not an acceptable shortcut. Geometry and textures remain owned by the shared asset library; any new material clones must be disposed separately. This finding is not fixed by the timing patch.

## Validation boundary

Fresh browser navigation was denied because the browser's admin-policy verification service was unavailable. No alternative browser or indirect UI workaround was used. Any additional visual change remains subject to the repository's actual-renderer and responsive-gameplay release gate. Current evidence does not establish Asphalt-level visual parity or exhaustive device coverage.
