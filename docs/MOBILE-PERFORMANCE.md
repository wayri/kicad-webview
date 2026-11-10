# Mobile website performance

Version 0.2.1 includes the following mobile website integration optimizations.

The viewer reuses a source-scoped parse for named `.kicad_pcb` and `.kicad_sch` files across geometry, connectivity and 3D view switches. Each viewer owns its snapshot; replacing or disposing the viewer releases it. Sources without a filename retain their inferred-path behavior.

3D rendering is demand-driven. Off-screen embeds, hidden documents, zero-size containers and interrupted graphics contexts suspend pending frames. Changes remain dirty and coalesce into a refresh when the view becomes available. IntersectionObserver is optional: browsers without it retain document/size/context handling. This avoids background drawing; it does not cancel an already-running parse, model decoding or a caller's animation timer.

Selecting only a net highlights its copper without constructing component bounding boxes or outline buffers. Selecting parts still supports focus, board flipping and normal outlines. File menus and theme icons retain their DOM nodes while their content is unchanged.

## Embed a viewer without Node.js

Serve the browser distribution and its matching assets from your website. The following uses a self-hosted build; use a versioned path when publishing it.

```html
<div id="board" style="height:clamp(320px,65svh,620px);min-width:0"></div>
<script src="/vendor/kicad-webview/kicad-webview.min.js"></script>
<script type="module">
  const viewer = new KiCadWebView.Viewer('#board', { inspectOnSelect: false });
  await viewer.load('/design/project.json', {
    file: 'controller.kicad_pcb', view: '3d'
  });
  // Optional on constrained devices; Balanced is also available in Display.
  viewer.setRenderQuality('low');
  window.addEventListener('pagehide', () => viewer.dispose(), { once: true });
</script>
```

Wrap the script body in an async function when using a classic script, or use `type="module"` for top-level await. Do not recreate a viewer on every framework render. Dispose it in the component's unmount cleanup. Pick Low or Balanced for routine mobile inspection; High and Presentation are explicit choices for detailed demonstrations.

For iframe integrations, give the frame a fixed or responsive height to avoid layout shifts and request native lazy loading:

```html
<iframe title="Interactive PCB viewer" loading="lazy"
  src="/viewer/embed.html?src=%2Fdesign%2Fproject.json&view=pcb"
  style="width:100%;height:65svh;min-height:320px;border:0"></iframe>
```

Use a user-operated Load button for large projects or metered connections. A schematic-first view avoids creating a 3D context until requested. Prefer a single Viewer over mounting several linked panes simultaneously on small screens, list models explicitly in the project manifest, compress static assets on the server, and use versioned immutable asset URLs. Preserve source credits and missing-model diagnostics. The website demo controller also defers its initial design load until the viewer approaches the viewport; its Load button bypasses the delay.

## Measure an integration

`viewer.getRenderStats()` returns a snapshot in 3D and `null` in other views. Its `renderActivity` counters report intersection, pause state, scheduled/rendered callbacks and suppressed invalidations; `selectionWorkload` reports bounds and outline work. Read these around a bounded interaction rather than polling each frame. `drawCalls` describes the last render pass, so enhanced post-processing is not comparable to Balanced using that field alone.

Validate with representative boards on physical phones as well as narrow browser windows. Network, model coverage, browser graphics limits and source complexity affect results. A small viewport test alone does not establish phone frame rate, battery use or peak memory.
