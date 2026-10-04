# Crowd and Norwegian relief — local validation

Status: **not released**. The published game source remains `872570a`; `a3bbc8d` records its verified publication. This local follow-up preserves the approved Gallardo audio and does not change another car's recording classification.

## Included work

- Reactive crowd timing: middle/far cheering starts in response to the passing car and completes its recovery; quiet activities continue independently. Pause, reduced motion and stale reaction eligibility retain bounded behavior.
- Wardrobe continuity: nearby people use the same fabric shade as their middle/far representation. Source masks protect exposed skin and eyes; materials belong to fixed near slots while original geometry and photographs stay shared.
- Norwegian relief: deeper front gullies, gentler foothills and recessed mountain feet keep the same geometry budget and road envelope. Continuous cross-slope mapping replaces UVs that collapsed on shallow triangles.

Detailed evidence and limitations are in `reactive-crowd-pending-qa-2026-10-04.md`, `wardrobe-tint-pending-qa-2026-10-04.md` and `fjord-relief-pending-qa-2026-10-04.md`.

## Executed checks

One combined run passed **60/60 focused tests**, with zero failures, skips or cancellations in 2.97 seconds. It covers crowd, medium/near spectators, terrain, destination scenery/layout, fjord rock assets and world detail. Log: `../camber-reign-asset-sources/release-logs/crowd-fjord-combined-focused-2026-10-04.log`.

The current production build passed in **1.89 seconds**, retaining the existing large-bundle warning. Log: `../camber-reign-asset-sources/release-logs/crowd-fjord-local-build-2026-10-04.log`. This replaces local `dist`; it does not publish it. The complete test suite was not rerun because the required visual gate is still unavailable; the full Firebase predeploy test/build gate remains enabled.

All 24 crowd asset sizes and hashes match provenance. The new near masks preserve every original binary byte. The twelve distance GLBs are unchanged except for the declared wine-blouse mask corrections. Independent geometry review confirms the Norway batch keeps its generated UVs and no triangles have collapsed texture area.

A separate read-only crowd review found no actionable issues. It verified 25,425 protected skin vertices with no mixed tinted triangles, all 6,090 positive distance-mask vertices against the source skin surfaces, material/uniform ownership and exact GLTF/Blender attribute naming. Reintroducing the old wine scalar values reproduced the 12 middle / 7 far defects, confirming that the regression check detects the repaired issue. Evidence: `../camber-reign-asset-sources/crowd-tint-upgrade/independent-review.json`. Its 28 focused tests overlap the combined 60 above and are not an additional combined-suite count.

## Unfinished release checks

Browser navigation is denied because the admin-policy verification service is unavailable. No alternative browser or technology was used to evade that restriction. Node tests and offline geometry diagnostics do not establish shader compilation, appearance, smooth animation, responsive gameplay or physical-device performance.

When permitted browser access works again:

1. Render the before/after crowd fixture through a complete passing-car cycle. Inspect all six wardrobes and eight shades, near/middle transitions, exposed skin, seated people, phone gestures, pause, reduced motion and pooled reassignment. Confirm shader compilation and bounded resources.
2. Inspect Norway from matching starting-grid and bridge-approach cameras. Check cliff colour/normal scale, foothill/background integration and visible road clearance. Refresh its catalogue preview from the actual renderer.
3. Run actual gameplay/navigation smoke checks at 1280×800, 844×390, 568×320 and 390×844. Record failures and repair them before release.
4. Run the complete predeploy gate, commit any validation fixes and push the validated work, deploy, then verify the delivered assets against that build.

## Saved checkpoint and external blocker

The changes are preserved as a local commit pending renderer QA. They are not pushed or deployed. Browser access was checked again in the following continuation, using the same permitted browser and the published Gallardo page; admin-policy verification again failed before access was granted. This is the same failure across three consecutive goal turns. No game test was started or passed by that check, and no alternate access path was used.

The preceding turn made concrete progress through the completed clothing masks, corrected terrain mapping, independent source/geometry review, combined tests and successful build. Those results are preserved. There is no confirmed running build, deployment or browser job to wait on. The next release action requires the external browser verification service to work so the actual-renderer checks above can run. The local commit is a checkpoint, not a visual-quality approval or production release.

## Remaining user targets

Visual parity with Asphalt has **not** been established. Near/middle pose continuity and existing sparse tree silhouettes remain known limitations. Current accepted recordings identify **6 of 33 base models**; **27** still lack an accepted freely licensed model match, and no complete year/trim/build match is claimed. The bounded later Sonniss investigation added no usable new recording; it is documented in `free-engine-source-continuation-2026-10-04.md`.
