# Read-only drawing inspector

Open Inspect from the compact toolbar, or select geometry. The responsive panel shows saved source properties and includes bounded part search, part/pad selection, clear selection, object-layer toggles and the existing close-zoom PCB pad/net label option. Escape closes the panel.

Saved component references, values, footprints and supplied fields are indexed by source identity. Pads expose their saved number, function/name, net, size, position and layers. Tracks resolve net names from the saved PCB net table. CAM selection retains supplied aperture/tool/object attributes. No schematic connectivity is inferred from geometry. Duplicate/ambiguous UUID groups are quarantined with visible notes; index and membership limits prevent unbounded grouping.

Public helpers: getParts(), selectPart(savedId, { locate: true }), clearSelection() and setInspectorOpen(true). getParts supplies the saved IDs accepted by selectPart. 3D selection highlights a part without automatically reframing its camera. All fields are read-only; selecting an object does not modify the design.

See [browser validation](BROWSER-CHECKS.md) for coverage and host, touch and 3D limits.

Nets tab and getNets()/selectNet() now expose saved PCB assignments and bounded per-file schematic source connectivity. Pads/traces/vias/zones highlight the whole associated net with accent copper and dimmed context by default; the checkbox enables object-only highlighting. Hidden layers stay hidden. This does not infer a full KiCad netlist across repeated schematic instances.
