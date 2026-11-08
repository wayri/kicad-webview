# Static websites, GitHub Pages and project links

Build once using the existing project esbuild installation:

```sh
npm run build
```

Publish the contents of `dist/` using your site's existing deployment
workflow. It includes one `kivi-viewer.js` module containing the 2D/3D engines,
pure iframe viewer, starter page, synthetic demo project and license notices.
The build verifies there are no external JavaScript imports. No parent repository directory, KiCad installation or rendering service is needed.
The build does not publish anything or change your GitHub Pages settings.

```html
<div id="board" style="height:500px"></div>
<script type="module">
  import { KiCadViewer } from './kivi-viewer.js';
  const viewer = new KiCadViewer('#board');
  await viewer.load('./project.json');
</script>
```

On a GitHub Pages project site, relative paths respect its `/repository/` base.
Serve JavaScript with the correct MIME type and give the container a height.
The widget supplies drawing selection, Layout / 3D, Fit, Layers and theme controls;
it has no editing or account UI. `index.html` is a starter, `example.html` opens
hosted/local files, and `embed.html` contains only the viewer. The distribution
also includes `.nojekyll` for static hosting. Keep the license notices.

## Domain-server files and projects

```js
await viewer.load('./boards/controller.kicad_pcb');
await viewer.load('https://your-domain.com/designs/controller.kicad_sch');
await viewer.load('./controller/project.json');
```

Use a manifest to list a whole project's drawings and optional model files:

```json
{
  "entry": "controller.kicad_pcb",
  "files": [
    {"path": "controller.kicad_pcb", "url": "./controller.kicad_pcb"},
    {"path": "controller.kicad_sch", "url": "./controller.kicad_sch"},
    {"path": "power.kicad_sch", "url": "./power.kicad_sch"},
    {"path": "models/connector.wrl", "url": "./models/connector.wrl"}
  ]
}
```

URLs resolve relative to the manifest, including when deployed under a directory.
Paths are unique project-relative filenames. Saved PCB model references must
resolve to listed paths. Only listed WRL / supported self-contained GLB models
are fetched automatically; missing models retain labelled stand-ins. Global
KiCad libraries are never guessed or fetched. Portable STEP decoding is not
included.

```js
await viewer.loadProject('./project.json'); // Alias for load
console.log(viewer.getFiles());
await viewer.openFile('power.kicad_sch');
await viewer.openFile('controller.kicad_pcb');
await viewer.setView('3d');
```

You can pass the manifest object directly; relative URLs then use the embedding
page or `{baseURL: 'https://your-site.com/projects/controller/'}`. An explicit
`{file: 'power.kicad_sch'}` overrides the manifest entry. Otherwise the first PCB
by path is selected, then the first schematic. A hosted `.kicad_pro` alone cannot
list siblings on an ordinary static server; use a manifest.

## GitHub and other public links

```js
await viewer.load('https://github.com/OWNER/REPOSITORY');
await viewer.load('https://github.com/OWNER/REPOSITORY/tree/main/hardware');
await viewer.load('https://github.com/OWNER/REPOSITORY/blob/main/hardware/board.kicad_pro');
await viewer.load('https://github.com/OWNER/REPOSITORY/blob/main/hardware/board.kicad_pcb');
```

Repository, directory and project-document links discover supported drawings
and models. Drawing `blob` links open that file alone. Discovery resolves the
requested/default branch to a commit SHA and pins every raw file URL to it.
The `ready` event contains that project's `revision`; file switching preserves
the revision. Use `{file: 'hardware/power.kicad_sch'}` to choose a drawing.
Branches with slashes require an explicit `{ref: 'feature/board'}` matching the
URL. A truncated GitHub tree is rejected; use a smaller hosted manifest.

GitLab.com drawing links with `/-/blob/` are normalized to `/-/raw/`. Other
providers work through raw HTTP(S) files or JSON manifests. Generic repository
HTML pages outside GitHub, private repositories, GitHub Enterprise discovery
and ZIP project imports are not automatic sources in this version.

External servers must permit browser CORS access. The library cannot bypass
authentication, CORS, download restrictions or GitHub API rate limits. Files
protected by your own website session may use `{credentials: 'same-origin'}`;
the default is `omit`. Cross-origin credentials and embedded URL passwords are
not accepted. For another auth scheme, fetch in the host and call `loadSource`.

## Blog embeds

```html
<iframe title="Interactive KiCad project"
  src="https://YOUR-HOST/viewer/embed.html?src=https%3A%2F%2Fgithub.com%2FOWNER%2FREPOSITORY&amp;view=pcb"
  style="width:100%;height:550px;border:0" loading="lazy"></iframe>
```

Replace the hostname and repository. `src` is URL encoded and can be a drawing,
manifest or supported repository link. Relative URLs resolve against `embed.html`,
not the outer blog. Optional parameters are `view`, `theme`, `file`, and `ref`.
Host the files yourself or explore the [public demos](https://wayri.github.io/kicad-webview/).
The `<kicad-viewer>` element accepts the same source/view/file/ref attributes at
connection time. The optional Altium provider remains a separate online beta.

## Bounds and acceptance

Drawings are limited to 64 MiB; metadata to 8 MiB; models to 8 MiB each; projects
to 256 supported files. Parser/renderer limits also apply. Individual sheets are
navigable; automatic combined hierarchy composition and cross-probing between
drawings are not implemented in this embed API. See the [main guide](../README.md).

Automated checks cover source resolution, revision pinning, bounds, navigation,
controls, cancellation and lifecycle; the builder verifies a self-contained
module. Mocked transports do not prove live provider behavior or pixel fidelity.

GitHub discovery follows the documented [Git trees API](https://docs.github.com/en/rest/git/trees).
The [MPL-2.0 license](../LICENSE) and supplied third-party notices apply.
