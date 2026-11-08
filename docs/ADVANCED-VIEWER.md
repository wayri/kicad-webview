# Advanced read-only project viewer

The compact `KiCadViewer` remains the minimal single-drawing embed. `AdvancedKiCadViewer` (`ProjectViewer` alias) adds project navigation around two independent instances of that same library. It has no comments, annotation editor or design editing commands.

```js
const project = new KiCadWebView.AdvancedKiCadViewer('#project', {
  theme: 'dark', layout: 'split', linkedSelection: true
});
await project.load('/design/project.json');
// await project.loadFiles(browserFiles);
// await project.loadArchive(zipBytes);
project.setActivePane(1);
await project.openFile('sheets/power.kicad_sch');
project.setLayout('single'); // or split
project.getActiveViewer().fit();
// project.dispose();
```

Give the mount element an explicit usable height. The JavaScript bundle, design files and project manifest can be served from a static website; no Node server is required. Use the generated `advanced.html` / `advanced.mjs` example or self-host the classic bundle. Cross-origin design sources need CORS.

The searchable Files section represents every listed project file using its saved relative path, with directory groups. Current-sheet saved child-sheet links are shown separately when the core exposes `getSheets()`: only links resolved to a listed project drawing can open; missing/unlisted references remain disabled. Selecting a file opens it in the active pane. The initial complementary schematic or PCB is loaded into the second pane when available. Compact drawing controls remain available in each pane for view selection, saved layers, themes, fit, inspector, part/pad/net selection and 3D controls. The active Parts and Nets sections offer bounded search/results; nets are selected by stable per-drawing IDs when available. Single mode preserves the other pane's state. Split mode uses independent cameras, stacking the panes at narrower widths; the project navigator can be toggled to leave room for the drawing on phones.

`getFiles()` returns listed paths/URLs; `getActiveViewer()` exposes the full compact viewer including imported analysis methods. Workspace events are `ready` and `select` (include zero-based `pane`), `error` (`pane` and error), `panechange`, and `projectready` (`files`). `dispose()` aborts pending loads, releases both renderers/listeners and allows the host container to be reused.

Component cross-probing applies only between the two loaded drawings. It uses exact saved UUID relationships: the PCB footprint's saved schematic-path UUID must match one unambiguous schematic symbol UUID, or both panes must show the same saved file/object UUID. Repeated references are never used as identity. If the relationship is absent or ambiguous, selection stays local. It does not automatically load every sheet or infer repeated-sheet instance mappings. Net names stay local to their drawing: matching short names across sheets is not proof of electrical connectivity, so automatic cross-sheet net linking is deliberately absent.

This is an advanced viewing/navigation surface, not a blanket claim of extension feature parity. GitHub comments/authentication, review discussions, conflict resolution, revision comparisons, editable BoM workflows and native solver execution are not part of this workspace. Rendering limitations and approximate 3D model notices from the compact library remain visible. The project tree reflects manifest/bundle paths rather than reconstructing a KiCad hierarchy from filenames.
