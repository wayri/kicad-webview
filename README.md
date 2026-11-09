<h1 align="center">KiCad WebView</h1>
<p align="center">Interactive electronics. Anywhere on the web.</p>
<p align="center"><a href="https://wayri.github.io/kicad-webview/">Live demos</a> · <a href="https://wayri.github.io/kicad-webview/docs/">Documentation</a> · <a href="https://wayri.github.io/kicad-webview/docs/api/">API reference</a> · <a href="https://github.com/wayri/kicad-webview/releases">Releases</a></p>
<p align="center"><a href="LICENSE"><img alt="License: MPL 2.0" src="https://img.shields.io/badge/license-MPL_2.0-42dbca"></a> <a href="https://github.com/wayri/kicad-webview/actions/workflows/ci.yml"><img alt="Viewer checks" src="https://github.com/wayri/kicad-webview/actions/workflows/ci.yml/badge.svg?branch=main"></a> <a href="https://github.com/wayri/kicad-webview/releases"><img alt="Release 0.1.1" src="https://img.shields.io/badge/version-0.1.1-42dbca"></a> <a href="https://wayri.github.io/kicad-webview/docs/"><img alt="Documentation" src="https://img.shields.io/badge/docs-online-blue"></a></p>

Embed read-only **KiCad schematics, PCB layouts and interactive 3D boards** in websites, blogs and applications. Inspect parts, pads, nets and layers; link views; navigate complete projects; or bundle a design and viewer into one portable HTML file. Gerber and Excellon support brings fabrication files into the same viewer.

Everything needed for native KiCad viewing runs in the browser. Visitors need no KiCad installation, account, Node.js server or rendering service. Local files stay in browser memory; remote designs are fetched from the sources you choose.

**Free to use, including commercially, under MPL-2.0.** Paid help with embedding, customization, maintenance, and support is optional; you do not need to buy services to use or integrate the library.

## Start here

- [Try the public demonstrations](https://wayri.github.io/kicad-webview/).
- [Follow the quick start](https://wayri.github.io/kicad-webview/docs/quick-start/) for classic scripts, ES modules, iframes and self-hosting.
- [Read the user guide](https://wayri.github.io/kicad-webview/docs/user-guide/) or [API reference](https://wayri.github.io/kicad-webview/docs/api/).
- [Download a release](https://github.com/wayri/kicad-webview/releases), or build this checkout.

The current release is **0.1.1**, licensed under MPL-2.0. Install the latest release or pin a version. The website’s immutable beta.2 SDK remains available, while its separately maintained demonstrations may use additional host adapters. Archived beta.1 downloads retain their earlier license.

## Install from npm or use a CDN

~~~sh
npm install @wayrisignals/kicad-webview@0.1.1
~~~

~~~js
import { Viewer } from '@wayrisignals/kicad-webview';
const viewer = new Viewer('#board', { theme:'dark', inspectOnSelect:false });
await viewer.load('/designs/project.zip', { view:'3d' });
~~~

For direct browser use, pin the version and load the classic script. No npm installation, Node.js server or build step is needed:

~~~html
<div id="board" style="height:70dvh;min-height:360px"></div>
<script src="https://cdn.jsdelivr.net/npm/@wayrisignals/kicad-webview@0.1.1/dist/kicad-webview.min.js"></script>
<script>
  const viewer = new KiCadWebView.Viewer('#board', { theme:'dark' });
  viewer.load('/designs/project.zip', { view:'3d' }).catch(console.error);
  window.addEventListener('pagehide', () => viewer.dispose(), { once:true });
</script>
~~~

The self-contained ES module is available at [jsDelivr](https://cdn.jsdelivr.net/npm/@wayrisignals/kicad-webview@0.1.1/dist/kivi-viewer.js) or [UNPKG](https://unpkg.com/@wayrisignals/kicad-webview@0.1.1/dist/kivi-viewer.js). The classic script is available from either CDN at the matching path. Self-host the package contents for offline use and keep its license and notices. The npm artifact contains the viewer, matching covered source, types, documentation and source-parameterized iframe entry; legacy board fixtures and fixture-backed example pages are excluded. Current [IRCA and credited public-board demonstrations](https://wayri.github.io/kicad-webview/) remain on the website.

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
| Presentation | Build live project/board carousels and opt into enhanced 3D presentation rendering |
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

## License and support

**[MPL 2.0](LICENSE)** permits commercial use and proprietary host applications. Distributed changes to covered files must remain available as source under MPL; keep notices and provide matching source for minified builds. [Licensing details](LICENSING.md) · [Third-party notices](THIRD-PARTY-NOTICES.md) · [Project name policy](TRADEMARKS.md)

The software license does not grant rights to users' designs or automatically license the hardware examples. Their provenance remains separate. The project is independent of KiCad, Altium and the host platforms.

KiCad WebView is **free to use, including commercially, under MPL-2.0**. No payment or individual commercial-use approval is required.

Need help embedding or customizing KiCad WebView? Optional paid implementation, maintenance, and support are available at [support.kivi@sigharmonic.com](mailto:support.kivi@sigharmonic.com). You do not need to buy these services to use or integrate the library.
