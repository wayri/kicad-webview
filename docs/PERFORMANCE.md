# Rendering and loading performance

Version 0.1.0 coalesces model-loading visibility, clipping, selection and diagnostic refreshes into the existing draw scheduler. Empty selections skip pickable-object matching and bounding-box traversal. Close-zoom labels reuse transformed pad positions and a projection vector. No additional animation loop or polling timer is introduced by this optimization.

## Browser sample

The credited OLIMEX ESP32-P4-DevKit Rev D1 demo loaded 141 model components from local files, in the same desktop Chromium browser and viewport. The instrumented previous renderer (source revision cf3b59f) performed 141 model refreshes and spent approximately 342 ms in visibility, clipping, selection and diagnostic work. The candidate performed 9 batched refreshes and spent approximately 10 ms in that work. A later candidate remount performed 7 refreshes in approximately 12 ms; scheduling and cache state affect these numbers.

These are bounded loading-work samples, not an FPS, network, total-load-time or cross-device benchmark. The instrumentation excludes model fetch and decode time. The baseline bundle had observation counters added; the candidate exposes counters through getRenderStats().

## Translucent inspection cost

Internal copper geometry is created lazily on the first translucent view and reused across appearance changes. Materials preserve original assets and are restored on return to an opaque appearance. Extra visible internal copper adds geometry and draw calls; translucency is an inspection feature, not a promise of a faster render mode. Screen-space ambient occlusion and object shadows are disabled while translucent. Use Low or Balanced quality for smaller devices.

The source XY geometry and layer identity are retained. Internal elevations use a complete consistent saved stackup where available; otherwise the viewer reports illustrative layer spacing. Blind/buried via geometry and unsupported constructs remain covered by rendering diagnostics. Physical mobile GPU performance has not been measured.
