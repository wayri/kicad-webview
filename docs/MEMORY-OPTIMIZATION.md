# Large-board memory optimization — unreleased

These changes are prepared for the next WebView release. Publication remains paused; published 1.0.0 assets are unchanged.

## What changed

- Rendering snapshots retain the parsed source tree without comparison strings/records. Connectivity derives compact identities and fields without a second parse. Full comparison metadata remains available on demand from the same tree.
- Source-size checks no longer allocate a full UTF-8 byte array merely to count bytes; Unicode and unpaired-surrogate replacement semantics are preserved.
- Repeated model meshes share ordinary dim materials by source. Instanced color/shadow variants remain separate; clearing restores source materials and disposal remains once per owned clone.
- Identical validated local pad/via-cap extrusions share buffers across layers, keyed by outer contour, drill contour and copper thickness. A 512-entry mount-local table bounds reuse metadata; exceeding it creates correct uncached geometry rather than omitting objects.
- Model decoding avoids TypedArray iterable-list expansion: native base64-to-bytes where available, otherwise a preallocated indexed copy. Input, decoded-size, compressed-frame and checksum limits remain enforced. Decode peak RAM has not been benchmarked here.

## Prepared-source measurement

Run from the source checkout with the existing Node runtime:

```sh
node --expose-gc --max-old-space-size=512 scripts/benchmark-render-memory.mjs comparison 10000 50000
node --expose-gc --max-old-space-size=512 scripts/benchmark-render-memory.mjs compact 10000 50000
```

Each profile runs in a separate process. The synthetic source contains 10,000 four-pad footprints plus 50,000 tracks: 100,000 saved object records and 9,979,347 source bytes. It is synthetic parser/retention stress, not a real hardware design or full 3D assembly benchmark. Three-run medians on the development machine:

| Prepared-source measurement | Full comparison profile | Compact viewing profile |
| --- | ---: | ---: |
| Retained heap increase after GC | 221.3 MiB | 155.9 MiB |
| Sampled heap immediately after prepare | 256.0 MiB | 177.4 MiB |
| Process RSS high water through preparation | 423.0 MiB | 315.8 MiB |
| Preparation time | 669.5 ms | 168.6 ms |

The retained-stage reduction is **29.6%**, about **65.4 MiB**. Timing excludes subsequent connectivity construction and rendering; this is not a claim of equivalent whole-project loading speedup. RSS includes runtime/source-generation overhead and differs from heap, live bytes and GPU allocations. GC/runtime/platform affect results. Read the separate `preparedHighWaterKiB` field before post-measurement record inspection; overall process high water may include that later inspection.

## Repeated assembly and layer stress

Deterministic Three.js tests check 2,048 repeated occurrences using two source materials: dimming retains **two shared clones**, not one per occurrence. Restoration and single disposal are verified. A 32-layer test with eight annular cross-sections retains **eight extrusion geometries**, rather than 256, while instance transforms remain distinct. This is reuse of identical shapes; it does not merge different drills, thicknesses, nets or saved identities. The tests do not measure physical-device peak RAM.

`viewer.getRenderStats()` exposes `padGeometryCache` (`entries`, `hits`, `uncached`) and `selectionMaterials` (`capturedObjects`, `sharedDimMaterials`) alongside retained buffer/texture estimates. These do not constitute total browser-process memory. Internal source preparation is not exposed as a mutable host cache.

## Verification and limits

The complete serial suite passed **673 tests**, zero failures or skips; canonical 3D/main builds passed. KERO and the approved IRCA projection passed linked-net/clear, expansion and immediate view restoration in desktop and 340 px iframe checks. IRCA retained its 50 modelled components. No new browser console warning/error was recorded in this memory pass. Previous iframe-host diagnostics and physical-device qualification remain separate acceptance items documented in the stability validation record.

No acceptance ceilings were raised. Large distinct geometry, textures, full source trees and multiple simultaneously mounted viewers can still require substantial RAM. Use explicit loading, lazy 3D, a single active pane and Low/Balanced quality on constrained hosts. This release work does not provide streaming/out-of-core assembly rendering or guarantee that every file at the parser ceiling fits a phone. Preserve missing-model and unsupported-geometry diagnostics when evaluating large real projects.
