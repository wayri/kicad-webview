# Lightweight module distribution

`dist/lite/kicad-webview-lite.js` is a browser ESM entry for the compact viewer. It includes KiCad schematic/PCB viewing, source loading, Gerber/Excellon and ZIP support. It excludes the advanced workspace, Altium adapter and eager public analysis utilities. 3D and imported analysis remain available through the viewer's async methods, but their modules load only when those features are requested.

```html
<div id="board" style="height:500px"></div>
<script type="module">
  import { KiCadViewer } from '/vendor/kicad-webview/lite/kicad-webview-lite.js';
  const viewer = new KiCadViewer('#board', { theme: 'dark' });
  await viewer.load('/boards/power.kicad_pcb');
  // Optional modules begin loading only on these explicit calls:
  // await viewer.setView('3d');
  // await viewer.setAnalysis(savedAnalysisJSON);
  // Call viewer.dispose() when your framework unmounts this container.
</script>
```

To use a custom element instead, import `registerKiCadViewer` from the same entry and call it before adding `<kicad-viewer>`. Importing the ESM entry alone does not register an element or create a viewer.

Self-host the complete `dist/lite` directory, retaining its relative `chunks/` structure, together with the release's license/third-party notices. Serve JavaScript files with a JavaScript MIME type. Use HTTPS or localhost for analysis SHA-256 binding. Module scripts and cross-origin project data require appropriate CORS headers. Deploy the entry and its content-hashed chunks atomically to avoid mixing revisions; do not copy the entry alone. `manifest.json` lists the runtime files and loading graph for each built revision. No JavaScript package imports, sibling repository paths, or external CDN runtime dependencies remain in those emitted modules.

The established `dist/kicad-webview.min.js` classic script and `dist/kivi-viewer.js` all-in-one ESM remain the simplest self-contained choices. Their packaging contract does not require optional runtime chunks. The lightweight build is an additional distribution, not a replacement.

## Build and verification

Run `node scripts/build-lite.mjs` with the same pinned esbuild 0.25.12 / Three.js 0.171.0 dependencies as the other builds. `KICAD_WEB_BUILD_DEPS` may point at an existing compatible dependency directory. No dependency installation is performed by the builder. The owned `board3d.js` implementation and its repository-local adapters compile into the optional 3D chunk; the initial entry does not inject a script referencing the sibling source tree.

The full initial static import closure measured on 2026-11-05 was **197,839 raw bytes / 70,742 gzip bytes**, across three files. Optional additional closures were **1,156,950 / 334,776 bytes for 3D** and **8,941 / 4,334 bytes for analysis**. Gzip totals sum each file compressed separately at level 9, excluding HTTP headers. These are artifact sizes, not browser memory, render latency or a competitor benchmark. Source changes alter hashes and sizes; the emitted manifest is authoritative for the current build.

`tests/lightweight.test.mjs` checks the static closure, emitted relative dependencies, size accounting and optional chunk presence. An isolated Node VM ESM loader executes only the initial closure on entry import; a stale analysis request cannot mount its layer, a valid explicit `setAnalysis` loads the analysis modules without Three, and explicit 3D runtime loading imports the owned renderer module. This verifies module boundaries and feature initialization, not WebGL rendering or browser network timing. Actual renderer/browser checks remain a separate acceptance step.

Analysis loading captures the saved source, design and request ticket before the first module import. It rechecks them after module loading and hashing, preserving wrong-board rejection and preventing source replacement, clear or disposal from committing stale results. Missing or blocked optional chunks reject their async feature request; they are not silently represented as loaded.

Repeat builds retire only unchanged generated JavaScript files listed in the previous lite manifest and absent from the new build. Targets are confined to `dist/lite`; symlinks and recursive traversal are disallowed. Unknown or modified files remain untouched. An exact cleanup check verified recorded/unchanged removal alongside modified/unknown preservation; all newly created test probes were then removed. The current manifest records SHA-256 checksums for subsequent cleanup and delivery verification.

The [MPL-2.0 license](../LICENSE) and retained third-party terms apply. This distribution adds no STEP/PDF capabilities or solver execution.
