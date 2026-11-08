# Gerber, Excellon and ZIP beta

These readers and the CAM canvas are part of the same KiCad WebView library. They run in the browser, without uploads, a native KiCad installation or a runtime Node server. The view is read-only. Existing KiCad APIs remain available.

## Direct integration

```html
<script src="./kicad-webview.min.js"></script>
<kicad-viewer src="./fabrication.zip"
  style="display:block;height:500px" theme="dark"></kicad-viewer>
```

```js
const viewer = new KiCadWebView.Viewer('#board');
await viewer.load('./fabrication.zip');        // hosted ZIP
await viewer.load('./manufacturing.json');    // manifest overlays its CAM files
await viewer.loadFiles(fileInput.files);      // browser Files: no upload
await viewer.loadArchive(await zipFile.arrayBuffer());
await viewer.loadSource(gerberText, { path: 'top.gbr' });
viewer.setLayers(['top.gbr', 'holes.drl']);
viewer.setMeasuring(true);                    // two clicks; event distance is mm
viewer.addEventListener('select', event => console.log(event.detail.item));
viewer.addEventListener('measure', event => console.log(event.detail.distance));
```

These are successive loading examples, not instructions to load every source in sequence. The package also exports Viewer, KiCadViewer, parseManufacturing and readZip from its ESM entry. Manufacture inputs use `view: 'manufacturing'`; leave view unspecified for automatic selection. They do not synthesize a 3D assembly.

A manifest uses the existing structure:

```json
{
  "entry": "top.gbr",
  "files": [
    { "path": "top.gbr", "url": "./top.gbr" },
    { "path": "bottom.gbr", "url": "./bottom.gbr" },
    { "path": "holes.drl", "url": "./holes.drl" }
  ]
}
```

Selecting a manufacturing entry overlays the manifest's manufacturing files. Selecting a KiCad entry uses its native KiCad renderer. File sets/ZIPs retain individual drawing navigation; unsupported non-drawing bundle entries are listed in notes. JSON job metadata is not executed or followed as an external reference. A Gerber job reader is not implemented in this beta.

The `path` names are the layer IDs returned by `getLayers()`. The current per-layer controls toggle visibility; layers use theme-specific display colors. A clear-polarity Gerber operation erases only its own layer. Click geometry for source/tool/aperture metadata; use the ruler button for two-point measurement. Drag to pan, wheel to zoom, Fit to reset, Escape to clear selection/measurement. Measurements describe saved geometry and are not a manufacturing assurance check.

## Drill import ambiguity

Files with a proper header and decimal coordinates load automatically. This beta requires an M48 header; header-less files are unsupported. Headered integer-coordinate files may require explicit settings, for example:

```js
await viewer.loadFiles(files, {
  importOptions: {
    'holes.drl': {
      format: 'excellon', units: 'mm',
      formatDigits: [3, 3], zeroSuppression: 'leading'
    }
  }
});
```

`formatDigits` describes integer/fractional digit counts; `zeroSuppression` names the omitted zeros. Do not confuse Excellon LZ/TZ header conventions with Gerber FS conventions. Supply settings from the exporting tool or fabrication documentation. The parser must reject unresolved ambiguity instead of guessing scale. Content signatures take precedence over filename suffixes; `.txt` is only a candidate, not proof of drill data.

## Bounds and archive policy

- Local file sets: at most 256 files, 32 MiB each and 128 MiB aggregate bytes. Browser Files need a known bounded size; explicit source/byte entries are also accepted.
- Manufacturing collection: at most 200,000 emitted operations and 16 million SVG path characters. Each manufacturing text file is limited to 16 MiB by the parser. Parser-specific command, expression and geometry limits also apply. Parsing is currently bounded synchronous browser work; large inputs can pause the UI. Worker-based parsing is future work.
- ZIP: at most 64 MiB input, 128 MiB expanded, 32 MiB per member, 256 entries and expansion ratio 1000. Limits passed to readZip may lower these caps. Stored and deflate entries use native browser DecompressionStream for inflation; an unavailable native codec produces an actionable error.
- CRCs, local/central headers, sizes, file ranges and safe unique names are checked. Encrypted, multi-disk, ZIP64, nested, symlink/special-file and unsafe-path archives are rejected. Nothing is extracted to disk. Partial archives are not committed to the viewer.
- Hosted manufacturing manifests use the same 256-file and 128 MiB aggregate budget. HTTP(S)/CORS rules and existing credential restrictions still apply. Archive/memory model references do not cause arbitrary external fetches.

Use an up-to-date browser with Canvas2D, Path2D, streaming fetch and native deflate-raw decompression. The embed shell can be static hosted, including GitHub Pages. Private source authentication and application attachment access require separate authorized host adapters.

## Supported beta scope and limits

Gerber support covers the implemented RS-274X aperture/coordinate, flash, draw, region, arc, polarity, transformation and step-repeat subset, with supplied X2 attributes retained for inspection. Excellon support covers the implemented units/format, tools, drill hits, slots and routing subset. Read the visible rendering notes for unsupported constructs. Omitted geometry must not be treated as an empty layer or manufacturing clearance. Clear-exposure aperture macros, elongated-obround sweeps and non-circular arc sweeps are omitted with warnings. Aperture blocks, negative images, incremental coordinates and unknown geometry-affecting states reject the file. Step-repeat requires explicit X/Y/I/J fields and an explicit close; nested step-repeat is unsupported. Advanced aperture macros and non-circular aperture sweeps remain bounded by the parser's documented diagnostics; unknown geometry-affecting state rejects the file.

No connectivity is invented from pixels. Original net/component identity is available only where supplied by supported attributes or source metadata. No DRC/ERC, fabrication readiness certification, native Altium parser or reconstructed source schematic is implied.

## Real-design acceptance fixture

`fixtures/inverter-cam` contains four Gerber layers and PTH/NPTH drill exports from the owner's public three-phase inverter at revision `283f41b65c193abcc7e63c8c919dacdbccc89829`. KiCad 10.0.6 exported the unchanged saved board with no requested zone refill. The source SHA-256, commands and output hashes are in PROVENANCE.json. The original design has no upstream license file; it is an owner-provided authorized demo, not an assertion of a broader open-source hardware license.

`scripts/build-demo-archive.mjs` creates the demo's deflated ZIP from that manifest. The build publishes the static example at `manufacturing.html`; it loads `manufacturing/inverter-fabrication.zip` through the actual library API. Native Gerber macros are retained in the fixture, including KiCad rounded-rectangle pads. Existing saved-fill limitations remain part of the source evidence.

Test parser coordinates, arcs, polarity, ambiguity and malformed input; test archive bounds/corruption; test source retention and stale-load cancellation. Actual browser checks and live app acceptance are recorded separately. See [application beta setup](APP-INTEGRATIONS-BETA.md).

Reference specifications: [Ucamco Gerber/XNC](https://www.ucamco.com/en/guest/downloads/gerber-format), [Compression Streams standard](https://compression.spec.whatwg.org/).
