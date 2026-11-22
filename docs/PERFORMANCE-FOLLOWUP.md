# Interaction and memory follow-up â€” unreleased

This source update follows 1.1.1, retaining its saved back-side pad placement fix. It is not published and keeps the existing UI style and core API. Source geometry, layer colors, camera-preserving net selection and selected-net-only gold vias remain unchanged.

## Fixed paths

- Ordinary repeated model occurrences now share hidden and accent material variants by source. Isolate/accent no longer create one copy per occurrence. Instance-color and shadow variants retain their separate ownership.
- Lazy internal copper registers only its newly built source groups with the scene owner. Existing temporary selection materials are no longer accidentally retained as permanent source resources.
- During camera gestures and expansion, valid guarded silk detail remains sharp. Expensive canvas/texture refresh waits for movement to settle; out-of-crop motion uses a stable coarse map. Changing the physical layer plane invalidates detail even with a stationary camera.
- Synchronous WebGL error queries run after new allocations, pipeline creation, selection buffer changes and resize rather than every steady frame. Shader/context-loss callbacks remain active; deferred textures, models and copper mark allocation health dirty.

## Material-memory measurement

Three isolated processes per profile, 8,192 repeated component meshes, 2 shared source materials, 8 select/clear cycles in **Isolate highlight mode**. The same benchmark and existing Three version were used for the published baseline and candidate.

| Median | 1.1.0 baseline|Candidate|
|---|---:|---:|
|Material clones created/disposed|131072|16|
|Sampled peak JS heap|172665720B|59017912B|
|Heap after final clear and GC|24237256B|24144288B|
|Selection/clear work|497.95ms|93.68ms|
|Process RSS high water|295984KiB|113268KiB|

Peak sampled JS heap fell 65.8% in this synthetic material workload; final cleared heap is essentially unchanged. The improvement is allocation/churn reduction, not proof of an unbounded leak fixed or a whole-project/GPU memory ceiling. Timings depend on runtime, machine and GC.

Reproduce the candidate with existing project dependencies:

```sh
node --expose-gc --max-old-space-size=512 scripts/benchmark-selection-memory.mjs engine/spike/selectionAppearance.mjs 8192 8
```

Pass an exact saved baseline module as the first argument for comparison and use separate processes. The script records source SHA256, clone/disposal counts, heap samples, RSS and elapsed time. It does not retain clone objects to measure them.

## Checks and limits

The initial performance pass had 42 focused tests and the complete 720-test suite pass, with no failures/skips in the final run. Canonical 3D/main builds passed. The initial full-suite attempt hit a sandbox loopback permission denial; the unchanged localhost test passed in the final admitted run.

No-capture isolated headless WebGL checks exercised retained local KERO (79 parts) and Marble (1,006 parts, 340 px viewport). Camera-update frames rendered, GND selection retained the camera, and Marble kept 139/139 copper contours with zero zone rejections. Steady camera frames issued zero error probes after allocation settled. These checks use disclosed footprint proxies, not external detailed model downloads, and do not establish physical-device or visual-pixel acceptance.

Marble still sampled approximately 681â€“737 MB of JS heap across the candidate runs after the scenario. JS samples exclude process/GPU allocations and can miss synchronous peaks. The source tree, native drawing primitives and large source data remain resident; these fixes do not establish arbitrary-size out-of-core or paging support. Large-board import memory remains a separate target.

Clearing an instanced selection still recreates selection-color variants/buffers; further pooling needs an explicit GPU lifetime design. Expansion still performs source selection work while moving. These remaining costs are not hidden by the material benchmark. No claim is made that every board or device is now jitter-free.

Diagnostics include `getRenderStats().graphicsHealth` and `.silkscreenDetail`, reporting probes, repaint count, moving/pending state and retained detail textures. Counters are renderer activity, not process-memory measurements.


The same isolated headless harness on immutable 1.1.0 issued 40 synchronous error queries during 40 camera-update frames; the candidate issued zero after allocation settled. This is one real-renderer comparison, not a multi-run FPS or cross-device benchmark. The synthetic material result above is the three-run comparison.


## Further RAM and movement optimization

This local follow-up preserves the 1.1.1 back-side placement fix and the existing UI/API. It remains unreleased.

PCB zone primitives can defer their exact `{x,y}` arrays until a 2D consumer requests them. The viewer uses this mode; direct engine callers keep eager coordinates by default. Filled contours, bridges, layer membership, UUIDs and nets remain saved-source geometry. Outline layers share one coordinate array. Successful transitions to 3D release materialized 2D zone arrays after the old drawing is disposed; failed or superseded mounts preserve the active drawing. Returning to 2D materializes the same coordinates without reparsing the source. `getRenderStats().zonePointCache` reports retained contour/vertex counts; it is not a memory-meter API.

One isolated process per mode on the retained 44,059,775-byte Marble board (205,702 drawing primitives), with source, AST and design explicitly kept alive and forced-GC samples:

| Reader + drawing workload | Retained JS heap |
|---|---:|
|Eager zone coordinates|415,896,976 B|
|Deferred zone coordinates|356,232,448 B|
|Deferred, after materialization|416,627,736 B|
|Same process, after releasing the coordinate cache|356,300,720 B|

Deferring avoided approximately 59.7 MB (14.3%) in this parser/drawing workload. Releasing the materialized cache recovered approximately 60.3 MB in the cycle. These are scoped forced-GC samples, not whole-browser/GPU RAM or synchronous peak measurements. The immutable source and parse tree still consume substantial memory. Reproduce from a source checkout with `node --expose-gc scripts/benchmark-zone-memory.mjs path/to/board.kicad_pcb eager`, then `lazy` or `cycle` in separate processes.

For 2D boards with at least 20,000 primitives, moving gestures use a bounded CPU preview rather than synchronously uploading a large GPU snapshot. Up to 2,800 ordinary context primitives are painted per frame when the visible set exceeds that budget; selected/highlighted members and board outlines remain, so those exceptional sets can exceed the context budget. Detail labels and large context fills resume when movement stops. Source primitives and picking are never downsampled. Smaller local visible sets retain their full geometry. Medium-scene motion snapshots are reused, capped at four million pixels and released on disposal/context loss; the main canvas keeps its existing mobile pixel limits. Pointer/touch/wheel work is coalesced into animation frames.

During 3D net expansion, the renderer refreshes retained selected transforms instead of rescanning all native net members and reapplying their instance styles at every step. Net/layer/appearance/Parts visibility changes still refresh membership. Selected via barrels keep gold; other structures retain their selection context treatment. Diagnostics expose `netGlow.sourceScans`, `recordScans` and `transformSyncs` to distinguish membership work from animation transforms. A 10,000-instance regression retains the same overlay buffers/material through 40 transform updates, with no further record/source scans.


The final follow-up passes all 727 tests (zero failures/skips), strict public declarations and canonical builds. No-capture headless WebGL comparisons against retained published 1.1.1 used KERO at 900 px and Marble at 340 px. After 20 immediate expansion updates with a selected net:

| Board | 1.1.1 active JS heap after GC | Candidate | Native net-record scans: baseline → candidate |
|---|---:|---:|---:|
|KERO, 79 parts|17,542,436 B|17,639,588 B|150,080 → 0|
|Marble, 1,006 parts|375,839,092 B|339,948,656 B|2,631,620 → 0|

Marble retained all 139/139 copper contours with zero zone rejections and zero materialized 2D zone vertices in 3D. The KERO-only Parts-toggle regression confirmed isolation refresh. Expansion preserved camera vectors within 1e-9 tolerance (largest observed delta 3.6e-14); net selection itself retained the exact camera state. Steady camera frames made zero allocation-health probes.

These are one headless run per board/version with CDP heap measurement after forced GC, using retained local boards and disclosed model proxies. They exclude native/GPU allocations and do not establish physical-phone smoothness or a universal memory ceiling. KERO's heap is effectively unchanged and includes an additional candidate-only visibility test. Marble's active heap reduction is about 35.9 MB (9.5%); the 59.7 MB reader/drawing reduction above measures a different, isolated workload. Import peak memory remains higher than these settled samples, and the parse tree still stays resident. No screen capture or publication was performed.
