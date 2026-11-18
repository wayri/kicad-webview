# 1.0.0 release validation

Release preparation uses the existing pinned esbuild 0.25.12 and Three.js 0.171.0 dependencies. The required local gate rebuilds the owned 3D bundle, classic/ESM/lite/export distributions and runs the complete Node test suite. Tests cover drawing/source identity, loading/cancellation, archive boundaries, linked selection, layers, expansion, via-context restoration, depth policies, result association and resource disposal.

Distribution checks inspect the actual npm tarball and static ZIP: correct version and core API marker, legal notices, matching covered source, required entry points and declarations, exported-value parity, absence of external imports in the full classic/ESM bundles, and hashes for every static asset. Caches, Git metadata, private records, credentials, legacy board fixtures and unrelated build output must not be packaged.

Browser checks must use the exact candidate bytes against pinned KERO data: project/schematic/PCB/3D loading, net selection and layer colors, gold selected vias with gray/translucent expanded context, reversible clear/collapse, linked views, compact menus and narrow layout. Earlier checks on a source preview do not establish acceptance for a newly built package. Static hosting and browser-only use are checked separately from npm publication and CDN propagation.

Record exact source, totals, hashes, checks and omissions in the retained release receipt. A prepared package is not a published npm release. Advertise npm/CDN links only after registry publication and byte verification; preserve existing immutable release assets.

## Coverage limits

Physical-phone speed, every GPU/driver, all model formats and maximum-budget 32-layer 3D performance are not qualified. Host-specific Slack, Notion or Confluence acceptance is not refreshed by an ordinary browser check; the Forge adapter has not completed live installation acceptance. Numerical overlays do not validate a producer's solver or applicability claims. Source text/font metrics and missing model geometry retain their documented approximations.

Declaration syntax/export checks and a strict TypeScript consumer compilation are separate checks; record compiler availability and do not describe syntax checks alone as semantic type checking.
