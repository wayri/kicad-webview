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


## Reader and assembly residency update (unreleased)

Quoted values now use source spans instead of character-by-character string concatenation. In one isolated-process Node check of a 4 MiB quoted embedded payload, the previous reader added 128.1 MiB of retained heap after GC; the span reader added 0.106 MiB. Process RSS high water was 289.5 MiB versus 44.3 MiB. Source allocation preceded measurement and remained live in both processes. This is one focused parser measurement, not a full-viewer memory claim or a guarantee across JavaScript engines. Recheck the current reader with:

```sh
node --expose-gc --max-old-space-size=512 scripts/benchmark-quoted-memory.mjs 4
```

The 3D reader consumes the existing validated mixed-atom tree instead of tokenizing and parsing a second complete board. KERO equivalence tests compare all parsed 3D board fields with the standalone path, including saved identities and component references. Camera history keeps weak document holders; old drawings can be collected after navigation. A collected history entry safely misses rather than restoring a stale camera.

`loadFiles()` retains inactive local PCB File/Blob handles without reading their bytes. Only the chosen PCB is decoded, and switching boards re-reads its handle. Source-string inputs stay as strings rather than taking a UTF-8 encode/decode round trip. This does not make schematic hierarchy, ZIP extraction or standalone HTML decoding lazy; those paths remain resident-memory operations with their existing bounds.

Shared scene resources are accounted incrementally. Repeated static model occurrences reuse the recorded buffer accounting; a 2,048-occurrence test adds no geometry-attribute reads after initial registration. Instance color, skeleton and texture changes invalidate their relevant accounting. The model template cache releases finished template graphs and adopts the final occurrence directly while keeping shared resource ownership until disposal.

Detailed model graphs are admitted before cloning: at most 32,768 model nodes on desktop and 8,192 on constrained devices. Wrappers count toward the limit. Excess detailed models retain saved footprint proxies and selection identities, and report a diagnostic. Decode concurrency is one on constrained devices or boards above 512 components, otherwise three. Graph limits reduce allocation spikes; proxy fallback is an explicit fidelity tradeoff, not missing components. Render statistics expose admissions, limits, rejections and concurrency.

These limits are not a total browser-process quota. Distinct PCB geometry, source trees, inspection indexes, GPU driver allocations and loader-internal allocations remain relevant. True arbitrary-size out-of-core viewing would require geometry paging and level-of-detail data; this update does not claim that capability.


GLB admission also validates accessor types, counts, strides, sparse ranges and buffer-view expansion before the loader allocates expanded arrays. Embedded PNG/JPEG headers are checked for device-specific dimensions and estimated RGBA/mipmap bytes before image decoding. Unsupported image formats retain the proxy with a diagnostic. These are per-model preflight limits backed by cumulative postdecode resource accounting; STEP/VRML kernel/loader internals and concurrent allocations are not covered by a hard quota. `modelGraph.imagePreflight` reports `png-jpeg`.

A new single-run 100,000-object compact check retained 154.3 MiB above the already-loaded source baseline and reached 316.7 MiB process RSS high water through preparation. This confirms the larger workload still completes under a 512 MiB Node old-space cap; it excludes 3D geometry, browser/GPU allocations and subsequent inspection work.


## Large real online sources

The pinned 44 MB Marble PCB and OLIMEX ESP32-PoE were checked through public raw URLs, desktop and 340 px embeds. Shared Marble preparation completed under a 768 MiB Node old-space cap; the separate comparison profile exhausted the cap. Browser samples still approach 1 GB during the transition to 3D, so no total-RAM ceiling is claimed. See [source hashes, counts, measured scope, results and remaining gates](LARGE-PROJECT-VALIDATION.md).


## Pad and zone refinement

The unreleased follow-up accepts every saved Marble copper contour with typed-buffer triangulation and fixed-size short AST forms. Additional prepared-stage heap falls 38.6% with identical object counts. [Refinement validation](PAD-ZONE-REFINEMENT.md) records the browser samples and their limits; no process-memory quota or physical-phone claim is implied.
