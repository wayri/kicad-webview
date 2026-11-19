# Next WebView stability update — unreleased

Publication is paused. Published 1.0.0 and its immutable CDN/site assets retain their original bytes. These additions require the next source build; no version number is promised here.

- Explicit 2D Overview preset, distinct from All; manual edits and document changes clear its selected state and Restore retains the original visibility.
- Near-transparent neutral PCB context, selected source copper above context, and physical drill cutouts last. Source/layer colors remain the default.
- Saved occurrence identity through the sheet browser, contextual insets and shareable views.
- Saved 3D expansion restored immediately before its camera and selection, with pending expansion cancelled. Default interactive expansion remains animated.
- Lower-memory prepared sources, repeated-model selection materials and cross-layer pad geometry; see [memory measurements](MEMORY-OPTIMIZATION.md).
- Compact KERO/IRCA [stability demo](../examples/stability.html) and [iframe host](../examples/stability-embed.html), including bounded load and selection measurements.

Net selection preserves the 3D camera; explicit part locating deliberately changes it. Only selected-net vias are gold during net focus; unrelated vias, structures and component models use gray translucent context. Clearing returns source appearance. Existing logarithmic copper-depth precedence and reversible smooth expansion are retained, rather than replaced by new geometry heuristics.

## Reproduce

Use the pinned existing development dependencies, then run the documented 3D build, main build, full tests and preview command. Open `stability.html`, choose KERO or IRCA, orbit/pan, expand, run Check stability, and Save / restore view. For mobile layout, open `stability-embed.html` and choose 340 px or 390 px. Exercise More → Layers/inspection and the 3D navigation controls in light and dark themes.

The measurements are samples from the current browser and cache state, not comparative speedups, physical-phone FPS or peak process memory. Reported retained resource/allocation estimates describe renderer-owned resources only. Inspect model diagnostics: KERO uses disclosed stand-ins where external models are absent; IRCA supplies an approved public review projection with its own model disclosures. Hardware/model rights are separate from the viewer's MPL-2.0 license. No three-phase/inverter board is used by this demo.

See [view links](VIEW-LINKS.md), [insets](PANELS-AND-INSETS.md), [expansion](EXPAND-MODE.md) and [mobile guidance](MOBILE-EMBEDS.md). See the [validation record](QA-STABILITY-NEXT.md) for passes, measured samples, host diagnostics and remaining physical-device limits.
