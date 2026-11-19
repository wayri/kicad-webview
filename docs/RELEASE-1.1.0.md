# KiCad WebView 1.1.0

**Published on npm and GitHub.** The npm tarball integrity and version-pinned jsDelivr/UNPKG classic and ES-module bytes match the audited release. The documented core embed API remains 1.0. Published 1.0.0 CDN/site assets keep their original bytes.

## Included

- Lower-memory prepared source trees: viewing avoids retaining comparison records and canonical strings; connectivity derives compact saved identities from the shared AST. Comparison fingerprints remain available when requested.
- Allocation-free UTF-8 byte counting for source bounds, bounded native/indexed base64 decoding for models, shared dim materials for repeated model meshes, and bounded reuse of identical local pad/via-cap geometry across layers.
- Explicit PCB Overview preset with correct All/Overview state, original visibility restoration and document-bound reset. PCB net context is faint neutral gray; selected source copper draws above context and physical drill cutouts remain open.
- Saved sheet-occurrence context through hierarchy navigation, shareable view state and insets. Changing to another occurrence closes a stale preview even when the filename is unchanged.
- Shareable 3D views retain expansion. Restoration applies it immediately before the saved camera and selection, cancelling pending motion. `setExpand(value, {animate:false})` is available for explicit immediate resets; ordinary expansion remains animated.
- Compact KERO/IRCA stability demos, mobile-width iframe host, memory counters, reproducible synthetic measurement and updated migration/integration documentation.
- Reliable legacy and occurrence-based pad identity joins, validated IRCA rounded jumper copper, and all 139 saved Marble copper contours admitted without the former aggregate point-copy omission. Direct typed zone geometry and compact short parser forms reduce retained allocations; see [pad/zone evidence](PAD-ZONE-REFINEMENT.md).

Existing net selection preserves 3D orbit/pan/zoom and expansion; deliberate part locating remains the focus/flip action. Source/layer-color highlights and selected-net-only gold vias retain their existing contract. The renderer keeps unsupported-geometry and missing-model disclosures.

## Compatibility and measurements

This is an additive 1.x update. Existing saved-state schema and methods remain supported. Hosts restoring schematic occurrences should forward the optional fourth `openFile` callback argument; see [migration](API-STABILITY.md) and [view links](VIEW-LINKS.md).

Three isolated 100,000-object synthetic prepared-source runs showed a 29.6% reduction in retained heap for that stage (about 65.4 MiB saved). This is not total browser/GPU RAM or a physical-phone guarantee. Repeated-component and 32-layer sharing tests check exact material/geometry reuse and disposal. See [memory evidence](MEMORY-OPTIMIZATION.md).

## Acceptance and distribution

The final source passed 713 tests, canonical builds, public type checks and desktop/narrow Marble and IRCA checks. Release archives must match this verified source; see [candidate validation](QA-1.1.0.md). Physical-device qualification and attribution of earlier iframe-host observer diagnostics remain acceptance items. Slack/Notion/Confluence, the installed browser extension, VS Code and Android clients are not requalified by this SDK candidate. npm latest is 1.1.0; the registry tarball and version-pinned CDN bytes have been verified.

MPL-2.0 permits free use, including commercially; paid assistance is optional. Hardware and component model rights remain separate. No three-phase/inverter example was added.


### Additional large-project work (source newer than the initial candidate archives)

Span-based quoted strings, shared 2D/3D parsing, weak camera history, lazy local PCB reads, incremental shared-model accounting and bounded model graph admission reduce peak/retained allocations. Over-budget detailed models preserve selectable saved component proxies and diagnostics. See [memory evidence and limitations](MEMORY-OPTIMIZATION.md). The initial candidate archives predate this pass and must be regenerated from the final verified source before publication.


The explicit-load [large-project lab](../examples/large-projects.html) and [340 px embed host](../examples/large-projects-embed.html) exercise pinned Marble and OLIMEX source with compact controls, one active viewer and sampled memory disclosures. [Validation and upstream credits](LARGE-PROJECT-VALIDATION.md) distinguish successful source loading from complete CAD-model fidelity and physical-device qualification.


The pad/zone follow-up fixes source identity joins, validates IRCA rounded custom pads, replaces capped zone point copies with typed geometry and compacts short AST forms. [Validation](PAD-ZONE-REFINEMENT.md) records source and responsive-browser checks, including their limits. No publication is implied.
