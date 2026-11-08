# Shareable native KiCad views

View links restore one to eight native schematic, layout or 3D viewers after the host has loaded the project. Each view carries its project-relative path, exact source SHA-256, view mode, copied camera, optional PCB layer visibility, and saved selection identity. The description may also retain theme and host layout/active-pane/link settings. Drawing source, models and credentials are never included.

~~~js
import {
  linkViewers, captureViewState, restoreViewState,
  createViewLink, parseViewLink
} from '@wayrisignals/kicad-webview';

// Load the same hosted project into these existing viewers first.
const viewers = [schematicViewer, pcbViewer, assemblyViewer];
const linked = linkViewers(viewers);
const saved = await captureViewState(viewers, { theme: 'dark' });
const url = createViewLink('https://example.com/board-viewer?project=inverter', saved);

// On that page, after its normal project loading:
const state = parseViewLink(location.href);
if (state) {
  const wasEnabled = linked.enabled;
  linked.setEnabled(false);
  try {
    await restoreViewState(viewers, state);
  } finally {
    linked.setEnabled(wasEnabled);
  }
}
~~~

Selection replay should run with cross-selection propagation suspended, so restoring one pane does not overwrite another pane's saved selection. The advanced workspace wrapper handles its own link guard. Camera positions remain independent.

captureViewState(viewers, options) snapshots the current state, computes exact SHA-256 using browser Web Crypto, and rejects if a drawing changes before hashing finishes. HTTPS and localhost provide Web Crypto. State describes the current native KiCad source revision; it is not a moving pointer to future file contents.

restoreViewState(viewers, state, { signal, openFile, current }) validates the entire bounded schema, then optionally asks the host to open a different listed path with openFile(index, path, signal). It never derives a network URL from the fragment. The host must confine this callback to its already loaded project list. Without a callback, load the correct drawings before restoring. Every pane's exact source hash, drawing kind and requested layers are checked before any saved camera or selection is applied. A mismatched source, missing layer or absent/ambiguous selection rejects rather than falling back to a matching reference/name.

The optional AbortSignal is forwarded to file loading and view changes. A pre-aborted restore rejects with AbortError. Cancellation is checked between asynchronous work and individual state mutations; current() returning false or disposed viewers stop replay and return false. Custom host loaders must honor the supplied signal. A false return from a loader/view switch also stops restoration. These operations are not transactional: opening files, changing a view, or replaying an earlier pane may already have succeeded before a later operation fails. Hash mismatch never applies saved cameras/selections.

2D state uses saved-world camera centre, pixels-per-mm zoom and flipped side. 3D state uses board-centred millimetre position/target/up vectors, copied through the viewer's canonical camera validator. PCB layers are exact saved layer names. A net uses its saved ID/name; other selections use saved UUID/owner UUID and optional pin number. Invalid and unknown fields are rejected, including path traversal, encoded path escapes, credentials in URL authority, nonfinite cameras and oversized state. The schema is kicad-webview.views/v1, with at most eight views and a 16 KiB encoded fragment limit.

createViewLink(baseURL, state) accepts HTTP(S) URLs without authority credentials. It preserves the host path/query and replaces the fragment with #kicad-view= followed by encoded JSON. parseViewLink(url) returns null for an ordinary fragment, otherwise validates and copies the state. Neither function modifies browser history, loads a project, posts a message or makes a network request. Hosts control when to expose/copy a generated link and which viewer group consumes it. Existing fragment-based routers should provide a dedicated viewer route or transport the validated state through their own routing.

CAM/Gerber/Excellon source fingerprints and Altium provider states are not supported by this native-view link schema. Their ordinary interactive viewers remain available.
