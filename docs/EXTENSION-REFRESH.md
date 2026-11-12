# 0.6.0 viewer refresh

This release selectively ports read-only viewer features from the completed KiCad Online 0.12.94 candidate. Extension comments, repository authentication, editing and the Fast PI solver/setup UI are not part of this library. Use the existing WayriCAD result APIs to display retained PI/SI/thermal data.

## Native drawing fidelity and selection

Saved RGBA colors, supported native fills and dash styles are retained. Bounded schematic text boxes and validated embedded PNG previews are supported, with visible warnings for approximations or omitted constructs. Browser text wrapping is approximate; embedded PNG admission/decoded-cache budgets remain bounded. Embedded fonts, arbitrary external image URLs, animated PNGs and universal KiCad pixel parity are not promised.

Schematic label, sheet-pin and explicit power-symbol selection preserves saved electrical membership. Power flags do not become net names. More precise screen-space hit testing respects hidden layers and existing isolated selection. The library retains its adaptive cubic flattening, duplicate-UUID exclusion, source-content checks and net-membership work budgets.

## Exploded 3D inspection

Open the 3D tools and move **Explode**, or call `viewer.setExplode(35)` after loading 3D. `viewer.getExplode()` returns 0–100. Copper layers, supported through-via walls, component models and selected geometry separate for inspection. Zero restores assembly. Spacing is display-only, not a physical stackup change. Unsupported blind/buried-via geometry is not inferred.

Pad/via cap depth precedence is separated from unbiased walls to reduce shallow-angle copper striping. Right-drag panning does not perform a context-menu pick. Confirm rendering on your target GPU; focused depth checks do not establish universal visual fidelity.

Registered result overlays and their probes are hidden while exploded, because saved field coordinates describe the assembled board; their visibility is restored at zero. Measurement is disabled during exploded display. Read retained data independently without treating exploded geometry as a physical simulation.

## Navigation and loading

Advanced `ProjectViewer` has **Show sheet browser** and `openSheetBrowser()` / `closeSheetBrowser()`. Search its navigator for “sheet tree”, “sheet browser”, “sheet navigator” or “minimap” to reopen it. The floating panel uses the existing listed-source hierarchy, can be dragged by its heading, and retains its view when closed/reopened. It does not discover unlisted files or add repository permissions.

The independent `ProjectTree` gains Zoom in/out, Fit and Reset. Its `getCamera()` / `setCamera({zoom,x,y})` use zoom 0.35–2 and scroll offsets; `zoomBy`, `fit`, `resetView` and `clear` support host controls. Fit waits for a usable viewport. Background/Alt-drag pans; ordinary node clicks and native touch scrolling remain available. [Hierarchy API](PROJECT-TREE.md).

Switching between PCB, schematic and 3D restores a bounded camera/explode cache for the exact saved bytes and path. Inactive renderer resources are released rather than retaining additional WebGL contexts. Hierarchy loading fetches up to three listed schematics concurrently, retains deterministic file order and existing per-file/aggregate/cancellation limits. This is not a measured physical-phone speedup or a private-repository SSO integration.

The library remains free to use commercially under MPL-2.0; paid implementation/support is optional. [Saved BOM](BOM-ANALYTICS.md) · [WayriCAD results and registration](WAYRICAD-RESULTS.md).
