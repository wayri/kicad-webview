# Large open-source project validation — 1.1.0 candidate

Publication is paused. These checks cover the current source candidate, not published 1.0.0 bytes or installed clients. Core API 1.0 and MPL-2.0 remain unchanged.

## Source and acknowledgements

| Project | Pinned source | Source bytes | Saved counts used in checks | Rights / disclosure |
| --- | --- | ---: | --- | --- |
| BerkeleyLab / Marble | [a426777d92c0](https://github.com/BerkeleyLab/Marble/tree/a426777d92c0f22a546d4740b419a3937e0c1f90), `design/Marble.kicad_pcb` | 44,059,775 | 1,006 parts; 5,272 pads; 37,380 parsed track pieces; 140 parsed zone contours; 12 copper layers | CERN OHL v1.2; copyright Regents of the University of California through LBNL. See upstream README for DOE notice and credits to Michal Gaska, Larry Doolittle, WUT, Creotech and other contributors. |
| OLIMEX / ESP32-PoE | [deb38a377d50](https://github.com/OLIMEX/ESP32-POE/tree/deb38a377d50eadb04ddc7118a17a5ae58b1ee53), `HARDWARE/ESP32-PoE-hardware-revision-M2/ESP32-PoE_Rev_M2.kicad_pcb` | 2,809,205 | 143 parts; 603 pads; 2,528 parsed track pieces; 723 parsed zone contours; 4 copper layers | Hardware Apache-2.0, OLIMEX; upstream software GPL-3.0 and documentation CC-BY-SA-3.0 are separate works. |

SHA-256 of the retained immutable sources:

- Marble: `482850dbaaef9157e2e98af765a3c0d4d9c9f800daae224a54bf10e0621f52b0`
- OLIMEX: `7c9f634768ff4e8aee67b8f2f83d0495ab00e2f50209c5dd133a9f39e8bce9fa`

The [large-project lab](../examples/large-projects.html) fetches these public, revision-pinned raw files only after Load PCB. The library ZIP does not redistribute the hardware source files. Model CAD is not in these test manifests: saved footprint proxies and missing-model notes are disclosed. Marble's retained repository snapshot supplies no model CAD. This is PCB geometry scale testing, not complete assembly-CAD qualification. The approved IRCA projection separately verifies 50 linked models and discloses its nominal IC model. No three-phase example is used.

## Isolated preparation measurement

With existing pinned development dependencies, run each command in a separate process:

```sh
node --expose-gc --max-old-space-size=768 scripts/benchmark-project-memory.mjs shared /path/to/Marble.kicad_pcb
node --expose-gc --max-old-space-size=768 scripts/benchmark-project-memory.mjs separate /path/to/Marble.kicad_pcb
```

Use the same commands for the pinned OLIMEX PCB. The source is loaded before the heap baseline. The shared profile uses compact preparation and the validated AST for the 3D board parser. The separate comparison profile retains comparison metadata and independently tokenizes/parses 3D. This compares two preparation strategies, not a timed end-to-end released-version browser benchmark. Each figure below is one run, not a median or statistical claim.

| Preparation measurement | Marble shared | Marble separate | OLIMEX shared | OLIMEX separate |
| --- | ---: | ---: | ---: | ---: |
| Additional retained heap after GC | 441.2 MiB | Heap cap reached | 29.8 MiB | 37.3 MiB |
| Process RSS high water through preparation | 675.4 MiB | No successful result | 97.5 MiB | 242.5 MiB |
| Total source-preparation + 3D-parser time | 1,136 ms | No successful result | 87 ms | 239 ms |

The separate Marble baseline exited with V8 heap exhaustion at the deliberate 768 MiB old-space cap; it was not rerun with a raised cap. This is a baseline limitation, not a candidate test failure. Shared and separate OLIMEX parsed counts agree. RSS includes runtime overhead and is distinct from heap; neither includes WebGL or GPU memory here.

## Online loading and responsive browser checks

The built candidate loaded the immutable public raw URLs in one browser tab, with one active viewer. Both projects passed saved-layout load, 3D switch, ten full-net select/clear cycles with camera preservation, expansion to 100%, internal copper representation and unload. Marble retained 1,006 parts / 1,374 nets and OLIMEX 143 parts / 119 nets. Marble decoded model concurrency was one because the assembly exceeds 512 components. No geometry-budget acceptance ceiling was raised.

Desktop and 340 px sandboxed iframe checks passed. The iframe content measured 320 px client width and 320 px scroll width; compact layer popup and layer visibility toggles worked. This uses a desktop GPU at a mobile-sized width, not a physical Android/iOS device, constrained-GPU emulation or touch qualification. No warning/error was recorded in this pass; prior unlocalized MutationObserver host diagnostics remain unattributed, not declared fixed.

Chromium sampled JavaScript heap on Marble reached 978,012,184 bytes on desktop and 824,081,626 bytes in the narrow iframe; later samples were roughly 663–712 MB and 667 MB respectively. The timer cannot sample during synchronous work, and performance.memory can include other same-process contexts. Samples exclude process/GPU memory and unsampled peaks. Therefore this does **not** establish a total-RAM ceiling below 1 GB. OLIMEX settled around 100–125 MB after automatic GC in the sequential test; its peak is not compared because prior Marble allocations had not yet been collected. Disposal is verified through viewer/resource tests; GC timing is browser-owned.

Marble's layout select/clear median was about 545 ms in this run; 3D narrow select/clear was about 40 ms. Loading took about 8.3 seconds and 3D mounting about 7.7 seconds on the desktop run, including network/cache and instrumentation effects. These remain performance improvement targets, not mobile-speed guarantees.

## Release gates

Keep publication paused. Match source, built bundle, package hashes and documentation before distribution. Physical-device performance, complete CAD assembly qualification, installed client/store checks and prior observer-error attribution remain separate acceptance items. The resident renderer does not page arbitrary-size projects from disk; callers should load explicitly, keep one active heavy viewer, use lower quality on constrained hosts and unload before changing large projects.


### Linked Online rendering acceptance findings

The corresponding KiCad Online candidate also opened pinned Marble at 340 px (316 px content width), retained 1,006 components and 12 copper layers, and preserved the camera on GND selection. Its diagnostic reported 48 selected pad primitives rejected by the 3D outline path and 47 saved-zone contour omissions; IRCA reported two custom 3V3 jumper-pad omissions (JP5 and JP6). These are explicit incomplete-geometry findings, not successful qualification of every selected primitive. Online reported no selected-primitive batch-limit hits; its 48 omissions were pad-outline rejections. Exact selected counts are Online findings, not a measurement of this SDK lab. The Online owner tracks baseline source classification and exact package readiness separately. Shared renderer limits mean this SDK must not claim complete custom-pad/zone fidelity from the scale tests above. Physical-phone and full-CAD qualification remain open; publication stays paused.
