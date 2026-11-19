# Pad, zone and large-board memory refinement — unreleased

Publication remains paused. Core API 1.0, source/layer-colored selection, camera state, expansion and the compact warm viewer style remain intact.

## Saved geometry fixes

Saved pad identity resolves UUID, then legacy tstamp. Missing identities use direct footprint/module and pad occurrences, so repeated pad numbers do not merge drill or custom-shape metadata. Marble's four J10 oval shield pads retain their separate saved slot dimensions across 12 layers. Strict drill containment remains enforced.

The IRCA JP5/JP6 custom-pad family uses the validated union of its saved rectangular anchor, two filled circles and asymmetric side polygon. Mirrored contours have different batch keys; saved rotation applies normally. Other unsupported primitive combinations still report a diagnostic instead of receiving a rectangular substitute. This does not claim support for arbitrary custom-pad Boolean expressions.

Saved copper contours are indexed by layer through the existing AST. The native 3D path no longer drops later contours when an aggregate temporary point-copy cap is exhausted. Final geometry is admitted by retained bytes: 64 MiB on desktop, 32 MiB on constrained devices. The legacy bounded materializing helper retains its contract.

Filled zones use Float32 positions, exact normalized signed-byte plane normals and typed indices. They avoid Shape/LineCurve/Vector2 graphs, unused UVs, face-triplet arrays and retained coordinate copies. The 3D source projection also avoids an unused second set of zone points. NPTH pads whose saved drill covers the entire nominal pad correctly have no copper annulus; their drill loops still cut the substrate. Invalid plated annuli remain rejected.

## Source and geometry checks

The pinned public [Marble source](LARGE-PROJECT-VALIDATION.md) remains 44,059,775 bytes at the same revision/hash: 1,006 parts, 5,272 pads, 37,380 parsed track pieces and 12 copper layers. The CPU geometry audit admits **139/139 copper contours**, with zero invalid/index-omitted or triangulation-rejected copper contours and zero rejected copper pads. One non-copper contour is outside the copper renderer; 19 drill-only NPTH pads correctly have no copper face.

The result has 752,811 vertices and 752,499 triangles in 19,329,951 retained geometry bytes, below both device budgets. The largest observed area difference between saved contours and triangulated Float32 geometry is 0.000786 mm². Analytic custom-pad area/mirror/containment tests and fractured-hole topology tests pass. Area agreement alone does not prove arbitrary-polygon topology or native-pixel equivalence.

## Memory measurements

The isolated source-preparation benchmark used a 768 MiB Node old-space cap. Additional retained heap fell from 462,652,424 to 284,134,384 bytes (**38.6%**, about 170.2 MiB saved), with identical object counts. RSS high water fell from 691,636 to 513,232 KiB. This measures source preparation plus the parsed 3D board, not WebGL, models, a phone or a total-browser quota. Completed short S-expression forms now use fixed-size arrays instead of retaining growable-array spare capacity.

A single sequential same-harness desktop run with ten GND select/clear cycles sampled 845,640,512 bytes of JS heap for the previous SDK and 750,016,217 for the new SDK. An ordinary split-bundle run sampled 735,556,204 bytes. The fixed 340 px iframe run sampled 701,425,858 bytes from an 11,137,422-byte initial heap.

These are observations, not medians. Automatic GC, cache, bundle format and uncollected prior contexts affect samples; the sequential desktop candidate started with prior-context memory still present. The 250 ms timer cannot sample during synchronous work. JS heap excludes process/GPU allocations and may omit external typed-buffer storage. No universal sub-1-GB total-RAM promise is made.

## Browser acceptance

Desktop and 340 px frames passed Marble GND selection/clear, camera preservation, 100% expansion and layer toggles. All 139 copper contours remained present. Narrow content measured 325 px client width and 325 px scroll width, with no horizontal overflow.

IRCA passed desktop/narrow 3V3 cross-selection with all 21 copper contours and 50 linked models. JP5 and JP6 were visually inspected in layer colors with occluding model bodies hidden; their mirrored/rotated rounded copper is visible. Saved expansion/camera/layer/selection restoration and light theme passed. No browser warning/error was recorded in this pass.

The optional shine-through **outline halo** retains a separate edge budget. Its `netGlow.limited` can be true while native filled copper and selected zone faces remain fully rendered. This is distinct from `zones.rejected` or source-index omissions; no unlimited-overlay claim is made.

These are desktop-GPU responsive iframe checks, not physical Android/iOS touch/GPU qualification. IRCA retains its approved review/model disclosure, including one nominal IC model. Marble manifests deliberately use disclosed model proxies. Missing-model, drawing-sheet, substrate-drill and unsupported-input diagnostics remain separate.

## Diagnostics

`viewer.getRenderStats()?.zones` exposes source copper/non-copper contour counts, retained bytes, rendered contours and rejections. These are renderer counters, not process memory. If a genuine final-byte budget is exceeded, the exact contour is reported rather than silently replaced with invented copper. Comparison fingerprints and parser acceptance ceilings are unchanged.
