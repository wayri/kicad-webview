# Drawing and board presentations

ViewerCarousel adds small read-only presentation controls around an existing KiCadViewer. The caller owns the viewer and its viewport; mount the controls in a separate container. This uses the same parser, source loader and renderer as the ordinary viewer, without a second renderer or dependency. No slide loads or plays automatically.

~~~js
import { KiCadViewer, ViewerCarousel } from '@wayrisignals/kicad-webview';

const viewer = new KiCadViewer(document.querySelector('#drawing'));
await viewer.loadFiles(projectFiles, { file: 'board.kicad_pcb' });
const presentation = new ViewerCarousel(document.querySelector('#slides'), {
  viewer,
  interval: 6000,
  slides: [
    { label: 'Board layout', view: 'pcb', clearSelection: true },
    { label: 'Assembly overview', view: '3d', camera3D: 'isometric' },
    { label: 'Top assembly', view: '3d', camera3D: 'top' },
    { label: 'Bottom assembly', view: '3d', camera3D: 'bottom' },
    { label: 'Power schematic', source: schematicText,
      options: { path: 'power.kicad_sch' }, view: 'schematic' }
  ]
});
await presentation.show(0);
// Cleanup in this order when leaving the page:
// presentation.dispose(); viewer.dispose();
~~~

Each of 1–100 slides has a nonempty plain-text label (maximum 500 characters), and optional fields:

| Field | Behavior |
| --- | --- |
| input | Passed to viewer.load(), accepting the same hosted drawing/project inputs. |
| source | Saved drawing text passed to viewer.loadSource(); mutually exclusive with input. |
| options | Load options such as file, path or credentials. The carousel owns the cancellation signal. |
| view | pcb, schematic, 3d or manufacturing, subject to the loaded drawing's support. |
| camera | A copied 2D camera from viewer.getCamera(); applied with setCamera() after loading/view selection. |
| camera3D | top, bottom, front, back, left, right or isometric; applied with setCamera3D(). Requires a 3D view; cannot combine with camera. |
| clearSelection | Clear current selection before optional net highlighting. |
| net | Exact saved net name passed to selectNet(); a missing net fails the slide. |

Omit input/source to reuse the loaded design for a sequence of views or camera presets. Load a local project first with viewer.loadFiles() or viewer.loadArchive(); source slides can also use text from reviewed local files. Input slides retain the normal viewer's network, credentials, format and source-size constraints. The presentation does not fetch models or upload designs on its own. A 3D preset changes the board camera; availability of component models follows the viewer's normal support.

Use await show(index), next() or previous() for zero-based navigation. The current successful index starts at -1. Navigation clamps at the first/last slide; timed playback loops. show() returns true on success, false when cancelled/superseded or when the viewer declines the transition, and rejects on current-slide errors. slidechange emits { index, label }; error emits { index, error }. A failed slide pauses playback and retains the last successful index. Loading may change the viewport before a subsequent step fails; transitions are not transactional.

play() explicitly enables timed playback (default interval 5000 ms; allowed range 1000–3600000 ms). It returns false for fewer than two slides, a hidden document or reduced-motion preference. pause() stops the timer. Native buttons provide keyboard activation, named controls and a polite live slide label. Focusing the controls, hiding the document, or enabling reduced motion pauses playback; manual navigation remains available. There are no animated slide transitions, and playback never resumes without an explicit play action.

Transitions serialize operations against the supplied viewer. New requests abort a pending source load and skip queued stale requests; stale completions cannot apply later camera/selection steps or announce a successful slide. Operations already running inside the viewer may finish before the newest slide begins. Avoid concurrent direct loads/view changes on the same viewer while presenting. Dispose cancels pending loads, queued work and timers, detaches listeners and removes only the carousel controls. It does not dispose the supplied viewer.

For a direct browser integration, host the distribution beside your page; no Node runtime or build step is required on the website:

~~~html
<div id="board" style="height:480px"></div><div id="tour"></div>
<script src="/assets/kicad-webview.min.js"></script>
<script>
const viewer = new KiCadWebView.Viewer('#board', {theme:'dark'});
viewer.load('/designs/project.json', {view:'3d'}).then(() => {
  const tour = new KiCadWebView.ViewerCarousel('#tour', {viewer, slides:[
    {label:'Assembly', view:'3d', camera3D:'isometric', clearSelection:true},
    {label:'Top', view:'3d', camera3D:'top'},
    {label:'Bottom', view:'3d', camera3D:'bottom'}
  ]});
  return tour.show(0);
}).catch(console.error);
</script>
~~~

Use an exact saved net name in a slide (for example net:'GND' if present) to accent its copper and grey unrelated surroundings. Hidden/back-side/internal copper follows the normal physical 3D visibility and is not projected through the board. The included carousel.html demonstrates both a project story and a board tour using the owner's real inverter design. The npm beta remains pending publication; self-hosted assets can be used now.
