# Native BOM and saved-board data

Available in 0.5.0. This independent read-only panel uses the same saved KiCad source as the native viewer. It runs in a browser without Node.js or a service.

```html
<div id="board" style="height:65dvh;min-height:320px"></div>
<div id="bom"></div>
<script src="https://cdn.jsdelivr.net/npm/@wayrisignals/kicad-webview@0.5.0/dist/kicad-webview.min.js"></script>
<script>
const viewer = new KiCadWebView.Viewer('#board', {theme:'dark'});
const bom = new KiCadWebView.BOMViewer('#bom', {viewer});
viewer.load('/designs/project.zip');
// Optional: bom.setMode('board'); after a native PCB has loaded.
</script>
```

The panel follows native PCB/schematic source changes. It groups equal saved value, footprint and population state; searches references/values/footprints; distinguishes fitted, DNP and excluded entries; and exports the full eligible BOM as CSV, including DNP. Filters do not change the CSV. Group quantities describe the entire matching group.

Click a part to select and locate its exact saved UUID in the attached viewer. In its 3D view, existing locate behavior flips/focuses the board. Clicking a source part highlights its BOM group. Links are disabled for different source bytes or paths, missing UUIDs, duplicate PCB UUIDs and unsupported formats. Schematic counts deduplicate units of a saved reference within one file; they do not expand repeated sheet instances or promise cross-sheet assembly quantities. No variant, price, stock or procurement estimates are added.

## Independent data API

```js
import {buildBOM, analyzeBoard, bomToCSV} from
  'https://cdn.jsdelivr.net/npm/@wayrisignals/kicad-webview@0.5.0/dist/bom-viewer.js';
const source = await fetch('/designs/board.kicad_pcb').then(r => {
  if (!r.ok) throw new Error('Board request failed');
  return r.text();
});
const report = buildBOM(source, {path:'board.kicad_pcb'});
const csv = bomToCSV(report);
const stats = analyzeBoard(source, {path:'board.kicad_pcb'});
console.log(report.groups, stats.netTracks, stats.layerTracks);
```

npm users may import the same exports from `@wayrisignals/kicad-webview/bom`. The dedicated bundle omits the 3D engine; the full viewer remains necessary to display a board. Pure functions need no DOM. Reports are deeply frozen, omit parser internals/raw source, and retain saved properties as text. `bomToCSV` accepts only reports made by `buildBOM` in the same module instance; CSV cells that resemble spreadsheet formulas are neutralized.

`BOMViewer(target,{viewer?,theme?})` offers `loadSource`, `attachViewer`, `getBOM`, `getBoardStatistics`, `setMode('parts'|'board')`, `setQuery`, `setGrouped`, `setTheme`, `exportCSV`, `downloadCSV`, `clear`, `dispose`. Events: `ready` (path, kind, total, groups), `select` (uuid, reference, path), `error` (message). Dispose the panel with the host app. Board analytics are computed lazily and cached until source changes; switching the same board between PCB and 3D does not reparse it.

## Interpretation and bounds

- Track lengths sum saved segment centerlines and circular arc lengths, by saved net/layer. Via barrel length and routed signal-path delay are not inferred.
- Zone areas sum retained polygons. Overlaps count repeatedly and holes are not subtracted. These are not copper-union areas, mass estimates or regenerated fills.
- Edge bounds are available only for supported saved straight outlines. Origin/envelope placement candidates need review; they do not certify an unplaced component.
- No DRC, zone refill, solver run or manufacturing certification is performed. Invalid/unsupported geometry is disclosed through warnings; invalid thickness is unavailable.
- Source limit: 8 MiB UTF-8, 100,000 counted objects, 200,000 retained zone points; at most 64 saved properties per part. CSV preflight limits output to 32 MiB UTF-8. Large source parsing is synchronous; load it outside a gesture handler.
- The UI bounds rows to 50 per page and part buttons to 25 per group page. Board detail previews cap zone/layer rows with visible disclosures; complete accepted data remains accessible through the API.

The library is free to use, including commercially, under MPL-2.0. Paid integration/customization/support is optional. Hardware examples retain their own upstream licenses and attribution.
