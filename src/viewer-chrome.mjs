/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {createLayerControls,createHighlightControls,INSPECTION_STYLE} from './inspection-controls.mjs';
import {createViewerNavigation,NAVIGATION_STYLE} from './viewer-navigation.mjs';
/* Compact, shadow-scoped chrome shared by every embedded drawing instance. */
const icons = {
  drawing: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h5',
  layout: 'M4 4h16v16H4zM8 4v5h5V4M4 14h7v6M16 12h4',
  cube: 'm12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8M7 5.8l9 5',
  fit: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8z',
  moon: 'M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13z',
  sun: 'M12 3V1M12 23v-2M3 12H1M23 12h-2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  highlight: 'm9 3 1.5 4.5L15 9l-4.5 1.5L9 15l-1.5-4.5L3 9l4.5-1.5zM18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z',
  layers: 'm12 3 10 5-10 5L2 8zM3 13l9 5 9-5M3 18l9 5 9-5',
  inspect: 'M4 3h16v18H4zM9 3v18M12 7h5M12 11h5M12 15h3',
  ruler: 'M3 17 17 3l4 4L7 21zM13 7l4 4M9 11l3 3M5 15l3 3',
  notes: 'M12 8v5M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
const STYLE = `
:host{--viewer-bg:#f4f7fa;--viewer-bar:#ffffff;--viewer-ink:#253445;--viewer-muted:#657588;--viewer-border:#dbe3eb;--viewer-hover:#edf3f8;--viewer-accent:#176b83;--viewer-active:#e6f3f5;--viewer-shadow:0 8px 28px #172c4220;display:flex;position:relative;flex-direction:column;font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
:host([data-theme="dark"]){--viewer-bg:#111a24;--viewer-bar:#182330;--viewer-ink:#e1eaf3;--viewer-muted:#99aabd;--viewer-border:#324254;--viewer-hover:#253548;--viewer-accent:#77d4df;--viewer-active:#23434d;--viewer-shadow:0 8px 28px #0005}
*{box-sizing:border-box}[hidden]{display:none!important}
select option{background:var(--viewer-bar);color:var(--viewer-ink)}select option:disabled{color:var(--viewer-muted)}select{color-scheme:light}:host([data-theme="dark"]) select{color-scheme:dark}
.viewer-toolbar{display:flex;align-items:center;gap:10px;flex:0 0 auto;min-height:48px;padding:7px 10px;background:var(--viewer-bar);color:var(--viewer-ink);border-bottom:1px solid var(--viewer-border);z-index:10;min-width:0}
.viewer-picker{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 160px;max-width:340px;color:var(--viewer-muted)}
.viewer-picker>.viewer-icon{flex:0 0 auto}.viewer-picker select{width:100%;min-width:0;max-width:100%;appearance:auto;padding:5px 3px;border:0;background:transparent;color:var(--viewer-ink);font:600 12px/1.4 system-ui;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.viewer-picker select{color-scheme:light}.viewer-picker select option{background:#ffffff;color:#253445}:host([data-theme="dark"]) .viewer-picker select{color-scheme:dark}:host([data-theme="dark"]) .viewer-picker select option{background:#182330;color:#e1eaf3}
.viewer-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--viewer-ink);font-weight:600}
.viewer-views{display:flex;align-items:center;gap:2px;flex:0 0 auto;padding:3px;border:1px solid var(--viewer-border);border-radius:9px;background:var(--viewer-bg)}
.viewer-toolbar button,.viewer-toolbar summary{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:32px;min-height:32px;padding:6px;border:0;border-radius:6px;background:transparent;color:var(--viewer-muted);font:600 11px/1 system-ui;cursor:pointer;list-style:none;white-space:nowrap}
.viewer-toolbar button:hover,.viewer-toolbar summary:hover{color:var(--viewer-ink);background:var(--viewer-hover)}
.viewer-toolbar button:disabled{opacity:.38;cursor:default}
.viewer-toolbar button[aria-pressed="true"]{color:var(--viewer-accent);background:var(--viewer-active);box-shadow:0 1px 3px #1023350b}
.viewer-views button{padding:6px 9px;min-height:28px}
.viewer-actions{display:flex;align-items:center;gap:3px;flex:0 0 auto;margin-left:auto}
.viewer-toolbar button:focus-visible,.viewer-toolbar select:focus-visible,.viewer-toolbar summary:focus-visible,.viewer-notes:focus-visible{outline:2px solid var(--viewer-accent);outline-offset:2px}
.viewer-icon{display:inline-flex;width:17px;height:17px;align-items:center;justify-content:center;pointer-events:none}
.viewer-icon svg{width:100%;height:100%;display:block}.viewer-layers{position:relative}.viewer-layers summary::-webkit-details-marker{display:none}
.viewer-layer-list{position:absolute;right:0;top:calc(100% + 9px);min-width:190px;max-height:min(300px,65vh);overflow:auto;padding:10px;border:1px solid var(--viewer-border);border-radius:9px;background:var(--viewer-bar);color:var(--viewer-ink);box-shadow:var(--viewer-shadow)}
.viewer-layer-list label{display:flex;align-items:center;gap:8px;min-height:30px;white-space:nowrap;cursor:pointer}.viewer-layer-list input{width:15px;height:15px;margin:0;accent-color:var(--viewer-accent)}
.viewer-notes{position:absolute;right:10px;top:56px;z-index:11;width:min(420px,calc(100% - 20px));max-height:calc(100% - 70px);overflow:auto;margin:0;padding:14px;border:1px solid var(--viewer-border);border-radius:9px;background:var(--viewer-bar);color:var(--viewer-ink);box-shadow:var(--viewer-shadow);font:12px/1.65 system-ui;white-space:pre-line;overflow-wrap:anywhere}
.viewer-notes[data-error="true"]{border-color:#b46d4a}.viewer-note-count{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 3px;border-radius:5px;background:#9b692116;color:#9a6521;font-size:9px;font-variant-numeric:tabular-nums}:host([data-theme="dark"]) .viewer-note-count{background:#dba35222;color:#f0c384}
@container (max-width:540px){.viewer-toolbar{gap:6px;padding-inline:7px}.viewer-picker{flex-basis:80px}.viewer-picker>.viewer-icon{display:none}.viewer-views button{padding-inline:7px}.viewer-views .viewer-icon{display:none}.viewer-actions{gap:0}}
@container (max-width:360px){.viewer-toolbar{gap:3px;padding-inline:5px}.viewer-toolbar button,.viewer-toolbar summary{min-width:29px;padding:5px}.viewer-picker{flex-basis:45px}.viewer-views{padding:2px}.viewer-views button{padding-inline:6px}.viewer-note-count{min-width:12px;padding:0 2px}}
@container (max-width:240px){.viewer-toolbar{flex-wrap:wrap}.viewer-picker{flex:1 1 28px}}
@media(pointer:coarse){.viewer-toolbar button,.viewer-toolbar summary{min-height:36px}.viewer-toolbar{min-height:52px}.viewer-notes{top:60px}}
@container (max-width:540px){
 .viewer-toolbar{flex-wrap:wrap;align-content:center;gap:4px 6px;padding:6px}
 .viewer-picker{flex:1 0 100%;max-width:none;min-height:32px}
 .viewer-picker select{font-size:16px;min-height:36px}
 .viewer-actions{flex:1 1 160px;flex-wrap:wrap;justify-content:flex-end;gap:2px}
 .viewer-toolbar button,.viewer-toolbar summary{min-width:40px;min-height:40px}
 .viewer-views button{min-height:40px}
 .viewer-notes{top:calc(var(--viewer-toolbar-height,96px) + 8px);max-height:calc(100% - var(--viewer-toolbar-height,96px) - 16px)}
 .viewer-layers{position:static}.viewer-layer-list{position:absolute;left:8px;right:8px;top:calc(var(--viewer-toolbar-height,96px) + 6px);min-width:0;max-height:calc(100% - var(--viewer-toolbar-height,96px) - 14px);overscroll-behavior:contain}
 .viewer-layer-list label{min-height:44px;white-space:normal;overflow-wrap:anywhere}
 .viewer-layer-list input{width:20px;height:20px;flex-shrink:0}
 .viewer-layer-list input[type=search]{width:100%;font-size:16px!important}
}
@media(pointer:coarse){.viewer-toolbar button,.viewer-toolbar summary{min-width:44px;min-height:44px}.viewer-views button{min-height:44px}.viewer-picker select{font-size:16px;min-height:44px}.viewer-layer-list label{min-height:44px}}
`;

/** Internal DOM module; the viewer keeps source/rendering state authoritative. */
export function createViewerChrome(viewer) {
  const doc = viewer.host.ownerDocument;
  const make = (tag, className) => { const node = doc.createElement(tag); if (className) node.className = className; return node; };
  const icon = name => {
    const node = make('span', 'viewer-icon');
    node.setAttribute('aria-hidden', 'true');
    // Constant owner-authored paths only; no design/user strings enter HTML.
    node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="' + icons[name] + '"/></svg>';
    return node;
  };
  const style = make('style'); style.textContent = STYLE+NAVIGATION_STYLE+INSPECTION_STYLE;
  const toolbar = make('div', 'viewer-toolbar');
  toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Drawing viewer controls');
  const picker = make('div', 'viewer-picker'), fileSelect = make('select'), fileName = make('span', 'viewer-name');
  fileSelect.setAttribute('aria-label', 'Project drawing'); fileSelect.title = 'Choose a project drawing';
  picker.append(icon('drawing'), fileSelect, fileName);
  const views = make('div', 'viewer-views');
  views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'Drawing view');
  const actions = make('div', 'viewer-actions');
  const fail = error => setStatus(error.message, true);
  const button = (name, label, action, caption = '') => {
    const node = make('button'); node.type = 'button'; node.title = label; node.setAttribute('aria-label', label);
    node.append(icon(name));
    if (caption) { const text = make('span'); text.textContent = caption; node.append(text); }
    node.onclick = () => { Promise.resolve().then(action).catch(fail); };
    return node;
  };
  const layoutButton = button('layout', 'PCB layout', () => viewer.setView('pcb'), 'Layout');
  const threeButton = button('cube', '3D view', () => viewer.setView('3d'), '3D');
  views.append(layoutButton, threeButton);
  const fitButton = button('fit', 'Fit drawing', () => viewer.fit());
  const themeButton = button('moon', 'Switch to dark theme', () => viewer.setTheme(viewer.theme === 'light' ? 'dark' : 'light'));
  const layerControls=createLayerControls(viewer,make,icon,fail),highlightControls=createHighlightControls(viewer,make,icon,fail);
  const layersMenu=layerControls.menu,layerList=layerControls.list,layerFilter=layerControls.filter,layersSummary=layerControls.summary;
  const notesButton = button('notes', 'Rendering notes', () => toggleNotes());
  const noteCount = make('span', 'viewer-note-count'); noteCount.hidden = true; notesButton.append(noteCount);
  notesButton.setAttribute('aria-expanded', 'false');
  const measureButton=button('ruler','Measure distance',()=>viewer.setMeasuring(!viewer.renderer?.measuring));
  const inspectorButton = button('inspect', 'Inspect properties and parts', () => { toggleNotes(false); viewer.setInspectorOpen(!viewer.inspector.isOpen()); });
  inspectorButton.setAttribute('aria-expanded', 'false');
  actions.append(fitButton, measureButton, inspectorButton, themeButton, highlightControls.menu, layersMenu, notesButton);
  toolbar.append(picker, views, actions);
  const ToolbarObserver=doc.defaultView?.ResizeObserver||globalThis.ResizeObserver;
  const toolbarObserver=ToolbarObserver?new ToolbarObserver(()=>{const height=toolbar.getBoundingClientRect().height;viewer.root.style.setProperty('--viewer-toolbar-height',height+'px');}):null;
  toolbarObserver?.observe(toolbar);
  const navigation=createViewerNavigation(viewer,fail);
  const status = viewer.status;
  status.className = 'viewer-notes'; status.hidden = true; status.tabIndex = 0;
  status.setAttribute('aria-label', 'Rendering notes');
  let messages = [], notesOpen = false, layerSignature = null;
  const layerInputs = new Map();
  function toggleNotes(open = !notesOpen) {
    notesOpen = Boolean(open); status.hidden = !notesOpen;
    if(notesOpen){layersMenu.open=false;highlightControls.menu.open=false;}
    if (notesOpen) viewer.inspector?.toggle(false);
    notesButton.setAttribute('aria-expanded', String(notesOpen));
  }
  function setStatus(value, error = false) {
    messages = (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean);
    status.textContent = messages.length ? messages.join('\n\n') : 'No rendering notes for this drawing.';
    status.setAttribute('data-error', String(error));
    noteCount.textContent = String(messages.length); noteCount.hidden = !messages.length;
    notesButton.title = messages.length ? 'Rendering notes (' + messages.length + ')' : 'Rendering notes';
    if (error) toggleNotes(true);
  }
  function setTheme(theme) {
    viewer.root.setAttribute('data-theme', theme);
    themeButton.replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon'));
    themeButton.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    themeButton.setAttribute('aria-label', themeButton.title);
  }
  function update() {
    navigation.update();
    fileSelect.hidden = !viewer.project; fileName.hidden = Boolean(viewer.project);
    fileName.textContent = viewer.path?.split('/').at(-1) || 'KiCad viewer'; fileName.title = viewer.path || 'Read-only KiCad viewer';
    fileSelect.replaceChildren(...viewer.getFiles().filter(file => !/\.(wrl|glb)$/i.test(file.path)).map(file => {
      const option = make('option'); option.value = file.path; option.textContent = file.path; return option;
    }));
    fileSelect.value = viewer.path || '';
    layoutButton.hidden = threeButton.hidden = views.hidden = viewer.kind !== 'pcb';
    layoutButton.setAttribute('aria-pressed', String(viewer.view === 'pcb'));
    threeButton.setAttribute('aria-pressed', String(viewer.view === '3d'));
    fitButton.disabled = !viewer.renderer;
    measureButton.hidden=viewer.view!=='manufacturing';measureButton.setAttribute('aria-pressed',String(Boolean(viewer.renderer?.measuring)));
    layerControls.update();highlightControls.update();
    setTheme(viewer.theme);
  }
  layerControls.menu.ontoggle=()=>{if(layerControls.menu.open){highlightControls.menu.open=false;toggleNotes(false);viewer.inspector.toggle(false);}};
  highlightControls.menu.ontoggle=()=>{if(highlightControls.menu.open){layerControls.menu.open=false;toggleNotes(false);viewer.inspector.toggle(false);}};
  fileSelect.onchange = () => viewer.openFile(fileSelect.value).catch(fail);
  const escape = event => { if (event.key === 'Escape') { toggleNotes(false); layersMenu.open = false; highlightControls.menu.open=false; } };
  viewer.surface.addEventListener?.('keydown', escape);
  return {
    style, toolbar, fileSelect, layoutButton, threeButton, fitButton, themeButton, layersMenu, layerList, notesButton, measureButton, inspectorButton, layerFilter,
    update, setTheme, setStatus, toggleNotes,
    dispose() {
      navigation.dispose();
      layerControls.menu.ontoggle=highlightControls.menu.ontoggle=null;layerControls.dispose();highlightControls.dispose();
      toolbarObserver?.disconnect();
      viewer.surface.removeEventListener?.('keydown', escape);
      for (const node of [layoutButton, threeButton, fitButton, themeButton, notesButton, measureButton, inspectorButton]) node.onclick = null;
      fileSelect.onchange = layerFilter.oninput = null;
    },
  };
}
