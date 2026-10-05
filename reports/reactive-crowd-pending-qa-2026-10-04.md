# Reactive crowd timing — pending renderer QA

> Follow-up, 5 October 2026: this document preserves the local state and browser blocker recorded on 4 October. Permitted browser access recovered, and the running reaction/recovery cycle, reduced motion, fixed near/middle views and responsive gameplay checks are now complete. Source commit `a556613` is pushed and deployed after the normal complete test/build gate passed. All 106 live-byte requests matched the build, and the production lobby/start/pause smoke check passed. See the [current release report](crowd-fjord-release-2026-10-05.md) for updated evidence and status.

Status: implemented locally; **not released**. Actual moving-renderer review remains required. Browser navigation is currently blocked by unavailable admin-policy verification; no alternate browser or technology was used to bypass it.

## Change

Reactive identities (wave, clap, raised fist, both hands) now rest at their existing clip’s closed seam until a nearby moving car raises the individual reaction above a deterministic threshold derived from the existing phase. They play a complete original cheer and recovery, then rest or repeat while still eligible. Filming, watching, folded hands and conversation retain their independent free-running timing.

Middle and far representations share each person’s clock, keeping their boundary poses identical. No shader, geometry, material, texture, palette or draw-count changes; no new per-instance attributes/uploads. One nullable start-time field and one fresh eligibility boolean are stored per person. The 6/10 near, 48/108 middle and 112/240 far caps are unchanged. Existing original adjacent-key interpolation is retained: no cross-gesture affine-matrix blend. The attempted cross-gesture design was rejected because opposing rotations could collapse a forearm.

The full cycle lasts 5.4 / tempo seconds (4.32–7.50 seconds for current profiles). Car departure does not interrupt a raised arm; the existing recovery completes. Reactive identities remain still at their seam between cheers; the quiet majority retains normal idle motion. Eligibility updates in the distance pass so stale reaction values beyond the desktop 110 m pose-update range, or after culling/re-entry, cannot restart cheers. Pause and reduced motion retain the frozen crowd clock.

## Automated evidence

`node --test tests/crowd.test.js tests/medium-spectator.test.js tests/realistic-spectator.test.js`: **30/30 passed**. Relevant coverage includes approach/recovery, deterministic thresholds, preserved quiet activities, middle/far pose equality, same-tick reaction submission, pause/reduced motion, stale reaction at 120 m and range re-entry, bounded resources, disposal, source human bounds, and actual shoe grounding in idle and active clips.

Root reviewed the final implementation and ran the production build successfully (1.15 seconds); `git diff --check` passed. Log: `../camber-reign-asset-sources/release-logs/reactive-crowd-build-2026-10-04.log`. This local build replaces the previous `dist` contents but is **not deployed**. The currently published source remains `872570a`, documented by the independent 71-file live verification recorded before this local build. New source changes and this report remain local pending the visual gate.

Independent read-only palette/geometry audit: all 48 reactive source clips (six people × four gestures × two postures) have exactly equal first/last matrices. Across 192 seam shoe cases (six people × four gestures × two postures × two heights × two chair heights), worst middle sole offset was 5.79 mm, within the existing 8 mm tolerance. This is geometry evidence, not visual motion approval.

## Ready comparison fixture

Outside the production tree:

`/Users/ahmedsakri/Documents/Personal/Games/camber-reign-asset-sources/crowd-reaction-upgrade/draft/reports/reactive-crowd-review.html`

The draft contains the published `872570a` source in `baseline-src` and the current applied `src` copy, including the separate wardrobe follow-up. The baseline's only source adjustment redirects crowd resource paths to 24 frozen, hash-verified published assets under `baseline-assets/crowd`; its `proof.json` records those hashes. This prevents the shared production asset directory from silently changing the before panel. Both panels use the real Three.js renderer, identical seeded people, lighting, camera and moving-car path. Once browser policy verification works, serve the draft directory using its existing Vite dependency, for example `./node_modules/.bin/vite --host 127.0.0.1 --port 4184 --strictPort`, then open `/reports/reactive-crowd-review.html`; append `?mobile` for mobile caps. The fixture is not added to the production build. Its module syntax passes, but it has not been rendered. No server was left running.

Wait for both panels to load, play the complete approach/pass/recovery, inspect standing and seated silhouettes, then test pause, reduced motion, and the road-distance view. Record moving evidence, not only stills. `window.__crowdMotionReview.snapshot()` exposes current person reactions, eligibility, one-shot start times, tier counts, uploaded frame values, draws and triangles for reproducible comparison. Follow with an actual race smoke test and a production build before any release.

## Explicit limits and separate follow-up

Near↔middle pose matching remains an existing limitation; this patch does not solve it. Existing clips can have large motion between adjacent sampled keys, so normal-speed renderer review remains necessary. No physical-phone performance or visual improvement claim is made yet.

Wardrobe tint continuity is a separate local follow-up, now implemented and documented in `wardrobe-tint-pending-qa-2026-10-04.md`. The original six near GLBs lacked a garment mask, so medium/far fabric multipliers disappeared at near LOD. The source-atlas mask, with pinned skin exclusions, is now added before decimation; shared phase→tint selection and owned near-slot materials preserve skin, eyes, hair and resource ownership. It adds 209,680 raw mask bytes, six mobile/ten desktop material clones and zero extra draws or textures. The combined implementation passes 60 focused tests and a production build, but both timing and tint remain unreleased pending the actual renderer gate.
