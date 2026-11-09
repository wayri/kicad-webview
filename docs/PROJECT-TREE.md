# Project hierarchy diagrams

ProjectTree is an independent, read-only component for the root schematic and saved subsheet instances. It does not need a mounted PCB viewer or a WebGL context. buildProjectHierarchy generates data without a DOM; hierarchyToSVG exports a portable diagram; ProjectTree adds an expandable interactive diagram. The host may connect selection to any viewer.

~~~html
<script src="./kicad-webview.min.js"></script>
<div id="tree" style="height:500px"></div>
<script>
  const tree = new KiCadWebView.ProjectTree('#tree', {
    theme: 'dark',
    onSelect: node => console.log(node.path, node.id)
  });
  tree.load('/designs/project.json');
</script>
~~~

ESM imports are available from the package root, lite entry or independent hierarchy subpath:

~~~js
import {
  ProjectTree, buildProjectHierarchy,
  loadProjectHierarchy, hierarchyToSVG
} from '@wayrisignals/kicad-webview/hierarchy';

const hierarchy = buildProjectHierarchy([
  {path:'main.kicad_sch', source:rootText},
  {path:'power.kicad_sch', source:powerText}
], {root:'main.kicad_sch'});

const tree = new ProjectTree('#tree');
tree.setHierarchy(hierarchy);
const svg = tree.toSVG();                // no scripts, external fonts or linked resources
const data = tree.getHierarchy();        // independent copy; no source-file contents
~~~

The browser hosting the component needs no Node runtime or service. Source modules can also be self-hosted directly; keep their relative src/ and engine/ imports intact. For npm, install @wayrisignals/kicad-webview@0.1.0; the independent hierarchy API is also exported from @wayrisignals/kicad-webview/hierarchy.

## Sources and root selection

loadProjectHierarchy and tree.load accept a hosted project manifest, a supported GitHub project/tree link, a direct schematic URL, local file entries/browser FileList, or ZIP bytes. tree.loadFiles and tree.loadArchive are convenience methods. URLs use the established bounded HTTP(S) resolver, CORS and credentials:'omit' default; same-origin credentials can be explicitly requested. Remote requests are limited to listed schematic URLs. Sheetfile text never authorizes an unlisted URL request. A direct schematic URL can show its child links as missing; use a manifest or complete project bundle to resolve the hierarchy.

For local inputs, provide safe relative paths so subdirectory references can resolve. Local files are read in memory without upload. ZIP contents are read through the same bounded archive reader, without filesystem extraction. Multiple schemes, arbitrary native paths, absolute links and references escaping the project root are rejected or visibly invalid.

Root precedence is explicit root, schematic project entry, a listed schematic matching the PCB entry basename, then a unique sheet without incoming links. Otherwise the result is a forest with rootPath:null and rootReason:forest. Unrelated files and disconnected cyclic components stay visible as separate roots; no arbitrary sheet is declared the root.

Saved Sheetname, Sheetfile and UUID/tstamp are retained. The same subsheet used twice appears twice under its actual parent instances, with distinct instance IDs. Source paths are matched exactly. This is a sheet hierarchy, not an inferred electrical netlist or native KiCad instance-connectivity solver.

## Data and controls

The hierarchy schema is kicad-webview.hierarchy/v1. It contains rootPath/rootReason, roots, per-file sheet counts/errors, warnings and stats. Each node has id, path, file, name, uuid, status and children. Status is ok, missing, invalid, cycle, truncated or error. Paths of unresolved references are null; unreadable listed files remain error nodes. Nodes may be marked role:unlinked for separate components.

ProjectTree supports load/loadFiles/loadArchive, setHierarchy, setFiles, getHierarchy, select, expandAll, collapseAll, setTheme, toSVG and dispose. Branch controls use native buttons and Tab/Enter/Space; labels and source paths use text nodes, not HTML. Selection emits select with {node:{id,path,file,name,uuid,status}} and invokes an optional onSelect callback only for available nodes. It does not navigate another app or viewer by itself. ready follows successful asynchronous loading; error reports load/callback errors.

~~~js
tree.addEventListener('select', event => {
  const {path} = event.detail.node;
  viewer.load('/designs/project.json', {file:path});
});
await tree.load('/designs/project.json', {root:'main.kicad_sch'});
~~~

The independent example hierarchy.html displays the owner-provided inverter, root selector, branches, schematic preview, tree-only mode, local file input and SVG download.

## Bounds and failure behavior

At most 256 input files, 8 MiB per schematic and 64 MiB total schematic text are accepted. Parsing reuses the bounded KiCad S-expression parser. Expansion is limited to 4096 instances and 32 sheet edges per branch, with explicit truncation warnings. Label and diagnostic strings are bounded. Active-path cycle detection stops recursion while allowing repeated sheets in different branches. These bounds do not establish the validity of the circuit.

SVG export includes at most 512 instances and visibly reports its limit if more exist. The interactive component retains the bounded full model. Exported source names/paths are XML escaped; no executable content, foreignObject, external image or URL is generated.

Superseded loads and disposal abort pending work and cannot replace newer data. A failed replacement keeps the current diagram. Caller aborts reject with AbortError; internally superseded/disposed operations return false. dispose removes the component, listeners and ownership, and can be called repeatedly.

## Verified beta evidence

Browser checks covered linked schematic selection, tree navigation and SVG export. Host behavior and rendering fidelity can vary.