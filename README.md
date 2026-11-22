<h1 align="center">KiCad WebView</h1>
<p align="center">Interactive electronics. Anywhere on the web.</p>
<p align="center"><a href="https://wayri.github.io/kicad-webview/">Live demos</a> · <a href="https://wayri.github.io/kicad-webview/docs/">Documentation</a> · <a href="https://wayri.github.io/kicad-webview/docs/api/">API reference</a> · <a href="https://github.com/wayri/kicad-webview/releases">Releases</a></p>
<p align="center"><a href="LICENSE"><img alt="License: MPL 2.0" src="https://img.shields.io/badge/license-MPL_2.0-42dbca"></a> <a href="https://github.com/wayri/kicad-webview/actions/workflows/ci.yml"><img alt="Viewer checks" src="https://github.com/wayri/kicad-webview/actions/workflows/ci.yml/badge.svg?branch=main"></a> <a href="https://github.com/wayri/kicad-webview/releases"><img alt="Release 1.2.0" src="https://img.shields.io/badge/version-1.2.0-42dbca"></a> <a href="https://wayri.github.io/kicad-webview/docs/"><img alt="Documentation" src="https://img.shields.io/badge/docs-online-blue"></a> <a href="https://wayri.github.io/kicad-webview/sponsor/"><img alt="Sponsor development" src="https://img.shields.io/badge/Sponsor-development-ea4aaa?logo=githubsponsors&amp;logoColor=white"></a></p>

**1.2.0** reduces large-board import memory and adds worksheet previews and a PCB outline view. See the [1.2.0 release notes](docs/RELEASE-1.2.0.md).

**1.1.0 is published on npm and GitHub.** See [release notes](docs/RELEASE-1.1.0.md), [validation](docs/QA-1.1.0.md) and [stability improvements/demo](docs/STABILITY-NEXT.md) and [large open-source project validation](docs/LARGE-PROJECT-VALIDATION.md). Version-pinned jsDelivr and UNPKG scripts/modules match the audited npm package.

Embed read-only **KiCad schematics, PCB layouts and interactive 3D boards** in websites, blogs and applications. Inspect parts, pads, nets and layers; link views; navigate complete projects; or bundle a design and viewer into one portable HTML file. Gerber and Excellon support brings fabrication files into the same viewer.

Everything needed for native KiCad viewing runs in the browser. Visitors need no KiCad installation, account, Node.js server or rendering service. Local files stay in browser memory; remote designs are fetched from the sources you choose.

**Free to use, including commercially, under MPL-2.0.** Paid help with embedding, customization, maintenance, and support is optional; you do not need to buy services to use or integrate the library.

## Version 1.1.0

This compatible 1.x update lowers large-project parser/model/geometry residency, preserves legacy and repeated-pad identity, and renders all 139 saved Marble copper contours without the former point-copy omissions. IRCA rounded jumper pads retain their mirrored and rotated shapes. Linked selection, layer colors, camera state and saved expansion remain intact.

Validation: 713 tests, builds, packed consumer types/imports and archive audits passed. Marble and IRCA passed desktop and 340px iframe checks. The documented Marble source-preparation comparison reduced additional retained heap by 38.6%; this is not a whole-browser/GPU memory ceiling or physical-phone qualification. [Pad/zone evidence](docs/PAD-ZONE-REFINEMENT.md) · [Release/download](https://github.com/wayri/kicad-webview/releases/tag/v1.1.0).

### Stable 1.0 core API

The documented core embed API is now version **1.0**. Existing viewer methods, linked selection, saved view-state formats and the `setExplode` compatibility aliases remain available. Code that checks the old `EMBED_API_VERSION === '1.0-beta'` literal should accept `'1.0'`. [API stability and upgrade notes](docs/API-STABILITY.md).

This release includes the completed shared drawing refresh: saved text variables and symbol overrides, graphics, sheet navigation and multilayer inspection. Resolved edge smoothing removes the KERO pad/track speckling caused by multisample/logarithmic-depth interference. Expanded net focus keeps only selected-net vias gold and fades unrelated vias gray/translucent. Source geometry and saved identities remain unchanged.

KERO is the default shipped demonstration; IRCA and credited public hardware remain available on the website. Altium and app adapters retain their separately documented experimental status; a stable library version does not certify every host or device.

[Release notes](docs/RELEASE-1.0.0.md) · [Validation scope](docs/QA-1.0.0.md) · [Photoreal Fast](docs/PHOTOREAL-FAST.md) · [Expand mode](docs/EXPAND-MODE.md) · [Large-project limits](docs/LARGE-PROJECTS.md).

## Start here

- [Try the public demonstrations](https://wayri.github.io/kicad-webview/).
- [Follow the quick start](https://wayri.github.io/kicad-webview/docs/quick-start/) for classic scripts, ES modules, iframes and self-hosting.
- [Read the user guide](https://wayri.github.io/kicad-webview/docs/user-guide/) or [API reference](https://wayri.github.io/kicad-webview/docs/api/).
- [Download a release](https://github.com/wayri/kicad-webview/releases), or build this checkout.

The 1.0.0 interface includes stable, resizable inspection panels; bounded contextual previews with exact-source cross-selection; and selectable saved-result palettes shared by 2D and 3D. It retains our ribbon, popup styling and visible viewer controls. Major locate, cross-highlighting, side-aware part focus and Fit actions use saved design identities. [Panels and inset API](docs/PANELS-AND-INSETS.md) · [Saved-result palettes and limits](docs/WAYRICAD-RESULTS.md). Native drawing fidelity, exploded inspection, linked hierarchy, BOM/CSV and registered WayriCAD fields remain available. [Extension sync evidence](docs/UPSTREAM-SYNC.md).

WayriCAD results: load retained PI fields, SI graphs and thermal frames alongside an exact-hash-matched PCB, inspect source-linked routes and explore supported independent 3D fields. [WayriCAD result API and limits](docs/WAYRICAD-RESULTS.md).

New inspection controls include configurable highlight styles and source colors, searchable layers with presets, PCB layer focus/fit/restore, and a 3D copper-layer selector. [Inspection controls and API](docs/INSPECTION-CONTROLS.md). [Large project bounds](docs/LARGE-PROJECTS.md).

## Install from npm or use a CDN

~~~sh
npm install @wayrisignals/kicad-webview@1.2.0
~~~

~~~js
import { Viewer } from '@wayrisignals/kicad-webview';
const viewer = new Viewer('#board', { theme:'dark', inspectOnSelect:false });
await viewer.load('/designs/project.zip', { view:'3d' });
~~~

For direct browser use, pin the version and load the classic script. No npm installation, Node.js server or build step is needed:

~~~html
<div id="board" style="height:70dvh;min-height:360px"></div>
<script src="https://cdn.jsdelivr.net/npm/@wayrisignals/kicad-webview@1.2.0/dist/kicad-webview.min.js"></script>
<script>
  const viewer = new KiCadWebView.Viewer('#board', { theme:'dark' });
  viewer.load('/designs/project.zip', { view:'3d' }).catch(console.error);
  window.addEventListener('pagehide', () => viewer.dispose(), { once:true });
</script>
~~~

The self-contained ES module for 1.2.0 is available at [jsDelivr](https://cdn.jsdelivr.net/npm/@wayrisignals/kicad-webview@1.2.0/dist/kivi-viewer.js) or [UNPKG](https://unpkg.com/@wayrisignals/kicad-webview@1.2.0/dist/kivi-viewer.js). The classic script is available from either CDN at the matching path. Self-host the package contents for offline use and keep its license and notices. The npm artifact contains the viewer, matching covered source, types, documentation and source-parameterized iframe entry; legacy board fixtures and fixture-backed example pages are excluded. Current [KERO, IRCA and credited public-board demonstrations](https://wayri.github.io/kicad-webview/) remain on the website.

The [linked hierarchy demo](https://wayri.github.io/assets/demos/hierarchy.html) combines this library’s selection and 3D focus APIs with a source-bound website sheet adapter. See the [integration guide](https://wayri.github.io/kicad-webview/docs/examples/#link-the-hierarchy-pcb-and-3d-assembly) for that host integration.

## A viewer in a few lines

After building, serve the generated dist/ folder with your static website:

~~~html
<div id="board" style="width:100%;height:70dvh;min-height:360px"></div>
<script src="./dist/kicad-webview.min.js"></script>
<script>
  const viewer = new KiCadWebView.Viewer('#board', {
    theme: 'dark',
    inspectOnSelect: false
  });
  viewer.load('./designs/project.zip', { view: '3d' })
    .catch(error => console.error(error));
  window.addEventListener('pagehide', () => viewer.dispose(), { once: true });
</script>
~~~

The same distribution includes an ES module (kivi-viewer.js), a custom element, an iframe entry and a browser-only exporter. Give each viewer a usable height. Preserve legal notices and the matching-source link when distributing builds. [Hosting guide](docs/HOSTING.md) · [Public API](docs/PUBLIC-API.md)

## Translucent inspection and progressive loading

Choose **Display → Appearance → Translucent**, or call viewer.setAppearance('translucent') after opening 3D. The board and component models become translucent; copper uses saved layer colors and filled zones stay faint. Internal copper is built only when requested. Missing stackup elevations are labelled illustrative. Selection, layer visibility and normal rendering remain available. See [3D appearance and performance](docs/PRESENTATION.md).

## Capabilities

| Workflow | What you can do |
| --- | --- |
| Schematic and PCB inspection | Pan, zoom, choose layers, search components, inspect saved properties and highlight actual copper nets |
| 3D inspection | Orbit, pan, use on-screen camera controls, focus selected parts on their mounting side and highlight nets with dimmed surroundings |
| Project navigation | Browse listed files and saved child-sheet links in independent split or single panes, without comments or CAD editing |
| Linked embeds and view links | Cross-select exact saved identities and restore source-bound cameras, layers and selections |
| Presentation | Build live project/board carousels and opt into enhanced 3D presentation rendering. The next source build adds a [fast photoreal studio preset](docs/PHOTOREAL-FAST.md) |
| Scripted controls | Add virtual LEDs, OLED/LCD/matrix/TFT displays, buttons, knobs and focus-scoped keys |
| Fabrication files | Inspect the supported Gerber/Excellon subset, overlay layers and measure distances |
| Analysis results | Display supplied scalar fields with units, assumptions, provenance and exact source-hash binding |
| Hierarchy diagrams | Independently generate a root/subsheet tree and export script-free SVG |
| Portable sharing | Load bounded ZIP bundles and export a self-contained interactive HTML document |

See [examples](examples/), [format limits](docs/KICAD-COMPATIBILITY.md), [advanced workspace](docs/ADVANCED-VIEWER.md), [interactive demos](docs/INTERACTIVE-DEMO.md) and [integration guides](integrations/README.md). Slack and Notion can use self-contained HTML where their clients support it; Confluence's Forge adapter requires separate setup. The optional Altium adapter uses an external provider, not native offline Altium parsing.

## Load a project

Load a supported drawing URL, a project ZIP, a manifest, supported public GitHub links, or local browser files. Cross-origin sources need CORS; the library cannot bypass permissions or authentication. A manifest explicitly lists drawings and optional linked models:

~~~json
{
  "entry": "board.kicad_pcb",
  "files": [
    { "path": "board.kicad_pcb", "url": "./board.kicad_pcb" },
    { "path": "board.kicad_sch", "url": "./board.kicad_sch" },
    { "path": "models/connector.wrl", "url": "./models/connector.wrl" }
  ]
}
~~~

Saved model paths must resolve to supplied assets. Missing models remain labelled stand-ins; portable STEP decoding is not included. Private design URLs should not be put into public embeds or share links.

## Build and verify

Development requires Node.js 22+ and the pinned npm dependencies. Deployed visitors do not need Node.js.

~~~sh
npm ci
npm run build:3d
npm run build
npm test
npm run preview
~~~

KICAD_WEB_BUILD_DEPS can reuse a compatible existing dependency directory. Full and classic builds contain no external JavaScript imports. The lite module defers 3D and analysis; deploy its complete relative chunk directory. To generate a versioned static SDK ZIP from committed sources, run npm run package:static.

Source lives in src/ and engine/; dist/ is generated. [Contributing](CONTRIBUTING.md) · [Security reports](SECURITY.md)

## Scope and fidelity

This is a read-only interpretation of saved design data. It does not edit CAD files, run firmware, execute native ERC/DRC or engineering solvers, or certify manufacturing readiness. Imported analysis is supplied evidence, not a solver run. Unsupported constructs and approximate models have visible diagnostics. Saved UUID relationships do not establish a complete hierarchical electrical netlist. [Compatibility and limitations](docs/KICAD-COMPATIBILITY.md)

## Sponsor development

[Support KiCad WebView](https://wayri.github.io/kicad-webview/sponsor/) to help fund compatibility, mobile performance, rendering fidelity and documentation. Sponsorship is voluntary; the library remains free to use commercially under MPL-2.0. [Funding policy and recognition](SPONSORING.md).

## License and support

**[MPL 2.0](LICENSE)** permits commercial use and proprietary host applications. Distributed changes to covered files must remain available as source under MPL; keep notices and provide matching source for minified builds. [Licensing details](LICENSING.md) · [Third-party notices](THIRD-PARTY-NOTICES.md) · [Project name policy](TRADEMARKS.md)

The software license does not grant rights to users' designs or automatically license the hardware examples. Their provenance remains separate. The project is independent of KiCad, Altium and the host platforms.

KiCad WebView is **free to use, including commercially, under MPL-2.0**. No payment or individual commercial-use approval is required.

Need help embedding or customizing KiCad WebView? Optional paid implementation, maintenance, and support are available at [support.kivi@sigharmonic.com](mailto:support.kivi@sigharmonic.com). You do not need to buy these services to use or integrate the library.

Mobile integration: [loading, rendering and performance guidance](docs/MOBILE-PERFORMANCE.md).
