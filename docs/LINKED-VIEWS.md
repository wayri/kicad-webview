# Linked viewer instances

Use linkViewers with 2–8 explicitly supplied KiCadViewer instances to cross-select drawings embedded anywhere on one page. It owns event listeners only; each viewer keeps its controls and lifecycle. Selecting a part or its terminal frames it in a linked 3D viewer, facing the saved front/back mounting side and centering its rendered bounds. No viewer loads or navigates automatically.

~~~js
import { Viewer, linkViewers } from '@wayrisignals/kicad-webview';
const layout = new Viewer('#layout', {theme:'dark'});
const assembly = new Viewer('#assembly', {theme:'dark'});
const schematic = new Viewer('#schematic', {theme:'dark'});
await Promise.all([
  layout.load('/designs/project.json', {file:'board.kicad_pcb', view:'pcb'}),
  assembly.load('/designs/project.json', {file:'board.kicad_pcb', view:'3d'}),
  schematic.load('/designs/project.json', {file:'driver.kicad_sch'})
]);
const links = linkViewers([layout, assembly, schematic]);
// links.setEnabled(false); links.setEnabled(true);
// links.dispose(); then dispose your viewers when leaving the page.
~~~

The same API is available as KiCadWebView.linkViewers from the self-hosted classic script, and from the lite entry. It does not need a framework, Node runtime, server session or additional dependency.

Matching rules:

- PCB and schematic components link only through the saved symbol UUID relationship. Duplicate identities or references alone do not establish a match.
- Layout/3D views of the same drawing require the same file path, kind and exact saved source text. Pads, tracks, arcs, vias and zones first select the exact saved UUID in the target; pins use their saved symbol owner UUID and terminal number. If exact object lookup is unavailable or fails, the saved component or unambiguous net can provide the documented fallback. Explicit named-net selection cross-selects that saved net.
- Equal net names in different sheets or boards are never treated as connectivity. Local/global hierarchy and bus netlist reconstruction are outside this helper.
- Across different PCB/schematic drawings, pad/pin selection cross-probes the saved owning component. It does not claim an exact schematic pin/pad mapping or invent a terminal number.
- Clear selection propagates to other loaded group members. Orbit/pan are not synchronized between viewers; part selection deliberately reframes the 3D peer. Clearing a selection leaves the camera alone, and linking does not open an unloaded sheet or navigate a viewer.

linkViewers returns an EventTarget with enabled, setEnabled(boolean) and dispose(). Enabled defaults to true. link emits {source, target, kind}, where kind is object, part, net or clear, after a successful synchronous target update. linkerror emits {source, target, error} if an active target unexpectedly rejects an update; other group members still receive the selection. Feedback is suppressed during forwarding. Unloaded, disposed and stale-path/view events are ignored.

Create one group for a given set of viewers. The membership array is copied. Dispose removes its listeners and disables forwarding without disposing any viewer. Calling dispose repeatedly is safe; setEnabled after disposal throws. The caller remains responsible for each viewer's source permissions and cleanup. This helper stores no files, credentials, comments or URLs.

Part search results and direct 3D component clicks use the same focus behavior. The 3D renderer uses loaded model bounds, or the labelled footprint proxy when no model is available, with a minimum 8 mm context window. It frames the part at 55% of the limiting viewport dimension, including narrow embeds. Unknown/ambiguous saved identities, missing/unpopulated geometry or unknown board sides do not move the camera. Net-only selections retain the current camera and highlight. Programmatic selectPart(id, {locate:false}) and selectObject(id, {locate:false}) suppress reframing. This is camera navigation, not an optical depth-of-field effect.

Uploaded Slack/Notion HTML snapshots must be regenerated to receive library changes.