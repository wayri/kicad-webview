/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {rotatedCamera3D} from './viewer-navigation.mjs';
/* Public browser entry point; shared renderer sources remain authoritative. */
import '../engine/design-diff.js';
import '../engine/net-model.js';
import '../engine/file-compatibility.js';
import '../engine/worksheet.js';
import '../engine/layer-colors.js';
import '../engine/schematic-renderer.js';
import '../engine/pcb-renderer.js';
import '../engine/owned-canvas.js';
import '../engine/touch-canvas.js';
import { viewerOwners as owners } from './viewer-host.mjs';
import { resolveSource, fetchAsset } from './source-loader.mjs';
import { readZip } from './archive/zip.mjs';
import { normalizeFiles, manufacturingDesign } from './manufacturing-input.mjs';
import { mountManufacturing } from './manufacturing-canvas.mjs';
import { isKiCadPath, isDrawingPath, isManufacturingPath } from './source-types.mjs';
import { detectManufacturing } from './manufacturing/index.mjs';
import { createViewerChrome } from './viewer-chrome.mjs';
import { buildInspectionModel, createInspector } from './inspector.mjs';

function loadThree() {
  if (globalThis.SpikeBoard3D) return Promise.resolve(globalThis.SpikeBoard3D);
  return import('./three-runtime.mjs').then(runtime => runtime.loadThree());
}

// Cancellation stops this operation, not the shared optional-runtime import.
function awaitOperation(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Read-only, independently mounted schematic / PCB / 3D viewer. */
export class KiCadViewer extends EventTarget {
  constructor(target, { theme = 'light', loadAsset, assetPaths = [], inspectOnSelect = true } = {}) {
    super();
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host?.append || !host?.ownerDocument) throw new TypeError('Choose a viewer container element.');
    if (owners.has(host)) throw new Error('This container already has a viewer.');
    if (!['light', 'dark'].includes(theme)) throw new TypeError('Theme must be light or dark.');
    if (typeof inspectOnSelect !== 'boolean') throw new TypeError('inspectOnSelect must be a boolean.');
    this.inspectOnSelect = inspectOnSelect;
    this.host = host;
    this.theme = theme;
    this.modelOptions = { loadAsset, assetPaths };
    this.root = host.ownerDocument.createElement('div');
    this.root.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;position:relative;container-type:inline-size';
    this.stage = host.ownerDocument.createElement('div');
    this.stage.style.cssText = 'position:relative;flex:1;min-height:0;overflow:hidden';
    this.status = host.ownerDocument.createElement('div');
    this.status.setAttribute('role', 'status');
    this.status.style.cssText = '';
    this.surface = this.root.attachShadow ? this.root.attachShadow({ mode: 'open' }) : this.root;
    this.inspector = createInspector(this);
    this.createControls();
    this.surface.append(this.chrome.style, this.inspector.style, this.toolbar, this.stage, this.status, this.inspector.panel);
    host.append(this.root);
    owners.set(host, this);
    this.generation = 0;
    this.analysisTicket = 0;
    this.analysis = null;
    this.disposed = false;
    this.source = null;
    this.renderer = null;
    this.project = null;
    this.renderingNotes = [];
    this.setTheme(theme);
    this.updateControls();
  }

  assertActive() { if (this.disposed) throw new Error('Viewer has been disposed.'); }
  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }

  /** Load a hosted drawing, project manifest, or supported repository link. */
  load(input, options = {}) { return this.loadInput(input, options); }
  loadProject(input, options = {}) { return this.load(input, options); }

  // Public operations own their error event; internal preparation/mounting never emits it.
  async runOperation(signal, action) {
    this.assertActive();
    const ticket = ++this.generation;
    this.pending?.abort();
    const controller = new AbortController(); this.pending = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const operation = { signal: controller.signal, current: () => !this.disposed && ticket === this.generation,
      check() { if (controller.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError'); } };
    try { operation.check(); return await action(operation); }
    catch (error) {
      if (!operation.current()) return false;
      this.chrome.setStatus(error.message, true); this.emit('error', error); throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (this.pending === controller) this.pending = null;
    }
  }

  loadInput(input, { view, signal, ...options } = {}, preservedProject = null) {
    return this.runOperation(signal, async operation => {
      const result = await resolveSource(input, { ...options, baseURL: options.baseURL || this.host.ownerDocument.baseURI, signal: operation.signal });
      if (!operation.current()) return false; operation.check();
      if (result.archive) {
        const files = await readZip(result.archive, { signal: operation.signal });
        if (!operation.current()) return false; operation.check();
        return this.showFileSet(files, { ...options, view }, operation);
      }
      if (result.files) return this.showManufacturing(result.files, { ...options, view, path: result.path, project: preservedProject || result.project }, operation);
      if (detectManufacturing(result.source, result.path)) return this.showManufacturing([{ source: result.source, path: result.path }], { ...options, view, path: result.path, project: preservedProject || result.project }, operation);
      return this.showSource(result.source, { path: result.path, view, project: preservedProject || result.project, credentials: options.credentials }, operation);
    });
  }

  /** Open browser Files or explicit {path, source|bytes} entries without uploading. */
  loadFiles(files, options={}) { return this.loadCollection(signal=>normalizeFiles(files,{signal}),options); }
  /** Open a stored/deflated ZIP in memory. No extraction to disk or network. */
  loadArchive(bytes, options={}) { return this.loadCollection(signal=>readZip(bytes,{signal}),options); }
  loadCollection(read, {signal,...options}={}) {
    return this.runOperation(signal, async operation => {
      const files = await read(operation.signal);
      if (!operation.current()) return false; operation.check();
      return this.showFileSet(files, options, operation);
    });
  }
  async showFileSet(files, options={}, operation) {
    const drawings=[],ignored=[];
    for(const file of files){
      if(!isDrawingPath(file.path)&&!file.path.toLowerCase().endsWith('.txt')){ignored.push(file.path);continue;}
      const source=file.source??new TextDecoder('utf-8',{fatal:true}).decode(file.bytes);
      if(isKiCadPath(file.path)||detectManufacturing(source,file.path))drawings.push({path:file.path,source});else ignored.push(file.path);
    }
    if(!drawings.length)throw new Error('No supported KiCad, Gerber or Excellon drawings were found.');
    const entry=options.file?drawings.find(file=>file.path===options.file):drawings.find(file=>/\.kicad_pcb$/i.test(file.path))||drawings[0];
    if(!entry)throw new Error('The requested drawing is not in the file set.');
    const project={files:drawings,entry:entry.path,memory:true,notes:ignored.length?['Ignored '+ignored.length+' unsupported bundle entries: '+ignored.slice(0,12).join(', ')]:[]};
    if(!isKiCadPath(entry.path))return this.showManufacturing(drawings.filter(file=>!isKiCadPath(file.path)),{...options,path:entry.path,project},operation);
    return this.showSource(entry.source,{...options,path:entry.path,project},operation);
  }
  async showManufacturing(files,{path=files[0]?.path||'Manufacturing layers',project=null,...options}={},operation) {
    this.assertActive();
    if (options.view && options.view !== 'manufacturing') throw new TypeError('Manufacturing layers support the manufacturing view only.');
    const design = manufacturingDesign(files, options);
    return this.mountView('manufacturing', { source: 'manufacturing', path, kind: 'manufacturing', design, project,
      credentials: options.credentials || 'omit', sheetLinks: [], inspectionModel: buildInspectionModel(null, { kind: 'manufacturing', path, design }) }, operation);
  }

  /** Accept already-loaded source without network or a rendering server. */
  loadSource(source, { signal, ...options } = {}) {
    return this.runOperation(signal, operation => {
      if (typeof source === 'string' && (options.format || detectManufacturing(source, options.path))) return this.showManufacturing([{ source, path: options.path || 'manufacturing' }], options, operation);
      return this.showSource(source, options, operation);
    });
  }

  async showSource(source, { path = '', view, project = null, credentials = 'omit' } = {}, operation) {
    this.assertActive();
    if (typeof source === 'string' && detectManufacturing(source,path)) return this.showManufacturing([{source,path}],{path,view,project,credentials},operation);
    const ast = globalThis.KiCadDesignDiff.parse(source);
    const kind = ast[0] === 'kicad_pcb' ? 'pcb' : ast[0] === 'kicad_sch' ? 'schematic' : null;
    if (!kind) throw new TypeError('Expected a .kicad_sch or .kicad_pcb design.');
    view ||= kind; this.validateView(view, kind);
    const design = (kind === 'pcb' ? globalThis.KiCadPCBRenderer : globalThis.KiCadSchematicRenderer).build(ast, path);
    let connectivity = { nets: [], warnings: [] };
    try { connectivity = globalThis.KiCadNetModel.build([{ path: path || ('drawing.kicad_' + (kind === 'pcb' ? 'pcb' : 'sch')), content: source }], new Map([[path || ('drawing.kicad_' + (kind === 'pcb' ? 'pcb' : 'sch')), design]])); }
    catch (error) { connectivity.warnings.push('Net selection unavailable: ' + error.message); }
    if (kind === 'schematic') connectivity.warnings.push('Schematic nets use per-file saved wires, labels and terminals; buses, implicit hidden power pins and repeated-sheet instance connectivity are not a KiCad netlist.');
    const inspectionModel = buildInspectionModel(ast, { kind, path, design, connectivity });
    const atom = item => item && typeof item === 'object' && !Array.isArray(item) ? item.quoted : item;
    const sheetLinks = kind === 'schematic' ? ast.filter(form => Array.isArray(form) && atom(form[0]) === 'sheet').slice(0, 256).map(form => {
      const property = name => String(atom(form.find(item => Array.isArray(item) && atom(item[0]) === 'property' && String(atom(item[1])).replaceAll(' ', '').toLowerCase() === name.toLowerCase())?.[2]) || '').slice(0, 1000);
      return { uuid: String(atom(form.find(item => Array.isArray(item) && atom(item[0]) === 'uuid')?.[1]) || '').slice(0, 1000), name: property('Sheetname'), file: property('Sheetfile') };
    }) : [];
    return this.mountView(view, { source, path, kind, design, project, credentials, sheetLinks, inspectionModel }, operation);
  }

  /** Display imported scalar results; the viewer never runs an engineering solver. */
  async setAnalysis(input) {
    this.assertActive();
    if (this.kind !== 'pcb') throw new Error('Analysis results require a saved PCB design.');
    const ticket = ++this.analysisTicket, source = this.source, design = this.design;
    const current = () => !this.disposed && ticket === this.analysisTicket && source === this.source && design === this.design;
    const { parseAnalysis, analysisSourceHash } = await import('./analysis-results.mjs');
    if (!current()) return false;
    const data = parseAnalysis(input);
    if (data.fields.some(field => field.layer && !this.getLayers().includes(field.layer))) throw new TypeError('Analysis refers to a layer absent from the saved PCB.');
    const hash = await analysisSourceHash(source);
    if (!current()) return false;
    if (hash !== data.board.sha256) throw new Error('Analysis SHA-256 does not match the loaded saved PCB source.');
    const { createAnalysisLayer } = await import('./analysis-layer.mjs');
    if (!current()) return false;
    this.analysis?.dispose();
    this.analysis = createAnalysisLayer(this, data);
    this.emit('analysis', { fields: data.fields.map(({ id, name, unit }) => ({ id, name, unit })), provenance: data.provenance });
    return true;
  }
  clearAnalysis() { this.assertActive(); ++this.analysisTicket; this.analysis?.dispose(); this.analysis = null; }
  setAnalysisField(id) { this.assertActive(); if (!this.analysis) throw new Error('Load analysis results first.'); this.analysis.setField(id); }
  getAnalysis() { this.assertActive(); return this.analysis?.data || null; }

  getFiles() { this.assertActive(); return (this.project?.files || []).map(({ path, url }) => ({ path, url })); }

  /** Saved child-sheet links; navigation is confined to the loaded project list. */
  getSheets() {
    this.assertActive();
    return (this.kind === 'schematic' ? this.sheetLinks || [] : []).map(sheet => {
      const parts = (this.path || '').split('/').slice(0, -1); let valid = Boolean(sheet.file) && !/[\\\x00-\x1f\x7f%?#:]/.test(sheet.file) && !sheet.file.startsWith('/');
      for (const part of sheet.file.split('/')) { if (part === '..') { if (!parts.length) valid = false; else parts.pop(); } else if (part && part !== '.') parts.push(part); }
      const path = parts.join('/');
      return { ...sheet, path: valid && this.project?.files.some(file => file.path === path && /\.kicad_sch$/i.test(path)) ? path : null };
    });
  }

  openFile(path, options = {}) {
    this.assertActive();
    if (!this.project?.memory && !isDrawingPath(path) || !this.project?.files.some(file => file.path === path)) return Promise.reject(new Error('Choose a file from the loaded project.'));
    if(this.project.memory)return this.runOperation(options.signal,operation=>this.showFileSet(this.project.files,{...options,file:path},operation));
    return this.loadInput({ files: this.project.files, entry: path }, { credentials: this.credentials, ...options }, this.project);
  }

  createControls() {
    this.chrome = createViewerChrome(this);
    for (const name of ['toolbar', 'fileSelect', 'layoutButton', 'threeButton', 'fitButton', 'themeButton', 'layersMenu', 'layerList', 'notesButton', 'measureButton', 'inspectorButton'])
      this[name] = this.chrome[name];
  }

  updateControls() { this.chrome.update(); this.inspector?.refreshLayers(); this.analysis?.sync(); }

  setInspectOnSelect(enabled) { this.assertActive(); if(typeof enabled!=='boolean')throw new TypeError('inspectOnSelect must be a boolean.');this.inspectOnSelect=enabled;if(this.inspector?.autoInspect)this.inspector.autoInspect.checked=enabled; }
  setInspectorOpen(open) { this.assertActive(); this.inspector.toggle(open); }
  getSelection() { this.assertActive(); return this.inspector.getSelection(); }
  selectObject(id, options) { this.assertActive(); return this.inspector.selectObject(id, options); }
  getParts() { this.assertActive(); return this.inspector.getParts(); }
  selectPart(id, options) { this.assertActive(); return this.inspector.selectPart(id, options); }
  getNets() { this.assertActive(); return this.inspector.getNets(); }
  selectNet(id, options) { this.assertActive(); return this.inspector.selectNet(id, options); }
  handleSelection(detail, view = this.view) {
    if (this.disposed) return;
    this.inspector.select(detail.item);
    this.emit('select', { ...detail, path: this.path, view });
  }
  clearSelection() {
    this.assertActive();
    if (this.view !== '3d' && this.view !== 'manufacturing' && this.renderer?.select) this.renderer.select(null);
    else { this.renderer?.clearSelection?.(); this.renderer?.setSelection?.({}); this.handleSelection({ item: null }); }
  }

  updateStatus() {
    const notes = [...(this.design?.warnings || []), ...(this.project?.notes||[]), ...this.renderingNotes];
    if (this.view === '3d' && !this.renderingNotes.length)
      notes.push('3D material preview; unresolved component models may use approximate stand-ins.');
    this.chrome.setStatus([...new Set([...notes, ...this.inspector.getWarnings()])]);
  }

  validateView(view, kind = this.kind) {
    if(kind==='manufacturing'){if(view!=='manufacturing')throw new TypeError('Manufacturing layers support the manufacturing view only.');return;}
    if (!['schematic', 'pcb', '3d'].includes(view) || (kind === 'schematic' ? view !== 'schematic' : view === 'schematic'))
      throw new TypeError('Use schematic for a schematic file, or pcb / 3d for a board file.');
  }

  setView(view, {signal} = {}) {
    return this.runOperation(signal, operation => {
      if (!this.source) throw new Error('Load a design first.');
      this.validateView(view);
      return this.mountView(view, null, operation);
    });
  }

  async mountView(view, candidate, operation) {
    const engine = view === '3d' ? await awaitOperation(loadThree(), operation.signal) : null;
    if (!operation.current()) return false; operation.check();
    const state = candidate || this, token = Symbol('mounted renderer');
    const assetController = new AbortController();
    const mount = this.host.ownerDocument.createElement('div');
    mount.style.cssText = 'position:absolute;inset:0;min-height:0;overflow:hidden;visibility:hidden';
    this.stage.append(mount);
    let renderer, notes = [];
    const mounted = () => !this.disposed && this.rendererToken === token;
    try {
      if (engine) {
        const assets = new Map((state.project?.files || []).filter(file => /\.(wrl|glb)$/i.test(file.path)).map(file => [file.path, file.url]));
        const signal = assetController.signal, credentials = state.credentials;
        const projectModels = assets.size ? { assetPaths: [...assets.keys()], loadAsset: path => assets.has(path) ? fetchAsset(assets.get(path), { signal, credentials }) : undefined } : {};
        renderer = engine.mountBoard3D(mount, state.source, {
          ...this.modelOptions, ...projectModels,
          ...(this.modelOptions.loadAsset ? { loadAsset: this.modelOptions.loadAsset } : {}),
          boardPath: state.path, dark: this.theme === 'dark', embedded: true, externalInspector: true,
          onDiagnostics: value => { notes = value; if (mounted()) { this.renderingNotes = notes; this.updateStatus(); } },
          onSelect: item => { if (mounted()) this.handleSelection({ item }, '3d'); },
        });
      } else if (view === 'manufacturing') {
        renderer = mountManufacturing(mount, { dark: this.theme === 'dark' }); renderer.setDocument(state.design);
        renderer.addEventListener('kicad:select', event => { if (mounted()) this.handleSelection(event.detail, view); });
        renderer.addEventListener('measure', event => { if (mounted()) this.emit('measure', event.detail); });
      } else {
        renderer = globalThis.KiCadOwnedCanvas.mount(mount, { pcb: view === 'pcb', dark: this.theme === 'dark' });
        renderer.setDocument(state.design, state.path);
        renderer.addEventListener('kicad:select', event => { if (mounted()) this.handleSelection(event.detail, view); });
      }
      if (!operation.current()) { renderer.dispose(); assetController.abort(); mount.remove(); return false; }
      operation.check();
    } catch (error) { renderer?.dispose(); assetController.abort(); mount.remove(); throw error; }
    // Only a fully prepared current operation replaces the visible drawing and its callbacks.
    this.rendererToken = token;
    this.assetController?.abort(); this.stopCamera?.(); this.renderer?.dispose();
    if (candidate) {
      this.clearAnalysis();
      const { inspectionModel, ...saved } = candidate; Object.assign(this, saved);
      this.inspector.setModel(inspectionModel);
    }
    this.assetController = assetController; this.renderer = renderer; this.view = view; this.renderingNotes = notes;
    mount.style.visibility = ''; this.stage.replaceChildren(mount);
    this.analysis?.attach(); this.inspector.syncRenderer(); this.bindCamera(); this.updateControls(); this.updateStatus();
    this.emit('ready', { view, path: this.path, revision: this.project?.revision || null, warnings: [...(this.design.warnings || [])] });
    this.emit('viewchange', { view, path: this.path }); this.reportCamera();
    return true;
  }

  /** Explicit opt-in; presentation quality is never the embedded default. */
  setRenderQuality(quality) {
    this.assertActive();
    if (!['low','balanced','high','presentation'].includes(quality)) throw new TypeError('Choose low, balanced, high or presentation rendering.');
    if (this.view !== '3d' || typeof this.renderer?.setQuality !== 'function') throw new Error('Rendering quality requires a loaded 3D view.');
    return this.renderer.setQuality(quality);
  }

  /** Fit one named 3D presentation camera without replacing source or selection. */
  setCamera3D(preset) {
    this.assertActive();
    if (this.view !== '3d') throw new Error('Named 3D cameras require the 3D view.');
    if (preset && typeof preset === 'object') { if(typeof this.renderer?.setCameraState!=='function')throw new Error('3D camera restoration is unavailable.');return this.renderer.setCameraState(preset); }
    if (!['top', 'bottom', 'front', 'back', 'left', 'right', 'isometric'].includes(preset)) throw new TypeError('Choose a named 3D camera preset.');
    if (typeof this.renderer?.setView !== 'function') throw new Error('Named 3D cameras are unavailable in this renderer.');
    return this.renderer.setView(preset);
  }

  pickDemoFace(options={}) { this.assertActive();if(this.view!=='3d'||typeof this.renderer?.pickDemoFace!=='function')return Promise.reject(new Error('Choose the 3D view before selecting a demo face.'));return this.renderer.pickDemoFace(options); }

  rotate3D(direction,degrees=15) {this.assertActive();const state=this.getCamera3D();if(!state)throw new Error('Rotation requires a loaded 3D view.');return this.setCamera3D(rotatedCamera3D(state,direction,degrees));}

  getCamera3D() { this.assertActive(); return this.view==='3d' ? this.renderer?.getCameraState?.() || null : null; }

  /** Copied saved-world 2D camera state; 3D uses getCamera3D/setCamera3D. */
  getCamera() {
    this.assertActive();
    const camera = this.renderer?.viewport?.camera;
    if (!['pcb', 'schematic'].includes(this.view) || !camera || ![camera.center?.x, camera.center?.y, camera.zoom].every(Number.isFinite)) return null;
    return { center: { x: camera.center.x, y: camera.center.y }, zoom: camera.zoom, flipped: Boolean(camera.flipped) };
  }
  setCamera(state) {
    this.assertActive();
    if (!this.getCamera()) throw new Error('Programmable camera requires the PCB or schematic 2D view.');
    if (!state || ![state.center?.x, state.center?.y, state.zoom].every(value => typeof value === 'number' && Number.isFinite(value)) || Math.abs(state.center.x) > 1e6 || Math.abs(state.center.y) > 1e6 || state.zoom < .001 || state.zoom > 10000 || typeof state.flipped !== 'boolean') throw new TypeError('Choose finite camera coordinates, a zoom from .001 to 10000 and a boolean flipped state.');
    const camera = this.renderer.viewport.camera;
    camera.center.x = state.center.x; camera.center.y = state.center.y; camera.zoom = state.zoom; camera.flipped = state.flipped;
    this.renderer.draw(); this.reportCamera();
  }
  reportCamera() {
    if (this.disposed) return;
    const camera = this.getCamera(); if (!camera) return;
    const signature = JSON.stringify([this.path, this.view, camera]); if (signature === this.cameraSignature) return;
    this.cameraSignature = signature; this.emit('camerachange', { view: this.view, path: this.path, camera });
  }
  bindCamera() {
    this.stopCamera?.(); this.cameraSignature = null;
    const renderer = this.renderer, onFrame = () => { if (!this.disposed && renderer === this.renderer) this.reportCamera(); };
    renderer?.addEventListener?.('kicad:viewframe', onFrame);
    this.stopCamera = () => renderer?.removeEventListener?.('kicad:viewframe', onFrame);
  }

  fit() {
    this.assertActive();
    if (this.view === '3d') this.renderer?.fit();
    else { this.renderer?.zoom_to_board(); this.renderer?.draw(); }
  }

  setTheme(theme) {
    this.assertActive();
    if (!['light', 'dark'].includes(theme)) throw new TypeError('Theme must be light or dark.');
    this.theme = theme;
    this.root.style.background = theme === 'dark' ? '#111a24' : '#f4f7fa';
    this.root.style.color = theme === 'dark' ? '#e6e9ef' : '#252c38';
    this.root.style.colorScheme = theme;
    if (this.view === '3d') this.renderer?.setTheme(theme === 'dark');
    else if (this.renderer) { this.renderer.dark = theme === 'dark'; this.renderer.draw(); }
    this.chrome.setTheme(theme);
  }

  setMeasuring(enabled) {this.assertActive();if(this.view!=='manufacturing')throw new Error('Measurement requires manufacturing view.');this.renderer.setMeasuring(enabled);this.updateControls();}

  getLayers() { this.assertActive(); return [...(this.design?.layers || [])]; }
  setLayers(layers) {
    this.assertActive();
    if (!['pcb','manufacturing'].includes(this.view) || !this.renderer) throw new Error('Layer control requires the PCB view.');
    const known = this.getLayers();
    if (!Array.isArray(layers) || layers.some(layer => !known.includes(layer))) throw new TypeError('Choose saved PCB layer names.');
    this.renderer.visibleLayers = new Set(layers);
    this.renderer.draw();
    this.updateControls();
  }

  dispose() {
    if (this.disposed) return;
    this.clearAnalysis();
    this.stopCamera?.(); this.stopCamera = null;
    this.disposed = true;
    this.emit('dispose', null);
    ++this.generation;
    this.pending?.abort();
    this.assetController?.abort();
    this.renderer?.dispose();
    this.renderer = this.source = this.design = this.pending = this.project = null;
    this.inspector.dispose();
    this.chrome.dispose();
    this.root.remove();
    owners.delete(this.host);
  }
}

// Optional HTML integration; importing the library alone does not register tags.
export function registerKiCadViewer(tag = 'kicad-viewer') {
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    connectedCallback() {
      if (this.viewer) return;
      this.viewer = new KiCadViewer(this, { theme: this.getAttribute('theme') || 'light', inspectOnSelect:this.getAttribute('inspect-on-select')!=='false' });
      for (const name of ['ready', 'select', 'measure', 'analysis', 'error', 'viewchange', 'camerachange']) this.viewer.addEventListener(name,
        event => this.dispatchEvent(new CustomEvent(`kicad:${name}`, { detail: event.detail })));
      if (this.getAttribute('src')) this.viewer.load(this.getAttribute('src'), {
        view: this.getAttribute('view') || undefined,
        file: this.getAttribute('file') || undefined,
        ref: this.getAttribute('ref') || undefined,
      }).catch(() => {});
    }
    disconnectedCallback() { this.viewer?.dispose(); this.viewer = null; }
  });
}
