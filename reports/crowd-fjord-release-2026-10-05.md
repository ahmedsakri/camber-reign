# Crowd continuity and Norwegian relief — 5 October 2026

Status: **deployed and verified live.** Source commit `a55661366c09495aa3ac106d4134a284abd3f872` is pushed and deployed to [Camber Reign](https://camber-reign.web.app/) after the normal complete test/build gate. The planned renderer and responsive gameplay checks, exact live-byte verification, and production lobby/start/pause smoke check are complete. The limits below still apply.

## Included changes

Middle-distance cheering responds to the passing car and plays through its recovery using the existing motion clips. Quiet activities continue independently. The shared middle/far clock retains the original pose sampling cost and the existing pause and reduced-motion behavior. Near/middle pose synchronization is a separate remaining limitation.

Nearby spectators now use the same deterministic fabric shade as their distance representations. Source-derived masks protect exposed skin, eyes and hair while preserving the existing cloth and selected-footwear choices. Six near GLBs add mask data without changing their original binary payloads; the narrow wine neckline correction also removes 12 middle and 7 far mask values. Fixed near slots own their material clones and shade uniforms; geometry and textures remain shared. There are no extra draws or textures from this change.

Norway's generated mountain relief has deeper gullies, gentler foothills and recessed feet while retaining its geometry budget and road envelope. The rock UV correction preserves visible texture area on shallow triangles. The refreshed circuit preview comes from the actual world renderer.

## Actual-renderer evidence completed on 5 October

The permitted browser service recovered. The root reviewer completed the following checks and supplied the results recorded here:

- The near-crowd renderer exercised all eight fabric shades on all six models. Each checked shade rendered without fixture errors or WebGL errors (`glError: 0`), with 20 draws, 81,026 triangles and 3 shader programs. This is a renderer fixture check, not a full gameplay or physical-device performance result.
- A running passing-car cycle was observed through approach, reaction and recovery. Reduced-motion checks produced identical frame arrays. These are motion checks; still images alone are not used as proof of animation behavior.
- Norway was inspected in desktop starting-grid and mobile bridge-approach world views. Both loaded all 13 surface maps and reported no fixture errors or WebGL errors. The reviewer found the terrain and visible road clearance acceptable in those views.
- Norway's desktop overview was exported from the actual renderer at sector 0.13 after all 18 crowd geometry loads had settled. The saved capture has 13 loaded surface maps, 13 positive GPU texture probes, a ready compressed alpine sky and ready pines. It records 133 scene draws and 209,754 triangles. These counts describe this view only.
- Actual desktop gameplay at 1280×800 loaded all 18 crowd assets and selected 10 near, 108 middle and 202 far people. Automatic acceleration, a native Shift+Right key press using Nitro, key-release input clearing, pause/resume and visible barrier-impact feedback were checked with no reported game errors. Nitro charge decreased to 3.558 from 3.6 during the press. The unsupported raw CDP keyboard command was replaced by the browser's native key-press control; it is not counted as a successful input check.
- Actual gameplay was also checked in browser viewports of 844×390 and 568×320. Native steering drag and touch Nitro were exercised; Nitro charge decreased from 3.6 to 3.55, and release cleared the input flags. At 390×844, the portrait orientation gate and absence of page overflow were checked. Portrait lobby navigation to `/cars/` also passed. These are browser viewport and native input checks, not a physical-phone or simultaneous-multitouch test.

Saved actual-game evidence: [desktop](release-race-desktop-2026-10-05.png), [landscape](release-race-landscape-2026-10-05.png), [compact landscape](release-race-compact-2026-10-05.png), [portrait gate](release-race-portrait-2026-10-05.png), [portrait lobby](release-lobby-portrait-2026-10-05.png) and [released touch-input state](phone-input-2026-10-05.json). The input record confirms steering mode `touch`, steer 0, all held-input flags false and Nitro inactive after release.

The final mobile-profile fixed-tier comparison also passed in the actual renderer. At 5.8 seconds, with car x = 0.4, each ready panel selected 6 near, 34 middle and 0 far people and reported 71 draws. At 3.0 seconds, with car x = 34, each selected 0 near, 40 middle and 0 far people and reported 52 draws. Both panels updated and rendered before freezing. The reviewer checked preserved clothing and skin, with no console errors; the existing near/middle pose-transition limitation remains. Evidence: [near tier](crowd-near-transition-2026-10-05.png) and [middle tier](crowd-middle-transition-2026-10-05.png). These fixed frames supplement the observed running reaction/recovery cycle; they do not replace it.

## Preview preservation and automated evidence

The new Norway preview is **34,162 bytes**, 960×540, SHA-256 `5841c38298e4b3ba9b6872dbfe6c4d7b649abdb5fb2f285540109763561856cc`. All **37 other preview files and their complete manifest entries are unchanged** against the saved pre-capture manifest. All 38 files match their recorded size and SHA-256; the catalogue totals **1,559,738 bytes**. Preservation receipt: `../camber-reign-asset-sources/release-logs/crowd-fjord-preview-preservation-2026-10-05.json`.

The post-capture catalogue test passed **1/1**, with no failures, skips or cancellations. The tightened world-review fixture waits for all 18 expected geometry requests and loads, with active and queued work at zero, before declaring ready; this avoids readiness during gaps between sequential requests. Its extracted JavaScript passed a syntax check.

Earlier local validation passed **60/60 focused tests** and the production build. The separate crowd ownership and mask review found no actionable issue: 25,425 protected near skin vertices and all 6,090 positive distance-mask vertices were checked; restoring the original wine mask scalars reproduced the known 12 middle / 7 far defects. These results are retained in `crowd-fjord-local-validation-2026-10-04.md` and the linked detailed reports. They are not a new full release-gate result.

## Remaining limits

The scene remains visibly stylized. Repeated crowd bodies and poses, near/middle pose transitions, simplified trees and the transition to photographic backgrounds remain limitations. Asphalt-level visual parity has not been established. No new physical-phone heat, simultaneous-touch, gyroscope or headphone test is claimed.

This release does not add another accepted engine recording. Coverage remains **6 of 33 named base models**, with **27 unresolved**, and no complete year/trim/build match is claimed. The approved Gallardo recording and its attribution are preserved.

## Publication

The normal Firebase predeploy gate passed **1,140/1,140 tests**, with zero failures, in **410.666 seconds**. The production build passed in **1.69 seconds** and retained the existing large-bundle warning. Firebase then reported a successful deployment of source commit `a55661366c09495aa3ac106d4134a284abd3f872` to [Camber Reign](https://camber-reign.web.app/). The gate was not bypassed. See the [complete deployment log](../../camber-reign-asset-sources/release-logs/crowd-fjord-deploy-2026-10-05.log).

Live-byte verification passed **106/106 requests across 82 unique files**, with zero failures. The checks include 14 built JS/CSS bundles, all 24 crowd assets and their 24 exact versioned runtime URLs, all 38 previews, relevant pages and manifests. Every response matched the exact production-build bytes. The receipt records source commit `a55661366c09495aa3ac106d4134a284abd3f872` and crowd cache key `2026-10-04-garment-mask-v1`: [live-file receipt](../../camber-reign-asset-sources/release-logs/crowd-fjord-live-files-2026-10-05.json).

The live lobby loaded the full car renderer, refreshed Norway preview, wallet and navigation with no reported console errors; see the [production lobby screenshot](crowd-fjord-live-lobby-2026-10-05.png). Race Now then loaded seven rivals for an eight-car Norway grid. The HUD showed 63 km/h and a 6.17-second race clock. Pause opened the Race paused dialog with the selected McLaren P1 GTR and Norway, again with no reported browser console errors. This is a production start/pause smoke check, not a full-race completion or performance measurement. Documentation-only follow-ups do not change the deployed source or build inputs.
