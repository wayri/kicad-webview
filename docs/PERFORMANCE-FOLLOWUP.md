# Interaction and memory follow-up — unreleased

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

42 focused tests and the complete 720-test suite passed, with no failures/skips in the final run. Canonical 3D/main builds passed. The initial full-suite attempt hit a sandbox loopback permission denial; the unchanged localhost test passed in the final admitted run.

No-capture isolated headless WebGL checks exercised retained local KERO (79 parts) and Marble (1,006 parts, 340 px viewport). Camera-update frames rendered, GND selection retained the camera, and Marble kept 139/139 copper contours with zero zone rejections. Steady camera frames issued zero error probes after allocation settled. These checks use disclosed footprint proxies, not external detailed model downloads, and do not establish physical-device or visual-pixel acceptance.

Marble still sampled approximately 681–737 MB of JS heap across the candidate runs after the scenario. JS samples exclude process/GPU allocations and can miss synchronous peaks. The source tree, native drawing primitives and large source data remain resident; these fixes do not establish arbitrary-size out-of-core or paging support. Large-board import memory remains a separate target.

Clearing an instanced selection still recreates selection-color variants/buffers; further pooling needs an explicit GPU lifetime design. Expansion still performs source selection work while moving. These remaining costs are not hidden by the material benchmark. No claim is made that every board or device is now jitter-free.

Diagnostics include `getRenderStats().graphicsHealth` and `.silkscreenDetail`, reporting probes, repaint count, moving/pending state and retained detail textures. Counters are renderer activity, not process-memory measurements.


The same isolated headless harness on immutable 1.1.0 issued 40 synchronous error queries during 40 camera-update frames; the candidate issued zero after allocation settled. This is one real-renderer comparison, not a multi-run FPS or cross-device benchmark. The synthetic material result above is the three-run comparison.
