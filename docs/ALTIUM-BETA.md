# Altium online embed adapter · beta

```html
<div id="board" style="height:550px"></div>
<script type="module">
  import { AltiumViewer } from '../src/altium-viewer.mjs';

  const viewer = new AltiumViewer('#board');
  viewer.load('https://your-site.com/altium-project.zip');
</script>
```

This is an adapter around Altium's online viewer, distinct from Pocket KiView's
local KiCad renderer. Use it to try interactive Altium designs on a blog or
website. The input must be a **public HTTPS ZIP, RAR or 7z project archive** on
a public hostname. Raw `.SchDoc` / `.PcbDoc`, local File objects, credentials,
IP literals, localhost URLs and offline operation are unavailable in this API.
Archive layout and supported native versions are determined by Altium's service.

Calling `load` shares the project URL with Altium's service so it can retrieve
and process the design. Use only a design authorized for that processing and
public sharing. Importing or constructing this adapter makes no provider request;
the included [example](../examples/altium-example.html) starts processing only after the
reader enters a URL and clicks **Open with Altium 365**.

## Views and lifecycle

```js
const viewer = new AltiumViewer('#board', {
  views: ['schematic', 'pcb', '3d', 'bom'],
  view: 'pcb',
});
viewer.load('https://your-site.com/altium-project.zip');
viewer.setView('3d');
viewer.dispose();
```

The enabled views control which provider tabs are offered. Initial view accepts
`schematic`, `pcb` or `3d`; `bom` is an optional tab rather than an initial view.
Actual contents depend on the supplied project and service processing.
`setView` remounts with a different initial view and loses the previous camera
and selection. Users can switch tabs inside the provider without this remount.
The underlying documented provider attributes are `data-project-src`,
`data-enabled-views` and `data-active-view` (`schematic` maps to `sch`).

The adapter deliberately exposes no simulated selection, layers, fit, theme or
cross-probing JavaScript API. Those interactions stay inside the provider UI;
they cannot currently be synchronized with a local KiCad instance. `load`
returns the adapter immediately after mounting; it does not await processing.

Events:

| Event | What it confirms |
| --- | --- |
| `mount` | The iframe was created with the requested options |
| `providerload` | Altium's bootstrap script loaded; **not** design readiness |
| `error` | The bootstrap script reported a load failure |

The provider displays design processing, expiry, access and format errors inside
its own viewer. The adapter cannot observe or guarantee those states and emits
no `ready` event. Catch synchronous argument errors around `load` / `setView`.
Dispose on unmount. Multiple provider instances use independent containers; the
same container cannot simultaneously belong to an Altium and KiCad viewer.

## Blog iframe

The existing iframe entry point accepts an explicit Altium provider:

```html
<iframe title="Interactive Altium board"
  src="https://YOUR-HOST/embed.html?provider=altium&amp;src=https%3A%2F%2Fyour-site.com%2Faltium-project.zip&amp;view=3d"
  style="width:100%;height:550px;border:0" loading="lazy"></iframe>
```

Replace both hostnames with actual deployment/project locations. The default
provider stays `kicad`; choosing `provider=altium` explicitly opts that embed into
online processing. There is no public Pocket KiView hosting endpoint yet.

## Isolation, hosting and beta limits

The official embed script runs in an iframe with an opaque sandbox origin, not
in the host website's JavaScript context. The sandbox permits scripts and
downloads; it does not grant same-origin access, popups, forms or top navigation.
This isolation can restrict provider features that require cookies/storage or
additional permissions. It must be checked against actual provider deployments;
do not weaken the sandbox merely to hide an integration failure.

The wrapper uses `srcdoc` and inline styles/script handlers plus Altium's remote
bootstrap script. A restrictive host CSP can block these or the provider's
nested frames/resources. Deployers need a reviewed CSP compatible with their
chosen hosting setup. No remote script or model is downloaded into this source
tree. Generated-output requests default to `none`; any available source download
remains controlled by Altium and the source's public hosting.

Verification: adapter tests cover options, URL/HTML boundaries, iframe isolation,
message-source checks, remounts, disposal, and cross-provider ownership. They use
a fake DOM and do not contact Altium. **Live design loading, graphical fidelity,
in-view cross-probing, browser compatibility and service/sandbox compatibility
are not verified.** No user project has been uploaded or submitted. A publicly
shareable Altium archive and a working browser preview environment are needed
for those acceptance checks before describing this as production support.

## References and licensing

Integration contract checked 2026-11-04 against Altium's official documentation:

- [Standalone Viewer: embedding and customization](https://www.altium.com/documentation/altium-365/viewers/standalone-viewer?version=7.2)
- [Developer Center: Embeddable Viewer](https://www.altium.com/documentation/altium-developer-center/altium-365/embeddable-viewer?version=7.0)

Altium's service, privacy policy and viewer terms apply separately. The adapter
remains under this repository's [license](../LICENSE); it does
not bundle or relicense Altium's software. Pocket KiView is independent of Altium.
