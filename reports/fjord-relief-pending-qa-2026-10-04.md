# Valley relief — pending renderer QA

> Follow-up, 5 October 2026: this document preserves the local state and browser blocker recorded on 4 October. Permitted browser access recovered; desktop grid and mobile bridge views passed renderer review, responsive gameplay was checked, and Norway's preview was recaptured from the settled actual renderer. Source commit `a556613` is pushed and deployed after the normal complete test/build gate passed. All 106 live-byte requests matched the build, and the production lobby/start/pause smoke check passed. See the [current release report](crowd-fjord-release-2026-10-05.md) for updated evidence and status.

Status: implemented locally, not released. The published source remains `872570a`. This change addresses the visibly wall-like Norwegian range in the real gameplay capture recorded by `remaining-visual-evidence-2026-10-04.md`.

## Shape and material correction

The inner foot now recedes outward by varying amounts. The crest sits farther behind that foot and wanders through the range. Lower slopes rise more gradually, while deeper front-facing drainage leaves solid buttresses between gullies. There are still exactly two connected surfaces, with buried foundations. Track layouts, driving/recovery geometry, game physics and existing scenery placements are unchanged.

The original vertical Z/Y texture projection collapsed on equal-height vertices in the new shallow terrain. Independent review reproduced four collapsed desktop triangles reaching above five metres, including one reaching 33.28 m. The final mapping uses Z distance and accumulated cross-slope surface distance, with 20 m repeats along each row. It stays continuous through the indexed grid and retains the original attribute size, material, photograph and normal map. Venue batching now preserves those coordinates.

## Evidence

- **25/25 focused tests passed** across terrain, destination layout/scenery, cliff assets and shared world detail. Log: `../camber-reign-asset-sources/release-logs/fjord-relief-final-focused-2026-10-04.log`.
- New regression measures the actual batched rock geometry, rather than only the authoring function. Every triangle has finite nonzero texture area; minimum normalized density is approximately 0.262 mobile / 0.239 desktop, maximum 1.000003. This bounds texture stretching; it is not a claim of perfectly undistorted parameterization.
- Independent geometry review retains **6,400 mobile / 14,336 desktop triangles**, two connected ranges, no non-manifold edges and finite upward-facing unit normals. The minimum boundary-to-road-centre clearance is **89.59 m mobile / 89.54 m desktop**. A further **82,944 triangle-interior samples** remain clear. Foundations reach −1 m; the highest vertex remains below 272 m.
- No added geometry, material draws, textures, runtime animation or shadow passes. Existing destination-module limits still pass.
- Local offline shape diagnostic: `../camber-reign-asset-sources/fjord-relief-upgrade/geometry-comparison.png`, produced by the adjacent `geometry-review.py` from saved before/after geometry. It shows deeper front relief and the changed height profiles at the same camera and axes. This is a geometry-authoring diagnostic with simple shading, **not the Three.js game renderer, a gameplay capture or a workaround for browser access**.

## Required before release

Browser navigation remains denied because the admin-policy verification service is unavailable. No alternate browser or indirect UI workaround was used. Inspect the actual Norway starting grid and bridge approach at identical before/after cameras, including rock colour/normal mapping, silhouettes, fog, ground contact and the photographic backdrop. Check the responsive real game and refresh Norway's circuit preview only after approving the real renderer result. Then run the normal full test/build/deploy gate and verify published bytes.

This is still authored browser scenery. An offline shape comparison does not establish realistic completion, phone performance or Asphalt-level parity. The preview currently on disk and online intentionally remains the last validated version; no new preview is fabricated.
