# KiCad WebView 1.0.0

The documented core embed API reaches version **1.0**. Embed read-only schematics, PCB layouts, interactive 3D assemblies and fabrication drawings with a classic script, an ES module, an iframe or a self-contained HTML file. Visitors need no Node.js server or KiCad installation.

## Included since 0.8.0

- Shared drawing improvements from KiCad Online: saved text variables, embedded symbol overrides, graphics, sheet markers/navigation and bounded multilayer inspection.
- Stable copper depth: resolved SMAA smoothing avoids the KERO pad/track speckling seen with hardware multisample/logarithmic depth. Copper role ordering is applied in the active depth domain and survives selection/translucency material clones.
- Camera-preserving net focus: selecting nets directly or through pads/linked views retains the current 3D camera. Explicit part selection still frames the part. In assembled and expanded Dim net views, only matching via caps and barrels stay gold; unrelated copper, all component bodies and board structures become gray and translucent. Changing nets, clearing and reassembling restore original materials without moving source geometry.
- Pinned KERO demonstrations and fabrication assets with exact-source provenance, hardware attribution and self-contained export. IRCA and credited public hardware remain website examples.

Existing project hierarchy, linked selection and side-aware 3D part focus, shareable saved views, layers, compact controls, contextual insets, BOM inspection and retained WayriCAD results remain available. Scripted model controls include virtual LEDs, displays, buttons and knobs; those scripts are demonstrations, not firmware execution or circuit simulation.

## Compatibility

`EMBED_API_VERSION` is now `'1.0'`, replacing `'1.0-beta'`. Existing documented methods and saved-state/result schema versions are retained. See [API stability and migration](API-STABILITY.md).

Balanced uses at most two million framebuffer pixels (one million on constrained devices); Photoreal Fast uses at most one million to preserve its existing memory ceiling with resolved smoothing. These bounds do not establish physical-phone performance. Source geometry, layer identity, highlight colors and gold plating on selected vias remain source-bound.

Altium and app adapters remain explicitly experimental, and live Forge/Confluence deployment is not newly certified. Missing mechanical models and unsupported geometry remain visible limitations. Retained engineering results keep their own applicability and provenance.

Free to use, including commercially, under MPL-2.0. Paid embedding, customization and support are optional. Hardware and model credits remain separate.

[Website and demos](https://wayri.github.io/kicad-webview/) · [User guide](https://wayri.github.io/kicad-webview/docs/user-guide/) · [Validation scope](QA-1.0.0.md).
