# Imported analysis visualization (beta)

Display fast PI, thermal or other scalar result fields on the saved PCB layout. The library visualizes supplied data; it does not run, qualify or validate a solver. Producer claims (`computed` or `measured`) are not independently verified. An illustrative run is prominently labelled.

```js
const viewer = new KiCadWebView.Viewer('#board');
await viewer.load('/boards/power.kicad_pcb');
// Same-origin fetch shown; a different host must permit CORS.
const response = await fetch('/results/fast-pi.json');
if (!response.ok) throw new Error('Results unavailable');
await viewer.setAnalysis(await response.json());
viewer.setAnalysisField('voltage-drop');
// viewer.clearAnalysis(); viewer.getAnalysis();
```

The secure-context helper `KiCadWebView.analysisSourceHash(savedPCBText)` hashes the exact UTF-8 source string, preserving line endings and whitespace. Compute/export the same SHA-256 in the producing program. Mismatched results are rejected before display. Opening another source clears results, including while a hash is pending. Changing PCB to 3D pauses the overlay and returning restores it. Results apply only to PCB 2D in this beta.

```json
{
  "schema": "kicad-webview.analysis/v1",
  "coordinateSystem": "kicad-mm",
  "board": {"sha256": "<64 lowercase hex characters>"},
  "provenance": {
    "kind": "computed",
    "tool": "Producer name and version",
    "runId": "saved-run-identifier",
    "assumptions": ["Record model, loads, materials and boundary conditions here"]
  },
  "fields": [{
    "id": "voltage-drop", "name": "Voltage drop", "unit": "mV",
    "layer": "F.Cu", "range": [0, 100],
    "samples": [{"x": 10, "y": 20, "width": 1, "height": 1, "value": 12.5}]
  }]
}
```

Coordinates are saved KiCad PCB world coordinates in millimetres: X rightward, Y downward, with no unit conversion, origin shift, rotation or interpolation. Each sample is an axis-aligned rectangle with a constant supplied scalar value. Exporters must transform their native coordinates explicitly. Values use the field's declared units; no inference or conversion occurs. A field's optional layer must exist in the saved design and its visibility follows that layer. Omitting the layer makes it a board-wide display field. Rectangles are not clipped to copper or board outlines.

Controls include field selection, overlay visibility, opacity, fixed colour scale, pointer value readout, and run details/assumptions. Actual values remain unchanged when colours clamp at scale endpoints. Missing coverage is reported as missing; it is never zero-filled. In overlapping rectangles the last supplied cell wins for drawing/probing. Opacity applies to the composed heatmap as a group.

Limits: 8 fields, 10,000 cells total, 8 MiB JSON text, finite scalar magnitudes <= 1e9, coordinate/dimension magnitudes <= 1e6 mm, positive dimensions, unique field IDs and bounded metadata. `setAnalysis` accepts parsed objects or JSON text, copies/freezes the validated contract, and rejects malformed data. Hosts should bound network response bytes before parsing when accepting untrusted URLs. Use HTTPS/localhost for Web Crypto. Analysis data remains in browser memory; this API does not upload it.

For native WayriCAD portable results, use [WayriCADResultsViewer](WAYRICAD-RESULTS.md), which retains saved triangle meshes, grids, SI curves and thermal frames. This rectangular scalar interface remains separate and PCB-2D-only. Neither API executes a solver.

Scalar readouts and scale endpoints use six significant figures for presentation; the accepted dataset retains its original values through getAnalysis().
